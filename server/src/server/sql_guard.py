"""Static validation of model-proposed SQL. Only single read-only SELECT queries over
the dataset table are allowed; this is enforced here, not just in the prompt."""

import sqlglot
from sqlglot import exp
from sqlglot.errors import OptimizeError, ParseError
from sqlglot.optimizer.qualify import qualify

from server.errors import SQLValidationError

DIALECT = "duckdb"

# Statement / expression types that must never appear anywhere in the tree.
_FORBIDDEN_NODES: tuple[type[exp.Expression], ...] = tuple(
    t
    for t in (
        getattr(exp, name, None)
        for name in (
            "Insert", "Update", "Delete", "Merge", "Create", "Drop", "Alter", "TruncateTable",
            "Command", "Attach", "Detach", "Install", "Copy", "Pragma", "Set", "Use",
            "Describe", "Show", "Transaction", "Commit", "Rollback", "Into", "Export",
        )
    )
    if isinstance(t, type)
)

# Functions that read files, the network or the environment, or inspect the database.
_FORBIDDEN_FUNCTION_PREFIXES = ("read_", "parquet_", "duckdb_", "pragma_", "sqlite_", "iceberg_", "delta_")
_FORBIDDEN_FUNCTIONS = {
    "glob", "getenv", "current_setting", "sniff_csv", "query", "query_table",
    "load_extension", "install_extension", "httpfs", "postgres_scan", "mysql_scan",
    "sqlite_scan", "parquet_scan", "csv_scan", "json_scan", "read_text", "read_blob",
}


def validate_sql(sql: str, table_name: str, columns: dict[str, str]) -> str:
    """Return a normalized copy of `sql` or raise SQLValidationError.

    `columns` maps column name -> DuckDB type for the dataset table.
    """
    text = sql.strip().rstrip(";").strip()
    if not text:
        raise SQLValidationError("The generated query was empty.")
    try:
        statements = [s for s in sqlglot.parse(text, read=DIALECT) if s is not None]
    except ParseError as exc:
        raise SQLValidationError("The generated SQL could not be parsed.") from exc
    if len(statements) != 1:
        raise SQLValidationError("Only a single SQL statement is allowed.")
    tree = statements[0]

    if not isinstance(tree, exp.Query):
        raise SQLValidationError("Only read-only SELECT queries are allowed.")
    for node in tree.walk():
        if isinstance(node, _FORBIDDEN_NODES):
            raise SQLValidationError("Only read-only SELECT queries are allowed.")

    _check_tables(tree, table_name)
    _check_functions(tree)
    _check_columns(tree, table_name, columns)
    return tree.sql(dialect=DIALECT)


def _check_tables(tree: exp.Expression, table_name: str) -> None:
    cte_names = {cte.alias_or_name.lower() for cte in tree.find_all(exp.CTE)}
    for table in tree.find_all(exp.Table):
        if not isinstance(table.this, exp.Identifier):
            raise SQLValidationError("Table functions are not allowed; query the dataset table.")
        if table.args.get("db") or table.args.get("catalog"):
            raise SQLValidationError(f"Only the '{table_name}' table may be queried.")
        name = table.name.lower()
        if name != table_name.lower() and name not in cte_names:
            raise SQLValidationError(f"Unknown table '{table.name}'. Only '{table_name}' is available.")


def _check_functions(tree: exp.Expression) -> None:
    for func in tree.find_all(exp.Func):
        name = (func.name if isinstance(func, exp.Anonymous) else func.sql_name()).lower()
        if name in _FORBIDDEN_FUNCTIONS or name.startswith(_FORBIDDEN_FUNCTION_PREFIXES):
            raise SQLValidationError(f"The function '{name}' is not allowed.")


def _check_columns(tree: exp.Expression, table_name: str, columns: dict[str, str]) -> None:
    """Use sqlglot's qualifier to catch references to columns that don't exist.

    Anything sqlglot can't analyse (unusual DuckDB syntax) is left to DuckDB's binder,
    which runs in the sandbox and still rejects unknown columns.
    """
    try:
        qualify(
            tree.copy(),
            schema={table_name: columns},
            dialect=DIALECT,
            validate_qualify_columns=True,
            quote_identifiers=False,
        )
    except OptimizeError as exc:
        message = str(exc)
        if "column" in message.lower():
            raise SQLValidationError(f"The query references an unknown column: {message[:200]}") from exc
    except Exception:
        pass
