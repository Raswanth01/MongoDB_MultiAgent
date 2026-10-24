import { Activity, AlertCircle, ArrowDown, ArrowLeft, ArrowRight, Bot, Check, CheckCircle2, ChevronDown, Clock3, Code2, Command, FileCode2, FolderUp, GitBranch, History, KeyRound, LoaderCircle, Play, Plus, RefreshCw, Search, Settings2, ShieldCheck, Sparkles, Terminal, X, Wrench, XCircle } from 'lucide-react';

type Props = any;
import { safeJson } from '../utils/traceUtils';

export default function StepInspector(props: Props) {
  const { API_BASE, apiState, refreshRuns, showSettings, setShowSettings, provider, setProvider, model, setModel, apiToken, setApiToken, showToken, setShowToken, page, setPage, selectedRun, selectedRunId, setSelectedRunId, selectedStep, selectedStepId, setSelectedStepId, steps, runs, filteredRuns, search, setSearch, failedCount, passedCount, runStatus, folderName, setFolderName, files, setFiles, selectedFile, setSelectedFile, consoleLines, setConsoleLines, command, setCommand, solveLoading, solution, solveError, folderInput, scannedProject, setScannedProject, uploading, snapshotFiles, activeSnapshotFile, setActiveSnapshotFile, snapshotLoading, snapshotError, setSnapshotError, onFolderChange, loadProjectSnapshot, loadTimeline, chooseRun, runCommand, setRuns, setApiState, setSnapshotFiles, setSnapshotLoading, setSolution, setSolveLoading } = props;
  return (
    <>
            {selectedStep && (
              <section className="detail-section">
                <div className="section-heading">
                  <div>
                    <span className="eyebrow">STEP INSPECTOR</span>
                    <h2>{selectedStep.name}</h2>
                  </div>

                  <span className={`pill ${selectedStep.status}`}>
                    {selectedStep.status.toUpperCase()}
                  </span>
                </div>

                <div className="detail-grid">
                  <div className="panel detail-main">
                    <div className="tab-title">
                      <span>
                        <Command size={15} /> Agent details
                      </span>
                      <span className="muted">
                        Event {selectedStep.id.slice(0, 10)}
                      </span>
                    </div>

                    <div className="detail-block">
                      <label>Prompt / input</label>
                      <pre>
                        {selectedStep.prompt
                          ? String(selectedStep.prompt)
                          : 'No prompt was saved for this event.'}
                      </pre>
                    </div>

                    <div className="detail-block">
                      <label>Result / output</label>
                      <pre>
                        {selectedStep.result === undefined
                          ? 'No result was saved for this event.'
                          : safeJson(selectedStep.result)}
                      </pre>
                    </div>

                    {selectedStep.source && (
                      <div className="detail-block">
                        <label>
                          Executed source line
                          {selectedStep.line
                            ? ` · ${selectedStep.line}`
                            : ''}
                        </label>
                        <pre className="source-line">
                          {selectedStep.source}
                        </pre>
                      </div>
                    )}
                  </div>

                  <div className="panel detail-side">
                    <div className="panel-title">
                      <Activity size={16} />
                      <h3>Runtime state</h3>
                    </div>

                    <div className="mini-stat">
                      <span>Function</span>
                      <strong>
                        {selectedStep.functionName || '—'}
                      </strong>
                    </div>

                    <div className="mini-stat">
                      <span>Line</span>
                      <strong>{selectedStep.line ?? '—'}</strong>
                    </div>

                    <div className="detail-block">
                      <label>Variables at this step</label>
                      <pre className="code-block">
                        {safeJson(selectedStep.variables || {})}
                      </pre>
                    </div>

                    {selectedStep.status === 'failed' && (
                      <>
                        <div className="error-summary">
                          <AlertCircle size={16} />
                          <div>
                            <strong>
                              {selectedStep.exception?.type ||
                                'Execution failed'}
                            </strong>
                            <p>
                              {selectedStep.exception?.message ||
                                'Inspect the error details to diagnose this step.'}
                            </p>
                          </div>
                        </div>

                        <button
                          className="primary-btn full-btn"
                          onClick={() => void solveError()}
                        >
                          <Sparkles size={16} />
                          Solve this error
                          <ArrowRight size={15} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </section>
            )}
    </>
  );
}
