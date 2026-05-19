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

    // -- One row per feat.
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
      const isVar = (adj === "variable");
      const id = `mm-${Math.random().toString(36).slice(2, 9)}`;
      html +=
        `<label class="sc-mm-feat" data-feat="${esc(f.name)}" data-adj="${esc(adj)}" ` +
        `style="display:flex;align-items:center;gap:0.4rem;cursor:pointer">` +
        `<input type="checkbox" class="sc-mm-feat-cb" id="${id}">` +
        `<span style="flex:1"><b>${esc(f.name)}</b> ` +
        `<span style="opacity:0.8">${adjLabel}</span>${action}` +
        (f.meta.effect ? ` <span style="opacity:0.65">— ${esc(f.meta.effect)}</span>` : "") +
        `</span>` +
        (isVar
          ? `<input type="number" class="sc-mm-var-target" min="${baseLevel+1}" max="9" ` +
            `placeholder="lvl" title="Target spell level for Heighten" ` +
            `style="width:3.5rem;display:none" disabled>`
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
      let totalAdj = 0;
      let heightenTarget = null;  // explicit override of effective level
      const adjectives = [];
      const warnings = [];
      let zeroAdjOnly = true;

      cbs.forEach((cb) => {
        const label = cb.closest(".sc-mm-feat");
        const featName = label.dataset.feat;
        const adjRaw = label.dataset.adj;
        const isVar = adjRaw === "variable";
        const varInput = label.querySelector(".sc-mm-var-target");

        if (varInput) {
          varInput.style.display = cb.checked ? "" : "none";
          varInput.disabled = !cb.checked;
        }

        if (!cb.checked) return;

        if (isVar) {
          // Heighten / Sanctum: variable target level.
          const target = parseInt(varInput?.value, 10);
          if (!isNaN(target) && target >= baseLevel) {
            // Heighten only — sets the effective level directly.
            if (featName === "Heighten Spell" || featName === "Improved Heighten Spell") {
              heightenTarget = target;
              adjectives.push(`${ADJECTIVE[featName] || "Heightened"} to ${target}`);
              zeroAdjOnly = false;
            } else if (featName === "Sanctum Spell") {
              // Sanctum: ±1 contextual. UI doesn't model in/out
              // of sanctum yet (v2 follow-up); default to +1.
              totalAdj += 1;
              adjectives.push(ADJECTIVE[featName] || "Sanctum");
              zeroAdjOnly = false;
              warnings.push("Sanctum Spell defaults to +1 (out-of-sanctum). Toggle the +0/+1 manually if you're in your sanctum — v2 will track this contextually.");
            } else {
              // Generic variable: prompt user.
              warnings.push(`${featName} has a variable adjustment — fill in the target level.`);
            }
          } else {
            warnings.push(`${featName} needs a target level.`);
          }
        } else {
          const n = parseInt(adjRaw, 10);
          if (!isNaN(n)) {
            totalAdj += n;
            if (n !== 0) zeroAdjOnly = false;
            const adj = adjectiveFor(featName);
            adjectives.push(adj || `(${featName})`);
          }
        }
      });

      // Compute effective level.
      let effLvl;
      if (heightenTarget !== null) {
        effLvl = heightenTarget + totalAdj;
      } else {
        effLvl = baseLevel + totalAdj;
      }

      // Update summary.
      const lvlLabel = (effLvl === 0) ? "0 (cantrip)" : String(effLvl);
      effLvlEl.textContent = lvlLabel;
      effLvlEl.style.color = (effLvl > 9) ? "#e88" : "";

      // Build the modified name.
      let modName = name;
      if (adjectives.length) {
        modName = adjectives.join(" ") + " " + name;
      }
      effNameEl.textContent = "→ " + modName;
      box.dataset.modName = modName;
      box.dataset.effLevel = String(effLvl);

      // Warning surface.
      if (effLvl > 9) {
        warnings.push("Effective level exceeds 9 — no standard spell slot can hold this. (Epic Spellcasting / Improved Spell Capacity needed.)");
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
  };
})();
