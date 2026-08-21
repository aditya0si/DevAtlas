#!/usr/bin/env python
"""ARQ worker script for background tasks."""
from __future__ import annotations

import sys
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from arq import run_worker

from app.workers.main import WorkerSettings


if __name__ == "__main__":
    run_worker(WorkerSettings)