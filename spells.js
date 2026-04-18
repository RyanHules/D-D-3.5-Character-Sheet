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

  function spellOrd(i) { return i < SPELL_LABELS.length ? SPELL_LABELS[i] : i + "th"; }
  function spellListLabel(i) { return i < SPELL_LIST_LABELS.length ? SPELL_LIST_LABELS[i] : i + "th Level"; }
  function spellShort(i) { return i < SPELL_SHORT.length ? SPELL_SHORT[i] : i + "th"; }

  // ============================================================
  // Add a caster sub-tab (spellcasting or psionics)
  // ============================================================
  function addCaster(type, data = {}) {
    const idx = casterIndex++;
    const DEFAULT_NAMES = { spellcasting: "Spellcasting", psionics: "Psionics", maneuvers: "Maneuvers", epic: "Epic Spellcasting", binding: "Binding" };
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
      wireLevelTabs(panel);
      wireSpecialistDomainToggles(panel);
    } else if (type === "psionics") {
      panel.innerHTML = notesHTML + buildPsionicsHTML(idx, data);
      container.appendChild(panel);
      buildPsiPowerLists(idx, panel);
      wireLevelTabs(panel);
    } else if (type === "maneuvers") {
      panel.innerHTML = notesHTML + buildManeuversHTML(idx, data);
      container.appendChild(panel);
      buildManeuverLists(idx, panel);
      wireLevelTabs(panel);
    } else if (type === "epic") {
      panel.innerHTML = notesHTML + buildEpicHTML(idx, data);
      container.appendChild(panel);
      wireEpicSpells(panel);
    } else if (type === "binding") {
      panel.innerHTML = notesHTML + buildBindingHTML(idx, data);
      container.appendChild(panel);
      wireBindingVestiges(panel);
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
    setTimeout(() => window.autoExpandAll && window.autoExpandAll(), 10);
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
    const domainVis = data.domainAccess ? "" : "display:none";
    const specVis = data.specialist ? "" : "display:none";
    const maxLevel = data.maxLevel || 9;
    const rows = [];
    for (let i = 0; i <= maxLevel; i++) {
      const hasBonusSlot = i >= 1;
      rows.push(`<tr>
        <td>${spellOrd(i)}</td>
        <td><input type="number" class="sc-known" data-lvl="${i}" min="0" value="${data[`known-${i}`] || ""}"></td>
        <td><span class="sc-dc calc-field" data-lvl="${i}">--</span></td>
        <td><input type="number" class="sc-per-day" data-lvl="${i}" min="0" value="${data[`perDay-${i}`] || ""}"></td>
        <td><input type="number" class="sc-bonus" data-lvl="${i}" min="0" value="${data[`bonus-${i}`] || ""}"></td>
        <td class="sc-domain-col" style="${domainVis}">${hasBonusSlot ? `<input type="number" class="sc-domain-slots" data-lvl="${i}" min="0" value="${data[`domain-${i}`] || ""}">` : ""}</td>
        <td class="sc-specialist-col" style="${specVis}">${hasBonusSlot ? `<input type="number" class="sc-specialist-slots" data-lvl="${i}" min="0" value="${data[`specialist-${i}`] || ""}">` : ""}</td>
        <td><input type="number" class="sc-used" data-lvl="${i}" min="0" value="${data[`used-${i}`] || "0"}"></td>
        <td><span class="sc-remain calc-field" data-lvl="${i}">--</span></td>
      </tr>`);
    }

    const levelTabs = Array.from({ length: maxLevel + 1 }, (_, i) =>
      `<button class="spell-level-tab${i === 0 ? " active" : ""}" data-level="${i}">${spellShort(i)}</button>`
    ).join("");

    // Build prohibited schools list
    const prohibitedSchools = data.prohibitedSchools || [];
    // Legacy migration: pull from old prohibited1/prohibited2 fields
    if (prohibitedSchools.length === 0) {
      if (data.prohibited1) prohibitedSchools.push(data.prohibited1);
      if (data.prohibited2) prohibitedSchools.push(data.prohibited2);
    }
    // Default to one empty entry
    if (prohibitedSchools.length === 0) prohibitedSchools.push("");

    const prohibitedHTML = prohibitedSchools.map((s) =>
      `<div class="prohibited-entry"><input type="text" class="sc-prohibited" value="${s}" placeholder="School name"><button class="btn-remove sc-remove-prohibited" title="Remove">X</button></div>`
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
        <div class="spell-header" style="margin-top:0.5rem">
          <label class="mi-toggle"><input type="checkbox" class="sc-specialist-toggle" ${data.specialist ? "checked" : ""}> Specialist</label>
          <label class="mi-toggle"><input type="checkbox" class="sc-domain-toggle" ${data.domainAccess ? "checked" : ""}> Domain Access</label>
        </div>
        <div class="sc-specialist-section" style="${specVis}">
          <div class="info-grid">
            <div class="field"><label>Specialty School</label><input type="text" class="sc-specialty-school" value="${data.specialtySchool || ""}" placeholder="+2 on Spellcraft checks for this school"></div>
          </div>
          <div class="sc-prohibited-list">
            <label>Prohibited Schools</label>
            ${prohibitedHTML}
            <button class="btn-add sc-add-prohibited" style="margin-top:0.3rem">+ Add Prohibited School</button>
          </div>
        </div>
        <div class="sc-domain-section" style="${domainVis}">
          <div class="domain-entry">
            <div class="field"><label>Domain Name</label><input type="text" class="sc-domain1-name" value="${data.domain1Name || ""}"></div>
            <div class="field"><label>Granted Power</label><textarea class="sc-domain1-power" rows="2">${data.domain1Power || ""}</textarea></div>
          </div>
          <div class="domain-entry">
            <div class="field"><label>Domain Name</label><input type="text" class="sc-domain2-name" value="${data.domain2Name || ""}"></div>
            <div class="field"><label>Granted Power</label><textarea class="sc-domain2-power" rows="2">${data.domain2Power || ""}</textarea></div>
          </div>
        </div>
        <table class="spell-slots-table" data-max-level="${maxLevel}">
          <thead><tr>
            <th>Spell Level</th><th>Spells Known</th><th>Save DC</th><th>Spells/Day</th><th>Bonus Spells</th>
            <th class="sc-domain-col" style="${domainVis}">Domain</th>
            <th class="sc-specialist-col" style="${specVis}">Specialist</th>
            <th>Slots Used</th><th>Remaining</th>
          </tr></thead>
          <tbody>${rows.join("")}</tbody>
        </table>
        <div style="display:flex;gap:0.5rem;margin-top:0.5rem">
          <button class="btn-add sc-add-level">+ Add Spell Level</button>
          <button class="btn-add sc-reset-slots">Reset All Expended Slots</button>
        </div>
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
    const maxLevel = int(panel.querySelector(".spell-slots-table")?.dataset.maxLevel || 9);
    for (let i = 0; i <= maxLevel; i++) {
      appendSpellListDiv(container, i, i === 0);
    }

    panel.querySelector(".sc-reset-slots").addEventListener("click", () => {
      panel.querySelectorAll(".sc-used").forEach((el) => { el.value = 0; });
      recalc();
    });

    panel.querySelector(".sc-add-level").addEventListener("click", () => {
      addSpellcastingLevel(panel);
    });
  }

  function appendSpellListDiv(container, i, active) {
    const lbl = spellListLabel(i);
    const div = document.createElement("div");
    div.className = `spell-list-content${active ? " active" : ""}`;
    div.dataset.level = i;
    div.innerHTML = `
      <div class="two-column">
        <div class="column">
          <h3>${lbl} - Known/Available Spells</h3>
          <textarea class="sc-spell-text" data-lvl="${i}" rows="8" placeholder="Enter ${lbl} spells..."></textarea>
        </div>
        <div class="column">
          <h3>${lbl} - Prepared Spells</h3>
          <textarea class="sc-spell-prepared" data-lvl="${i}" rows="8" placeholder="Enter prepared ${lbl} spells. Mark used with [X]..."></textarea>
        </div>
      </div>
    `;
    container.appendChild(div);
  }

  function addSpellcastingLevel(panel) {
    const table = panel.querySelector(".spell-slots-table");
    const maxLevel = int(table?.dataset.maxLevel || 9) + 1;
    if (table) table.dataset.maxLevel = maxLevel;
    const i = maxLevel;

    // Add table row
    const domainVis = panel.querySelector(".sc-domain-toggle")?.checked ? "" : "display:none";
    const specVis = panel.querySelector(".sc-specialist-toggle")?.checked ? "" : "display:none";
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${spellOrd(i)}</td>
      <td><input type="number" class="sc-known" data-lvl="${i}" min="0"></td>
      <td><span class="sc-dc calc-field" data-lvl="${i}">--</span></td>
      <td><input type="number" class="sc-per-day" data-lvl="${i}" min="0"></td>
      <td><input type="number" class="sc-bonus" data-lvl="${i}" min="0"></td>
      <td class="sc-domain-col" style="${domainVis}"><input type="number" class="sc-domain-slots" data-lvl="${i}" min="0"></td>
      <td class="sc-specialist-col" style="${specVis}"><input type="number" class="sc-specialist-slots" data-lvl="${i}" min="0"></td>
      <td><input type="number" class="sc-used" data-lvl="${i}" min="0" value="0"></td>
      <td><span class="sc-remain calc-field" data-lvl="${i}">--</span></td>`;
    table.querySelector("tbody").appendChild(tr);

    appendDynLevelTab(panel, i);
    appendSpellListDiv(panel.querySelector(".sc-spell-lists"), i, false);
  }

  function switchLevelTab(panel, btn, lvl) {
    panel.querySelectorAll(".spell-level-tab").forEach((t) => t.classList.remove("active"));
    panel.querySelectorAll(".spell-list-content").forEach((c) => c.classList.remove("active"));
    btn.classList.add("active");
    panel.querySelectorAll(".spell-list-content").forEach((c) => { if (c.dataset.level === String(lvl)) c.classList.add("active"); });
    setTimeout(() => window.autoExpandAll && window.autoExpandAll(), 10);
  }
  function appendDynLevelTab(panel, i) {
    const btn = document.createElement("button");
    btn.className = "spell-level-tab"; btn.dataset.level = i; btn.textContent = spellShort(i);
    btn.addEventListener("click", () => switchLevelTab(panel, btn, i));
    panel.querySelector(".spell-list-tabs").appendChild(btn);
  }
  function wireLevelTabs(panel) {
    panel.querySelectorAll(".spell-level-tab").forEach((btn) => {
      btn.addEventListener("click", () => switchLevelTab(panel, btn, btn.dataset.level));
    });
  }

  function wireSpecialistDomainToggles(panel) {
    const specToggle = panel.querySelector(".sc-specialist-toggle");
    const domToggle = panel.querySelector(".sc-domain-toggle");
    const specSection = panel.querySelector(".sc-specialist-section");
    const domSection = panel.querySelector(".sc-domain-section");

    function toggleColumns(panel, colClass, show) {
      panel.querySelectorAll(`.${colClass}`).forEach((el) => {
        el.style.display = show ? "" : "none";
      });
    }

    if (specToggle && specSection) {
      specToggle.addEventListener("change", () => {
        specSection.style.display = specToggle.checked ? "" : "none";
        toggleColumns(panel, "sc-specialist-col", specToggle.checked);
      });
    }
    if (domToggle && domSection) {
      domToggle.addEventListener("change", () => {
        domSection.style.display = domToggle.checked ? "" : "none";
        toggleColumns(panel, "sc-domain-col", domToggle.checked);
      });
    }

    // Wire prohibited schools add/remove
    wireProhibitedSchools(panel);
  }

  function wireProhibitedSchools(panel) {
    const list = panel.querySelector(".sc-prohibited-list");
    if (!list) return;

    list.querySelector(".sc-add-prohibited").addEventListener("click", () => {
      addProhibitedEntry(list, "");
    });

    list.querySelectorAll(".sc-remove-prohibited").forEach((btn) => {
      btn.addEventListener("click", () => removeProhibitedEntry(btn));
    });
  }

  function addProhibitedEntry(list, value) {
    const div = document.createElement("div");
    div.className = "prohibited-entry";
    div.innerHTML = `<input type="text" class="sc-prohibited" value="${value}" placeholder="School name"><button class="btn-remove sc-remove-prohibited" title="Remove">X</button>`;
    list.insertBefore(div, list.querySelector(".sc-add-prohibited"));
    div.querySelector(".sc-remove-prohibited").addEventListener("click", () => removeProhibitedEntry(div.querySelector(".sc-remove-prohibited")));
  }

  function removeProhibitedEntry(btn) {
    const list = btn.closest(".sc-prohibited-list");
    const entries = list.querySelectorAll(".prohibited-entry");
    if (entries.length <= 1) {
      // Keep at least one entry, just clear it
      entries[0].querySelector(".sc-prohibited").value = "";
      return;
    }
    btn.closest(".prohibited-entry").remove();
  }

  // ============================================================
  // Psionics HTML builder
  // ============================================================
  // Base PP cost by power level (XPH Table 3-3)
  const PP_COSTS = [0, 1, 3, 5, 7, 9, 11, 13, 15, 17];

  function psiPPCost(i) { return PP_COSTS[i] !== undefined ? PP_COSTS[i] : (PP_COSTS[9] + (i - 9) * 2); }

  function buildPsionicsHTML(idx, data) {
    const maxLevel = data.maxLevel || 9;
    const dcRows = [];
    for (let i = 1; i <= maxLevel; i++) {
      dcRows.push(`<tr>
        <td>${spellOrd(i)}</td>
        <td class="psi-pp-cost">${psiPPCost(i)}</td>
        <td><span class="psi-dc calc-field" data-lvl="${i}">--</span></td>
      </tr>`);
    }

    const levelTabs = Array.from({ length: maxLevel }, (_, i) =>
      `<button class="spell-level-tab${i === 0 ? " active" : ""}" data-level="${i + 1}">${spellShort(i + 1)}</button>`
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
        <table class="spell-slots-table psi-dc-table" data-max-level="${maxLevel}" style="max-width:400px">
          <thead><tr><th>Power Level</th><th>Base PP Cost</th><th>Save DC</th></tr></thead>
          <tbody>${dcRows.join("")}</tbody>
        </table>
        <button class="btn-add psi-add-level" style="margin-top:0.5rem">+ Add Power Level</button>
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
    const maxLevel = int(panel.querySelector(".psi-dc-table")?.dataset.maxLevel || 9);
    for (let i = 1; i <= maxLevel; i++) {
      appendPsiPowerDiv(container, i, i === 1);
    }
    panel.querySelector(".psi-add-level").addEventListener("click", () => {
      addPsionicsLevel(panel);
    });
  }

  function appendPsiPowerDiv(container, i, active) {
    const div = document.createElement("div");
    div.className = `spell-list-content${active ? " active" : ""}`;
    div.dataset.level = i;
    div.innerHTML = `
      <h3>${spellOrd(i)} Level Powers</h3>
      <textarea class="psi-power-text" data-lvl="${i}" rows="8" placeholder="Enter ${spellOrd(i)} level powers, one per line..."></textarea>
    `;
    container.appendChild(div);
  }

  function addPsionicsLevel(panel) {
    const table = panel.querySelector(".psi-dc-table");
    const maxLevel = int(table?.dataset.maxLevel || 9) + 1;
    if (table) table.dataset.maxLevel = maxLevel;
    const i = maxLevel;

    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${spellOrd(i)}</td><td class="psi-pp-cost">${psiPPCost(i)}</td><td><span class="psi-dc calc-field" data-lvl="${i}">--</span></td>`;
    table.querySelector("tbody").appendChild(tr);

    appendDynLevelTab(panel, i);

    appendPsiPowerDiv(panel.querySelector(".psi-power-lists"), i, false);
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

  // ============================================================
  // Epic Spellcasting HTML builder
  // ============================================================
  function buildEpicHTML(idx, data) {
    const spellRows = (data.epicSpells || [""]).map((s, i) => epicSpellRow(s, i)).join("");
    return `
      <section class="section">
        <h2>Epic Spellcasting</h2>
        <div class="info-grid">
          <div class="field"><label>Slot Skill (ranks ÷ 10)</label><select class="epic-skill">
            <option value="know-arcana"${(data.epicSkill || "know-arcana") === "know-arcana" ? " selected" : ""}>Knowledge (Arcana)</option>
            <option value="know-religion"${data.epicSkill === "know-religion" ? " selected" : ""}>Knowledge (Religion)</option>
            <option value="know-nature"${data.epicSkill === "know-nature" ? " selected" : ""}>Knowledge (Nature)</option>
          </select></div>
          <div class="field field-sm"><label>Skill Ranks</label><input type="number" class="epic-skill-ranks" min="0" value="${data.epicSkillRanks || ""}"></div>
          <div class="field field-sm"><label>Slots/Day</label><span class="epic-slots-day calc-field">--</span></div>
          <div class="field field-sm"><label>Slots Used</label><input type="number" class="epic-slots-used" min="0" value="${data.epicSlotsUsed || "0"}"></div>
          <div class="field field-sm"><label>Remaining</label><span class="epic-slots-remain calc-field">--</span></div>
        </div>
        <div class="info-grid" style="margin-top:0.4rem">
          <div class="field field-sm"><label>Spellcraft Ranks</label><input type="number" class="epic-spellcraft" min="0" value="${data.epicSpellcraft || ""}" placeholder="For seed DCs"></div>
          <div class="field"><label>Conditional Modifiers</label><input type="text" class="epic-conditional" value="${data.epicConditional || ""}"></div>
        </div>
      </section>
      <section class="section">
        <h2>Epic Spells</h2>
        <div class="epic-spell-list">${spellRows}</div>
        <button class="btn-add epic-add-spell" style="margin-top:0.5rem">+ Add Epic Spell</button>
      </section>
    `;
  }

  function epicSpellRow(data = "", index = 0) {
    const d = typeof data === "object" ? data : { name: data };
    return `<div class="epic-spell-entry">
      <div class="field" style="flex:1"><label>Spell Name</label><input type="text" class="epic-spell-name" value="${d.name || ""}"></div>
      <div class="field field-sm"><label>DC</label><input type="number" class="epic-spell-dc" value="${d.dc || ""}"></div>
      <div class="field" style="flex:2"><label>Effect / Notes</label><textarea class="epic-spell-notes" rows="1">${d.notes || ""}</textarea></div>
      <button class="btn-remove epic-remove-spell" title="Remove">X</button>
    </div>`;
  }

  function wireEpicSpells(panel) {
    panel.querySelector(".epic-add-spell").addEventListener("click", () => {
      const list = panel.querySelector(".epic-spell-list");
      const div = document.createElement("div");
      div.innerHTML = epicSpellRow();
      const entry = div.firstElementChild;
      list.appendChild(entry);
      entry.querySelector(".epic-remove-spell").addEventListener("click", () => entry.remove());
    });
    panel.querySelectorAll(".epic-remove-spell").forEach((btn) => {
      btn.addEventListener("click", () => btn.closest(".epic-spell-entry").remove());
    });
  }

  // ============================================================
  // Vestige Binding HTML builder
  // ============================================================
  function buildBindingHTML(idx, data) {
    const vestigeRows = (data.vestiges || [""]).map((v, i) => vestigeRow(v)).join("");
    return `
      <section class="section">
        <h2>Vestige Binding</h2>
        <div class="info-grid">
          <div class="field field-sm"><label>Effective Binder Level</label><input type="number" class="bind-level" min="1" value="${data.binderLevel || ""}"></div>
          <div class="field field-sm"><label>Max Vestige Level</label><input type="number" class="bind-max-vestige" min="1" max="8" value="${data.maxVestige || ""}"></div>
          <div class="field field-sm"><label>Max Vestiges Bound</label><input type="number" class="bind-max-bound" min="1" value="${data.maxBound || ""}"></div>
          <div class="field field-sm"><label>Binding Check Mod</label><input type="number" class="bind-check-mod" value="${data.bindCheckMod || ""}"></div>
        </div>
        <div class="info-grid" style="margin-top:0.4rem">
          <div class="field field-sm"><label>Currently Bound</label><span class="bind-count calc-field">0</span></div>
          <div class="field"><label>Conditional Modifiers</label><input type="text" class="bind-conditional" value="${data.bindConditional || ""}"></div>
        </div>
      </section>
      <section class="section">
        <h2>Bound Vestiges</h2>
        <div class="vestige-list">${vestigeRows}</div>
        <button class="btn-add bind-add-vestige" style="margin-top:0.5rem">+ Add Vestige</button>
      </section>
    `;
  }

  function vestigeRow(data = "") {
    const d = typeof data === "object" ? data : { name: data };
    return `<div class="vestige-entry">
      <div class="vestige-header">
        <div class="field" style="flex:1"><label>Vestige Name</label><input type="text" class="vestige-name" value="${d.name || ""}"></div>
        <div class="field field-sm"><label>Level</label><input type="number" class="vestige-level" min="1" max="8" value="${d.level || ""}"></div>
        <div class="field field-sm"><label>Binding DC</label><input type="number" class="vestige-dc" value="${d.dc || ""}"></div>
        <label class="mi-toggle"><input type="checkbox" class="vestige-good-pact"${d.goodPact ? " checked" : ""}> Good Pact</label>
        <button class="btn-remove bind-remove-vestige" title="Remove">X</button>
      </div>
      <div class="field"><label>Granted Abilities</label><textarea class="vestige-abilities" rows="2">${d.abilities || ""}</textarea></div>
      <div class="vestige-pact-info" style="${d.goodPact ? "display:none" : ""}">
        <div class="field"><label>Sign &amp; Influence</label><input type="text" class="vestige-sign" value="${d.sign || ""}"></div>
      </div>
    </div>`;
  }

  function wireBindingVestiges(panel) {
    panel.querySelector(".bind-add-vestige").addEventListener("click", () => {
      const list = panel.querySelector(".vestige-list");
      const div = document.createElement("div");
      div.innerHTML = vestigeRow();
      const entry = div.firstElementChild;
      list.appendChild(entry);
      wireVestigeEntry(entry);
      recalcBindCount(panel);
    });
    panel.querySelectorAll(".vestige-entry").forEach((entry) => wireVestigeEntry(entry));
  }

  function wireVestigeEntry(entry) {
    entry.querySelector(".bind-remove-vestige").addEventListener("click", () => {
      const panel = entry.closest(".inner-tab-content");
      entry.remove();
      recalcBindCount(panel);
    });
    const goodPact = entry.querySelector(".vestige-good-pact");
    const pactInfo = entry.querySelector(".vestige-pact-info");
    goodPact.addEventListener("change", () => {
      pactInfo.style.display = goodPact.checked ? "none" : "";
    });
  }

  function recalcBindCount(panel) {
    const count = panel.querySelectorAll(".vestige-entry").length;
    const el = panel.querySelector(".bind-count");
    const max = int(panel.querySelector(".bind-max-bound")?.value);
    if (el) {
      el.textContent = count;
      el.classList.toggle("counter-over", max > 0 && count > max);
    }
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
      const maxLevel = int(panel.querySelector(".spell-slots-table")?.dataset.maxLevel || 9);

      for (let i = 0; i <= maxLevel; i++) {
        const dcEl = panel.querySelector(`.sc-dc[data-lvl="${i}"]`);
        if (dcEl) dcEl.textContent = ability ? 10 + i + abilityMod : "--";

        const perDay = int(panel.querySelector(`.sc-per-day[data-lvl="${i}"]`)?.value);
        const bonus = int(panel.querySelector(`.sc-bonus[data-lvl="${i}"]`)?.value);
        const domain = int(panel.querySelector(`.sc-domain-slots[data-lvl="${i}"]`)?.value);
        const specialist = int(panel.querySelector(`.sc-specialist-slots[data-lvl="${i}"]`)?.value);
        const used = int(panel.querySelector(`.sc-used[data-lvl="${i}"]`)?.value);
        const totalSlots = perDay + bonus + domain + specialist;
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
      const maxLevel = int(panel.querySelector(".psi-dc-table")?.dataset.maxLevel || 9);

      for (let i = 1; i <= maxLevel; i++) {
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

    recalcEpicAndBinding();
  }

  function resetSlots() {
    $$(".sc-used").forEach((el) => { el.value = 0; });
  }

  function recalcEpicAndBinding() {
    // Epic spellcasting: slots/day = floor(ranks / 10) per ELH p.72
    $$("[data-caster-type='epic']").forEach((panel) => {
      const ranks = int(panel.querySelector(".epic-skill-ranks")?.value);
      const slotsDay = Math.floor(ranks / 10);
      const used = int(panel.querySelector(".epic-slots-used")?.value);
      const remaining = slotsDay - used;
      const dayEl = panel.querySelector(".epic-slots-day");
      if (dayEl) dayEl.textContent = ranks > 0 ? slotsDay : "--";
      const remainEl = panel.querySelector(".epic-slots-remain");
      if (remainEl) {
        if (slotsDay > 0) {
          remainEl.textContent = remaining;
          remainEl.classList.remove("spell-remain-zero", "spell-remain-low");
          if (remaining <= 0) remainEl.classList.add("spell-remain-zero");
        } else {
          remainEl.textContent = "--";
          remainEl.classList.remove("spell-remain-zero", "spell-remain-low");
        }
      }
    });

    // Binding: count bound vestiges
    $$("[data-caster-type='binding']").forEach((panel) => {
      recalcBindCount(panel);
    });
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
        caster.specialist = panel.querySelector(".sc-specialist-toggle")?.checked || false;
        caster.specialtySchool = panel.querySelector(".sc-specialty-school")?.value || "";
        caster.prohibitedSchools = Array.from(panel.querySelectorAll(".sc-prohibited")).map((el) => el.value).filter((v) => v);
        caster.domainAccess = panel.querySelector(".sc-domain-toggle")?.checked || false;
        caster.domain1Name = panel.querySelector(".sc-domain1-name")?.value || "";
        caster.domain1Power = panel.querySelector(".sc-domain1-power")?.value || "";
        caster.domain2Name = panel.querySelector(".sc-domain2-name")?.value || "";
        caster.domain2Power = panel.querySelector(".sc-domain2-power")?.value || "";
        const scMax = int(panel.querySelector(".spell-slots-table")?.dataset.maxLevel || 9);
        caster.maxLevel = scMax;
        for (let i = 0; i <= scMax; i++) {
          caster[`known-${i}`] = panel.querySelector(`.sc-known[data-lvl="${i}"]`)?.value || "";
          caster[`perDay-${i}`] = panel.querySelector(`.sc-per-day[data-lvl="${i}"]`)?.value || "";
          caster[`bonus-${i}`] = panel.querySelector(`.sc-bonus[data-lvl="${i}"]`)?.value || "";
          caster[`used-${i}`] = panel.querySelector(`.sc-used[data-lvl="${i}"]`)?.value || "0";
          caster[`text-${i}`] = panel.querySelector(`.sc-spell-text[data-lvl="${i}"]`)?.value || "";
          caster[`prepared-${i}`] = panel.querySelector(`.sc-spell-prepared[data-lvl="${i}"]`)?.value || "";
          if (i >= 1) {
            caster[`domain-${i}`] = panel.querySelector(`.sc-domain-slots[data-lvl="${i}"]`)?.value || "";
            caster[`specialist-${i}`] = panel.querySelector(`.sc-specialist-slots[data-lvl="${i}"]`)?.value || "";
          }
        }
      } else if (type === "psionics") {
        caster.discipline = panel.querySelector(".psi-discipline")?.value || "";
        caster.manifesterLevel = panel.querySelector(".psi-manifester-level")?.value || "";
        caster.ppBase = panel.querySelector(".psi-pp-base")?.value || "";
        caster.ppSpent = panel.querySelector(".psi-pp-spent")?.value || "0";
        caster.powersKnown = panel.querySelector(".psi-powers-known")?.value || "";
        caster.ability = panel.querySelector(".psi-ability")?.value || "";
        const psiMax = int(panel.querySelector(".psi-dc-table")?.dataset.maxLevel || 9);
        caster.maxLevel = psiMax;
        for (let i = 1; i <= psiMax; i++) {
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
      } else if (type === "epic") {
        caster.epicSkill = panel.querySelector(".epic-skill")?.value || "spellcraft";
        caster.epicSkillRanks = panel.querySelector(".epic-skill-ranks")?.value || "";
        caster.epicSlotsUsed = panel.querySelector(".epic-slots-used")?.value || "0";
        caster.epicSpellcraft = panel.querySelector(".epic-spellcraft")?.value || "";
        caster.epicConditional = panel.querySelector(".epic-conditional")?.value || "";
        caster.epicSpells = Array.from(panel.querySelectorAll(".epic-spell-entry")).map((entry) => ({
          name: entry.querySelector(".epic-spell-name")?.value || "",
          dc: entry.querySelector(".epic-spell-dc")?.value || "",
          notes: entry.querySelector(".epic-spell-notes")?.value || "",
        }));
      } else if (type === "binding") {
        caster.binderLevel = panel.querySelector(".bind-level")?.value || "";
        caster.maxVestige = panel.querySelector(".bind-max-vestige")?.value || "";
        caster.maxBound = panel.querySelector(".bind-max-bound")?.value || "";
        caster.bindCheckMod = panel.querySelector(".bind-check-mod")?.value || "";
        caster.bindConditional = panel.querySelector(".bind-conditional")?.value || "";
        caster.vestiges = Array.from(panel.querySelectorAll(".vestige-entry")).map((entry) => ({
          name: entry.querySelector(".vestige-name")?.value || "",
          level: entry.querySelector(".vestige-level")?.value || "",
          dc: entry.querySelector(".vestige-dc")?.value || "",
          goodPact: entry.querySelector(".vestige-good-pact")?.checked || false,
          abilities: entry.querySelector(".vestige-abilities")?.value || "",
          sign: entry.querySelector(".vestige-sign")?.value || "",
        }));
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
      // Migrate legacy domain/specialty data from class features into first spellcasting caster
      let legacyMigrated = false;
      data.casters.forEach((caster) => {
        if (!legacyMigrated && caster.type === "spellcasting" && !caster.specialist && !caster.domainAccess) {
          if (data["domain1-name"] || data["specialty-school"]) {
            if (data["specialty-school"]) {
              caster.specialist = true;
              caster.specialtySchool = data["specialty-school"];
              caster.prohibited1 = data["prohibited1"] || "";
              caster.prohibited2 = data["prohibited2"] || "";
            }
            if (data["domain1-name"]) {
              caster.domainAccess = true;
              caster.domain1Name = data["domain1-name"];
              caster.domain1Power = data["domain1-power"] || "";
              caster.domain2Name = data["domain2-name"] || "";
              caster.domain2Power = data["domain2-power"] || "";
            }
            legacyMigrated = true;
          }
        }
      });
      data.casters.forEach((caster) => {
        const idx = addCaster(caster.type, caster);
        const panel = $(`#caster-${idx}`);
        if (!panel) return;

        if (caster.type === "spellcasting") {
          const scMax = int(caster.maxLevel || 9);
          for (let i = 0; i <= scMax; i++) {
            const textEl = panel.querySelector(`.sc-spell-text[data-lvl="${i}"]`);
            if (textEl && caster[`text-${i}`]) textEl.value = caster[`text-${i}`];
            const prepEl = panel.querySelector(`.sc-spell-prepared[data-lvl="${i}"]`);
            if (prepEl && caster[`prepared-${i}`]) prepEl.value = caster[`prepared-${i}`];
          }
        } else if (caster.type === "psionics") {
          const psiMax = int(caster.maxLevel || 9);
          for (let i = 1; i <= psiMax; i++) {
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
