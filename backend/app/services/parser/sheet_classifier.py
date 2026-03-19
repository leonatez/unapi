"""
Step 2: Classify sections/sheets within the Markdown content.

For XLSX documents, markitdown renders each sheet as a ## heading.
For DOCX, sections are delineated by ## headings or table patterns.

Classification categories:
  api_spec   — contains an API definition (URL, Request, Response)
  error_code — reference table of result/error codes
  edge_case  — runtime handling / decision logic
  mapping    — code mapping tables
  metadata   — changelog, env info, general overview
  unknown    — cannot determine
"""
import re
from dataclasses import dataclass
from app.models.canonical import SheetKind


# Keywords that signal each category
_SIGNALS: dict[SheetKind, list[str]] = {
    SheetKind.api_spec: [
        r"\burl\b", r"\bmethod\b", r"\brequest\b", r"\bresponse\b",
        r"\bheader\b", r"\bbody\b", r"\bhttp.*code\b", r"post\s+\[host\]",
        r"get\s+\[host\]", r"api endpoint", r"endpoint", r"\bpath\b",
    ],
    SheetKind.error_code: [
        r"error\s*code", r"result\s*code", r"result\s*status",
        r"error\s*desc", r"hyd\s*code", r"rcode",
    ],
    SheetKind.edge_case: [
        r"edge\s*case", r"retry", r"inquiry", r"fail\s*logic",
        r"next\s*step", r"handling\s*logic",
    ],
    SheetKind.mapping: [
        r"mapping", r"code.*value", r"value.*code", r"lookup",
        r"province.*code", r"district.*code",
    ],
    SheetKind.metadata: [
        r"change\s*log", r"revision", r"version", r"environment",
        r"bank\s*env", r"host.*port", r"overview", r"introduction",
        r"general", r"sign.*off", r"document.*history",
    ],
}


@dataclass
class Section:
    heading: str
    content: str
    kind: SheetKind
    score: dict[SheetKind, int]


def _score(text: str) -> dict[SheetKind, int]:
    lower = text.lower()
    scores: dict[SheetKind, int] = {}
    for kind, patterns in _SIGNALS.items():
        hits = sum(1 for p in patterns if re.search(p, lower))
        scores[kind] = hits
    return scores


def split_sections(markdown: str) -> list[Section]:
    """
    Split Markdown into top-level sections by ## headings.
    Returns classified Section objects.
    """
    # Split on ## (sheet/section boundaries)
    raw_sections = re.split(r"(?=^## )", markdown, flags=re.MULTILINE)
    sections: list[Section] = []

    for raw in raw_sections:
        if not raw.strip():
            continue
        lines = raw.splitlines()
        heading = lines[0].lstrip("# ").strip() if lines else "unknown"
        content = "\n".join(lines[1:]).strip()
        scores = _score(raw)

        best_kind = max(scores, key=lambda k: scores[k])
        best_score = scores[best_kind]

        # Default to unknown if no strong signal
        kind = best_kind if best_score >= 2 else SheetKind.unknown

        # Sections with no content are metadata by default
        if not content:
            kind = SheetKind.metadata

        sections.append(Section(heading=heading, content=content, kind=kind, score=scores))

    return sections


def filter_api_sections(sections: list[Section]) -> list[Section]:
    return [s for s in sections if s.kind == SheetKind.api_spec]


def filter_error_sections(sections: list[Section]) -> list[Section]:
    return [s for s in sections if s.kind == SheetKind.error_code]


def filter_edge_sections(sections: list[Section]) -> list[Section]:
    return [s for s in sections if s.kind == SheetKind.edge_case]
