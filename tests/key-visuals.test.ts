import { it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import { renderKeySVG } from '../src/controls/key-visuals.js';
it('keeps live readings separate from the icon and safely treats device names as text', () => {
  const svg = renderKeySVG(
    { method: 'app.volume.step', group: 'Music', params: { delta: 5 } },
    { title: 'Music', value: '45%', muted: false, unavailable: false },
  );
  const doc = new JSDOM(svg, { contentType: 'image/svg+xml' }).window.document;
  expect(doc.querySelector('parsererror')).toBeNull();
  expect([...doc.querySelectorAll('text')].map((t) => t.textContent)).toEqual(['MUSIC', '45%']);
  const untrusted = renderKeySVG(
    { method: 'device.default.set', label: '</text><script>alert(1)</script>' },
    {
      title: 'Device',
      value: '</text><script>alert(1)</script>',
      muted: false,
      unavailable: false,
    },
  );
  const injected = new JSDOM(untrusted, { contentType: 'image/svg+xml' }).window.document;
  expect(injected.querySelector('script')).toBeNull();
  expect(injected.querySelector('parsererror')).toBeNull();
});
it('renders a clear unavailable state rather than a plausible live number', () => {
  const doc = new JSDOM(
    renderKeySVG(
      { method: 'device.volume.step', group: 'Microphone' },
      { title: 'Unavailable', value: '—', muted: false, unavailable: true },
    ),
    { contentType: 'image/svg+xml' },
  ).window.document;
  expect(doc.documentElement.textContent).toContain('UNAVAIL');
  expect(doc.documentElement.textContent).not.toContain('50%');
});
