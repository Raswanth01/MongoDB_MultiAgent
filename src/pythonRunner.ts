
import { spawn } from "node:child_process";
import { randomUUID, createHash } from "node:crypto";
import {
  readFile,
  mkdir,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import os from "node:os";

import { api } from "./api.js";

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

export async function runPython(
  file: string
): Promise<void> {
  const original = path.resolve(file);
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

  // Copy the original source so we execute an immutable snapshot.
  await writeFile(snapshotPath, source, "utf8");

  // Locate trace_engine.py in the project root.
  const traceEnginePath = path.resolve("trace_engine.py");

  // Create the session and save the original source.
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

  // Step 0: source snapshot.
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
  console.log(`Executing snapshot: ${snapshotPath}\n`);
  console.log("Tracing Python execution...\n");

  let stdout = "";
  let stderr = "";
  let exitCode = 1;

  try {
    exitCode = await new Promise<number>(
      (resolve, reject) => {
        const child = spawn(
          "python",
          [
            "-u",
            traceEnginePath,
            snapshotPath,
            "--events-json",
            eventsPath,
          ],
          {
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

        child.on("error", reject);

        child.on("close", (code) => {
          resolve(code ?? 1);
        });
      }
    );
  } catch (error) {
    stderr += `\n${
      error instanceof Error
        ? error.message
        : String(error)
    }\n`;

    console.error(stderr);
  }

  // Read detailed line/function/variable events.
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

  let traceEvents: TraceEvent[] = [];
  let traceFailure: {
    type: string;
    message: string;
  } | null = null;

  try {
    const traceData = JSON.parse(
      await readFile(eventsPath, "utf8")
    );

    traceEvents = traceData.events ?? [];
    traceFailure = traceData.failure ?? null;
  } catch (error) {
    console.error(
      "\nCould not load trace events:",
      error instanceof Error
        ? error.message
        : String(error)
    );
  }

  // Persist each execution event in MongoDB.
  for (const event of traceEvents) {
    await api.saveStep({
      event_id: `${sessionId}_trace_${event.step}`,
      session_id: sessionId,
      step_number: event.step,
      agent_name: `trace:${event.event}`,
      status:
        event.event === "exception" ? "FAILED" : "PASSED",
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

  // Keep the execution summary after all trace events.
  await api.saveStep({
    event_id: `${sessionId}_execution`,
    session_id: sessionId,
    step_number: traceEvents.length + 1,
    agent_name: "python-execution",
    status: failed ? "FAILED" : "PASSED",
    tokens_used: 0,
    memory_state: {
      exit_code: exitCode,
      duration_ms: duration,
      stdout,
      stderr,
      exception_type: failed
        ? traceFailure?.type ?? details.type
        : null,
      exception_message: failed
        ? traceFailure?.message ?? details.message
        : null,
      traceback: failed ? stderr : null,
      trace_event_count: traceEvents.length,
    },
  });

  await api.finish(sessionId, {
    status: failed ? "FAILED" : "COMPLETED",
    exit_code: exitCode,
    duration_ms: duration,
    stdout,
    stderr,
    exception_type: failed
      ? traceFailure?.type ?? details.type
      : null,
    exception_message: failed
      ? traceFailure?.message ?? details.message
      : null,
    traceback: failed ? stderr : null,
  });

  console.log(`\nSession: ${sessionId}`);
  console.log(`Status: ${failed ? "FAILED" : "COMPLETED"}`);
  console.log(`Exit code: ${exitCode}`);
  console.log(`Duration: ${duration} ms`);
  console.log(`Trace events saved: ${traceEvents.length}`);

  if (failed) {
    process.exitCode = 1;
  }
}
