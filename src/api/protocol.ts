export type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };
export type Field = {
  name: string;
  type: string;
  required?: boolean;
  minimum?: number;
  maximum?: number;
  choices?: string[];
  source?: string;
  ordered?: boolean;
};
export type Descriptor = {
  method: string;
  title: string;
  fields: Field[];
  destructive?: boolean;
  dialParameter?: string;
  units?: string;
  available?: boolean;
  unavailableReason?: string;
};
export type ConnectionState = {
  status: 'disconnected' | 'connecting' | 'ready' | 'incompatible';
  message: string;
  methods: Descriptor[];
  instanceId?: string;
  revision?: number;
  snapshot?: JsonObject;
};
export function object(value: unknown): JsonObject | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonObject)
    : undefined;
}
