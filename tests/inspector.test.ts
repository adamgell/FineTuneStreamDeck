import { it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
const root = 'com.finetune.streamdeck.sdPlugin/ui/';
const catalog = JSON.parse(readFileSync('fixtures/catalog.json', 'utf8'));
function inspector(settings: Record<string, unknown> = {}, fixture = catalog) {
  const dom = new JSDOM(readFileSync(root + 'index.html', 'utf8'), { runScripts: 'outside-only' });
  const sent: Record<string, any>[] = [];
  let ws: any;
  class FakeSocket {
    readyState = 1;
    onopen?: () => void;
    onmessage?: (event: { data: string }) => void;
    constructor() {
      ws = this;
    }
    send(s: string) {
      sent.push(JSON.parse(s));
    }
  }
  (dom.window as any).WebSocket = FakeSocket;
  dom.window.eval(readFileSync(root + 'inspector.js', 'utf8'));
  (dom.window as any).connectElgatoStreamDeckSocket(
    1234,
    'fixture',
    'registerPropertyInspector',
    '{}',
    JSON.stringify({ payload: { settings } }),
  );
  ws.onopen();
  ws.onmessage({
    data: JSON.stringify({
      event: 'sendToPropertyInspector',
      payload: { event: 'catalog', state: fixture, groups: {}, settings },
    }),
  });
  return {
    dom,
    sent,
    document: dom.window.document,
    update: (state: any) =>
      ws.onmessage({
        data: JSON.stringify({
          event: 'sendToPropertyInspector',
          payload: { event: 'state', state },
        }),
      }),
  };
}
it('renders an actual form for every advertised API command', () => {
  const { dom, document } = inspector();
  const select = document.getElementById('method') as HTMLSelectElement;
  for (const method of catalog.methods) {
    select.value = method.method;
    select.dispatchEvent(new dom.window.Event('change'));
    for (const field of method.fields) {
      expect(document.getElementById('fields')?.textContent).toContain(
        field.name.replace(/([A-Z])/g, ' $1'),
      );
    }
  }
  dom.window.close();
});
it('saves one shared target for the XL music group without hand-built URLs', () => {
  const { dom, sent, document } = inspector({
    method: 'app.mute.toggle',
    group: 'Music',
    params: {},
  });
  const target = document.querySelector('#fields select') as HTMLSelectElement;
  target.value = JSON.stringify({ appId: 'com.example.player' });
  (document.getElementById('save') as HTMLButtonElement).click();
  expect(
    sent.some(
      (m) =>
        m.payload?.event === 'setGroupTarget' && m.payload.target.appId === 'com.example.player',
    ),
  ).toBe(true);
  const saved = sent.findLast((m) => m.event === 'setSettings')?.payload;
  expect(saved.params.target).toBeUndefined();
  expect(saved.group).toBe('Music');
  dom.window.close();
});
it('configures a preference through a typed form', () => {
  const { dom, sent, document } = inspector({
    method: 'preferences.patch',
    params: { settings: { appearance: 'dark' } },
  });
  (document.getElementById('save') as HTMLButtonElement).click();
  expect(sent.findLast((m) => m.event === 'setSettings')?.payload.params.settings).toEqual({
    appearance: 'dark',
  });
  dom.window.close();
});

it('saves device priority in the user-selected order', () => {
  const fixture = structuredClone(catalog);
  const field = fixture.methods
    .find((d: any) => d.method === 'device.priority.set')
    .fields.find((f: any) => f.name === 'deviceUIDs');
  field.ordered = true;
  fixture.snapshot.devices.devices = [
    { deviceUID: 'fixture-a', name: 'Speakers A', direction: 'output' },
    { deviceUID: 'fixture-b', name: 'Speakers B', direction: 'output' },
  ];
  const { dom, sent, document } = inspector(
    {
      method: 'device.priority.set',
      params: { direction: 'output', deviceUIDs: ['fixture-a', 'fixture-b'] },
    },
    fixture,
  );
  const up = document.querySelector(
    'button[data-move="up"][data-uid="fixture-b"]',
  ) as HTMLButtonElement;
  expect(up).not.toBeNull();
  up.click();
  (document.getElementById('save') as HTMLButtonElement).click();
  expect(sent.findLast((m) => m.event === 'setSettings')?.payload.params.deviceUIDs).toEqual([
    'fixture-b',
    'fixture-a',
  ]);
  dom.window.close();
});

it('preserves disconnected route destinations on save', () => {
  const { dom, sent, document } = inspector({
    method: 'app.routing.set',
    params: {
      target: { appId: 'com.example.player' },
      mode: 'single',
      deviceUIDs: ['offline-speakers'],
      allowOffline: true,
    },
  });
  (document.getElementById('save') as HTMLButtonElement).click();
  expect(sent.findLast((m) => m.event === 'setSettings')?.payload.params.deviceUIDs).toEqual([
    'offline-speakers',
  ]);
  dom.window.close();
});
it('refreshes sources and schema after connecting while preserving edits', () => {
  const offline = { ...catalog, snapshot: undefined };
  const { dom, document, update, sent } = inspector(
    { method: 'app.volume.set', params: { target: { appId: 'com.example.player' }, percent: 30 } },
    offline,
  );
  const number = document.querySelector('#fields input[type=number]') as HTMLInputElement;
  number.value = '42';
  update(catalog);
  expect(document.querySelector('#fields')?.textContent).toContain('Player');
  (document.getElementById('save') as HTMLButtonElement).click();
  expect(sent.findLast((m) => m.event === 'setSettings')?.payload.params.percent).toBe(42);
  dom.window.close();
});
