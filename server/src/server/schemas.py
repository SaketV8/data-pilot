"""Canonical API request/response models. Mirrored in client/src/lib/types.ts."""

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

DataType = Literal["number", "string", "date", "boolean"]
DisplayType = Literal["summary", "table", "metrics", "chart", "clarification"]
ChartType = Literal["bar", "line", "scatter", "pie"]


class ApiModel(BaseModel):
    """Serializes to camelCase for the TypeScript client."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class ColumnProfile(ApiModel):
    name: str
    original_name: str
    sql_type: str
    data_type: DataType
    null_count: int
    distinct_count: int
    sample_values: list[Any]


class DatasetInfo(ApiModel):
    id: str
    filename: str
    table_name: str
    sheet: str | None = None
    sheets: list[str] = []
    row_count: int
    column_count: int
    created_at: str


class DatasetSchema(ApiModel):
    dataset_id: str
    table_name: str
    row_count: int
    columns: list[ColumnProfile]


class ResultColumn(ApiModel):
    key: str
    label: str
    data_type: DataType


class PreviewPage(ApiModel):
    columns: list[ResultColumn]
    rows: list[dict[str, Any]]
    page: int
    page_size: int
    total_rows: int


class ChartSpec(ApiModel):
    type: ChartType
    x: str
    y: list[str] = Field(min_length=1)
    title: str | None = None


class Display(ApiModel):
    type: DisplayType
    title: str | None = None


class ChatTurn(ApiModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=4000)
    sql: str | None = None


class ChatRequest(ApiModel):
    dataset_id: str
    question: str = Field(min_length=1, max_length=2000)
    history: list[ChatTurn] = Field(default_factory=list, max_length=20)


class ChatResponse(ApiModel):
    answer: str
    display: Display
    columns: list[ResultColumn] = []
    rows: list[dict[str, Any]] = []
    explanation: str | None = None
    sql: str | None = None
    chart: ChartSpec | None = None
    assumptions: list[str] = []
    truncated: bool = False
    row_count: int = 0


class HealthResponse(ApiModel):
    status: Literal["ok"]
    llm_configured: bool
    model: str
    # Lets the client reject oversized files before uploading them.
    max_upload_size_mb: int


class UsageStats(ApiModel):
    llm_calls_last_minute: int
    llm_calls_total: int
    rate_limit_per_minute: int
    tracking_since: str
