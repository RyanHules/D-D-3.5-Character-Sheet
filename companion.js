// D&D 3.5 Character Sheet - Companion Tab Module

const Companion = (function () {
  "use strict";

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);
  const int = (v) => parseInt(v) || 0;
  const abilMod = (score) => Math.floor((score - 10) / 2);

  let companionIndex = 0;
  let _mainGetAbilityMod = null;

  // ============================================================
  // Add a companion sub-tab
  // ============================================================
  function addCompanion(data = {}) {
    const idx = companionIndex++;
    const name = data.name || "Companion";

    const tabBar = $("#companion-tab-bar");
    const btn = document.createElement("button");
    btn.className = "inner-tab";
    btn.dataset.compIdx = idx;
    btn.textContent = name;
    btn.addEventListener("click", () => switchCompanion(idx));
    btn.addEventListener("dblclick", () => {
      const rm = btn.querySelector(".comp-tab-remove");
      const cur = btn.textContent.replace("×", "").trim();
      const nw = prompt("Rename companion:", cur);
      if (nw && nw.trim()) { btn.textContent = nw.trim(); btn.appendChild(rm); }
    });

    const rm = document.createElement("span");
    rm.className = "caster-tab-remove";
    rm.textContent = "×";
    rm.classList.add("comp-tab-remove");
    rm.addEventListener("click", (e) => {
      e.stopPropagation();
      if (confirm(`Remove "${btn.textContent.replace("×", "").trim()}"?`)) {
        btn.remove();
        document.getElementById(`companion-${idx}`)?.remove();
        const first = tabBar.querySelector(".inner-tab");
        if (first) first.click();
      }
    });
    btn.appendChild(rm);
    tabBar.appendChild(btn);

    const container = $("#companion-content");
    const panel = document.createElement("div");
    panel.className = "inner-tab-content";
    panel.id = `companion-${idx}`;
    panel.innerHTML = buildCompanionHTML(idx, data);
    container.appendChild(panel);

    wireCompanion(idx, panel, data);
    switchCompanion(idx);
    return idx;
  }

  function switchCompanion(idx) {
    $$(".inner-tab[data-comp-idx]").forEach((t) => t.classList.remove("active"));
    $$("#companion-content > .inner-tab-content").forEach((c) => c.classList.remove("active"));
    const btn = $(`.inner-tab[data-comp-idx="${idx}"]`);
    const panel = $(`#companion-${idx}`);
    if (btn) btn.classList.add("active");
    if (panel) panel.classList.add("active");
  }

  // ============================================================
  // Build companion panel HTML
  // ============================================================
  function buildCompanionHTML(idx, d = {}) {
    const mods = ["STR","DEX","CON","INT","WIS","CHA"].map((ab) => {
      const sc = int(d[`comp-${ab.toLowerCase()}-score`]);
      return `<div class="field field-sm">
        <label>${ab}</label>
        <input type="number" class="comp-score" data-ab="${ab}" value="${d[`comp-${ab.toLowerCase()}-score`] || ""}">
        <span class="comp-mod calc-field" data-ab="${ab}">--</span>
      </div>`;
    }).join("");

    return `
    <div class="comp-header info-grid">
      <div class="field"><label>Name</label><input type="text" class="comp-name" value="${d.compName || ""}"></div>
      <div class="field"><label>Type</label><select class="comp-type">
        <option${d.compType === "animal" ? " selected" : ""}>Animal Companion</option>
        <option${d.compType === "familiar" ? " selected" : ""}>Familiar</option>
        <option${d.compType === "cohort" ? " selected" : ""}>Cohort</option>
        <option${d.compType === "psicrystal" ? " selected" : ""}>Psicrystal</option>
        <option${d.compType === "other" ? " selected" : ""}>Other</option>
      </select></div>
      <label class="mi-toggle"><input type="checkbox" class="comp-familiar-toggle"${d.isFamiliar ? " checked" : ""}> Familiar</label>
    </div>
    <!-- Auto-computed progression panel (see companion.js
         refreshProgressionPanel). Hidden when no contributing
         classes are detected. Defaults expanded. -->
    <details class="comp-progression-panel" open>
      <summary class="comp-progression-summary">
        <span class="comp-progression-title">Class-Based Progression</span>
        <span class="comp-progression-status"></span>
      </summary>
      <div class="comp-progression-body"></div>
    </details>
    <!-- AUTO/MANUAL toggle + base-creature picker. AUTO derives
         abilities / speed / natural armor / Int from the base
         creature's stats + the progression deltas above. MANUAL
         leaves the panel's stat fields entirely free-entry. -->
    <div class="comp-mode-bar">
      <span class="comp-mode-radios">
        <label class="mi-toggle"><input type="radio" name="comp-mode-${idx}" class="comp-mode-radio" value="manual"${d.compMode === 'auto' ? '' : ' checked'}> Manual</label>
        <label class="mi-toggle"><input type="radio" name="comp-mode-${idx}" class="comp-mode-radio" value="auto"${d.compMode === 'auto' ? ' checked' : ''}> Auto-fill from base creature</label>
      </span>
      <span class="comp-base-creature-field" style="display:${d.compMode === 'auto' ? '' : 'none'}">
        <label class="comp-base-creature-label">Base creature
          <input type="text" class="comp-base-creature" list="creature-options"
                 placeholder="e.g. Wolf" value="${escapeHtml(d.compBaseCreature || '')}">
        </label>
      </span>
    </div>
    <div class="two-column">
      <div class="column">
        <h3>Ability Scores</h3>
        <div class="companion-abilities">${mods}</div>
        <h3>Hit Points</h3>
        <div class="info-grid">
          <div class="field field-sm"><label>Max HP</label><input type="number" class="comp-hp-max" value="${d.compHpMax || ""}"></div>
          <div class="field field-sm"><label>Current HP</label><input type="number" class="comp-hp-cur" value="${d.compHpCur || ""}"></div>
          <div class="field field-sm"><label>Speed</label><input type="text" class="comp-speed" value="${d.compSpeed || ""}"></div>
          <span class="comp-familiar-hp-note" style="display:none;font-size:0.7rem;color:var(--accent)">HP = ½ master's</span>
        </div>
        <h3>Initiative</h3>
        <div class="info-grid">
          <div class="field field-sm"><label>DEX Mod</label><span class="comp-init-dex calc-field">--</span></div>
          <div class="field field-sm"><label>Misc</label><input type="number" class="comp-init-misc" value="${d.compInitMisc || ""}"></div>
          <div class="field field-sm"><label>Total</label><span class="comp-init-total calc-field">--</span></div>
        </div>
        <h3>Armor Class</h3>
        <div class="info-grid">
          <div class="field field-sm"><label>Armor</label><input type="number" class="comp-ac-armor" value="${d.compAcArmor || ""}"></div>
          <div class="field field-sm"><label>Shield</label><input type="number" class="comp-ac-shield" value="${d.compAcShield || ""}"></div>
          <div class="field field-sm"><label>Natural</label><input type="number" class="comp-ac-natural" value="${d.compAcNatural || ""}"></div>
          <div class="field field-sm"><label>Size</label><input type="number" class="comp-ac-size" value="${d.compAcSize || ""}"></div>
          <div class="field field-sm"><label>Misc</label><input type="number" class="comp-ac-misc" value="${d.compAcMisc || ""}"></div>
        </div>
        <div class="info-grid">
          <div class="field field-sm"><label>AC Total</label><span class="comp-ac-total calc-field">--</span></div>
          <div class="field field-sm"><label>Touch</label><span class="comp-ac-touch calc-field">--</span></div>
          <div class="field field-sm"><label>Flat-Footed</label><span class="comp-ac-ff calc-field">--</span></div>
        </div>
        <h3>Saving Throws</h3>
        <div class="comp-saves">
          ${["Fort","Ref","Will"].map((s, si) => {
            const ab = ["CON","DEX","WIS"][si];
            return `<div class="save-row">
              <span class="save-label">${s}</span>
              <input type="number" class="comp-save-base" data-save="${s}" value="${d[`compSave${s}Base`] || ""}">
              <span class="comp-save-ab calc-field" data-save="${s}">+0</span>
              <input type="number" class="comp-save-misc" data-save="${s}" value="${d[`compSave${s}Misc`] || ""}">
              <span class="comp-save-total calc-field" data-save="${s}">--</span>
              <span class="comp-familiar-save" data-save="${s}" style="display:none;font-size:0.7rem;color:var(--accent)">↑ main</span>
            </div>`;
          }).join("")}
        </div>
        <h3>Grapple</h3>
        <div class="info-grid">
          <div class="field field-sm"><label>BAB</label><input type="number" class="comp-bab" value="${d.compBab || ""}"></div>
          <div class="field field-sm"><label>STR Mod</label><span class="comp-grapple-str calc-field">+0</span></div>
          <div class="field field-sm"><label>Size</label><input type="number" class="comp-grapple-size" value="${d.compGrappleSize || ""}"></div>
          <div class="field field-sm"><label>Misc</label><input type="number" class="comp-grapple-misc" value="${d.compGrappleMisc || ""}"></div>
          <div class="field field-sm"><label>Total</label><span class="comp-grapple-total calc-field">--</span></div>
        </div>
        <h3>Personality</h3>
        <textarea class="comp-personality" rows="2">${d.compPersonality || ""}</textarea>
        <h3>Notes</h3>
        <textarea class="comp-notes" rows="3">${d.compNotes || ""}</textarea>
      </div>
      <div class="column">
        <h3>Attacks</h3>
        <div class="comp-attacks-list"></div>
        <button class="btn-add comp-add-attack">+ Add Attack</button>
        <h3>Skills</h3>
        <div class="comp-skills-list"></div>
        <button class="btn-add comp-add-skill">+ Add Skill</button>
        <h3>Feats</h3>
        <div class="comp-feats-list"></div>
        <button class="btn-add comp-add-feat">+ Add Feat</button>
        <h3>Tricks</h3>
        <div class="comp-tricks-list"></div>
        <button class="btn-add comp-add-trick">+ Add Trick</button>
        <h3>Special Abilities</h3>
        <div class="comp-specials-list"></div>
        <button class="btn-add comp-add-special">+ Add Special Ability</button>
      </div>
    </div>`;
  }

  // ============================================================
  // Wire all interactions for a companion panel
  // ============================================================
  function wireCompanion(idx, panel, d = {}) {
    // Recalc on any input
    panel.addEventListener("input", () => recalcCompanion(panel));
    panel.addEventListener("change", () => recalcCompanion(panel));

    // H5: track user-driven comp-type changes so the
    // classes-changed listener doesn't overwrite their choice on a
    // later class apply. Only flips when the change is user-trusted
    // (event.isTrusted distinguishes from synthetic dispatches we
    // make ourselves during auto-default).
    const compTypeSel = panel.querySelector(".comp-type");
    if (compTypeSel) {
      compTypeSel.addEventListener("change", (ev) => {
        if (ev.isTrusted) compTypeSel.dataset.userSet = "1";
      });
      // If we're loading an existing companion that had a non-default
      // type stored, treat that as user-set so we don't clobber it.
      if (d.compType && d.compType !== "animal") {
        compTypeSel.dataset.userSet = "1";
      }
      // Initial auto-default: only when no explicit type was loaded.
      if (!d.compType) {
        const auto = defaultCompTypeFromClasses();
        if (auto) {
          const TEXT_FOR_KEY = {
            animal: "Animal Companion",
            familiar: "Familiar",
            cohort: "Cohort",
          };
          const want = TEXT_FOR_KEY[auto];
          if (want && compTypeSel.value !== want) {
            compTypeSel.value = want;
          }
        }
      }
    }

    // Familiar toggle
    const famToggle = panel.querySelector(".comp-familiar-toggle");
    famToggle.addEventListener("change", () => {
      panel.querySelectorAll(".comp-familiar-save").forEach((el) => {
        el.style.display = famToggle.checked ? "" : "none";
      });
      recalcCompanion(panel);
    });
    if (d.isFamiliar) {
      panel.querySelectorAll(".comp-familiar-save").forEach((el) => { el.style.display = ""; });
    }

    // Dynamic attacks
    const atksContainer = panel.querySelector(".comp-attacks-list");
    panel.querySelector(".comp-add-attack").addEventListener("click", () => addAttackRow(atksContainer));
    (d.compAttacks || [{}]).forEach((a) => addAttackRow(atksContainer, a));

    // Dynamic skills
    const skillsContainer = panel.querySelector(".comp-skills-list");
    panel.querySelector(".comp-add-skill").addEventListener("click", () => addSkillRow(skillsContainer));
    (d.compSkills || []).forEach((s) => addSkillRow(skillsContainer, s));

    // Dynamic feats
    const featsContainer = panel.querySelector(".comp-feats-list");
    panel.querySelector(".comp-add-feat").addEventListener("click", () => addListRow(featsContainer, "comp-feat", "Feat name", "Notes"));
    (d.compFeats || [""]).forEach((f) => addListRow(featsContainer, "comp-feat", "Feat name", "Notes", f));

    // Dynamic tricks
    const tricksContainer = panel.querySelector(".comp-tricks-list");
    panel.querySelector(".comp-add-trick").addEventListener("click", () => addListRow(tricksContainer, "comp-trick", "Trick name", "Description"));
    (d.compTricks || [""]).forEach((t) => addListRow(tricksContainer, "comp-trick", "Trick name", "Description", t));

    // Dynamic special abilities (was a single textarea before 2026-05-16;
    // legacy data with `compSpecial` as a string gets migrated by load).
    const specialsContainer = panel.querySelector(".comp-specials-list");
    panel.querySelector(".comp-add-special").addEventListener("click",
      () => addListRow(specialsContainer, "comp-special", "Ability name", "Description"));
    let specialsSeed = d.compSpecials;
    if (!specialsSeed && d.compSpecial) {
      // Legacy single-string fallback — load as one row.
      specialsSeed = [{ name: "", notes: d.compSpecial }];
    }
    (specialsSeed || [""]).forEach((s) =>
      addListRow(specialsContainer, "comp-special", "Ability name", "Description", s));

    // ---- Mode toggle + base-creature auto-fill --------------------
    // AUTO mode reveals the base-creature input; toggling AUTO with a
    // valid base creature already selected triggers an immediate
    // auto-fill. MANUAL mode hides the base-creature input and
    // re-enables the stat fields for direct editing. Listener wired
    // here at panel-build time (idempotent — only one set per panel).
    const modeRadios = panel.querySelectorAll('.comp-mode-radio');
    const baseField = panel.querySelector('.comp-base-creature-field');
    const baseInput = panel.querySelector('.comp-base-creature');
    function currentMode() {
      const checked = panel.querySelector('.comp-mode-radio:checked');
      return checked ? checked.value : 'manual';
    }
    function syncModeUI() {
      const mode = currentMode();
      if (baseField) baseField.style.display = mode === 'auto' ? '' : 'none';
      applyAutoFillState(panel, mode);
    }
    modeRadios.forEach(r => r.addEventListener('change', () => {
      syncModeUI();
      if (currentMode() === 'auto') autoFillFromBaseCreature(panel);
    }));
    if (baseInput) {
      baseInput.addEventListener('input', () => {
        if (currentMode() === 'auto') autoFillFromBaseCreature(panel);
      });
      baseInput.addEventListener('change', () => {
        if (currentMode() === 'auto') autoFillFromBaseCreature(panel);
      });
    }
    // Initial state on panel-build (matters for loadData round-trips).
    syncModeUI();
    if (currentMode() === 'auto' && baseInput?.value?.trim()) {
      autoFillFromBaseCreature(panel);
    }

    recalcCompanion(panel);
  }

  // ============================================================
  // Dynamic row helpers
  // ============================================================
  function addAttackRow(container, d = {}) {
    const div = document.createElement("div");
    div.className = "comp-attack-entry";
    div.innerHTML = `
      <input type="text" class="comp-atk-weapon" placeholder="Weapon/Natural" value="${d.weapon || ""}">
      <input type="text" class="comp-atk-bonus" placeholder="Attack Bonus" value="${d.bonus || ""}">
      <input type="text" class="comp-atk-damage" placeholder="Damage" value="${d.damage || ""}">
      <input type="text" class="comp-atk-crit" placeholder="Crit" value="${d.crit || ""}">
      <button class="btn-remove comp-remove-attack" title="Remove">X</button>`;
    div.querySelector(".comp-remove-attack").addEventListener("click", () => div.remove());
    container.appendChild(div);
  }

  function addSkillRow(container, d = {}) {
    const div = document.createElement("div");
    div.className = "comp-skill-row";
    div.innerHTML = `
      <input type="text" class="comp-skill-name" placeholder="Skill name" value="${d.name || ""}">
      <input type="number" class="comp-skill-ranks" placeholder="Ranks" value="${d.ranks || ""}">
      <input type="number" class="comp-skill-misc" placeholder="Misc" value="${d.misc || ""}">
      <span class="comp-skill-total calc-field">--</span>
      <button class="btn-remove" title="Remove">X</button>`;
    div.querySelector(".comp-skill-ranks, .comp-skill-misc") && div.addEventListener("input", () => {
      const total = int(div.querySelector(".comp-skill-ranks").value) + int(div.querySelector(".comp-skill-misc").value);
      div.querySelector(".comp-skill-total").textContent = total >= 0 ? "+" + total : total;
    });
    div.querySelector(".btn-remove").addEventListener("click", () => div.remove());
    container.appendChild(div);
    if (d.name || d.ranks) div.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function addListRow(container, cls, placeholder, notePlaceholder, data = "") {
    const d = typeof data === "object" ? data : { name: data };
    const div = document.createElement("div");
    div.className = `${cls}-entry feat-entry`;
    // Companion feat rows get the same autocomplete and ⓘ rules-toggle
    // wiring that the main Feats tab has — they share the feat-options
    // datalist built by feat-picker.js, and the ⓘ button calls
    // `Feats.renderFeatRules()` (exported from the Feats module).
    const isFeat = cls === "comp-feat";
    const listAttr = isFeat ? ` list="feat-options"` : "";
    const infoBtnHTML = isFeat
      ? `<button type="button" class="btn-feat-info" title="Show rules text" aria-expanded="false">ⓘ</button>`
      : "";
    div.innerHTML = `
      <div class="feat-main">
        <input type="text" class="${cls}-name" placeholder="${placeholder}" value="${d.name || ""}"${listAttr} autocomplete="off">
        ${infoBtnHTML}
        <button class="btn-remove" title="Remove">X</button>
      </div>
      <textarea class="${cls}-notes" rows="1" placeholder="${notePlaceholder}">${d.notes || ""}</textarea>`;
    div.querySelector(".btn-remove").addEventListener("click", () => div.remove());
    if (isFeat) {
      const info = div.querySelector(".btn-feat-info");
      const nameIn = div.querySelector(".comp-feat-name");
      info.addEventListener("click", () => toggleCompFeatRules(div));
      // Collapse panel on edit so stale text doesn't sit under a
      // renamed feat (same UX as the main feats tab).
      nameIn.addEventListener("input", () => collapseCompFeatRules(div));
    }
    container.appendChild(div);
  }

  function toggleCompFeatRules(row) {
    const existing = row.querySelector(".feat-rules");
    if (existing) { collapseCompFeatRules(row); return; }
    const name = (row.querySelector(".comp-feat-name")?.value || "").trim();
    const btn = row.querySelector(".btn-feat-info");
    const panel = document.createElement("div");
    panel.className = "feat-rules";
    if (!name) {
      panel.innerHTML = '<i style="opacity:.7">Type a feat name first.</i>';
    } else if (!(window.DB && DB.isLoaded()) ||
               typeof Feats?.renderFeatRules !== "function") {
      panel.innerHTML = '<i style="opacity:.7">Database not loaded — rules text unavailable.</i>';
    } else {
      const rendered = Feats.renderFeatRules(name);
      panel.innerHTML = rendered.html;
      if (rendered.entryId && window.ErrataBadge) {
        ErrataBadge.attach(panel, rendered.entryId);
      }
    }
    row.appendChild(panel);
    btn.setAttribute("aria-expanded", "true");
    btn.classList.add("active");
  }

  function collapseCompFeatRules(row) {
    const panel = row.querySelector(".feat-rules");
    if (panel) panel.remove();
    const btn = row.querySelector(".btn-feat-info");
    if (btn) {
      btn.setAttribute("aria-expanded", "false");
      btn.classList.remove("active");
    }
  }

  // ============================================================
  // Auto-calculate companion stats
  // ============================================================
  function recalcCompanion(panel) {
    const score = (ab) => int(panel.querySelector(`.comp-score[data-ab="${ab}"]`)?.value);
    const mod = (ab) => abilMod(score(ab));

    // Ability modifier display
    ["STR","DEX","CON","INT","WIS","CHA"].forEach((ab) => {
      const el = panel.querySelector(`.comp-mod[data-ab="${ab}"]`);
      if (el) { const m = mod(ab); el.textContent = (m >= 0 ? "+" : "") + m; }
    });

    // Initiative
    const dexMod = mod("DEX");
    const initMiscEl = panel.querySelector(".comp-init-misc");
    const initTotal = dexMod + int(initMiscEl?.value);
    const initDexEl = panel.querySelector(".comp-init-dex");
    if (initDexEl) initDexEl.textContent = (dexMod >= 0 ? "+" : "") + dexMod;
    const initTotalEl = panel.querySelector(".comp-init-total");
    if (initTotalEl) initTotalEl.textContent = (initTotal >= 0 ? "+" : "") + initTotal;

    // AC
    const armor = int(panel.querySelector(".comp-ac-armor")?.value);
    const shield = int(panel.querySelector(".comp-ac-shield")?.value);
    const natural = int(panel.querySelector(".comp-ac-natural")?.value);
    const acSize = int(panel.querySelector(".comp-ac-size")?.value);
    const acMisc = int(panel.querySelector(".comp-ac-misc")?.value);
    const acTotal = 10 + armor + shield + dexMod + natural + acSize + acMisc;
    const acTouch = 10 + dexMod + acSize + acMisc;
    const acFF = 10 + armor + shield + natural + acSize + acMisc;
    const setEl = (sel, val) => { const el = panel.querySelector(sel); if (el) el.textContent = val; };
    setEl(".comp-ac-total", acTotal);
    setEl(".comp-ac-touch", acTouch);
    setEl(".comp-ac-ff", acFF);

    // Saves
    const saveAbility = { Fort: "CON", Ref: "DEX", Will: "WIS" };
    const isFamiliar = panel.querySelector(".comp-familiar-toggle")?.checked;

    // Familiar: auto-set max HP to floor(master's max HP / 2)
    const hpNote = panel.querySelector(".comp-familiar-hp-note");
    if (hpNote) hpNote.style.display = isFamiliar ? "" : "none";
    if (isFamiliar) {
      const masterHp = int($("#hp-total")?.value);
      if (masterHp > 0) {
        panel.querySelector(".comp-hp-max").value = Math.floor(masterHp / 2);
      }
    }

    ["Fort","Ref","Will"].forEach((s) => {
      const ab = saveAbility[s];
      const abMod = mod(ab);
      const base = int(panel.querySelector(`.comp-save-base[data-save="${s}"]`)?.value);
      const misc = int(panel.querySelector(`.comp-save-misc[data-save="${s}"]`)?.value);
      const abEl = panel.querySelector(`.comp-save-ab[data-save="${s}"]`);
      if (abEl) abEl.textContent = (abMod >= 0 ? "+" : "") + abMod;

      let total = base + abMod + misc;
      // Familiar: use master's save if higher (PHB p.52)
      if (isFamiliar) {
        const mainSave = $(`#${s.toLowerCase()}-total`);
        const mainVal = mainSave ? int(mainSave.textContent) : null;
        if (mainVal !== null && mainVal > total) total = mainVal;
      }
      const totalEl = panel.querySelector(`.comp-save-total[data-save="${s}"]`);
      if (totalEl) totalEl.textContent = (total >= 0 ? "+" : "") + total;
    });

    // Grapple
    const strMod = mod("STR");
    const grappleStrEl = panel.querySelector(".comp-grapple-str");
    if (grappleStrEl) grappleStrEl.textContent = (strMod >= 0 ? "+" : "") + strMod;
    const bab = int(panel.querySelector(".comp-bab")?.value);
    const grappleSize = int(panel.querySelector(".comp-grapple-size")?.value);
    const grappleMisc = int(panel.querySelector(".comp-grapple-misc")?.value);
    const grapple = bab + strMod + grappleSize + grappleMisc;
    setEl(".comp-grapple-total", (grapple >= 0 ? "+" : "") + grapple);

    // Refresh the class-based progression panel.
    refreshProgressionPanel(panel);
  }

  // ============================================================
  // Class-based companion progression (Session 2 of #6 plan)
  // ============================================================
  //
  // Walks the character's applied classes (via ClassPicker.getState),
  // queries each class's class_features for `companion` metadata
  // populated by _companion_metadata.py, and aggregates contributions
  // by companion type. Renders into each companion's progression panel.

  // Returns { animal_companion: { effectiveLevel, contributions:[...],
  //                                negated, modifiers:[...] },
  //           familiar:         { ... },
  //           special_mount:    { ... },
  //           cohort:           { ... }      }
  // `contributions` is a list of { className, level, role, stacking,
  // effective } where `effective` is the level units this class
  // contributes to the type.
  function computeCompanionLevels() {
    const out = {
      animal_companion: { effectiveLevel: 0, contributions: [],
                          negated: false, modifiers: [], notes: [] },
      familiar:         { effectiveLevel: 0, contributions: [],
                          negated: false, modifiers: [], notes: [] },
      special_mount:    { effectiveLevel: 0, contributions: [],
                          negated: false, modifiers: [], notes: [] },
      cohort:           { effectiveLevel: 0, contributions: [],
                          negated: false, modifiers: [], notes: [] },
    };
    if (!window.ClassPicker || typeof ClassPicker.getState !== "function") {
      return out;
    }
    if (!window.DB || !DB.isLoaded()) return out;

    const picked = ClassPicker.getState();
    for (const p of picked) {
      const className = p.className;
      const classLevel = p.level;
      if (!className || !classLevel) continue;
      // Pull the class's features and look at each one's `companion`
      // block. A feature's role determines how this class contributes.
      const row = DB.queryOne(
        "SELECT json_extract(data, '$.class_features') AS cf " +
        "FROM entry WHERE type IN ('class','prc') " +
        "AND name = :n COLLATE NOCASE LIMIT 1",
        { ":n": className });
      if (!row || !row.cf) continue;
      let features;
      try { features = JSON.parse(row.cf); } catch { continue; }
      if (!Array.isArray(features)) continue;
      for (const f of features) {
        const c = f && f.companion;
        if (!c || !c.type || !out[c.type]) continue;
        // Filter by level — only count the feature if the class
        // level is at least the feature's level_acquired. Some
        // features have null/undefined level_acquired (PrCs that
        // grant the feature at L1); treat those as L1.
        const requiredLvl = f.level_acquired || 1;
        if (classLevel < requiredLvl) continue;

        const bucket = out[c.type];
        if (c.role === "negates") {
          bucket.negated = true;
          bucket.notes.push(`${className}: ${c.notes || 'negates ' + c.type}`);
          continue;
        }
        if (c.role === "modifies") {
          bucket.modifiers.push({
            className,
            modifier: c.modifier || c.notes || '(modifier)',
          });
          continue;
        }
        // role === 'grants' or 'advances' — compute effective levels.
        let effective = 0;
        const s = c.stacking;
        if (s === "full" || s === undefined) {
          effective = classLevel;
        } else if (s === "half") {
          effective = Math.floor(classLevel / 2);
        } else if (typeof s === "object" && s !== null) {
          if (typeof s.plus === "number") {
            effective = classLevel + s.plus;
          } else if (typeof s.minus === "number") {
            effective = Math.max(0, classLevel - s.minus);
          } else if (s.custom) {
            // Custom progressions can't be summed simply — flag the
            // class as contributing but mark the stacking as custom
            // so the UI can hint that the user should consult source.
            // Special case: 'extra-companions' (Beastmaster) grants
            // ADDITIONAL companions at reduced effective level — it
            // doesn't add to the primary companion's progression, so
            // we record it as a note but don't bump the aggregate.
            if (s.custom === 'extra-companions') {
              bucket.notes.push(
                `${className}: grants ADDITIONAL companions at ` +
                `reduced levels (L4: ${classLevel - 3}, L7: ${classLevel - 6}, ` +
                `L10: ${classLevel - 9}) — separate from the primary ` +
                `companion's advancement.`);
              continue;
            }
            effective = classLevel;
            bucket.notes.push(
              `${className}: custom progression (${s.custom}) — ` +
              `consult source for exact stat advancement.`);
          }
        }
        bucket.contributions.push({
          className,
          level: classLevel,
          role: c.role,
          stacking: s,
          effective,
          featureName: f.name,
        });
        bucket.effectiveLevel += effective;
        if (c.creature)            bucket.notes.push(`${className}: creature → ${c.creature}`);
        if (c.starting_creatures)  bucket.notes.push(
          // Semicolon separator — some entries contain commas
          // ("Horse, Light" / "Snake, Small Viper" etc.).
          `${className}: starting list → ${c.starting_creatures.join('; ')}`);
        if (c.creature_template)   bucket.notes.push(
          `${className}: template → ${c.creature_template}`);
      }
    }
    return out;
  }

  // Render the per-companion panel showing detected types, effective
  // levels, contributing classes, and the row from the progression
  // table at that level.
  function refreshProgressionPanel(panel) {
    const body = panel.querySelector(".comp-progression-body");
    const status = panel.querySelector(".comp-progression-status");
    const wrap = panel.querySelector(".comp-progression-panel");
    if (!body || !status || !wrap) return;
    const lvls = computeCompanionLevels();
    // Find the companion type most relevant to THIS panel (based on
    // the comp-type dropdown — Animal Companion / Familiar / Cohort).
    const typeMap = {
      'Animal Companion': 'animal_companion',
      'Familiar':         'familiar',
      'Cohort':           'cohort',
      // No direct selector for special_mount today — Paladin special
      // mounts get used via Familiar/Animal Companion proxies; we
      // surface mount info under whichever type the player picks.
    };
    const selectedType = panel.querySelector(".comp-type")?.value || "";
    const matchType = typeMap[selectedType] || null;

    const sections = [];
    let anyContent = false;

    // Show the matched type prominently if any class contributes;
    // include the other types as a secondary list when they have
    // contributions too (multi-companion characters like Beastmaster
    // with multiple animals + a familiar from a multiclass).
    const TYPE_LABELS = {
      animal_companion: 'Animal Companion',
      familiar:         'Familiar',
      special_mount:    'Special Mount',
      cohort:           'Cohort',
    };
    // Order: matched type first, then any other types with
    // contributions / negations / modifiers.
    const allTypes = Object.keys(lvls);
    const orderedTypes = matchType
      ? [matchType, ...allTypes.filter(t => t !== matchType)]
      : allTypes;
    for (const type of orderedTypes) {
      const bucket = lvls[type];
      const hasAny = bucket.effectiveLevel > 0 ||
                     bucket.negated ||
                     bucket.modifiers.length > 0;
      if (!hasAny) continue;
      anyContent = true;
      sections.push(renderProgressionSection(type, bucket, TYPE_LABELS[type]));
    }

    if (!anyContent) {
      wrap.style.display = 'none';
      return;
    }
    wrap.style.display = '';
    body.innerHTML = sections.join('');
    // Status pill in the summary line.
    if (matchType && lvls[matchType].effectiveLevel > 0) {
      const eff = lvls[matchType].effectiveLevel;
      status.textContent = ` — effective ${TYPE_LABELS[matchType]} ` +
        `level ${eff}`;
    } else if (matchType && lvls[matchType].negated) {
      status.textContent = ` — ${TYPE_LABELS[matchType]} negated`;
    } else {
      status.textContent = '';
    }
  }

  function renderProgressionSection(type, bucket, label) {
    const lines = [];
    lines.push(`<div class="comp-prog-section">` +
               `<div class="comp-prog-section-head"><b>${escapeHtml(label)}</b>` +
               (bucket.negated
                 ? ` <span class="comp-prog-negated">negated</span>`
                 : bucket.effectiveLevel > 0
                   ? ` — effective master level <b>${bucket.effectiveLevel}</b>`
                   : '') + `</div>`);
    // Contributing classes.
    if (bucket.contributions.length) {
      const items = bucket.contributions.map(c => {
        const stackingLabel = c.stacking === 'full'    ? 'full'
                            : c.stacking === 'half'    ? 'half'
                            : c.stacking && c.stacking.plus  != null ? `+${c.stacking.plus}`
                            : c.stacking && c.stacking.minus != null ? `−${c.stacking.minus}`
                            : c.stacking && c.stacking.custom        ? `custom: ${c.stacking.custom}`
                            : '?';
        return `<li><b>${escapeHtml(c.className)}</b> L${c.level} ` +
               `(${stackingLabel}) → +${c.effective} effective levels ` +
               `<span class="comp-prog-feature">[${escapeHtml(c.featureName || '')}]</span></li>`;
      });
      lines.push(`<ul class="comp-prog-contributions">${items.join('')}</ul>`);
    }
    // Progression-table row at this effective level.
    // DND35 is a top-level `const` in data.js — bound in script scope
    // but NOT a `window` property. Use a `typeof` guard for cross-
    // module access; see the same trap fixed in feats.js / feat-picker
    // .js (2026-05-16 session notes).
    if (bucket.effectiveLevel > 0 && typeof DND35 !== 'undefined' &&
        typeof DND35.getCompanionProgression === 'function') {
      const row = DND35.getCompanionProgression(type, bucket.effectiveLevel);
      if (row) {
        const bits = [];
        if (row.bonusHD != null)    bits.push(`Bonus HD: +${row.bonusHD}`);
        if (row.naAdj != null)      bits.push(`NA Adj: +${row.naAdj}`);
        if (row.abilityAdj != null) bits.push(`Str/Dex Adj: +${row.abilityAdj}`);
        if (row.strAdj != null)     bits.push(`Str Adj: +${row.strAdj}`);
        if (row.intMin != null)     bits.push(`Min Int: ${row.intMin}`);
        if (row.bonusTricks != null) bits.push(`Bonus Tricks: ${row.bonusTricks}`);
        if (bits.length) {
          lines.push(`<div class="comp-prog-stats">` +
                     bits.map(escapeHtml).join(' &nbsp;·&nbsp; ') +
                     `</div>`);
        }
        if (row.specials && row.specials.length) {
          lines.push(`<div class="comp-prog-specials"><b>Specials at this level:</b> ` +
                     row.specials.map(escapeHtml).join(', ') + `</div>`);
        }
      } else if (type === 'special_mount' && bucket.effectiveLevel < 5) {
        lines.push(`<div class="comp-prog-stats" style="opacity:.7">` +
                   `Paladin special mount only manifests at effective ` +
                   `paladin level 5+ (currently ${bucket.effectiveLevel}).</div>`);
      }
    }
    // Notes + modifiers.
    for (const n of bucket.notes) {
      lines.push(`<div class="comp-prog-note">${escapeHtml(n)}</div>`);
    }
    for (const m of bucket.modifiers) {
      lines.push(`<div class="comp-prog-modifier"><b>${escapeHtml(m.className)}</b> ` +
                 `modifies: ${escapeHtml(m.modifier)}</div>`);
    }
    lines.push(`</div>`);
    return lines.join('');
  }

  // Global #creature-options datalist with every creature name in
  // the DB. Used by the base-creature autocomplete on each companion
  // panel. Built once at DB.ready; tiny (~1,200 names ≈ 30 KB).
  function buildGlobalCreatureDatalist() {
    if (document.getElementById('creature-options')) return;
    if (typeof DB === 'undefined' || !DB.isLoaded()) return;
    // 3.5-first dedup by case-insensitive name; same pattern as the
    // spell datalist build in spell-picker.js.
    const rows = DB.query(
      "SELECT e.name AS name FROM entry e " +
      "LEFT JOIN book b ON b.name = e.source " +
      "WHERE e.type = 'creature' AND e.name IS NOT NULL " +
      "ORDER BY CASE e.version WHEN '3.5' THEN 0 ELSE 1 END, " +
      "         b.publication_date DESC, " +
      "         e.name COLLATE NOCASE"
    );
    const seen = new Set();
    const dl = document.createElement('datalist');
    dl.id = 'creature-options';
    for (const r of rows) {
      const key = String(r.name || '').toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const opt = document.createElement('option');
      opt.value = r.name;
      dl.appendChild(opt);
    }
    document.body.appendChild(dl);
    console.log(`[companion] built #creature-options datalist with ` +
      `${seen.size} unique creature names`);
  }

  // ---- AUTO mode: fill stat fields from base creature + progression ----
  //
  // Looks up the base creature in the DB, extracts its abilities /
  // speed / natural armor, applies the progression deltas (bonus HD,
  // NA Adj, Str/Dex Adj, Int floor), and fills the panel's stat
  // fields. Fields filled this way carry data-from-auto so the
  // applyAutoFillState toggle can manage disabled state, and so
  // future switches between AUTO and MANUAL leave manual edits alone
  // when the user types over them.

  function autoFillFromBaseCreature(panel) {
    if (typeof DB === 'undefined' || !DB.isLoaded()) return;
    const baseName = panel.querySelector('.comp-base-creature')?.value?.trim();
    if (!baseName) return;
    const row = DB.queryOne(
      "SELECT data FROM entry WHERE name = :n COLLATE NOCASE " +
      "AND type = 'creature' LIMIT 1", { ':n': baseName });
    if (!row || !row.data) return;
    let creature;
    try { creature = JSON.parse(row.data); } catch { return; }

    // Compute the active progression row for this panel's selected
    // companion type (Animal Companion / Familiar / etc.).
    const lvls = computeCompanionLevels();
    const typeMap = {
      'Animal Companion': 'animal_companion',
      'Familiar':         'familiar',
      'Cohort':           'cohort',
    };
    const selType = panel.querySelector('.comp-type')?.value || '';
    const matchType = typeMap[selType] || null;
    let prog = null;
    let effectiveLevel = 0;
    if (matchType && lvls[matchType] && lvls[matchType].effectiveLevel > 0) {
      effectiveLevel = lvls[matchType].effectiveLevel;
      if (typeof DND35 !== 'undefined' &&
          typeof DND35.getCompanionProgression === 'function') {
        prog = DND35.getCompanionProgression(matchType, effectiveLevel);
      }
    }

    // Compute final stats.
    const base = creature.abilities || {};
    const abilityAdj = (prog && prog.abilityAdj) || 0;  // animal: str+dex
    const strAdj = (prog && prog.strAdj) || 0;          // mount: str
    const naAdj = (prog && prog.naAdj) || 0;
    const intMin = (prog && prog.intMin) || 0;

    // For animal companions, the progression bumps BOTH Str and Dex.
    // For mounts, only Str (via strAdj). Familiars get an Int floor
    // but no ability bumps. Apply accordingly.
    const stats = {
      STR: (base.Str || 0) + (matchType === 'animal_companion' ? abilityAdj : strAdj),
      DEX: (base.Dex || 0) + (matchType === 'animal_companion' ? abilityAdj : 0),
      CON: base.Con || 0,
      INT: Math.max(base.Int || 0, intMin),
      WIS: base.Wis || 0,
      CHA: base.Cha || 0,
    };

    // Pull natural armor out of the free-text armor_class string
    // (e.g. "14 (+2 Dex, +2 natural), touch 12, flat-footed 12" →
    // baseNA=2). Some creatures have no natural armor; default 0.
    const acText = String(creature.armor_class || '');
    const naMatch = acText.match(/([+\-]?\d+)\s*natural/i);
    const baseNA = naMatch ? parseInt(naMatch[1], 10) : 0;

    // Apply to the panel's fields. Each is marked data-from-auto so
    // applyAutoFillState can grey them out in AUTO mode.
    const setAuto = (sel, val) => {
      const el = panel.querySelector(sel);
      if (!el) return;
      el.value = String(val);
      el.dataset.fromAuto = '1';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    for (const ab of ['STR','DEX','CON','INT','WIS','CHA']) {
      setAuto(`.comp-score[data-ab="${ab}"]`, stats[ab]);
    }
    if (creature.speed) {
      setAuto('.comp-speed', String(creature.speed));
    }
    setAuto('.comp-ac-natural', baseNA + naAdj);

    // Re-apply disabled state (since setAuto cleared / set values
    // but the toggle handler runs only on radio change).
    applyAutoFillState(panel, 'auto');
  }

  // When AUTO mode is on, the stat fields populated by autoFillFromBase
  // Creature are disabled to avoid stale manual edits when the user
  // toggles modes back and forth. MANUAL re-enables everything so the
  // sheet behaves like before.
  function applyAutoFillState(panel, mode) {
    const auto = mode === 'auto';
    const fields = panel.querySelectorAll(
      '.comp-score, .comp-speed, .comp-ac-natural');
    for (const el of fields) {
      el.disabled = auto;
      el.classList.toggle('comp-auto-locked', auto);
    }
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ============================================================
  // Collect / Load all companions
  // ============================================================
  function collectData() {
    const companions = [];
    $$(".inner-tab[data-comp-idx]").forEach((btn) => {
      const idx = btn.dataset.compIdx;
      const panel = $(`#companion-${idx}`);
      if (!panel) return;
      const d = {};
      d.name = btn.textContent.replace("×", "").trim();
      d.compName = panel.querySelector(".comp-name")?.value || "";
      d.compType = panel.querySelector(".comp-type")?.value || "";
      d.isFamiliar = panel.querySelector(".comp-familiar-toggle")?.checked || false;
      d.compMode = panel.querySelector(".comp-mode-radio:checked")?.value || "manual";
      d.compBaseCreature = panel.querySelector(".comp-base-creature")?.value || "";
      ["STR","DEX","CON","INT","WIS","CHA"].forEach((ab) => {
        d[`comp-${ab.toLowerCase()}-score`] = panel.querySelector(`.comp-score[data-ab="${ab}"]`)?.value || "";
      });
      d.compHpMax = panel.querySelector(".comp-hp-max")?.value || "";
      d.compHpCur = panel.querySelector(".comp-hp-cur")?.value || "";
      d.compSpeed = panel.querySelector(".comp-speed")?.value || "";
      d.compInitMisc = panel.querySelector(".comp-init-misc")?.value || "";
      ["armor","shield","natural","size","misc"].forEach((f) => {
        d[`compAc${f.charAt(0).toUpperCase()+f.slice(1)}`] = panel.querySelector(`.comp-ac-${f}`)?.value || "";
      });
      ["Fort","Ref","Will"].forEach((s) => {
        d[`compSave${s}Base`] = panel.querySelector(`.comp-save-base[data-save="${s}"]`)?.value || "";
        d[`compSave${s}Misc`] = panel.querySelector(`.comp-save-misc[data-save="${s}"]`)?.value || "";
      });
      d.compBab = panel.querySelector(".comp-bab")?.value || "";
      d.compGrappleSize = panel.querySelector(".comp-grapple-size")?.value || "";
      d.compGrappleMisc = panel.querySelector(".comp-grapple-misc")?.value || "";
      d.compPersonality = panel.querySelector(".comp-personality")?.value || "";
      d.compNotes = panel.querySelector(".comp-notes")?.value || "";
      d.compSpecials = Array.from(panel.querySelectorAll(".comp-special-entry")).map((r) => ({
        name: r.querySelector(".comp-special-name")?.value || "",
        notes: r.querySelector(".comp-special-notes")?.value || "",
      }));
      d.compAttacks = Array.from(panel.querySelectorAll(".comp-attack-entry")).map((r) => ({
        weapon: r.querySelector(".comp-atk-weapon")?.value || "",
        bonus: r.querySelector(".comp-atk-bonus")?.value || "",
        damage: r.querySelector(".comp-atk-damage")?.value || "",
        crit: r.querySelector(".comp-atk-crit")?.value || "",
      }));
      d.compSkills = Array.from(panel.querySelectorAll(".comp-skill-row")).map((r) => ({
        name: r.querySelector(".comp-skill-name")?.value || "",
        ranks: r.querySelector(".comp-skill-ranks")?.value || "",
        misc: r.querySelector(".comp-skill-misc")?.value || "",
      }));
      d.compFeats = Array.from(panel.querySelectorAll(".comp-feat-entry")).map((r) => ({
        name: r.querySelector(".comp-feat-name")?.value || "",
        notes: r.querySelector(".comp-feat-notes")?.value || "",
      }));
      d.compTricks = Array.from(panel.querySelectorAll(".comp-trick-entry")).map((r) => ({
        name: r.querySelector(".comp-trick-name")?.value || "",
        notes: r.querySelector(".comp-trick-notes")?.value || "",
      }));
      companions.push(d);
    });
    return { companions };
  }

  function loadData(data) {
    const tabBar = $("#companion-tab-bar");
    const content = $("#companion-content");
    if (!tabBar || !content) return;

    // Clear existing
    tabBar.innerHTML = "";
    content.innerHTML = "";
    companionIndex = 0;

    // Legacy migration: single companion from old schema
    if (!data.companions && (data["comp-name"] !== undefined || data.compAttacks)) {
      const legacy = {
        name: "Companion",
        compName: data["comp-name"] || "",
        compType: data["comp-type"] || "",
        compSpeed: data["comp-speed"] || "",
        compNotes: data["comp-personality"] || "",
        compSpecial: data["comp-special"] || "",
        compAttacks: data.compAttacks || [],
        compSkills: [],
        compFeats: data["comp-feats"] ? [{ name: data["comp-feats"], notes: "" }] : [],
        compTricks: data["comp-tricks"] ? [{ name: data["comp-tricks"], notes: "" }] : [],
      };
      ["STR","DEX","CON","INT","WIS","CHA"].forEach((ab) => {
        legacy[`comp-${ab.toLowerCase()}-score`] = data[`comp-${ab.toLowerCase()}`] || "";
      });
      addCompanion(legacy);
    } else {
      (data.companions || []).forEach((c) => addCompanion(c));
    }

    // Ensure at least one companion tab exists
    if (companionIndex === 0) addCompanion();
  }

  function setMainGetAbilityMod(fn) { _mainGetAbilityMod = fn; }

  function recalcAll() {
    $$("#companion-content > .inner-tab-content").forEach((panel) => recalcCompanion(panel));
  }

  // H5 (2026-05-16 play-feel pass): pick the most-relevant comp-type
  // dropdown value based on which bucket of computeCompanionLevels()
  // has the highest effective level. Returns a serialization-form
  // value matching the dropdown's `option`-comparison keys (animal /
  // familiar / cohort) or null if no bucket is non-zero.
  function defaultCompTypeFromClasses() {
    if (!window.DB || !DB.isLoaded()) return null;
    const lvls = computeCompanionLevels();
    // Map computeCompanionLevels bucket keys → buildCompanionHTML's
    // option-comparison values. (special_mount has no dedicated
    // dropdown entry — surface via "animal" since the existing
    // progression panel renders the mount info under either type.)
    const KEY_TO_VALUE = {
      familiar:         "familiar",
      animal_companion: "animal",
      special_mount:    "animal",
      cohort:           "cohort",
    };
    let bestKey = null;
    let bestLvl = 0;
    for (const k of Object.keys(lvls)) {
      if (lvls[k].effectiveLevel > bestLvl) {
        bestLvl = lvls[k].effectiveLevel;
        bestKey = k;
      }
    }
    return bestKey ? KEY_TO_VALUE[bestKey] : null;
  }

  // H4 (2026-05-16 play-feel pass): when classes change (apply /
  // remove via class-picker), refresh every existing companion
  // panel's progression panel + recompute the auto-default
  // comp-type for any panel that hasn't had its type explicitly
  // chosen by the user. Without this, applying "Wizard 5" to a
  // fresh sheet left the progression panel empty until some other
  // event triggered recalcCompanion.
  document.addEventListener("classes-changed", () => {
    const defaultType = defaultCompTypeFromClasses();
    $$("#companion-content > .inner-tab-content").forEach((panel) => {
      // Bump comp-type only when the user hasn't explicitly chosen
      // one (marked by absence of `data-user-set` on the select) AND
      // we computed a meaningful default.
      const sel = panel.querySelector(".comp-type");
      if (sel && defaultType && !sel.dataset.userSet) {
        // Map serialization key → display text (option order matches
        // buildCompanionHTML's `<option>` list).
        const TEXT_FOR_KEY = {
          animal: "Animal Companion",
          familiar: "Familiar",
          cohort: "Cohort",
        };
        const want = TEXT_FOR_KEY[defaultType];
        if (want && sel.value !== want) {
          sel.value = want;
          // Dispatch change so any downstream listeners (AUTO-fill
          // recompute, etc.) react.
          sel.dispatchEvent(new Event("change", { bubbles: true }));
        }
      }
      recalcCompanion(panel);
    });
  });

  // Build the global #creature-options datalist once the DB is loaded.
  // Per-panel base-creature inputs reference it via `list="creature-options"`.
  // companion.js loads BEFORE database.js in index.html so `DB` isn't
  // yet defined when this IIFE runs. Poll briefly for it.
  function _scheduleCreatureDatalistBuild(attempt = 0) {
    if (typeof DB !== 'undefined' && DB.ready) {
      DB.ready.then((db) => { if (db) buildGlobalCreatureDatalist(); });
      return;
    }
    if (attempt > 50) return;  // give up after ~5s of polling
    setTimeout(() => _scheduleCreatureDatalistBuild(attempt + 1), 100);
  }
  _scheduleCreatureDatalistBuild();

  return { addCompanion, loadData, collectData, recalcAll, setMainGetAbilityMod };
})();
