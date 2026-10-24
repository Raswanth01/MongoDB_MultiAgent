import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, AlertCircle, ArrowDown, ArrowLeft, ArrowRight, Bot, Check, CheckCircle2,
  ChevronDown, Circle, Clock3, Code2, Command, FileCode2, FolderUp, GitBranch,
  History, KeyRound, LoaderCircle, Play, Plus, RefreshCw, Search, Settings2,
  ShieldCheck, Sparkles, Terminal, X, Wrench, XCircle
} from 'lucide-react';

type TraceEvent = {
  _id?: string; event_id?: string; session_id?: string; agent_name?: string; status?: string;
  step_number?: number; timestamp?: string; memory_state?: Record<string, any>;
};
type RunRecord = { id: string; file: string; status: 'PASSED'|'FAILED'|'RUNNING'; time: string; duration?: string; events?: TraceEvent[]; raw?: any };
type AgentStep = { id: string; name: string; status: 'passed'|'failed'|'pending'; line?: number; source?: string; functionName?: string; prompt?: string; result?: unknown; variables?: Record<string, unknown>; exception?: any; raw?: TraceEvent };

const API_BASE = (import.meta as any).env?.VITE_API_BASE || 'http://localhost:8000';
const demoRun: RunRecord = {
  id: 'demo-pipeline-001', file: 'sample_pipeline.py', status: 'FAILED', time: 'Just now', duration: '1.8s',
  events: [
    {event_id:'e1',step_number:0,agent_name:'ScraperAgent',status:'PASSED',memory_state:{event:'agent',prompt:'Fetch the raw pricing page.',result:{html:"<span class='price'>$19.99 USD</span>"},variables:{task:'Scrape Pro Plan pricing'}}},
    {event_id:'e2',step_number:1,agent_name:'ParserAgent',status:'PASSED',memory_state:{event:'agent',prompt:'Pull the product name and raw price text out of the HTML.',result:{product:'Pro Plan',raw_price:'$19.99 USD'}}},
    {event_id:'e3',step_number:2,agent_name:'EnricherAgent',status:'PASSED',memory_state:{event:'agent',prompt:'Extract the product name and price from the parsed record.',result:{price:'$19.99 USD'},variables:{price:'$19.99 USD'}}},
    {event_id:'e4',step_number:3,agent_name:'ValidatorAgent',status:'FAILED',memory_state:{event:'exception',function:'step_4_validator',line:96,source:'if not isinstance(price, (int, float)):',variables:{price:'$19.99 USD'},exception:{type:'TypeError',message:"expected numeric price, got str '$19.99 USD'"},prompt:'Validate the price and compute GST.',result:null}},
    {event_id:'e5',step_number:4,agent_name:'FormatterAgent',status:'SKIPPED',memory_state:{event:'skipped',prompt:'Produce the final invoice line.'}}
  ]
};

