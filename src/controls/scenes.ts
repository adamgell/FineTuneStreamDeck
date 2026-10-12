import { object, type JsonValue, type JsonObject } from '../api/protocol.js';
export function validateScene(commands: JsonValue[]): { ok: boolean; message: string } {
  if (commands.length === 0 || commands.length > 64)
    return { ok: false, message: 'Select 1–64 scene commands' };
  for (const command of commands) {
    const c = object(command);
    if (
      !c ||
      typeof c.method !== 'string' ||
      !object(c.params) ||
      c.method === 'batch.execute' ||
      /\.(step|toggle|cycle|get|list|search|describe|subscribe|status)$/.test(c.method)
    )
      return { ok: false, message: 'Scenes require absolute commands' };
  }
  return { ok: true, message: 'Ready' };
}
export function summarizeBatch(result: JsonObject): {
  ok: boolean;
  applied: number;
  stored: number;
  pending: number;
  failed: number;
} {
  const summary = { ok: true, applied: 0, stored: 0, pending: 0, failed: 0 };
  for (const item of Array.isArray(result.results) ? result.results : []) {
    const row = object(item);
    const outcome = object(row?.result);
    if (row?.error) {
      summary.failed++;
      summary.ok = false;
    } else if (outcome?.status === 'pending') summary.pending++;
    else if (outcome?.status === 'stored') summary.stored++;
    else summary.applied++;
  }
  return summary;
}
