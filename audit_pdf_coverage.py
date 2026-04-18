"""Audit which old-PDF AcroForm fields are picked up by import_from_pdf.py.

Strategy:
  1. Open the blank template at
     "Dungeons and Dragons 3.5E/Characters/Character Sheet.pdf".
  2. Fill every text/checkbox field with a unique marker derived from the
     field name (e.g. "Strength" -> "MK_Strength"). For checkboxes whose
     /On state name we can introspect, set them to that state.
  3. Save to a temporary PDF.
  4. Run import_from_pdf.map_pdf_to_json on it.
  5. Walk the resulting JSON dict (recursively) and collect every string
     value that contains "MK_". Map back to which fields were transferred.
  6. Report:
       - matched fields  (transferred)
       - unmatched fields  (silently dropped — likely missing wiring)
       - extracted markers in JSON that don't match any known field
         (very unlikely; would indicate a parsing bug)

Run:  python audit_pdf_coverage.py
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import pypdf
from pypdf.generic import BooleanObject, NameObject, TextStringObject

# Allow importing the sibling module
sys.path.insert(0, str(Path(__file__).parent))
import import_from_pdf as importer  # noqa: E402

BLANK_PDF = Path(
    r"D:/Tabletop RPG/Dungeons and Dragons 3.5E/Characters/Character Sheet.pdf"
)
FILLED_PDF = Path(__file__).parent / "_audit_filled.pdf"
MARKER_PREFIX = "MK_"


def safe_marker(field_name: str) -> str:
    """Marker value to write into the field. Keep it short-ish and unique."""
    # Replace whitespace so PDF rendering is stable.
    return MARKER_PREFIX + re.sub(r"\s+", "_", field_name.strip())


def fill_blank(src: Path, dst: Path) -> dict[str, str]:
    """Fill every fillable field in `src` with a unique marker. Return
    {field_name: marker_value} for everything we wrote."""
    reader = pypdf.PdfReader(str(src))
    writer = pypdf.PdfWriter(clone_from=reader)
    fields = reader.get_fields() or {}

    written: dict[str, str] = {}
    # We need to know the on-state for checkboxes, but pypdf's `update_page_form_field_values`
    # tolerates "/Yes" or "/On" for booleans on most templates. Try that.
    text_updates: dict[str, str] = {}
    box_updates: dict[str, str] = {}
    for name, info in fields.items():
        ft = info.get("/FT")
        if ft is None:
            continue
        if ft == "/Tx":
            marker = safe_marker(name)
            text_updates[name] = marker
            written[name] = marker
        elif ft == "/Btn":
            # Checkbox or radio. Use "/Yes" — most templates accept it.
            box_updates[name] = "/Yes"
            written[name] = "checked"
        # /Ch (choice) and /Sig (signature) skipped.

    # Apply per page (pypdf wants page-scoped updates).
    for page in writer.pages:
        if text_updates:
            try:
                writer.update_page_form_field_values(page, text_updates)
            except Exception:
                pass
        if box_updates:
            try:
                writer.update_page_form_field_values(page, box_updates)
            except Exception:
                pass

    with open(dst, "wb") as fh:
        writer.write(fh)
    return written


def walk_strings(obj):
    """Yield every string value found anywhere in obj."""
    if isinstance(obj, str):
        yield obj
    elif isinstance(obj, dict):
        for v in obj.values():
            yield from walk_strings(v)
    elif isinstance(obj, (list, tuple)):
        for v in obj:
            yield from walk_strings(v)


def main():
    if not BLANK_PDF.exists():
        print(f"Blank template not found: {BLANK_PDF}", file=sys.stderr)
        sys.exit(1)

    print(f"Filling {BLANK_PDF.name} ...")
    written = fill_blank(BLANK_PDF, FILLED_PDF)
    print(f"  wrote markers to {len(written)} fields -> {FILLED_PDF.name}")

    print("Running importer on filled PDF ...")
    fields = importer.read_fields(FILLED_PDF)
    print(f"  importer saw {len(fields)} non-empty field values")

    data = importer.map_pdf_to_json(fields)

    # The caster auto-detect picks ONE of {spellcasting, psionics}; when both
    # sets of marker fields are present (as they are here) it favors psionics
    # and the spellcasting-only fields silently drop. Re-run a second pass
    # with psionic markers cleared to see what spellcasting would produce,
    # and merge the casters list so coverage reflects both branches.
    psi_only_keys = [
        "POWER POINTS PER DAY", "POWERS KNOWN",
        "PRIMARY DISCIPLINE", "MAXIMUM POWER LEVEL KNOWN",
    ]
    fields_no_psi = {k: v for k, v in fields.items() if k not in psi_only_keys}
    data_sc = importer.map_pdf_to_json(fields_no_psi)
    # Merge: append spellcasting casters from the second pass.
    if isinstance(data.get("casters"), list) and isinstance(data_sc.get("casters"), list):
        existing_types = {c.get("type") for c in data["casters"]}
        for c in data_sc["casters"]:
            if c.get("type") not in existing_types:
                data["casters"].append(c)

    # Find every marker that surfaced in the JSON output.
    seen_markers: set[str] = set()
    for s in walk_strings(data):
        for m in re.findall(rf"{MARKER_PREFIX}[A-Za-z0-9_+\-:./]+", s):
            seen_markers.add(m)

    # Map text-field markers -> field name they came from.
    marker_to_field = {
        v: k for k, v in written.items() if v.startswith(MARKER_PREFIX)
    }

    transferred = []
    for marker in sorted(seen_markers):
        if marker in marker_to_field:
            transferred.append(marker_to_field[marker])
        else:
            transferred.append(f"<UNKNOWN:{marker}>")

    text_fields = {k for k, v in written.items() if v.startswith(MARKER_PREFIX)}
    btn_fields = {k for k, v in written.items() if v == "checked"}

    transferred_set = set(transferred)
    missing_text = sorted(text_fields - transferred_set)
    # Checkbox transfer detection: look for the field name appearing in the
    # importer's field dict — checkbox state isn't a marker so we judge by
    # whether the field was *read* (it'll appear as "Yes"/"On"/etc).
    btn_seen = {k for k in btn_fields if k in fields}
    btn_used: set[str] = set()
    # Heuristic: any boolean field whose name shows up in any output value
    # context, or any checkbox-like data key (classSkill True etc.) — too
    # noisy to map perfectly, so we just report counts.

    print()
    print(f"=== Coverage report ===")
    print(f"Text fields filled : {len(text_fields)}")
    print(f"Text fields transferred to JSON : {len(transferred_set & text_fields)}")
    print(f"Text fields NOT transferred    : {len(missing_text)}")
    print()
    print(f"Checkbox fields filled : {len(btn_fields)}")
    print(f"Checkbox fields the importer read : {len(btn_seen)}")
    print()
    print("--- MISSING TEXT FIELDS (filled but not in JSON) ---")
    for name in missing_text:
        print(f"  {name!r}")

    # Save full JSON for spot-checking.
    out = Path(__file__).parent / "_audit_output.json"
    with open(out, "w", encoding="utf-8") as fh:
        json.dump(data, fh, indent=2)
    print(f"\nFull JSON output: {out.name}")


if __name__ == "__main__":
    main()