function safeJson(value: unknown) { try { return JSON.stringify(value, null, 2); } catch { return String(value); } }
function formatTime(value?: string) { if (!value) return 'Time unavailable'; const d = new Date(value); return Number.isNaN(d.getTime()) ? value : d.toLocaleString(); }
function inferFile(run: any) { return run.file || run.original_file || run.memory_state?.original_file || run.memory_state?.file || 'Python run'; }
function normalizeRun(item: any): RunRecord {
  const id = String(item.session_id || item.id || item._id || crypto.randomUUID());
  const statusText = String(item.status || item.state || 'RUNNING').toUpperCase();
  const status: RunRecord['status'] = statusText.includes('FAIL') || statusText.includes('ERROR') ? 'FAILED' : statusText.includes('COMPLETE') || statusText.includes('PASS') ? 'PASSED' : 'RUNNING';
  return { id, file: inferFile(item), status, time: formatTime(item.timestamp || item.created_at || item.started_at), duration: item.duration_ms ? `${item.duration_ms}ms` : undefined, raw: item };
}
function makeSteps(events: TraceEvent[] = []): AgentStep[] {
  if (!events.length) return [];
  const sorted = [...events].sort((a,b) => (a.step_number ?? 0) - (b.step_number ?? 0));
  const agentEvents = sorted.filter(e => {
    const name = (e.agent_name || '').toLowerCase();
    return name.startsWith('trace:') || name.includes('agent') || name === 'python-execution' || name === 'source-snapshot';
  });
  const namedAgents = sorted.filter(e => /agent/i.test(e.agent_name || '') && !/trace:/i.test(e.agent_name || ''));
  const sourceOrSummary = sorted.filter(e => ['source-snapshot','python-execution'].includes(e.agent_name || ''));
  const chosen = namedAgents.length ? namedAgents : agentEvents.length ? agentEvents : sorted;
  const sourceOnly = chosen.every(e => ['source-snapshot','python-execution'].includes(e.agent_name || ''));
  const list = sourceOnly ? sorted : chosen;
  return list.map((e, i) => {
    const m = e.memory_state || {};
    const eventName = String(m.event || e.agent_name || 'execution').replace(/^trace:/,'');
    const statusText = String(e.status || '').toUpperCase();
    const skipped = statusText.includes('SKIP') || eventName === 'skipped';
    const failed = statusText.includes('FAIL') || eventName === 'exception' || Boolean(m.exception);
    const line = Number(m.line || m.lineno || 0) || undefined;
    const functionName = m.function || m.function_name;
    let name = e.agent_name || eventName;
    if (name.startsWith('trace:')) name = `${eventName} · ${functionName || 'Python'}`;
    if (name === 'python-execution') name = 'Python execution';
    if (name === 'source-snapshot') name = 'Source snapshot';
    return { id: e.event_id || e._id || `${e.step_number ?? i}`, name, status: skipped ? 'pending' : failed ? 'failed' : statusText === 'PASSED' || statusText === 'COMPLETED' ? 'passed' : 'passed', line, source: m.source, functionName, prompt: m.prompt || m.input_prompt, result: m.result ?? m.output ?? m.memory_state ?? m.stdout, variables: m.variables || {}, exception: m.exception || (failed ? {type:m.exception_type,message:m.exception_message} : undefined), raw: e };
  });
}

