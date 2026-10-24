export type TraceEvent = {
  _id?: string;
  event_id?: string;
  session_id?: string;
  agent_name?: string;
  status?: string;
  step_number?: number;
  timestamp?: string;
  memory_state?: Record<string, any>;
};

export type RunRecord = {
  id: string;
  file: string;
  status: 'PASSED' | 'FAILED' | 'RUNNING';
  time: string;
  duration?: string;
  events?: TraceEvent[];
  raw?: any;
};

export type AgentStep = {
  id: string;
  name: string;
  status: 'passed' | 'failed' | 'pending';
  line?: number;
  source?: string;
  functionName?: string;
  prompt?: string;
  result?: unknown;
  variables?: Record<string, unknown>;
  exception?: any;
  raw?: TraceEvent;
};
