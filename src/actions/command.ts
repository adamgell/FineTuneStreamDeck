import streamDeck, {
  action,
  SingletonAction,
  type Action,
  type KeyDownEvent,
  type WillAppearEvent,
  type WillDisappearEvent,
  type DidReceiveSettingsEvent,
  type DialRotateEvent,
  type DialUpEvent,
  type TouchTapEvent,
} from '@elgato/streamdeck';
import { FineTuneClient } from '../api/client.js';
import { object, type JsonObject } from '../api/protocol.js';
import {
  type ActionSettings,
  validateSettings,
  makeDialRequest,
  renderFeedback,
  resourceKey,
  resolveGroupSettings,
} from '../controls/settings.js';
import { summarizeBatch } from '../controls/scenes.js';
import { DialAccumulator } from '../controls/dial-accumulator.js';

async function showAlert(action: Action<ActionSettings>) {
  if (action.isKey() || action.isDial()) await action.showAlert();
}
export const client = new FineTuneClient();
export let groupTargets: JsonObject = {};
const visible = new Map<
  string,
  { action: Action<ActionSettings>; settings: ActionSettings; owner: CommandAction }
>();
const dialRequests = new Map<
  string,
  { request: { method: string; params: JsonObject }; action: Action<ActionSettings> }
>();
const accumulator = new DialAccumulator(async (key, delta) => {
  const value = dialRequests.get(key);
  if (!value) return;
  const limit = value.request.method === 'app.eq.band.step' ? 24 : 100;
  try {
    const result = await client.request(value.request.method, {
      ...value.request.params,
      delta: Math.max(-limit, Math.min(limit, delta)),
    });
    if (result.status === 'pending' && typeof result.operationId === 'string')
      await client.awaitOperation(result.operationId);
  } catch {
    await showAlert(value.action);
  }
});
export function setGroupTargets(groups: JsonObject) {
  groupTargets = groups;
  refreshActions();
}
export function refreshActions() {
  for (const item of visible.values()) void item.owner.refresh(item.action, item.settings);
}
streamDeck.settings.onDidReceiveGlobalSettings<JsonObject>((ev) => {
  setGroupTargets(object(ev.settings.groupTargets) ?? {});
});
client.subscribe((state) => {
  refreshActions();
  void streamDeck.ui.sendToPropertyInspector({
    event: 'state',
    state: state as unknown as JsonObject,
    groups: groupTargets,
  });
});

