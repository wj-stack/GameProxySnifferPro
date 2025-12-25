import { invoke } from '@tauri-apps/api/core';
import { TamperRule } from './types';
import { listen } from '@tauri-apps/api/event';
export { listen };

/**
 * Capture API - 抓包控制 API
 */
export const captureApi = {
  /**
   * 开始抓包
   */
  start: async (): Promise<void> => {
    await invoke('start_capture');
  },

  /**
   * 停止抓包
   */
  stop: async (): Promise<void> => {
    await invoke('stop_capture');
  },

  /**
   * 获取抓包状态
   * @returns 'capturing' | 'idle'
   */
  getStatus: async (): Promise<'capturing' | 'idle'> => {
    return await invoke('get_capture_status');
  },
};

/**
 * Hook API - 与 DLL 通信的 API 接口
 */

// Hook 开关 API
export const hookApi = {
  /**
   * 启用/禁用 send hook
   */
  send: async (enable: boolean): Promise<void> => {
    await invoke('hook_send', { enable });
  },

  /**
   * 启用/禁用 recv hook
   */
  recv: async (enable: boolean): Promise<void> => {
    await invoke('hook_recv', { enable });
  },

  /**
   * 启用/禁用 sendto hook
   */
  sendto: async (enable: boolean): Promise<void> => {
    await invoke('hook_sendto', { enable });
  },

  /**
   * 启用/禁用 recvfrom hook
   */
  recvfrom: async (enable: boolean): Promise<void> => {
    await invoke('hook_recvfrom', { enable });
  },

  /**
   * 启用/禁用 WSASend hook
   */
  wsasend: async (enable: boolean): Promise<void> => {
    await invoke('hook_wsasend', { enable });
  },

  /**
   * 启用/禁用 WSARecv hook
   */
  wsarecv: async (enable: boolean): Promise<void> => {
    await invoke('hook_wsarecv', { enable });
  },
};

/**
 * TamperRule API - 数据包篡改规则管理
 */
export const tamperRuleApi = {
  /**
   * 添加篡改规则
   */
  add: async (rule: TamperRule): Promise<void> => {
    // 转换前端类型到后端类型
    const hookTypeMap: Record<string, string> = {
      'send': 'Send',
      'recv': 'Recv',
      'sendto': 'SendTo',
      'recvfrom': 'RecvFrom',
      'WSASend': 'WSASend',
      'WSARecv': 'WSARecv',
      'ALL': 'Send', // 默认使用 Send
    };
    
    const backendRule = {
      id: rule.id,
      name: rule.name,
      match_pattern: rule.match,
      replace: rule.replace,
      action: rule.action === 'REPLACE' ? 'Replace' : 'Block',
      active: rule.active,
      hits: rule.hits,
      hook: hookTypeMap[rule.hook] || 'Send',
    };
    await invoke('add_tamper_rule', { rule: backendRule });
  },

  /**
   * 删除篡改规则
   */
  remove: async (id: string): Promise<void> => {
    await invoke('remove_tamper_rule', { id });
  },

  /**
   * 更新篡改规则
   */
  update: async (rule: TamperRule): Promise<void> => {
    // 转换前端类型到后端类型
    const hookTypeMap: Record<string, string> = {
      'send': 'Send',
      'recv': 'Recv',
      'sendto': 'SendTo',
      'recvfrom': 'RecvFrom',
      'WSASend': 'WSASend',
      'WSARecv': 'WSARecv',
      'ALL': 'Send', // 默认使用 Send
    };
    
    const backendRule = {
      id: rule.id,
      name: rule.name,
      match_pattern: rule.match,
      replace: rule.replace,
      action: rule.action === 'REPLACE' ? 'Replace' : 'Block',
      active: rule.active,
      hits: rule.hits,
      hook: hookTypeMap[rule.hook] || 'Send',
    };
    await invoke('update_tamper_rule', { rule: backendRule });
  },

  /**
   * 启用篡改规则
   */
  enable: async (id: string): Promise<void> => {
    await invoke('enable_tamper_rule', { id });
  },

  /**
   * 禁用篡改规则
   */
  disable: async (id: string): Promise<void> => {
    await invoke('disable_tamper_rule', { id });
  },

  /**
   * 列出所有篡改规则
   */
  list: async (): Promise<void> => {
    await invoke('list_tamper_rules');
  },

  /**
   * 清空所有规则的命中计数
   */
  clearAllHits: async (): Promise<void> => {
    await invoke('clear_all_hits');
  },
};

