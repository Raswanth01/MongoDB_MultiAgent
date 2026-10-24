import { Activity, AlertCircle, ArrowDown, ArrowLeft, ArrowRight, Bot, Check, CheckCircle2, ChevronDown, Clock3, Code2, Command, FileCode2, FolderUp, GitBranch, History, KeyRound, LoaderCircle, Play, Plus, RefreshCw, Search, Settings2, ShieldCheck, Sparkles, Terminal, X, Wrench, XCircle } from 'lucide-react';

type Props = any;

export default function ExecutionFlow(props: Props) {
  const { API_BASE, apiState, refreshRuns, showSettings, setShowSettings, provider, setProvider, model, setModel, apiToken, setApiToken, showToken, setShowToken, page, setPage, selectedRun, selectedRunId, setSelectedRunId, selectedStep, selectedStepId, setSelectedStepId, steps, runs, filteredRuns, search, setSearch, failedCount, passedCount, runStatus, folderName, setFolderName, files, setFiles, selectedFile, setSelectedFile, consoleLines, setConsoleLines, command, setCommand, solveLoading, solution, solveError, folderInput, scannedProject, setScannedProject, uploading, snapshotFiles, activeSnapshotFile, setActiveSnapshotFile, snapshotLoading, snapshotError, setSnapshotError, onFolderChange, loadProjectSnapshot, loadTimeline, chooseRun, runCommand, setRuns, setApiState, setSnapshotFiles, setSnapshotLoading, setSolution, setSolveLoading } = props;
  return (
    <>
            <section className="flow-section">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">EXECUTION GRAPH</span>
                  <h2>Process flow</h2>
                </div>

                <div className="flow-legend">
                  <span>
                    <i className="legend-dot passed" /> Passed
                  </span>
                  <span>
                    <i className="legend-dot failed" /> Failed
                  </span>
                  <span>
                    <i className="legend-dot pending" /> Not reached
                  </span>
                </div>
              </div>

              {steps.length ? (
                <div className="flow-canvas">
                  <div className="flow-line" />

                  {steps.map((step, index) => (
                    <div className="flow-node-wrap" key={step.id}>
                      <button
                        className={`flow-node ${step.status} ${
                          selectedStep?.id === step.id ? 'active' : ''
                        }`}
                        onClick={() => setSelectedStepId(step.id)}
                      >
                        <div className="node-top">
                          <span className="node-index">
                            {String(index + 1).padStart(2, '0')}
                          </span>
                          <span className="node-status">
                            {step.status === 'passed' ? (
                              <Check size={13} />
                            ) : step.status === 'failed' ? (
                              <X size={13} />
                            ) : (
                              <Circle size={12} />
                            )}
                          </span>
                        </div>

                        <div className="node-icon">
                          {step.status === 'passed' ? (
                            <Bot size={20} />
                          ) : step.status === 'failed' ? (
                            <AlertCircle size={20} />
                          ) : (
                            <GitBranch size={20} />
                          )}
                        </div>

                        <strong>{step.name}</strong>

                        <span className="node-subtitle">
                          {step.functionName ||
                            (step.status === 'failed'
                              ? 'Needs attention'
                              : step.status === 'pending'
                                ? 'Not executed'
                                : 'Completed')}
                        </span>

                        {step.line && (
                          <span className="node-line">
                            Line {step.line}
                          </span>
                        )}
                      </button>

                      {index < steps.length - 1 && (
                        <div className="flow-connector">
                          <ArrowDown size={16} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <GitBranch size={28} />
                  <h3>No execution trace yet</h3>
                  <p>
                    Select a run from history and load its timeline.
                    Detailed agent cards appear when agent events are saved.
                  </p>
                  <button
                    className="secondary-btn"
                    onClick={() => void loadTimeline(selectedRun)}
                  >
                    <RefreshCw size={15} /> Load timeline
                  </button>
                </div>
              )}
            </section>
    </>
  );
}
