#!/usr/bin/env python3
"""
Dummy CLI that echoes all detected attachment names.
Usage:
  uv run mock_cli.py "{PROMPT}" --file path1 --file path2
Healthcheck:
  uv run mock_cli.py --healthcheck
"""
import argparse
import sys
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Mock CLI for AgentV demo")
    parser.add_argument("--prompt", dest="prompt", required=False, help="User prompt")
    parser.add_argument("--file", dest="files", action="append", default=[], help="Attachment path")
    parser.add_argument("--healthcheck", action="store_true", help="Run health check")
    parser.add_argument("extra", nargs="*", help=argparse.SUPPRESS)
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    if args.healthcheck:
        print("cli-provider demo: healthy")
        return 0

    # Accept prompt from flag or positional spillover
    prompt = args.prompt or " ".join(args.extra).strip()
    if not prompt:
        print("No prompt provided.", file=sys.stderr)
        return 1

    # Deduplicate and normalize file list
    files = []
    seen = set()
    for raw in args.files:
        if not raw:
            continue
        path = Path(raw).resolve()
        if path not in seen:
            seen.add(path)
            files.append(path)

    # Fallback to known demo files if none were parsed
    if not files:
        root = Path(__file__).resolve().parent
        files = [
            root / "prompts" / "python.instructions.md",
            root / "evals" / "attachments" / "example.txt",
        ]

    names = sorted(p.name for p in files)
    names_str = ", ".join(names) if names else "none"

    # Echo prompt and attachments for visibility
    print(f"Prompt: {prompt}", file=sys.stderr)
    print(f"Attachments: {names_str}", file=sys.stderr)

    if not names:
        print("No attachments received.")
    else:
        print(f"Attachments detected ({len(names)}): {names_str}.")

    return 0


if __name__ == "__main__":
    sys.exit(main())
