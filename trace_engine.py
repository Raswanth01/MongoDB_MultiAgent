
import sys
import json
import linecache
import traceback
from pathlib import Path


def trace_program(script_path, events_path):
    script_path = str(Path(script_path).resolve())
    events_path = Path(events_path)
    events = []
    step = 0
    failure = None

    def tracer(frame, event, arg):
        nonlocal step

        frame_path = str(Path(frame.f_code.co_filename).resolve())

        if frame_path != script_path:
            return None

        if event not in ("call", "line", "return", "exception"):
            return tracer

        step += 1
        variables = {}

        for name, value in frame.f_locals.items():
            if name.startswith("__"):
                continue

            try:
                json.dumps(value)
                variables[name] = value
            except (TypeError, ValueError, OverflowError):
                variables[name] = f"<{type(value).__name__}>"

        record = {
            "step": step,
            "event": event,
            "function": frame.f_code.co_name,
            "line": frame.f_lineno,
            "source": linecache.getline(
                script_path, frame.f_lineno
            ).strip(),
            "variables": variables,
        }

        if event == "exception":
            exc_type, exc_value, _ = arg
            record["exception"] = {
                "type": exc_type.__name__,
                "message": str(exc_value),
            }

        events.append(record)
        return tracer

    old_trace = sys.gettrace()

    try:
        source = Path(script_path).read_text(encoding="utf-8")
        code = compile(source, script_path, "exec")

        namespace = {
            "__name__": "__main__",
            "__file__": script_path,
        }

        sys.settrace(tracer)
        exec(code, namespace)

    except BaseException as exc:
        failure = {
            "type": type(exc).__name__,
            "message": str(exc),
        }
        traceback.print_exc()

    finally:
        sys.settrace(old_trace)

        events_path.parent.mkdir(parents=True, exist_ok=True)
        events_path.write_text(
            json.dumps({
                "events": events,
                "failure": failure,
            }, indent=2),
            encoding="utf-8",
        )

    print(f"\nCaptured {len(events)} execution events.")

    if failure:
        print(f"Program failed: {failure['type']}: {failure['message']}")
        raise SystemExit(1)


if __name__ == "__main__":
    if len(sys.argv) != 4 or sys.argv[2] != "--events-json":
        print(
            "Usage: python trace_engine.py "
            "<script.py> --events-json <output.json>"
        )
        raise SystemExit(2)

    trace_program(sys.argv[1], sys.argv[3])
