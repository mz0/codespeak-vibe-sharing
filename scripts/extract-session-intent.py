#!/usr/bin/env python3
"""
Extract user messages, Claude responses, AskUserQuestion interactions,
plan executions, and TODO updates from Claude Code session files.

Produces:
  - intent/msg-and-answers.md  (combined, chronological)
  - intent/sessions/<date>_<session-id>.md  (per-session)

Usage:
  python3 scripts/extract-session-intent.py [--project-dir PATH] [--output-dir PATH]

Defaults:
  --project-dir  .   (current directory)
  --output-dir   ./intent
"""

import argparse
import json
import os
import glob
import shutil


def find_sessions_dir(project_dir):
    """Find the Claude Code sessions directory for a project."""
    project_dir = os.path.realpath(project_dir)
    encoded = project_dir.replace("/", "-")
    sessions_dir = os.path.join(os.path.expanduser("~"), ".claude", "projects", encoded)
    if not os.path.isdir(sessions_dir):
        return None
    return sessions_dir


def extract_session(fpath):
    """Extract all relevant items from a single session JSONL file."""
    session_id = os.path.basename(fpath).replace(".jsonl", "")
    items = []
    ask_tool_ids = {}
    exit_plan_tool_ids = {}

    with open(fpath) as f:
        for line in f:
            try:
                obj = json.loads(line)
            except Exception:
                continue

            t = obj.get("type", "")
            timestamp = obj.get("timestamp", "")

            # ---- ASSISTANT MESSAGES ----
            if t == "assistant":
                msg = obj.get("message", {})
                content = msg.get("content", [])
                if not isinstance(content, list):
                    continue

                text_parts = []
                for block in content:
                    if not isinstance(block, dict):
                        continue

                    if block.get("type") == "text":
                        text = block.get("text", "").strip()
                        if text:
                            text_parts.append(text)

                    elif block.get("type") == "tool_use":
                        name = block.get("name", "")
                        tool_id = block.get("id", "")
                        inp = block.get("input", {})

                        if name == "AskUserQuestion":
                            ask_tool_ids[tool_id] = True
                            items.append({
                                "session": session_id,
                                "timestamp": timestamp,
                                "content": format_ask(inp),
                                "kind": "ask",
                            })

                        elif name == "ExitPlanMode":
                            exit_plan_tool_ids[tool_id] = True
                            items.append({
                                "session": session_id,
                                "timestamp": timestamp,
                                "content": format_exit_plan(inp),
                                "kind": "exit_plan",
                            })

                        elif name == "TodoWrite":
                            items.append({
                                "session": session_id,
                                "timestamp": timestamp,
                                "content": format_todo(inp),
                                "kind": "todo",
                            })

                if text_parts:
                    items.append({
                        "session": session_id,
                        "timestamp": timestamp,
                        "content": "[CLAUDE]: " + "\n".join(text_parts),
                        "kind": "claude",
                    })

            # ---- USER MESSAGES ----
            elif t == "user":
                msg = obj.get("message", {})
                raw_content = msg.get("content", "")
                is_meta = obj.get("isMeta", False)

                # Check tool_result responses
                if isinstance(raw_content, list):
                    for block in raw_content:
                        if not isinstance(block, dict) or block.get("type") != "tool_result":
                            continue
                        tool_id = block.get("tool_use_id", "")
                        result_text = normalize_content(block.get("content", ""))
                        if not result_text:
                            continue
                        if tool_id in ask_tool_ids:
                            items.append({
                                "session": session_id,
                                "timestamp": timestamp,
                                "content": f"[USER ANSWERED]: {result_text}",
                                "kind": "answer",
                            })
                        elif tool_id in exit_plan_tool_ids:
                            items.append({
                                "session": session_id,
                                "timestamp": timestamp,
                                "content": f"[PLAN RESULT]: {result_text}",
                                "kind": "plan_result",
                            })

                # Regular user messages (non-meta)
                if not is_meta:
                    text = normalize_content(raw_content)
                    if not text:
                        continue
                    if text.startswith("<local-command-") or text.startswith("<command-name>"):
                        continue
                    items.append({
                        "session": session_id,
                        "timestamp": timestamp,
                        "content": text,
                        "kind": "user",
                    })

    items.sort(key=lambda x: x["timestamp"])
    return items


