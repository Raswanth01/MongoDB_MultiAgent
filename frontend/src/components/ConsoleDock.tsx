import { Activity, AlertCircle, ArrowDown, ArrowLeft, ArrowRight, Bot, Check, CheckCircle2, ChevronDown, Clock3, Code2, Command, FileCode2, FolderUp, GitBranch, History, KeyRound, LoaderCircle, Play, Plus, RefreshCw, Search, Settings2, ShieldCheck, Sparkles, Terminal, X, Wrench, XCircle } from 'lucide-react';

type Props = any;

export default function ConsoleDock(props: Props) {
  const { API_BASE, apiState, refreshRuns, showSettings, setShowSettings, provider, setProvider, model, setModel, apiToken, setApiToken, showToken, setShowToken, page, setPage, selectedRun, selectedRunId, setSelectedRunId, selectedStep, selectedStepId, setSelectedStepId, steps, runs, filteredRuns, search, setSearch, failedCount, passedCount, runStatus, folderName, setFolderName, files, setFiles, selectedFile, setSelectedFile, consoleLines, setConsoleLines, command, setCommand, solveLoading, solution, solveError, folderInput, scannedProject, setScannedProject, uploading, snapshotFiles, activeSnapshotFile, setActiveSnapshotFile, snapshotLoading, snapshotError, setSnapshotError, onFolderChange, loadProjectSnapshot, loadTimeline, chooseRun, runCommand, setRuns, setApiState, setSnapshotFiles, setSnapshotLoading, setSolution, setSolveLoading } = props;
  return (
    <>
      <section className="console-dock">
        <div className="console-header">
          <div>
            <Terminal size={16} />
            <strong>AgentTrace CLI</strong>
            <span className="console-dot" />
          </div>

          <div className="console-actions">
            <span>Interactive console</span>
            <button
              className="icon-btn small"
              title="Clear console"
              onClick={() => setConsoleLines([])}
            >
              <X size={14} />
            </button>
          </div>
        </div>

        <div className="console-body">
          <div className="console-output">
            {consoleLines.slice(0, 5).map((line, index) => (
              <div
                key={`${line}-${index}`}
                className={
                  line.startsWith('agenttrace>')
                    ? 'command-line'
                    : line.toLowerCase().includes('unavailable')
                      ? 'console-warn'
                      : ''
                }
              >
                {line}
              </div>
            ))}
          </div>

          <form
            className="console-input-row"
            onSubmit={runCommand}
          >
            <span className="prompt">agenttrace &gt;</span>

            <input
              value={command}
              onChange={event => setCommand(event.target.value)}
              placeholder="Type help, history, refresh, or run <file.py>…"
            />

            <button type="submit" disabled={!command.trim()}>
              <Play size={14} /> Run
            </button>
          </form>
        </div>
      </section>
    </>
  );
}
