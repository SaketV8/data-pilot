"""NVIDIA NIM chat model factory and validated structured-output helper.

Structured output is obtained by prompting for JSON and validating it with Pydantic,
which works on any OpenAI-compatible endpoint without relying on tool calling or
`response_format` support for a particular model.
"""

import json
import logging
import re
from typing import TypeVar

from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage
from langchain_openai import ChatOpenAI
from pydantic import BaseModel, ValidationError

from server.config import Settings
from server.errors import LLMError, LLMNotConfiguredError

logger = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)

_THINK_RE = re.compile(r"<think>.*?</think>", re.DOTALL | re.IGNORECASE)
_FENCE_RE = re.compile(r"```(?:json)?\s*(.*?)```", re.DOTALL)


def create_chat_model(settings: Settings) -> ChatOpenAI:
    if settings.nvidia_nim_api_key is None or not settings.nvidia_nim_api_key.get_secret_value():
        raise LLMNotConfiguredError(
            "The language model is not configured. Set NVIDIA_NIM_API_KEY on the server."
        )
    return ChatOpenAI(
        model=settings.llm_model,
        base_url=settings.llm_base_url,
        api_key=settings.nvidia_nim_api_key,
        temperature=settings.llm_temperature,
        top_p=settings.llm_top_p,
        timeout=settings.llm_timeout_seconds,
        max_retries=settings.llm_max_retries,
        streaming=False,
        # ChatOpenAI renames `max_tokens` to `max_completion_tokens`; NIM's reference
        # client sends `max_tokens`, so pass it through the request body unchanged.
        extra_body={"max_tokens": settings.llm_max_tokens},
    )


def message_text(message: BaseMessage) -> str:
    content = message.content
    if isinstance(content, str):
        return content
    parts = []
    for part in content:
        if isinstance(part, str):
            parts.append(part)
        elif isinstance(part, dict) and part.get("type") == "text":
            parts.append(str(part.get("text", "")))
    return "".join(parts)


def extract_json(text: str) -> dict:
    """Pull the first JSON object out of a model reply (ignores reasoning and fences)."""
    text = _THINK_RE.sub("", text).strip()
    fenced = _FENCE_RE.search(text)
    if fenced:
        text = fenced.group(1).strip()
    start = text.find("{")
    if start == -1:
        raise ValueError("No JSON object found in the response.")
    obj, _ = json.JSONDecoder().raw_decode(text[start:])
    if not isinstance(obj, dict):
        raise ValueError("Expected a JSON object.")
    return obj


def invoke_structured(
    model: BaseChatModel, messages: list[BaseMessage], schema: type[T], retries: int
) -> T:
    """Call the model and validate its JSON reply, re-asking up to `retries` times."""
    conversation = list(messages)
    for attempt in range(retries + 1):
        try:
            reply = model.invoke(conversation)
        except Exception as exc:
            logger.warning("LLM request failed: %s", type(exc).__name__)
            raise LLMError("The language model request failed. Please try again.") from exc
        text = message_text(reply)
        try:
            return schema.model_validate(extract_json(text))
        except (ValueError, ValidationError) as exc:
            logger.info("Invalid structured output (attempt %d): %s", attempt + 1, exc)
            conversation += [
                AIMessage(content=text[:4000]),
                HumanMessage(
                    content=(
                        "Your reply was not valid. Problem: "
                        f"{str(exc)[:500]}\nReply again with only the JSON object."
                    )
                ),
            ]
    raise LLMError("The language model returned an invalid response. Please rephrase and try again.")
