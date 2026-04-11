// D&D 3.5 Character Sheet - Spells Tab Module (Dynamic Sub-tabs)

const Spells = (function () {
  "use strict";

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);
  const int = (v) => parseInt(v) || 0;

  let casterIndex = 0;
  let _getAbilityMod = null;
  const SPELL_LABELS = ["0 (Cantrips)", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th"];
  const SPELL_LIST_LABELS = ["0-Level (Cantrips)", "1st Level", "2nd Level", "3rd Level", "4th Level", "5th Level", "6th Level", "7th Level", "8th Level", "9th Level"];
  const SPELL_SHORT = ["0", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th"];

  // ============================================================
  // Add a caster sub-tab (spellcasting or psionics)
  // ============================================================
  function addCaster(type, data = {}) {
    const idx = casterIndex++;
    const DEFAULT_NAMES = { spellcasting: "Spellcasting", psionics: "Psionics", maneuvers: "Maneuvers" };
    const defaultName = DEFAULT_NAMES[type] || type;
    const name = data.name || defaultName;

    // Create inner-tab button
    const tabBar = $("#spells-tab-bar");
    const btn = document.createElement("button");
    btn.className = "inner-tab";
    btn.dataset.casterIdx = idx;
    btn.textContent = name;
    btn.addEventListener("click", () => switchCaster(idx));
    btn.addEventListener("dblclick", () => renameCaster(btn));
    tabBar.appendChild(btn);

    // Create content panel
    const container = $("#spells-content");
    const panel = document.createElement("div");
    panel.className = "inner-tab-content";
    panel.id = `caster-${idx}`;
    panel.dataset.casterType = type;

    // Sub-tab notes field (for differentiating multiple tabs of same type)
    const notesHTML = `<div class="field caster-notes-field"><label>Notes</label><input type="text" class="caster-notes" placeholder="e.g. Cleric spells, Arcane Trickster, etc." value="${data.notes || ""}"></div>`;

    if (type === "spellcasting") {
      panel.innerHTML = notesHTML + buildSpellcastingHTML(idx, data);
      container.appendChild(panel);
      buildSpellLists(idx, panel);
      wireSpellLevelTabs(panel);
    } else if (type === "psionics") {
      panel.innerHTML = notesHTML + buildPsionicsHTML(idx, data);
      container.appendChild(panel);
      buildPsiPowerLists(idx, panel);
      wirePsiLevelTabs(panel);
    } else if (type === "maneuvers") {
      panel.innerHTML = notesHTML + buildManeuversHTML(idx, data);
      container.appendChild(panel);
      buildManeuverLists(idx, panel);
      wireManeuverLevelTabs(panel);
    }

    // Add remove button to tab
    const removeBtn = document.createElement("span");
    removeBtn.className = "caster-tab-remove";
    removeBtn.textContent = "×";
    removeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (confirm(`Remove "${btn.textContent.replace("×", "").trim()}"?`)) {
        btn.remove();
        panel.remove();
        // Activate first remaining tab if any
        const first = tabBar.querySelector(".inner-tab");
        if (first) first.click();
      }
    });
    btn.appendChild(removeBtn);

    // Activate this new tab
    switchCaster(idx);
    if (_getAbilityMod) recalc(_getAbilityMod);
    return idx;
  }

  function switchCaster(idx) {
    $$(".inner-tab[data-caster-idx]").forEach((t) => t.classList.remove("active"));
    $$("#spells-content > .inner-tab-content").forEach((c) => c.classList.remove("active"));
    const btn = $(`.inner-tab[data-caster-idx="${idx}"]`);
    const panel = $(`#caster-${idx}`);
    if (btn) btn.classList.add("active");
    if (panel) panel.classList.add("active");
  }

  function renameCaster(btn) {
    const removeSpan = btn.querySelector(".caster-tab-remove");
    const currentName = btn.textContent.replace("×", "").trim();
    const newName = prompt("Rename tab:", currentName);
    if (newName && newName.trim()) {
      btn.textContent = newName.trim();
      btn.appendChild(removeSpan);
    }
  }

  function buildAbilityOptions(selected, includePhysical = true) {
    let abilities = ["", "INT", "WIS", "CHA"];
    let labels = ["-- None --", "Intelligence", "Wisdom", "Charisma"];
    if (includePhysical) {
      abilities.push("STR", "DEX", "CON");
      labels.push("Strength", "Dexterity", "Constitution");
    }
    return abilities.map((ab, i) =>
      `<option value="${ab}"${ab === selected ? " selected" : ""}>${labels[i]}</option>`
    ).join("");
  }

  // ============================================================
  // Spellcasting HTML builder
  // ============================================================
  function buildSpellcastingHTML(idx, data) {
    const rows = [];
    for (let i = 0; i <= 9; i++) {
      rows.push(`<tr>
        <td>${SPELL_LABELS[i]}</td>
        <td><input type="number" class="sc-known" data-lvl="${i}" min="0" value="${data[`known-${i}`] || ""}"></td>
        <td><span class="sc-dc calc-field" data-lvl="${i}">--</span></td>
        <td><input type="number" class="sc-per-day" data-lvl="${i}" min="0" value="${data[`perDay-${i}`] || ""}"></td>
        <td><input type="number" class="sc-bonus" data-lvl="${i}" min="0" value="${data[`bonus-${i}`] || ""}"></td>
        <td><input type="number" class="sc-used" data-lvl="${i}" min="0" value="${data[`used-${i}`] || "0"}"></td>
        <td><span class="sc-remain calc-field" data-lvl="${i}">--</span></td>
      </tr>`);
    }

    const levelTabs = SPELL_SHORT.map((label, i) =>
      `<button class="spell-level-tab${i === 0 ? " active" : ""}" data-level="${i}">${label}</button>`
    ).join("");

    return `
      <section class="section">
        <h2>Spellcasting</h2>
        <div class="spell-header">
          <div class="field field-sm"><label>Caster Level</label><input type="number" class="sc-caster-level" min="1" value="${data.casterLevel || ""}"></div>
          <div class="field"><label>Spellcasting Ability</label><select class="sc-ability">${buildAbilityOptions(data.ability || "", false)}</select></div>
          <div class="field"><label>Arcane Spell Failure %</label><span class="sc-spell-fail calc-field">0%</span></div>
          <div class="field"><label>Conditional Modifiers</label><input type="text" class="sc-conditional" value="${data.conditional || ""}"></div>
        </div>
        <table class="spell-slots-table">
          <thead><tr><th>Spell Level</th><th>Spells Known</th><th>Save DC</th><th>Spells/Day</th><th>Bonus Spells</th><th>Slots Used</th><th>Remaining</th></tr></thead>
          <tbody>${rows.join("")}</tbody>
        </table>
        <button class="btn-add sc-reset-slots" style="margin-top:0.5rem">Reset All Expended Slots</button>
      </section>
      <section class="section">
        <h2>Spell List & Prepared Spells</h2>
        <div class="spell-list-tabs">${levelTabs}</div>
        <div class="sc-spell-lists"></div>
      </section>
    `;
  }

  function buildSpellLists(idx, panel) {
    const container = panel.querySelector(".sc-spell-lists");
    for (let i = 0; i <= 9; i++) {
      const div = document.createElement("div");
      div.className = `spell-list-content${i === 0 ? " active" : ""}`;
      div.dataset.level = i;
      div.innerHTML = `
        <div class="two-column">
          <div class="column">
            <h3>${SPELL_LIST_LABELS[i]} - Known/Available Spells</h3>
            <textarea class="sc-spell-text" data-lvl="${i}" rows="8" placeholder="Enter ${SPELL_LIST_LABELS[i]} spells you know, one per line..."></textarea>
          </div>
          <div class="column">
            <h3>${SPELL_LIST_LABELS[i]} - Prepared Spells</h3>
            <textarea class="sc-spell-prepared" data-lvl="${i}" rows="8" placeholder="Enter prepared ${SPELL_LIST_LABELS[i]} spells, one per line. Mark used with [X]..."></textarea>
          </div>
        </div>
      `;
      container.appendChild(div);
    }

    // Wire reset slots button
    panel.querySelector(".sc-reset-slots").addEventListener("click", () => {
      panel.querySelectorAll(".sc-used").forEach((el) => { el.value = 0; });
      recalc();
    });
  }

  function wireSpellLevelTabs(panel) {
    panel.querySelectorAll(".spell-level-tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        panel.querySelectorAll(".spell-level-tab").forEach((t) => t.classList.remove("active"));
        panel.querySelectorAll(".spell-list-content").forEach((c) => c.classList.remove("active"));
        btn.classList.add("active");
        const lvl = btn.dataset.level;
        panel.querySelectorAll(".spell-list-content").forEach((c) => {
          if (c.dataset.level === lvl) c.classList.add("active");
        });
      });
    });
  }

  // ============================================================
  // Psionics HTML builder
  // ============================================================
  // Base PP cost by power level (XPH Table 3-3)
  const PP_COSTS = [0, 1, 3, 5, 7, 9, 11, 13, 15, 17];

  function buildPsionicsHTML(idx, data) {
    const dcRows = [];
    for (let i = 1; i <= 9; i++) {
      dcRows.push(`<tr>
        <td>${SPELL_LABELS[i]}</td>
        <td class="psi-pp-cost">${PP_COSTS[i]}</td>
        <td><span class="psi-dc calc-field" data-lvl="${i}">--</span></td>
      </tr>`);
    }

    const levelTabs = SPELL_SHORT.slice(1).map((label, i) =>
      `<button class="spell-level-tab${i === 0 ? " active" : ""}" data-level="${i + 1}">${label}</button>`
    ).join("");

    return `
      <section class="section">
        <h2>Psionics</h2>
        <div class="info-grid">
          <div class="field"><label>Primary Discipline</label><input type="text" class="psi-discipline" value="${data.discipline || ""}"></div>
          <div class="field field-sm"><label>Manifesting Ability</label><select class="psi-ability">${buildAbilityOptions(data.ability || "")}</select></div>
          <div class="field field-sm"><label>Manifester Level</label><input type="number" class="psi-manifester-level" min="1" value="${data.manifesterLevel || ""}"></div>
        </div>
        <div class="info-grid" style="margin-top:0.4rem">
          <div class="field field-sm"><label>Base PP</label><input type="number" class="psi-pp-base" min="0" value="${data.ppBase || ""}"></div>
          <div class="field field-sm"><label>Bonus PP</label><span class="psi-pp-bonus calc-field">--</span></div>
          <div class="field field-sm"><label>PP/Day</label><span class="psi-pp-day calc-field">--</span></div>
          <div class="field field-sm"><label>PP Spent</label><input type="number" class="psi-pp-spent" min="0" value="${data.ppSpent || "0"}"></div>
          <div class="field field-sm"><label>PP Remaining</label><span class="psi-pp-remaining calc-field">--</span></div>
        </div>
        <div class="info-grid" style="margin-top:0.4rem">
          <div class="field field-sm"><label>Powers Known</label><input type="number" class="psi-powers-known" min="0" value="${data.powersKnown || ""}"></div>
          <div class="field field-sm"><label>Max Power Level</label><input type="number" class="psi-max-level" min="1" max="9" value="${data.maxLevel || ""}"></div>
        </div>
        <table class="spell-slots-table" style="max-width:400px">
          <thead><tr><th>Power Level</th><th>Base PP Cost</th><th>Save DC</th></tr></thead>
          <tbody>${dcRows.join("")}</tbody>
        </table>
      </section>
      <section class="section">
        <h2>Powers List</h2>
        <div class="spell-list-tabs">${levelTabs}</div>
        <div class="psi-power-lists"></div>
      </section>
    `;
  }

  function buildPsiPowerLists(idx, panel) {
    const container = panel.querySelector(".psi-power-lists");
    for (let i = 1; i <= 9; i++) {
      const div = document.createElement("div");
      div.className = `spell-list-content${i === 1 ? " active" : ""}`;
      div.dataset.level = i;
      div.innerHTML = `
        <h3>${SPELL_LABELS[i]} Level Powers</h3>
        <textarea class="psi-power-text" data-lvl="${i}" rows="8" placeholder="Enter ${SPELL_LABELS[i]} level powers, one per line..."></textarea>
      `;
      container.appendChild(div);
    }
  }

  function wirePsiLevelTabs(panel) {
    panel.querySelectorAll(".spell-level-tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        panel.querySelectorAll(".spell-level-tab").forEach((t) => t.classList.remove("active"));
        panel.querySelectorAll(".spell-list-content").forEach((c) => c.classList.remove("active"));
        btn.classList.add("active");
        const lvl = btn.dataset.level;
        panel.querySelectorAll(".spell-list-content").forEach((c) => {
          if (c.dataset.level === lvl) c.classList.add("active");
        });
      });
    });
  }

  // ============================================================
  // Tome of Battle Maneuvers HTML builder
  // ============================================================
  function buildManeuversHTML(idx, data) {
    const levelTabs = SPELL_SHORT.slice(1).map((label, i) =>
      `<button class="spell-level-tab${i === 0 ? " active" : ""}" data-level="${i + 1}">${label}</button>`
    ).join("");

    return `
      <section class="section">
        <h2>Martial Maneuvers</h2>
        <div class="info-grid">
          <div class="field field-sm"><label>Initiator Level</label><input type="number" class="tom-init-level" min="1" value="${data.initLevel || ""}"></div>
          <div class="field field-sm"><label>Maneuvers Known</label><input type="number" class="tom-known-count" min="0" value="${data.knownCount || ""}"></div>
          <div class="field field-sm"><label>Maneuvers Readied</label><input type="number" class="tom-readied-count" min="0" value="${data.readiedCount || ""}"></div>
          <div class="field field-sm"><label>Stances Known</label><input type="number" class="tom-stances-count" min="0" value="${data.stancesCount || ""}"></div>
        </div>
      </section>
      <section class="section">
        <h2>Known Maneuvers & Stances</h2>
        <div class="spell-list-tabs">${levelTabs}</div>
        <div class="tom-maneuver-lists"></div>
      </section>
      <section class="section">
        <h2>Readied Maneuvers</h2>
        <textarea class="tom-readied" rows="8" placeholder="List readied maneuvers here. Mark expended with [X]...">${data.readied || ""}</textarea>
      </section>
    `;
  }

  function buildManeuverLists(idx, panel) {
    const container = panel.querySelector(".tom-maneuver-lists");
    for (let i = 1; i <= 9; i++) {
      const div = document.createElement("div");
      div.className = `spell-list-content${i === 1 ? " active" : ""}`;
      div.dataset.level = i;
      div.innerHTML = `
        <div class="two-column">
          <div class="column">
            <h3>${SPELL_LABELS[i]} Level - Known Maneuvers</h3>
            <textarea class="tom-maneuver-text" data-lvl="${i}" rows="8" placeholder="Enter ${SPELL_LABELS[i]} level maneuvers, one per line..."></textarea>
          </div>
          <div class="column">
            <h3>${SPELL_LABELS[i]} Level - Known Stances</h3>
            <textarea class="tom-stance-text" data-lvl="${i}" rows="8" placeholder="Enter ${SPELL_LABELS[i]} level stances, one per line..."></textarea>
          </div>
        </div>
      `;
      container.appendChild(div);
    }
  }

  function wireManeuverLevelTabs(panel) {
    panel.querySelectorAll(".spell-level-tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        panel.querySelectorAll(".spell-level-tab").forEach((t) => t.classList.remove("active"));
        panel.querySelectorAll(".spell-list-content").forEach((c) => c.classList.remove("active"));
        btn.classList.add("active");
        const lvl = btn.dataset.level;
        panel.querySelectorAll(".spell-list-content").forEach((c) => {
          if (c.dataset.level === lvl) c.classList.add("active");
        });
      });
    });
  }

  // ============================================================
  // Recalculate DCs and slot tracking for all casters
  // ============================================================
  function recalc(getAbilityMod) {
    if (getAbilityMod) _getAbilityMod = getAbilityMod;
    // Get arcane spell failure from character tab
    const spellFail = int($("#arcane-spell-failure")?.value);

    // Spellcasting sub-tabs
    $$("[data-caster-type='spellcasting']").forEach((panel) => {
      const ability = panel.querySelector(".sc-ability")?.value || "";
      const abilityMod = ability && getAbilityMod ? getAbilityMod(ability) : 0;
      const failEl = panel.querySelector(".sc-spell-fail");
      if (failEl) failEl.textContent = spellFail + "%";

      for (let i = 0; i <= 9; i++) {
        const dcEl = panel.querySelector(`.sc-dc[data-lvl="${i}"]`);
        if (dcEl) dcEl.textContent = ability ? 10 + i + abilityMod : "--";

        const perDay = int(panel.querySelector(`.sc-per-day[data-lvl="${i}"]`)?.value);
        const bonus = int(panel.querySelector(`.sc-bonus[data-lvl="${i}"]`)?.value);
        const used = int(panel.querySelector(`.sc-used[data-lvl="${i}"]`)?.value);
        const totalSlots = perDay + bonus;
        const remaining = totalSlots - used;
        const el = panel.querySelector(`.sc-remain[data-lvl="${i}"]`);
        if (el) {
          const row = el.closest("tr");
          if (totalSlots > 0) {
            el.textContent = remaining;
            el.classList.remove("spell-remain-zero", "spell-remain-low");
            if (row) row.classList.remove("spell-row-exhausted");
            if (remaining <= 0) {
              el.classList.add("spell-remain-zero");
              if (row) row.classList.add("spell-row-exhausted");
            } else if (remaining <= Math.ceil(totalSlots * 0.25)) {
              el.classList.add("spell-remain-low");
            }
          } else {
            el.textContent = "--";
            el.classList.remove("spell-remain-zero", "spell-remain-low");
            if (row) row.classList.remove("spell-row-exhausted");
          }
        }
      }
    });

    // Psionics sub-tabs
    $$("[data-caster-type='psionics']").forEach((panel) => {
      const ability = panel.querySelector(".psi-ability")?.value || "";
      const abilityMod = ability && getAbilityMod ? getAbilityMod(ability) : 0;
      const manifesterLevel = int(panel.querySelector(".psi-manifester-level")?.value);

      for (let i = 1; i <= 9; i++) {
        const dcEl = panel.querySelector(`.psi-dc[data-lvl="${i}"]`);
        if (dcEl) dcEl.textContent = ability ? 10 + i + abilityMod : "--";
      }

      // Bonus PP = ability modifier × manifester level ÷ 2 (round down), min 0
      const bonusPP = (ability && manifesterLevel > 0)
        ? Math.max(0, Math.floor(abilityMod * manifesterLevel / 2))
        : 0;
      const basePP = int(panel.querySelector(".psi-pp-base")?.value);
      const ppDay = basePP + bonusPP;
      const ppSpent = int(panel.querySelector(".psi-pp-spent")?.value);
      const ppRemaining = ppDay - ppSpent;

      const bonusEl = panel.querySelector(".psi-pp-bonus");
      if (bonusEl) bonusEl.textContent = (ability && manifesterLevel > 0) ? bonusPP : "--";

      const dayEl = panel.querySelector(".psi-pp-day");
      if (dayEl) dayEl.textContent = basePP > 0 ? ppDay : "--";

      const ppRemainEl = panel.querySelector(".psi-pp-remaining");
      if (ppRemainEl) {
        if (ppDay > 0) {
          ppRemainEl.textContent = ppRemaining;
          ppRemainEl.classList.remove("spell-remain-zero", "spell-remain-low");
          if (ppRemaining <= 0) ppRemainEl.classList.add("spell-remain-zero");
          else if (ppRemaining <= Math.ceil(ppDay * 0.25)) ppRemainEl.classList.add("spell-remain-low");
        } else {
          ppRemainEl.textContent = "--";
          ppRemainEl.classList.remove("spell-remain-zero", "spell-remain-low");
        }
      }
    });
  }

  function resetSlots() {
    $$(".sc-used").forEach((el) => { el.value = 0; });
  }

  // No-op stub for app.js backward compat
  function buildSpellListsLegacy() {}

  // ============================================================
  // Collect / Load
  // ============================================================
  function collectData() {
    const data = { casters: [] };

    $$(".inner-tab[data-caster-idx]").forEach((btn) => {
      const idx = btn.dataset.casterIdx;
      const panel = $(`#caster-${idx}`);
      if (!panel) return;

      const type = panel.dataset.casterType;
      const removeSpan = btn.querySelector(".caster-tab-remove");
      const name = btn.textContent.replace("×", "").trim();
      const caster = { type, name };
      caster.notes = panel.querySelector(".caster-notes")?.value || "";

      if (type === "spellcasting") {
        caster.casterLevel = panel.querySelector(".sc-caster-level")?.value || "";
        caster.ability = panel.querySelector(".sc-ability").value;
        caster.conditional = panel.querySelector(".sc-conditional").value;
        for (let i = 0; i <= 9; i++) {
          caster[`known-${i}`] = panel.querySelector(`.sc-known[data-lvl="${i}"]`)?.value || "";
          caster[`perDay-${i}`] = panel.querySelector(`.sc-per-day[data-lvl="${i}"]`)?.value || "";
          caster[`bonus-${i}`] = panel.querySelector(`.sc-bonus[data-lvl="${i}"]`)?.value || "";
          caster[`used-${i}`] = panel.querySelector(`.sc-used[data-lvl="${i}"]`)?.value || "0";
          caster[`text-${i}`] = panel.querySelector(`.sc-spell-text[data-lvl="${i}"]`)?.value || "";
          caster[`prepared-${i}`] = panel.querySelector(`.sc-spell-prepared[data-lvl="${i}"]`)?.value || "";
        }
      } else if (type === "psionics") {
        caster.discipline = panel.querySelector(".psi-discipline")?.value || "";
        caster.manifesterLevel = panel.querySelector(".psi-manifester-level")?.value || "";
        caster.ppBase = panel.querySelector(".psi-pp-base")?.value || "";
        caster.ppSpent = panel.querySelector(".psi-pp-spent")?.value || "0";
        caster.powersKnown = panel.querySelector(".psi-powers-known")?.value || "";
        caster.maxLevel = panel.querySelector(".psi-max-level")?.value || "";
        caster.ability = panel.querySelector(".psi-ability")?.value || "";
        for (let i = 1; i <= 9; i++) {
          caster[`power-${i}`] = panel.querySelector(`.psi-power-text[data-lvl="${i}"]`)?.value || "";
        }
      } else if (type === "maneuvers") {
        caster.initLevel = panel.querySelector(".tom-init-level")?.value || "";
        caster.knownCount = panel.querySelector(".tom-known-count")?.value || "";
        caster.readiedCount = panel.querySelector(".tom-readied-count")?.value || "";
        caster.stancesCount = panel.querySelector(".tom-stances-count")?.value || "";
        caster.readied = panel.querySelector(".tom-readied")?.value || "";
        for (let i = 1; i <= 9; i++) {
          caster[`maneuver-${i}`] = panel.querySelector(`.tom-maneuver-text[data-lvl="${i}"]`)?.value || "";
          caster[`stance-${i}`] = panel.querySelector(`.tom-stance-text[data-lvl="${i}"]`)?.value || "";
        }
      }

      data.casters.push(caster);
    });

    return data;
  }

  function loadData(data) {
    // Clear existing
    $("#spells-tab-bar").innerHTML = "";
    $("#spells-content").innerHTML = "";
    casterIndex = 0;

    if (data.casters) {
      data.casters.forEach((caster) => {
        const idx = addCaster(caster.type, caster);
        const panel = $(`#caster-${idx}`);
        if (!panel) return;

        if (caster.type === "spellcasting") {
          for (let i = 0; i <= 9; i++) {
            const textEl = panel.querySelector(`.sc-spell-text[data-lvl="${i}"]`);
            if (textEl && caster[`text-${i}`]) textEl.value = caster[`text-${i}`];
            const prepEl = panel.querySelector(`.sc-spell-prepared[data-lvl="${i}"]`);
            if (prepEl && caster[`prepared-${i}`]) prepEl.value = caster[`prepared-${i}`];
          }
        } else if (caster.type === "psionics") {
          for (let i = 1; i <= 9; i++) {
            const textEl = panel.querySelector(`.psi-power-text[data-lvl="${i}"]`);
            if (textEl && caster[`power-${i}`]) textEl.value = caster[`power-${i}`];
          }
        } else if (caster.type === "maneuvers") {
          for (let i = 1; i <= 9; i++) {
            const mEl = panel.querySelector(`.tom-maneuver-text[data-lvl="${i}"]`);
            if (mEl && caster[`maneuver-${i}`]) mEl.value = caster[`maneuver-${i}`];
            const sEl = panel.querySelector(`.tom-stance-text[data-lvl="${i}"]`);
            if (sEl && caster[`stance-${i}`]) sEl.value = caster[`stance-${i}`];
          }
        }
      });
    }

    recalc();
  }

  // ============================================================
  // Public API
  // ============================================================
  return {
    addCaster,
    buildSpellLists: buildSpellListsLegacy,
    recalc,
    resetSlots,
    collectData,
    loadData,
  };
})();
