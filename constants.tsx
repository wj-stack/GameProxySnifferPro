
import React from 'react';
import { Packet, TargetProcess, HookType } from './types';

export const MOCK_PROCESSES: TargetProcess[] = [
  { pid: 12440, name: 'GenshinImpact.exe' },
  { pid: 8832, name: 'League of Legends.exe' },
  { pid: 5521, name: 'Valorant-Win64-Shipping.exe' },
  { pid: 2102, name: 'Steam.exe' },
  { pid: 9004, name: 'Discord.exe' },
];

const HOOKS: HookType[] = ['send', 'recv', 'sendto', 'recvfrom', 'WSASend', 'WSARecv'];

export const MOCK_PACKETS: Packet[] = Array.from({ length: 50 }).map((_, i) => {
  const protocol: 'TCP' | 'UDP' = Math.random() > 0.2 ? 'TCP' : 'UDP';
  const direction: 'IN' | 'OUT' = Math.random() > 0.5 ? 'IN' : 'OUT';
  
  // Plausible game packet lengths: Small heartbeats (32b) to large state updates (1200b)
  const length = Math.floor(Math.random() * (Math.random() > 0.8 ? 1400 : 200)) + 32;

  // Pick a plausible hook based on protocol/direction
  let sourceHook: HookType = 'send';
  if (protocol === 'TCP') {
    sourceHook = direction === 'IN' ? 'recv' : 'send';
  } else {
    sourceHook = direction === 'IN' ? 'recvfrom' : 'sendto';
  }

  // Generate actual hex string that matches the 'length' property
  const hexData = Array.from({ length }).map(() => 
    Math.floor(Math.random() * 256).toString(16).padStart(2, '0')
  ).join(' ');

  return {
    id: `pkt-${i}`,
    timestamp: new Date(Date.now() - i * 100).toLocaleTimeString('en-GB', { hour12: false }) + '.' + Math.floor(Math.random() * 1000).toString().padStart(3, '0'),
    protocol,
    direction,
    localPort: 54201 + Math.floor(Math.random() * 10),
    remoteAddr: `1.22.145.${Math.floor(Math.random() * 255)}`,
    remotePort: Math.random() > 0.8 ? 80 : 443,
    length,
    data: hexData,
    sourceHook,
  };
});
