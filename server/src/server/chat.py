"""Question answering: LLM plans SQL -> SQL is validated -> DuckDB computes -> LLM explains."""

import json
import logging
from collections.abc import Callable
from typing import Literal

from langchain_core.language_models import BaseChatModel
from langchain_core.messages import BaseMessage, HumanMessage, SystemMessage
from pydantic import BaseModel, Field

from server.datasets import DatasetStore
from server.errors import LLMError, QueryExecutionError, SQLValidationError
from server.llm import invoke_structured
from server.query import QueryResult
from server.schemas import (
    ChartSpec,
    ChatRequest,
    ChatResponse,
    DatasetSchema,
    Display,
    DisplayType,
)
from server.sql_guard import validate_sql
from server.usage import UsageTracker

logger = logging.getLogger(__name__)


class AnalysisPlan(BaseModel):
    kind: Literal["query", "clarification", "unsupported"]
    question_type: str = ""
    relevant_columns: list[str] = Field(default_factory=list)
    sql: str | None = None
    display: Literal["summary", "table", "metrics", "chart"] = "table"
    title: str | None = None
    chart: ChartSpec | None = None
    assumptions: list[str] = Field(default_factory=list)
    message: str | None = None


class AnswerText(BaseModel):
    answer: str
    explanation: str | None = None


PLAN_INSTRUCTIONS = """You are a data analyst that answers questions about ONE table by writing DuckDB SQL.
You never compute or guess numbers yourself - DuckDB runs your SQL and produces every number.

Rules:
- Query only the table named `{table}`. Use column names exactly as listed. Double-quote a column name if it could be a SQL keyword.
- Write a single read-only SELECT (CTEs and window functions are fine) in DuckDB dialect.
- For "top/highest/best/lowest" questions, ORDER BY the measure and LIMIT; include identifying columns (e.g. a name) and the measure.
- For trends over time use date_trunc('month', <date column>) (or week/year) with ORDER BY. If a date is stored as text use try_cast(... AS DATE).
- Round averages and ratios with round(x, 2). Give result columns short snake_case aliases.
- display: "summary" for a single fact, "metrics" for one row of a few KPI values, "table" for lists, rankings or groupings, "chart" for trends/comparisons or when the user asks for a chart.
- chart (only when display is "chart"): type is bar|line|scatter|pie; x and y must be aliases from your SELECT; y is a list of numeric columns.
- If the question is ambiguous, set kind "clarification" and put the question to ask in "message".
- If the table cannot answer it, set kind "unsupported" and explain why in "message".
- Follow-up questions may refer to earlier turns; reuse their context.

Reply with ONLY a JSON object of this shape:
{{"kind": "query", "question_type": "ranking", "relevant_columns": ["name", "marks"],
  "sql": "SELECT ...", "display": "summary", "title": "Top student",
  "chart": null, "assumptions": ["..."], "message": null}}"""

ANSWER_INSTRUCTIONS = """You explain query results to a business user.
Use ONLY the numbers and values in the result below. Never change, round differently, or invent numbers.
If the result is truncated, say it covers the rows shown.
Reply with ONLY a JSON object: {"answer": "<one or two direct sentences>", "explanation": "<one sentence on how it was calculated>"}"""


def describe_schema(schema: DatasetSchema) -> str:
    lines = [f"Table `{schema.table_name}` ({schema.row_count} rows). Columns:"]
    for c in schema.columns:
        label = f" (original header: {c.original_name!r})" if c.original_name != c.name else ""
        samples = ", ".join(json.dumps(v, default=str) for v in c.sample_values)
        lines.append(
            f"- {c.name}: {c.sql_type}{label}; {c.null_count} missing; "
            f"~{c.distinct_count} distinct; e.g. {samples}"
        )
    return "\n".join(lines)


