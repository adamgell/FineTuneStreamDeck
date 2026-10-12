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
  const terminal = vi.spyOn(client, 'awaitOperation').mockResolvedValue({
    results: [
      { result: { status: 'applied' } },
      { error: { code: 'unavailable', message: 'Device disconnected' } },
    ],
  });
  const action = {
    isKey: () => true,
    isDial: () => false,
    setTitle: vi.fn(),
    setImage: vi.fn(),
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

import { CommandAction } from '../src/actions/command.js';
it('renders live readings as key images without overlapping host titles or repainting unchanged state', async () => {
  client.state = {
    status: 'ready',
    message: 'Ready',
    methods: [{ method: 'device.volume.step', title: 'Volume', fields: [] }],
    snapshot: {
      devices: {
        devices: [{ deviceUID: 'fixture', direction: 'input', default: true, volumePercent: 45 }],
      },
    },
  };
  const action = {
    isKey: () => true,
    isDial: () => false,
    setTitle: vi.fn(),
    setState: vi.fn(),
    setImage: vi.fn(),
  };
  const settings = {
    method: 'device.volume.step',
    params: { target: { selector: 'defaultInput' }, delta: -5 },
    label: 'Mic −',
  };
  const handler = new CommandAction();
  await handler.refresh(action as any, settings);
  await handler.refresh(action as any, settings);
  expect(action.setTitle).toHaveBeenCalledWith('');
  expect(action.setImage).toHaveBeenCalledOnce();
  const image = action.setImage.mock.calls[0]![0] as string;
  expect(image).toMatch(/^data:image\/svg\+xml;base64,/);
  expect(Buffer.from(image.split(',')[1]!, 'base64').toString()).toContain('45%');
  (client.state.snapshot!.devices as any).devices[0].volumePercent = 50;
  await handler.refresh(action as any, settings);
  expect(action.setImage).toHaveBeenCalledTimes(2);
  expect(
    Buffer.from((action.setImage.mock.calls[1]![0] as string).split(',')[1]!, 'base64').toString(),
  ).toContain('50%');
});
