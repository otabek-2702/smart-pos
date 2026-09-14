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
