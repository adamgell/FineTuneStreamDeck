import { it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
it('ships supplied actions and an XL starter profile', () => {
  const root = 'com.finetune.streamdeck.sdPlugin';
  const m = JSON.parse(readFileSync(root + '/manifest.json', 'utf8'));
  expect(
    m.Actions.some((a: { UUID: string }) => a.UUID === 'com.finetune.streamdeck.command'),
  ).toBe(true);
  expect(
    m.Actions.every((a: { PropertyInspectorPath?: string }) =>
      existsSync(root + '/' + (a.PropertyInspectorPath ?? m.PropertyInspectorPath)),
    ),
  ).toBe(true);
  expect(m.Profiles.some((p: { DeviceType: number }) => p.DeviceType === 2)).toBe(true);
});
