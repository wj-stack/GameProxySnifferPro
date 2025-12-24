
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { 
  Activity, 
  ShieldCheck, 
  Settings, 
  Database, 
  Play, 
  Square, 
  Terminal, 
  Search, 
  Filter, 
  Trash2, 
  Cpu, 
  Zap,
  ChevronDown,
  ChevronRight,
  Crosshair,
  Info,
  Copy,
  Hash,
  Type,
  Check,
  RotateCcw,
  BarChart3,
  SearchCode,
  Edit3,
  Save,
  Wand2,
  Plus,
  ArrowRightLeft,
  X,
  History,
  Send,
  Ban,
  Scissors,
  Anchor,
  RefreshCw,
  Power,
  ZapOff,
  GripHorizontal,
  ChevronsDown,
  ChevronsUp
} from 'lucide-react';
import { Packet, TargetProcess, InjectionStatus, Protocol, HookType } from './types';
import { MOCK_PROCESSES, MOCK_PACKETS } from './constants';

interface TamperRule {
  id: string;
  name: string;
  match: string;
  replace: string;
  action: 'REPLACE' | 'BLOCK';
  active: boolean;
  hits: number;
  hook: HookType;
}

type ExtendedPacket = Packet & { 
  originalData?: string; 
  isBlocked?: boolean;
};

const TrafficGraph: React.FC<{ data: number[] }> = ({ data }) => {
  const max = Math.max(...data, 10);
  const points = data.map((v, i) => `${(i / (data.length - 1)) * 100},${100 - (v / max) * 100}`).join(' ');
  return (
    <svg viewBox="0 0 100 100" className="w-full h-12 overflow-visible" preserveAspectRatio="none">
      <defs>
        <linearGradient id="grad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" style={{ stopColor: '#06b6d4', stopOpacity: 0.3 }} />
          <stop offset="100%" style={{ stopColor: '#06b6d4', stopOpacity: 0 }} />
        </linearGradient>
      </defs>
      <polyline fill="url(#grad)" stroke="none" points={`0,100 ${points} 100,100`} />
      <polyline fill="none" stroke="#06b6d4" strokeWidth="2" points={points} strokeLinejoin="round" />
    </svg>
  );
};

