"""CLI entry point: glues ingest -> extract -> render."""

from __future__ import annotations

import shutil
import sys
import time
from pathlib import Path

import typer

from . import config, extract, ingest, render

app = typer.Typer(add_completion=False, help="threadmap: conversation -> mind map")


@app.callback()
def _root() -> None:
    """threadmap CLI."""


@app.command()
def build(
    input_path: Path = typer.Argument(..., exists=False, help="Conversation file (.md/.txt/.json)"),
    out: Path = typer.Option(config.DEFAULT_OUT_DIR, "--out", "-o", help="Output directory"),
    format: str = typer.Option("html,md,json", "--format", "-f", help="Comma list: html, md, json"),
    trace: bool = typer.Option(False, "--trace", help="Write RLM trajectory to trace.txt"),
    instruction: Path | None = typer.Option(None, "--instruction", help="Override prompt file"),
):
    """Build a mind map from one conversation file."""
    _preflight(input_path)

    formats = {f.strip().lower() for f in format.split(",") if f.strip()}
    unknown = formats - {"html", "md", "json"}
    if unknown:
        _fail(f"Unknown --format values: {sorted(unknown)}")

    out.mkdir(parents=True, exist_ok=True)

    typer.echo(f"[1/3] Ingesting {input_path} ...")
    t0 = time.time()
    doc = ingest.load_conversation(input_path)
    typer.echo(
        f"      turns={doc.metadata['turn_count']}  "
        f"est_tokens≈{doc.metadata['est_tokens']}  "
        f"({time.time() - t0:.2f}s)"
    )

    typer.echo(f"[2/3] Extracting mind map via RLM ({config.ROOT_MODEL}) ...")
    typer.echo(f"      sub_lm={config.SUB_MODEL}  (this can take a couple of minutes)")
    t0 = time.time()
    instr = extract.load_instruction(instruction)
    try:
        mm, trajectory = extract.build_mindmap(doc, instr)
    except Exception as e:
        _fail(f"Extraction failed: {e}")
    typer.echo(
        f"      nodes={len(mm.nodes)}  edges={len(mm.edges)}  "
        f"({time.time() - t0:.1f}s)"
    )

    typer.echo("[3/3] Rendering ...")
    written: list[Path] = []
    if "json" in formats:
        written.append(render.to_json(mm, out / "mindmap.json"))
    if "md" in formats:
        written.append(render.to_markdown(mm, out / "mindmap.md"))
    if "html" in formats:
        written.append(render.to_html(mm, out / "mindmap.html"))
    if trace:
        written.append(_write_trace(trajectory, out / "trace.txt"))

    typer.echo("")
    typer.echo("Done. Wrote:")
    for p in written:
        typer.echo(f"  {p}")


# ---------- helpers ----------


def _preflight(input_path: Path) -> None:
    if not input_path.exists():
        _fail(f"Input file not found: {input_path}")
    try:
        config.require_api_key()
    except RuntimeError as e:
        _fail(str(e))
    if shutil.which("deno") is None:
        typer.echo(
            "warning: Deno is not on PATH. dspy.RLM's default sandbox needs Deno.\n"
            "  install: curl -fsSL https://deno.land/install.sh | sh",
            err=True,
        )


def _fail(msg: str) -> None:
    typer.echo(f"error: {msg}", err=True)
    raise typer.Exit(code=1)


def _write_trace(trajectory: list, path: Path) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    lines: list[str] = []
    for i, step in enumerate(trajectory):
        lines.append(f"===== step {i} =====")
        if isinstance(step, dict):
            for key in ("reasoning", "thought", "code", "tool", "tool_args", "output", "observation"):
                if key in step and step[key] is not None:
                    val = str(step[key])
                    if len(val) > 4000:
                        val = val[:4000] + "\n... [truncated]"
                    lines.append(f"--- {key} ---")
                    lines.append(val)
        else:
            lines.append(str(step))
        lines.append("")
    path.write_text("\n".join(lines), encoding="utf-8")
    return path


def main() -> None:
    app()


if __name__ == "__main__":
    main()
