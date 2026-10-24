import { Activity, AlertCircle, ArrowDown, ArrowLeft, ArrowRight, Bot, Check, CheckCircle2, ChevronDown, Clock3, Code2, Command, FileCode2, FolderUp, GitBranch, History, KeyRound, LoaderCircle, Play, Plus, RefreshCw, Search, Settings2, ShieldCheck, Sparkles, Terminal, X, Wrench, XCircle } from 'lucide-react';

type Props = any;

export default function ProjectToolbar(props: Props) {
  const { API_BASE, apiState, refreshRuns, showSettings, setShowSettings, provider, setProvider, model, setModel, apiToken, setApiToken, showToken, setShowToken, page, setPage, selectedRun, selectedRunId, setSelectedRunId, selectedStep, selectedStepId, setSelectedStepId, steps, runs, filteredRuns, search, setSearch, failedCount, passedCount, runStatus, folderName, setFolderName, files, setFiles, selectedFile, setSelectedFile, consoleLines, setConsoleLines, command, setCommand, solveLoading, solution, solveError, folderInput, scannedProject, setScannedProject, uploading, snapshotFiles, activeSnapshotFile, setActiveSnapshotFile, snapshotLoading, snapshotError, setSnapshotError, onFolderChange, loadProjectSnapshot, loadTimeline, chooseRun, runCommand, setRuns, setApiState, setSnapshotFiles, setSnapshotLoading, setSolution, setSolveLoading } = props;
  return (
    <>
            <div className="project-toolbar">
              <div className="project-title">
                <div className="file-icon">
                  <FileCode2 size={20} />
                </div>
                <div>
                  <div className="eyebrow">SELECTED RUN</div>
                  <h1>{selectedRun?.file || 'Choose a run'}</h1>
                  <span className="run-id">{selectedRun?.id}</span>
                </div>
              </div>

              <div className="project-actions">
                <span className={`pill ${runStatus.toLowerCase()}`}>
                  {runStatus === 'FAILED' ? (
                    <AlertCircle size={13} />
                  ) : runStatus === 'PASSED' ? (
                    <CheckCircle2 size={13} />
                  ) : (
                    <Clock3 size={13} />
                  )}
                  {runStatus}
                </span>

                <button
                  className="secondary-btn"
                  onClick={() => void loadTimeline(selectedRun)}
                >
                  <RefreshCw size={15} /> Reload timeline
                </button>
              </div>
            </div>
    </>
  );
}
