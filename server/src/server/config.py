"""Centralized application settings, loaded from environment variables / .env."""

from functools import lru_cache
from pathlib import Path

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

SERVER_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=SERVER_ROOT / ".env", env_file_encoding="utf-8", extra="ignore"
    )

    # LLM provider (NVIDIA NIM via its OpenAI-compatible endpoint)
    nvidia_nim_api_key: SecretStr | None = None
    llm_provider: str = "nim"
    llm_base_url: str = "https://integrate.api.nvidia.com/v1"
    llm_model: str = "nvidia/nemotron-3-super-120b-a12b"
    # Sampling settings follow NVIDIA's reference client, except temperature: 0 keeps
    # SQL generation deterministic. max_tokens leaves room for the model's reasoning.
    llm_temperature: float = 0.0
    llm_top_p: float = 1.0
    llm_max_tokens: int = 4096
    llm_timeout_seconds: float = 60.0
    llm_max_retries: int = 2
    # Extra attempts when the model returns unparseable output or SQL that fails.
    llm_output_retries: int = 2
    # Shown against the per-minute call count in the UI; not enforced by the server.
    llm_rate_limit_per_minute: int = Field(default=40, ge=1)

    # API
    cors_origins: str = "http://localhost:3000"

    # Data / query limits
    data_dir: Path = SERVER_ROOT / "data"
    max_upload_size_mb: int = 25
    query_timeout_seconds: float = 10.0
    max_result_rows: int = 1000
    query_memory_limit: str = "512MB"
    query_threads: int = 2

    # How much of a result the LLM sees when writing its explanation.
    llm_result_rows: int = Field(default=30, ge=1)

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
