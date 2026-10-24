
import {
  CheckCircle2,
  FileCode2,
  LoaderCircle,
  RefreshCw,
} from 'lucide-react';

type Props = any;

export default function SnapshotPanel(props: Props) {
  const {
    scannedProject,
    snapshotFiles = [],
    activeSnapshotFile,
    setActiveSnapshotFile,
    snapshotLoading,
    snapshotError,
    loadProjectSnapshot,
  } = props;

  if (!scannedProject) return null;

  const activeFile = snapshotFiles.find(
    (file: any) => file.path === activeSnapshotFile
  );

  return (
    <section
      className="panel scanned-project-panel"
      style={{ marginBottom: 20, padding: 20 }}
    >
      <div className="panel-title">
        <CheckCircle2 size={18} />
        <h3>{scannedProject.project_name || 'Saved project'}</h3>
        <span className="pill passed">SNAPSHOT SAVED</span>
      </div>

      <p>
        {scannedProject.file_count ?? snapshotFiles.length} files
        {scannedProject.python_file_count != null
          ? ` · ${scannedProject.python_file_count} Python files`
          : ''}
      </p>

      {scannedProject.project_id && (
        <p>
          Project ID: <code>{scannedProject.project_id}</code>
        </p>
      )}

      {scannedProject.snapshot_id && (
        <p>
          Snapshot ID: <code>{scannedProject.snapshot_id}</code>
        </p>
      )}

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          marginTop: 18,
        }}
      >
        <h4 style={{ margin: 0 }}>Saved source files</h4>

        <button
          type="button"
          className="secondary-btn"
          disabled={snapshotLoading || !scannedProject.project_id}
          onClick={() =>
            void loadProjectSnapshot(
              scannedProject.project_id,
              scannedProject.snapshot_id
            )
          }
        >
          <RefreshCw size={14} />
          {' '}Reload snapshot
        </button>
      </div>

      {snapshotLoading && (
        <p style={{ marginTop: 12 }}>
          <LoaderCircle
            size={14}
            className="spin"
            style={{ verticalAlign: 'middle', marginRight: 6 }}
          />
          Loading saved files...
        </p>
      )}

      {snapshotError && (
        <p className="danger-text" style={{ marginTop: 12 }}>
          {snapshotError}
        </p>
      )}

      {!snapshotLoading && !snapshotError && snapshotFiles.length === 0 && (
        <p style={{ marginTop: 12 }}>
          This project has no saved files to display.
        </p>
      )}

      {snapshotFiles.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(180px, 1fr) minmax(0, 2fr)',
            gap: 14,
            marginTop: 12,
          }}
        >
          <div
            style={{
              border: '1px solid #333',
              borderRadius: 8,
              padding: 8,
              maxHeight: 360,
              overflowY: 'auto',
              minWidth: 0,
            }}
          >
            {snapshotFiles.map((file: any) => (
              <button
                key={file.path}
                type="button"
                onClick={() => setActiveSnapshotFile(file.path)}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: 10,
                  marginBottom: 4,
                  textAlign: 'left',
                  border: 'none',
                  borderRadius: 6,
                  cursor: 'pointer',
                  background:
                    activeSnapshotFile === file.path
                      ? 'rgba(100, 150, 255, 0.2)'
                      : 'transparent',
                  color: 'inherit',
                  overflowWrap: 'anywhere',
                }}
              >
                <FileCode2
                  size={14}
                  style={{ marginRight: 7, verticalAlign: 'middle' }}
                />
                {file.path}
              </button>
            ))}
          </div>

          <div
            style={{
              border: '1px solid #333',
              borderRadius: 8,
              overflow: 'hidden',
              minWidth: 0,
            }}
          >
            {activeFile ? (
              <>
                <div
                  style={{
                    padding: 12,
                    borderBottom: '1px solid #333',
                  }}
                >
                  <strong style={{ overflowWrap: 'anywhere' }}>
                    {activeFile.path}
                  </strong>

                  <div
                    style={{
                      fontSize: 12,
                      opacity: 0.7,
                      marginTop: 4,
                    }}
                  >
                    {activeFile.size_bytes ?? '—'} bytes ·{' '}
                    {activeFile.language || 'Unknown language'}
                  </div>

                  {activeFile.sha256 && (
                    <div
                      style={{
                        fontSize: 11,
                        opacity: 0.6,
                        marginTop: 4,
                        overflowWrap: 'anywhere',
                      }}
                    >
                      SHA-256: {activeFile.sha256}
                    </div>
                  )}
                </div>

                <pre
                  style={{
                    margin: 0,
                    padding: 14,
                    maxHeight: 320,
                    overflow: 'auto',
                    whiteSpace: 'pre',
                    fontSize: 12,
                  }}
                >
                  {typeof activeFile.content === 'string'
                    ? activeFile.content
                    : 'Source content was not returned by the API.'}
                </pre>
              </>
            ) : (
              <p style={{ padding: 12 }}>Select a file to inspect.</p>
            )}
          </div>
        </div>
      )}

      {Array.isArray(scannedProject.files) &&
        scannedProject.files.length > 0 && (
          <>
            <h4 style={{ marginTop: 20 }}>Scan results</h4>

            {scannedProject.files.map((file: any) => (
              <div
                key={file.path}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 12,
                  padding: '8px 0',
                  borderBottom: '1px solid #333',
                }}
              >
                <span style={{ overflowWrap: 'anywhere' }}>
                  <FileCode2
                    size={14}
                    style={{ marginRight: 8, verticalAlign: 'middle' }}
                  />
                  {file.path}
                </span>

                {file.syntax_error ? (
                  <span className="danger-text">
                    Syntax error · line {file.syntax_error.line}
                  </span>
                ) : (
                  <span className="success-text">Scanned</span>
                )}
              </div>
            ))}
          </>
        )}
    </section>
  );
}
