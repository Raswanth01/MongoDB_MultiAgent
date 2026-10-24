import { Activity, AlertCircle, ArrowDown, ArrowLeft, ArrowRight, Bot, Check, CheckCircle2, ChevronDown, Clock3, Code2, Command, FileCode2, FolderUp, GitBranch, History, KeyRound, LoaderCircle, Play, Plus, RefreshCw, Search, Settings2, ShieldCheck, Sparkles, Terminal, X, Wrench, XCircle } from 'lucide-react';

type Props = any;
import { safeJson } from '../utils/traceUtils';

export default function SolvePage(props: Props) {
  const { API_BASE, apiState, refreshRuns, showSettings, setShowSettings, provider, setProvider, model, setModel, apiToken, setApiToken, showToken, setShowToken, page, setPage, selectedRun, selectedRunId, setSelectedRunId, selectedStep, selectedStepId, setSelectedStepId, steps, runs, filteredRuns, search, setSearch, failedCount, passedCount, runStatus, folderName, setFolderName, files, setFiles, selectedFile, setSelectedFile, consoleLines, setConsoleLines, command, setCommand, solveLoading, solution, solveError, folderInput, scannedProject, setScannedProject, uploading, snapshotFiles, activeSnapshotFile, setActiveSnapshotFile, snapshotLoading, snapshotError, setSnapshotError, onFolderChange, loadProjectSnapshot, loadTimeline, chooseRun, runCommand, setRuns, setApiState, setSnapshotFiles, setSnapshotLoading, setSolution, setSolveLoading } = props;
  return (
    <>
        <main className="solve-page">
          <button
            className="back-link"
            onClick={() => setPage('workspace')}
          >
            <ArrowLeft size={16} /> Back to process flow
          </button>

          <div className="solve-heading">
            <div className="solve-icon">
              <Wrench size={23} />
            </div>
            <div>
              <div className="eyebrow">
                DEBUG ASSISTANT / {selectedStep?.name || 'STEP'}
              </div>
              <h1>Investigate failure</h1>
              <p>
                Review the captured error and proposed fix before applying anything.
              </p>
            </div>
          </div>

          <div className="solve-grid">
            <section className="panel error-panel">
              <div className="panel-title">
                <AlertCircle size={17} className="danger-text" />
                <h3>Error details</h3>
                <span className="pill failed">FAILED</span>
              </div>

              <div className="error-type">
                {selectedStep?.exception?.type || 'Execution error'}
              </div>

              <p className="error-message">
                {selectedStep?.exception?.message ||
                  selectedRun?.raw?.exception_message ||
                  'No exception message was saved for this event.'}
              </p>

              <div className="code-location">
                <span>LOCATION</span>
                <strong>
                  {selectedStep?.functionName ||
                    selectedStep?.name ||
                    'Unknown function'}
                  {selectedStep?.line ? ` · line ${selectedStep.line}` : ''}
                </strong>
                <pre>
                  {selectedStep?.source ||
                    'Source line was not included in the saved trace.'}
                </pre>
              </div>

              <h4>Captured variables</h4>
              <pre className="code-block">
                {safeJson(selectedStep?.variables || {})}
              </pre>
            </section>

            <section className="panel solution-panel">
              <div className="panel-title">
                <Sparkles size={17} />
                <h3>Suggested solution</h3>
                <span className="pill draft">REVIEW FIRST</span>
              </div>

              {solveLoading ? (
                <div className="loading-state">
                  <LoaderCircle className="spin" />
                  Analysing saved error…
                </div>
              ) : solution ? (
                <>
                  <p className="solution-copy">{solution}</p>
                  <div className="notice">
                    <ShieldCheck size={16} />
                    This is a suggestion only. No source files have been modified and no replay has been run.
                  </div>
                  <button
                    className="primary-btn"
                    onClick={() => {
                      setPage('workspace');
                      setConsoleLines(previous =>
                        [
                          'Solution reviewed. Automatic patching and replay are not connected yet.',
                          ...previous
                        ].slice(0, 30)
                      );
                    }}
                  >
                    <ArrowLeft size={16} /> Return to run
                  </button>
                </>
              ) : (
                <button
                  className="primary-btn"
                  onClick={() => void solveError()}
                >
                  <Sparkles size={16} /> Suggest a fix
                </button>
              )}
            </section>
          </div>
        </main>
    </>
  );
}
