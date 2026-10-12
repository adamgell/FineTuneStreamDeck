import { createConnection, Socket } from 'node:net';
import { discover, defaultDiscoveryPaths } from './discovery.js';
import { object, type ConnectionState, type Descriptor, type JsonObject } from './protocol.js';

type Pending = {
  resolve: (value: JsonObject) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};
export class FineTuneClient {
  state: ConnectionState = { status: 'disconnected', message: 'Enable FineTune API', methods: [] };
  private socket?: Socket;
  private running = false;
  private buffer = Buffer.alloc(0);
  private nextId = 0;
  private pending = new Map<string, Pending>();
  private listeners = new Set<(state: ConnectionState) => void>();
  private reconnect?: ReturnType<typeof setTimeout>;
  private backoff: number;
  constructor(private options: { discoveryPaths?: string[]; backoffStart?: number } = {}) {
    this.backoff = options.backoffStart ?? 250;
  }
  subscribe(listener: (state: ConnectionState) => void) {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }
  private publish(state: ConnectionState) {
    this.state = state;
    for (const listener of this.listeners) listener(state);
  }
  start() {
    if (this.running) return;
    this.running = true;
    void this.connect();
  }
  stop() {
    this.running = false;
    clearTimeout(this.reconnect);
    this.socket?.destroy();
    this.rejectPending();
    this.publish({ ...this.state, status: 'disconnected', message: 'Offline' });
  }
  async request(method: string, params: JsonObject): Promise<JsonObject> {
    if (this.state.status !== 'ready') throw Error(this.state.message);
    return this.send(method, params);
  }
  private send(method: string, params: JsonObject): Promise<JsonObject> {
    if (!this.socket || this.socket.destroyed)
      return Promise.reject(Error('FineTune disconnected'));
    if (this.pending.size >= 64) return Promise.reject(Error('FineTune request capacity exceeded'));
    const id = String(++this.nextId);
    const frame = JSON.stringify({ apiVersion: 1, id, method, params }) + '\n';
    if (Buffer.byteLength(frame) > 1_048_576) return Promise.reject(Error('Request too large'));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(Error('Outcome unknown: response timeout; action was not replayed'));
      }, 5000);
      this.pending.set(id, { resolve, reject, timer });
      this.socket!.write(frame);
    });
  }
  private rejectPending() {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(Error('Outcome unknown: connection lost; action was not replayed'));
    }
    this.pending.clear();
  }
  private schedule() {
    if (!this.running) return;
    clearTimeout(this.reconnect);
    this.reconnect = setTimeout(() => void this.connect(), this.backoff);
    this.backoff = Math.min(5000, this.backoff * 2);
  }
  private async connect() {
    if (!this.running) return;
    this.publish({ ...this.state, status: 'connecting', message: 'Connecting to FineTune' });
    try {
      const endpoint = await discover(this.options.discoveryPaths ?? defaultDiscoveryPaths);
      if (!this.running) return;
      this.buffer = Buffer.alloc(0);
      const socket = createConnection(endpoint.socketPath);
      this.socket = socket;
      socket.on('data', (bytes) => this.receive(bytes));
      socket.on('error', () => {});
      socket.on('close', () => {
        if (this.socket !== socket) return;
        if (this.state.status !== 'incompatible')
          this.publish({ ...this.state, status: 'disconnected', message: 'FineTune offline' });
        this.rejectPending();
        this.schedule();
      });
      await new Promise<void>((resolve, reject) => {
        socket.once('connect', resolve);
        socket.once('error', reject);
      });
      const description = await this.send('api.describe', {});
      if (description.apiVersion !== 1 || description.instanceId !== endpoint.instanceId) {
        this.publish({
          ...this.state,
          status: 'incompatible',
          message: 'FineTune API version/instance mismatch',
        });
        socket.destroy();
        return;
      }
      const methods = description.methods as unknown as Descriptor[];
      if (!Array.isArray(methods)) throw Error('Invalid FineTune method catalog');
      this.publish({ status: 'ready', message: 'Ready', methods, instanceId: endpoint.instanceId });
      const snapshot = await this.send('events.subscribe', {});
      this.applySnapshot(snapshot);
      this.backoff = this.options.backoffStart ?? 250;
    } catch (error) {
      if (this.socket && !this.socket.destroyed) {
        this.socket.destroy();
        return;
      }
      if (this.running) {
        this.publish({
          ...this.state,
          status: 'disconnected',
          message: error instanceof Error ? error.message : 'FineTune offline',
        });
        this.schedule();
      }
    }
  }
  private receive(bytes: Buffer) {
    this.buffer = Buffer.concat([this.buffer, bytes]);
    while (true) {
      const end = this.buffer.indexOf(10);
      if (end < 0) break;
      if (end > 1_048_576) {
        this.socket?.destroy();
        return;
      }
      const frame = this.buffer.subarray(0, end);
      this.buffer = this.buffer.subarray(end + 1);
      try {
        // Node's fatal UTF-8 decoder prevents accepting replacement-character JSON.
        const message = JSON.parse(
          new TextDecoder('utf-8', { fatal: true }).decode(frame),
        ) as JsonObject;
        if (message.apiVersion !== 1) throw Error('Unsupported response version');
        if (typeof message.event === 'string') {
          if (message.event === 'state.changed' || message.event === 'state.snapshot')
            this.applySnapshot(message);
          continue;
        }
        if (typeof message.id !== 'string') throw Error('Invalid response ID');
        const pending = this.pending.get(message.id);
        if (!pending) continue;
        const result = object(message.result),
          error = object(message.error);
        if (Boolean(result) === Boolean(error)) throw Error('Invalid response outcome');
        clearTimeout(pending.timer);
        this.pending.delete(message.id);
        if (error)
          pending.reject(
            Error(typeof error.message === 'string' ? error.message : 'FineTune command failed'),
          );
        else pending.resolve(result!);
      } catch {
        this.socket?.destroy();
        return;
      }
    }
    if (this.buffer.length > 1_048_576) this.socket?.destroy();
  }
  private applySnapshot(value: JsonObject) {
    const snapshot = object(value.state);
    if (!snapshot || typeof value.instanceId !== 'string' || typeof value.revision !== 'number')
      return;
    if (value.instanceId === this.state.instanceId && value.revision < (this.state.revision ?? -1))
      return;
    this.publish({
      ...this.state,
      status: 'ready',
      message: 'Ready',
      snapshot,
      instanceId: value.instanceId,
      revision: value.revision,
    });
  }
  async awaitOperation(id: string): Promise<JsonObject> {
    for (let i = 0; i < 350; i++) {
      const operation = await this.request('operation.get', { operationId: id });
      if (operation.status === 'completed') return object(operation.result) ?? {};
      if (operation.status === 'failed')
        throw Error(String(object(operation.error)?.message ?? 'FineTune operation failed'));
      await new Promise((r) => setTimeout(r, 100));
    }
    throw Error('FineTune operation still pending; not replayed');
  }
}
