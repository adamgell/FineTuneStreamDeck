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

import { execFileSync } from 'node:child_process';
it('exports a V3 profile with a default page, indexed content page and explicit directories', () => {
  const x = JSON.parse(
    execFileSync(
      'python3',
      [
        '-c',
        `import zipfile,json
with zipfile.ZipFile('com.finetune.streamdeck.sdPlugin/profiles/finetune-xl.streamDeckProfile') as z:
 names=z.namelist(); root=next(n for n in names if n.endswith('.sdProfile/manifest.json')); p=json.loads(z.read(root)); base=root[:-len('manifest.json')]
 pages={k:json.loads(z.read(base+'Profiles/'+k.upper()+'/manifest.json')) for k in [p['Pages']['Default']]+p['Pages']['Pages']}
 print(json.dumps({'profile':p,'pages':pages,'names':names,'base':base}))
`,
      ],
      { encoding: 'utf8' },
    ),
  );
  expect(x.profile.Pages.Pages.length).toBeGreaterThan(0);
  expect(x.profile.Pages.Pages).not.toContain(x.profile.Pages.Default);
  expect(x.names).toContain('Profiles/');
  expect(x.names).toContain(x.base);
  expect(x.pages[x.profile.Pages.Default].Controllers[0].Actions).toBeNull();
  const content = x.pages[x.profile.Pages.Pages[0]].Controllers[0].Actions;
  expect(Object.keys(content)).toHaveLength(32);
});
