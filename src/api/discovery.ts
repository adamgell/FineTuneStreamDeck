import { lstat, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
export const defaultDiscoveryPaths = ['FineTune-Automation', 'FineTune'].map((name) =>
  join(homedir(), 'Library', 'Application Support', name, 'Automation', 'discovery.json'),
);
export async function discover(
  paths: string[],
): Promise<{ socketPath: string; instanceId: string }> {
  for (const path of paths) {
    try {
      const file = await lstat(path),
        parent = await lstat(dirname(path));
      const uid = process.getuid?.();
      if (
        !file.isFile() ||
        file.isSymbolicLink() ||
        file.uid !== uid ||
        (file.mode & 0o077) !== 0 ||
        !parent.isDirectory() ||
        parent.isSymbolicLink() ||
        parent.uid !== uid ||
        (parent.mode & 0o077) !== 0
      )
        continue;
      const value = JSON.parse(await readFile(path, 'utf8')) as {
        apiVersion?: number;
        socketPath?: string;
        instanceId?: string;
      };
      if (
        value.apiVersion !== 1 ||
        typeof value.socketPath !== 'string' ||
        typeof value.instanceId !== 'string'
      )
        continue;
      const socket = await lstat(value.socketPath),
        socketParent = await lstat(dirname(value.socketPath));
      if (
        !socket.isSocket() ||
        socket.isSymbolicLink() ||
        socket.uid !== uid ||
        (socket.mode & 0o077) !== 0 ||
        !socketParent.isDirectory() ||
        socketParent.isSymbolicLink() ||
        socketParent.uid !== uid ||
        (socketParent.mode & 0o077) !== 0
      )
        continue;
      return { socketPath: value.socketPath, instanceId: value.instanceId };
    } catch {
      /* Missing or unsafe discovery is not a usable endpoint. */
    }
  }
  throw Error('Enable Local Automation API in FineTune Settings → General.');
}
