
import {
  CheckCircle2,
  ChevronDown,
  Clock3,
  FolderOpen,
  FolderUp,
  History,
  LoaderCircle,
  Plus,
  Search,
  XCircle,
} from 'lucide-react';
import { useState } from 'react';

type Props = any;

export default function HistorySidebar(props: Props) {
  const {
    API_BASE,
    runs = [],
    filteredRuns = [],
    selectedRunId,
    search = '',
    setSearch,
    failedCount,
    passedCount,
    folderInput,
    uploading,
    onFolderChange,
    chooseRun,
    projects = [],
    selectedProjectId,
    setSelectedProjectId,
    setScannedProject,
    loadProjectSnapshot,
    setPage,
    setSnapshotFiles,
    setSnapshotError,
    setActiveSnapshotFile,
  } = props;

  const [openingProjectId, setOpeningProjectId] = useState('');
  const [projectError, setProjectError] = useState('');

  async function openProject(project: any) {
    const projectId = project.project_id;

    if (!projectId) {
      setProjectError('This project has no project ID. Try uploading it again.');
      return;
    }

    setOpeningProjectId(projectId);
    setProjectError('');
    setSelectedProjectId(projectId);
    setScannedProject(null);
    setSnapshotFiles([]);
    setActiveSnapshotFile('');
    setSnapshotError('');
    setPage('workspace');

    try {
      const response = await fetch(
        `${API_BASE}/api/projects/${encodeURIComponent(projectId)}`
      );

      const responseText = await response.text();
      let data: any = {};

      try {
        data = responseText ? JSON.parse(responseText) : {};
      } catch {
        throw new Error(
          `The server returned an invalid response (HTTP ${response.status}).`
        );
      }

      if (!response.ok) {
        throw new Error(
          data.detail ||
            `Could not open project (HTTP ${response.status}).`
        );
      }

      const savedProject = data.project || data;
      const snapshotId =
        project.latest_snapshot_id ||
        savedProject.latest_snapshot_id ||
        savedProject.snapshot_id ||
        '';

      setScannedProject({
        ...savedProject,
        project_id: projectId,
        project_name:
          project.project_name ||
          savedProject.project_name ||
          'Untitled project',
        snapshot_id: snapshotId,
        file_count:
          project.file_count ?? savedProject.file_count ?? data.files?.length ?? 0,
        python_file_count:
          project.python_file_count ??
          savedProject.python_file_count ??
          0,
      });

      if (snapshotId) {
        await loadProjectSnapshot(projectId, snapshotId);
      } else if (Array.isArray(data.files)) {
        setSnapshotFiles(data.files);
        if (data.files.length === 0) {
          setProjectError(
            'The project opened, but no saved files or snapshot were returned.'
          );
        }
      } else {
        setProjectError(
          'The project opened, but the server did not return a snapshot ID or file list.'
        );
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Could not open saved project';

      setProjectError(message);
      setSnapshotError(message);
    } finally {
      setOpeningProjectId('');
    }
  }

  function handleChooseRun(run: any) {
    setProjectError('');
    setScannedProject(null);
    setSelectedProjectId('');
    setSnapshotFiles([]);
    setActiveSnapshotFile('');
    setSnapshotError('');
    chooseRun(run);
  }

  const matchingProjects = projects.filter((project: any) =>
    (project.project_name || 'Untitled project')
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  return (
    <aside className="history-sidebar">
      <div className="sidebar-heading">
        <div>
          <span className="eyebrow">WORKSPACE</span>
          <h2>History</h2>
        </div>

        <button
          type="button"
          className="icon-btn"
          title="Upload project folder"
          onClick={() => folderInput.current?.click()}
          disabled={uploading}
        >
          <Plus size={18} />
        </button>
      </div>

      <div className="history-search">
        <Search size={15} />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search projects and runs..."
        />
      </div>

      <div className="sidebar-section-heading">
        <FolderOpen size={15} />
        <span>PROJECTS</span>
        <span className="section-count">{projects.length}</span>
      </div>

      {projectError && (
        <div
          role="alert"
          style={{
            margin: '8px 10px',
            padding: '10px',
            borderRadius: '8px',
            color: 'var(--danger, #dc5555)',
            background: 'var(--danger-bg, rgba(220, 85, 85, 0.08))',
            fontSize: '12px',
            overflowWrap: 'anywhere',
          }}
        >
          {projectError}
        </div>
      )}

      <div className="history-list project-history-list">
        {matchingProjects.length > 0 ? (
          matchingProjects.map((project: any) => {
            const isOpening = openingProjectId === project.project_id;

            return (
              <button
                key={project.project_id}
                type="button"
                className={`history-item ${
                  selectedProjectId === project.project_id ? 'selected' : ''
                }`}
                onClick={() => void openProject(project)}
                disabled={Boolean(openingProjectId)}
                aria-busy={isOpening}
              >
                <div className="history-status">
                  {isOpening ? (
                    <LoaderCircle size={15} className="spin" />
                  ) : (
                    <FolderOpen size={15} />
                  )}
                </div>

                <div className="history-info">
                  <strong>
                    {project.project_name || 'Untitled project'}
                  </strong>
                  <span>
                    {isOpening
                      ? 'Opening project...'
                      : `${project.file_count ?? 0} files${
                          project.python_file_count != null
                            ? ` · ${project.python_file_count} Python`
                            : ''
                        }`}
                  </span>
                </div>

                <ChevronDown size={14} className="history-chevron" />
              </button>
            );
          })
        ) : (
          <div className="history-empty-projects">
            <FolderOpen size={20} />
            <span>
              {projects.length === 0
                ? 'No saved projects yet'
                : 'No matching projects'}
            </span>
          </div>
        )}
      </div>

      <div className="sidebar-section-heading">
        <History size={15} />
        <span>RUN HISTORY</span>
      </div>

      <div className="history-stats">
        <div>
          <strong>{runs.length}</strong>
          <span>Total runs</span>
        </div>
        <div>
          <strong className="danger-text">{failedCount}</strong>
          <span>Failed</span>
        </div>
        <div>
          <strong className="success-text">{passedCount}</strong>
          <span>Passed</span>
        </div>
      </div>

      <div className="history-list">
        {filteredRuns.length > 0 ? (
          filteredRuns.map((run: any) => (
            <button
              key={run.id}
              type="button"
              className={`history-item ${
                selectedRunId === run.id ? 'selected' : ''
              }`}
              onClick={() => handleChooseRun(run)}
            >
              <div className={`history-status ${run.status.toLowerCase()}`}>
                {run.status === 'PASSED' ? (
                  <CheckCircle2 size={15} />
                ) : run.status === 'FAILED' ? (
                  <XCircle size={15} />
                ) : (
                  <Clock3 size={15} />
                )}
              </div>

              <div className="history-info">
                <strong>{run.file}</strong>
                <span>{run.time}</span>

                <div className="history-meta">
                  <span className={`text-status ${run.status.toLowerCase()}`}>
                    {run.status}
                  </span>
                  {run.duration && <span>{run.duration}</span>}
                </div>
              </div>

              <ChevronDown size={14} className="history-chevron" />
            </button>
          ))
        ) : (
          <div className="empty-state">
            <History size={25} />
            <h3>No runs yet</h3>
            <p>
              Execute a project using the AgentTrace CLI to generate execution
              history.
            </p>
          </div>
        )}
      </div>

      <div className="sidebar-bottom">
        <button
          type="button"
          className="upload-folder-btn"
          onClick={() => folderInput.current?.click()}
          disabled={uploading}
        >
          <FolderUp size={17} />
          {uploading ? 'Scanning project...' : 'Upload project folder'}
        </button>

        <input
          ref={folderInput}
          type="file"
          multiple
          style={{ display: 'none' }}
          onChange={onFolderChange}
          {...({ webkitdirectory: '', directory: '' } as any)}
        />

        <p>
          {uploading
            ? 'Uploading and scanning files...'
            : 'Uploaded projects are saved in your backend.'}
        </p>
      </div>
    </aside>
  );
}
