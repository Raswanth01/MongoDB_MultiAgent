import { Activity, AlertCircle, ArrowDown, ArrowLeft, ArrowRight, Bot, Check, CheckCircle2, ChevronDown, Clock3, Code2, Command, FileCode2, FolderUp, GitBranch, History, KeyRound, LoaderCircle, Play, Plus, RefreshCw, Search, Settings2, ShieldCheck, Sparkles, Terminal, X, Wrench, XCircle } from 'lucide-react';

type Props = any;

export default function HeaderAndSettings(props: Props) {
  const { API_BASE, apiState, refreshRuns, showSettings, setShowSettings, provider, setProvider, model, setModel, apiToken, setApiToken, showToken, setShowToken, page, setPage, selectedRun, selectedRunId, setSelectedRunId, selectedStep, selectedStepId, setSelectedStepId, steps, runs, filteredRuns, search, setSearch, failedCount, passedCount, runStatus, folderName, setFolderName, files, setFiles, selectedFile, setSelectedFile, consoleLines, setConsoleLines, command, setCommand, solveLoading, solution, solveError, folderInput, scannedProject, setScannedProject, uploading, snapshotFiles, activeSnapshotFile, setActiveSnapshotFile, snapshotLoading, snapshotError, setSnapshotError, onFolderChange, loadProjectSnapshot, loadTimeline, chooseRun, runCommand, setRuns, setApiState, setSnapshotFiles, setSnapshotLoading, setSolution, setSolveLoading } = props;
  return (
    <>
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">
            <Activity size={19} />
          </div>
          <div>
            <strong>AgentTrace</strong>
            <span>TIME-TRAVEL DEBUGGER</span>
          </div>
        </div>

        <div className="topbar-center">
          <span className={`connection-dot ${apiState}`}></span>
          <span>
            {apiState === 'connected'
              ? 'Backend connected'
              : apiState === 'checking'
                ? 'Connecting…'
                : 'Demo mode'}
          </span>
          <span className="top-separator" />
          <span className="muted">{API_BASE}</span>
        </div>

        <div className="top-actions">
          <button
            className="icon-btn"
            title="Refresh history"
            onClick={() => void refreshRuns()}
          >
            <RefreshCw size={16} />
          </button>
          <button
            className="secondary-btn"
            onClick={() => setShowSettings(!showSettings)}
          >
            <Settings2 size={16} /> Settings
          </button>
        </div>
      </header>

      {showSettings && (
        <section className="settings-panel">
          <div className="settings-head">
            <div>
              <strong>Model & credentials</strong>
              <p>
                Credentials stay in this tab's memory and are not sent
                anywhere by this demo UI.
              </p>
            </div>
            <button
              className="icon-btn"
              onClick={() => setShowSettings(false)}
            >
              <X size={16} />
            </button>
          </div>

          <div className="settings-grid">
            <label>
              Provider
              <select
                value={provider}
                onChange={event => setProvider(event.target.value)}
              >
                <option>Ollama (local)</option>
                <option>OpenAI-compatible API</option>
                <option>Anthropic</option>
                <option>AMD local model</option>
              </select>
            </label>

            <label>
              Model name
              <input
                value={model}
                onChange={event => setModel(event.target.value)}
                placeholder="Model name"
              />
            </label>

            <label className="token-label">
              API token <span>(optional)</span>
              <div className="token-field">
                <input
                  type={showToken ? 'text' : 'password'}
                  value={apiToken}
                  onChange={event => setApiToken(event.target.value)}
                  placeholder="Paste token for this tab only"
                />
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => setShowToken(!showToken)}
                >
                  {showToken ? <X size={14} /> : <KeyRound size={14} />}
                </button>
              </div>
            </label>

            <div className="settings-note">
              <ShieldCheck size={16} />
              Token is only held in frontend memory. Provider calls are not wired yet.
            </div>
          </div>
        </section>
      )}
    </>
  );
}
