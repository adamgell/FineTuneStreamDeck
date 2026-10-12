import { object } from '../api/protocol.js';
import type { ActionSettings } from './settings.js';
type Feedback = { title: string; value: string; muted: boolean; unavailable: boolean };
const colors: Record<string, string> = {
  Music: '#56E0C5',
  Browser: '#72B7FF',
  Call: '#FFC477',
  Speakers: '#9BE19B',
  Headset: '#9BE19B',
  Microphone: '#FA95B6',
  'EQ App': '#BA9CFF',
  EQ: '#BA9CFF',
  System: '#A8BDDA',
};
const xml = (v: string) =>
  v.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!,
  );
function icon(settings: ActionSettings, muted: boolean): string {
  const method = settings.method ?? '';
  const p = settings.params ?? {};
  const paths = (d: string) => `<path d="${d}"/>`;
  if (method.includes('volume') || method.includes('mute')) {
    const mic =
      settings.group === 'Microphone' ||
      object(p.target)?.direction === 'input' ||
      object(p.target)?.selector === 'defaultInput';
    let shape = mic
      ? '<rect x="30" y="23" width="10" height="17" rx="5"/><path d="M26 34v2a9 9 0 0 0 18 0v-2M35 45v5M30 50h10"/>'
      : paths('M19 31h6l9-7v25l-9-7h-6zM39 30a10 10 0 0 1 0 13');
    if (method.includes('mute'))
      shape += muted ? paths('M18 22l30 29') : paths('M45 25a16 16 0 0 1 0 24');
    else if (typeof p.delta === 'number' && p.delta !== 0)
      shape += `<circle cx="52" cy="35" r="8" fill="#111B2B"/>${paths(p.delta > 0 ? 'M48 35h8M52 31v8' : 'M48 35h8')}`;
    return shape;
  }
  if (method.includes('boost')) return paths('M38 21L24 38h11l-2 13 15-19H37z');
  if (method === 'app.routing.set')
    return paths(
      p.mode === 'followDefault'
        ? 'M23 31h25m-6-6 6 6-6 6M49 44H24m6-6-6 6 6 6'
        : 'M22 25h12v12H22zM40 39h12v12H40zM34 31h12v8M28 37v8h12',
    );
  if (method === 'device.default.set') {
    if (settings.group === 'Headset')
      return paths('M23 39v-5a13 13 0 0 1 26 0v5M23 36h-4v12h7V36zM49 36h4v12h-7V36z');
    if (settings.group === 'Microphone')
      return '<rect x="31" y="23" width="10" height="17" rx="5"/><path d="M27 35a9 9 0 0 0 18 0M36 44v7M30 51h12"/>';
    return '<rect x="22" y="22" width="28" height="29" rx="4"/><circle cx="36" cy="31" r="3"/><circle cx="36" cy="43" r="6"/>';
  }
  if (method.includes('eq.band'))
    return (
      paths('M22 25h28M22 36h28M22 47h28M30 22v6M42 33v6M34 44v6') +
      `<circle cx="54" cy="36" r="7" fill="#111B2B"/>${paths(Number(p.delta) > 0 ? 'M51 36h6M54 33v6' : 'M51 36h6')}`
    );
  if (method.includes('eq.preset'))
    return p.presetId === 'vocalClarity'
      ? paths('M27 26a9 9 0 0 1 18 0v14a9 9 0 0 1-18 0zM23 40a13 13 0 0 0 26 0M36 53v-4')
      : paths('M21 29h30M21 36h30M21 43h30');
  if (method.startsWith('app.eq.')) return paths('M23 46V28M31 46V22M39 46V31M47 46V25');
  if (method.startsWith('autoeq'))
    return paths('M22 39v-5a14 14 0 0 1 28 0v5M22 36h-4v12h7V36zM50 36h4v12h-7V36zM31 37l4 5 8-11');
  if (method === 'loudness.set')
    return (
      paths('M20 35h5l4-12 5 28 5-31 5 23 4-8h4') +
      (p.enabled === false ? paths('M20 21l32 31') : '')
    );
  if (method === 'input.lock.set')
    return (
      paths(p.enabled === false ? 'M29 33v-5a8 8 0 0 1 16-1' : 'M28 33v-6a8 8 0 0 1 16 0v6') +
      '<rect x="23" y="33" width="26" height="20" rx="4"/><path d="M36 40v6"/>'
    );
  if (method === 'ui.settings.open')
    return (
      '<circle cx="36" cy="36" r="10"/><circle cx="36" cy="36" r="3"/>' +
      paths('M36 20v5M36 47v5M20 36h5M47 36h5M24 24l4 4M44 44l4 4M24 48l4-4M44 28l4-4')
    );
  if (method.startsWith('ui.popup'))
    return '<rect x="21" y="23" width="30" height="27" rx="4"/><path d="M21 30h30M28 44V37M36 44V34M44 44V38"/>';
  if (method === 'batch.execute')
    return paths('M25 25h20v7H25zM25 39h20v7H25zM36 32v7M21 28h-4v15h8M45 28h10l-4-4M55 28l-4 4');
  return (
    paths('M24 26h24M24 36h24M24 46h24') +
    '<circle cx="31" cy="26" r="3"/><circle cx="42" cy="36" r="3"/><circle cx="34" cy="46" r="3"/>'
  );
}
function compact(value: string): string {
  const words: Record<string, string> = {
    'System output': 'SYSTEM',
    Selected: 'ACTIVE',
    Available: 'SWITCH',
    Configure: 'SETUP',
    Unavailable: 'UNAVAIL',
    Pending: 'WAIT',
    Locked: 'LOCKED',
    Unlocked: 'OPEN',
    'EQ On': 'ON',
    'EQ Off': 'OFF',
    Muted: 'MUTED',
    On: 'ON',
    Off: 'OFF',
    None: 'NONE',
  };
  if (words[value]) return words[value];
  if (value.includes('Jabra')) return 'JABRA';
  return value.length > 11 ? value.slice(0, 10) + '…' : value;
}
export function renderKeySVG(settings: ActionSettings, feedback: Feedback): string {
  const method = settings.method ?? '';
  const group =
    typeof settings.group === 'string'
      ? settings.group
      : method.startsWith('app.eq') ||
          method.startsWith('eq.') ||
          method.startsWith('autoeq') ||
          method === 'loudness.set'
        ? 'EQ'
        : 'System';
  let header =
    settings.group === 'Microphone'
      ? 'MIC'
      : settings.group === 'EQ App'
        ? 'EQ'
        : typeof settings.group === 'string'
          ? settings.group.toUpperCase()
          : method === 'ui.settings.open'
            ? 'SETTINGS'
            : method.startsWith('ui.popup')
              ? 'FINETUNE'
              : method === 'batch.execute'
                ? 'SCENE'
                : method === 'input.lock.set'
                  ? 'MIC LOCK'
                  : method === 'loudness.set'
                    ? 'LOUDNESS'
                    : String(settings.label ?? feedback.title)
                        .toUpperCase()
                        .slice(0, 10);
  if (method.includes('eq.preset'))
    header =
      settings.params?.presetId === 'vocalClarity'
        ? 'VOICE EQ'
        : settings.params?.presetId === 'flat'
          ? 'FLAT EQ'
          : 'PRESET';
  if (method.includes('eq.band')) header = settings.params?.band === 0 ? 'BASS' : 'EQ BAND';
  if (method === 'app.routing.set') {
    const name =
      group === 'Call' ? 'CALL' : group === 'Music' ? 'MUSIC' : group === 'Browser' ? 'WEB' : '';
    header = (name + (settings.params?.mode === 'followDefault' ? ' SYS' : ' ROUTE')).trim();
  }
  if (method === 'loudness.set')
    header = settings.params?.enabled === false ? 'LOUD OFF' : 'LOUD ON';
  if (method === 'input.lock.set')
    header = settings.params?.enabled === false ? 'MIC OPEN' : 'MIC LOCK';
  const color = feedback.muted
    ? '#FF8F9A'
    : feedback.unavailable
      ? '#FFC477'
      : (colors[group] ?? colors.System);
  const value = feedback.unavailable
    ? compact(feedback.title === 'Offline' ? 'OFFLINE' : 'UNAVAIL')
    : compact(
        feedback.value ||
          (method === 'batch.execute' ? 'RUN' : method.startsWith('ui.') ? 'OPEN' : ''),
      );
  const font = value.length <= 6 ? 15 : value.length <= 8 ? 11.5 : 9.5;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 72 72"><rect width="72" height="72" rx="8" fill="#0B1220"/><rect x="2" y="2" width="68" height="68" rx="7" fill="#111B2B" stroke="${color}" stroke-opacity=".45"/><path d="M17 2h38" stroke="${color}" stroke-width="2" stroke-linecap="round"/><text x="36" y="14" text-anchor="middle" font-family="Arial,sans-serif" font-size="8.3" font-weight="700" letter-spacing=".6" fill="${color}">${xml(header)}</text><g fill="none" stroke="${feedback.unavailable ? '#A8BDDA' : '#EDF5FF'}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${icon(settings, feedback.muted)}</g><text x="36" y="65" text-anchor="middle" font-family="Arial,sans-serif" font-size="${font}" font-weight="700" fill="${color}">${xml(value)}</text></svg>`;
}