const App: React.FC = () => {
  const [processes, setProcesses] = useState<TargetProcess[]>(MOCK_PROCESSES);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedProcess, setSelectedProcess] = useState<TargetProcess | null>(null);
  const [injectionStatus, setInjectionStatus] = useState<InjectionStatus>(InjectionStatus.NONE);
  const [isCapturing, setIsCapturing] = useState(false);
  const [packets, setPackets] = useState<ExtendedPacket[]>([]);
  const [selectedPacketId, setSelectedPacketId] = useState<string | null>(null);
  const [filterText, setFilterText] = useState('');
  const [hexSearchTerm, setHexSearchTerm] = useState('');
  const [protocolFilter, setProtocolFilter] = useState<Protocol | 'ALL'>('ALL');
  const [hookFilter, setHookFilter] = useState<HookType | 'ALL'>('ALL');
  const [showProcessList, setShowProcessList] = useState(false);
  const [hoveredByteIndex, setHoveredByteIndex] = useState<number | null>(null);
  const [trafficData, setTrafficData] = useState<number[]>(new Array(20).fill(0));
  const [replayingId, setReplayingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'HEX' | 'EDIT' | 'RULES'>('HEX');
  
  // Inspector Resizing Logic
  const [inspectorHeight, setInspectorHeight] = useState(400);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const lastHeightRef = useRef(400);
  const containerRef = useRef<HTMLDivElement>(null);

  // Hook settings
  const [globalHooksEnabled, setGlobalHooksEnabled] = useState(false);
  const [hookSettings, setHookSettings] = useState<Record<HookType, boolean>>({
    'send': true, 'recv': true, 'sendto': true, 'recvfrom': true, 'WSASend': true, 'WSARecv': true, 'ALL': true
  });

  const [editBuffer, setEditBuffer] = useState('');
  const [tamperRules, setTamperRules] = useState<TamperRule[]>([
    { id: '1', name: 'Gold Bypass', match: '0F ?? 01', replace: 'FF FF FF', action: 'REPLACE', active: false, hits: 12, hook: 'recv' },
    { id: '2', name: 'Anti-Cheat Heartbeat Block', match: 'DE AD BE EF', replace: '', action: 'BLOCK', active: true, hits: 8, hook: 'send' }
  ]);

  const [newRuleName, setNewRuleName] = useState('');
  const [newRuleMatch, setNewRuleMatch] = useState('');
  const [newRuleReplace, setNewRuleReplace] = useState('');
  const [newRuleAction, setNewRuleAction] = useState<'REPLACE' | 'BLOCK'>('REPLACE');
  const [newRuleHook, setNewRuleHook] = useState<HookType>('ALL');
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);

  const [selectionStart, setSelectionStart] = useState<number | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<number | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);

  // Smooth Resizing Logic
  // Fix: Changed handleMouseDown to handlePointerDown and updated event type to React.PointerEvent
  // to access pointerId which is not available on React.MouseEvent but required for setPointerCapture.
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId); // pointerId is available on PointerEvent
    setIsResizing(true);
    document.body.classList.add('resizing');
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    const target = e.currentTarget as HTMLElement;
    target.releasePointerCapture(e.pointerId);
    setIsResizing(false);
    document.body.classList.remove('resizing');
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isResizing) return;

    // 关键修正：减去 Footer 的高度 (h-6 = 24px) 确保计算基准准确
    const footerHeight = 24; 
    const newHeight = window.innerHeight - e.clientY - footerHeight;
    const minHeight = 40; // 面板标题栏高度
    const maxHeight = window.innerHeight * 0.85;

    if (newHeight <= minHeight + 10) {
      setInspectorHeight(minHeight);
      setIsCollapsed(true);
    } else {
      const boundedHeight = Math.min(newHeight, maxHeight);
      setInspectorHeight(boundedHeight);
      setIsCollapsed(false);
      lastHeightRef.current = boundedHeight;
    }
  }, [isResizing]);

  const toggleCollapse = useCallback(() => {
    if (isCollapsed) {
      setInspectorHeight(lastHeightRef.current);
      setIsCollapsed(false);
    } else {
      lastHeightRef.current = inspectorHeight;
      setInspectorHeight(40);
      setIsCollapsed(true);
    }
  }, [isCollapsed, inspectorHeight]);

  // Data refreshing
  useEffect(() => {
    const interval = setInterval(() => {
      setTrafficData(prev => [...prev.slice(1), Math.floor(Math.random() * 20)]);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleRefreshProcesses = useCallback(() => {
    setIsRefreshing(true);
    setTimeout(() => {
      const shuffled = [...MOCK_PROCESSES].sort(() => Math.random() - 0.5);
      setProcesses(shuffled);
      setIsRefreshing(false);
    }, 800);
  }, []);

  const formatHexInput = (val: string) => {
    const cleaned = val.toUpperCase().replace(/[^0-9A-F?]/g, '');
    const chunks = cleaned.match(/.{1,2}/g) || [];
    return chunks.join(' ');
  };

  const hexToRegexSpaced = useCallback((pattern: string) => {
    const cleaned = pattern.toUpperCase().replace(/[^0-9A-F?]/g, '');
    if (!cleaned) return null;
    const chunks = cleaned.match(/.{1,2}/g) || [];
    const regexParts = chunks.map(chunk => chunk.replace(/\?/g, '[0-9A-F]'));
    const regexStr = regexParts.join('\\s+');
    try { return new RegExp(regexStr, 'i'); } catch (e) { return null; }
  }, []);

  const filteredPackets = useMemo(() => {
    return packets.filter(p => {
      const matchesProtocol = protocolFilter === 'ALL' || p.protocol === protocolFilter;
      const matchesHook = hookFilter === 'ALL' || p.sourceHook === hookFilter;
      const regex = hexToRegexSpaced(filterText);
      const matchesSearch = p.remoteAddr.includes(filterText) || 
                          (regex ? regex.test(p.data) : p.data.toLowerCase().includes(filterText.toLowerCase()));
      return matchesProtocol && matchesHook && matchesSearch;
    });
  }, [packets, protocolFilter, hookFilter, filterText, hexToRegexSpaced]);

  const selectedPacket = useMemo(() => packets.find(p => p.id === selectedPacketId), [packets, selectedPacketId]);

  useEffect(() => { if (selectedPacket) setEditBuffer(selectedPacket.data); }, [selectedPacketId]);

  const handleInject = () => {
    if (!selectedProcess) return;
    setInjectionStatus(InjectionStatus.INJECTING);
    setTimeout(() => setInjectionStatus(InjectionStatus.INJECTED), 1500);
  };

  const toggleGlobalHooks = () => {
    if (injectionStatus !== InjectionStatus.INJECTED && injectionStatus !== InjectionStatus.HOOKED) return;
    if (!globalHooksEnabled) {
      setInjectionStatus(InjectionStatus.HOOKED);
      setGlobalHooksEnabled(true);
    } else {
      setGlobalHooksEnabled(false);
      setIsCapturing(false);
      setInjectionStatus(InjectionStatus.INJECTED);
    }
  };

  const toggleSpecificHook = (hook: HookType) => setHookSettings(prev => ({ ...prev, [hook]: !prev[hook] }));

  const handleReplay = (pkt: Packet) => {
    if (!globalHooksEnabled || injectionStatus !== InjectionStatus.HOOKED) return;
    setReplayingId(pkt.id);
    setTimeout(() => setReplayingId(null), 600);
  };

  const handleReplace = (id: string, newData: string) => {
    setPackets(prev => prev.map(p => {
      if (p.id !== id) return p;
      const originalData = p.originalData || p.data;
      const formatted = formatHexInput(newData);
      return { ...p, data: formatted, originalData, length: formatted.split(' ').filter(x => x).length };
    }));
    setActiveTab('HEX');
  };

  const restorePacket = (id: string) => {
    setPackets(prev => prev.map(p => {
      if (p.id !== id || !p.originalData) return p;
      return { ...p, data: p.originalData, originalData: undefined, length: p.originalData.split(' ').length };
    }));
  };

  const handleRegisterRule = () => {
    if (!newRuleName || !newRuleMatch) return;
    const formattedMatch = formatHexInput(newRuleMatch);
    const formattedReplace = newRuleAction === 'REPLACE' ? formatHexInput(newRuleReplace) : '';
    if (editingRuleId) {
      setTamperRules(prev => prev.map(r => r.id === editingRuleId ? { ...r, name: newRuleName, match: formattedMatch, replace: formattedReplace, action: newRuleAction, hook: newRuleHook } : r));
      setEditingRuleId(null);
    } else {
      setTamperRules(prev => [...prev, { id: Math.random().toString(36).substr(2, 9), name: newRuleName, match: formattedMatch, replace: formattedReplace, action: newRuleAction, active: true, hits: 0, hook: newRuleHook }]);
    }
    setNewRuleName(''); setNewRuleMatch(''); setNewRuleReplace(''); setNewRuleAction('REPLACE'); setNewRuleHook('ALL');
  };

  const startEditRule = (rule: TamperRule) => {
    setEditingRuleId(rule.id); setNewRuleName(rule.name); setNewRuleMatch(rule.match); setNewRuleReplace(rule.replace); setNewRuleAction(rule.action); setNewRuleHook(rule.hook);
  };

  const toggleCapture = () => {
    if (!globalHooksEnabled || injectionStatus !== InjectionStatus.HOOKED) return;
    setIsCapturing(!isCapturing);
    if (!isCapturing && packets.length === 0) {
      const hitUpdates: Record<string, number> = {};
      const simulatedPackets = MOCK_PACKETS.filter(p => hookSettings[p.sourceHook as HookType] !== false).map(p => {
        let pkt = { ...p } as ExtendedPacket;
        for (const rule of tamperRules.filter(r => r.active)) {
          if (rule.hook !== 'ALL' && rule.hook !== pkt.sourceHook) continue;
          const matchRegex = hexToRegexSpaced(rule.match);
          if (matchRegex && matchRegex.test(pkt.data)) {
            hitUpdates[rule.id] = (hitUpdates[rule.id] || 0) + 1;
            if (rule.action === 'BLOCK') { pkt.isBlocked = true; break; }
            else { pkt.originalData = pkt.data; const m = pkt.data.match(matchRegex); if (m) pkt.data = pkt.data.replace(m[0], rule.replace); pkt.length = pkt.data.split(' ').length; }
          }
        }
        return pkt;
      });
      setTamperRules(prev => prev.map(r => ({ ...r, hits: r.hits + (hitUpdates[r.id] || 0) })));
      setPackets(simulatedPackets);
    }
  };

  const hexLines = useMemo(() => {
    if (!selectedPacket) return [];
    const bytes = selectedPacket.data.split(' ');
    const lines = [];
    for (let i = 0; i < bytes.length; i += 16) lines.push(bytes.slice(i, i + 16));
    return lines;
  }, [selectedPacket]);

  const startSelection = (index: number) => { setSelectionStart(index); setSelectionEnd(index); setIsSelecting(true); };
  const updateSelection = (index: number) => { setHoveredByteIndex(index); if (isSelecting) setSelectionEnd(index); };
  const endSelection = useCallback(() => setIsSelecting(false), []);
  useEffect(() => { window.addEventListener('mouseup', endSelection); return () => window.removeEventListener('mouseup', endSelection); }, [endSelection]);

  const isByteModified = (index: number) => {
    if (!selectedPacket || !selectedPacket.originalData) return false;
    const orig = selectedPacket.originalData.split(' ');
    const curr = selectedPacket.data.split(' ');
    return orig[index] && curr[index] && orig[index].toLowerCase() !== curr[index].toLowerCase();
  };

  const selectionRange = useMemo(() => {
    if (selectionStart === null || selectionEnd === null) return null;
    return { start: Math.min(selectionStart, selectionEnd), end: Math.max(selectionStart, selectionEnd) };
  }, [selectionStart, selectionEnd]);

  const isByteSelected = useCallback((idx: number) => selectionRange ? idx >= selectionRange.start && idx <= selectionRange.end : false, [selectionRange]);

  const selectedBytes = useMemo(() => selectedPacket && selectionRange ? selectedPacket.data.split(' ').slice(selectionRange.start, selectionRange.end + 1) : [], [selectedPacket, selectionRange]);

  const interpretation = useMemo(() => {
    if (selectedBytes.length === 0) return null;
    const buffer = new Uint8Array(selectedBytes.map(b => parseInt(b, 16)));
    const view = new DataView(buffer.buffer);
    const results = [];
    try {
      if (buffer.length >= 1) results.push({ label: 'Int8', val: view.getInt8(0) });
      if (buffer.length >= 2) results.push({ label: 'Int16 (LE)', val: view.getInt16(0, true) });
      if (buffer.length >= 4) {
        results.push({ label: 'Int32 (LE)', val: view.getInt32(0, true) });
        results.push({ label: 'Float32 (LE)', val: view.getFloat32(0, true).toFixed(4) });
      }
    } catch (e) {}
    return results;
  }, [selectedBytes]);

  return (
    <div className={`flex h-screen flex-col overflow-hidden select-none bg-slate-950 text-slate-200 ${isResizing ? 'cursor-ns-resize' : ''}`}>
      <style>{`
        body.resizing * {
          transition: none !important;
          pointer-events: none !important;
        }
        body.resizing .resizer-handle {
          pointer-events: all !important;
        }
      `}</style>

      <header className="h-14 bg-slate-950 border-b border-slate-800 flex items-center justify-between px-4 z-50 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="bg-cyan-500/10 p-1.5 rounded-lg"><Activity className="w-6 h-6 text-cyan-500" /></div>
          <div>
            <h1 className="font-bold text-lg leading-none tracking-tight">GameProxy <span className="text-cyan-500 font-mono italic">Sniffer Pro</span></h1>
            <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">Interception Engine v4.0.0-Beta</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className={`px-3 py-1.5 rounded bg-slate-900 border border-slate-800 text-xs font-mono flex gap-2 items-center ${globalHooksEnabled ? 'text-emerald-400' : 'text-slate-500'}`}>
            <div className={`w-1.5 h-1.5 rounded-full ${globalHooksEnabled ? 'bg-emerald-500 shadow-[0_0_8px_#10b981]' : 'bg-slate-700'}`} />
            {globalHooksEnabled ? 'SYSTEM SECURE: HOOKED' : injectionStatus === 'INJECTED' ? 'READY TO HOOK' : 'DLL NOT FOUND'}
          </div>
          <div className="flex gap-2">
            <button onClick={handleInject} disabled={injectionStatus !== InjectionStatus.NONE} className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-2 ${injectionStatus === InjectionStatus.INJECTED || injectionStatus === InjectionStatus.HOOKED ? 'bg-slate-800 text-slate-400 cursor-default' : 'bg-cyan-600 hover:bg-cyan-500 text-white'}`}><ShieldCheck className="w-4 h-4" />{injectionStatus === 'INJECTED' || injectionStatus === 'HOOKED' ? 'DLL INJECTED' : 'INJECT DLL'}</button>
            <button onClick={toggleGlobalHooks} disabled={injectionStatus === InjectionStatus.NONE} className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-2 border ${globalHooksEnabled ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30' : 'bg-amber-600 text-white'}`}><Power className="w-4 h-4" />{globalHooksEnabled ? 'ENGAGED' : 'ACTIVATE HOOKS'}</button>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-64 bg-slate-900/50 border-r border-slate-800 flex flex-col p-4 gap-6">
          <section>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">Target Process</label>
              <button onClick={handleRefreshProcesses} className={`p-1 hover:bg-slate-800 rounded ${isRefreshing ? 'animate-spin text-cyan-400' : 'text-slate-600'}`}><RefreshCw className="w-3 h-3" /></button>
            </div>
            <button onClick={() => setShowProcessList(!showProcessList)} className={`w-full bg-slate-950 border p-2.5 rounded flex items-center justify-between text-xs transition-colors ${selectedProcess ? 'border-cyan-500/50' : 'border-slate-800'}`}>
              <div className="flex items-center gap-2 truncate"><Crosshair className="w-3.5 h-3.5" /><span>{selectedProcess ? selectedProcess.name : 'Select Process...'}</span></div>
              <ChevronDown className={`w-3.5 h-3.5 ${showProcessList ? 'rotate-180' : ''}`} />
            </button>
            {showProcessList && (
              <div className="mt-1 bg-slate-900 border border-slate-800 rounded py-1 max-h-60 overflow-y-auto">
                {processes.map(proc => (<button key={proc.pid} onClick={() => { setSelectedProcess(proc); setShowProcessList(false); }} className="w-full px-3 py-2 text-left hover:bg-slate-800"><span className="text-xs block text-slate-200">{proc.name}</span><span className="text-[9px] text-slate-500 font-mono">PID: {proc.pid}</span></button>))}
              </div>
            )}
          </section>

          <section>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-2">API Hooks</label>
            <div className="space-y-1">
              {['WSAConnect', 'send', 'recv', 'sendto', 'recvfrom'].map(hook => (
                <div key={hook} onClick={() => toggleSpecificHook(hook as HookType)} className={`flex items-center justify-between text-[11px] font-mono p-1 px-2 rounded border cursor-pointer ${hookSettings[hook as HookType] !== false ? 'bg-slate-950/50 border-slate-800/50' : 'bg-slate-900 border-slate-800 opacity-40'}`}>
                   <span>{hook}</span>
                   <div className={`w-2 h-2 rounded-full ${globalHooksEnabled && hookSettings[hook as HookType] !== false ? 'bg-emerald-500 shadow-[0_0_5px_#10b981]' : 'bg-slate-800'}`} />
                </div>
              ))}
            </div>
          </section>

          <section className="flex-1 flex flex-col justify-end">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-2">Visualizer</label>
            <div className="bg-slate-950 border border-slate-800 rounded p-2 mb-4"><TrafficGraph data={trafficData} /></div>
          </section>
        </aside>

        <main className="flex-1 flex flex-col overflow-hidden bg-slate-950 relative">
          <div className="h-12 border-b border-slate-800 flex items-center justify-between px-4 bg-slate-900/30">
            <div className="flex items-center gap-3">
              <button onClick={toggleCapture} disabled={!globalHooksEnabled} className={`p-1.5 rounded ${isCapturing ? 'text-rose-400' : 'text-emerald-400'}`}>{isCapturing ? <Square className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current" />}</button>
              <button onClick={() => setPackets([])} className="p-1.5 text-slate-500 hover:text-white"><Trash2 className="w-5 h-5" /></button>
            </div>
            <div className="flex gap-1 items-center">
              {(['ALL', 'TCP', 'UDP'] as const).map(p => (<button key={p} onClick={() => setProtocolFilter(p)} className={`px-2 py-0.5 rounded text-[10px] font-bold ${protocolFilter === p ? 'bg-cyan-600/20 text-cyan-400 border border-cyan-500/30' : 'text-slate-500'}`}>{p}</button>))}
            </div>
            <div className="flex items-center gap-3">
              <div className="relative"><Search className="absolute left-2 top-2 w-3.5 h-3.5 text-slate-600" /><input type="text" placeholder="Filter hex..." value={filterText} onChange={e => setFilterText(e.target.value)} className="bg-slate-950 border border-slate-800 rounded py-1 pl-7 pr-3 text-xs focus:border-cyan-500 outline-none w-48 font-mono" /></div>
            </div>
          </div>

          <div className="flex-1 overflow-auto">
            <table className="w-full border-collapse text-left font-mono text-xs">
              <thead className="sticky top-0 bg-slate-900 text-slate-500 uppercase text-[10px] border-b border-slate-800 z-10">
                <tr><th className="px-4 py-2 w-16 text-center">#</th><th className="px-4 py-2 w-16 text-center">DIR</th><th className="px-4 py-2 w-32">ADDR</th><th className="px-4 py-2 w-16 text-right">LEN</th><th className="px-4 py-2">HEX STREAM</th><th className="px-4 py-2 w-24 text-center">HOOK</th></tr>
              </thead>
              <tbody>
                {filteredPackets.map((pkt, idx) => (
                  <tr key={pkt.id} onClick={() => setSelectedPacketId(pkt.id)} className={`cursor-pointer border-b border-slate-900/50 ${selectedPacketId === pkt.id ? 'bg-cyan-600/20 text-cyan-100' : 'hover:bg-slate-900/40 text-slate-400'}`}>
                    <td className="px-4 py-1.5 text-center">{idx + 1}</td>
                    <td className="px-4 py-1.5 text-center">{pkt.direction === 'IN' ? '←' : '→'}</td>
                    <td className="px-4 py-1.5">{pkt.remoteAddr}</td>
                    <td className="px-4 py-1.5 text-right font-bold">{pkt.length}</td>
                    <td className="px-4 py-1.5 truncate max-w-lg opacity-60 font-mono">{pkt.data}</td>
                    <td className="px-4 py-1.5 text-center text-[10px] uppercase text-slate-500">{pkt.sourceHook}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* RE-ENGINEERED INSPECTOR PANEL */}
          <div 
            className="border-t border-slate-800 bg-slate-950 flex flex-col shadow-2xl relative"
            style={{ 
              height: `${inspectorHeight}px`,
              transition: isResizing ? 'none' : 'height 250ms cubic-bezier(0.16, 1, 0.3, 1)'
            }}
          >
            {/* Optimized Resizer Handle */}
            <div 
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              className="resizer-handle absolute -top-1 left-0 right-0 h-2 cursor-ns-resize z-[100] group flex items-center justify-center bg-transparent"
            >
               <div className="w-20 h-0.5 bg-slate-800 group-hover:bg-cyan-500 transition-colors rounded-full" />
            </div>

            <div className="h-10 bg-slate-900/50 border-b border-slate-800 flex items-center px-4 justify-between select-none">
              <div className="flex h-full">
                {(['HEX', 'EDIT', 'RULES'] as const).map(tab => (
                  <button key={tab} onClick={() => { setActiveTab(tab); if(isCollapsed) toggleCollapse(); }} className={`px-4 h-full flex items-center gap-2 text-[10px] font-bold uppercase transition-all border-b-2 ${activeTab === tab ? 'border-cyan-500 text-cyan-400 bg-cyan-500/5' : 'border-transparent text-slate-500 hover:text-slate-300'}`}>
                    {tab} INSPECTOR
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-4">
                 <button onClick={toggleCollapse} className="p-1 hover:bg-slate-800 rounded text-slate-500 transition-colors">
                   {isCollapsed ? <ChevronsUp className="w-4 h-4" /> : <ChevronsDown className="w-4 h-4" />}
                 </button>
              </div>
            </div>

            {!isCollapsed && (
              <div className="flex-1 overflow-hidden p-4">
                {activeTab === 'HEX' && (
                  <div className="h-full overflow-y-auto font-mono text-[13px] leading-relaxed scrollbar-thin">
                    {selectedPacket ? (
                      <div className="flex gap-8 min-w-max pb-8">
                        <div className="flex flex-col gap-1">
                          {hexLines.map((line, lIdx) => (
                            <div key={lIdx} className="flex gap-4 items-center h-6">
                              <span className="text-slate-700 w-16 text-right font-bold pr-2 border-r border-slate-800">{(lIdx * 16).toString(16).padStart(4, '0').toUpperCase()}</span>
                              <div className="grid grid-cols-16 gap-x-2">
                                {line.map((byte, bIdx) => {
                                  const gIdx = lIdx * 16 + bIdx;
                                  return (
                                    <span key={bIdx} 
                                      onMouseDown={() => startSelection(gIdx)}
                                      onMouseEnter={() => updateSelection(gIdx)}
                                      className={`px-1 rounded cursor-crosshair text-center transition-colors w-6 ${isByteSelected(gIdx) ? 'bg-cyan-500 text-white' : isByteModified(gIdx) ? 'bg-purple-500/40 text-purple-200' : 'text-slate-300'}`}>
                                      {byte.toUpperCase()}
                                    </span>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="flex flex-col gap-1 border-l border-slate-800 pl-4 opacity-40">
                          {hexLines.map((line, lIdx) => (
                            <div key={lIdx} className="flex h-6 items-center">
                              {line.map((byte, bIdx) => {
                                const char = parseInt(byte, 16) >= 32 && parseInt(byte, 16) <= 126 ? String.fromCharCode(parseInt(byte, 16)) : '.';
                                return <span key={bIdx} className={`w-[1.2ch] text-center ${isByteSelected(lIdx*16+bIdx) ? 'text-cyan-400 font-bold bg-cyan-900/20' : ''}`}>{char}</span>;
                              })}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : <div className="h-full flex flex-center text-slate-800 uppercase text-[10px] font-bold">Select packet to inspect</div>}
                  </div>
                )}
                {activeTab === 'EDIT' && (
                  <div className="h-full flex flex-col gap-4">
                    <textarea value={editBuffer} onChange={e => setEditBuffer(e.target.value)} className="flex-1 bg-slate-900 border border-slate-800 rounded p-4 font-mono text-sm text-purple-300 focus:border-purple-500 outline-none resize-none" placeholder="HEX pairs..."/>
                    <div className="flex justify-end gap-2">
                       <button onClick={() => setEditBuffer(selectedPacket?.data || '')} className="px-4 py-2 text-xs font-bold text-slate-500">Reset</button>
                       <button onClick={() => handleReplace(selectedPacketId!, editBuffer)} className="bg-purple-600 hover:bg-purple-500 px-6 py-2 rounded text-xs font-bold text-white">Apply Tamper</button>
                    </div>
                  </div>
                )}
                {activeTab === 'RULES' && (
                   <div className="h-full grid grid-cols-2 gap-8 overflow-auto">
                      <div className="space-y-3">
                         <div className="text-[10px] font-bold text-slate-500 uppercase">Logic Engine</div>
                         {tamperRules.map(r => (
                           <div key={r.id} onClick={() => startEditRule(r)} className={`p-4 rounded border cursor-pointer ${r.active ? 'bg-purple-500/10 border-purple-500/40' : 'bg-slate-900/50 border-slate-800'}`}>
                             <div className="flex justify-between items-center"><span className="text-xs font-bold">{r.name}</span><span className="text-[10px] font-bold text-slate-600">{r.hits} Hits</span></div>
                           </div>
                         ))}
                      </div>
                      <div className="space-y-3 pl-8 border-l border-slate-800/50">
                         <div className="text-[10px] font-bold text-slate-500 uppercase">New Rule</div>
                         <input type="text" placeholder="Rule name" value={newRuleName} onChange={e => setNewRuleName(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-xs outline-none focus:border-cyan-500"/>
                         <input type="text" placeholder="Match hex" value={newRuleMatch} onChange={e => setNewRuleMatch(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-xs font-mono outline-none focus:border-cyan-500"/>
                         <button onClick={handleRegisterRule} className="w-full bg-cyan-600 hover:bg-cyan-500 py-2 rounded text-xs font-bold text-white transition-all">Register Hook</button>
                      </div>
                   </div>
                )}
              </div>
            )}
          </div>
        </main>
      </div>

      <footer className="h-6 bg-slate-950 border-t border-slate-800 flex items-center justify-between px-3 text-[10px] text-slate-600 uppercase font-bold tracking-tighter">
        <div className="flex gap-6">
          <div className="flex items-center gap-1.5"><div className={`w-1.5 h-1.5 rounded-full ${globalHooksEnabled ? 'bg-emerald-500 shadow-[0_0_5px_#10b981]' : 'bg-slate-800'}`} /> ENGINE: <span className="text-slate-400">{globalHooksEnabled ? 'HOOKED' : 'IDLE'}</span></div>
          <div className="flex items-center gap-1.5"><div className={`w-1.5 h-1.5 rounded-full ${isCapturing ? 'bg-purple-500 animate-pulse' : 'bg-slate-800'}`} /> SNIFF: <span className="text-slate-400">{isCapturing ? 'ACTIVE' : 'READY'}</span></div>
        </div>
        <div>PRO EDITION v4.0.0-BETA</div>
      </footer>
    </div>
  );
};

export default App;
