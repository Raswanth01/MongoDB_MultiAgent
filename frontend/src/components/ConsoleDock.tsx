import { useEffect, useRef } from 'react';
import { Play, Terminal, X } from 'lucide-react';

type Props = any;

export default function ConsoleDock(props: Props) {
  const {
    consoleLines = [],
    setConsoleLines,
    command,
    setCommand,
    runCommand,
  } = props;

  const outputRef = useRef<HTMLDivElement>(null);

  // Console history is stored newest-first by the app. Display it oldest-first
  // so each new command and its result appear underneath the previous output.
  const displayedLines = [...consoleLines].slice(0, 30).reverse();

  useEffect(() => {
    const output = outputRef.current;
    if (output) output.scrollTop = output.scrollHeight;
  }, [consoleLines]);

  return (
    <section className="console-dock">
      <div className="console-header">
        <div>
          <Terminal size={17} />
          <strong>AgentTrace CLI</strong>
          <span className="console-dot" />
        </div>

        <div className="console-actions">
          <span>Interactive console · drag the bottom edge to resize</span>
          <button
            type="button"
            className="icon-btn small"
            title="Clear console"
            onClick={() => setConsoleLines([])}
          >
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="console-body">
        <div className="console-output" ref={outputRef} aria-live="polite">
          {displayedLines.map((line, index) => (
            <div
              key={`${line}-${index}`}
              className={
                line.startsWith('agenttrace>')
                  ? 'command-line'
                  : /unavailable|failed|cannot execute|unknown command/i.test(line)
                    ? 'console-warn'
                    : ''
              }
            >
              {line}
            </div>
          ))}
        </div>

        <form className="console-input-row" onSubmit={runCommand}>
          <span className="prompt">agenttrace &gt;</span>
          <input
            value={command}
            onChange={event => setCommand(event.target.value)}
            placeholder="Type help, history, refresh, or run <file.py>…"
            aria-label="Enter an AgentTrace CLI command"
          />
          <button type="submit" disabled={!command.trim()}>
            <Play size={14} />
            Run
          </button>
        </form>
      </div>
    </section>
  );
}
