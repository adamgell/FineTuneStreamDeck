export class DialAccumulator {
  private pending = new Map<string, number>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private busy = new Set<string>();
  private lastWrite = new Map<string, number>();
  constructor(private send: (key: string, delta: number) => Promise<void>) {}
  add(key: string, ticks: number) {
    const next = (this.pending.get(key) ?? 0) + ticks;
    if (Math.abs(next) > 10000) throw Error('Dial queue saturated');
    this.pending.set(key, next);
    if (!this.timers.has(key))
      this.timers.set(
        key,
        setTimeout(() => {
          this.timers.delete(key);
          void this.flush(key).catch(() => {});
        }, 40),
      );
  }
  async flush(key: string) {
    if (this.busy.has(key)) return;
    clearTimeout(this.timers.get(key));
    this.timers.delete(key);
    const delta = this.pending.get(key) ?? 0;
    if (delta === 0) {
      this.pending.delete(key);
      return;
    }
    this.pending.delete(key);
    this.busy.add(key);
    try {
      const delay = 50 - (Date.now() - (this.lastWrite.get(key) ?? 0));
      if (delay > 0) await new Promise((r) => setTimeout(r, delay));
      this.lastWrite.set(key, Date.now());
      await this.send(key, delta);
    } finally {
      this.busy.delete(key);
      if (this.pending.has(key) && !this.timers.has(key))
        this.timers.set(
          key,
          setTimeout(() => {
            this.timers.delete(key);
            void this.flush(key).catch(() => {});
          }, 50),
        );
    }
  }
  dispose() {
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
    this.pending.clear();
  }
}
