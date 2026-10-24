import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

import { runPython } from "./pythonRunner.js";
import {
  getRuns,
  getRunTimeline,
} from "./tracker.js";

const rl = createInterface({
  input: stdin,
  output: stdout,
});

console.log(
  "AgentTrace shell. Commands: run <file.py>, " +
  "history, inspect <session-id>, help, exit"
);

try {
  while (true) {
    const line = (
      await rl.question("agenttrace> ")
    ).trim();

    const [command, ...args] = line.split(/\s+/);

    if (command === "exit" || command === "quit") {
      break;
    }

    if (command === "help") {
      console.log(
        "run <file.py> | history | " +
        "inspect <session-id> | exit"
      );
    } else if (command === "run" && args[0]) {
      await runPython(args[0]);
    } else if (command === "history") {
      console.log(
        JSON.stringify(await getRuns(), null, 2)
      );
    } else if (command === "inspect" && args[0]) {
      console.log(
        JSON.stringify(
          await getRunTimeline(args[0]),
          null,
          2
        )
      );
    } else if (line) {
      console.log("Unknown command. Type help.");
    }
  }
} catch (error) {
  console.error(
    error instanceof Error
      ? error.message
      : String(error)
  );
} finally {
  rl.close();
}