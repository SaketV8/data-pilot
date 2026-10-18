"""Sandboxed DuckDB execution with timeouts and row limits."""

import datetime as dt
import math
import re
import threading
import uuid
from dataclasses import dataclass, field
from decimal import Decimal
from pathlib import Path
from typing import Any

import duckdb

from server.errors import QueryExecutionError
from server.schemas import DataType, ResultColumn

_NUMBER_TYPE = re.compile(
    r"^(U?(TINY|SMALL|BIG|HUGE)?INT(EGER)?|FLOAT|DOUBLE|REAL|DECIMAL.*|NUMERIC.*)$"
)


def quote_ident(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


def to_data_type(sql_type: str) -> DataType:
    t = sql_type.upper()
    if _NUMBER_TYPE.match(t):
        return "number"
    if t.startswith(("DATE", "TIMESTAMP", "TIME")):
        return "date"
    if t == "BOOLEAN":
        return "boolean"
    return "string"


def to_json_value(value: Any) -> Any:
    if value is None or isinstance(value, (bool, int, str)):
        return value
    if isinstance(value, float):
        return None if math.isnan(value) or math.isinf(value) else value
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, dt.datetime):
        if value.tzinfo is None and value.time() == dt.time():
            return value.date().isoformat()  # e.g. date_trunc('month', ...) results
        return value.isoformat()
    if isinstance(value, (dt.date, dt.time)):
        return value.isoformat()
    if isinstance(value, (dt.timedelta, uuid.UUID)):
        return str(value)
    if isinstance(value, bytes):
        return "<binary>"
    if isinstance(value, (list, tuple)):
        return [to_json_value(v) for v in value]
    if isinstance(value, dict):
        return {str(k): to_json_value(v) for k, v in value.items()}
    return str(value)


def open_sandboxed(db_path: Path, memory_limit: str, threads: int) -> duckdb.DuckDBPyConnection:
    """Read-only connection that cannot touch the filesystem, network or Python objects."""
    return duckdb.connect(
        str(db_path),
        read_only=True,
        config={
            "enable_external_access": False,
            "python_enable_replacements": False,
            "autoinstall_known_extensions": False,
            "autoload_known_extensions": False,
            "memory_limit": memory_limit,
            "threads": threads,
            "lock_configuration": True,
        },
    )


@dataclass
class QueryResult:
    columns: list[ResultColumn]
    rows: list[dict[str, Any]]
    truncated: bool = False
    labels: dict[str, str] = field(default_factory=dict)


def execute_query(
    con: duckdb.DuckDBPyConnection,
    sql: str,
    *,
    timeout_seconds: float,
    max_rows: int,
    labels: dict[str, str] | None = None,
) -> QueryResult:
    """Run an already-validated query on its own cursor, interrupting it on timeout."""
    cursor = con.cursor()
    timed_out = threading.Event()

    def _interrupt() -> None:
        timed_out.set()
        cursor.interrupt()

    timer = threading.Timer(timeout_seconds, _interrupt)
    timer.start()
    try:
        rel = cursor.sql(sql)
        if rel is None:
            raise QueryExecutionError("The query did not return a result set.")
        names, types = rel.columns, [str(t) for t in rel.types]
        raw_rows = rel.fetchmany(max_rows + 1)
    except duckdb.Error as exc:
        if timed_out.is_set():
            raise QueryExecutionError(
                f"The query took longer than {timeout_seconds:g}s and was stopped."
            ) from exc
        raise QueryExecutionError(_clean_duckdb_error(exc)) from exc
    finally:
        timer.cancel()
        cursor.close()

    keys = _unique_keys(names)
    labels = labels or {}
    columns = [
        ResultColumn(key=k, label=labels.get(n, n), data_type=to_data_type(t))
        for k, n, t in zip(keys, names, types)
    ]
    truncated = len(raw_rows) > max_rows
    rows = [
        {k: to_json_value(v) for k, v in zip(keys, row)} for row in raw_rows[:max_rows]
    ]
    return QueryResult(columns=columns, rows=rows, truncated=truncated)


def _unique_keys(names: list[str]) -> list[str]:
    seen: dict[str, int] = {}
    keys = []
    for n in names:
        if n in seen:
            seen[n] += 1
            keys.append(f"{n}_{seen[n]}")
        else:
            seen[n] = 1
            keys.append(n)
    return keys


def _clean_duckdb_error(exc: duckdb.Error) -> str:
    """Keep the first line of DuckDB's message and drop anything that looks like a path."""
    first_line = str(exc).strip().splitlines()[0] if str(exc).strip() else "Query failed."
    first_line = re.sub(r"(/[^\s'\"]+)+", "<path>", first_line)
    return first_line[:300]
