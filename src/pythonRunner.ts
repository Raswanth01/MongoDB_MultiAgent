
import { spawn } from "node:child_process";
import { randomUUID, createHash } from "node:crypto";
import {
  readFile,
  mkdir,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

import { api } from "./api.js";

// Resolve paths relative to this source file, not the terminal's
// current working directory.
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(currentDir, "..");
const traceEnginePath = path.join(projectRoot, "trace_engine.py");

function exceptionDetails(stderr: string) {
  const lines = stderr.trim().split(/\r?\n/);
  const last = lines.at(-1) ?? "";

  const match = last.match(
    /^([A-Za-z_][\w.]*Error|[A-Za-z_][\w.]*Exception|KeyboardInterrupt|SystemExit):\s*(.*)$/
  );

  return {
    type: match?.[1] ?? (stderr ? "PythonError" : null),
    message: match?.[2] ?? (stderr || null),
  };
}

type TraceEvent = {
  step: number;
  event: string;
  function: string;
  line: number;
  source: string;
  variables: Record<string, unknown>;
  exception?: {
    type: string;
    message: string;
  };
};

type TraceData = {
  events: TraceEvent[];
  failure: {
    type: string;
    message: string;
  } | null;
};

export async function runPython(file: string): Promise<void> {
  const original = path.resolve(file);

  // Read the original file before creating a session.
  const source = await readFile(original, "utf8");

  const sessionId = randomUUID();
  const started = Date.now();
  const capturedAt = new Date().toISOString();

  const sha256 = createHash("sha256")
    .update(source)
    .digest("hex");

  const snapshotDir = path.join(
    os.tmpdir(),
    "agenttrace",
    sessionId
  );

  await mkdir(snapshotDir, { recursive: true });

  const snapshotPath = path.join(
    snapshotDir,
    path.basename(original)
  );

  const eventsPath = path.join(
    snapshotDir,
    "trace_events.json"
  );

  // Execute an immutable copy of the source file.
  await writeFile(snapshotPath, source, "utf8");

  // Fail early with a useful message if the tracer is missing.
  try {
    await readFile(traceEnginePath, "utf8");
  } catch {
    throw new Error(
      `Could not find trace_engine.py at: ${traceEnginePath}`
    );
  }

  // Create a session and save its source snapshot.
  await api.startSession({
    session_id: sessionId,
    file: original,
  });

  await api.saveCode({
    session_id: sessionId,
    file: original,
    source,
    sha256,
    captured_at: capturedAt,
  });

  // Step 0: record the original source snapshot.
  await api.saveStep({
    event_id: `${sessionId}_source`,
    session_id: sessionId,
    step_number: 0,
    agent_name: "source-snapshot",
    status: "PASSED",
    tokens_used: 0,
    memory_state: {
      original_file: original,
      executed_snapshot: snapshotPath,
      sha256,
      captured_at: capturedAt,
    },
  });

  console.log(`AgentTrace session: ${sessionId}`);
  console.log(`Original file: ${original}`);
  console.log(`Executing snapshot: ${snapshotPath}\n`);
  console.log("Tracing Python execution...\n");

  let stdout = "";
  let stderr = "";
  let exitCode = 1;

  // Prefer the same Python interpreter used to launch the CLI's
  // environment when available; on Windows, try "python" first.
  const pythonCommand = process.platform === "win32"
    ? "python"
    : "python3";

  try {
    exitCode = await new Promise<number>((resolve, reject) => {
      const child = spawn(
        pythonCommand,
        [
          "-u",
          traceEnginePath,
          snapshotPath,
          "--events-json",
          eventsPath,
        ],
        {
          // Keep the original script's directory as its working
          // directory, so its relative file operations behave
          // as expected.
          cwd: path.dirname(original),
          windowsHide: true,
          stdio: ["inherit", "pipe", "pipe"],
        }
      );

      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");

      child.stdout.on("data", (chunk: string) => {
        stdout += chunk;
        process.stdout.write(chunk);
      });

      child.stderr.on("data", (chunk: string) => {
        stderr += chunk;
        process.stderr.write(chunk);
      });

      child.once("error", (error) => {
        reject(
          new Error(
            `Could not start Python (${pythonCommand}): ${error.message}`
          )
        );
      });

      child.once("close", (code) => {
        resolve(code ?? 1);
      });
    });
  } catch (error) {
    stderr += `\n${
      error instanceof Error ? error.message : String(error)
    }\n`;

    console.error(stderr);
    exitCode = 1;
  }

  // Read the trace events written by trace_engine.py.
  let traceData: TraceData = {
    events: [],
    failure: null,
  };

  try {
    const raw = await readFile(eventsPath, "utf8");
    const parsed = JSON.parse(raw);

    traceData = {
      events: Array.isArray(parsed.events) ? parsed.events : [],
      failure: parsed.failure ?? null,
    };
  } catch (error) {
    console.error(
      "\nCould not load trace events:",
      error instanceof Error ? error.message : String(error)
    );
  }

  // Persist every trace event to MongoDB through the existing API.
  for (const event of traceData.events) {
    await api.saveStep({
      event_id: `${sessionId}_trace_${event.step}`,
      session_id: sessionId,
      step_number: event.step,
      agent_name: `trace:${event.event}`,
      status: event.event === "exception" ? "FAILED" : "PASSED",
      tokens_used: 0,
      memory_state: {
        event: event.event,
        function: event.function,
        line: event.line,
        source: event.source,
        variables: event.variables,
        exception: event.exception ?? null,
      },
    });
  }

  const failed = exitCode !== 0;
  const details = exceptionDetails(stderr);
  const duration = Date.now() - started;

  const exceptionType = failed
    ? traceData.failure?.type ?? details.type
    : null;

  const exceptionMessage = failed
    ? traceData.failure?.message ?? details.message
    : null;

  // Save the final execution summary.
  await api.saveStep({
    event_id: `${sessionId}_execution`,
    session_id: sessionId,
    step_number: traceData.events.length + 1,
    agent_name: "python-execution",
    status: failed ? "FAILED" : "PASSED",
    tokens_used: 0,
    memory_state: {
      exit_code: exitCode,
      duration_ms: duration,
      stdout,
      stderr,
      exception_type: exceptionType,
      exception_message: exceptionMessage,
      traceback: failed ? stderr : null,
      trace_event_count: traceData.events.length,
    },
  });

  // Mark the session as finished.
  await api.finish(sessionId, {
    status: failed ? "FAILED" : "COMPLETED",
    exit_code: exitCode,
    duration_ms: duration,
    stdout,
    stderr,
    exception_type: exceptionType,
    exception_message: exceptionMessage,
    traceback: failed ? stderr : null,
  });

  console.log(`\nSession: ${sessionId}`);
  console.log(`Status: ${failed ? "FAILED" : "COMPLETED"}`);
  console.log(`Exit code: ${exitCode}`);
  console.log(`Duration: ${duration} ms`);
  console.log(`Trace events saved: ${traceData.events.length}`);

  if (failed) {
    process.exitCode = 1;
  }
}
