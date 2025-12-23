
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
  Scissors
} from 'lucide-react';
import { Packet, TargetProcess, InjectionStatus, Protocol } from './types';
import { MOCK_PROCESSES, MOCK_PACKETS } from './constants';

interface TamperRule {
  id: string;
  name: string;
  match: string;
  replace: string;
  action: 'REPLACE' | 'BLOCK';
  active: boolean;
  hits: number;
}

type ExtendedPacket = Packet & { 
  originalData?: string; 
  isBlocked?: boolean;
};

// Simple Sparkline Component
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
  const [selectedProcess, setSelectedProcess] = useState<TargetProcess | null>(null);
  const [injectionStatus, setInjectionStatus] = useState<InjectionStatus>(InjectionStatus.NONE);
  const [isCapturing, setIsCapturing] = useState(false);
  const [packets, setPackets] = useState<ExtendedPacket[]>([]);
  const [selectedPacketId, setSelectedPacketId] = useState<string | null>(null);
  const [filterText, setFilterText] = useState('');
  const [hexSearchTerm, setHexSearchTerm] = useState('');
  const [protocolFilter, setProtocolFilter] = useState<Protocol | 'ALL'>('ALL');
  const [showProcessList, setShowProcessList] = useState(false);
  const [hoveredByteIndex, setHoveredByteIndex] = useState<number | null>(null);
  const [trafficData, setTrafficData] = useState<number[]>(new Array(20).fill(0));
  const [replayingId, setReplayingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'HEX' | 'EDIT' | 'RULES'>('HEX');
  
  // Replacement Logic State
  const [editBuffer, setEditBuffer] = useState('');
  const [tamperRules, setTamperRules] = useState<TamperRule[]>([
    { id: '1', name: 'Gold Bypass', match: '0F 00 01', replace: 'FF FF FF', action: 'REPLACE', active: false, hits: 12 },
    { id: '2', name: 'Anti-Cheat Heartbeat Block', match: 'DE AD BE EF', replace: '', action: 'BLOCK', active: true, hits: 8 }
  ]);

  // Form states for new/editing rules
  const [newRuleName, setNewRuleName] = useState('');
  const [newRuleMatch, setNewRuleMatch] = useState('');
  const [newRuleReplace, setNewRuleReplace] = useState('');
  const [newRuleAction, setNewRuleAction] = useState<'REPLACE' | 'BLOCK'>('REPLACE');
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);

  // Selection states
  const [selectionStart, setSelectionStart] = useState<number | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<number | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      setTrafficData(prev => [...prev.slice(1), Math.floor(Math.random() * 20)]);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const filteredPackets = useMemo(() => {
    return packets.filter(p => {
      const matchesProtocol = protocolFilter === 'ALL' || p.protocol === protocolFilter;
      const matchesSearch = p.remoteAddr.includes(filterText) || 
                          p.data.toLowerCase().includes(filterText.toLowerCase());
      return matchesProtocol && matchesSearch;
    });
  }, [packets, protocolFilter, filterText]);

  const selectedPacket = useMemo(() => 
    packets.find(p => p.id === selectedPacketId), 
  [packets, selectedPacketId]);

  useEffect(() => {
    if (selectedPacket) setEditBuffer(selectedPacket.data);
  }, [selectedPacketId]);

  const handleInject = () => {
    if (!selectedProcess) return;
    setInjectionStatus(InjectionStatus.INJECTING);
    setTimeout(() => {
      setInjectionStatus(InjectionStatus.INJECTED);
      setTimeout(() => setInjectionStatus(InjectionStatus.HOOKED), 1000);
    }, 1500);
  };

  const handleReplay = (pkt: Packet) => {
    if (injectionStatus !== InjectionStatus.HOOKED) return;
    setReplayingId(pkt.id);
    
    // Simulate network delay for replay
    setTimeout(() => {
      setReplayingId(null);
    }, 600);
  };

  const handleReplace = (id: string, newData: string) => {
    setPackets(prev => prev.map(p => {
      if (p.id !== id) return p;
      const originalData = p.originalData || p.data;
      return { 
        ...p, 
        data: newData.toUpperCase().trim(), 
        originalData, 
        length: newData.split(' ').filter(x => x).length 
      };
    }));
    setActiveTab('HEX');
  };

  const restorePacket = (id: string) => {
    setPackets(prev => prev.map(p => {
      if (p.id !== id || !p.originalData) return p;
      return { ...p, data: p.originalData, originalData: undefined, length: p.originalData.split(' ').length };
    }));
  };

  // Rule Handlers
  const formatHexInput = (val: string) => {
    return val.toUpperCase().replace(/[^0-9A-F]/g, '').replace(/(.{2})/g, '$1 ').trim();
  };

  const handleRegisterRule = () => {
    if (!newRuleName || !newRuleMatch) return;
    if (newRuleAction === 'REPLACE' && !newRuleReplace) return;
    
    const formattedMatch = formatHexInput(newRuleMatch);
    const formattedReplace = newRuleAction === 'REPLACE' ? formatHexInput(newRuleReplace) : '';

    if (editingRuleId) {
      setTamperRules(prev => prev.map(r => r.id === editingRuleId ? {
        ...r,
        name: newRuleName,
        match: formattedMatch,
        replace: formattedReplace,
        action: newRuleAction
      } : r));
      setEditingRuleId(null);
    } else {
      const newRule: TamperRule = {
        id: Math.random().toString(36).substr(2, 9),
        name: newRuleName,
        match: formattedMatch,
        replace: formattedReplace,
        action: newRuleAction,
        active: true,
        hits: 0
      };
      setTamperRules(prev => [...prev, newRule]);
    }
    
    setNewRuleName('');
    setNewRuleMatch('');
    setNewRuleReplace('');
    setNewRuleAction('REPLACE');
  };

  const startEditRule = (rule: TamperRule) => {
    setEditingRuleId(rule.id);
    setNewRuleName(rule.name);
    setNewRuleMatch(rule.match);
    setNewRuleReplace(rule.replace);
    setNewRuleAction(rule.action);
  };

  const cancelEditRule = () => {
    setEditingRuleId(null);
    setNewRuleName('');
    setNewRuleMatch('');
    setNewRuleReplace('');
    setNewRuleAction('REPLACE');
  };

  const toggleCapture = () => {
    if (injectionStatus !== InjectionStatus.HOOKED) return;
    setIsCapturing(!isCapturing);
    if (!isCapturing && packets.length === 0) {
      // When starting capture, simulate processing packets through active rules
      const simulatedPackets = MOCK_PACKETS.map(p => {
        let pkt = { ...p } as ExtendedPacket;
        const activeRules = tamperRules.filter(r => r.active);
        
        for (const rule of activeRules) {
          const matchNormalized = rule.match.replace(/\s/g, '').toLowerCase();
          const dataNormalized = pkt.data.replace(/\s/g, '').toLowerCase();
          
          if (dataNormalized.includes(matchNormalized)) {
            rule.hits++;
            if (rule.action === 'BLOCK') {
              pkt.isBlocked = true;
              break; // If blocked, stop further processing
            } else if (rule.action === 'REPLACE') {
              pkt.originalData = pkt.data;
              const replaceNormalized = rule.replace.replace(/\s/g, '').toUpperCase();
              const matchUpper = rule.match.replace(/\s/g, '').toUpperCase();
              const newData = pkt.data.replace(/\s/g, '').toUpperCase().replace(matchUpper, replaceNormalized);
              pkt.data = newData.match(/.{1,2}/g)?.join(' ') || pkt.data;
              pkt.length = pkt.data.split(' ').length;
            }
          }
        }
        return pkt;
      });
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

  const startSelection = (index: number) => {
    setSelectionStart(index);
    setSelectionEnd(index);
    setIsSelecting(true);
  };

  const updateSelection = (index: number) => {
    setHoveredByteIndex(index);
    if (isSelecting) setSelectionEnd(index);
  };

  const endSelection = useCallback(() => setIsSelecting(false), []);

  useEffect(() => {
    window.addEventListener('mouseup', endSelection);
    return () => window.removeEventListener('mouseup', endSelection);
  }, [endSelection]);

  const isByteModified = (index: number) => {
    if (!selectedPacket || !selectedPacket.originalData) return false;
    const orig = selectedPacket.originalData.split(' ');
    const curr = selectedPacket.data.split(' ');
    if (!orig[index] || !curr[index]) return false;
    return orig[index].toLowerCase() !== curr[index].toLowerCase();
  };

  const getOriginalByteValue = (index: number) => {
    if (!selectedPacket || !selectedPacket.originalData) return null;
    const val = selectedPacket.originalData.split(' ')[index];
    return val ? val.toUpperCase() : null;
  };

  const selectionRange = useMemo(() => {
    if (selectionStart === null || selectionEnd === null) return null;
    return { start: Math.min(selectionStart, selectionEnd), end: Math.max(selectionStart, selectionEnd) };
  }, [selectionStart, selectionEnd]);

  const isByteSelected = useCallback((index: number) => {
    if (!selectionRange) return false;
    return index >= selectionRange.start && index <= selectionRange.end;
  }, [selectionRange]);

  const isByteMatchingSearch = useCallback((index: number) => {
    if (!hexSearchTerm || !selectedPacket) return false;
    const normalizedSearch = hexSearchTerm.replace(/\s/g, '').toLowerCase();
    if (!normalizedSearch) return false;
    
    const normalizedData = selectedPacket.data.replace(/\s/g, '').toLowerCase();
    const searchStartIndices: number[] = [];
    let pos = normalizedData.indexOf(normalizedSearch);
    while (pos !== -1) {
      searchStartIndices.push(pos / 2);
      pos = normalizedData.indexOf(normalizedSearch, pos + 1);
    }
    
    const searchByteLen = normalizedSearch.length / 2;
    return searchStartIndices.some(startIdx => 
      index >= startIdx && index < startIdx + searchByteLen
    );
  }, [hexSearchTerm, selectedPacket]);

  const selectedBytes = useMemo(() => {
    if (!selectedPacket || !selectionRange) return [];
    return selectedPacket.data.split(' ').slice(selectionRange.start, selectionRange.end + 1);
  }, [selectedPacket, selectionRange]);

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
    <div className="flex h-screen flex-col overflow-hidden select-none bg-slate-950 text-slate-200">
      {/* Header */}
      <header className="h-14 bg-slate-950 border-b border-slate-800 flex items-center justify-between px-4 z-50 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="bg-cyan-500/10 p-1.5 rounded-lg"><Activity className="w-6 h-6 text-cyan-500" /></div>
          <div>
            <h1 className="font-bold text-lg leading-none tracking-tight">GameProxy <span className="text-cyan-500 font-mono italic">Sniffer Pro</span></h1>
            <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">Interception Engine v4.0.0-Beta</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className={`px-3 py-1.5 rounded bg-slate-900 border border-slate-800 text-xs font-mono flex gap-2 items-center ${injectionStatus === 'HOOKED' ? 'text-emerald-400' : 'text-slate-500'}`}>
            <div className={`w-1.5 h-1.5 rounded-full ${injectionStatus === 'HOOKED' ? 'bg-emerald-500 shadow-[0_0_8px_#10b981]' : 'bg-slate-700'}`} />
            {injectionStatus === 'HOOKED' ? 'SYSTEM SECURE' : injectionStatus === 'NONE' ? 'READY' : injectionStatus}
          </div>
          <button 
            onClick={handleInject} 
            disabled={!selectedProcess || injectionStatus === 'HOOKED' || injectionStatus === 'INJECTING'} 
            className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-2 ${
              injectionStatus === 'HOOKED' 
              ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/30' 
              : !selectedProcess 
              ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
              : 'bg-cyan-600 hover:bg-cyan-500 shadow-lg shadow-cyan-900/20 text-white'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            {injectionStatus === 'HOOKED' ? 'INJECTED' : injectionStatus === 'INJECTING' ? 'INJECTING...' : 'INJECT DLL'}
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar */}
        <aside className="w-64 bg-slate-900/50 border-r border-slate-800 flex flex-col p-4 gap-6">
          <section>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-2">Target Process</label>
            <div className="relative">
              <button 
                onClick={() => setShowProcessList(!showProcessList)} 
                className={`w-full bg-slate-950 border p-2.5 rounded flex items-center justify-between text-xs transition-colors ${selectedProcess ? 'border-cyan-500/50 text-slate-200' : 'border-slate-800 text-slate-500 hover:border-slate-700'}`}
              >
                <div className="flex items-center gap-2 truncate">
                  <Crosshair className={`w-3.5 h-3.5 ${selectedProcess ? 'text-cyan-400' : 'text-slate-600'}`} />
                  <span className="truncate">{selectedProcess ? selectedProcess.name : 'Select Process...'}</span>
                </div>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showProcessList ? 'rotate-180' : ''}`} />
              </button>
              
              {showProcessList && (
                <div className="absolute top-full left-0 w-full mt-1 bg-slate-900 border border-slate-800 rounded shadow-2xl z-[60] py-1 max-h-60 overflow-y-auto">
                  {MOCK_PROCESSES.map(proc => (
                    <button 
                      key={proc.pid} 
                      onClick={() => { setSelectedProcess(proc); setShowProcessList(false); setInjectionStatus(InjectionStatus.NONE); }} 
                      className="w-full px-3 py-2 text-left hover:bg-slate-800 flex flex-col gap-0.5"
                    >
                      <span className="text-xs font-bold text-slate-200">{proc.name}</span>
                      <span className="text-[10px] font-mono text-slate-500">PID: {proc.pid}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-2">Active Hooks</label>
            <div className="space-y-1">
              {['WSAConnect', 'send', 'recv', 'sendto'].map(hook => (
                <div key={hook} className="flex items-center justify-between text-[11px] font-mono p-1 px-2 rounded bg-slate-950/50 border border-slate-800/50">
                   <span className="text-slate-300">{hook}</span>
                   <div className={`w-2 h-2 rounded-full ${injectionStatus === 'HOOKED' ? 'bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.5)]' : 'bg-slate-800'}`} />
                </div>
              ))}
            </div>
          </section>

          <section>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-2">Tamper Rules</label>
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1 scrollbar-thin">
              {tamperRules.map(rule => (
                <div key={rule.id} className={`p-2 rounded border transition-all ${rule.active ? (rule.action === 'BLOCK' ? 'bg-rose-500/10 border-rose-500/50' : 'bg-purple-500/10 border-purple-500/50') : 'bg-slate-950 border-slate-800 opacity-60'}`}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5 truncate">
                      {rule.action === 'BLOCK' ? <Ban className="w-2.5 h-2.5 text-rose-500" /> : <Scissors className="w-2.5 h-2.5 text-purple-500" />}
                      <span className="text-[10px] font-bold truncate">{rule.name}</span>
                    </div>
                    <input type="checkbox" checked={rule.active} onChange={() => setTamperRules(prev => prev.map(r => r.id === rule.id ? {...r, active: !r.active} : r))} className="accent-cyan-500" />
                  </div>
                  <div className="flex items-center justify-between text-[9px] font-mono text-slate-500">
                    <span className={rule.active ? 'text-slate-300' : ''}>{rule.hits} HITS</span>
                    <Settings className="w-3 h-3 cursor-pointer hover:text-white" onClick={() => { setActiveTab('RULES'); startEditRule(rule); }} />
                  </div>
                </div>
              ))}
              <button onClick={() => { setActiveTab('RULES'); cancelEditRule(); }} className="w-full py-1.5 border border-dashed border-slate-700 rounded text-[9px] font-bold uppercase text-slate-500 hover:text-white hover:border-slate-500">
                <Plus className="w-3 h-3 inline mr-1" /> New Intercept Rule
              </button>
            </div>
          </section>

          <section className="flex-1 flex flex-col justify-end">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-2">Load Graph</label>
            <div className="bg-slate-950 border border-slate-800 rounded p-2 mb-4">
              <TrafficGraph data={trafficData} />
            </div>
            <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 space-y-2 font-mono">
               <div className="flex justify-between items-end"><span className="text-[10px] text-slate-500">TOTAL</span><span className="text-xs text-cyan-400 font-bold">{packets.length}</span></div>
               <div className="flex justify-between items-end"><span className="text-[10px] text-slate-500">BLOCKED</span><span className="text-xs text-rose-500 font-bold">{packets.filter(p => p.isBlocked).length}</span></div>
            </div>
          </section>
        </aside>

        {/* Main Content */}
        <main className="flex-1 flex flex-col overflow-hidden bg-slate-950">
          <div className="h-12 border-b border-slate-800 flex items-center justify-between px-4 bg-slate-900/30">
            <div className="flex items-center gap-3">
              <button onClick={toggleCapture} disabled={injectionStatus !== InjectionStatus.HOOKED} className={`p-1.5 rounded transition-all ${isCapturing ? 'text-rose-400 hover:bg-rose-500/10' : 'text-emerald-400 hover:bg-emerald-500/10'} disabled:opacity-20`}>
                {isCapturing ? <Square className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current" />}
              </button>
              <button onClick={() => setPackets([])} className="p-1.5 text-slate-500 hover:text-white"><Trash2 className="w-5 h-5" /></button>
              <div className="w-px h-6 bg-slate-800 mx-1" />
              <div className="flex gap-1">
                {(['ALL', 'TCP', 'UDP'] as const).map(p => (
                  <button key={p} onClick={() => setProtocolFilter(p)} className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${protocolFilter === p ? 'bg-cyan-600/20 text-cyan-400 border border-cyan-500/30' : 'text-slate-500 hover:text-slate-300'}`}>{p}</button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="absolute left-2 top-2 w-3.5 h-3.5 text-slate-600" />
                <input type="text" placeholder="Search data..." value={filterText} onChange={e => setFilterText(e.target.value)} className="bg-slate-950 border border-slate-800 rounded py-1 pl-7 pr-3 text-xs focus:border-cyan-500 outline-none w-32 font-mono" />
              </div>
              {selectedPacketId && (
                <div className="flex gap-2">
                  <button 
                    onClick={() => { const p = packets.find(p => p.id === selectedPacketId); if(p) handleReplay(p); }} 
                    disabled={injectionStatus !== InjectionStatus.HOOKED || selectedPacket?.isBlocked}
                    className={`p-1.5 rounded border transition-all ${replayingId === selectedPacketId ? 'text-amber-500 bg-amber-500/20 animate-pulse' : 'text-amber-400 bg-amber-500/10 border-amber-500/20 hover:bg-amber-500/20'} disabled:opacity-30`}
                    title="Replay Packet"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                  <button onClick={() => setActiveTab('EDIT')} disabled={selectedPacket?.isBlocked} className="p-1.5 text-purple-400 bg-purple-500/10 rounded border border-purple-500/20 hover:bg-purple-500/20 disabled:opacity-30"><Edit3 className="w-4 h-4" /></button>
                  {selectedPacket?.originalData && (
                    <button onClick={() => restorePacket(selectedPacketId)} className="p-1.5 text-amber-400 bg-amber-500/10 rounded border border-amber-500/20 hover:bg-amber-500/20" title="Restore Original"><History className="w-4 h-4" /></button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Packet Table */}
          <div className="flex-1 overflow-auto">
            <table className="w-full border-collapse text-left font-mono text-xs">
              <thead className="sticky top-0 bg-slate-900 text-slate-500 uppercase text-[10px] border-b border-slate-800 z-10">
                <tr>
                  <th className="px-4 py-2 w-16 text-center">#</th>
                  <th className="px-4 py-2 w-16 text-center">DIR</th>
                  <th className="px-4 py-2 w-32">ADDR</th>
                  <th className="px-4 py-2 w-16 text-right">LEN</th>
                  <th className="px-4 py-2">HEX DATA STREAM</th>
                  <th className="px-4 py-2 w-24 text-center">STATUS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-900/50">
                {filteredPackets.map((pkt, idx) => (
                  <tr 
                    key={pkt.id} 
                    onClick={() => setSelectedPacketId(pkt.id)} 
                    className={`cursor-pointer transition-all duration-300 ${selectedPacketId === pkt.id ? 'bg-cyan-600/20 text-cyan-100' : 'hover:bg-slate-900/40 text-slate-400'} ${replayingId === pkt.id ? 'bg-amber-500/30' : ''} ${pkt.isBlocked ? 'opacity-40' : ''}`}
                  >
                    <td className="px-4 py-1.5 text-center flex items-center justify-center gap-2">
                      <span className="text-slate-600">{idx + 1}</span>
                      {pkt.originalData && <span className="text-[8px] bg-purple-500 text-white px-1 rounded font-bold">MOD</span>}
                    </td>
                    <td className="px-4 py-1.5 text-center">{pkt.direction === 'IN' ? <span className="text-emerald-500">←</span> : <span className="text-amber-500">→</span>}</td>
                    <td className="px-4 py-1.5 text-slate-300 truncate max-w-[120px]">{pkt.remoteAddr}</td>
                    <td className="px-4 py-1.5 text-right font-medium">{pkt.length}</td>
                    <td className="px-4 py-1.5 opacity-60 truncate max-w-2xl">
                      {pkt.isBlocked ? <span className="line-through text-rose-500/50">{pkt.data}</span> : pkt.data}
                    </td>
                    <td className="px-4 py-1.5 text-center">
                      {pkt.isBlocked ? (
                        <span className="bg-rose-500/10 text-rose-500 px-1.5 py-0.5 rounded text-[9px] font-bold border border-rose-500/20">BLOCKED</span>
                      ) : (
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleReplay(pkt); }}
                          disabled={injectionStatus !== InjectionStatus.HOOKED}
                          className={`p-1 rounded hover:bg-amber-500/20 transition-all ${replayingId === pkt.id ? 'text-amber-500 animate-spin' : 'text-slate-600 hover:text-amber-400'} disabled:opacity-20`}
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Inspector Tabs */}
          <div className="h-80 border-t border-slate-800 bg-slate-950 flex flex-col shadow-2xl">
            <div className="h-10 bg-slate-900/50 border-b border-slate-800 flex items-center px-4 justify-between">
              <div className="flex h-full">
                {(['HEX', 'EDIT', 'RULES'] as const).map(tab => (
                  <button key={tab} onClick={() => setActiveTab(tab)} className={`px-4 h-full flex items-center gap-2 text-[10px] font-bold uppercase transition-all border-b-2 ${activeTab === tab ? 'border-cyan-500 text-cyan-400 bg-cyan-500/5' : 'border-transparent text-slate-500 hover:text-slate-300'}`}>
                    {tab === 'HEX' && <Zap className="w-3.5 h-3.5" />}
                    {tab === 'EDIT' && <Edit3 className="w-3.5 h-3.5" />}
                    {tab === 'RULES' && <ArrowRightLeft className="w-3.5 h-3.5" />}
                    {tab} Inspector
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-4 text-[10px] font-mono text-slate-500">
                {activeTab === 'HEX' && (
                  <div className="flex items-center gap-2">
                    <SearchCode className="w-3.5 h-3.5" />
                    <input type="text" placeholder="Find pattern (e.g. 0F 00)..." value={hexSearchTerm} onChange={e => setHexSearchTerm(e.target.value)} className="bg-transparent border-none outline-none text-slate-300 w-48" />
                  </div>
                )}
                {selectedPacket && <span>LEN: <span className="text-cyan-500 font-bold">{selectedPacket.length}</span></span>}
              </div>
            </div>

            <div className="flex-1 overflow-hidden">
              {activeTab === 'HEX' ? (
                <div className="h-full flex relative">
                  {selectedPacket?.isBlocked && (
                    <div className="absolute inset-0 bg-rose-500/5 flex items-center justify-center z-10 pointer-events-none">
                      <div className="bg-rose-950 border border-rose-500 text-rose-500 px-6 py-2 rounded-full font-bold uppercase text-lg rotate-12 opacity-50 shadow-2xl">PACKET DROPPED BY RULE</div>
                    </div>
                  )}
                  <div className="flex-1 overflow-auto p-4 font-mono text-[13px] leading-relaxed scrollbar-thin">
                    {selectedPacket ? (
                      <div className="flex gap-8 min-w-max" onMouseLeave={() => setHoveredByteIndex(null)}>
                        <div className="flex flex-col gap-1">
                          {hexLines.map((line, lineIdx) => (
                            <div key={lineIdx} className="flex gap-4 items-center">
                              <div className="text-slate-700 text-right w-16 border-r border-slate-800 pr-3 select-none">{(lineIdx * 16).toString(16).padStart(4, '0').toUpperCase()}</div>
                              <div className="grid grid-cols-16 gap-x-2 text-slate-300">
                                {line.map((byte, byteIdx) => {
                                  const globalIdx = lineIdx * 16 + byteIdx;
                                  const isModified = isByteModified(globalIdx);
                                  const isSelected = isByteSelected(globalIdx);
                                  const isMatching = isByteMatchingSearch(globalIdx);
                                  
                                  return (
                                    <div key={byteIdx} className="relative group/byte">
                                      <span onMouseDown={() => startSelection(globalIdx)} onMouseEnter={() => updateSelection(globalIdx)} 
                                        className={`px-1 rounded cursor-crosshair transition-all block text-center ${
                                          isSelected 
                                          ? 'bg-cyan-500 text-white scale-105 z-10 shadow-[0_0_8px_rgba(6,182,212,0.5)]' 
                                          : isMatching
                                          ? 'bg-amber-500/40 text-amber-100 ring-1 ring-amber-500/50'
                                          : isModified 
                                          ? 'bg-purple-500/30 text-purple-200 ring-1 ring-purple-500/50' 
                                          : byteIdx < 8 ? 'bg-slate-900/40' : ''
                                        } ${selectedPacket.isBlocked ? 'opacity-40 grayscale' : ''}`}>
                                        {byte.toUpperCase()}
                                      </span>
                                      {isModified && (
                                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 bg-slate-800 text-purple-300 text-[9px] px-1 rounded shadow-lg hidden group-hover/byte:block whitespace-nowrap z-50 pointer-events-none mb-1 border border-purple-500/20">
                                          Original: {getOriginalByteValue(globalIdx)}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="flex flex-col gap-1 border-l border-slate-800 pl-4 select-none opacity-50">
                          {hexLines.map((line, lineIdx) => (
                            <div key={lineIdx} className="text-slate-600 flex">
                              {line.map((byte, byteIdx) => {
                                const globalIdx = lineIdx * 16 + byteIdx;
                                const char = parseInt(byte, 16) >= 32 && parseInt(byte, 16) <= 126 ? String.fromCharCode(parseInt(byte, 16)) : '.';
                                const isSel = isByteSelected(globalIdx);
                                const isMatch = isByteMatchingSearch(globalIdx);
                                return <span key={byteIdx} className={`inline-block w-[1.1ch] text-center ${isSel ? 'text-cyan-400 font-bold bg-cyan-500/20' : isMatch ? 'text-amber-400 font-bold bg-amber-500/20' : ''}`}>{char}</span>;
                              })}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : <div className="h-full flex items-center justify-center text-slate-800 font-bold uppercase text-[10px]">Select a packet stream</div>}
                  </div>
                  {interpretation && (
                    <div className="w-56 border-l border-slate-800 bg-slate-900/20 p-4">
                      <div className="flex items-center gap-2 mb-4 text-[10px] font-bold text-slate-600 uppercase tracking-widest"><BarChart3 className="w-3.5 h-3.5" /> Interpreter</div>
                      <div className="space-y-3">
                        {interpretation.map((item, i) => (
                          <div key={i} className="flex flex-col border-b border-slate-800/30 pb-1.5 last:border-0">
                            <span className="text-[9px] text-slate-500 font-bold uppercase">{item.label}</span>
                            <span className="text-xs font-mono text-cyan-400">{item.val}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : activeTab === 'EDIT' ? (
                <div className="h-full flex flex-col p-4 gap-4 bg-slate-950">
                  <div className="flex-1 flex flex-col gap-2">
                     <div className="flex justify-between items-center text-[10px] font-bold">
                       <span className="text-purple-400 uppercase tracking-widest">Buffer Tamper Point</span>
                       <span className="text-slate-600">Enter HEX pairs separated by spaces</span>
                     </div>
                     <textarea 
                      value={editBuffer} 
                      onChange={e => setEditBuffer(e.target.value)} 
                      disabled={selectedPacket?.isBlocked}
                      className="flex-1 bg-slate-900 border border-slate-800 rounded p-4 font-mono text-sm text-purple-300 focus:border-purple-500 outline-none resize-none scrollbar-thin disabled:opacity-20 disabled:cursor-not-allowed"
                      placeholder="e.g. 00 1F 3A ..."
                     />
                  </div>
                  <div className="flex justify-between items-center">
                    <div className="flex gap-2">
                       <button onClick={() => setEditBuffer(selectedPacket?.data || '')} className="px-3 py-1.5 text-[10px] font-bold text-slate-500 hover:text-slate-300 uppercase">Reset</button>
                       <button onClick={() => setEditBuffer(prev => prev.replace(/[^0-9a-fA-F]/g, '').match(/.{1,2}/g)?.join(' ') || '')} className="px-3 py-1.5 text-[10px] font-bold text-cyan-500/70 hover:text-cyan-400 uppercase flex items-center gap-1"><Wand2 className="w-3 h-3"/> Format</button>
                    </div>
                    <button onClick={() => handleReplace(selectedPacketId!, editBuffer)} disabled={!selectedPacketId || selectedPacket?.isBlocked} className="flex items-center gap-2 bg-purple-600 hover:bg-purple-500 text-white px-6 py-2 rounded text-xs font-bold shadow-lg shadow-purple-900/20 transition-all disabled:opacity-30">
                      <Save className="w-4 h-4" /> COMMIT TAMPER TO SOCKET
                    </button>
                  </div>
                </div>
              ) : (
                <div className="h-full p-6 overflow-auto bg-slate-950 grid grid-cols-2 gap-6">
                   <div className="flex flex-col gap-4">
                     <div className="flex items-center justify-between">
                       <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2"><ArrowRightLeft className="w-4 h-4" /> Configured Rules</h3>
                       <span className="text-[10px] text-slate-600 uppercase font-mono">{tamperRules.length} Registered</span>
                     </div>
                     <div className="space-y-2 max-h-[220px] overflow-y-auto scrollbar-thin pr-2">
                        {tamperRules.map(rule => (
                          <div key={rule.id} className={`p-4 rounded-lg border flex items-center justify-between group transition-all ${rule.active ? (rule.action === 'BLOCK' ? 'bg-rose-500/10 border-rose-500/30' : 'bg-purple-500/10 border-purple-500/30') : 'bg-slate-900/50 border-slate-800'}`}>
                             <div className="flex flex-col gap-1 flex-1 cursor-pointer" onClick={() => startEditRule(rule)}>
                               <span className="text-xs font-bold text-slate-100 flex items-center gap-2">
                                 {rule.action === 'BLOCK' ? <Ban className="w-3.5 h-3.5 text-rose-500" /> : <Scissors className="w-3.5 h-3.5 text-purple-500" />}
                                 {rule.name}
                                 {editingRuleId === rule.id && <span className="text-[8px] bg-cyan-500 text-white px-1 rounded">EDITING</span>}
                               </span>
                               <div className="flex items-center gap-2 text-[10px] font-mono text-slate-500">
                                  <span className="bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800">M: {rule.match}</span>
                                  {rule.action === 'REPLACE' && (
                                    <>
                                      <ChevronRight className="w-3 h-3" />
                                      <span className="bg-purple-950/40 px-1.5 py-0.5 rounded border border-purple-500/30 text-purple-300">R: {rule.replace}</span>
                                    </>
                                  )}
                                  {rule.action === 'BLOCK' && (
                                    <span className="text-rose-500 font-bold ml-2">DROP PACKET</span>
                                  )}
                               </div>
                             </div>
                             <div className="flex items-center gap-4">
                               <div className="text-[10px] font-bold text-slate-600">{rule.hits} HITS</div>
                               <button 
                                onClick={(e) => { e.stopPropagation(); setTamperRules(prev => prev.filter(r => r.id !== rule.id)); if(editingRuleId === rule.id) cancelEditRule(); }} 
                                className="text-slate-700 hover:text-rose-500 transition-colors p-1"
                               >
                                 <X className="w-4 h-4" />
                               </button>
                             </div>
                          </div>
                        ))}
                     </div>
                   </div>
                   <div className="flex flex-col gap-4 border-l border-slate-800/50 pl-6">
                      <div className="flex items-center justify-between">
                        <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                          {editingRuleId ? 'Modify Rule' : 'New Interception Rule'}
                        </h3>
                        {editingRuleId && (
                          <button onClick={cancelEditRule} className="text-[9px] font-bold text-slate-500 hover:text-rose-400 uppercase underline">Cancel Edit</button>
                        )}
                      </div>
                      <div className="space-y-3">
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[10px] font-bold text-slate-600">RULE NAME</label>
                          <input 
                            type="text" 
                            value={newRuleName}
                            onChange={e => setNewRuleName(e.target.value)}
                            placeholder="e.g. Damage Spoofer" 
                            className="bg-slate-900 border border-slate-800 rounded px-3 py-2 text-xs focus:border-cyan-500 outline-none transition-colors" 
                          />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[10px] font-bold text-slate-600">ACTION TYPE</label>
                          <div className="flex gap-2">
                            <button 
                              onClick={() => setNewRuleAction('REPLACE')} 
                              className={`flex-1 py-1.5 rounded text-[10px] font-bold flex items-center justify-center gap-1.5 border transition-all ${newRuleAction === 'REPLACE' ? 'bg-purple-600 border-purple-500 text-white' : 'bg-slate-900 border-slate-800 text-slate-500'}`}
                            >
                              <Scissors className="w-3 h-3" /> TAMPER
                            </button>
                            <button 
                              onClick={() => setNewRuleAction('BLOCK')} 
                              className={`flex-1 py-1.5 rounded text-[10px] font-bold flex items-center justify-center gap-1.5 border transition-all ${newRuleAction === 'BLOCK' ? 'bg-rose-600 border-rose-500 text-white' : 'bg-slate-900 border-slate-800 text-slate-500'}`}
                            >
                              <Ban className="w-3 h-3" /> BLOCK (DROP)
                            </button>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="flex flex-col gap-1.5">
                            <label className="text-[10px] font-bold text-slate-600">MATCH HEX PATTERN</label>
                            <input 
                              type="text" 
                              value={newRuleMatch}
                              onChange={e => setNewRuleMatch(formatHexInput(e.target.value))}
                              placeholder="FF 01 02" 
                              className="bg-slate-900 border border-slate-800 rounded px-3 py-2 text-[11px] font-mono focus:border-cyan-500 outline-none transition-colors" 
                            />
                          </div>
                          {newRuleAction === 'REPLACE' ? (
                            <div className="flex flex-col gap-1.5">
                              <label className="text-[10px] font-bold text-slate-600">REPLACE WITH</label>
                              <input 
                                type="text" 
                                value={newRuleReplace}
                                onChange={e => setNewRuleReplace(formatHexInput(e.target.value))}
                                placeholder="00 00 00" 
                                className="bg-slate-900 border border-slate-800 rounded px-3 py-2 text-[11px] font-mono focus:border-purple-500 outline-none transition-colors" 
                              />
                            </div>
                          ) : (
                            <div className="flex flex-col gap-1.5 opacity-30">
                              <label className="text-[10px] font-bold text-slate-600">REPLACE WITH</label>
                              <div className="bg-slate-950 border border-slate-800 rounded px-3 py-2 text-[11px] font-mono text-slate-700 italic">No replacement (Dropped)</div>
                            </div>
                          )}
                        </div>
                        <button 
                          onClick={handleRegisterRule}
                          disabled={!newRuleName || !newRuleMatch || (newRuleAction === 'REPLACE' && !newRuleReplace)}
                          className={`w-full py-2.5 rounded text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-lg ${
                            editingRuleId 
                            ? 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-cyan-900/20' 
                            : newRuleAction === 'BLOCK' ? 'bg-rose-600 hover:bg-rose-500 text-white' : 'bg-purple-600 hover:bg-purple-500 text-white shadow-purple-900/20'
                          } disabled:opacity-30 disabled:cursor-not-allowed`}
                        >
                           {editingRuleId ? <Save className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                           {editingRuleId ? 'SAVE CHANGES' : 'REGISTER GLOBAL HOOK'}
                        </button>
                      </div>
                   </div>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>

      <footer className="h-6 bg-slate-950 border-t border-slate-800 flex items-center justify-between px-3 text-[10px] font-medium text-slate-600 uppercase tracking-tight">
        <div className="flex gap-6">
          <div className="flex items-center gap-1.5"><div className={`w-1.5 h-1.5 rounded-full ${injectionStatus === 'HOOKED' ? 'bg-emerald-500' : 'bg-slate-800'}`} /> WINSOCK2: <span className="text-slate-400">{injectionStatus === 'HOOKED' ? 'ACTIVE' : 'IDLE'}</span></div>
          <div className="flex items-center gap-1.5"><div className={`w-1.5 h-1.5 rounded-full ${isCapturing ? 'bg-purple-500 animate-pulse' : 'bg-slate-800'}`} /> CAPTURE: <span className="text-slate-400">{isCapturing ? 'RUNNING' : 'STOPPED'}</span></div>
        </div>
        <div className="flex items-center gap-3">
          <span>BUFF_SIZE: 1024KB</span>
          <div className="w-px h-3 bg-slate-800" />
          <span>© 2025 GAMEPROXY PRO - DLL HOOK SYSTEM</span>
        </div>
      </footer>
    </div>
  );
};

export default App;
