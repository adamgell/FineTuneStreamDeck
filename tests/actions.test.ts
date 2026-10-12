import { it, expect, vi } from 'vitest';
vi.mock('@elgato/streamdeck', () => ({
  default: {
    settings: { onDidReceiveGlobalSettings: () => {} },
    ui: { sendToPropertyInspector: vi.fn() },
  },
  action: () => (value: unknown) => value,
  SingletonAction: class {},
}));
import { SceneAction, client } from '../src/actions/command.js';
it('alerts on a failed child in an asynchronously completed scene', async () => {
  client.state = {
    status: 'ready',
    message: 'Ready',
    methods: [
      { method: 'batch.execute', title: 'Scene', fields: [{ name: 'commands', type: 'commands' }] },
    ],
  };
  const request = vi
    .spyOn(client, 'request')
    .mockResolvedValue({ status: 'pending', operationId: 'batch' });
  const terminal = vi
    .spyOn(client, 'awaitOperation')
    .mockResolvedValue({
      results: [
        { result: { status: 'applied' } },
        { error: { code: 'unavailable', message: 'Device disconnected' } },
      ],
    });
  const action = {
    isKey: () => true,
    isDial: () => false,
    setTitle: vi.fn(),
    setState: vi.fn(),
    showAlert: vi.fn(),
    showOk: vi.fn(),
  };
  await new SceneAction().onKeyDown({
    action,
    payload: {
      settings: {
        method: 'batch.execute',
        params: {
          commands: [
            { method: 'device.default.set', params: { target: { deviceUID: 'fixture' } } },
          ],
        },
      },
    },
  } as any);
  expect(terminal).toHaveBeenCalledWith('batch');
  expect(action.showAlert).toHaveBeenCalledOnce();
  expect(action.showOk).not.toHaveBeenCalled();
  request.mockRestore();
  terminal.mockRestore();
});
