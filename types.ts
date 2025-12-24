
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

export type ExtendedPacket = Packet & { 
  originalData?: string; 
  isBlocked?: boolean;
  appliedRuleName?: string;
};

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

export interface TamperRule {
  id: string;
  name: string;
  match: string;
  replace: string;
  action: 'REPLACE' | 'BLOCK';
  active: boolean;
  hits: number;
  hook: HookType;
}
