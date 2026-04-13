// D&D 3.5 Character Sheet - Class Features Tab Module

const ClassFeatures = (function () {
  "use strict";

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);
  const int = (v) => parseInt(v) || 0;

  const FIELDS = [
    "turn-per-day", "turn-check", "turn-damage",
    "rage-per-day", "rage-duration", "rage-str-con", "rage-will", "rage-ac",
    "rage-used", "rage-rounds",
  ];

  // ============================================================
  // Active Bonuses (bonus layer for rage, future: equipment, etc.)
  // Returns { abilities: { STR: N, CON: N, ... }, saves: { will: N, ... }, ac: N }
  // ============================================================
  function getActiveBonuses() {
    const bonuses = { abilities: {}, saves: {}, ac: 0 };

    // Rage toggle
    const rageActive = $("#rage-active");
    if (rageActive && rageActive.checked) {
      const strCon = int($("#rage-str-con")?.value) || 0;
      const willBonus = int($("#rage-will")?.value) || 0;
      const acPenalty = int($("#rage-ac")?.value) || 0;

      if (strCon) {
        bonuses.abilities.STR = (bonuses.abilities.STR || 0) + strCon;
        bonuses.abilities.CON = (bonuses.abilities.CON || 0) + strCon;
      }
      if (willBonus) bonuses.saves.will = (bonuses.saves.will || 0) + willBonus;
      if (acPenalty) bonuses.ac += acPenalty;
    }

    return bonuses;
  }


  // ============================================================
  // Collect / Load
  // ============================================================
  function collectData() {
    const data = {};
    FIELDS.forEach((id) => {
      const el = $(`#${id}`);
      if (el) data[id] = el.value;
    });
    data["rage-active"] = $("#rage-active")?.checked || false;

    data.notes = $("#notes").value;

    return data;
  }

  function loadData(data) {
    FIELDS.forEach((id) => {
      const el = $(`#${id}`);
      if (el && data[id] !== undefined) el.value = data[id];
    });

    const rageActive = $("#rage-active");
    if (rageActive) rageActive.checked = data["rage-active"] || false;

    if (data.notes !== undefined) $("#notes").value = data.notes;
  }

  // ============================================================
  // Public API
  // ============================================================
  return { getActiveBonuses, collectData, loadData };
})();
