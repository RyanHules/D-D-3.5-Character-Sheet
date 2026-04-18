#!/usr/bin/env python3
"""
Legacy PDF character sheet importer.

Extracts Acroform field values from the old D&D 3.5 PDF character sheets
and converts them into the JSON format used by this project's web-based
character sheet. The resulting .json files can be loaded via the
"Import Character" button in the UI.

Usage:
    python import_from_pdf.py [source_folder] [output_folder]

Defaults:
    source_folder = D:/Tabletop RPG/Dungeons and Dragons 3.5E/Characters/Characters (To Play)
    output_folder = ./imported_characters

Requires: pypdf  (pip install pypdf)

Notes on the mapping (the old PDF form is messy):
  - Some "ability score" fields were sometimes used as modifiers instead of
    scores. We pass values through verbatim; the new sheet auto-calcs mods
    and the user can fix any obvious mis-entries after import.
  - Knowledge subtype labels are stored in PDF fields named "1".."5"; other
    subtype-bearing skills (Craft, Perform, Profession) don't carry labels
    in the old form, so we import ranks without names.
  - The old sheet has dedicated Armor and Shield protective slots plus up to
    three generic "Protective Item" extras; extras become magic items unless
    needed to backfill an empty armor/shield slot.
  - Gear weights can't be reliably aligned with items (Weight N indexing in
    the PDF is irregular), so weights are left blank on the imported rows.
"""
from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path

try:
    import pypdf
except ImportError:
    sys.exit("pypdf is required.  pip install pypdf")


DEFAULT_SRC = r"D:\Tabletop RPG\Dungeons and Dragons 3.5E\Characters\Characters (To Play)"
DEFAULT_OUT = Path(__file__).with_name("imported_characters")

# ---------------------------------------------------------------------------
# Data needed to drive the mapping.  Kept in lockstep with data.js.
# ---------------------------------------------------------------------------

ABILITIES = ["STR", "DEX", "CON", "INT", "WIS", "CHA"]

SKILL_DEFS = [
    # (name, pdf_field_base, ability)   — ability unused here; kept for reference
    ("Appraise", "Appraise", "INT"),
    ("Balance", "Balance", "DEX"),
    ("Bluff", "Bluff", "CHA"),
    ("Climb", "Climb", "STR"),
    ("Concentration", "Concentration", "CON"),
    # Craft (3 subtypes handled specially below)
    ("Decipher Script", "Decipher Script", "INT"),
    ("Diplomacy", "Diplomacy", "CHA"),
    ("Disable Device", "Disable Device", "INT"),
    ("Disguise", "Disguise", "CHA"),
    ("Escape Artist", "Escape Artist", "DEX"),
    ("Forgery", "Forgery", "INT"),
    ("Gather Information", "Gather Information", "CHA"),
    ("Handle Animal", "Handle Animal", "CHA"),
    ("Heal", "Heal", "WIS"),
    ("Hide", "Hide", "DEX"),
    ("Intimidate", "Intimidate", "CHA"),
    ("Jump", "Jump", "STR"),
    # Knowledge (5 subtypes handled specially below)
    ("Listen", "Listen", "WIS"),
    ("Move Silently", "Move Silently", "DEX"),
    ("Open Lock", "Open Lock", "DEX"),
    # Perform (3 subtypes handled specially)
    # Profession (2 subtypes handled specially)
    ("Ride", "Ride", "DEX"),
    ("Search", "Search", "INT"),
    ("Sense Motive", "Sense Motive", "WIS"),
    ("Sleight of Hand", "Sleight of Hand", "DEX"),
    ("Spellcraft", "Spellcraft", "INT"),
    ("Spot", "Spot", "WIS"),
    ("Survival", "Survival", "WIS"),
    ("Swim", "Swim", "STR"),
    ("Tumble", "Tumble", "DEX"),
    ("Use Magic Device", "Use Magic Device", "CHA"),
    ("Use Rope", "Use Rope", "DEX"),
]

# Order of skills as they appear in the new sheet's DND35.skills list.
# Matches data.js exactly (indexes are used by skills.loadData).
NEW_SKILL_ORDER = [
    "Appraise", "Balance", "Bluff", "Climb", "Concentration",
    "Craft", "Decipher Script", "Diplomacy", "Disable Device", "Disguise",
    "Escape Artist", "Forgery", "Gather Information", "Handle Animal", "Heal",
    "Hide", "Intimidate", "Jump",
    # Knowledge x10 subtypes  (indices 18..27)
    "Knowledge:Arcana", "Knowledge:Arch. & Eng.", "Knowledge:Dungeoneering",
    "Knowledge:Geography", "Knowledge:History", "Knowledge:Local",
    "Knowledge:Nature", "Knowledge:Nobility", "Knowledge:The Planes",
    "Knowledge:Religion",
    "Listen", "Move Silently", "Open Lock",
    "Perform", "Profession",
    "Ride", "Search", "Sense Motive", "Sleight of Hand",
    "Speak Language", "Spellcraft", "Spot", "Survival", "Swim",
    "Tumble", "Use Magic Device", "Use Rope",
]

# Map old-sheet Knowledge subtype labels (found in fields "1".."5") to the
# new sheet's fixed Knowledge indices.
KNOWLEDGE_LABEL_MAP = {
    "arcana": 18, "arc": 18,
    "arch. & eng.": 19, "architecture": 19, "arch": 19, "archeng": 19,
    "dungeoneering": 20, "dungeon": 20,
    "geography": 21, "geo": 21,
    "history": 22, "hist": 22,
    "local": 23,
    "nature": 24, "nat": 24,
    "nobility": 25, "nob": 25, "nobility and royalty": 25, "nob+roy": 25, "nob & roy": 25,
    "the planes": 26, "planes": 26,
    "religion": 27, "rel": 27,
}

SIZE_MAP = {
    "f": "Fine", "fine": "Fine",
    "d": "Diminutive", "dim": "Diminutive", "diminutive": "Diminutive",
    "t": "Tiny", "tiny": "Tiny",
    "s": "Small", "sm": "Small", "small": "Small",
    "m": "Medium", "med": "Medium", "medium": "Medium",
    "l": "Large", "lg": "Large", "large": "Large",
    "h": "Huge", "huge": "Huge",
    "g": "Gargantuan", "garg": "Gargantuan", "gargantuan": "Gargantuan",
    "c": "Colossal", "col": "Colossal", "colossal": "Colossal",
}

