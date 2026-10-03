"""Local PostgreSQL policy for the test suite.

Database tests (gated by QLPK_RUN_DB_TESTS) run inside an outer transaction that is rolled back. They run by
default when DATABASE_URL points at a PostgreSQL server on this machine that answers; QLPK_RUN_DB_TESTS=0 skips
them. While they run, a real COMMIT on the app engine is refused before it reaches the database and fails the
test that attempted it, so the suite can never change the local data (patch get_db with a savepoint session).
"""
import os
from urllib.parse import urlsplit

import pytest
from sqlalchemy import event
from sqlalchemy.exc import DBAPIError

from app.core.config import settings
from app.core.database import engine

LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1"}


def _local_database_answers() -> bool:
    if urlsplit(settings.DATABASE_URL).hostname not in LOCAL_HOSTS:
        return False
    try:
        with engine.connect():
            return True
    except DBAPIError:
        return False


if "QLPK_RUN_DB_TESTS" not in os.environ:
    os.environ["QLPK_RUN_DB_TESTS"] = "1" if _local_database_answers() else "0"

_refused_commits: list[str] = []


class RealCommitRefused(RuntimeError):
    pass


def _refuse_real_commit(connection):
    _refused_commits.append(repr(connection))
    raise RealCommitRefused("Test tried to COMMIT on the local database; run it inside the rolled-back outer transaction.")


if os.environ["QLPK_RUN_DB_TESTS"] == "1":
    event.listen(engine, "commit", _refuse_real_commit)


@pytest.fixture(autouse=True)
def _no_real_commit():
    before = len(_refused_commits)
    yield
    if len(_refused_commits) > before:
        pytest.fail("A real COMMIT on the local database was refused (the test is not isolated by rollback).")