class ChatService:
    def __init__(
        self,
        store: DatasetStore,
        model_factory: Callable[[], BaseChatModel],
        usage: UsageTracker,
    ):
        self.store = store
        self.model_factory = model_factory
        self.usage = usage
        self.settings = store.settings

    def answer(self, request: ChatRequest) -> ChatResponse:
        schema = self.store.schema(request.dataset_id)
        model = self.model_factory()
        retries = self.settings.llm_output_retries

        messages = self._planning_messages(request, schema)
        plan: AnalysisPlan | None = None
        result: QueryResult | None = None
        sql = ""
        for attempt in range(retries + 1):
            plan = invoke_structured(model, messages, AnalysisPlan, retries, self.usage)
            if plan.kind != "query":
                return self._non_query_response(plan)
            try:
                if not plan.sql:
                    raise SQLValidationError("The plan did not include SQL.")
                sql = validate_sql(plan.sql, schema.table_name, {c.name: c.sql_type for c in schema.columns})
                result = self.store.run(request.dataset_id, sql)
                break
            except (SQLValidationError, QueryExecutionError) as exc:
                if attempt == retries:
                    raise
                logger.info("Retrying plan after SQL error: %s", exc.message)
                messages = messages + [
                    HumanMessage(
                        content=(
                            f"Your SQL failed: {exc.message}\nSQL was: {plan.sql}\n"
                            "Fix it and reply with the full JSON object again."
                        )
                    )
                ]
        assert plan is not None and result is not None

        display_type, chart = self._choose_display(plan, result)
        answer, explanation = self._explain(model, request.question, sql, result)
        return ChatResponse(
            answer=answer,
            display=Display(type=display_type, title=plan.title),
            columns=result.columns,
            rows=result.rows,
            explanation=explanation,
            sql=sql,
            chart=chart,
            assumptions=plan.assumptions,
            truncated=result.truncated,
            row_count=len(result.rows),
        )

    # ---- steps ---------------------------------------------------------------

    def _planning_messages(self, request: ChatRequest, schema: DatasetSchema) -> list[BaseMessage]:
        sample = self.store.run(request.dataset_id, f"SELECT * FROM {schema.table_name} LIMIT 5", max_rows=5)
        context = describe_schema(schema) + "\n\nFirst rows:\n" + json.dumps(sample.rows, default=str)
        messages: list[BaseMessage] = [
            SystemMessage(content=PLAN_INSTRUCTIONS.format(table=schema.table_name)),
            HumanMessage(content=context),
        ]
        history = request.history[-8:]
        if history:
            lines = []
            for turn in history:
                line = f"{turn.role}: {turn.content}"
                if turn.sql:
                    line += f"\n  (SQL used: {turn.sql})"
                lines.append(line)
            messages.append(HumanMessage(content="Conversation so far:\n" + "\n".join(lines)))
        messages.append(HumanMessage(content=f"Question: {request.question}"))
        return messages

    def _non_query_response(self, plan: AnalysisPlan) -> ChatResponse:
        if plan.kind == "clarification":
            return ChatResponse(
                answer=plan.message or "Could you clarify your question?",
                display=Display(type="clarification", title="Clarification needed"),
            )
        return ChatResponse(
            answer=plan.message or "This question can't be answered from this dataset.",
            display=Display(type="summary", title="Not answerable from this data"),
            assumptions=plan.assumptions,
        )

    @staticmethod
    def _choose_display(plan: AnalysisPlan, result: QueryResult) -> tuple[DisplayType, ChartSpec | None]:
        n = len(result.rows)
        display: DisplayType = plan.display
        if n == 0:
            return "summary", None
        if display == "chart":
            chart = _validate_chart(plan.chart, result)
            return ("chart", chart) if chart else ("table", None)
        if display == "metrics" and n != 1:
            return "table", None
        if display == "summary" and n > 1:
            return "table", None
        return display, None

    def _explain(self, model: BaseChatModel, question: str, sql: str, result: QueryResult) -> tuple[str, str | None]:
        if not result.rows:
            return "No rows matched this question.", "The query ran successfully but returned no rows."
        shown = result.rows[: self.settings.llm_result_rows]
        payload = {
            "question": question,
            "sql": sql,
            "row_count": len(result.rows),
            "truncated": result.truncated or len(result.rows) > len(shown),
            "rows": shown,
        }
        try:
            text = invoke_structured(
                model,
                [
                    SystemMessage(content=ANSWER_INSTRUCTIONS),
                    HumanMessage(content=json.dumps(payload, default=str)),
                ],
                AnswerText,
                self.settings.llm_output_retries,
                self.usage,
            )
            return text.answer, text.explanation
        except LLMError:
            # The computed result is still valid; fall back to a plain description.
            return f"The query returned {len(result.rows)} row(s).", None


def _validate_chart(chart: ChartSpec | None, result: QueryResult) -> ChartSpec | None:
    if chart is None:
        return None
    types = {c.key: c.data_type for c in result.columns}
    if chart.x not in types:
        return None
    y = [col for col in chart.y if types.get(col) == "number"]
    if not y:
        return None
    if chart.type == "pie":
        y = y[:1]
    chart_type = chart.type
    # A scatter plot needs a numeric x-axis. With a date or text x the same data
    # reads as a trend (line) or a category comparison (bar) instead.
    if chart_type == "scatter" and types[chart.x] != "number":
        chart_type = "line" if types[chart.x] == "date" else "bar"
    return chart.model_copy(update={"type": chart_type, "y": y})
