
export type Protocol = 'TCP' | 'UDP';
export type Direction = 'IN' | 'OUT';

export type HookType = 'send' | 'recv' | 'sendto' | 'recvfrom' | 'WSASend' | 'WSARecv' | 'ALL';

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
  sourceHook?: HookType; // Which hook captured this packet
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
