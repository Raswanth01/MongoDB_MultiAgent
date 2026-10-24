import { Activity, AlertCircle, ArrowDown, ArrowLeft, ArrowRight, Bot, Check, CheckCircle2, ChevronDown, Clock3, Code2, Command, FileCode2, FolderUp, GitBranch, History, KeyRound, LoaderCircle, Play, Plus, RefreshCw, Search, Settings2, ShieldCheck, Sparkles, Terminal, X, Wrench, XCircle } from 'lucide-react';

type Props = any;

export default function ModelStrip(props: Props) {
  const { API_BASE, apiState, refreshRuns, showSettings, setShowSettings, provider, setProvider, model, setModel, apiToken, setApiToken, showToken, setShowToken, page, setPage, selectedRun, selectedRunId, setSelectedRunId, selectedStep, selectedStepId, setSelectedStepId, steps, runs, filteredRuns, search, setSearch, failedCount, passedCount, runStatus, folderName, setFolderName, files, setFiles, selectedFile, setSelectedFile, consoleLines, setConsoleLines, command, setCommand, solveLoading, solution, solveError, folderInput, scannedProject, setScannedProject, uploading, snapshotFiles, activeSnapshotFile, setActiveSnapshotFile, snapshotLoading, snapshotError, setSnapshotError, onFolderChange, loadProjectSnapshot, loadTimeline, chooseRun, runCommand, setRuns, setApiState, setSnapshotFiles, setSnapshotLoading, setSolution, setSolveLoading } = props;
  return (
    <>
            <div className="model-strip">
              <div className="model-cell">
                <Bot size={16} />
                <span>Provider</span>
                <strong>{provider}</strong>
              </div>

              <div className="model-cell">
                <Code2 size={16} />
                <span>Model</span>
                <strong>{model || 'Not configured'}</strong>
              </div>

              <div className="model-cell">
                <KeyRound size={16} />
                <span>Credentials</span>
                <strong>
                  {apiToken ? 'Token entered in tab' : 'Not connected'}
                </strong>
              </div>

              <button
                className="configure-link"
                onClick={() => setShowSettings(true)}
              >
                Configure <ArrowRight size={14} />
              </button>
            </div>
    </>
  );
}
