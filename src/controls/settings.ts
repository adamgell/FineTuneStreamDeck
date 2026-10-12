import { validateScene } from './scenes.js';
import {
  object,
  type Descriptor,
  type ConnectionState,
  type JsonObject,
  type JsonValue,
} from '../api/protocol.js';
export type ActionSettings = JsonObject & {
  method?: string;
  params?: JsonObject;
  step?: number;
  pushMethod?: string;
  schemaVersion?: number;
};
export function validateSettings(
  settings: ActionSettings,
  methods: Descriptor[],
): { ok: boolean; message: string } {
  const descriptor = methods.find((d) => d.method === settings.method);
  if (!descriptor) return { ok: false, message: 'Select a FineTune action' };
  if (descriptor.available === false)
    return { ok: false, message: descriptor.unavailableReason ?? 'Unavailable' };
  const params = settings.params ?? {};
  if (settings.method === 'batch.execute') {
    if (!Array.isArray(params.commands)) return { ok: false, message: 'Select scene commands' };
    const scene = validateScene(params.commands);
    if (!scene.ok) return scene;
  }
  for (const f of descriptor.fields) {
    const v = params[f.name];
    if (v === undefined) {
      if (f.required !== false) return { ok: false, message: `Select ${f.name}` };
      continue;
    }
    if (
      f.type === 'number' &&
      (typeof v !== 'number' ||
        !Number.isFinite(v) ||
        (f.minimum !== undefined && v < f.minimum) ||
        (f.maximum !== undefined && v > f.maximum))
    )
      return { ok: false, message: `Invalid ${f.name}` };
    if (f.type === 'boolean' && typeof v !== 'boolean')
      return { ok: false, message: `Invalid ${f.name}` };
    if (
      f.type === 'target' &&
      (!object(v) || (!object(v)?.appId && !object(v)?.deviceUID && !object(v)?.selector))
    )
      return { ok: false, message: 'Select a target' };
    if (f.choices && !f.choices.includes(String(v)))
      return { ok: false, message: `Invalid ${f.name}` };
    if (
      f.type === 'bands' &&
      (!Array.isArray(v) ||
        v.length !== 10 ||
        v.some((x) => typeof x !== 'number' || x < -12 || x > 12))
    )
      return { ok: false, message: 'Ten EQ bands between -12 and +12 dB required' };
  }
  return { ok: true, message: 'Ready' };
}
export function makeDialRequest(
  settings: ActionSettings,
  ticks: number,
): { method: string; params: JsonObject } | undefined {
  const params = { ...settings.params };
  const delta = ticks * (settings.step ?? 1);
  if (settings.method === 'app.volume.set' || settings.method === 'app.volume.step')
    return {
      method: 'app.volume.step',
      params: { target: params.target ?? null, domain: params.domain ?? 'percent', delta },
    };
  if (settings.method === 'device.volume.set' || settings.method === 'device.volume.step')
    return { method: 'device.volume.step', params: { target: params.target ?? null, delta } };
  if (settings.method === 'app.eq.band.set' || settings.method === 'app.eq.band.step')
    return {
      method: 'app.eq.band.step',
      params: { target: params.target ?? null, band: params.band ?? 0, delta },
    };
  if (settings.method === 'alert.volume.set' || settings.method === 'alert.volume.step')
    return { method: 'alert.volume.step', params: { delta } };
  return undefined;
}
export function targetState(
  settings: ActionSettings,
  state: ConnectionState,
): JsonObject | undefined {
  const t = object(settings.params?.target);
  if (!t) return undefined;
  const apps = state.snapshot?.apps;
  if ((t?.appId || t?.selector === 'audibleApp') && Array.isArray(apps))
    return apps.map(object).find((a) => a?.appId === (t.appId ?? state.snapshot?.resolvedAppId));
  const devices = object(state.snapshot?.devices)?.devices;
  if (Array.isArray(devices))
    return devices
      .map(object)
      .find((d) =>
        t?.deviceUID
          ? d?.deviceUID === t.deviceUID && d?.direction === (t.direction ?? 'output')
          : t?.selector === 'defaultInput'
            ? d?.direction === 'input' && d?.default === true
            : d?.direction === 'output' && d?.default === true,
      );
  return undefined;
}
export function renderFeedback(
  settings: ActionSettings,
  state: ConnectionState,
): { title: string; value: string; muted: boolean; unavailable: boolean } {
  if (state.status !== 'ready')
    return {
      title: state.message.includes('Enable')
        ? 'Enable API'
        : state.status === 'disconnected'
          ? 'Offline'
          : state.message,
      value: '—',
      muted: false,
      unavailable: true,
    };
  const descriptor = state.methods.find((d) => d.method === settings.method);
  const target = targetState(settings, state);
  if (object(settings.params?.target) && !target)
    return { title: 'Unavailable', value: '—', muted: false, unavailable: true };
  let value = '';
  if (settings.method?.includes('.volume.') && typeof target?.volumePercent === 'number')
    value = `${Math.round(target.volumePercent)}%`;
  if (settings.method?.includes('boost'))
    value = typeof target?.boost === 'number' ? `${target.boost}×` : '';
  if (settings.method?.includes('mute')) value = target?.muted === true ? 'Muted' : 'On';
  const t = object(settings.params?.target);
  const appId = t?.appId ?? state.snapshot?.resolvedAppId;
  if (settings.method?.startsWith('app.eq.')) {
    const entries = object(state.snapshot?.eq)?.apps;
    const entry = Array.isArray(entries)
      ? entries.map(object).find((a) => a?.appId === appId)
      : undefined;
    const eq = object(entry?.eq);
    if (settings.method.includes('.band.')) {
      const bands = eq?.bandGains;
      const band = Number(settings.params?.band ?? 0);
      const gain = Array.isArray(bands) ? bands[band] : undefined;
      if (typeof gain === 'number') value = `${gain > 0 ? '+' : ''}${gain} dB`;
      else value = '—';
    } else if (settings.method.includes('preset')) {
      const presets = object(state.snapshot?.eq)?.presets;
      const match = Array.isArray(presets)
        ? presets
            .map(object)
            .find((p) => JSON.stringify(p?.bandGains) === JSON.stringify(eq?.bandGains))
        : undefined;
      value = String(match?.name ?? 'Custom');
    } else value = eq?.isEnabled === true ? 'EQ On' : 'EQ Off';
  }
  if (settings.method?.startsWith('autoeq.device.')) {
    const entries = object(state.snapshot?.autoeq)?.devices;
    const entry = Array.isArray(entries)
      ? entries.map(object).find((d) => d?.deviceUID === (t?.deviceUID ?? target?.deviceUID))
      : undefined;
    const selection = object(entry?.selection);
    value = selection ? (selection.isEnabled === true ? 'On' : 'Off') : 'None';
  }
  if (settings.method?.startsWith('alert.volume.')) {
    const percent = object(state.snapshot?.devices)?.alertVolumePercent;
    value = typeof percent === 'number' ? `${Math.round(percent)}%` : '—';
  }
  if (settings.method === 'app.routing.set') {
    const routes = state.snapshot?.routing;
    const route = Array.isArray(routes)
      ? routes.map(object).find((r) => r?.appId === appId)
      : undefined;
    const uids = route?.deviceUIDs;
    const devices = object(state.snapshot?.devices)?.devices;
    value =
      route?.mode === 'followDefault'
        ? 'System output'
        : Array.isArray(uids)
          ? uids
              .map((uid) =>
                Array.isArray(devices)
                  ? String(
                      devices
                        .map(object)
                        .find((d) => d?.deviceUID === uid && d?.direction === 'output')?.name ??
                        'Unavailable',
                    )
                  : 'Unavailable',
              )
              .join(' + ')
          : '—';
  }
  if (settings.method === 'input.lock.set')
    value = object(state.snapshot?.preferences)?.lockInputDevice === true ? 'Locked' : 'Unlocked';
  if (settings.method === 'autoeq.preamp.set')
    value = object(state.snapshot?.autoeq)?.preampEnabled === true ? 'On' : 'Off';
  if (settings.method === 'loudness.set') {
    const prefs = object(state.snapshot?.preferences);
    value =
      prefs?.loudnessCompensationEnabled === true && prefs?.loudnessEqualizationEnabled === true
        ? 'On'
        : prefs?.loudnessCompensationEnabled === false &&
            prefs?.loudnessEqualizationEnabled === false
          ? 'Off'
          : 'Custom';
  }
  if (settings.method === 'device.default.set')
    value = target?.default === true ? 'Selected' : 'Available';
  if (settings.method === 'device.volumeBackend.set')
    value = String(target?.backend ?? 'Unavailable');
  if (settings.method === 'app.pin.set') value = target?.pinned === true ? 'Pinned' : 'Unpinned';
  if (settings.method === 'app.ignore.set')
    value = target?.ignored === true ? 'Ignored' : 'Managed';
  if (settings.method === 'device.hidden.set')
    value = target?.hidden === true ? 'Hidden' : 'Visible';
  if (target?.mixed === true) value = 'Mixed';
  return {
    title: String(target?.name ?? descriptor?.title ?? 'Configure'),
    value,
    muted: target?.muted === true && target?.mixed !== true,
    unavailable: descriptor?.available === false,
  };
}
export function resourceKey(settings: ActionSettings): string {
  const t = object(settings.params?.target);
  return JSON.stringify(
    t
      ? {
          appId: t.appId,
          deviceUID: t.deviceUID,
          selector: t.selector,
          direction: t.direction ?? (t.deviceUID ? 'output' : undefined),
        }
      : { method: settings.method },
  );
}
export function asObject(value: JsonValue | undefined) {
  return object(value);
}
export function resolveGroupSettings(settings: ActionSettings, groups: JsonObject): ActionSettings {
  const group = typeof settings.group === 'string' ? settings.group : undefined;
  return group && object(groups[group])
    ? { ...settings, params: { ...settings.params, target: groups[group] ?? null } }
    : settings;
}
