import { describe, it, expect } from 'vitest';
import { createServer } from 'node:net';
import { mkdtemp, writeFile, chmod, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FineTuneClient } from '../src/api/client.js';

describe('FineTune client', () => {
  it('negotiates API, consumes authoritative snapshots, and never replays a lost toggle', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ft-plugin-'));
    await chmod(root, 0o700);
    const socket = join(root, 'api.sock');
    const discovery = join(root, 'discovery.json');
    let toggles = 0;
    const server = createServer((connection) => {
      let buffer = '';
      connection.on('data', (chunk) => {
        buffer += chunk;
        let end;
        while ((end = buffer.indexOf('\n')) >= 0) {
          const q = JSON.parse(buffer.slice(0, end));
          buffer = buffer.slice(end + 1);
          if (q.method === 'api.describe')
            connection.write(
              JSON.stringify({
                apiVersion: 1,
                id: q.id,
                result: { apiVersion: 1, instanceId: 'test', methods: [] },
              }) + '\n',
            );
          else if (q.method === 'events.subscribe') {
            connection.write(
              JSON.stringify({
                apiVersion: 1,
                id: q.id,
                result: { instanceId: 'test', revision: 1, state: { apps: [] } },
              }) + '\n',
            );
            connection.write(
              JSON.stringify({
                apiVersion: 1,
                event: 'state.changed',
                instanceId: 'test',
                revision: 2,
                state: { apps: [{ appId: 'fixture', volumePercent: 25 }] },
              }) + '\n',
            );
          } else if (q.method === 'app.mute.toggle') {
            toggles++;
            connection.destroy();
          }
        }
      });
    });
    await new Promise<void>((r) => server.listen(socket, r));
    await chmod(socket, 0o600);
    await writeFile(
      discovery,
      JSON.stringify({ apiVersion: 1, instanceId: 'test', socketPath: socket }),
      { mode: 0o600 },
    );
    const client = new FineTuneClient({ discoveryPaths: [discovery], backoffStart: 10 });
    client.start();
    try {
      await waitFor(() => client.state.status === 'ready' && client.state.revision === 2);
      expect(client.state.snapshot?.apps).toEqual([{ appId: 'fixture', volumePercent: 25 }]);
      await expect(client.request('app.mute.toggle', {})).rejects.toThrow(/unknown/i);
      await waitFor(() => client.state.status === 'ready');
      expect(toggles).toBe(1);
    } finally {
      client.stop();
      await new Promise<void>((r) => server.close(() => r()));
      await rm(root, { recursive: true, force: true });
    }
  });
});
async function waitFor(check: () => boolean) {
  for (let i = 0; i < 100; i++) {
    if (check()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw Error('Timed out');
}
