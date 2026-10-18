"""On-disk dataset storage: one directory (DuckDB file + metadata) per dataset."""

import json
import re
import shutil
import threading
import uuid
from datetime import UTC, datetime
from pathlib import Path

import duckdb

from server import ingestion
from server.config import Settings
from server.errors import IngestionError, NotFoundError
from server.query import QueryResult, execute_query, open_sandboxed, quote_ident
from server.schemas import DatasetInfo, DatasetSchema, PreviewPage

DATASET_ID_PATTERN = r"^[0-9a-f]{32}$"
_ID_RE = re.compile(DATASET_ID_PATTERN)


class DatasetStore:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.root = Path(settings.data_dir)
        self.root.mkdir(parents=True, exist_ok=True)
        self._connections: dict[str, duckdb.DuckDBPyConnection] = {}
        self._lock = threading.Lock()

    # ---- paths -------------------------------------------------------------

    def _dir(self, dataset_id: str) -> Path:
        if not _ID_RE.match(dataset_id):
            raise NotFoundError("Dataset not found.")
        return self.root / dataset_id

    def _meta_path(self, dataset_id: str) -> Path:
        return self._dir(dataset_id) / "meta.json"

    # ---- lifecycle ---------------------------------------------------------

    def create(self, filename: str, source: Path, sheet: str | None = None) -> DatasetInfo:
        """Ingest `source` (a temp file) as a new dataset. The source file is moved."""
        kind = ingestion.file_kind(filename)
        dataset_id = uuid.uuid4().hex
        directory = self.root / dataset_id
        directory.mkdir(parents=True)
        try:
            raw_path = directory / f"source{Path(filename).suffix.lower()}"
            shutil.move(source, raw_path)

            sheets: list[str] = []
            if kind == "excel":
                sheets = ingestion.list_sheets(raw_path)
                if not sheets:
                    raise IngestionError("The workbook has no worksheets.")
                sheet = sheet or sheets[0]
                if sheet not in sheets:
                    raise IngestionError(f"Worksheet '{sheet}' was not found in the workbook.")
            else:
                sheet = None

            db_path = directory / "data.duckdb"
            original = ingestion.load_file(raw_path, kind, db_path, sheet)
            con = duckdb.connect(str(db_path), read_only=True)
            try:
                row_count, columns = ingestion.profile_table(con, original)
            finally:
                con.close()

            info = DatasetInfo(
                id=dataset_id,
                filename=Path(filename).name[:255],
                table_name=ingestion.TABLE_NAME,
                sheet=sheet,
                sheets=sheets,
                row_count=row_count,
                column_count=len(columns),
                created_at=datetime.now(UTC).isoformat(),
            )
            schema = DatasetSchema(
                dataset_id=dataset_id,
                table_name=ingestion.TABLE_NAME,
                row_count=row_count,
                columns=columns,
            )
            self._meta_path(dataset_id).write_text(
                json.dumps({"info": info.model_dump(), "schema": schema.model_dump()})
            )
            return info
        except Exception:
            shutil.rmtree(directory, ignore_errors=True)
            raise

    def delete(self, dataset_id: str) -> None:
        directory = self._dir(dataset_id)
        if not directory.exists():
            raise NotFoundError("Dataset not found.")
        with self._lock:
            con = self._connections.pop(dataset_id, None)
        if con is not None:
            con.close()
        shutil.rmtree(directory, ignore_errors=True)

    # ---- metadata ----------------------------------------------------------

    def _meta(self, dataset_id: str) -> dict:
        path = self._meta_path(dataset_id)
        if not path.exists():
            raise NotFoundError("Dataset not found.")
        return json.loads(path.read_text())

    def info(self, dataset_id: str) -> DatasetInfo:
        return DatasetInfo.model_validate(self._meta(dataset_id)["info"])

    def schema(self, dataset_id: str) -> DatasetSchema:
        return DatasetSchema.model_validate(self._meta(dataset_id)["schema"])

    # ---- querying ----------------------------------------------------------

    def connection(self, dataset_id: str) -> duckdb.DuckDBPyConnection:
        """Shared sandboxed connection for a dataset; callers use their own cursor."""
        with self._lock:
            con = self._connections.get(dataset_id)
            if con is None:
                db_path = self._dir(dataset_id) / "data.duckdb"
                if not db_path.exists():
                    raise NotFoundError("Dataset not found.")
                con = open_sandboxed(
                    db_path, self.settings.query_memory_limit, self.settings.query_threads
                )
                self._connections[dataset_id] = con
            return con

    def run(self, dataset_id: str, sql: str, max_rows: int | None = None) -> QueryResult:
        """Execute SQL that has already passed `validate_sql`."""
        schema = self.schema(dataset_id)
        labels = {c.name: c.original_name for c in schema.columns}
        return execute_query(
            self.connection(dataset_id),
            sql,
            timeout_seconds=self.settings.query_timeout_seconds,
            max_rows=max_rows or self.settings.max_result_rows,
            labels=labels,
        )

    def preview(self, dataset_id: str, page: int, page_size: int) -> PreviewPage:
        schema = self.schema(dataset_id)
        cols = ", ".join(quote_ident(c.name) for c in schema.columns)
        offset = (page - 1) * page_size
        result = self.run(
            dataset_id,
            f"SELECT {cols} FROM {schema.table_name} LIMIT {int(page_size)} OFFSET {int(offset)}",
            max_rows=page_size,
        )
        return PreviewPage(
            columns=result.columns,
            rows=result.rows,
            page=page,
            page_size=page_size,
            total_rows=schema.row_count,
        )

    def close(self) -> None:
        with self._lock:
            for con in self._connections.values():
                con.close()
            self._connections.clear()
