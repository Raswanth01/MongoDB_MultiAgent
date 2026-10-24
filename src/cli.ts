#!/usr/bin/env node

import { Command } from "commander";

import { runPython } from "./pythonRunner.js";
import {
  getRuns,
  getRun,
  getRunTimeline,
} from "./tracker.js";

const program = new Command();

program
  .name("agenttrace")
  .description(
    "Track Python executions with FastAPI and MongoDB"
  )
  .version("0.2.0");

program
  .command("run-python <file>")
  .description(
    "Snapshot and run a Python script"
  )
  .action(async (file: string) => {
    try {
      await runPython(file);
    } catch (error) {
      console.error(
        error instanceof Error
          ? error.message
          : String(error)
      );

      process.exitCode = 1;
    }
  });

program
  .command("history")
  .description("List sessions from MongoDB")
  .action(async () => {
    try {
      const sessions = await getRuns();

      if (sessions.length === 0) {
        console.log("No sessions found.");
        return;
      }

      for (const session of sessions) {
        console.log(
          `${session.session_id} | ` +
          `${session.status ?? "UNKNOWN"} | ` +
          `${session.file ?? ""} | ` +
          `${session.created_at ?? ""}`
        );
      }
    } catch (error) {
      console.error(
        error instanceof Error
          ? error.message
          : String(error)
      );

      process.exitCode = 1;
    }
  });

program
  .command("inspect <sessionId>")
  .description("Inspect a session and its timeline")
  .action(async (sessionId: string) => {
    try {
      const [session, timeline] =
        await Promise.all([
          getRun(sessionId),
          getRunTimeline(sessionId),
        ]);

      console.log(
        JSON.stringify(
          { session, timeline },
          null,
          2
        )
      );
    } catch (error) {
      console.error(
        error instanceof Error
          ? error.message
          : String(error)
      );

      process.exitCode = 1;
    }
  });

program.parseAsync().catch((error: unknown) => {
  console.error(
    error instanceof Error
      ? error.message
      : String(error)
  );

  process.exitCode = 1;
});