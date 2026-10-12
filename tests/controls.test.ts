import { it, expect } from 'vitest';
import { validateSettings, makeDialRequest, renderFeedback } from '../src/controls/settings.js';
import { DialAccumulator } from '../src/controls/dial-accumulator.js';

it('validates selected actions rather than silently substituting targets', () => {
  expect(
    validateSettings({ method: 'app.volume.set', params: { percent: 120 } }, [
      {
        method: 'app.volume.set',
        title: 'Volume',
        fields: [
          { name: 'target', type: 'target', required: true },
          { name: 'percent', type: 'number', required: true, minimum: 0, maximum: 100 },
        ],
      },
    ]).ok,
  ).toBe(false);
});
it('rotates with a relative command preserving the target', () => {
  expect(
    makeDialRequest(
      { method: 'app.volume.set', params: { target: { appId: 'fixture' }, percent: 30 }, step: 2 },
      3,
    ),
  ).toEqual({
    method: 'app.volume.step',
    params: { target: { appId: 'fixture' }, domain: 'percent', delta: 6 },
  });
});
it('does not show a confirmed number while disconnected', () => {
  expect(
    renderFeedback(
      { method: 'app.volume.set', params: { target: { appId: 'fixture' } } },
      {
        status: 'disconnected',
        message: 'Offline',
        methods: [],
        snapshot: { apps: [{ appId: 'fixture', volumePercent: 30 }] },
      },
    ).title,
  ).toMatch(/Offline/);
});
it('accumulates opposing dial ticks without losing delta', async () => {
  const sent: number[] = [];
  const a = new DialAccumulator(async (_key, delta) => {
    sent.push(delta);
  });
  a.add('fixture', 4);
  a.add('fixture', -1);
  await a.flush('fixture');
  expect(sent).toEqual([3]);
  a.dispose();
});
import { resolveGroupSettings } from '../src/controls/settings.js';
it('configures a shared XL group once for all of its buttons', () => {
  expect(
    resolveGroupSettings(
      { method: 'app.mute.toggle', group: 'Music', params: {} },
      { Music: { appId: 'fixture' } },
    ).params?.target,
  ).toEqual({ appId: 'fixture' });
});
it('shows EQ band state rather than the app volume', () => {
  const state = {
    status: 'ready' as const,
    message: 'Ready',
    methods: [{ method: 'app.eq.band.step', title: 'EQ Band', fields: [] }],
    snapshot: {
      apps: [{ appId: 'fixture', name: 'Player', volumePercent: 30 }],
      eq: {
        apps: [
          { appId: 'fixture', eq: { isEnabled: true, bandGains: [6, 0, 0, 0, 0, 0, 0, 0, 0, 0] } },
        ],
      },
    },
  };
  expect(
    renderFeedback(
      { method: 'app.eq.band.step', params: { target: { appId: 'fixture' }, band: 0 } },
      state,
    ).value,
  ).toBe('+6 dB');
});
it('shows whether headphone correction is enabled', () => {
  const state = {
    status: 'ready' as const,
    message: 'Ready',
    methods: [{ method: 'autoeq.device.setEnabled', title: 'Correction', fields: [] }],
    snapshot: {
      devices: {
        devices: [
          { deviceUID: 'fixture-device', name: 'Headset', direction: 'output', volumePercent: 60 },
        ],
      },
      autoeq: {
        devices: [
          { deviceUID: 'fixture-device', selection: { profileID: 'fixture', isEnabled: false } },
        ],
      },
    },
  };
  expect(
    renderFeedback(
      { method: 'autoeq.device.setEnabled', params: { target: { deviceUID: 'fixture-device' } } },
      state,
    ).value,
  ).toBe('Off');
});

import { resourceKey } from '../src/controls/settings.js';
it('keeps input, output, selectors and duplex dial identities separate', () => {
  const key = (target: any) => resourceKey({ method: 'device.volume.step', params: { target } });
  expect(key({ selector: 'defaultInput' })).not.toBe(key({ selector: 'defaultOutput' }));
  expect(key({ deviceUID: 'duplex', direction: 'input' })).not.toBe(
    key({ deviceUID: 'duplex', direction: 'output' }),
  );
});
it('shows alert volume and route state without borrowing speaker volume', () => {
  const state: any = {
    status: 'ready',
    message: 'Ready',
    methods: [{ method: 'alert.volume.step', title: 'Alert Volume', fields: [] }],
    snapshot: {
      devices: {
        alertVolumePercent: 15,
        devices: [{ name: 'Speakers', direction: 'output', default: true, volumePercent: 80 }],
      },
      apps: [{ appId: 'player', name: 'Player', volumePercent: 30 }],
      routing: [{ appId: 'player', mode: 'followDefault', deviceUIDs: [] }],
    },
  };
  expect(renderFeedback({ method: 'alert.volume.step' }, state)).toMatchObject({
    title: 'Alert Volume',
    value: '15%',
  });
  expect(
    renderFeedback({ method: 'app.routing.set', params: { target: { appId: 'player' } } }, state)
      .value,
  ).toBe('System output');
});
