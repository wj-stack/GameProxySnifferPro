
export type Protocol = 'TCP' | 'UDP';
export type Direction = 'IN' | 'OUT';

export interface Packet {
  id: string;
  timestamp: string;
  protocol: Protocol;
  direction: Direction;
  localPort: number;
  remoteAddr: string;
  remotePort: number;
  length: number;
  data: string; // Hex string representation
}

export interface TargetProcess {
  pid: number;
  name: string;
  icon?: string;
}

export enum InjectionStatus {
  NONE = 'NONE',
  INJECTING = 'INJECTING',
  INJECTED = 'INJECTED',
  HOOKED = 'HOOKED',
  ERROR = 'ERROR'
}
