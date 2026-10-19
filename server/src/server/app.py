"""FastAPI application and routes."""

import logging
import tempfile
from collections.abc import Callable
from pathlib import Path
from typing import Annotated

from fastapi import Depends, FastAPI, File, Form, Path as PathParam, Query, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from langchain_core.language_models import BaseChatModel

from server.chat import ChatService
from server.config import Settings, get_settings
from server.datasets import DATASET_ID_PATTERN, DatasetStore
from server.errors import AppError, IngestionError
from server.llm import create_chat_model
from server.schemas import (
    ChatRequest,
    ChatResponse,
    DatasetInfo,
    DatasetSchema,
    HealthResponse,
    PreviewPage,
    UsageStats,
)
from server.usage import UsageTracker

logger = logging.getLogger("server")

DatasetId = Annotated[str, PathParam(pattern=DATASET_ID_PATTERN)]


def create_app(
    settings: Settings | None = None,
    model_factory: Callable[[], BaseChatModel] | None = None,
) -> FastAPI:
    settings = settings or get_settings()
    store = DatasetStore(settings)
    usage = UsageTracker(store.root / "usage.json", settings.llm_rate_limit_per_minute)
    chat_service = ChatService(
        store, model_factory or (lambda: create_chat_model(settings)), usage
    )

    app = FastAPI(title="Data Pilot API", version="0.1.0")
    app.state.store = store
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_methods=["GET", "POST", "DELETE"],
        allow_headers=["*"],
    )

    @app.exception_handler(AppError)
    async def app_error_handler(_: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.message})

    @app.exception_handler(RequestValidationError)
    async def validation_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
        first = exc.errors()[0] if exc.errors() else {}
        where = ".".join(str(p) for p in first.get("loc", []) if p != "body")
        message = f"Invalid request: {where} {first.get('msg', '')}".strip()
        return JSONResponse(status_code=422, content={"detail": message})

    @app.exception_handler(Exception)
    async def unhandled_handler(_: Request, exc: Exception) -> JSONResponse:
        logger.exception("Unhandled error", exc_info=exc)
        return JSONResponse(status_code=500, content={"detail": "Internal server error."})

    def get_store() -> DatasetStore:
        return store

    Store = Annotated[DatasetStore, Depends(get_store)]

    @app.get("/health", response_model=HealthResponse, response_model_by_alias=True)
    def health() -> HealthResponse:
        return HealthResponse(
            status="ok",
            llm_configured=settings.nvidia_nim_api_key is not None,
            model=settings.llm_model,
            max_upload_size_mb=settings.max_upload_size_mb,
        )

    @app.post("/datasets/upload", response_model=DatasetInfo, status_code=201)
    def upload_dataset(
        store: Store,
        file: Annotated[UploadFile, File()],
        sheet: Annotated[str | None, Form(max_length=200)] = None,
    ) -> DatasetInfo:
        filename = file.filename or "upload"
        limit = settings.max_upload_size_mb * 1024 * 1024
        with tempfile.NamedTemporaryFile(delete=False, suffix=Path(filename).suffix) as tmp:
            tmp_path = Path(tmp.name)
            size = 0
            while chunk := file.file.read(1024 * 1024):
                size += len(chunk)
                if size > limit:
                    tmp.close()
                    tmp_path.unlink(missing_ok=True)
                    raise AppError(
                        f"File is larger than {settings.max_upload_size_mb} MB.", status_code=413
                    )
                tmp.write(chunk)
        if size == 0:
            tmp_path.unlink(missing_ok=True)
            raise IngestionError("The uploaded file is empty.")
        try:
            return store.create(filename, tmp_path, sheet or None)
        finally:
            tmp_path.unlink(missing_ok=True)

    @app.get("/datasets/{dataset_id}", response_model=DatasetInfo)
    def get_dataset(store: Store, dataset_id: DatasetId) -> DatasetInfo:
        return store.info(dataset_id)

    @app.get("/datasets/{dataset_id}/schema", response_model=DatasetSchema)
    def get_schema(store: Store, dataset_id: DatasetId) -> DatasetSchema:
        return store.schema(dataset_id)

    @app.get("/datasets/{dataset_id}/preview", response_model=PreviewPage)
    def get_preview(
        store: Store,
        dataset_id: DatasetId,
        page: Annotated[int, Query(ge=1)] = 1,
        page_size: Annotated[int, Query(alias="pageSize", ge=1, le=200)] = 25,
    ) -> PreviewPage:
        return store.preview(dataset_id, page, page_size)

    @app.delete("/datasets/{dataset_id}", status_code=204)
    def delete_dataset(store: Store, dataset_id: DatasetId) -> None:
        store.delete(dataset_id)

    @app.post("/chat", response_model=ChatResponse)
    def chat(request: ChatRequest) -> ChatResponse:
        return chat_service.answer(request)

    @app.get("/usage", response_model=UsageStats)
    def get_usage() -> UsageStats:
        return usage.snapshot()

    return app
