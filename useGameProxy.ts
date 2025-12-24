
import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { TargetProcess, InjectionStatus, HookType, ExtendedPacket, TamperRule, Protocol } from './types';
import { MOCK_PROCESSES, MOCK_PACKETS } from './constants';
import { formatHexInput, hexToRegexSpaced } from './utils';

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

  // Hook Config
  const [globalHooksEnabled, setGlobalHooksEnabled] = useState(false);
  const [hookSettings, setHookSettings] = useState<Record<HookType, boolean>>({
    'send': true, 'recv': true, 'sendto': true, 'recvfrom': true, 'WSASend': true, 'WSARecv': true, 'ALL': true
  });

  // Tamper Rules
  const [tamperRules, setTamperRules] = useState<TamperRule[]>([
    { id: '1', name: 'Gold Bypass', match: '0F ?? 01', replace: 'FF FF FF', action: 'REPLACE', active: false, hits: 0, hook: 'recv' },
    { id: '2', name: 'Anti-Cheat Heartbeat Block', match: 'DE AD BE EF', replace: '', action: 'BLOCK', active: true, hits: 0, hook: 'send' }
  ]);

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

  // Streaming Packet Simulation
  useEffect(() => {
    if (!isCapturing || !globalHooksEnabled || injectionStatus !== InjectionStatus.HOOKED) return;

    const interval = setInterval(() => {
        // 1. Pick a random template
        const template = MOCK_PACKETS[Math.floor(Math.random() * MOCK_PACKETS.length)];
        
        // Check hook filter (from ref)
        if (hookSettingsRef.current[template.sourceHook as HookType] === false) return;

        // Create fresh packet
        const now = new Date();
        const newPacket: ExtendedPacket = {
            ...template,
            id: `pkt-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
            timestamp: now.toLocaleTimeString('en-GB', { hour12: false }) + '.' + now.getMilliseconds().toString().padStart(3, '0'),
        };

        // 2. Apply Rules (from ref)
        let blocked = false;
        let modified = false;
        let originalData = undefined;
        let finalData = newPacket.data;
        const hitUpdates: Record<string, number> = {};

        const activeRules = tamperRulesRef.current.filter(r => r.active);
        
        for (const rule of activeRules) {
            if (rule.hook !== 'ALL' && rule.hook !== newPacket.sourceHook) continue;
            
            const matchRegex = hexToRegexSpaced(rule.match);
            if (!matchRegex) continue;

            if (matchRegex.test(finalData)) {
                hitUpdates[rule.id] = (hitUpdates[rule.id] || 0) + 1;
                newPacket.appliedRuleName = rule.name; // Track the rule name

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

        newPacket.isBlocked = blocked;
        newPacket.data = finalData;
        newPacket.originalData = originalData;
        if (modified) {
             newPacket.length = finalData.split(' ').filter(x => x).length;
        }

        // 3. Update State
        setPackets(prev => {
            const next = [...prev, newPacket]; // Append to end
            if (next.length > 1000) return next.slice(-1000); // Keep last 1000
            return next;
        });

        // Update rule hits
        if (Object.keys(hitUpdates).length > 0) {
            setTamperRules(prev => prev.map(r => 
                hitUpdates[r.id] ? { ...r, hits: r.hits + hitUpdates[r.id] } : r
            ));
        }

    }, 150); // ~6.6 packets/sec

    return () => clearInterval(interval);
  }, [isCapturing, globalHooksEnabled, injectionStatus]);


  // Process Logic
  const refreshProcesses = useCallback(() => {
    setIsRefreshing(true);
    setTimeout(() => {
      const shuffled = [...MOCK_PROCESSES].sort(() => Math.random() - 0.5);
      setProcesses(shuffled);
      setIsRefreshing(false);
    }, 800);
  }, []);

  const selectProcess = useCallback((proc: TargetProcess) => {
    setSelectedProcess(proc);
    setInjectionStatus(InjectionStatus.NONE);
    setGlobalHooksEnabled(false);
    setIsCapturing(false);
    setPackets([]);
  }, []);

  // Injection Logic
  const injectDll = useCallback(() => {
    if (!selectedProcess) return;
    setInjectionStatus(InjectionStatus.INJECTING);
    setTimeout(() => {
      setInjectionStatus(InjectionStatus.INJECTED);
    }, 1500);
  }, [selectedProcess]);

  // Hook Logic
  const toggleGlobalHooks = useCallback(() => {
    if (injectionStatus !== InjectionStatus.INJECTED && injectionStatus !== InjectionStatus.HOOKED) return;
    
    if (!globalHooksEnabled) {
      setInjectionStatus(InjectionStatus.HOOKED);
      setGlobalHooksEnabled(true);
    } else {
      setGlobalHooksEnabled(false);
      setIsCapturing(false);
      setInjectionStatus(InjectionStatus.INJECTED);
    }
  }, [injectionStatus, globalHooksEnabled]);

  const toggleSpecificHook = useCallback((hook: HookType) => {
    setHookSettings(prev => ({ ...prev, [hook]: !prev[hook] }));
  }, []);

  // Rule Logic
  const addRule = useCallback((rule: TamperRule) => {
    setTamperRules(prev => [...prev, rule]);
  }, []);

  const updateRule = useCallback((id: string, updates: Partial<TamperRule>) => {
    setTamperRules(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r));
  }, []);

  const deleteRule = useCallback((id: string) => {
    setTamperRules(prev => prev.filter(r => r.id !== id));
  }, []);

  // Capture Toggle
  const toggleCapture = useCallback(() => {
    if (!globalHooksEnabled || injectionStatus !== InjectionStatus.HOOKED) return;
    setIsCapturing(prev => !prev);
  }, [globalHooksEnabled, injectionStatus]);

  // Clear Packets and Reset Hits
  const clearPackets = useCallback(() => {
    setPackets([]);
    setTamperRules(prev => prev.map(r => ({ ...r, hits: 0 })));
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
      return matchesProtocol && matchesHook && matchesSearch;
    });
  }, [packets, protocolFilter, hookFilter, filterText]);

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
        hook: hookFilter
      }
    },
    actions: {
      refreshProcesses,
      selectProcess,
      injectDll,
      toggleGlobalHooks,
      toggleSpecificHook,
      toggleCapture,
      clearPackets,
      updatePacketData,
      restorePacket,
      addRule,
      updateRule,
      deleteRule,
      setFilterText,
      setProtocolFilter,
      setHookFilter
    }
  };
};
