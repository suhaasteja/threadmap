import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

ROOT_MODEL = os.getenv("THREADMAP_ROOT_MODEL", "anthropic/claude-opus-4-5")
SUB_MODEL = os.getenv("THREADMAP_SUB_MODEL", "anthropic/claude-haiku-4-5")

DEFAULT_OUT_DIR = Path("out")
DEFAULT_INSTRUCTION_PATH = Path(__file__).parent.parent / "prompts" / "mindmap_instruction.md"


def require_api_key() -> str:
    key = os.getenv("ANTHROPIC_API_KEY")
    if not key:
        raise RuntimeError(
            "ANTHROPIC_API_KEY is not set. Copy .env.example to .env and add your key."
        )
    return key
