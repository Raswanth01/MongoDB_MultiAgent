
const BASE = (
  process.env.AGENTTRACE_API_URL ??
  "http://127.0.0.1:8000"
).replace(/\/$/, "");

async function request<T>(
  route: string,
  init: RequestInit = {}
): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${BASE}${route}`, {
      ...init,
      headers: {
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new Error(
      `Cannot reach AgentTrace API at ${BASE}. Is FastAPI running?`
    );
  }

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`API ${response.status}: ${message}`);
  }

  return response.json() as Promise<T>;
}

export interface SessionRecord {
  session_id: string;
  file?: string;
  status?: string;
  created_at?: string;
  updated_at?: string;
  duration_ms?: number;
  exit_code?: number | null;
  stdout?: string;
  stderr?: string;
  exception_type?: string | null;
  exception_message?: string | null;
}

export interface StepRecord {
  _id?: string;
  event_id: string;
  session_id: string;
  step_number: number;
  agent_name: string;
  status: string;
  tokens_used: number;
  memory_state: Record<string, unknown>;
  timestamp?: string;
  created_at?: string;
}

type SessionsResponse = {
  sessions: SessionRecord[];
};

type TimelineResponse = {
  session_id: string;
  timeline: StepRecord[];
};

export const api = {
  startSession: (payload: {
    session_id: string;
    file: string;
    credit_mode?: string;
    parent_session_id?: string | null;
    forked_from_step?: number | null;
  }) =>
    request<{ status: string; session_id: string }>(
      "/api/sessions/start",
      {
        method: "POST",
        body: JSON.stringify(payload),
      }
    ),

  saveCode: (payload: {
    session_id: string;
    file: string;
    source: string;
    sha256: string;
    captured_at: string;
  }) =>
    request<{ saved: boolean; session_id: string }>(
      "/api/code-snapshots/save",
      {
        method: "POST",
        body: JSON.stringify(payload),
      }
    ),

  saveStep: (payload: StepRecord) =>
    request<{ status: string; event_id: string }>(
      "/api/snapshots/save",
      {
        method: "POST",
        body: JSON.stringify(payload),
      }
    ),

  finish: (
    id: string,
    payload: {
      status: string;
      exit_code?: number;
      duration_ms?: number;
      stdout?: string;
      stderr?: string;
      exception_type?: string | null;
      exception_message?: string | null;
      traceback?: string | null;
    }
  ) =>
    request<{ session_id: string; status: string }>(
      `/api/sessions/${encodeURIComponent(id)}/finish`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      }
    ),

  async sessions(): Promise<SessionRecord[]> {
    const result = await request<SessionsResponse>("/api/sessions");
    return Array.isArray(result.sessions) ? result.sessions : [];
  },

  session: (id: string) =>
    request<SessionRecord>(
      `/api/sessions/${encodeURIComponent(id)}`
    ),

  async timeline(id: string): Promise<StepRecord[]> {
    const result = await request<TimelineResponse>(
      `/api/sessions/${encodeURIComponent(id)}/timeline`
    );

    return Array.isArray(result.timeline) ? result.timeline : [];
  },
};
