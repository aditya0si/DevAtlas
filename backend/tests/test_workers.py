"""Tests for worker entrypoint wiring and import hygiene."""

from __future__ import annotations

import inspect
import re


def test_run_worker_imports_worker_settings_from_main():
    """run_worker.py must use the canonical WorkerSettings from app.workers.main."""
    import run_worker
    from app.workers.main import WorkerSettings

    assert run_worker.WorkerSettings is WorkerSettings


def test_github_sync_has_no_duplicate_engine_import():
    """github_sync.py must not import the engine twice."""
    import app.workers.github_sync as mod

    source = inspect.getsource(mod)
    assert source.count("from app.core.database import engine") == 1


def test_github_sync_module_imports_cleanly():
    """github_sync.py must import without errors (no duplicate/broken imports)."""
    import app.workers.github_sync as mod

    assert hasattr(mod, "WorkerSettings")
    assert hasattr(mod, "run_github_sync")


def test_sync_api_enqueue_names_match_registered_workers():
    """Every job name enqueued by the sync API must be a function registered in
    app.workers.main.WorkerSettings.functions.

    Regression test: /sync/incremental previously enqueued "run_incremental_sync"
    (a legacy github_sync worker that is NOT in the canonical worker set) and
    /sync/classify and /sync/pipeline enqueued "run_ai_classification" (which
    does not exist in app/workers/main.py). Those jobs were silently dropped by
    ARQ because the names did not match any registered worker.
    """
    import app.api.sync as sync_module
    from app.workers.main import WorkerSettings

    registered = {func.__name__ for func in WorkerSettings.functions}

    source = inspect.getsource(sync_module)
    enqueued = re.findall(r'enqueue_job\("([^"]+)"\)', source)

    assert enqueued, "expected at least one enqueue_job call in app/api/sync.py"
    missing = sorted(set(enqueued) - registered)
    assert not missing, f"sync.py enqueues jobs not registered in app.workers.main: {missing}"

    # The specific names fixed in the Iteration 1 gate must be used.
    assert "run_incremental_repo_sync" in enqueued
    assert "run_classification_worker" in enqueued
    assert "run_ai_classification" not in enqueued
    assert "run_incremental_sync" not in enqueued
