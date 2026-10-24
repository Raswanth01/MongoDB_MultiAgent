import type { TraceEvent, RunRecord, AgentStep } from '../types';

export function safeJson(value: unknown) {
  try { return JSON.stringify(value, null, 2); } catch { return String(value); }
}

export function formatTime(value?: string) {
  if (!value) return 'Time unavailable';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export function inferFile(run: any) {
  return run.file || run.original_file || run.memory_state?.original_file || run.memory_state?.file || 'Python run';
}

export function normalizeRun(item: any): RunRecord {
  const id = String(item.session_id || item.id || item._id || '');
  const statusText = String(item.status || item.state || 'RUNNING').toUpperCase();
  const status: RunRecord['status'] = statusText.includes('FAIL') || statusText.includes('ERROR') ? 'FAILED' : statusText.includes('COMPLETE') || statusText.includes('PASS') ? 'PASSED' : 'RUNNING';
  return { id, file: inferFile(item), status, time: formatTime(item.timestamp || item.created_at || item.started_at), duration: item.duration_ms ? `${item.duration_ms}ms` : undefined, events: Array.isArray(item.events) ? item.events : [], raw: item };
}

export function makeSteps(events: TraceEvent[] = []): AgentStep[] {
  if (!events.length) return [];
  const sorted = [...events].sort((a, b) => (a.step_number ?? 0) - (b.step_number ?? 0));
  const agentEvents = sorted.filter(event => { const name = (event.agent_name || '').toLowerCase(); return name.startsWith('trace:') || name.includes('agent') || name === 'python-execution' || name === 'source-snapshot'; });
  const namedAgents = sorted.filter(event => /agent/i.test(event.agent_name || '') && !/trace:/i.test(event.agent_name || ''));
  const chosen = namedAgents.length ? namedAgents : agentEvents.length ? agentEvents : sorted;
  const sourceOnly = chosen.every(event => ['source-snapshot', 'python-execution'].includes(event.agent_name || ''));
  const list = sourceOnly ? sorted : chosen;
  return list.map((event, index) => {
    const memory = event.memory_state || {};
    const eventName = String(memory.event || event.agent_name || 'execution').replace(/^trace:/, '');
    const statusText = String(event.status || '').toUpperCase();
    const skipped = statusText.includes('SKIP') || eventName === 'skipped';
    const failed = statusText.includes('FAIL') || eventName === 'exception' || Boolean(memory.exception);
    const line = Number(memory.line || memory.lineno || 0) || undefined;
    const functionName = memory.function || memory.function_name;
    let name = event.agent_name || eventName;
    if (name.startsWith('trace:')) name = `${eventName} · ${functionName || 'Python'}`;
    if (name === 'python-execution') name = 'Python execution';
    if (name === 'source-snapshot') name = 'Source snapshot';
    return { id: event.event_id || event._id || `${event.step_number ?? index}`, name, status: skipped ? 'pending' : failed ? 'failed' : 'passed', line, source: memory.source, functionName, prompt: memory.prompt || memory.input_prompt, result: memory.result ?? memory.output ?? memory.memory_state ?? memory.stdout, variables: memory.variables || {}, exception: memory.exception || (failed ? { type: memory.exception_type, message: memory.exception_message } : undefined), raw: event };
  });
}
