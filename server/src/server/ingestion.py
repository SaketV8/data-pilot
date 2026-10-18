"""Load uploaded CSV / Excel files into a dataset's DuckDB file."""

import re
from pathlib import Path

import duckdb
import pandas as pd

from server.errors import IngestionError
from server.query import quote_ident, to_data_type, to_json_value
from server.schemas import ColumnProfile

TABLE_NAME = "data"
CSV_EXTENSIONS = {".csv", ".tsv", ".txt"}
EXCEL_EXTENSIONS = {".xlsx", ".xlsm", ".xls"}
SUPPORTED_EXTENSIONS = CSV_EXTENSIONS | EXCEL_EXTENSIONS

# Reserved SQL words are prefixed so model-written SQL works without quoting.
RESERVED_WORDS = {
    row[0]
    for row in duckdb.sql(
        "SELECT keyword_name FROM duckdb_keywords() WHERE keyword_category = 'reserved'"
    ).fetchall()
}


def file_kind(filename: str) -> str:
    ext = Path(filename).suffix.lower()
    if ext in CSV_EXTENSIONS:
        return "csv"
    if ext in EXCEL_EXTENSIONS:
        return "excel"
    raise IngestionError(
        f"Unsupported file type '{ext or 'none'}'. Upload a CSV, XLSX or XLS file."
    )


def sanitize_columns(names: list[object]) -> list[str]:
    """Turn arbitrary header values into unique snake_case SQL identifiers."""
    result: list[str] = []
    seen: set[str] = set()
    for i, raw in enumerate(names, start=1):
        text = "" if raw is None or (isinstance(raw, float) and pd.isna(raw)) else str(raw)
        if text.startswith("Unnamed:"):  # pandas placeholder for blank headers
            text = ""
        name = re.sub(r"[^0-9a-zA-Z]+", "_", text).strip("_").lower()
        if not name:
            name = f"column_{i}"
        if name[0].isdigit() or name in RESERVED_WORDS:
            name = f"col_{name}"
        candidate, n = name, 2
        while candidate in seen:
            candidate = f"{name}_{n}"
            n += 1
        seen.add(candidate)
        result.append(candidate)
    return result


def list_sheets(path: Path) -> list[str]:
    try:
        with pd.ExcelFile(path) as xls:
            return [str(s) for s in xls.sheet_names]
    except Exception as exc:
        raise IngestionError("Could not read the Excel workbook. Is the file valid?") from exc


def load_file(path: Path, kind: str, db_path: Path, sheet: str | None) -> list[str]:
    """Create the `data` table in db_path. Returns the original column names."""
    con = duckdb.connect(str(db_path))
    try:
        if kind == "csv":
            original = _load_csv(con, path)
        else:
            original = _load_excel(con, path, sheet)
        con.execute("CHECKPOINT")
        return original
    finally:
        con.close()


def _load_csv(con: duckdb.DuckDBPyConnection, path: Path) -> list[str]:
    try:
        rel = con.read_csv(str(path), header=True)
        original = list(rel.columns)
        safe = sanitize_columns(original)
        projection = ", ".join(
            f"{quote_ident(o)} AS {quote_ident(s)}" for o, s in zip(original, safe)
        )
        rel.project(projection).create(TABLE_NAME)
    except duckdb.Error as exc:
        raise IngestionError("Could not parse the CSV file. Check that it is valid CSV.") from exc
    return original


def _load_excel(con: duckdb.DuckDBPyConnection, path: Path, sheet: str | None) -> list[str]:
    try:
        df = pd.read_excel(path, sheet_name=sheet if sheet is not None else 0)
    except ValueError as exc:
        raise IngestionError(f"Worksheet '{sheet}' was not found in the workbook.") from exc
    except Exception as exc:
        raise IngestionError("Could not read the Excel workbook. Is the file valid?") from exc

    df = df.dropna(how="all")  # spreadsheets often contain trailing blank rows
    original = [str(c) for c in df.columns]
    df.columns = sanitize_columns(list(df.columns))
    # Mixed-type object columns can't be typed by DuckDB; keep them as text.
    for col in df.columns[df.dtypes == object]:
        df[col] = df[col].map(lambda v: None if pd.isna(v) else str(v))
    try:
        con.register("upload_df", df)
        con.execute(f"CREATE TABLE {TABLE_NAME} AS SELECT * FROM upload_df")
        con.unregister("upload_df")
    except duckdb.Error as exc:
        raise IngestionError("Could not load the worksheet into the database.") from exc
    return original


def profile_table(
    con: duckdb.DuckDBPyConnection, original_names: list[str]
) -> tuple[int, list[ColumnProfile]]:
    """Row count plus per-column type, missing-value and sample information."""
    described = con.execute(f"DESCRIBE {TABLE_NAME}").fetchall()
    names = [row[0] for row in described]
    types = [row[1] for row in described]
    if not names:
        raise IngestionError("The file does not contain any columns.")

    stats_sql = ", ".join(
        f"count(*) - count({quote_ident(n)}), approx_count_distinct({quote_ident(n)})"
        for n in names
    )
    stats = con.execute(f"SELECT count(*), {stats_sql} FROM {TABLE_NAME}").fetchone()
    assert stats is not None
    row_count = int(stats[0])

    columns: list[ColumnProfile] = []
    for i, (name, sql_type) in enumerate(zip(names, types)):
        q = quote_ident(name)
        samples = con.execute(
            f"SELECT DISTINCT {q} FROM {TABLE_NAME} WHERE {q} IS NOT NULL LIMIT 3"
        ).fetchall()
        columns.append(
            ColumnProfile(
                name=name,
                original_name=original_names[i] if i < len(original_names) else name,
                sql_type=sql_type,
                data_type=to_data_type(sql_type),
                null_count=int(stats[1 + 2 * i]),
                distinct_count=int(stats[2 + 2 * i]),
                sample_values=[to_json_value(s[0]) for s in samples],
            )
        )
    return row_count, columns
