
import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { TargetProcess, InjectionStatus, HookType, ExtendedPacket, TamperRule, Protocol } from './types';
import { MOCK_PROCESSES, MOCK_PACKETS } from './constants';
import { formatHexInput, hexToRegexSpaced } from './utils';
import { captureApi, listen, tamperRuleApi, processApi, hookApi } from './api';

export const useGameProxy = () => {
  // Domain State
  const [processes, setProcesses] = useState<TargetProcess[]>(MOCK_PROCESSES);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedProcess, setSelectedProcess] = useState<TargetProcess | null>(null);
  const [injectionStatus, setInjectionStatus] = useState<InjectionStatus>(InjectionStatus.NONE);
  const [isCapturing, setIsCapturing] = useState(false);
  const [packets, setPackets] = useState<ExtendedPacket[]>([]);
  const [trafficData, setTrafficData] = useState<number[]>(new Array(20).fill(0));
  
  // Filters
  const [filterText, setFilterText] = useState('');
  const [protocolFilter, setProtocolFilter] = useState<Protocol | 'ALL'>('ALL');
  const [hookFilter, setHookFilter] = useState<HookType | 'ALL'>('ALL');
  const [socketFilter, setSocketFilter] = useState<string>('');

  // Hook Config
  const [globalHooksEnabled, setGlobalHooksEnabled] = useState(false);
  const [hookSettings, setHookSettings] = useState<Record<HookType, boolean>>({
    'send': true, 'recv': true, 'sendto': true, 'recvfrom': true, 'WSASend': true, 'WSARecv': true, 'ALL': true
  });

  // Tamper Rules
  const [tamperRules, setTamperRules] = useState<TamperRule[]>([]);

  // Refs for stable access in intervals
  const tamperRulesRef = useRef(tamperRules);
  const hookSettingsRef = useRef(hookSettings);

  useEffect(() => {
    tamperRulesRef.current = tamperRules;
  }, [tamperRules]);

  useEffect(() => {
    hookSettingsRef.current = hookSettings;
  }, [hookSettings]);

  // Traffic Graph Simulation
  useEffect(() => {
    const interval = setInterval(() => {
      // Scale traffic based on capture state
      const baseLoad = isCapturing ? Math.floor(Math.random() * 50) + 20 : Math.floor(Math.random() * 10);
      setTrafficData(prev => [...prev.slice(1), baseLoad]);
    }, 500);
    return () => clearInterval(interval);
  }, [isCapturing]);

  // 监听后端发送的数据包事件
  useEffect(() => {
    let unlistenFn: (() => void) | null = null;

    const setupListener = async () => {
      try {
        const unlisten = await listen<{
          id: number;
          timestamp: number;
          processId: number;
          processName: string;
          protocol: string;
          direction: string;
          srcAddr: string;
          dstAddr: string;
          size: number;
          socket?: number;
          packetFunction?: string;
          packetData?: string;
        }>('packet-captured', (event) => {
          const backendPacket = event.payload;
          
          // 转换后端 Packet 格式到前端 ExtendedPacket 格式
          // 将后端的 packetData（可能是单个字节或多个字节）转换为空格分隔的十六进制字符串
          let packetDataHex = backendPacket.packetData || '';
          // 如果数据不是空格分隔的格式，尝试格式化
          if (packetDataHex && !packetDataHex.includes(' ')) {
            // 每两个字符一组，用空格分隔
            packetDataHex = packetDataHex.match(/.{1,2}/g)?.join(' ') || packetDataHex;
          }
          
          const frontendPacket: ExtendedPacket = {
            id: `pkt-${backendPacket.id}`,
            timestamp: new Date(backendPacket.timestamp).toLocaleTimeString('en-GB', { hour12: false }) + '.' + (backendPacket.timestamp % 1000).toString().padStart(3, '0'),
            protocol: backendPacket.protocol as Protocol,
            direction: backendPacket.direction === 'send' ? 'OUT' : 'IN',
            localPort: parseInt(backendPacket.srcAddr.split(':').pop() || '0'),
            remoteAddr: backendPacket.dstAddr,
            remotePort: parseInt(backendPacket.dstAddr.split(':').pop() || '0'),
            length: backendPacket.size,
            data: packetDataHex,
            sourceHook: (backendPacket.packetFunction || 'send').toLowerCase() as HookType,
            socket: backendPacket.socket ? Number(backendPacket.socket) : undefined,
          };

          // 应用规则
          let blocked = false;
          let modified = false;
          let originalData: string | undefined = undefined;
          let finalData = frontendPacket.data;
          const hitUpdates: Record<string, number> = {};

          const activeRules = tamperRulesRef.current.filter(r => r.active);
          
          for (const rule of activeRules) {
            if (rule.hook !== 'ALL' && rule.hook !== frontendPacket.sourceHook) continue;
            
            const matchRegex = hexToRegexSpaced(rule.match);
            if (!matchRegex) continue;

            if (matchRegex.test(finalData)) {
              hitUpdates[rule.id] = (hitUpdates[rule.id] || 0) + 1;
              frontendPacket.appliedRuleName = rule.name;

              if (rule.action === 'BLOCK') {
                blocked = true;
                break;
              } else if (rule.action === 'REPLACE') {
                if (!modified) {
                  originalData = finalData;
                  modified = true;
                }
                const matchResult = finalData.match(matchRegex);
                if (matchResult) {
                  const matchedSubstr = matchResult[0];
                  finalData = finalData.replace(matchedSubstr, rule.replace);
                }
              }
            }
          }

          frontendPacket.isBlocked = blocked;
          frontendPacket.data = finalData;
          frontendPacket.originalData = originalData;
          if (modified) {
            frontendPacket.length = finalData.split(' ').filter(x => x).length;
          }

          // 更新状态
          setPackets(prev => {
            const next = [...prev, frontendPacket];
            if (next.length > 1000) return next.slice(-1000);
            return next;
          });

          // 更新规则命中计数
          if (Object.keys(hitUpdates).length > 0) {
            setTamperRules(prev => prev.map(r => 
              hitUpdates[r.id] ? { ...r, hits: r.hits + hitUpdates[r.id] } : r
            ));
          }
        });

        unlistenFn = unlisten;
      } catch (error) {
        console.error('设置数据包监听器失败:', error);
      }
    };

    setupListener();

    return () => {
      if (unlistenFn) {
        unlistenFn();
      }
    };
  }, []); // 只在组件挂载时设置一次监听器

  // Streaming Packet Simulation (保留作为后备，当后端未连接时使用)
  // useEffect(() => {
  //   if (!isCapturing || !globalHooksEnabled || injectionStatus !== InjectionStatus.HOOKED) return;

  //   const interval = setInterval(() => {
  //       // 1. Pick a random template
  //       const template = MOCK_PACKETS[Math.floor(Math.random() * MOCK_PACKETS.length)];
        
  //       // Check hook filter (from ref)
  //       if (hookSettingsRef.current[template.sourceHook as HookType] === false) return;

  //       // Create fresh packet
  //       const now = new Date();
  //       const newPacket: ExtendedPacket = {
  //           ...template,
  //           id: `pkt-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
  //           timestamp: now.toLocaleTimeString('en-GB', { hour12: false }) + '.' + now.getMilliseconds().toString().padStart(3, '0'),
  //       };

  //       // 2. Apply Rules (from ref)
  //       let blocked = false;
  //       let modified = false;
  //       let originalData = undefined;
  //       let finalData = newPacket.data;
  //       const hitUpdates: Record<string, number> = {};

  //       const activeRules = tamperRulesRef.current.filter(r => r.active);
        
  //       for (const rule of activeRules) {
  //           if (rule.hook !== 'ALL' && rule.hook !== newPacket.sourceHook) continue;
            
  //           const matchRegex = hexToRegexSpaced(rule.match);
  //           if (!matchRegex) continue;

  //           if (matchRegex.test(finalData)) {
  //               hitUpdates[rule.id] = (hitUpdates[rule.id] || 0) + 1;
  //               newPacket.appliedRuleName = rule.name; // Track the rule name

  //               if (rule.action === 'BLOCK') {
  //                   blocked = true;
  //                   break;
  //               } else if (rule.action === 'REPLACE') {
  //                   if (!modified) {
  //                       originalData = finalData;
  //                       modified = true;
  //                   }
  //                   const matchResult = finalData.match(matchRegex);
  //                   if (matchResult) {
  //                       const matchedSubstr = matchResult[0];
  //                       finalData = finalData.replace(matchedSubstr, rule.replace);
  //                   }
  //               }
  //           }
  //       }

  //       newPacket.isBlocked = blocked;
  //       newPacket.data = finalData;
  //       newPacket.originalData = originalData;
  //       if (modified) {
  //            newPacket.length = finalData.split(' ').filter(x => x).length;
  //       }

  //       // 3. Update State
  //       setPackets(prev => {
  //           const next = [...prev, newPacket]; // Append to end
  //           if (next.length > 1000) return next.slice(-1000); // Keep last 1000
  //           return next;
  //       });

  //       // Update rule hits
  //       if (Object.keys(hitUpdates).length > 0) {
  //           setTamperRules(prev => prev.map(r => 
  //               hitUpdates[r.id] ? { ...r, hits: r.hits + hitUpdates[r.id] } : r
  //           ));
  //       }

  //   }, 150); // ~6.6 packets/sec

  //   return () => clearInterval(interval);
  // }, [isCapturing, globalHooksEnabled, injectionStatus]);


  // Process Logic - 使用真实的 API
  const refreshProcesses = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const processList = await processApi.getProcesses();
      setProcesses(processList);
    } catch (error) {
      console.error('获取进程列表失败:', error);
      // 如果 API 调用失败，使用模拟数据作为后备
      setProcesses(MOCK_PROCESSES);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  // 组件加载时获取进程列表
  useEffect(() => {
    refreshProcesses();
  }, [refreshProcesses]);

  const selectProcess = useCallback((proc: TargetProcess) => {
    setSelectedProcess(proc);
    setInjectionStatus(InjectionStatus.NONE);
    setGlobalHooksEnabled(false);
    setIsCapturing(false);
    setPackets([]);
  }, []);

  // 辅助函数：根据 hookSettings 激活/停用 hooks
  const applyHookSettings = useCallback(async (enable: boolean) => {
    const hookPromises: Promise<void>[] = [];
    
    // 根据 hookSettings 启用/禁用各个 hook
    if (hookSettings.send !== false) {
      hookPromises.push(hookApi.send(enable));
    }
    if (hookSettings.recv !== false) {
      hookPromises.push(hookApi.recv(enable));
    }
    if (hookSettings.sendto !== false) {
      hookPromises.push(hookApi.sendto(enable));
    }
    if (hookSettings.recvfrom !== false) {
      hookPromises.push(hookApi.recvfrom(enable));
    }
    if (hookSettings.WSASend !== false) {
      hookPromises.push(hookApi.wsasend(enable));
    }
    if (hookSettings.WSARecv !== false) {
      hookPromises.push(hookApi.wsarecv(enable));
    }
    
    // 等待所有 hook 操作完成
    await Promise.all(hookPromises);
  }, [hookSettings]);

  // Injection Logic - 真实实现
  const injectDll = useCallback(async () => {
    if (!selectedProcess) {
      console.error('未选择进程');
      return;
    }
    
    setInjectionStatus(InjectionStatus.INJECTING);
    
    try {
      const result = await processApi.injectDll(selectedProcess.pid);
      console.log('DLL 注入成功:', result);
      setInjectionStatus(InjectionStatus.INJECTED);
    } catch (error) {
      console.error('DLL 注入失败:', error);
      setInjectionStatus(InjectionStatus.ERROR);
      // 3 秒后自动重置错误状态
      setTimeout(() => {
        setInjectionStatus(InjectionStatus.NONE);
      }, 3000);
    }
  }, [selectedProcess]);

  // 切换特定 Hook - 如果 hooks 已激活，需要实时更新后端状态
  const toggleSpecificHook = useCallback(async (hook: HookType) => {
    const newValue = !hookSettings[hook];
    setHookSettings(prev => ({ ...prev, [hook]: newValue }));
    
    // 如果 hooks 已激活，需要实时更新后端状态
    if (globalHooksEnabled && hook !== 'ALL') {
      try {
        // 根据 hook 类型调用对应的 API
        switch (hook) {
          case 'send':
            await hookApi.send(newValue);
            break;
          case 'recv':
            await hookApi.recv(newValue);
            break;
          case 'sendto':
            await hookApi.sendto(newValue);
            break;
          case 'recvfrom':
            await hookApi.recvfrom(newValue);
            break;
          case 'WSASend':
            await hookApi.wsasend(newValue);
            break;
          case 'WSARecv':
            await hookApi.wsarecv(newValue);
            break;
        }
        console.log(`[Hook] ${hook} ${newValue ? '已启用' : '已禁用'}`);
      } catch (error) {
        console.error(`[Hook] 切换 ${hook} 状态失败:`, error);
        // 如果更新失败，恢复之前的状态
        setHookSettings(prev => ({ ...prev, [hook]: !newValue }));
      }
    }
  }, [hookSettings, globalHooksEnabled]);

  // Rule Logic - 使用真实的 API
  const addRule = useCallback(async (rule: TamperRule) => {
    try {
      await tamperRuleApi.add(rule);
      // 乐观更新：API 调用成功后更新本地状态
      setTamperRules(prev => [...prev, rule]);
    } catch (error) {
      console.error('添加规则失败:', error);
      throw error;
    }
  }, []);

  const updateRule = useCallback(async (id: string, updates: Partial<TamperRule>) => {
    try {
      // 获取当前规则
      const currentRule = tamperRules.find(r => r.id === id);
      if (!currentRule) {
        throw new Error(`规则 ${id} 不存在`);
      }
      
      // 合并更新
      const updatedRule: TamperRule = { ...currentRule, ...updates };
      
      // 调用 API
      await tamperRuleApi.update(updatedRule);
      
      // 乐观更新：API 调用成功后更新本地状态
      setTamperRules(prev => prev.map(r => r.id === id ? updatedRule : r));
    } catch (error) {
      console.error('更新规则失败:', error);
      throw error;
    }
  }, [tamperRules]);

  const deleteRule = useCallback(async (id: string) => {
    try {
      await tamperRuleApi.remove(id);
      // 乐观更新：API 调用成功后更新本地状态
      setTamperRules(prev => prev.filter(r => r.id !== id));
    } catch (error) {
      console.error('删除规则失败:', error);
      throw error;
    }
  }, []);

  // 启用/禁用规则
  const toggleRuleActive = useCallback(async (id: string, active: boolean) => {
    try {
      if (active) {
        await tamperRuleApi.enable(id);
      } else {
        await tamperRuleApi.disable(id);
      }
      // 乐观更新：API 调用成功后更新本地状态
      setTamperRules(prev => prev.map(r => r.id === id ? { ...r, active } : r));
    } catch (error) {
      console.error(`${active ? '启用' : '禁用'}规则失败:`, error);
      throw error;
    }
  }, []);

  // Capture Toggle - 真实实现
  const toggleCapture = useCallback(async () => {
    // 只有在注入成功（INJECTED 或 HOOKED）状态下才能开始/停止抓包
    if (injectionStatus !== InjectionStatus.INJECTED && injectionStatus !== InjectionStatus.HOOKED) return;
    
    const newCapturingState = !isCapturing;
    
    try {
      if (newCapturingState) {
        // 开始抓包：根据当前激活的hook列表，重新发送激活
        console.log('[Capture] 开始捕获，激活 hooks...');
        await applyHookSettings(true);
        await captureApi.start();
        setIsCapturing(true);
        setGlobalHooksEnabled(true);
        setInjectionStatus(InjectionStatus.HOOKED);
        console.log('[Capture] 捕获已开始');
      } else {
        // 停止抓包：根据当前的hook发送关闭
        console.log('[Capture] 停止捕获，停用 hooks...');
        await captureApi.stop();
        await applyHookSettings(false);
        setIsCapturing(false);
        setGlobalHooksEnabled(false);
        setInjectionStatus(InjectionStatus.INJECTED);
        console.log('[Capture] 捕获已停止');
      }
    } catch (error) {
      console.error('切换抓包状态失败:', error);
      // 如果 API 调用失败，保持当前状态不变
    }
  }, [injectionStatus, isCapturing, applyHookSettings]);

  // Clear Packets and Reset Hits
  const clearPackets = useCallback(async () => {
    try {
      await tamperRuleApi.clearAllHits();
      setPackets([]);
      // 乐观更新：API 调用成功后更新本地状态
      setTamperRules(prev => prev.map(r => ({ ...r, hits: 0 })));
    } catch (error) {
      console.error('清空命中计数失败:', error);
      // 即使 API 调用失败，也清空数据包列表
      setPackets([]);
    }
  }, []);

  // Packet Modification
  const updatePacketData = useCallback((id: string, newData: string) => {
    setPackets(prev => prev.map(p => {
      if (p.id !== id) return p;
      const originalData = p.originalData || p.data;
      const formatted = formatHexInput(newData);
      return { 
        ...p, 
        data: formatted, 
        originalData, 
        length: formatted.split(' ').filter(x => x).length 
      };
    }));
  }, []);

  const restorePacket = useCallback((id: string) => {
    setPackets(prev => prev.map(p => {
      if (p.id !== id || !p.originalData) return p;
      return { ...p, data: p.originalData, originalData: undefined, length: p.originalData.split(' ').length };
    }));
  }, []);

  // Filtering Logic
  const filteredPackets = useMemo(() => {
    return packets.filter(p => {
      const matchesProtocol = protocolFilter === 'ALL' || p.protocol === protocolFilter;
      const matchesHook = hookFilter === 'ALL' || p.sourceHook === hookFilter;
      const regex = hexToRegexSpaced(filterText);
      const matchesSearch = p.remoteAddr.includes(filterText) || 
                          (regex ? regex.test(p.data) : p.data.toLowerCase().includes(filterText.toLowerCase()));
      
      // Socket filter - 支持十六进制或十进制
      let matchesSocket = true;
      if (socketFilter.trim()) {
        const filterLower = socketFilter.trim().toLowerCase();
        if (p.socket !== undefined) {
          // 尝试匹配十六进制
          const socketHex = p.socket.toString(16).toLowerCase();
          // 尝试匹配十进制
          const socketDec = p.socket.toString();
          matchesSocket = socketHex.includes(filterLower) || socketDec.includes(filterLower);
        } else {
          matchesSocket = false; // 如果没有 socket 信息，不匹配
        }
      }
      
      return matchesProtocol && matchesHook && matchesSearch && matchesSocket;
    });
  }, [packets, protocolFilter, hookFilter, filterText, socketFilter]);

  return {
    state: {
      processes,
      isRefreshing,
      selectedProcess,
      injectionStatus,
      globalHooksEnabled,
      hookSettings,
      packets,
      isCapturing,
      trafficData,
      tamperRules,
      filteredPackets,
      filters: {
        text: filterText,
        protocol: protocolFilter,
        hook: hookFilter,
        socket: socketFilter
      }
    },
    actions: {
      refreshProcesses,
      selectProcess,
      injectDll,
      toggleSpecificHook,
      toggleCapture,
      clearPackets,
      updatePacketData,
      restorePacket,
      addRule,
      updateRule,
      deleteRule,
      toggleRuleActive,
      setFilterText,
      setProtocolFilter,
      setHookFilter,
      setSocketFilter
    }
  };
};
