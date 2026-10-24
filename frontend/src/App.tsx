
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import type { TraceEvent, RunRecord } from './types';
import { API_BASE } from './config/api';
import { normalizeRun, makeSteps } from './utils/traceUtils';
import HeaderAndSettings from './components/HeaderAndSettings';
import SolvePage from './components/SolvePage';
import HistorySidebar from './components/HistorySidebar';
import ProjectToolbar from './components/ProjectToolbar';
import SnapshotPanel from './components/SnapshotPanel';
import ModelStrip from './components/ModelStrip';
import ExecutionFlow from './components/ExecutionFlow';
import StepInspector from './components/StepInspector';
import ConsoleDock from './components/ConsoleDock';

export default function App() {
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [selectedRunId, setSelectedRunId] = useState('');
  const [selectedStepId, setSelectedStepId] = useState('');
  const [search, setSearch] = useState('');

  const [apiState, setApiState] =
    useState<'checking' | 'connected' | 'offline'>('checking');

  const [page, setPage] =
    useState<'workspace' | 'solve'>('workspace');

  const [folderName, setFolderName] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [selectedFile, setSelectedFile] = useState('sample_pipeline.py');

  const [provider, setProvider] = useState('Ollama (local)');
  const [model, setModel] = useState('qwen2.5-coder:7b');
  const [apiToken, setApiToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const [consoleLines, setConsoleLines] = useState<string[]>([
    'AgentTrace CLI · workspace ready',
    'Select a previous run or upload a project folder.',
    'Tip: choose a failed agent to inspect its error.',
  ]);

  const [command, setCommand] = useState('');
  const [solveLoading, setSolveLoading] = useState(false);
  const [solution, setSolution] = useState('');

  const folderInput = useRef<HTMLInputElement>(null);

  const [scannedProject, setScannedProject] = useState<any>(null);
  const [uploading, setUploading] = useState(false);

  // Saved snapshot inspector state
  const [snapshotFiles, setSnapshotFiles] = useState<any[]>([]);
  const [activeSnapshotFile, setActiveSnapshotFile] = useState('');
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [snapshotError, setSnapshotError] = useState('');

  const selectedRun =
    runs.find(run => run.id === selectedRunId) || runs[0];

  const steps = useMemo(
    () => makeSteps(selectedRun?.events),
    [selectedRun]
  );

  const selectedStep =
    steps.find(step => step.id === selectedStepId) ||
    steps.find(step => step.status === 'failed') ||
    steps[0];

  const filteredRuns = runs.filter(
    run =>
      run.file.toLowerCase().includes(search.toLowerCase()) ||
      run.id.toLowerCase().includes(search.toLowerCase())
  );

  useEffect(() => {
    void refreshRuns();
    void refreshProjects();
  }, []);

  useEffect(() => {
    if (steps.length) {
      setSelectedStepId(
        steps.find(step => step.status === 'failed')?.id ||
        steps[0].id
      );
    } else {
      setSelectedStepId('');
    }
  }, [selectedRunId]);

  async function refreshRuns() {
    try {
      const response = await fetch(`${API_BASE}/api/sessions`);

      if (!response.ok) {
        throw new Error(`API ${response.status}`);
      }

      const payload = await response.json();

      const items = Array.isArray(payload)
        ? payload
        : payload.sessions || payload.data || [];

      const normalized: RunRecord[] = items
        .filter((item: any) => item.session_id || item.id || item._id)
        .map(normalizeRun);

      setRuns(normalized);

      setSelectedRunId(currentId => {
        if (normalized.some(run => run.id === currentId)) {
          return currentId;
        }

        return normalized[0]?.id || '';
      });

      setApiState('connected');

      setConsoleLines(prev => [
        `Loaded ${normalized.length} real runs from the backend.`,
        ...prev.filter(
          line =>
            !line.startsWith('Loaded ') &&
            !line.startsWith('API unavailable')
        ),
      ].slice(0, 30));
    } catch (error) {
      setApiState('offline');

      setConsoleLines(prev => [
        `API unavailable at ${API_BASE}. Check that your backend is running.`,
        ...prev.filter(line => !line.startsWith('API unavailable')),
      ].slice(0, 30));
    }
  }

  // Load all saved projects for the History sidebar.
  async function refreshProjects() {
    try {
      const response = await fetch(`${API_BASE}/api/projects`);

      if (!response.ok) {
        throw new Error(`Projects API ${response.status}`);
      }

      const payload = await response.json();

      const items = Array.isArray(payload)
        ? payload
        : payload.projects || [];

      setProjects(items);
    } catch (error) {
      console.error('Could not load project history:', error);
    }
  }

  async function loadTimeline(run?: RunRecord) {
    if (!run) {
      setConsoleLines(prev => [
        'No run selected. Upload and execute a project first.',
        ...prev,
      ].slice(0, 30));
      return;
    }

    try {
      const response = await fetch(
        `${API_BASE}/api/sessions/${encodeURIComponent(run.id)}/timeline`
      );

      if (!response.ok) {
        throw new Error(`Timeline request failed: ${response.status}`);
      }

      const payload = await response.json();

      const events = Array.isArray(payload)
        ? payload
        : payload.timeline || payload.events || [];

      setRuns(prev =>
        prev.map(oldRun =>
          oldRun.id === run.id
            ? { ...oldRun, events }
            : oldRun
        )
      );

      setConsoleLines(prev => [
        `Loaded ${events.length} trace events for ${run.file}.`,
        ...prev,
      ].slice(0, 30));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);

      setConsoleLines(prev => [
        `Could not load timeline: ${message}`,
        ...prev,
      ].slice(0, 30));
    }
  }

  // Selecting a run closes the currently open project panel.
  function chooseRun(run: RunRecord) {
    setScannedProject(null);
    setSelectedProjectId('');
    setSnapshotFiles([]);
    setActiveSnapshotFile('');
    setSnapshotError('');

    setSelectedRunId(run.id);
    setPage('workspace');

    if (run.events?.length) return;

    void loadTimeline(run);
  }

  // Fetch saved source files for a project or a specific snapshot.
  async function loadProjectSnapshot(
    projectId: string,
    snapshotId?: string
  ) {
    setSnapshotLoading(true);
    setSnapshotError('');
    setSnapshotFiles([]);
    setActiveSnapshotFile('');

    try {
      const url = snapshotId
        ? `${API_BASE}/api/projects/${encodeURIComponent(projectId)}/snapshots/${encodeURIComponent(snapshotId)}`
        : `${API_BASE}/api/projects/${encodeURIComponent(projectId)}`;

      const response = await fetch(url);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail || 'Failed to load project snapshot'
        );
      }

      const savedFiles = Array.isArray(data.files)
        ? data.files
        : [];

      setSnapshotFiles(savedFiles);

      if (savedFiles.length > 0) {
        setActiveSnapshotFile(savedFiles[0].path);
      }
    } catch (error) {
      setSnapshotError(
        error instanceof Error
          ? error.message
          : 'Failed to load snapshot'
      );
    } finally {
      setSnapshotLoading(false);
    }
  }

  async function onFolderChange(
    event: ChangeEvent<HTMLInputElement>
  ) {
    const picked = Array.from(event.target.files || []);

    if (!picked.length) return;

    const root =
      picked[0].webkitRelativePath?.split('/')[0] || 'project';

    setFiles(picked);
    setFolderName(root);
    setUploading(true);

    setScannedProject(null);
    setSelectedProjectId('');
    setSnapshotFiles([]);
    setActiveSnapshotFile('');
    setSnapshotError('');

    setConsoleLines(previous => [
      `Uploading ${picked.length} files from ${root}...`,
      ...previous,
    ].slice(0, 30));

    try {
      const projectFiles = await Promise.all(
        picked
          .filter(file => {
            const path = file.webkitRelativePath || file.name;
            const parts = path.split('/');

            const ignoredDirs = [
              '.git',
              'node_modules',
              '.venv',
              'venv',
              '__pycache__',
              'dist',
              'build',
            ];

            return (
              !parts.some(part => ignoredDirs.includes(part)) &&
              !file.name.startsWith('.env') &&
              file.size <= 1_000_000
            );
          })
          .map(async file => ({
            path:
              (file.webkitRelativePath || file.name)
                .split('/')
                .slice(1)
                .join('/') || file.name,
            content: await file.text(),
          }))
      );

      if (!projectFiles.length) {
        throw new Error(
          'No eligible files found. Check that the folder contains files smaller than 1 MB.'
        );
      }

      const response = await fetch(
        `${API_BASE}/api/projects/scan`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            project_name: root,
            files: projectFiles,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || 'Scan failed');
      }

      setScannedProject(data);
      setSelectedProjectId(data.project_id);

      // Update History immediately after the upload succeeds.
      await refreshProjects();

      setConsoleLines(previous => [
        `Scan complete: ${data.file_count} files`,
        `Python files: ${data.python_file_count}`,
        `Project ID: ${data.project_id}`,
        data.snapshot_id
          ? `Snapshot ID: ${data.snapshot_id}`
          : 'Warning: backend did not return a snapshot ID.',
        ...previous,
      ].slice(0, 30));

      await loadProjectSnapshot(
        data.project_id,
        data.snapshot_id
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);

      setConsoleLines(previous => [
        `Upload failed: ${message}`,
        ...previous,
      ].slice(0, 30));

      setSnapshotError(message);
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  }

  async function runCommand(event?: FormEvent) {
    event?.preventDefault();

    const value = command.trim();

    if (!value) return;

    setConsoleLines(previous =>
      [`agenttrace> ${value}`, ...previous].slice(0, 30)
    );

    setCommand('');

    if (value === 'help') {
      setConsoleLines(previous => [
        'Commands: run <file.py>, history, refresh, help',
        ...previous,
      ].slice(0, 30));
      return;
    }

    if (value === 'history') {
      await refreshRuns();
      await refreshProjects();
      return;
    }

    if (value === 'refresh') {
      await refreshRuns();
      await refreshProjects();
      return;
    }

    if (value.startsWith('run ')) {
      const requested = value.slice(4).trim();

      const exists = files.some(
        file =>
          (file.webkitRelativePath || file.name) === requested ||
          file.name === requested
      );

      setConsoleLines(previous => [
        exists
          ? `Selected ${requested}. Execution endpoint is not connected yet; use the existing CLI to execute this file.`
          : `Cannot execute '${requested}' from the browser yet. Upload the folder first; browser execution needs a backend run endpoint.`,
        ...previous,
      ].slice(0, 30));

      return;
    }

    setConsoleLines(previous => [
      `Unknown command: ${value}. Type help.`,
      ...previous,
    ].slice(0, 30));
  }

  async function solveError() {
    if (!selectedStep) return;

    setPage('solve');
    setSolveLoading(true);
    setSolution('');

    // Frontend-only helper. This is not an LLM call.
    await new Promise(resolve => setTimeout(resolve, 350));

    const exception = selectedStep.exception;
    const variables = selectedStep.variables || {};

    if (
      String(exception?.type).includes('TypeError') &&
      'price' in variables
    ) {
      setSolution(
        'The validator expects a number, but the saved price is a string. Fix the EnricherAgent output so it returns 19.99 as a numeric value (not "$19.99 USD"). Then replay from the validator once state replay is implemented.'
      );
    } else if (
      String(exception?.type).includes('ZeroDivisionError')
    ) {
      setSolution(
        'The denominator is zero. Check the calculation that produces the count and ensure it reflects the actual number of values being averaged.'
      );
    } else {
      setSolution(
        `Inspect the exception and the variables captured at line ${selectedStep.line || 'unknown'}. Compare the value types with what this step expects. The automated solve endpoint is not connected yet.`
      );
    }

    setSolveLoading(false);
  }

  const runStatus = selectedRun?.status || 'RUNNING';
  const failedCount = runs.filter(run => run.status === 'FAILED').length;
  const passedCount = runs.filter(run => run.status === 'PASSED').length;

  const sharedProps = {
    API_BASE,
    apiState,
    refreshRuns,
    refreshProjects,
    projects,
    selectedProjectId,
    setSelectedProjectId,

    showSettings,
    setShowSettings,
    provider,
    setProvider,
    model,
    setModel,
    apiToken,
    setApiToken,
    showToken,
    setShowToken,

    page,
    setPage,
    selectedRun,
    selectedRunId,
    setSelectedRunId,
    selectedStep,
    selectedStepId,
    setSelectedStepId,
    steps,
    runs,
    filteredRuns,
    search,
    setSearch,
    failedCount,
    passedCount,
    runStatus,

    folderName,
    setFolderName,
    files,
    setFiles,
    selectedFile,
    setSelectedFile,

    consoleLines,
    setConsoleLines,
    command,
    setCommand,
    solveLoading,
    solution,
    solveError,
    folderInput,

    scannedProject,
    setScannedProject,
    uploading,
    snapshotFiles,
    activeSnapshotFile,
    setActiveSnapshotFile,
    snapshotLoading,
    snapshotError,
    setSnapshotError,
    onFolderChange,
    loadProjectSnapshot,
    loadTimeline,
    chooseRun,
    runCommand,

    setRuns,
    setApiState,
    setSnapshotFiles,
    setSnapshotLoading,
    setSolution,
    setSolveLoading,
  };

  return (
    <div className="app-shell">
      <HeaderAndSettings {...sharedProps} />

      {page === 'solve' ? (
        <SolvePage {...sharedProps} />
      ) : (
        <div className="workspace">
          <HistorySidebar {...sharedProps} />

          <main className="main-workspace">
            <ProjectToolbar {...sharedProps} />
            <SnapshotPanel {...sharedProps} />
            <ModelStrip {...sharedProps} />
            <ExecutionFlow {...sharedProps} />
            <StepInspector {...sharedProps} />
          </main>
        </div>
      )}

      <ConsoleDock {...sharedProps} />

      <footer className="footer">
        <span>
          AgentTrace · Developer tools for debugging agent workflows
        </span>

        <span>
          <span className={`connection-dot ${apiState}`} />{' '}
          {apiState === 'connected'
            ? 'Connected'
            : apiState === 'checking'
              ? 'Connecting'
              : 'Demo mode'}
        </span>
      </footer>
    </div>
  );
}
