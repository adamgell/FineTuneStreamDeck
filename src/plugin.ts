import streamDeck from '@elgato/streamdeck';
import {
  client,
  groupTargets,
  setGroupTargets,
  CommandAction,
  AppVolumeAction,
  AppMuteAction,
  AppBoostAction,
  RoutingAction,
  DeviceVolumeAction,
  DeviceMuteAction,
  DeviceSelectAction,
  EQBandAction,
  EQPresetAction,
  AutoEQAction,
  LoudnessAction,
  ManagementAction,
  PopupAction,
  SceneAction,
} from './actions/command.js';
import { object, type JsonObject } from './api/protocol.js';
const classes = [
  CommandAction,
  AppVolumeAction,
  AppMuteAction,
  AppBoostAction,
  RoutingAction,
  DeviceVolumeAction,
  DeviceMuteAction,
  DeviceSelectAction,
  EQBandAction,
  EQPresetAction,
  AutoEQAction,
  LoudnessAction,
  ManagementAction,
  PopupAction,
  SceneAction,
];
for (const C of classes) streamDeck.actions.registerAction(new C());
streamDeck.ui.onSendToPlugin<JsonObject>(async (ev) => {
  const payload = ev.payload;
  const action = ev.action;
  if (
    payload.event === 'setGroupTarget' &&
    typeof payload.group === 'string' &&
    object(payload.target)
  ) {
    const global = await streamDeck.settings.getGlobalSettings<JsonObject>();
    const groups = { ...(object(global.groupTargets) ?? {}) };
    groups[payload.group] = payload.target!;
    setGroupTargets(groups);
    await streamDeck.settings.setGlobalSettings({ ...global, groupTargets: groups });
  }
  if (payload.event === 'catalog' || payload.event === 'setGroupTarget')
    await streamDeck.ui.sendToPropertyInspector({
      event: 'catalog',
      state: client.state as unknown as JsonObject,
      groups: groupTargets,
      settings: action ? await action.getSettings() : {},
    });
  if (payload.event === 'searchAutoEQ' && typeof payload.query === 'string') {
    try {
      const result = await client.request('autoeq.search', { query: payload.query, limit: 50 });
      await streamDeck.ui.sendToPropertyInspector({ event: 'autoeqSearch', result });
    } catch {
      await streamDeck.ui.sendToPropertyInspector({
        event: 'error',
        message: 'AutoEQ search unavailable',
      });
    }
  }
});
await streamDeck.connect();
setGroupTargets(
  object((await streamDeck.settings.getGlobalSettings<JsonObject>()).groupTargets) ?? {},
);
client.start();
