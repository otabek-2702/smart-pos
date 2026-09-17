export interface OperatorPairing {
  version: 2;
  id: string;
  name: string;
  url: string;
  discoveryPort: number;
}

export interface OperatorStatus {
  enabled: boolean;
  running: boolean;
  id: string;
  name: string;
  error: string | null;
}

/** Call measurements are supplied by the phone; unknown future fields are retained. */
export interface OperatorCallRecord {
  id: string;
  phone: string;
  direction: 'in' | 'out';
  startedAt: number;
  endedAt: number | null;
  revision?: number;
  customerName?: string;
  [field: string]: unknown;
}

/** How the paired phone uses this POS (protocol 3 `operator_hello`; no hello = operator). */
export type OperatorRole = 'operator' | 'cashier';

export type OperatorLiveCallState = 'ringing' | 'active' | 'waiting' | 'ended';

/** One entry of the phone's protocol 3 `call_state` snapshot. */
export interface OperatorLiveCall {
  id: string;
  phone: string;
  direction: 'in' | 'out';
  state: OperatorLiveCallState;
  since: number;
  customerName?: string;
}

/**
 * Main → renderer payloads on `operator:call-event`. `source` identifies the
 * phone socket; legacy protocol 2 phones only produce call_start/call_end.
 */
export type OperatorCallEvent =
  | { type: 'call_start'; source?: string; phone: string; direction: 'in' | 'out' }
  | { type: 'call_end'; source?: string; phone: string }
  | { type: 'phone_role'; source: string; role: OperatorRole }
  | { type: 'call_state'; source: string; role: OperatorRole; calls: OperatorLiveCall[] }
  | { type: 'phone_gone'; source: string };