def normalize_content(content):
    """Normalize message content (string or list of blocks) to a plain string."""
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        texts = []
        for block in content:
            if isinstance(block, dict) and block.get("type") == "text":
                texts.append(block.get("text", ""))
        return "\n".join(texts).strip()
    return ""


def format_ask(inp):
    lines = ["[CLAUDE ASKED]:"]
    for q in inp.get("questions", []):
        header = q.get("header", "")
        question = q.get("question", "")
        if header:
            lines.append(f"**{header}**")
        lines.append(question)
        for opt in q.get("options", []):
            lines.append(f"  - {opt.get('label', '')}: {opt.get('description', '')}")
    return "\n".join(lines)


def format_exit_plan(inp):
    lines = ["[EXIT PLAN MODE]:", "Allowed prompts:"]
    for p in inp.get("allowedPrompts", []):
        lines.append(f"  - {p.get('tool', '')}: {p.get('prompt', '')}")
    return "\n".join(lines)


def format_todo(inp):
    icons = {"completed": "[x]", "in_progress": "[>]", "pending": "[ ]"}
    lines = ["[TODO UPDATE]:"]
    for todo in inp.get("todos", []):
        icon = icons.get(todo.get("status", ""), "[?]")
        lines.append(f"  {icon} {todo.get('content', '')}")
    return "\n".join(lines)


def format_items(items):
    parts = []
    for i, m in enumerate(items):
        if i > 0:
            parts.append("\n==========\n")
        parts.append(m["content"])
    return "\n".join(parts)


def count_summary(items):
    counts = {}
    for item in items:
        counts[item["kind"]] = counts.get(item["kind"], 0) + 1
    return counts


def write_file(path, header, items):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        f.write(header + format_items(items) + "\n")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--project-dir", default=".", help="Project directory (default: current dir)")
    parser.add_argument("--output-dir", default=None, help="Output directory (default: <project-dir>/intent)")
    args = parser.parse_args()

    project_dir = os.path.realpath(args.project_dir)
    output_dir = args.output_dir or os.path.join(project_dir, "intent")

    sessions_dir = find_sessions_dir(project_dir)
    if not sessions_dir:
        print(f"No Claude Code sessions found for {project_dir}")
        print(f"  (looked for ~/.claude/projects/{project_dir.replace('/', '-')})")
        return 1

    jsonl_files = sorted(glob.glob(os.path.join(sessions_dir, "*.jsonl")))
    if not jsonl_files:
        print(f"No session files found in {sessions_dir}")
        return 1

    print(f"Project: {project_dir}")
    print(f"Sessions dir: {sessions_dir}")
    print(f"Found {len(jsonl_files)} session file(s)")
    print()

    # Extract all sessions
    all_items = []
    session_map = {}
    for fpath in jsonl_files:
        session_id = os.path.basename(fpath).replace(".jsonl", "")
        items = extract_session(fpath)
        session_map[session_id] = items
        all_items.extend(items)

    all_items.sort(key=lambda x: x["timestamp"])
    counts = count_summary(all_items)

    # Write combined file
    header = f"# User Messages, Claude Responses, Plans & TODOs from Claude Code Sessions\n\n"
    header += f"Project: {os.path.basename(project_dir)}\n"
    header += f"Total items: {len(all_items)}\n\n"
    for k, v in sorted(counts.items()):
        header += f"- {k}: {v}\n"
    header += "\n"

    combined_path = os.path.join(output_dir, "msg-and-answers.md")
    write_file(combined_path, header, all_items)
    print(f"Combined: {len(all_items)} items -> {combined_path}")

    # Write per-session files
    sessions_out = os.path.join(output_dir, "sessions")
    if os.path.isdir(sessions_out):
        shutil.rmtree(sessions_out)
    os.makedirs(sessions_out)

    for session_id, items in session_map.items():
        if not items:
            continue
        first_ts = items[0]["timestamp"] if items else ""
        date_part = first_ts[:10] if first_ts else "unknown"
        fname = f"{date_part}_{session_id[:8]}.md"
        sc = count_summary(items)

        header = f"# Session {session_id[:8]}\n\nDate: {date_part}\nItems: {len(items)}\n\n"
        for k, v in sorted(sc.items()):
            header += f"- {k}: {v}\n"
        header += "\n"

        write_file(os.path.join(sessions_out, fname), header, items)
        print(f"  Session {session_id[:8]}: {len(items)} items -> sessions/{fname}")

    print()
    print("Summary:")
    for k, v in sorted(counts.items()):
        print(f"  {k}: {v}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
