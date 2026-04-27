// D&D 3.5 Character Sheet - Main Application (coordinator)
// Delegates tab-specific logic to: character.js, skills.js, equipment.js,
// spells.js, feats.js, companion.js, class-features.js

(function () {
  "use strict";

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  // ============================================================
  // Auto-expanding textareas
  // ============================================================
  function autoExpand(el) {
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }

  document.addEventListener("input", (e) => {
    if (e.target.tagName === "TEXTAREA") autoExpand(e.target);
  });

  function autoExpandAll() {
    $$("textarea").forEach((ta) => autoExpand(ta));
  }

  // Expose for use by other modules (e.g., spells.js sub-tab switching)
  window.autoExpand = autoExpand;
  window.autoExpandAll = autoExpandAll;

  // ============================================================
  // Tab navigation
  // ============================================================
  $$(".tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      $$(".tab").forEach((t) => t.classList.remove("active"));
      $$(".tab-content").forEach((c) => c.classList.remove("active"));
      btn.classList.add("active");
      $(`#${btn.dataset.tab}`).classList.add("active");
      setTimeout(autoExpandAll, 10);
    });
  });

  // Inner tabs for non-spells tabs (if any)
  $$(".inner-tab[data-inner]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const parent = btn.closest(".tab-content");
      parent.querySelectorAll(".inner-tab").forEach((t) => t.classList.remove("active"));
      parent.querySelectorAll(".inner-tab-content").forEach((c) => c.classList.remove("active"));
      btn.classList.add("active");
      $(`#${btn.dataset.inner}`).classList.add("active");
      setTimeout(autoExpandAll, 10);
    });
  });

  // ============================================================
  // Get ability modifier (used by multiple modules)
  // ============================================================
  function getAbilityMod(ability, abilityBonuses) {
    const ab = ability.toLowerCase();
    const temp = $(`#${ab}-temp`).value;
    const base = $(`#${ab}-score`).value;
    let score = temp !== "" ? parseInt(temp) || 0 : parseInt(base) || 0;
    if (abilityBonuses) score += abilityBonuses[ability] || 0;
    return DND35.abilityModifier(score);
  }

  // ============================================================
  // Bonus layer — collects active bonuses from all sources
  // Returns { abilities: { STR: N, ... }, saves: { will: N, ... }, ac: N }
  // ============================================================
  function collectActiveBonuses() {
    const bonuses = { abilities: {}, saves: {}, ac: 0 };

    // Class features (rage, future: other toggles)
    if (typeof ClassFeatures.getActiveBonuses === "function") {
      const cf = ClassFeatures.getActiveBonuses();
      for (const [ab, val] of Object.entries(cf.abilities || {})) {
        bonuses.abilities[ab] = (bonuses.abilities[ab] || 0) + val;
      }
      for (const [save, val] of Object.entries(cf.saves || {})) {
        bonuses.saves[save] = (bonuses.saves[save] || 0) + val;
      }
      bonuses.ac += cf.ac || 0;
    }

    // Equipment: worn item ability bonuses
    if (typeof Equipment.getActiveBonuses === "function") {
      const eq = Equipment.getActiveBonuses();
      for (const [ab, val] of Object.entries(eq.abilities || {})) {
        bonuses.abilities[ab] = (bonuses.abilities[ab] || 0) + val;
      }
    }

    return bonuses;
  }

  // ============================================================
  // Recalculate everything (orchestrator)
  // ============================================================
  function recalcAll() {
    const bonuses = collectActiveBonuses();
    const getModWithBonuses = (ability) => getAbilityMod(ability, bonuses.abilities);

    Character.recalc(getModWithBonuses, bonuses);
    Skills.recalc(getModWithBonuses);
    Spells.recalc(getModWithBonuses);
    Equipment.updatePaperDoll();

    // Visual indicator for rage
    const rageSection = $("#rage-section");
    if (rageSection) {
      rageSection.classList.toggle("rage-active", $("#rage-active")?.checked || false);
    }
  }

  // ============================================================
  // Save / Load / Export / Import
  // ============================================================
  function collectData() {
    return Object.assign({},
      Character.collectData(),
      Equipment.collectData(),
      Spells.collectData(),
      Feats.collectData(),
      Companion.collectData(),
      ClassFeatures.collectData(),
      { skills: Skills.collectData(), customSkills: Skills.collectCustomSkills() }
    );
  }

  function loadData(data) {
    if (!data) return;
    Character.loadData(data, getAbilityMod);
    Equipment.loadData(data);
    Spells.loadData(data);
    Feats.loadData(data);
    Companion.loadData(data);
    ClassFeatures.loadData(data);
    if (data.skills) Skills.loadData(data.skills, getAbilityMod);
    Skills.loadCustomSkills(data.customSkills || [], getAbilityMod);
    recalcAll();
    setTimeout(autoExpandAll, 20);
  }

  // ---- LocalStorage management ----
  const STORAGE_KEY = "dnd35_characters";

  function getSavedCharacters() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    } catch {
      return {};
    }
  }

  function updateCharacterSelect() {
    const select = $("#character-select");
    const chars = getSavedCharacters();
    select.innerHTML = '<option value="">-- Saved Characters --</option>';
    Object.keys(chars).sort().forEach((name) => {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      select.appendChild(opt);
    });
  }

  function saveCharacter() {
    const data = collectData();
    const name = data["char-name"] || "Unnamed Character";
    const chars = getSavedCharacters();
    chars[name] = data;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(chars));
    updateCharacterSelect();
    $("#character-select").value = name;
    showNotification(`"${name}" saved!`);
  }

  function loadCharacter(name) {
    const chars = getSavedCharacters();
    if (chars[name]) {
      loadData(chars[name]);
      showNotification(`"${name}" loaded!`);
    }
  }

  function deleteCharacter() {
    const name = $("#character-select").value;
    if (!name) return;
    if (!confirm(`Delete "${name}"?`)) return;
    const chars = getSavedCharacters();
    delete chars[name];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(chars));
    updateCharacterSelect();
    showNotification(`"${name}" deleted.`);
  }

  function exportCharacter() {
    const data = collectData();
    const name = data["char-name"] || "character";
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name.replace(/[^a-z0-9]/gi, "_")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importCharacter(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        loadData(data);
        showNotification("Character imported!");
      } catch {
        showNotification("Error: Invalid file format.", true);
      }
    };
    reader.readAsText(file);
  }

  function newCharacter() {
    if (!confirm("Start a new character? Unsaved changes will be lost.")) return;
    $$("input, select, textarea").forEach((el) => {
      if (el.type === "checkbox") el.checked = (el.id === "armor-worn" || el.id === "shield-worn");
      else if (el.tagName === "SELECT") el.selectedIndex = el.id === "char-size" ? 4 : 0;
      else el.value = el.type === "number" && el.defaultValue ? el.defaultValue : "";
    });

    Character.resetAttacks();
    Character.addAttack();
    Skills.resetCustomSkills();
    Skills.build(getAbilityMod);
    Feats.loadData({ feats: [""], specialAbilities: [""] });
    $("#gear-body").innerHTML = "";
    for (let i = 0; i < 5; i++) Equipment.addGearRow();
    $("#magic-items-container").innerHTML = "";
    Spells.loadData({});
    Companion.loadData({});

    recalcAll();
    showNotification("New character sheet ready.");
  }

  // ============================================================
  // Notifications
  // ============================================================
  function showNotification(msg, isError = false) {
    let notif = $("#notification");
    if (!notif) {
      notif = document.createElement("div");
      notif.id = "notification";
      notif.style.cssText = `
        position: fixed; bottom: 1rem; right: 1rem; padding: 0.75rem 1.25rem;
        border-radius: 6px; font-size: 0.85rem; font-weight: 600;
        z-index: 1000; transition: opacity 0.3s; pointer-events: none;
      `;
      document.body.appendChild(notif);
    }
    notif.style.background = isError ? "#f44336" : "#4caf50";
    notif.style.color = "white";
    notif.textContent = msg;
    notif.style.opacity = "1";
    setTimeout(() => (notif.style.opacity = "0"), 2500);
  }

  // ============================================================
  // Event wiring
  // ============================================================
  $("#btn-save").addEventListener("click", saveCharacter);
  $("#btn-export").addEventListener("click", exportCharacter);
  $("#btn-import").addEventListener("click", () => $("#file-import").click());
  $("#file-import").addEventListener("change", (e) => {
    if (e.target.files[0]) importCharacter(e.target.files[0]);
    e.target.value = "";
  });
  $("#btn-new").addEventListener("click", newCharacter);
  $("#btn-delete").addEventListener("click", deleteCharacter);
  $("#character-select").addEventListener("change", (e) => {
    if (e.target.value) loadCharacter(e.target.value);
  });
  $("#btn-add-spellcasting").addEventListener("click", () => Spells.addCaster("spellcasting"));
  $("#btn-add-psionics").addEventListener("click", () => Spells.addCaster("psionics"));
  $("#btn-add-maneuvers").addEventListener("click", () => Spells.addCaster("maneuvers"));
  $("#btn-add-epic").addEventListener("click", () => Spells.addCaster("epic"));
  $("#btn-add-binding").addEventListener("click", () => Spells.addCaster("binding"));
  $("#btn-add-shadowcaster").addEventListener("click", () => Spells.addCaster("shadowcaster"));
  $("#btn-add-companion").addEventListener("click", () => Companion.addCompanion());
  $("#btn-add-attack").addEventListener("click", () => Character.addAttack());
  $("#btn-add-feat").addEventListener("click", () => Feats.addFeat());
  $("#btn-add-special-ability").addEventListener("click", () => Feats.addSpecialAbility());
  $("#btn-add-gear").addEventListener("click", () => Equipment.addGearRow());
  $("#btn-add-magic-item").addEventListener("click", () => Equipment.addMagicItem());
  $("#btn-add-custom-skill").addEventListener("click", () => Skills.addCustomSkill());

  // Auto-recalc on any input change in relevant tabs
  document.addEventListener("input", (e) => {
    const target = e.target;
    if (
      target.closest("#tab-character") ||
      target.closest("#tab-equipment") ||
      target.closest("#tab-spells") ||
      target.closest("#tab-class-features") ||
      target.id === "char-level"
    ) {
      recalcAll();
    }
  });

  // Also recalc on change events (dropdowns, checkboxes)
  $("#char-size").addEventListener("change", recalcAll);
  $("#armor-worn").addEventListener("change", recalcAll);
  $("#shield-worn").addEventListener("change", recalcAll);
  $("#armor-touch-ac").addEventListener("change", recalcAll);
  $("#shield-touch-ac").addEventListener("change", recalcAll);
  $("#rage-active").addEventListener("change", recalcAll);
  document.addEventListener("change", (e) => {
    if (e.target.closest("#tab-equipment") || e.target.closest("#tab-spells")) recalcAll();
  });

  // ============================================================
  // Initialize
  // ============================================================
  Skills.build(getAbilityMod);
  Equipment.buildMagicItemSlots();

  Character.addAttack();
  for (let i = 0; i < 5; i++) Equipment.addGearRow();
  Feats.addFeat();
  Feats.addSpecialAbility();
  Companion.loadData({});

  updateCharacterSelect();
  recalcAll();

  // Ctrl+S to save
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
      e.preventDefault();
      saveCharacter();
    }
  });

  // Initial auto-expand
  setTimeout(autoExpandAll, 50);
})();