export default function App() {
  const [runs, setRuns] = useState<RunRecord[]>([demoRun]);
  const [selectedRunId, setSelectedRunId] = useState(demoRun.id);
  const [selectedStepId, setSelectedStepId] = useState('e4');
  const [search, setSearch] = useState('');
  const [apiState, setApiState] = useState<'checking'|'connected'|'offline'>('checking');
  const [page, setPage] = useState<'workspace'|'solve'>('workspace');
  const [folderName, setFolderName] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [selectedFile, setSelectedFile] = useState('sample_pipeline.py');
  const [provider, setProvider] = useState('Ollama (local)');
  const [model, setModel] = useState('qwen2.5-coder:7b');
  const [apiToken, setApiToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [consoleLines, setConsoleLines] = useState<string[]>(['AgentTrace CLI · workspace ready', 'Select a previous run or upload a project folder.', 'Tip: choose a failed agent to inspect its error.']);
  const [command, setCommand] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [solveLoading, setSolveLoading] = useState(false);
  const [solution, setSolution] = useState('');
  const [errorText, setErrorText] = useState('');
  const folderInput = useRef<HTMLInputElement>(null);

  const selectedRun = runs.find(r => r.id === selectedRunId) || runs[0];
  const steps = useMemo(() => makeSteps(selectedRun?.events), [selectedRun]);
  const selectedStep = steps.find(s => s.id === selectedStepId) || steps.find(s => s.status === 'failed') || steps[0];
  const filteredRuns = runs.filter(r => r.file.toLowerCase().includes(search.toLowerCase()) || r.id.toLowerCase().includes(search.toLowerCase()));

  useEffect(() => { void refreshRuns(); }, []);
  useEffect(() => { if (steps.length) setSelectedStepId(steps.find(s => s.status === 'failed')?.id || steps[0].id); }, [selectedRunId]);

  async function refreshRuns() {
    try {
      const response = await fetch(`${API_BASE}/api/sessions`);
      if (!response.ok) throw new Error(`API ${response.status}`);
      const payload = await response.json();
      const items = Array.isArray(payload) ? payload : payload.sessions || payload.data || [];
      const normalized = items.map(normalizeRun);
      setRuns(prev => {
        const combined = [...normalized];
        for (const old of prev) if (!combined.some(r => r.id === old.id)) combined.push(old);
        return combined.length ? combined : [demoRun];
      });
      setApiState('connected');
      setConsoleLines(prev => [`Connected to API at ${API_BASE}`, ...prev.filter(x => !x.startsWith('Connected to API') && !x.startsWith('API unavailable'))].slice(0,30));
    } catch {
      setApiState('offline');
      setConsoleLines(prev => [`API unavailable at ${API_BASE}; showing demo data until backend is running.`, ...prev.filter(x => !x.startsWith('API unavailable'))].slice(0,30));
    }
  }

  async function loadTimeline(run: RunRecord) {
    try {
      const response = await fetch(`${API_BASE}/api/sessions/${encodeURIComponent(run.id)}/timeline`);
      if (!response.ok) throw new Error('Timeline request failed');
      const payload = await response.json();
      const events = payload.timeline || payload.events || [];
      setRuns(prev => prev.map(r => r.id === run.id ? {...r, events} : r));
    } catch {
      if (run.id !== demoRun.id) setConsoleLines(prev => [`Could not load timeline for ${run.id}.`, ...prev].slice(0,30));
    }
  }

  function chooseRun(run: RunRecord) { setSelectedRunId(run.id); setPage('workspace'); if (run.events?.length) return; void loadTimeline(run); }
  function onFolderChange(e: ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files || []);
    setFiles(picked);
    const root = picked[0]?.webkitRelativePath?.split('/')[0] || picked[0]?.name || '';
    setFolderName(root);
    const py = picked.filter(f => f.name.toLowerCase().endsWith('.py'));
    if (py.length) setSelectedFile(py[0].webkitRelativePath || py[0].name);
    setConsoleLines(prev => [`Folder selected: ${root || 'none'} · ${picked.length} files · ${py.length} Python files`, ...prev].slice(0,30));
  }

  async function runCommand(e?: FormEvent) {
    e?.preventDefault();
    const value = command.trim();
    if (!value) return;
    setConsoleLines(prev => [`agenttrace> ${value}`, ...prev].slice(0,30));
    setCommand('');
    if (value === 'help') { setConsoleLines(prev => ['Commands: run <file.py>, history, refresh, help', ...prev].slice(0,30)); return; }
    if (value === 'history') { await refreshRuns(); setConsoleLines(prev => [`Loaded ${runs.length} runs.`, ...prev].slice(0,30)); return; }
    if (value === 'refresh') { await refreshRuns(); return; }
    if (value.startsWith('run ')) {
      const requested = value.slice(4).trim();
      const exists = files.some(f => (f.webkitRelativePath || f.name) === requested || f.name === requested);
      setConsoleLines(prev => [exists ? `Selected ${requested}. Execution endpoint is not connected yet; use the existing CLI to execute this file.` : `Cannot execute '${requested}' from the browser yet. Upload the folder first; browser execution needs a backend run endpoint.`, ...prev].slice(0,30));
      return;
    }
    setConsoleLines(prev => [`Unknown command: ${value}. Type help.`, ...prev].slice(0,30));
  }

  async function solveError() {
    if (!selectedStep) return;
    setPage('solve'); setSolveLoading(true); setSolution('');
    // Frontend-only initial helper. This is not an LLM call or an applied code fix.
    await new Promise(resolve => setTimeout(resolve, 350));
    const exception = selectedStep.exception;
    const vars = selectedStep.variables || {};
    if (String(exception?.type).includes('TypeError') && 'price' in vars) {
      setSolution('The validator expects a number, but the saved price is a string. Fix the EnricherAgent output so it returns 19.99 as a numeric value (not "$19.99 USD"). Then replay from the validator once state replay is implemented.');
    } else if (String(exception?.type).includes('ZeroDivisionError')) {
      setSolution('The denominator is zero. Check the calculation that produces the count and ensure it reflects the actual number of values being averaged.');
    } else {
      setSolution(`Inspect the exception and the variables captured at line ${selectedStep.line || 'unknown'}. Compare the value types with what this step expects. The automated solve endpoint is not connected yet.`);
    }
    setSolveLoading(false);
  }

  const runStatus = selectedRun?.status || 'RUNNING';
  const failedCount = runs.filter(r => r.status === 'FAILED').length;
  const passedCount = runs.filter(r => r.status === 'PASSED').length;

  return <div className="app-shell">
    <header className="topbar">
      <div className="brand"><div className="brand-mark"><Activity size={19}/></div><div><strong>AgentTrace</strong><span>TIME-TRAVEL DEBUGGER</span></div></div>
      <div className="topbar-center"><span className={`connection-dot ${apiState}`}></span><span>{apiState === 'connected' ? 'Backend connected' : apiState === 'checking' ? 'Connecting…' : 'Demo mode'}</span><span className="top-separator"/><span className="muted">{API_BASE}</span></div>
      <div className="top-actions"><button className="icon-btn" title="Refresh history" onClick={() => void refreshRuns()}><RefreshCw size={16}/></button><button className="secondary-btn" onClick={() => setShowSettings(!showSettings)}><Settings2 size={16}/> Settings</button></div>
    </header>

    {showSettings && <section className="settings-panel"><div className="settings-head"><div><strong>Model & credentials</strong><p>Credentials stay in this tab's memory and are not sent anywhere by this demo UI.</p></div><button className="icon-btn" onClick={() => setShowSettings(false)}><X size={16}/></button></div><div className="settings-grid"><label>Provider<select value={provider} onChange={e=>setProvider(e.target.value)}><option>Ollama (local)</option><option>OpenAI-compatible API</option><option>Anthropic</option><option>AMD local model</option></select></label><label>Model name<input value={model} onChange={e=>setModel(e.target.value)} placeholder="Model name"/></label><label className="token-label">API token <span>(optional)</span><div className="token-field"><input type={showToken?'text':'password'} value={apiToken} onChange={e=>setApiToken(e.target.value)} placeholder="Paste token for this tab only"/><button type="button" className="icon-btn" onClick={()=>setShowToken(!showToken)}>{showToken?<X size={14}/>:<KeyRound size={14}/>}</button></div></label><div className="settings-note"><ShieldCheck size={16}/> Token is only held in frontend memory. Provider calls are not wired yet.</div></div></section>}

    {page === 'solve' ? <main className="solve-page"><button className="back-link" onClick={()=>setPage('workspace')}><ArrowLeft size={16}/> Back to process flow</button><div className="solve-heading"><div className="solve-icon"><Wrench size={23}/></div><div><div className="eyebrow">DEBUG ASSISTANT / {selectedStep?.name || 'STEP'}</div><h1>Investigate failure</h1><p>Review the captured error and proposed fix before applying anything.</p></div></div><div className="solve-grid"><section className="panel error-panel"><div className="panel-title"><AlertCircle size={17} className="danger-text"/><h3>Error details</h3><span className="pill failed">FAILED</span></div><div className="error-type">{selectedStep?.exception?.type || 'Execution error'}</div><p className="error-message">{selectedStep?.exception?.message || selectedRun?.raw?.exception_message || 'No exception message was saved for this event.'}</p><div className="code-location"><span>LOCATION</span><strong>{selectedStep?.functionName || selectedStep?.name || 'Unknown function'}{selectedStep?.line ? ` · line ${selectedStep.line}` : ''}</strong><pre>{selectedStep?.source || 'Source line was not included in the saved trace.'}</pre></div><h4>Captured variables</h4><pre className="code-block">{safeJson(selectedStep?.variables || {})}</pre></section><section className="panel solution-panel"><div className="panel-title"><Sparkles size={17}/><h3>Suggested solution</h3><span className="pill draft">REVIEW FIRST</span></div>{solveLoading ? <div className="loading-state"><LoaderCircle className="spin"/> Analysing saved error…</div> : solution ? <><p className="solution-copy">{solution}</p><div className="notice"><ShieldCheck size={16}/> This is a suggestion only. No source files have been modified and no replay has been run.</div><button className="primary-btn" onClick={()=>{setPage('workspace');setConsoleLines(prev=>['Solution reviewed. Automatic patching and replay are not connected yet.',...prev].slice(0,30));}}><ArrowLeft size={16}/> Return to run</button></> : <button className="primary-btn" onClick={()=>void solveError()}><Sparkles size={16}/> Suggest a fix</button>}</section></div></main> : <div className="workspace">
      <aside className="history-sidebar">
        <div className="sidebar-heading"><div><span className="eyebrow">WORKSPACE</span><h2>Run history</h2></div><button className="icon-btn" title="Upload project folder" onClick={()=>folderInput.current?.click()}><Plus size={18}/></button></div>
        <div className="history-search"><Search size={15}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search runs…"/></div>
        <div className="history-stats"><div><strong>{runs.length}</strong><span>Total runs</span></div><div><strong className="danger-text">{failedCount}</strong><span>Failed</span></div><div><strong className="success-text">{passedCount}</strong><span>Passed</span></div></div>
        <div className="history-list">{filteredRuns.map(run=><button key={run.id} className={`history-item ${selectedRunId===run.id?'selected':''}`} onClick={()=>chooseRun(run)}><div className={`history-status ${run.status.toLowerCase()}`}>{run.status==='PASSED'?<CheckCircle2 size={15}/>:run.status==='FAILED'?<XCircle size={15}/>:<Clock3 size={15}/>}</div><div className="history-info"><strong>{run.file}</strong><span>{run.time}</span><div className="history-meta"><span className={`text-status ${run.status.toLowerCase()}`}>{run.status}</span>{run.duration&&<span>{run.duration}</span>}</div></div><ChevronDown size={14} className="history-chevron"/></button>)}</div>
        <div className="sidebar-bottom"><button className="upload-folder-btn" onClick={()=>folderInput.current?.click()}><FolderUp size={17}/> Upload project folder</button><input ref={folderInput} type="file" multiple style={{display:'none'}} onChange={onFolderChange} {...({webkitdirectory:'', directory:''} as any)}/><p>Folder selection is local to this browser tab.</p></div>
      </aside>

      <main className="main-workspace">
        <div className="project-toolbar"><div className="project-title"><div className="file-icon"><FileCode2 size={20}/></div><div><div className="eyebrow">SELECTED RUN</div><h1>{selectedRun?.file || 'Choose a run'}</h1><span className="run-id">{selectedRun?.id}</span></div></div><div className="project-actions"><span className={`pill ${runStatus.toLowerCase()}`}>{runStatus==='FAILED'?<AlertCircle size={13}/>:runStatus==='PASSED'?<CheckCircle2 size={13}/>:<Clock3 size={13}/>} {runStatus}</span><button className="secondary-btn" onClick={()=>void loadTimeline(selectedRun)}><RefreshCw size={15}/> Reload timeline</button></div></div>
        <div className="model-strip"><div className="model-cell"><Bot size={16}/><span>Provider</span><strong>{provider}</strong></div><div className="model-cell"><Code2 size={16}/><span>Model</span><strong>{model || 'Not configured'}</strong></div><div className="model-cell"><KeyRound size={16}/><span>Credentials</span><strong>{apiToken?'Token entered in tab':'Not connected'}</strong></div><button className="configure-link" onClick={()=>setShowSettings(true)}>Configure <ArrowRight size={14}/></button></div>

        <section className="flow-section"><div className="section-heading"><div><span className="eyebrow">EXECUTION GRAPH</span><h2>Process flow</h2></div><div className="flow-legend"><span><i className="legend-dot passed"/>Passed</span><span><i className="legend-dot failed"/>Failed</span><span><i className="legend-dot pending"/>Not reached</span></div></div>
          {steps.length ? <div className="flow-canvas"><div className="flow-line"/>{steps.map((step,i)=><div className="flow-node-wrap" key={step.id}><button className={`flow-node ${step.status} ${selectedStep?.id===step.id?'active':''}`} onClick={()=>setSelectedStepId(step.id)}><div className="node-top"><span className="node-index">{String(i+1).padStart(2,'0')}</span><span className="node-status">{step.status==='passed'?<Check size={13}/>:step.status==='failed'?<X size={13}/>:<Circle size={12}/>}</span></div><div className="node-icon">{step.status==='passed'?<Bot size={20}/>:step.status==='failed'?<AlertCircle size={20}/>:<GitBranch size={20}/>}</div><strong>{step.name}</strong><span className="node-subtitle">{step.functionName || (step.status==='failed'?'Needs attention':step.status==='pending'?'Not executed':'Completed')}</span>{step.line&&<span className="node-line">Line {step.line}</span>}</button>{i<steps.length-1&&<div className="flow-connector"><ArrowDown size={16}/></div>}</div>)}</div> : <div className="empty-state"><GitBranch size={28}/><h3>No execution trace yet</h3><p>Select a run from history and load its timeline. Detailed agent cards appear when agent events are saved.</p><button className="secondary-btn" onClick={()=>void loadTimeline(selectedRun)}><RefreshCw size={15}/> Load timeline</button></div>}
        </section>

        {selectedStep && <section className="detail-section"><div className="section-heading"><div><span className="eyebrow">STEP INSPECTOR</span><h2>{selectedStep.name}</h2></div><span className={`pill ${selectedStep.status}`}>{selectedStep.status.toUpperCase()}</span></div><div className="detail-grid"><div className="panel detail-main"><div className="tab-title"><span><Command size={15}/> Agent details</span><span className="muted">Event {selectedStep.id.slice(0,10)}</span></div><div className="detail-block"><label>Prompt / input</label><pre>{selectedStep.prompt ? String(selectedStep.prompt) : 'No prompt was saved for this event.'}</pre></div><div className="detail-block"><label>Result / output</label><pre>{selectedStep.result === undefined ? 'No result was saved for this event.' : safeJson(selectedStep.result)}</pre></div>{selectedStep.source&&<div className="detail-block"><label>Executed source line {selectedStep.line?`· ${selectedStep.line}`:''}</label><pre className="source-line">{selectedStep.source}</pre></div>}</div><div className="panel detail-side"><div className="panel-title"><Activity size={16}/><h3>Runtime state</h3></div><div className="mini-stat"><span>Function</span><strong>{selectedStep.functionName || '—'}</strong></div><div className="mini-stat"><span>Line</span><strong>{selectedStep.line ?? '—'}</strong></div><div className="detail-block"><label>Variables at this step</label><pre className="code-block">{safeJson(selectedStep.variables || {})}</pre></div>{selectedStep.status==='failed'&&<><div className="error-summary"><AlertCircle size={16}/><div><strong>{selectedStep.exception?.type || 'Execution failed'}</strong><p>{selectedStep.exception?.message || 'Inspect the error details to diagnose this step.'}</p></div></div><button className="primary-btn full-btn" onClick={()=>void solveError()}><Sparkles size={16}/> Solve this error <ArrowRight size={15}/></button></>}</div></div></section>}
      </main>
    </div>}

    <section className="console-dock"><div className="console-header"><div><Terminal size={16}/><strong>AgentTrace CLI</strong><span className="console-dot"/></div><div className="console-actions"><span>Interactive console</span><button className="icon-btn small" title="Clear console" onClick={()=>setConsoleLines([])}><X size={14}/></button></div></div><div className="console-body"><div className="console-output">{consoleLines.slice(0,5).map((line,i)=><div key={`${line}-${i}`} className={line.startsWith('agenttrace>')?'command-line':line.toLowerCase().includes('unavailable')?'console-warn':''}>{line}</div>)}</div><form className="console-input-row" onSubmit={runCommand}><span className="prompt">agenttrace &gt;</span><input value={command} onChange={e=>setCommand(e.target.value)} placeholder="Type help, history, refresh, or run <file.py>…"/><button type="submit" disabled={!command.trim()}><Play size={14}/> Run</button></form></div></section>
    <footer className="footer"><span>AgentTrace · Developer tools for debugging agent workflows</span><span><span className={`connection-dot ${apiState}`}></span> {apiState==='connected'?'Connected':apiState==='checking'?'Connecting':'Demo mode'}</span></footer>
  </div>;
}
