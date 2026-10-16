"""bigquery/apply_migration.sh must never let a migration reach the original
Google-hackathon dataset. A fake `bq` on PATH records whether it was called."""
import os
import pathlib
import subprocess

import pytest

ROOT = pathlib.Path(__file__).resolve().parents[3]
SCRIPT = ROOT / "bigquery" / "apply_migration.sh"
SQL = ROOT / "bigquery" / "migrations" / "2026-10-17-qloo-tours.sql"


@pytest.fixture
def fake_bq(tmp_path):
    log = tmp_path / "bq.log"
    bq = tmp_path / "bq"
    bq.write_text(f"#!/bin/sh\ncat > {log}\n")
    bq.chmod(0o755)
    return tmp_path, log


def _run(dataset, fake_bq):
    bin_dir, _ = fake_bq
    env = {**os.environ, "PATH": f"{bin_dir}:{os.environ['PATH']}"}
    return subprocess.run(["bash", str(SCRIPT), dataset, str(SQL)], env=env, capture_output=True, text=True)


@pytest.mark.parametrize("dataset", [
    "tour_intelligence", "Tour_Intelligence",
    "liifecalling-academy.tour_intelligence", "liifecalling-academy:tour_intelligence",
    "a/b", "x&y", "tour intelligence",
])
def test_refuses_the_original_dataset_and_non_bare_ids(dataset, fake_bq):
    result = _run(dataset, fake_bq)
    assert result.returncode == 1
    assert "Refusing" in result.stdout
    assert not fake_bq[1].exists()


def test_substitutes_the_dataset_for_a_bare_new_id(fake_bq):
    result = _run("tour_intelligence_qloo", fake_bq)
    assert result.returncode == 0
    sql = fake_bq[1].read_text()
    assert "`tour_intelligence_qloo.qloo_tours`" in sql
    assert "{{DATASET}}" not in sql
