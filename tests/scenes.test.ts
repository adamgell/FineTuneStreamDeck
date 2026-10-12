import { it, expect } from 'vitest';
import { summarizeBatch, validateScene } from '../src/controls/scenes.js';
it('reports partial failure instead of marking a scene successful', () => {
  expect(
    summarizeBatch({
      results: [
        { result: { status: 'stored' } },
        { error: { code: 'unavailable', message: 'Disconnected' } },
      ],
    }),
  ).toEqual({ ok: false, applied: 0, stored: 1, pending: 0, failed: 1 });
});
it('rejects empty scenes and relative commands', () => {
  expect(validateScene([]).ok).toBe(false);
  expect(validateScene([{ method: 'app.mute.toggle', params: {} }]).ok).toBe(false);
  expect(validateScene([{ method: 'app.mute.set', params: { muted: true } }]).ok).toBe(true);
});
