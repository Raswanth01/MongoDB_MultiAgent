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
    response = await fetch(BASE + route, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...init.headers,
      },
    });
  } catch {
    throw new Error(
      `Cannot reach AgentTrace API at ${BASE}. ` +
      "Is FastAPI running?"
    );
  }

  if (!response.ok) {
    throw new Error(
      `API ${response.status}: ${await response.text()}`
    );
  }

  return response.json() as Promise<T>;
}

export interface SessionRecord {
  session_id: string;
  file?: string;
  status?: string;
  created_at?: string;
  duration_ms?: number;
  exit_code?: number | null;
  exception_type?: string | null;
  exception_message?: string | null;
}

export interface StepRecord {
  event_id: string;
  session_id: string;
  step_number: number;
  agent_name: string;
  status: string;
  tokens_used: number;
  memory_state: Record<string, unknown>;
  created_at?: string;
}

export const api = {
  startSession: (payload: {
    session_id: string;
    file: string;
  }) =>
    request("/api/sessions/start", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  saveCode: (payload: {
    session_id: string;
    file: string;
    source: string;
    sha256: string;
    captured_at: string;
  }) =>
    request("/api/code-snapshots/save", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  saveStep: (payload: StepRecord) =>
    request("/api/snapshots/save", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  finish: (
    id: string,
    payload: Record<string, unknown>
  ) =>
    request(
      `/api/sessions/${encodeURIComponent(id)}/finish`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      }
    ),

  sessions: () =>
    request<SessionRecord[]>("/api/sessions"),

  session: (id: string) =>
    request<SessionRecord>(
      `/api/sessions/${encodeURIComponent(id)}`
    ),

  timeline: (id: string) =>
    request<StepRecord[]>(
      `/api/sessions/${encodeURIComponent(id)}/timeline`
    ),
};