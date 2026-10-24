# AgentTrace — Setup & Usage Guide

## 1. Overview

AgentTrace is a developer tool that executes Python scripts and records execution details, including standard output, errors, exit codes, and execution duration.

The current version stores execution history locally in `data/runs.json`.

## 2. Prerequisites

Install the following software before starting:

- **Git:** To clone the repository.
- **Node.js and npm:** To run the TypeScript application and install dependencies.
- **Python 3:** To execute Python scripts.

Verify the installations by running these commands in a terminal:

```bash
git --version
node --version
npm --version
python --version
```

If `python` is not recognized, install Python 3 and ensure it is added to your system PATH.

## 3. Download the Project

Clone the repository:

```bash
git clone <REPOSITORY_URL>
```

Navigate to the project directory:

```bash
cd MongoDB_MultiAgent
```

Replace `<REPOSITORY_URL>` with the actual Git repository URL.

## 4. Install Dependencies

Install the project's dependencies:

```bash
npm install
```

If `tsx`, TypeScript, or Commander are missing from the project's dependencies, install them with:

```bash
npm install commander
npm install -D tsx typescript @types/node
```

## 5. Run AgentTrace

### Option A: Windows

If the repository includes `agenttrace.bat`, double-click the file to launch the interactive terminal.

Alternatively, open PowerShell in the project directory and run:

```bash
npx tsx src/interactive.ts
```

### Option B: Other operating systems

Open a terminal in the project directory and run:

```bash
npx tsx src/interactive.ts
```

Once launched, the AgentTrace prompt will appear:

```text
AgentTrace
Type "help" to see commands.
agenttrace>
```

## 6. Execute a Python Script

Place a Python script in the project directory. For example, create `bug.py`:

```python
data = [10, 20, 30]
print("Dataset loaded:", data)
print(data[10])
```

Run it inside AgentTrace:

```text
agenttrace> run bug.py
```

AgentTrace executes the script, displays its output, captures any errors, and records the execution result.

## 7. View Execution History

To display previous executions:

```text
agenttrace> history
```

Each entry includes the execution status, run ID, and script path.

## 8. Inspect an Execution

Copy a run ID from the history and run:

```text
agenttrace> inspect <RUN_ID>
```

Replace `<RUN_ID>` with the actual ID.

The stored record includes:

- Run ID
- Script path
- Start timestamp
- Execution duration
- Status
- Exit code
- Standard output (`stdout`)
- Error output (`stderr`)

## 9. Where Is the Data Stored?

Execution records are saved to:

```text
data/runs.json
```

The directory and file are created automatically when AgentTrace saves its first run.

Keep this file if you want to preserve the local execution history.

## 10. Available Commands

| Command | Description |
|---|---|
| `run <file.py>` | Execute a Python script |
| `run-python <file.py>` | Alternative command for executing a Python script |
| `history` | List recorded executions |
| `inspect <runId>` | Display details for an execution |
| `help` | Show available commands |
| `exit` | Close AgentTrace |

## 11. Current Limitations

The current version records process-level execution information. It does not yet automatically create code snapshots in MongoDB, provide AI-powered error explanations, or resume execution from checkpoints.

## 12. Troubleshooting

**Python is not recognized**

Install Python 3, add it to PATH, and reopen the terminal.

**Dependencies are missing**

Run `npm install` from the project directory.

**The AgentTrace prompt does not launch**

Check that `src/interactive.ts` exists and that `tsx` is installed.

**No execution history appears**

Run a script first and check whether `data/runs.json` was created.

---

**Note:** Use the actual repository URL when cloning the project. Ensure `package.json`, `agenttrace.bat`, and the source files are committed to the repository before sharing these instructions.
