"""
Cova Pipeline Logger — structured NDJSON logging for Modal pipelines.

Usage:
    from lib.pipeline_logger import PipelineLogger
    log = PipelineLogger('redesign')
    log.info('RENDER_FLUX_PROMPT_BUILT', 'Prompt compiled', room_id=room_id, data={'promptLength': len(prompt)})
"""

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional


class PipelineLogger:
    def __init__(self, pipeline_name: str):
        self.pipeline_name = pipeline_name
        self._seq = 0
        self._session_id = os.environ.get("MODAL_TASK_ID", "local")

        # NDJSON file output in development
        if os.environ.get("ENVIRONMENT") == "development":
            log_dir = Path(__file__).parent.parent / ".dev-logs"
            log_dir.mkdir(exist_ok=True)
            date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
            self._log_file = open(
                log_dir / f"pipeline-{date}-{self.pipeline_name}.ndjson",
                "a",
                encoding="utf-8",
            )
        else:
            self._log_file = None

    def _write(
        self,
        level: str,
        event: str,
        message: str,
        room_id: Optional[str] = None,
        user_id: Optional[str] = None,
        step: Optional[str] = None,
        data: Optional[dict] = None,
        error: Optional[dict] = None,
        duration_ms: Optional[float] = None,
    ) -> None:
        self._seq += 1
        entry = {
            "_v": 1,
            "sequence": self._seq,
            "session_id": self._session_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": level,
            "pipeline": self.pipeline_name,
            "event": event,
            "message": message,
            "room_id": room_id,
            "user_id": user_id,
            "step": step,
            "duration_ms": duration_ms,
            "data": data,
            "error": error,
        }

        # Always write to stdout (captured by Modal logs)
        print(json.dumps(entry), flush=True)

        # Write to file in development
        if self._log_file:
            self._log_file.write(json.dumps(entry) + "\n")
            self._log_file.flush()

    def info(self, event: str, message: str, **kwargs: Any) -> None:
        self._write("INFO", event, message, **kwargs)

    def warn(self, event: str, message: str, **kwargs: Any) -> None:
        self._write("WARN", event, message, **kwargs)

    def error(self, event: str, message: str, **kwargs: Any) -> None:
        self._write("ERROR", event, message, **kwargs)

    def fatal(self, event: str, message: str, **kwargs: Any) -> None:
        self._write("FATAL", event, message, **kwargs)

    def timed(
        self,
        event: str,
        message: str,
        start_time: float,
        **kwargs: Any,
    ) -> None:
        """Log with duration calculated from a start_time (datetime.now(timezone.utc).timestamp())."""
        from datetime import datetime, timezone as tz

        duration = (datetime.now(tz.utc).timestamp() - start_time) * 1000
        self._write("INFO", event, message, duration_ms=round(duration, 2), **kwargs)

    def __del__(self) -> None:
        if self._log_file:
            try:
                self._log_file.close()
            except Exception:
                pass