ITEM_SLOT_IDS = [
    "head", "eyes", "neck", "shoulders", "ring1", "ring2",
    "hands", "arms", "body", "torso", "waist", "feet",
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def read_fields(pdf_path: Path) -> dict[str, str]:
    """Return a dict of {field_name: value_string} for non-default fields."""
    try:
        reader = pypdf.PdfReader(str(pdf_path))
    except Exception as e:
        print(f"  ! unreadable: {e}", file=sys.stderr)
        return {}
    fields = reader.get_fields() or {}
    out: dict[str, str] = {}
    for name, info in fields.items():
        v = info.get("/V", "")
        if v in ("", None, "/Off"):
            continue
        # Checkboxes come back as "/Yes" or "/On"; keep a canonical bool marker.
        if isinstance(v, str) and v.startswith("/"):
            out[name] = v.lstrip("/")
        else:
            out[name] = str(v)
    return out


def as_text(val) -> str:
    if val is None:
        return ""
    return str(val).replace("\r", "\n").strip()


def extract_level(class_and_level: str) -> str:
    """Sum all integers found in a 'Class and Level' string."""
    nums = re.findall(r"\b(\d+)\b", class_and_level or "")
    if not nums:
        return ""
    total = sum(int(n) for n in nums)
    return str(total)


def normalize_size(raw: str) -> str:
    if not raw:
        return "Medium"
    key = raw.strip().lower().rstrip(".")
    return SIZE_MAP.get(key, raw.strip().title() if raw.strip() else "Medium")


def map_knowledge_label_to_index(label: str) -> int | None:
    if not label:
        return None
    key = label.strip().lower()
    key = re.sub(r"[^a-z&. +]", "", key)
    key = key.strip()
    return KNOWLEDGE_LABEL_MAP.get(key)


# ---------------------------------------------------------------------------
# Skills: build the new-sheet skills array from the old PDF fields.
# ---------------------------------------------------------------------------

def build_skills(f: dict[str, str]) -> list[dict]:
    """Return the skills payload expected by skills.loadData()."""
    skills_out: list[dict] = []

    # Helper: look up ranks/misc for a simple skill
    def simple_skill(index: int, pdf_name: str) -> dict:
        ranks = f.get(f"{pdf_name} Ranks", "0") or "0"
        misc = f.get(f"{pdf_name} Misc Mod", "0") or "0"
        class_skill = f.get(pdf_name, "").lower() in ("yes", "on")
        return {
            "type": "skill",
            "classSkill": class_skill,
            "ranks": ranks,
            "misc": misc,
            "index": index,
        }

    # Knowledge subtype labels live in fields "1".."5"
    knowledge_labels = [f.get(str(i), "") for i in range(1, 6)]
    # For each pair (index i in 1..5), map to the new sheet's Knowledge slot
    knowledge_entries: dict[int, dict] = {}
    for i in range(1, 6):
        ranks = f.get(f"Knowledge Ranks {i}", "0") or "0"
        misc = f.get(f"Knowledge Misc Mod {i}", "0") or "0"
        # Class skill is a single checkbox per subtype (Knowledge, Knowledge_2..5)
        class_key = "Knowledge" if i == 1 else f"Knowledge_{i}"
        class_skill = f.get(class_key, "").lower() in ("yes", "on")
        # Skip entirely if nothing was ever set on this subtype slot
        if ranks in ("0", "", "NR") and misc in ("0", "", "NR") and not class_skill and not knowledge_labels[i - 1]:
            continue
        idx = map_knowledge_label_to_index(knowledge_labels[i - 1])
        if idx is None:
            # Fallback: spread unknown labels across arcana.. in order
            # (first unused slot starting at 18)
            for candidate in range(18, 28):
                if candidate not in knowledge_entries:
                    idx = candidate
                    break
        if idx is None:
            continue
        knowledge_entries[idx] = {
            "type": "skill",
            "classSkill": class_skill,
            "ranks": ranks,
            "misc": misc,
            "index": idx,
        }

    # Now walk the new sheet's skill order and emit entries.
    for idx, skill_name in enumerate(NEW_SKILL_ORDER):
        if skill_name == "Craft":
            # Subtype name lives in the "Craft" field (subtype 1 only); other
            # subtypes have no name field in the old PDF.
            craft_name1 = as_text(f.get("Craft"))
            # Defensive: some templates may have used "Craft_2"/"Craft_3" as
            # text fields too. Read them but tolerate /On checkbox tokens.
            def _name_or_blank(v: str) -> str:
                v = v or ""
                return "" if v.startswith("/") or v.lower() in ("yes", "on", "off") else v
            craft_name2 = _name_or_blank(as_text(f.get("Craft_2")))
            craft_name3 = _name_or_blank(as_text(f.get("Craft_3")))
            craft_names = [craft_name1, craft_name2, craft_name3]
            craft_classes = [
                f.get("Craft Box 1", "").lower() in ("yes", "on"),
                f.get("Craft Box 2", "").lower() in ("yes", "on"),
                f.get("Craft Box 3", "").lower() in ("yes", "on"),
            ]
            skills_out.append({"type": "header", "baseName": "Craft", "index": idx})
            for n in range(1, 4):
                ranks = f.get(f"Craft Ranks {n}", "0") or "0"
                misc = f.get(f"Craft Misc Mod {n}", "0") or "0"
                sub_name = craft_names[n - 1]
                if ranks in ("0", "") and misc in ("0", "") and not sub_name:
                    continue
                skills_out.append({
                    "type": "subtype",
                    "classSkill": craft_classes[n - 1],
                    "ranks": ranks,
                    "misc": misc,
                    "index": idx,
                    "subtypeName": sub_name,
                })
            continue
        if skill_name == "Perform":
            # Perform subtype names: usually unset in the template, but read
            # defensively from "Perform"/"Perform_2"/"Perform_3" if present.
            def _name_or_blank(v: str) -> str:
                v = v or ""
                return "" if v.startswith("/") or v.lower() in ("yes", "on", "off") else v
            perform_names = [
                _name_or_blank(as_text(f.get("Perform"))),
                _name_or_blank(as_text(f.get("Perform_2"))),
                _name_or_blank(as_text(f.get("Perform_3"))),
            ]
            skills_out.append({"type": "header", "baseName": "Perform", "index": idx})
            for n in range(1, 4):
                ranks = f.get(f"Perform Ranks {n}", "0") or "0"
                misc = f.get(f"Perform Misc Mod {n}", "0") or "0"
                sub_name = perform_names[n - 1]
                if ranks in ("0", "") and misc in ("0", "") and not sub_name:
                    continue
                skills_out.append({
                    "type": "subtype",
                    "classSkill": False,
                    "ranks": ranks,
                    "misc": misc,
                    "index": idx,
                    "subtypeName": sub_name,
                })
            continue
        if skill_name == "Profession":
            # In this template "Profession"/"Profession_2" are class-skill
            # checkboxes, not name fields — there is no subtype name field.
            skills_out.append({"type": "header", "baseName": "Profession", "index": idx})
            for n in range(1, 3):
                ranks = f.get(f"Profession Ranks {n}", "0") or "0"
                misc = f.get(f"Profession Misc Mod {n}", "0") or "0"
                class_key = "Profession" if n == 1 else f"Profession_{n}"
                class_skill = f.get(class_key, "").lower() in ("yes", "on")
                if ranks in ("0", "") and misc in ("0", "") and not class_skill:
                    continue
                skills_out.append({
                    "type": "subtype",
                    "classSkill": class_skill,
                    "ranks": ranks,
                    "misc": misc,
                    "index": idx,
                    "subtypeName": "",
                })
            continue
        if skill_name.startswith("Knowledge:"):
            if idx in knowledge_entries:
                skills_out.append(knowledge_entries[idx])
            continue
        if skill_name == "Speak Language":
            # No direct PDF field; skip.
            continue

        # Simple skill
        pdf_name = skill_name
        ranks = f.get(f"{pdf_name} Ranks", "")
        misc = f.get(f"{pdf_name} Misc Mod", "")
        class_skill = f.get(pdf_name, "").lower() in ("yes", "on")
        if ranks in ("", "0") and misc in ("", "0") and not class_skill:
            continue
        skills_out.append(simple_skill(idx, pdf_name))

    return skills_out


# ---------------------------------------------------------------------------
# Main mapping
# ---------------------------------------------------------------------------

def map_pdf_to_json(f: dict[str, str]) -> dict:
    data: dict = {}

    # --- Character info ---
    data["char-name"] = as_text(f.get("character name") or f.get("Character Name"))
    data["char-player"] = as_text(f.get("player") or f.get("Player"))
    data["char-class"] = as_text(f.get("Class and Level"))
    data["char-race"] = as_text(f.get("Race"))
    data["char-gender"] = as_text(f.get("Gender"))
    data["char-alignment"] = as_text(f.get("Alignment"))
    data["char-deity"] = as_text(f.get("Deity"))
    data["char-age"] = as_text(f.get("Age"))
    data["char-height"] = as_text(f.get("Height"))
    data["char-weight"] = as_text(f.get("Weight"))
    data["char-eyes"] = as_text(f.get("Eyes"))
    data["char-hair"] = as_text(f.get("Hair"))
    data["char-skin"] = as_text(f.get("Skin"))
    data["char-campaign"] = as_text(f.get("Campaign") or f.get("campaign"))
    data["char-xp"] = as_text(
        f.get("XP") or f.get("Experience") or f.get("experience points") or f.get("Exp")
    )
    data["char-speed"] = as_text(f.get("SPEED"))
    data["char-size"] = normalize_size(as_text(f.get("size")))
    data["char-level"] = extract_level(data["char-class"])
    data["damage-reduction"] = as_text(f.get("Damage Reduction"))
    data["spell-resistance"] = as_text(f.get("Spell Resistance") or f.get("SPELL RESISTANCE"))

    # --- Abilities (incl. temp scores) ---
    ab_field = {"STR": "strength", "DEX": "dexterity", "CON": "constitution",
                "INT": "intelligence", "WIS": "wisdom", "CHA": "charisma"}
    # Old PDF temp-score field naming varies: "STR Temp Score", "Dex Temp Score",
    # "Con Temp Score", "Int Temp Score", "Wis Temp Score", "CHA Temp Score".
    temp_field = {
        "STR": "STR Temp Score", "DEX": "Dex Temp Score",
        "CON": "Con Temp Score", "INT": "Int Temp Score",
        "WIS": "Wis Temp Score", "CHA": "CHA Temp Score",
    }
    for ab, field_name in ab_field.items():
        data[f"{ab.lower()}-score"] = as_text(f.get(field_name))
        data[f"{ab.lower()}-temp"] = as_text(f.get(temp_field[ab]))

    # --- HP ---
    data["hp-total"] = as_text(f.get("hit points"))
    data["hp-current"] = as_text(f.get("WOUNDSCURRENT HP"))
    data["hp-temp"] = ""
    data["hp-nonlethal"] = as_text(f.get("Nonlethal Damage"))

    # --- AC ---
    data["ac-natural"] = as_text(f.get("Natural Armor")) or "0"
    data["ac-misc"] = as_text(f.get("Misc AC Mod")) or "0"

    # --- Saves ---
    data["fort-base"] = as_text(f.get("Base Fort Save")) or "0"
    data["fort-magic"] = as_text(f.get("Fort Magic Mod")) or "0"
    data["fort-misc"] = as_text(f.get("Fort Misc Mod")) or "0"
    data["fort-temp"] = as_text(f.get("Fort Temp Mod")) or "0"
    data["ref-base"] = as_text(f.get("Base Ref Save")) or "0"
    data["ref-magic"] = as_text(f.get("Ref Magic Mod")) or "0"
    data["ref-misc"] = as_text(f.get("Ref Misc Mod")) or "0"
    data["ref-temp"] = as_text(f.get("Ref Temp Mod")) or "0"
    data["will-base"] = as_text(f.get("Base Will Save")) or "0"
    data["will-magic"] = as_text(f.get("Will Magic Mod")) or "0"
    data["will-misc"] = as_text(f.get("Will Misc Mod")) or "0"
    data["will-temp"] = as_text(f.get("Will Temp Mod")) or "0"
    cond_parts = [
        as_text(f.get("conditional modifiers")),
        as_text(f.get("conditional modifiers_2")),
        as_text(f.get("CONDITIONAL MODIFIERS")),
    ]
    data["save-conditional"] = "\n".join(p for p in cond_parts if p)

    # --- Combat ---
    data["init-misc"] = as_text(f.get("Initiative Misc Mod")) or "0"
    data["bab-1"] = as_text(f.get("BASE ATTACK BONUS")) or "0"
    data["grapple-misc"] = as_text(f.get("Grapple Misc Mod")) or "0"

    # --- Attacks (up to 5) ---
    # Ammunition fields ("AMMUNITION", "AMMUNITION_2", ...) get folded into
    # the per-attack notes since the new sheet has no dedicated ammo field.
    attacks = []
    ammo_keys = ["AMMUNITION", "AMMUNITION_2", "AMMUNITION_3", "AMMUNITION_4", "AMMUNITION_5"]
    for i, n in enumerate(("", " 2", " 3", " 4", " 5")):
        name = as_text(f.get(f"Attack{n}"))
        bonus = as_text(f.get(f"Attack Bonus{n}"))
        damage = as_text(f.get(f"Damage{n if n else ''}"))
        crit = as_text(f.get(f"Critical{n}"))
        rng = as_text(f.get(f"Range{n}"))
        typ = as_text(f.get(f"Type{n}"))
        notes = as_text(f.get(f"Notes{n}"))
        ammo = as_text(f.get(ammo_keys[i]))
        # The "Damage" field with no number is literal "Damage"; handle carefully.
        if n == "":
            damage = as_text(f.get("Damage"))
        if ammo:
            ammo_line = f"Ammunition: {ammo}"
            notes = f"{notes}\n{ammo_line}" if notes else ammo_line
        if any([name, bonus, damage, crit, rng, typ, notes]):
            attacks.append({
                "name": name, "bonus": bonus, "damage": damage,
                "crit": crit, "range": rng, "type": typ, "notes": notes,
            })
    if not attacks:
        attacks = [{"name": "", "bonus": "", "damage": "", "crit": "", "range": "", "type": "", "notes": ""}]
    data["attacks"] = attacks

    # --- Feats / Special Abilities ---
    # Old PDF layout: PG 1..12 = Feats column, PG 13..24 = Special Abilities
    # column. The "_2" suffix variants (PG 1_2..12_2) are additional special
    # abilities (page 2 column). PG 13_2..24_2 are additional feats? In
    # practice those latter slots are never used in our corpus, so we treat
    # all "_2" entries as special abilities.
    feats = []
    for n in range(1, 13):
        v = as_text(f.get(f"PG {n}"))
        if v:
            feats.append(v)
    data["feats"] = feats if feats else [""]

    specials = []
    for n in range(13, 25):
        v = as_text(f.get(f"PG {n}"))
        if v:
            specials.append(v)
    for n in range(1, 25):
        v = as_text(f.get(f"PG {n}_2"))
        if v:
            specials.append(v)
    data["specialAbilities"] = specials if specials else [""]

    # --- Languages ---
    # The old sheet stored languages in fields "1_5", "2_5", "3_4" etc. Best-effort.
    lang_parts = []
    for k in ("1_5", "2_5", "3_5", "1_4", "2_4", "3_4", "4_4"):
        v = as_text(f.get(k))
        if v:
            lang_parts.append(v)
    data["languages"] = ", ".join(lang_parts)

    # --- Armor / Shield / extra protective items ---
    # The old sheet has dedicated "Armor/Protective Item" and
    # "Shield/Protective Item" fields plus generic "Protective Item[N]" extras.
    # "Special Properties" 1..4 line up with the four protective slots in order:
    #   1 = Armor/Protective Item, 2 = Shield/Protective Item,
    #   3 = Protective Item, 4 = Protective Item 2.
    # Names + per-slot AC bonuses + per-slot specials. The four "AC Bonus N"
    # fields line up with the four protective slots in order, except the first
    # two slots use the legacy "Armor Bonus"/"Shield Bonus" names.
    armor_name = as_text(f.get("Armor/Protective Item"))
    shield_name = as_text(f.get("Shield/Protective Item"))
    armor_special = as_text(f.get("Special Properties"))
    shield_special = as_text(f.get("Special Properties 2"))
    armor_ac = as_text(f.get("Armor Bonus")) or "0"
    shield_ac = as_text(f.get("Shield Bonus")) or "0"
    extras = []  # list of (name, special, ac_bonus)
    extra_specials = [
        as_text(f.get("Special Properties 3")),
        as_text(f.get("Special Properties 4")),
        "",  # no Special Properties 5 in template
    ]
    extra_acs = [
        as_text(f.get("AC Bonus 3")) or "0",
        as_text(f.get("AC Bonus 4")) or "0",
        "0",
    ]
    for i, key in enumerate(("Protective Item", "Protective Item 2", "Protective Item 3")):
        name = as_text(f.get(key))
        if name:
            extras.append((name, extra_specials[i], extra_acs[i]))
    # Backfill: if no dedicated armor/shield name, pull from extras in order
    # AND carry over their AC bonus / special so the data isn't lost.
    if not armor_name and extras:
        n, s, ac = extras.pop(0)
        armor_name = n
        if not armor_special:
            armor_special = s
        if armor_ac in ("", "0") and ac not in ("", "0"):
            armor_ac = ac
    if not shield_name and extras:
        n, s, ac = extras.pop(0)
        shield_name = n
        if not shield_special:
            shield_special = s
        if shield_ac in ("", "0") and ac not in ("", "0"):
            shield_ac = ac

    data["armor-name"] = armor_name
    data["armor-type"] = ""
    data["armor-ac-bonus"] = armor_ac
    data["armor-max-dex"] = as_text(f.get("Max Dex")) or ""
    data["armor-check-pen"] = as_text(f.get("Check Penalty")) or "0"
    data["armor-spell-fail"] = as_text(f.get("ARCANE SPELL FAILURE") or f.get("Spell Failure")) or "0"
    data["armor-speed"] = as_text(f.get("Armor Max Speed"))
    data["armor-weight"] = ""
    data["armor-special"] = armor_special
    data["armor-worn"] = bool(data["armor-name"])

    data["shield-name"] = shield_name
    data["shield-ac-bonus"] = shield_ac
    data["shield-check-pen"] = as_text(f.get("Check Penalty 2")) or "0"
    data["shield-spell-fail"] = as_text(f.get("Spell Failure 2")) or "0"
    data["shield-weight"] = ""
    data["shield-special"] = shield_special
    data["shield-worn"] = bool(data["shield-name"])
    data["armor-touch-ac"] = False
    data["shield-touch-ac"] = False

    # --- Magic items: remaining protective items + anything noteworthy ---
    data["magicItems"] = []
    for extra_name, extra_special, extra_ac in extras:
        special_text = "(Legacy protective item)"
        if extra_special:
            special_text = f"{extra_special} (Legacy protective item)"
        ac_bonuses = []
        if extra_ac and extra_ac not in ("0", ""):
            ac_bonuses.append({
                "ac": extra_ac, "type": "Untyped",
                "touch": False, "flatfooted": True,
            })
        data["magicItems"].append({
            "name": extra_name, "weight": "", "special": special_text,
            "slot": "", "worn": True, "isProtective": True,
            "hasAbilityBonuses": False, "acBonuses": ac_bonuses,
        })

    # --- Magic item body slots (worn item names) ---
    SLOT_FIELD_MAP = {
        "head": "HEAD HEADBAND HAT HELMET OR PHYLACTERY",
        "eyes": "EYES EYE LENSES OR GOGGLES",
        "neck": "NECK AMULET BROOCH MEDALLION PERIAPT OR SCARAB",
        "shoulders": "SHOULDERS CLOAK CAPE OR MANTLE",
        "ring1": "RING 1",
        "ring2": "RING 2",
        "hands": "HANDS GLOVES OR GAUNTLETS",
        "arms": "ARMSWRISTS BRACERS OR BRACELETS",
        "body": None,   # No matching field in old PDF
        "torso": "TORSO VEST VESTMENT OR SHIRT",
        "waist": "WAIST BELT OR GIRDLE",
        "feet": "FEET BOOTS SHOES OR SLIPPERS",
    }
    for sid in ITEM_SLOT_IDS:
        pdf_key = SLOT_FIELD_MAP.get(sid)
        data[f"slot-{sid}"] = as_text(f.get(pdf_key)) if pdf_key else ""

    # --- Soulmelds ---
    # Old PDF has 10 soulmeld rows: SOULMELD[_N], CHAKRA[_N], BASE EFFECT[_N],
    # BIND EFFECT[_N], ESSENTIA EFFECT[_N]. Map by chakra name into the new
    # sheet's slotSoulmelds keyed by body-slot id.
    CHAKRA_TO_SLOT = {
        "crown": "head", "head": "head", "brow": "head",
        "eyes": "eyes", "eye": "eyes",
        "throat": "neck", "neck": "neck",
        "shoulders": "shoulders", "shoulder": "shoulders",
        "arms": "arms", "wrist": "arms", "wrists": "arms",
        "hands": "hands", "hand": "hands",
        "ring": "ring1", "ring 1": "ring1", "ring1": "ring1",
        "ring 2": "ring2", "ring2": "ring2",
        "torso": "torso", "chest": "torso",
        "heart": "body", "body": "body",
        "waist": "waist", "belt": "waist",
        "feet": "feet", "foot": "feet",
        "soul": None, "totem": None,
    }
    data["slotSoulmelds"] = {}
    legacy_soulmelds = []  # ones we couldn't slot
    for n in range(1, 11):
        suffix = "" if n == 1 else f"_{n}"
        sm_name = as_text(f.get(f"SOULMELD{suffix}"))
        if not sm_name:
            continue
        chakra_raw = as_text(f.get(f"CHAKRA{suffix}")).strip().lower()
        base_eff = as_text(f.get(f"BASE EFFECT{suffix}"))
        bind_eff = as_text(f.get(f"BIND EFFECT{suffix}"))
        ess_eff = as_text(f.get(f"ESSENTIA EFFECT{suffix}"))
        slot_id = CHAKRA_TO_SLOT.get(chakra_raw)
        record = {
            "enabled": True,
            "name": sm_name,
            "bound": bool(bind_eff),
            "split": False,
            "double": False,
            "base": base_eff,
            "bindEffect": bind_eff,
            "extraCap": "0",
            "essentia": _parse_essentia_count(ess_eff),
        }
        if slot_id and slot_id not in data["slotSoulmelds"]:
            data["slotSoulmelds"][slot_id] = record
        else:
            # Stash for the notes field on the class-features tab.
            tag = chakra_raw or "?"
            legacy_soulmelds.append(f"{sm_name} ({tag}): {base_eff}")
    if legacy_soulmelds:
        data["legacy-soulmelds"] = legacy_soulmelds

    # --- Money (note: old sheet has "Copper Weight" style field which are weights) ---
    data["money-cp"] = as_text(f.get("Copper Pieces"))
    data["money-sp"] = as_text(f.get("Silver Pieces"))
    data["money-gp"] = as_text(f.get("Gold Pieces"))
    data["money-pp"] = as_text(f.get("Platinum Pieces"))

    # --- Gear rows ---
    # Collect ITEMRow* fields ("Items of Note" column on the old sheet) and
    # Poss * fields ("Possessions on Person" column). Both flow into the new
    # sheet's single gear list. The "Loc N" / "Weight N" fields pair with
    # Poss N to give location + weight; ITEMRow has no paired loc/weight.
    gear = []
    for n in range(1, 18):
        for suffix in ("", "_2"):
            key = f"ITEMRow{n}{suffix}"
            name = as_text(f.get(key))
            if name:
                gear.append({"name": name, "weight": "", "location": "", "notes": ""})
    for n in range(1, 30):
        name = as_text(f.get(f"Poss {n}"))
        if name:
            gear.append({
                "name": name,
                "weight": as_text(f.get(f"Weight {n}")),
                "location": as_text(f.get(f"Loc {n}")),
                "notes": "",
            })
    # Some templates have Weight 30..65 (and Loc only 1..28). Surface any
    # leftover weights as untitled gear rows so the data isn't dropped.
    for n in range(30, 66):
        w = as_text(f.get(f"Weight {n}"))
        if w:
            gear.append({"name": "", "weight": w, "location": "", "notes": ""})
    data["gear"] = gear

    # --- Notes / Other Information ---
    # Old PDF has up to 5 separate Other Information textboxes (one is misspelled
    # "Informiation" — leave that alone, it's the actual field name).
    notes_parts = []
    oi_keys = [
        ("Other Information", None),
        ("Other Informiation 2", "Planned Progression"),  # sic
        ("Other Information 3", None),
        ("Other Information 4", None),
        ("Other Information 5", None),
    ]
    for key, header in oi_keys:
        v = as_text(f.get(key))
        if not v:
            continue
        if header:
            notes_parts.append(f"--- {header} ---\n{v}")
        else:
            notes_parts.append(v)
    data["notes"] = "\n\n".join(notes_parts)

    # --- Spellcasting / Psionics ---
    data["casters"] = build_casters(f)

    # --- Skills ---
    data["skills"] = build_skills(f)
    # The old sheet's "Extra Skill" rows have ranks/misc/stat but no name
    # field, so import them as untitled custom skills the user can rename.
    custom_skills = []
    for n in range(1, 4):
        ranks = as_text(f.get(f"Extra Skill Ranks {n}"))
        misc = as_text(f.get(f"Extra Skill Misc Mod {n}"))
        stat = as_text(f.get(f"Extra Skill Stat Mod {n}")).strip().upper()
        # "Extra Skill Mod N" is the computed total; we ignore it (the new
        # sheet recalculates from ranks + ability + misc).
        if not (ranks or misc or stat):
            continue
        ability = stat[:3] if stat[:3] in ("STR", "DEX", "CON", "INT", "WIS", "CHA") else "NONE"
        custom_skills.append({
            "name": f"Custom Skill {n}",
            "ability": ability,
            "ranks": ranks or "0",
            "misc": misc or "0",
            "classSkill": False,
        })
    data["customSkills"] = custom_skills

    # --- Class features: Rage + Turn/Rebuke Undead ---
    # Old PDF -> new sheet field IDs (class-features.js):
    #   Turning Check  -> turn-check     Turning Damage -> turn-damage
    #   RAGESDAY       -> rage-per-day   RAGE DURATION  -> rage-duration
    #   RageStr/RageCon-> rage-str-con   RAGE WILL SAVE -> rage-will
    #   RAGE AC PENALTY-> rage-ac        ROUNDS ELAPSED -> rage-rounds
    # (rage-used has no direct PDF analog; left blank.)
    data["turn-check"] = as_text(f.get("Turning Check"))
    data["turn-damage"] = as_text(f.get("Turning Damage"))
    data["rage-per-day"] = as_text(f.get("RAGESDAY"))
    data["rage-duration"] = as_text(f.get("RAGE DURATION"))
    # RageStr and RageCon are nominally separate fields but in practice
    # always equal (the rage bonus applies to both). Prefer RageStr.
    data["rage-str-con"] = as_text(f.get("RageStr")) or as_text(f.get("RageCon"))
    data["rage-will"] = as_text(f.get("RAGE WILL SAVE"))
    # RAGE AC PENALTY in the old PDF is stored as a positive number; the
    # new sheet's getActiveBonuses() adds rage-ac directly to AC, so the
    # value needs to be negative. Flip the sign if it isn't already.
    rage_ac_raw = as_text(f.get("RAGE AC PENALTY"))
    if rage_ac_raw:
        try:
            n = int(re.sub(r"[^\d\-]", "", rage_ac_raw))
            data["rage-ac"] = str(-abs(n)) if n else "0"
        except ValueError:
            data["rage-ac"] = rage_ac_raw
    else:
        data["rage-ac"] = ""
    data["rage-rounds"] = as_text(f.get("ROUNDS ELAPSED"))

    # --- Companion ---
    comp = build_companion(f)
    data["companions"] = [comp] if comp else []

    return data


# ---------------------------------------------------------------------------
# Spells / Powers
# ---------------------------------------------------------------------------

# Old PDF level prefixes for the per-level spell-text textboxes.
_LVL_PREFIXES = {
    0: ["0"],
    1: ["1st"],
    2: ["2nd"],
    3: ["3rd"],
    4: ["4th"],
    5: ["5th"],
    6: ["6th"],
    7: ["7th"],
    8: ["8th"],
    9: ["9th"],
}

# Map for the ability stat field
_STAT_MAP = {
    "str": "STR", "dex": "DEX", "con": "CON",
    "int": "INT", "wis": "WIS", "cha": "CHA",
}

# Map "1ST".."9TH" old field names to slot levels (1..9). Level-0 slots use "0".
_SLOT_FIELDS = {1: "1ST", 2: "2ND", 3: "3RD", 4: "4TH", 5: "5TH",
                6: "6TH", 7: "7TH", 8: "8TH", 9: "9TH"}

# Map the "MAXIMUM POWER LEVEL KNOWN" string ("2nd", "9th", etc.) to int.
def _parse_power_level(raw: str) -> int:
    if not raw:
        return 0
    m = re.match(r"\s*(\d+)", raw)
    return int(m.group(1)) if m else 0


def _parse_essentia_count(text: str) -> int:
    """Extract leading integer from an essentia-effect string. The old PDF
    stores essentia level as text like "1: blah, 2: blah" or just "0"."""
    if not text:
        return 0
    m = re.search(r"\b(\d+)\b", text)
    return int(m.group(1)) if m else 0


def _is_just_number(s: str) -> bool:
    return bool(re.fullmatch(r"\s*\d+\s*", s or ""))


# Some PDF flavors put the per-level spell list in unnamed (Acroform-default)
# fields that pypdf surfaces as 'undefined_NNN'.  Empirically the layout is:
#   undefined_173 = level 0 spell list
#   undefined_174 = level 1
#   undefined_175 = level 2
#   undefined_176 = level 3
#   undefined_177 = level 4
#   undefined_210 = level 5  (best guess; Dragonfire Adept uses it for "Greater")
#   undefined_212 = level 6  (best guess)
# Higher levels are unreliable across templates; user can fix after import.
_UNDEFINED_LEVEL_FIELDS = {
    0: "undefined_173",
    1: "undefined_174",
    2: "undefined_175",
    3: "undefined_176",
    4: "undefined_177",
    5: "undefined_178",
    6: "undefined_210",
    7: "undefined_211",
    8: "undefined_212",
    9: "undefined_213",
}


def _gather_level_text(f: dict[str, str], level: int) -> str:
    """Concatenate all old per-level text fields for a given spell level.

    The old PDF has fields like '1st 1', '1st 2', ... '1st 7' as a stack of
    textboxes for level-1 spells. Level 0 uses '0 1'..'0 5'.  The bare
    prefixes ('0', '1st', '9th', etc.) and 'Spells Known Level N' are
    sometimes used as slot counts rather than text — we skip them when they
    look like a plain number.  Some PDF templates also put the main spell-list
    text in 'undefined_NNN' fields (see _UNDEFINED_LEVEL_FIELDS).
    """
    parts: list[str] = []
    for prefix in _LVL_PREFIXES.get(level, []):
        # bare prefix (e.g. '0', '9th') — only keep if non-numeric
        v = as_text(f.get(prefix))
        if v and not _is_just_number(v):
            parts.append(v)
        # numbered variants
        for n in range(1, 10):
            v = as_text(f.get(f"{prefix} {n}"))
            if v and not _is_just_number(v):
                parts.append(v)
    # 'Spells Known Level N' — also skip bare numbers (used for spontaneous-caster counts)
    skl = as_text(f.get(f"Spells Known Level {level}"))
    if skl and not _is_just_number(skl):
        parts.append(skl)
    # Undefined-NNN per-level field (alternative PDF template)
    udef = _UNDEFINED_LEVEL_FIELDS.get(level)
    if udef:
        v = as_text(f.get(udef))
        if v and not _is_just_number(v):
            parts.append(v)
    return "\n".join(parts)


def _gather_slot_count(f: dict[str, str], level: int) -> str:
    """Best-effort per-day slot count for a given level."""
    if level == 0:
        v = as_text(f.get("0"))
        if v and _is_just_number(v):
            return v
    slot_field = _SLOT_FIELDS.get(level)
    if slot_field:
        v = as_text(f.get(slot_field))
        if v and _is_just_number(v):
            return v
    # Fallback: 'Spells Known Level N' if it's a bare count
    skl = as_text(f.get(f"Spells Known Level {level}"))
    if skl and _is_just_number(skl):
        return skl
    return ""


def _gather_excast(f: dict[str, str], level: int) -> str:
    """Concatenate ExCastList<level>N fields (domain/extra-cast spells)."""
    prefix_map = {0: "0th", 1: "1st", 2: "2nd", 3: "3rd",
                  4: "4th", 5: "5th", 6: "6th", 7: "7th", 8: "8th", 9: "9th"}
    pref = prefix_map.get(level)
    if not pref:
        return ""
    parts = []
    for n in range(1, 10):
        v = as_text(f.get(f"ExCastList{pref}{n}"))
        if v:
            parts.append(v)
    return "\n".join(parts)


def _detect_caster_kind(f: dict[str, str]) -> str | None:
    """Return 'psionics', 'spellcasting', or None."""
    psionic_markers = [
        "MAXIMUM POWER LEVEL KNOWN", "POWER POINTS PER DAY",
        "POWERS KNOWN", "PRIMARY DISCIPLINE",
    ]
    has_psi = any(as_text(f.get(k)) for k in psionic_markers)

    spell_markers = [
        "DOMAIN NAME", "DOMAIN NAME_2", "DOMAINSSPECIALTY SCHOOL",
        "GRANTED POWER", "GRANTED POWER_2",
    ]
    has_spell = any(as_text(f.get(k)) for k in spell_markers)
    # Slots / spells-known counts also imply spellcasting
    if any(as_text(f.get(k)) for k in _SLOT_FIELDS.values()):
        has_spell = True
    for lvl in range(0, 10):
        if as_text(f.get(f"Spells Known Level {lvl}")) or as_text(f.get(f"SAVE DC Level {lvl}")):
            has_spell = True
            break
    # 'undefined_NNN' alternative-template spell-list fields also indicate spellcasting
    if any(as_text(f.get(v)) for v in _UNDEFINED_LEVEL_FIELDS.values()):
        has_spell = True
    # Per-level text fields imply some kind of caster but don't disambiguate
    has_text = any(_gather_level_text(f, l) for l in range(0, 10))

    if has_psi and not has_spell:
        return "psionics"
    if has_spell and not has_psi:
        return "spellcasting"
    if has_psi and has_spell:
        # Both present — favor psionics since psi-specific fields are usually deliberate
        return "psionics"
    if has_text:
        return "spellcasting"
    return None


def build_casters(f: dict[str, str]) -> list[dict]:
    """Best-effort: produce a single caster entry from the PDF.

    The old PDF only supports one caster block, so we emit at most one.  The
    user can split or duplicate after import.
    """
    kind = _detect_caster_kind(f)
    if kind is None:
        return []

    stat_raw = as_text(f.get("stat"))
    ability = _STAT_MAP.get(stat_raw.strip().lower()[:3], "")

    if kind == "psionics":
        max_lvl_raw = as_text(f.get("MAXIMUM POWER LEVEL KNOWN"))
        max_lvl = _parse_power_level(max_lvl_raw) or 9
        max_lvl = max(1, min(max_lvl, 9))
        # Some characters (e.g. Illithid Savant) have higher-level spell-like
        # entries via ExCastList<lvl>N fields beyond their MAXIMUM POWER LEVEL.
        # Extend max_lvl to include any level where ExCast content exists.
        for lvl in range(max_lvl + 1, 10):
            if _gather_excast(f, lvl).strip() or _gather_level_text(f, lvl).strip():
                max_lvl = lvl
        caster = {
            "type": "psionics",
            "name": as_text(f.get("PRIMARY DISCIPLINE")) or "Psionics",
            "discipline": as_text(f.get("PRIMARY DISCIPLINE")),
            "manifesterLevel": "",
            "ppBase": as_text(f.get("POWER POINTS PER DAY")),
            "ppSpent": "0",
            "powersKnown": as_text(f.get("POWERS KNOWN")),
            "ability": ability or "INT",
            "maxLevel": max_lvl,
            "notes": (f"Maximum power level known: {max_lvl_raw}" if max_lvl_raw else ""),
        }
        for lvl in range(1, max_lvl + 1):
            text = _gather_level_text(f, lvl)
            extra = _gather_excast(f, lvl)
            if extra:
                text = text + ("\n" if text else "") + extra
            caster[f"power-{lvl}"] = text
        return [caster]

    # spellcasting
    max_lvl = 9
    domain_access = bool(as_text(f.get("DOMAIN NAME")) or as_text(f.get("DOMAIN NAME_2")))
    specialty = as_text(f.get("DOMAINSSPECIALTY SCHOOL"))
    prohibited = []
    for k in ("Prohibited School", "Prohibited School 2"):
        v = as_text(f.get(k))
        if v and not v.lower().startswith("cl "):  # filter out misused "CL N" entries
            prohibited.append(v)

    caster = {
        "type": "spellcasting",
        "name": "Spellcasting",
        "casterLevel": "",
        "ability": ability or "INT",
        "conditional": "",
        "specialist": bool(specialty),
        "specialtySchool": specialty,
        "prohibitedSchools": prohibited,
        "domainAccess": domain_access,
        "domain1Name": as_text(f.get("DOMAIN NAME")),
        "domain1Power": as_text(f.get("GRANTED POWER")),
        "domain2Name": as_text(f.get("DOMAIN NAME_2")),
        "domain2Power": as_text(f.get("GRANTED POWER_2")),
        "maxLevel": max_lvl,
        "notes": "",
    }
    for lvl in range(0, max_lvl + 1):
        text = _gather_level_text(f, lvl)
        # Acrobat auto-named the level-3 spell text fields "SPECIAL ABILITIES
        # 1..3" instead of giving them a sane name; fold them in here.
        if lvl == 3:
            for sa_key in ("SPECIAL ABILITIES 1", "SPECIAL ABILITIES 2", "SPECIAL ABILITIES 3"):
                sa_val = as_text(f.get(sa_key))
                if sa_val:
                    text = text + ("\n" if text else "") + sa_val
        caster[f"text-{lvl}"] = text
        caster[f"prepared-{lvl}"] = _gather_excast(f, lvl)
        caster[f"perDay-{lvl}"] = _gather_slot_count(f, lvl)
        caster[f"bonus-{lvl}"] = ""
        caster[f"used-{lvl}"] = "0"
        caster[f"known-{lvl}"] = as_text(f.get(f"Spells Known Level {lvl}"))
        if lvl >= 1:
            caster[f"domain-{lvl}"] = ""
            caster[f"specialist-{lvl}"] = ""
    return [caster]


def build_companion(f: dict[str, str]) -> dict | None:
    """Build a single companion entry from the old Comp* fields."""
    # Anything filled at all?
    markers = [
        "Comp Str", "Comp Dex", "Comp HP", "COMP SPEED", "Companion Skill 1",
        "Comp Weapon 1", "CREATURE TYPE",
    ]
    if not any(as_text(f.get(m)) for m in markers):
        return None

    d: dict = {}
    explicit_name = as_text(f.get("Companion Name"))
    creature_type = as_text(f.get("CREATURE TYPE"))
    d["name"] = explicit_name or creature_type or "Companion"
    d["compName"] = explicit_name or creature_type
    d["compType"] = creature_type
    d["compPersonality"] = as_text(f.get("Comp Personality"))
    d["isFamiliar"] = False
    for ab, key in [("str", "Comp Str"), ("dex", "Comp Dex"), ("con", "Comp Con"),
                    ("int", "Comp Int"), ("wis", "Comp Wis"), ("cha", "Comp Cha")]:
        d[f"comp-{ab}-score"] = as_text(f.get(key))
    d["compHpMax"] = as_text(f.get("Comp HP"))
    d["compHpCur"] = as_text(f.get("Comp HP"))
    d["compSpeed"] = as_text(f.get("COMP SPEED"))
    d["compInitMisc"] = re.sub(r"^\+", "", as_text(f.get("COMP INITIATIVE"))) or "0"
    d["compAcArmor"] = "0"
    d["compAcShield"] = "0"
    d["compAcNatural"] = as_text(f.get("COMP NATURAL")) or "0"
    d["compAcSize"] = as_text(f.get("COMP SIZE")) or "0"
    d["compAcMisc"] = as_text(f.get("COMP MISC")) or "0"
    # The old PDF stores derived totals (Comp AC, Comp Touch AC, Comp
    # Flatfooted AC, Comp AC Dex). The new sheet recomputes these, but
    # surface them as notes so nothing is silently lost.
    derived_ac = []
    for label, key in (
        ("Total AC", "Comp AC"),
        ("Touch AC", "Comp Touch AC"),
        ("Flat-footed AC", "Comp Flatfooted AC"),
        ("AC Dex", "Comp AC Dex"),
    ):
        v = as_text(f.get(key))
        if v:
            derived_ac.append(f"{label}: {v}")
    for save, key in [("Fort", "Comp Fort"), ("Ref", "Comp Ref"), ("Will", "Comp Will")]:
        raw = re.sub(r"^\+", "", as_text(f.get(key)))
        d[f"compSave{save}Base"] = raw or "0"
        d[f"compSave{save}Misc"] = "0"
    d["compBab"] = "0"
    d["compGrappleSize"] = "0"
    d["compGrappleMisc"] = as_text(f.get("Comp Grapple Mod")) or "0"

    specials = [as_text(f.get(f"Comp Special Abilities {i}")) for i in range(1, 9)]
    d["compSpecial"] = "\n".join(s for s in specials if s)
    d["compNotes"] = "\n".join(derived_ac)

    atks = []
    for i in range(1, 6):
        w = as_text(f.get(f"Comp Weapon {i}"))
        b = as_text(f.get(f"Comp Attack Bonus {i}"))
        dmg = as_text(f.get(f"Comp Damage {i}"))
        c = as_text(f.get(f"Comp Crit {i}"))
        if any([w, b, dmg, c]):
            atks.append({"weapon": w, "bonus": b, "damage": dmg, "crit": c})
    d["compAttacks"] = atks

    skills = []
    for i in range(1, 21):
        name = as_text(f.get(f"Companion Skill {i}"))
        stat = as_text(f.get(f"Comp Skill Stat {i}"))
        if name or stat:
            skills.append({"name": name, "ranks": "", "misc": stat})
    d["compSkills"] = skills

    feats = []
    for i in range(1, 13):
        v = as_text(f.get(f"Comp Feats {i}"))
        if v:
            feats.append({"name": v, "notes": ""})
    d["compFeats"] = feats
    tricks = []
    for i in range(1, 7):
        v = as_text(f.get(f"Comp Tricks {i}"))
        if v:
            tricks.append({"name": v, "known": True})
    d["compTricks"] = tricks

    return d


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def sanitize_filename(name: str) -> str:
    name = name.strip() or "character"
    return re.sub(r"[^A-Za-z0-9_-]+", "_", name).strip("_") or "character"


def convert_one(pdf_path: Path, out_dir: Path) -> str | None:
    f = read_fields(pdf_path)
    if not f:
        return None
    data = map_pdf_to_json(f)
    base = data.get("char-name") or pdf_path.stem
    out_file = out_dir / f"{sanitize_filename(base)}.json"
    # Disambiguate collisions
    i = 2
    while out_file.exists():
        out_file = out_dir / f"{sanitize_filename(base)}_{i}.json"
        i += 1
    out_file.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    return out_file.name


def main(argv: list[str]) -> int:
    src = Path(argv[1]) if len(argv) > 1 else Path(DEFAULT_SRC)
    out = Path(argv[2]) if len(argv) > 2 else DEFAULT_OUT
    if not src.is_dir():
        print(f"Source folder not found: {src}", file=sys.stderr)
        return 2
    out.mkdir(parents=True, exist_ok=True)

    pdfs = sorted(p for p in src.glob("*.pdf"))
    print(f"Importing {len(pdfs)} PDF(s) from {src} -> {out}")
    ok = fail = 0
    for p in pdfs:
        try:
            result = convert_one(p, out)
            if result:
                ok += 1
                print(f"  [OK]   {p.name} -> {result}")
            else:
                fail += 1
                print(f"  [skip] {p.name} (no form fields)")
        except Exception as e:
            fail += 1
            print(f"  [FAIL] {p.name}: {e}", file=sys.stderr)
    print(f"\nDone: {ok} converted, {fail} skipped/failed.")
    print(f"Use the 'Import Character' button in the sheet to load any .json from {out}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
