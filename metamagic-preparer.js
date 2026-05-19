// metamagic-preparer.js — Inline popover that lets the player apply
// metamagic feats when copying a Known spell to the Prepared list.
//
// Usage (from spells.js):
//   MetamagicPreparer.open({
//     panel,           // the spellcasting panel
//     anchorRow,       // the .sc-known-row to anchor under
//     baseLevel,       // the spell's base level on this caster's list
//     spellName,       // the raw spell name (e.g. "Fireball")
//   });
//
// When the user clicks "Prepare", the modified spell line is appended
// to the correct level's `.sc-spell-prepared` textarea (i.e. base +
// total adjustments). The popover closes itself.
//
// Heighten Spell is treated specially: it offers a target-level input
// instead of a flat adjustment. Energy Substitution and similar "0
// adjustment" feats still appear and modify the resulting name.
//
// Reads the character's metamagic feats from the Feats tab via the
// same scan used by Spells.refreshMetamagicReference, and looks up
// each via the same DB-first / catalog-fallback helper.

(function () {
  // -- Past-participle map for common metamagic feats. Used to render
  // a prefix in the prepared spell line. Stops the prepared list
  // looking like "Empower Spell Fireball" — RAW convention is
  // "Empowered Fireball" / "Maximized Fireball" etc.
  //
  // Unknown feats fall back to the raw name minus " Spell" suffix
  // (e.g. "Persistent" from "Persistent Spell"). If even that is
  // empty, the suffix "(FeatName)" form is used as a last resort.
  const ADJECTIVE = {
    "Empower Spell":     "Empowered",
    "Maximize Spell":    "Maximized",
    "Quicken Spell":     "Quickened",
    "Extend Spell":      "Extended",
    "Silent Spell":      "Silent",
    "Still Spell":       "Still",
    "Enlarge Spell":     "Enlarged",
    "Widen Spell":       "Widened",
    "Heighten Spell":    "Heightened",
    "Persistent Spell":  "Persistent",
    "Repeat Spell":      "Repeated",
    "Twin Spell":        "Twinned",
    "Sculpt Spell":      "Sculpted",
    "Energy Substitution": "Energy-Substituted",
    "Energy Admixture":  "Energy-Admixed",
    "Sanctum Spell":     "Sanctum",
    "Delay Spell":       "Delayed",
    "Consecrate Spell":  "Consecrated",
    "Purify Spell":      "Purified",
    "Nonlethal Substitution": "Nonlethal",
    "Disrupting Spell":  "Disrupting",
    "Deceptive Spell":   "Deceptive",
    "Invisible Spell":   "Invisible",
    "City Magic":        "City-Charged",
    "Piercing Cold":     "Piercing",
    "Ocular Spell":      "Ocular",
    "Reach Spell":       "Reach",
    "Sacred Spell":      "Sacred",
    "Innate Spell":      "Innate",
    "Cooperative Spell": "Cooperative",
    "Fortify Spell":     "Fortified",
    "Ocular Spell":      "Ocular",
  };

  function adjectiveFor(featName) {
    if (ADJECTIVE[featName]) return ADJECTIVE[featName];
    // Strip " Spell" suffix and use bare name if non-empty.
    const stripped = featName.replace(/\s+Spell$/i, "").trim();
    if (stripped && stripped !== featName) return stripped;
    return null; // signal: fall back to "(FeatName)" suffix form
  }

  // Read the character's metamagic feats from the Feats tab (mirrors
  // Spells.refreshMetamagicReference's scan). Returns
  // [{name, meta:{levelAdjustment, effect, actionTypeMod}}, ...].
  function readCharacterMetamagicFeats() {
    // `Spells` is a top-level const declared in spells.js (loaded
    // before this file). Use a `typeof` guard since the module is
    // not on the global window object.
    if (typeof Spells === "undefined" || !Spells.lookupMetamagicFromDB) {
      return [];
    }
    const featInputs = document.querySelectorAll(
      "#feats-container .feat-entry");
    const out = [];
    const seen = new Set();
    for (const el of featInputs) {
      const raw = String(el.value || "").trim();
      if (!raw) continue;
      const firstLine = raw.split(/\r?\n/)[0].trim();
      // Strip a trailing parenthetical (e.g. "Empower Spell (Sor 5)")
      const name = firstLine.replace(/\s*\([^)]*\)\s*$/, "").trim();
      if (!name || seen.has(name)) continue;
      seen.add(name);
      const meta = Spells.lookupMetamagicFromDB(name);
      if (meta) out.push({ name, meta });
    }
    return out;
  }

  // Returns true iff the character has at least one metamagic feat.
  // Used by spells.js to conditionally show the ✨ button.
  function characterHasAnyMetamagic() {
    return readCharacterMetamagicFeats().length > 0;
  }

  // -- v2 Phase B: Daily-use tracking for Sudden* feats ---------------
  //
  // The Sudden Empower / Sudden Maximize / Sudden Quicken / etc. feats
  // (CArc) are 1/day "free metamagic" charges — they apply the
  // metamagic at +0 slot cost. Catalog already has them at
  // `level_adjustment: 0`; this layer tracks whether the daily charge
  // has been spent.
  //
  // Marker convention: append "[Used today]" (case-insensitive) on a
  // new line in the feat-entry textarea. Persists via the Feats tab's
  // existing serialization. A "Reset daily uses" button (added next
  // to the metamagic-reference panel header) strips the marker from
  // all Sudden* feats.

  const SUDDEN_FEAT_RE = /^Sudden\s+\w+$/i;

  // Returns true iff the feat-entry text contains the "used today"
  // marker.
  function isFeatUsedToday(rawText) {
    return /\[\s*used\s+today\s*\]/i.test(rawText || "");
  }

  // Find the feat-entry textarea for a given feat name. Returns null
  // if no matching entry exists.
  function findFeatEntry(featName) {
    const featInputs = document.querySelectorAll(
      "#feats-container .feat-entry");
    const target = String(featName || "").trim().toLowerCase();
    for (const el of featInputs) {
      const raw = String(el.value || "").trim();
      if (!raw) continue;
      const firstLine = raw.split(/\r?\n/)[0].trim();
      const name = firstLine.replace(/\s*\([^)]*\)\s*$/, "").trim();
      if (name.toLowerCase() === target) return el;
    }
    return null;
  }

  // Mark a feat as used today (appends "[Used today]" if not already
  // present). Returns true if a change was made.
  function markFeatUsed(featName) {
    const el = findFeatEntry(featName);
    if (!el) return false;
    if (isFeatUsedToday(el.value)) return false;
    const cur = el.value.replace(/\s+$/, "");
    el.value = cur + "\n[Used today]";
    el.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  }

  // Unmark a feat (removes any "[Used today]" lines).
  function unmarkFeatUsed(featName) {
    const el = findFeatEntry(featName);
    if (!el) return false;
    if (!isFeatUsedToday(el.value)) return false;
    el.value = el.value
      .split(/\r?\n/)
      .filter(line => !/^\s*\[\s*used\s+today\s*\]\s*$/i.test(line))
      .join("\n");
    el.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  }

  // Reset all Sudden* feats (strip "[Used today]" from each). Useful
  // as a "new day" / long-rest button. Returns the count of feats
  // affected.
  function resetAllDailyUses() {
    const featInputs = document.querySelectorAll(
      "#feats-container .feat-entry");
    let n = 0;
    for (const el of featInputs) {
      const raw = String(el.value || "").trim();
      if (!raw) continue;
      const firstLine = raw.split(/\r?\n/)[0].trim();
      const name = firstLine.replace(/\s*\([^)]*\)\s*$/, "").trim();
      if (SUDDEN_FEAT_RE.test(name) && isFeatUsedToday(el.value)) {
        el.value = el.value
          .split(/\r?\n/)
          .filter(line => !/^\s*\[\s*used\s+today\s*\]\s*$/i.test(line))
          .join("\n");
        el.dispatchEvent(new Event("input", { bubbles: true }));
        n++;
      }
    }
    return n;
  }

  // -- v2: Reduction-feat detection -----------------------------------
  //
  // Scan the entire Feats tab (not just metamagic feats) for cost
  // reducers and reduction-config notes. Returns:
  //
  //   {
  //     improvedMetamagic: bool,            // ELH "all metamagic -1"
  //     arcaneThesisSpells: [str, ...],     // PHB2 — one per "Arcane Thesis" feat
  //     easyMetamagicFeats: [str, ...],     // PHB2 — one per "Easy Metamagic" feat
  //   }
  //
  // Configuration lives in the additional lines of the feat entry:
  //   Arcane Thesis
  //   Thesis spell: Fireball
  //
  //   Easy Metamagic
  //   Reduces: Maximize Spell
  //
  // The first line is the feat name; subsequent lines are scanned for
  // `Thesis spell:` and `Reduces:` (case-insensitive). If a config
  // line is missing, the slot stays unset (the picker surfaces a hint
  // pointing the user at the Feats tab).
  function readReductionFeats() {
    const out = {
      improvedMetamagic: false,
      arcaneThesisSpells: [],
      easyMetamagicFeats: [],
    };
    const featInputs = document.querySelectorAll(
      "#feats-container .feat-entry");
    for (const el of featInputs) {
      const raw = String(el.value || "").trim();
      if (!raw) continue;
      const lines = raw.split(/\r?\n/);
      const firstLine = lines[0].trim();
      // Strip trailing parenthetical from the feat name for matching.
      const name = firstLine.replace(/\s*\([^)]*\)\s*$/, "").trim();
      const rest = lines.slice(1).join("\n");
      if (/^improved metamagic$/i.test(name)) {
        out.improvedMetamagic = true;
      } else if (/^arcane thesis$/i.test(name)) {
        const m = rest.match(/thesis\s*spell\s*:\s*(.+?)(?:\r?\n|$)/i);
        out.arcaneThesisSpells.push(m ? m[1].trim() : "");
      } else if (/^easy metamagic$/i.test(name)) {
        const m = rest.match(/reduces?\s*:\s*(.+?)(?:\r?\n|$)/i);
        out.easyMetamagicFeats.push(m ? m[1].trim() : "");
      }
    }
    return out;
  }

  // Compute the effective per-feat adjustment after applying all
  // reduction sources. Returns:
  //
  //   {
  //     featAdjustments: Map<featName, { base, reduced, reasons:[str,...] }>,
  //     baseLevelFloor: int  // the lowest the spell's effective level
  //                          // can go (Arcane Thesis: not below
  //                          // baseLevel; otherwise no floor beyond
  //                          // each feat's per-feat min)
  //     warnings: [str, ...]
  //   }
  //
  // `feats` = list of {name, meta} for the metamagic feats CURRENTLY
  // selected in the picker. `spellName` is the base spell being cast.
  // `sanctumInSanctum` is the user's contextual toggle for Sanctum
  // Spell (default false — out of sanctum = +1).
  function computeAdjustments(feats, spellName, sanctumInSanctum) {
    const reductions = readReductionFeats();
    const map = new Map();
    const warnings = [];

    const isThesisSpell = reductions.arcaneThesisSpells
      .some(s => s && s.toLowerCase() === String(spellName || "").toLowerCase());

    for (const f of feats) {
      const baseAdj = (f.meta.levelAdjustment === "variable")
        ? "variable"
        : (typeof f.meta.levelAdjustment === "number"
          ? f.meta.levelAdjustment
          : 0);
      const reasons = [];
      let adj = baseAdj;

      // Sanctum Spell special case: ±1 depending on context. Override
      // the catalog's "variable" with the resolved value here so the
      // picker doesn't ask for a target level on Sanctum.
      if (f.name === "Sanctum Spell") {
        adj = sanctumInSanctum ? 0 : 1;
        reasons.push(sanctumInSanctum ? "in sanctum (+0)" : "out of sanctum (+1)");
      }

      // Numeric reductions stack additively, but the per-feat minimum
      // remains +1 if the feat's NORMAL cost is +1 or more (per
      // Improved Metamagic / Arcane Thesis / Easy Metamagic RAW).
      if (typeof adj === "number" && adj > 0) {
        const origAdj = adj;
        let reduction = 0;

        if (reductions.improvedMetamagic) {
          reduction += 1;
          reasons.push("Improved Metamagic (-1)");
        }
        if (isThesisSpell) {
          reduction += 1;
          reasons.push("Arcane Thesis (-1)");
        }
        const easyHit = reductions.easyMetamagicFeats
          .some(t => t && t.toLowerCase() === f.name.toLowerCase());
        if (easyHit) {
          reduction += 1;
          reasons.push("Easy Metamagic (-1)");
        }

        // Apply with per-feat min of +1 (RAW: cost cannot drop below
        // +1 for any feat whose normal cost is +1 or more).
        const reduced = Math.max(1, origAdj - reduction);
        adj = reduced;
      }
      // For +0 feats (Energy Substitution, Sudden* etc.), reductions
      // don't apply — the cost is already 0.

      map.set(f.name, { base: baseAdj, reduced: adj, reasons });
    }

    // Surface unconfigured reduction feats so the user knows to set
    // them up on the Feats tab.
    const unconfiguredThesis = reductions.arcaneThesisSpells
      .filter(s => !s).length;
    if (unconfiguredThesis > 0) {
      warnings.push(
        `${unconfiguredThesis} Arcane Thesis feat${unconfiguredThesis === 1 ? "" : "s"} has no configured spell. ` +
        `On the Feats tab, add a 2nd line under Arcane Thesis: "Thesis spell: <SpellName>".`);
    }
    const unconfiguredEasy = reductions.easyMetamagicFeats
      .filter(s => !s).length;
    if (unconfiguredEasy > 0) {
      warnings.push(
        `${unconfiguredEasy} Easy Metamagic feat${unconfiguredEasy === 1 ? "" : "s"} has no configured target. ` +
        `On the Feats tab, add a 2nd line: "Reduces: <Metamagic Feat>".`);
    }

    return {
      featAdjustments: map,
      isThesisSpell,
      improvedMetamagic: reductions.improvedMetamagic,
      easyTargets: reductions.easyMetamagicFeats.filter(Boolean),
      warnings,
    };
  }

  // Escape for HTML attribute values (mirrors spells.js helper).
  function esc(s) {
    return String(s || "")
      .replace(/&/g, "&amp;").replace(/"/g, "&quot;")
      .replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // Open the picker as a child of `anchorRow`. If one is already open
  // on this row, close it (toggle behavior, same as the ⓘ panel).
  function open(opts) {
    const { panel, anchorRow, baseLevel, spellName } = opts;
    if (!panel || !anchorRow) return;
    const name = String(spellName || "").trim();
    if (!name) return;

    // Toggle: if a picker is already open on this row, close it.
    const existing = anchorRow.querySelector(".sc-mm-prep");
    if (existing) {
      existing.remove();
      const btn = anchorRow.querySelector(".sc-known-mm");
      if (btn) btn.classList.remove("active");
      return;
    }

    const feats = readCharacterMetamagicFeats();
    if (!feats.length) {
      // Shouldn't happen if the button is hidden correctly, but a
      // defensive no-op is cleaner than throwing.
      return;
    }

    // -- Build the picker DOM. Match the visual style of .feat-rules
    // / .sc-known-rules.
    const box = document.createElement("div");
    box.className = "feat-rules sc-known-rules sc-mm-prep";
    box.dataset.spellName = name;
    box.dataset.baseLevel = String(baseLevel);

    // Header line.
    const baseLvlLabel = (baseLevel === 0) ? "0 (cantrip)" : String(baseLevel);
    let html =
      `<div style="margin-bottom:0.5rem">` +
      `<b>Apply metamagic</b> to <b>${esc(name)}</b> ` +
      `<span style="opacity:0.7">(base level ${esc(baseLvlLabel)})</span>` +
      `</div>`;

    // -- One row per feat. Three control-shape variants:
    //   - Heighten / Improved Heighten: checkbox + target-level input
    //     (variableTarget — sets the effective level directly)
    //   - Sanctum Spell: checkbox + Sanctum-context dropdown
    //     (variable, but resolved to +0 / +1 from a toggle, not a
    //     target level)
    //   - Everything else: checkbox only (numeric or +0 adjustment)
    //
    // Sudden* feats also render their daily-use status (badge + a
    // "Mark used" / "Reset" toggle button).
    html += `<div class="sc-mm-feat-list" style="display:flex;flex-direction:column;gap:0.3rem;margin-bottom:0.5rem">`;
    for (let i = 0; i < feats.length; i++) {
      const f = feats[i];
      const adj = f.meta.levelAdjustment;
      const adjLabel = (adj === "variable")
        ? "variable"
        : (typeof adj === "number"
          ? (adj === 0 ? "+0" : (adj > 0 ? `+${adj}` : `${adj}`))
          : "?");
      const action = f.meta.actionTypeMod
        ? ` <span style="opacity:0.7">[${esc(f.meta.actionTypeMod)}]</span>`
        : "";
      const isHeighten = (f.name === "Heighten Spell"
        || f.name === "Improved Heighten Spell");
      const isSanctum = (f.name === "Sanctum Spell");
      const isSudden = SUDDEN_FEAT_RE.test(f.name);
      const isTargetVar = isHeighten;  // only Heighten gets the target-level input
      const id = `mm-${Math.random().toString(36).slice(2, 9)}`;
      // Sudden* daily-use status, read at picker-build time.
      const suddenEntry = isSudden ? findFeatEntry(f.name) : null;
      const usedToday = suddenEntry ? isFeatUsedToday(suddenEntry.value) : false;
      html +=
        `<label class="sc-mm-feat" data-feat="${esc(f.name)}" data-adj="${esc(adj)}" ` +
        `data-is-heighten="${isHeighten ? 1 : 0}" ` +
        `data-is-sanctum="${isSanctum ? 1 : 0}" ` +
        `data-is-sudden="${isSudden ? 1 : 0}" ` +
        `data-used-today="${usedToday ? 1 : 0}" ` +
        `style="display:flex;align-items:center;gap:0.4rem;cursor:pointer;flex-wrap:wrap` +
        (usedToday ? ";opacity:0.55" : "") + `">` +
        `<input type="checkbox" class="sc-mm-feat-cb" id="${id}">` +
        `<span style="flex:1;min-width:8rem"><b>${esc(f.name)}</b> ` +
        `<span class="sc-mm-feat-adj" style="opacity:0.8">${adjLabel}</span>${action}` +
        (isSudden
          ? ` <span class="sc-mm-sudden-status" style="font-size:0.85em;` +
            (usedToday ? `color:#c98">✗ used today` : `color:#9c9">✓ available`) +
            `</span>`
          : "") +
        (f.meta.effect ? ` <span style="opacity:0.65">— ${esc(f.meta.effect)}</span>` : "") +
        `</span>` +
        (isTargetVar
          ? `<input type="number" class="sc-mm-var-target" min="${baseLevel+1}" max="9" ` +
            `placeholder="lvl" title="Target spell level for Heighten" ` +
            `style="width:3.5rem;display:none" disabled>`
          : "") +
        (isSanctum
          ? `<select class="sc-mm-sanctum-ctx" style="display:none" disabled ` +
            `title="Sanctum Spell: +0 inside, +1 outside">` +
            `<option value="out">out of sanctum (+1)</option>` +
            `<option value="in">in sanctum (+0)</option>` +
            `</select>`
          : "") +
        (isSudden
          ? ` <button type="button" class="sc-mm-sudden-toggle" ` +
            `style="font-size:0.8em;padding:0.1rem 0.4rem" ` +
            `title="Toggle whether this 1/day charge has been spent today">` +
            (usedToday ? "Reset" : "Mark used") +
            `</button>`
          : "") +
        `</label>`;
    }
    html += `</div>`;

    // -- Summary line + actions.
    html +=
      `<div class="sc-mm-summary" style="display:flex;align-items:center;` +
      `gap:0.5rem;flex-wrap:wrap;padding:0.4rem 0.6rem;` +
      `background:rgba(150,180,255,0.06);border-radius:3px;margin-bottom:0.4rem">` +
      `<span style="opacity:0.8">Effective level:</span>` +
      `<b class="sc-mm-eff-lvl">${esc(baseLvlLabel)}</b>` +
      `<span style="opacity:0.7" class="sc-mm-eff-name">→ ${esc(name)}</span>` +
      `</div>` +
      `<div style="display:flex;gap:0.4rem">` +
      `<button class="btn-add sc-mm-prepare">Prepare</button>` +
      `<button class="btn-remove sc-mm-cancel">Cancel</button>` +
      `</div>` +
      `<div class="sc-mm-warning" style="display:none;margin-top:0.4rem;` +
      `color:#dba;font-size:0.85em"></div>`;

    box.innerHTML = html;
    anchorRow.appendChild(box);

    // Mark the ✨ button as active.
    const mmBtn = anchorRow.querySelector(".sc-known-mm");
    if (mmBtn) mmBtn.classList.add("active");

    // -- Wire interaction.
    const cbs = box.querySelectorAll(".sc-mm-feat-cb");
    const effLvlEl = box.querySelector(".sc-mm-eff-lvl");
    const effNameEl = box.querySelector(".sc-mm-eff-name");
    const warnEl = box.querySelector(".sc-mm-warning");

    function recompute() {
      const adjectives = [];
      const warnings = [];
      let heightenTarget = null;

      // -- Pass 1: collect selected feats + show/hide their sub-inputs.
      const selected = [];
      cbs.forEach((cb) => {
        const label = cb.closest(".sc-mm-feat");
        const featName = label.dataset.feat;
        const isHeighten = label.dataset.isHeighten === "1";
        const isSanctum = label.dataset.isSanctum === "1";
        const varInput = label.querySelector(".sc-mm-var-target");
        const ctxSel = label.querySelector(".sc-mm-sanctum-ctx");

        if (varInput) {
          varInput.style.display = cb.checked ? "" : "none";
          varInput.disabled = !cb.checked;
        }
        if (ctxSel) {
          ctxSel.style.display = cb.checked ? "" : "none";
          ctxSel.disabled = !cb.checked;
        }

        if (!cb.checked) return;
        // Find the meta entry from the closure-scope `feats` list.
        const featEntry = feats.find(f => f.name === featName);
        if (!featEntry) return;
        selected.push({
          name: featName,
          meta: featEntry.meta,
          isHeighten,
          isSanctum,
          target: varInput ? parseInt(varInput.value, 10) : null,
          sanctumIn: ctxSel ? (ctxSel.value === "in") : false,
        });
      });

      // -- Pass 2: compute Sanctum context (any-checked feat that IS
      // Sanctum). Used as input to computeAdjustments().
      const sanctumPick = selected.find(s => s.isSanctum);
      const sanctumInSanctum = sanctumPick ? sanctumPick.sanctumIn : false;

      // -- Pass 3: run the reductions pipeline to get per-feat
      // adjusted costs. This handles Improved Metamagic, Arcane
      // Thesis, Easy Metamagic, and Sanctum Spell context resolution.
      const adjResult = computeAdjustments(
        selected.map(s => ({ name: s.name, meta: s.meta })),
        name,
        sanctumInSanctum
      );
      for (const w of adjResult.warnings) warnings.push(w);

      // -- Pass 4: walk selected feats and accumulate effective level
      // + adjectives. Heighten gets special treatment (sets level
      // directly rather than adding).
      let totalAdj = 0;
      for (const s of selected) {
        if (s.isHeighten) {
          if (!isNaN(s.target) && s.target >= baseLevel) {
            heightenTarget = s.target;
            adjectives.push(`${ADJECTIVE[s.name] || "Heightened"} to ${s.target}`);
          } else {
            warnings.push(`${s.name} needs a target level.`);
          }
          continue;
        }
        // Use the reduced adjustment from computeAdjustments.
        const info = adjResult.featAdjustments.get(s.name);
        const reduced = info ? info.reduced : s.meta.levelAdjustment;
        if (typeof reduced === "number") {
          totalAdj += reduced;
        }
        const adj = adjectiveFor(s.name);
        adjectives.push(adj || `(${s.name})`);
      }

      // -- Pass 5: compute effective level + name.
      let effLvl;
      if (heightenTarget !== null) {
        effLvl = heightenTarget + totalAdj;
      } else {
        effLvl = baseLevel + totalAdj;
      }

      // Update per-feat adjustment labels in the picker to show the
      // reduced cost when reductions apply.
      cbs.forEach((cb) => {
        const label = cb.closest(".sc-mm-feat");
        const featName = label.dataset.feat;
        const adjEl = label.querySelector(".sc-mm-feat-adj");
        if (!adjEl) return;
        const info = adjResult.featAdjustments.get(featName);
        if (cb.checked && info && info.reasons.length) {
          const base = info.base;
          const reduced = info.reduced;
          if (typeof base === "number" && typeof reduced === "number" && base !== reduced) {
            adjEl.innerHTML =
              `<s style="opacity:0.5">+${base}</s> ` +
              `<b style="color:#a8d8a8">+${reduced}</b> ` +
              `<span style="opacity:0.6;font-size:0.85em">(${esc(info.reasons.join(", "))})</span>`;
          } else if (info.reasons.length) {
            // Sanctum-only case (no numeric reduction, but reason).
            adjEl.innerHTML =
              `<b>+${reduced}</b> ` +
              `<span style="opacity:0.6;font-size:0.85em">(${esc(info.reasons.join(", "))})</span>`;
          } else {
            const lvl = typeof reduced === "number"
              ? (reduced === 0 ? "+0" : `+${reduced}`)
              : esc(String(reduced));
            adjEl.textContent = lvl;
          }
        } else {
          // Restore static label when unchecked.
          const adj = label.dataset.adj;
          const lvl = (adj === "variable")
            ? "variable"
            : (isNaN(parseInt(adj, 10))
              ? "?"
              : (parseInt(adj, 10) === 0 ? "+0" : `+${parseInt(adj, 10)}`));
          adjEl.textContent = lvl;
        }
      });

      const lvlLabel = (effLvl === 0) ? "0 (cantrip)" : String(effLvl);
      effLvlEl.textContent = lvlLabel;
      effLvlEl.style.color = (effLvl > 9) ? "#e88" : "";

      let modName = name;
      if (adjectives.length) modName = adjectives.join(" ") + " " + name;
      effNameEl.textContent = "→ " + modName;
      box.dataset.modName = modName;
      box.dataset.effLevel = String(effLvl);

      if (effLvl > 9) {
        warnings.push("Effective level exceeds 9 — no standard spell slot can hold this. (Epic Spellcasting / Improved Spell Capacity needed.)");
      }
      if (adjResult.isThesisSpell && selected.some(s => !s.isHeighten)) {
        warnings.push(`Arcane Thesis active on "${name}" — each metamagic costs 1 less (min +1).`);
      }

      // -- Sudden* daily-use warnings + Quicken round limit.
      for (const s of selected) {
        if (SUDDEN_FEAT_RE.test(s.name)) {
          const entry = findFeatEntry(s.name);
          if (entry && isFeatUsedToday(entry.value)) {
            warnings.push(
              `${s.name} has already been used today. Use the Reset button next to the feat once you long-rest, or pick the underlying metamagic (Empower / Maximize / Quicken / etc.) and pay the slot cost.`);
          }
        }
      }

      // Quicken: if checked AND the panel's "Quickened this round"
      // counter is > 0, warn. Same for Sudden Quicken (since both
      // produce a quickened spell that uses up the swift action).
      const isQuickenLike = selected.some(s =>
        s.name === "Quicken Spell"
        || s.name === "Sudden Quicken"
        || s.name === "Automatic Quicken Spell");
      if (isQuickenLike) {
        const counter = panel.querySelector(".sc-quickened-this-round");
        const used = counter ? parseInt(counter.value, 10) : 0;
        if (!isNaN(used) && used > 0) {
          warnings.push(
            `${used} quickened spell${used === 1 ? "" : "s"} already cast this round. ` +
            `Quicken Spell limits you to ONE quickened spell per round (any source).`);
        }
      }
      if (warnings.length) {
        warnEl.style.display = "";
        warnEl.innerHTML = warnings.map(w => "⚠ " + esc(w)).join("<br>");
      } else {
        warnEl.style.display = "none";
        warnEl.textContent = "";
      }
    }

    // Wire up listeners.
    cbs.forEach((cb) => cb.addEventListener("change", recompute));
    box.querySelectorAll(".sc-mm-var-target").forEach((inp) => {
      inp.addEventListener("input", recompute);
    });
    box.querySelectorAll(".sc-mm-sanctum-ctx").forEach((sel) => {
      sel.addEventListener("change", recompute);
    });
    // Sudden* "Mark used" / "Reset" toggle.
    box.querySelectorAll(".sc-mm-sudden-toggle").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        const label = btn.closest(".sc-mm-feat");
        if (!label) return;
        const featName = label.dataset.feat;
        const wasUsed = label.dataset.usedToday === "1";
        if (wasUsed) {
          unmarkFeatUsed(featName);
          label.dataset.usedToday = "0";
          label.style.opacity = "";
          btn.textContent = "Mark used";
          const status = label.querySelector(".sc-mm-sudden-status");
          if (status) {
            status.style.color = "#9c9";
            status.textContent = "✓ available";
          }
        } else {
          markFeatUsed(featName);
          label.dataset.usedToday = "1";
          label.style.opacity = "0.55";
          btn.textContent = "Reset";
          const status = label.querySelector(".sc-mm-sudden-status");
          if (status) {
            status.style.color = "#c98";
            status.textContent = "✗ used today";
          }
        }
        recompute();
      });
    });

    box.querySelector(".sc-mm-cancel").addEventListener("click", () => {
      box.remove();
      const btn = anchorRow.querySelector(".sc-known-mm");
      if (btn) btn.classList.remove("active");
    });

    box.querySelector(".sc-mm-prepare").addEventListener("click", () => {
      const modName = box.dataset.modName || name;
      const effLvl = parseInt(box.dataset.effLevel, 10);
      if (isNaN(effLvl) || effLvl < 0 || effLvl > 9) {
        // Out-of-range: warn but allow prepare at base level as
        // fallback (so the user isn't stuck).
        warnEl.style.display = "";
        warnEl.innerHTML = "⚠ Effective level out of range; cannot auto-prepare. Adjust selections or apply manually.";
        return;
      }
      // Append to the target level's Prepared textarea.
      const ta = panel.querySelector(`.sc-spell-prepared[data-lvl="${effLvl}"]`);
      if (!ta) {
        warnEl.style.display = "";
        warnEl.innerHTML = `⚠ No Prepared textarea found for level ${effLvl}. Add a spell level above level ${effLvl} first.`;
        return;
      }
      // Auto-mark any Sudden* feats that were ticked as used. Only
      // mark feats not already marked — and skip the auto-mark if
      // the user explicitly opted out by deselecting them after a
      // warning.
      box.querySelectorAll(".sc-mm-feat").forEach((label) => {
        if (label.dataset.isSudden !== "1") return;
        const cb = label.querySelector(".sc-mm-feat-cb");
        if (!cb || !cb.checked) return;
        if (label.dataset.usedToday === "1") return;  // already used
        markFeatUsed(label.dataset.feat);
      });
      const cur = ta.value;
      ta.value = cur ? cur.replace(/\s+$/, "") + "\n" + modName : modName;
      ta.dispatchEvent(new Event("input", { bubbles: true }));
      box.remove();
      const btn = anchorRow.querySelector(".sc-known-mm");
      if (btn) btn.classList.remove("active");
    });

    // Initial render — show level 0 baseline / no metamagic.
    recompute();
  }

  // Public API.
  window.MetamagicPreparer = {
    open,
    characterHasAnyMetamagic,
    readCharacterMetamagicFeats,
    adjectiveFor,
    // v2 Phase A helpers:
    readReductionFeats,
    computeAdjustments,
    // v2 Phase B helpers (daily-use tracking for Sudden* feats):
    isFeatUsedToday,
    markFeatUsed,
    unmarkFeatUsed,
    resetAllDailyUses,
  };
})();
