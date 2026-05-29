import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

# Model strings are LiteLLM-format (provider/model). DSPy routes through
# LiteLLM, so any provider it supports works — Gemini, Anthropic, OpenAI,
# OpenRouter, local Ollama, etc. Defaults below target Gemini.
ROOT_MODEL = os.getenv("THREADMAP_ROOT_MODEL", "gemini/gemini-2.5-pro")
SUB_MODEL = os.getenv("THREADMAP_SUB_MODEL", "gemini/gemini-2.5-flash")

DEFAULT_OUT_DIR = Path("out")
DEFAULT_INSTRUCTION_PATH = Path(__file__).parent.parent / "prompts" / "mindmap_instruction.md"

# Each LiteLLM provider expects its own env var. We check the one matching
# the root model's provider prefix and surface a clear error if it's missing.
_PROVIDER_KEYS = {
    "gemini": "GEMINI_API_KEY",
    "vertex_ai": "GOOGLE_APPLICATION_CREDENTIALS",
    "anthropic": "ANTHROPIC_API_KEY",
    "openai": "OPENAI_API_KEY",
    "openrouter": "OPENROUTER_API_KEY",
    "groq": "GROQ_API_KEY",
    "mistral": "MISTRAL_API_KEY",
    "deepseek": "DEEPSEEK_API_KEY",
}


def _provider(model: str) -> str:
    return model.split("/", 1)[0] if "/" in model else "openai"


def require_api_key() -> str:
    provider = _provider(ROOT_MODEL)
    env_var = _PROVIDER_KEYS.get(provider, f"{provider.upper()}_API_KEY")
    key = os.getenv(env_var)
    if not key:
        raise RuntimeError(
            f"{env_var} is not set (required for ROOT_MODEL={ROOT_MODEL}). "
            "Copy .env.example to .env and add your key."
        )
    return key