@action({ UUID: 'com.finetune.streamdeck.command' })
export class CommandAction extends SingletonAction<ActionSettings> {
  protected defaultMethod = '';
  private initial(settings: ActionSettings): ActionSettings {
    return {
      ...settings,
      method: settings.method ?? this.defaultMethod,
      params: settings.params ?? {},
      schemaVersion: 1,
    };
  }
  override async onWillAppear(ev: WillAppearEvent<ActionSettings>) {
    const settings = this.initial(ev.payload.settings);
    visible.set(ev.action.id, { action: ev.action, settings, owner: this });
    if (!ev.payload.settings.method && settings.method) await ev.action.setSettings(settings);
    await this.refresh(ev.action, settings);
  }
  override onWillDisappear(ev: WillDisappearEvent<ActionSettings>) {
    visible.delete(ev.action.id);
  }
  override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<ActionSettings>) {
    const settings = this.initial(ev.payload.settings);
    visible.set(ev.action.id, { action: ev.action, settings, owner: this });
    await this.refresh(ev.action, settings);
  }
  async refresh(action: Action<ActionSettings>, settings: ActionSettings) {
    const effective = resolveGroupSettings(settings, groupTargets);
    const feedback = renderFeedback(effective, client.state);
    const valid =
      client.state.status === 'ready'
        ? validateSettings(effective, client.state.methods)
        : undefined;
    const label = typeof settings.label === 'string' ? settings.label : feedback.title;
    const title = valid && !valid.ok ? `${label}\nConfigure` : `${label}\n${feedback.value}`;
    if (action.isDial()) {
      await action.setFeedback({
        title: label,
        value: valid && !valid.ok ? 'Configure' : feedback.value,
      });
    } else if (action.isKey()) {
      await action.setTitle(client.state.status === 'ready' ? title : feedback.title);
      if (action.isKey()) await action.setState(feedback.muted ? 1 : 0);
    }
  }
  private async run(action: Action<ActionSettings>, raw: ActionSettings, override?: string) {
    const settings = resolveGroupSettings(this.initial(raw), groupTargets);
    if (override) settings.method = override;
    const valid = validateSettings(settings, client.state.methods);
    if (!valid.ok) {
      await showAlert(action);
      return;
    }
    try {
      let result = await client.request(settings.method!, settings.params ?? {});
      if (result.status === 'pending' && typeof result.operationId === 'string') {
        if (action.isKey() || action.isDial()) await action.setTitle('Pending');
        result = await client.awaitOperation(result.operationId);
      }
      if (settings.method === 'batch.execute' && Array.isArray(result.results)) {
        for (let i = 0; i < result.results.length; i++) {
          const row = object(result.results[i]);
          const outcome = object(row?.result);
          if (outcome?.status === 'pending' && typeof outcome.operationId === 'string') {
            try {
              result.results[i] = { result: await client.awaitOperation(outcome.operationId) };
            } catch (error) {
              result.results[i] = {
                error: {
                  message: error instanceof Error ? error.message : 'Scene operation failed',
                },
              };
            }
          }
        }
        const summary = summarizeBatch(result);
        if (!summary.ok) await showAlert(action);
        else if (action.isKey()) await action.showOk();
        await streamDeck.ui.sendToPropertyInspector({
          event: 'result',
          result: { ...result, summary },
        });
      } else if (action.isKey()) await action.showOk();
      await this.refresh(action, settings);
      await streamDeck.ui.sendToPropertyInspector({ event: 'result', result });
    } catch (error) {
      await showAlert(action);
      await streamDeck.ui.sendToPropertyInspector({
        event: 'error',
        message: error instanceof Error ? error.message : 'FineTune command failed',
      });
    }
  }
  override async onKeyDown(ev: KeyDownEvent<ActionSettings>) {
    await this.run(ev.action, ev.payload.settings);
  }
  override async onDialRotate(ev: DialRotateEvent<ActionSettings>) {
    const settings = resolveGroupSettings(this.initial(ev.payload.settings), groupTargets);
    const request = makeDialRequest(settings, ev.payload.ticks);
    if (!request) {
      await showAlert(ev.action);
      return;
    }
    const valid = validateSettings(
      {
        ...settings,
        method: request.method,
        params: {
          ...request.params,
          delta: Math.max(-100, Math.min(100, Number(request.params.delta))),
        },
      },
      client.state.methods,
    );
    if (!valid.ok) {
      await showAlert(ev.action);
      return;
    }
    const key = `${resourceKey(settings)}:${request.method}:${String(request.params.domain ?? '')}:${String(request.params.band ?? '')}`;
    dialRequests.set(key, { request, action: ev.action });
    try {
      accumulator.add(key, Number(request.params.delta));
    } catch {
      await showAlert(ev.action);
    }
  }
  override async onDialUp(ev: DialUpEvent<ActionSettings>) {
    const method =
      ev.payload.settings.pushMethod ??
      (this.defaultMethod.startsWith('app.volume')
        ? 'app.mute.toggle'
        : this.defaultMethod.startsWith('device.volume')
          ? 'device.mute.toggle'
          : undefined);
    if (method) await this.run(ev.action, ev.payload.settings, method);
  }
  override async onTouchTap(ev: TouchTapEvent<ActionSettings>) {
    await this.onDialUp(ev as unknown as DialUpEvent<ActionSettings>);
  }
}
@action({ UUID: 'com.finetune.streamdeck.app-volume' })
export class AppVolumeAction extends CommandAction {
  protected override defaultMethod = 'app.volume.step';
}
@action({ UUID: 'com.finetune.streamdeck.app-mute' })
export class AppMuteAction extends CommandAction {
  protected override defaultMethod = 'app.mute.toggle';
}
@action({ UUID: 'com.finetune.streamdeck.app-boost' })
export class AppBoostAction extends CommandAction {
  protected override defaultMethod = 'app.boost.cycle';
}
@action({ UUID: 'com.finetune.streamdeck.routing' })
export class RoutingAction extends CommandAction {
  protected override defaultMethod = 'app.routing.set';
}
@action({ UUID: 'com.finetune.streamdeck.device-volume' })
export class DeviceVolumeAction extends CommandAction {
  protected override defaultMethod = 'device.volume.step';
}
@action({ UUID: 'com.finetune.streamdeck.device-mute' })
export class DeviceMuteAction extends CommandAction {
  protected override defaultMethod = 'device.mute.toggle';
}
@action({ UUID: 'com.finetune.streamdeck.device-select' })
export class DeviceSelectAction extends CommandAction {
  protected override defaultMethod = 'device.default.set';
}
@action({ UUID: 'com.finetune.streamdeck.eq-band' })
export class EQBandAction extends CommandAction {
  protected override defaultMethod = 'app.eq.band.step';
}
@action({ UUID: 'com.finetune.streamdeck.eq-preset' })
export class EQPresetAction extends CommandAction {
  protected override defaultMethod = 'app.eq.preset.apply';
}
@action({ UUID: 'com.finetune.streamdeck.autoeq' })
export class AutoEQAction extends CommandAction {
  protected override defaultMethod = 'autoeq.device.setEnabled';
}
@action({ UUID: 'com.finetune.streamdeck.loudness' })
export class LoudnessAction extends CommandAction {
  protected override defaultMethod = 'loudness.set';
}
@action({ UUID: 'com.finetune.streamdeck.management' })
export class ManagementAction extends CommandAction {
  protected override defaultMethod = 'app.pin.set';
}
@action({ UUID: 'com.finetune.streamdeck.popup' })
export class PopupAction extends CommandAction {
  protected override defaultMethod = 'ui.popup.toggle';
}
@action({ UUID: 'com.finetune.streamdeck.scene' })
export class SceneAction extends CommandAction {
  protected override defaultMethod = 'batch.execute';
}
