// D&D 3.5 Character Sheet - Class Features Tab Module

const ClassFeatures = (function () {
  "use strict";

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);
  const int = (v) => parseInt(v) || 0;

  const FIELDS = [
    "turn-per-day", "turn-check", "turn-damage",
    "domain1-name", "domain1-power", "domain2-name", "domain2-power",
    "specialty-school", "prohibited1", "prohibited2",
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

  let soulmeldCount = 0;

  // ============================================================
  // Soulmelds
  // ============================================================
  function addSoulmeld(data = {}) {
    const container = $("#soulmelds-container");
    const div = document.createElement("div");
    div.className = "soulmeld-entry";
    soulmeldCount++;
    div.innerHTML = `
      <div class="soulmeld-row">
        <div class="field"><label>Soulmeld</label><input type="text" class="sm-name" value="${data.name || ""}"></div>
        <div class="field field-sm"><label>Chakra</label><input type="text" class="sm-chakra" value="${data.chakra || ""}"></div>
        <button class="btn-remove" style="align-self:flex-end" onclick="this.closest('.soulmeld-entry').remove()">X</button>
      </div>
      <div class="soulmeld-row">
        <div class="field"><label>Base Effect</label><input type="text" class="sm-base" value="${data.base || ""}"></div>
      </div>
      <div class="soulmeld-row">
        <div class="field"><label>Bind Effect</label><input type="text" class="sm-bind" value="${data.bind || ""}"></div>
      </div>
      <div class="soulmeld-row">
        <div class="field"><label>Essentia Effect</label><input type="text" class="sm-essentia-effect" value="${data.essentiaEffect || ""}"></div>
      </div>
      <div class="essentia-pips">
        <label>Essentia:</label>
        ${[1, 2, 3, 4, 5, 6]
          .map(
            (n) => `<button class="essentia-pip${data.essentia >= n ? " filled" : ""}" data-pip="${n}" onclick="ClassFeatures.togglePip(this)"></button>`
          )
          .join("")}
      </div>
    `;
    container.appendChild(div);
  }

  function togglePip(btn) {
    const pip = int(btn.dataset.pip);
    const pips = btn.parentElement.querySelectorAll(".essentia-pip");
    const currentlyFilled = btn.classList.contains("filled");
    pips.forEach((p) => {
      const pVal = int(p.dataset.pip);
      if (currentlyFilled) {
        if (pVal >= pip) p.classList.remove("filled");
      } else {
        if (pVal <= pip) p.classList.add("filled");
      }
    });
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

    data.soulmelds = [];
    $$(".soulmeld-entry").forEach((entry) => {
      const pips = entry.querySelectorAll(".essentia-pip.filled");
      data.soulmelds.push({
        name: entry.querySelector(".sm-name").value,
        chakra: entry.querySelector(".sm-chakra").value,
        base: entry.querySelector(".sm-base").value,
        bind: entry.querySelector(".sm-bind").value,
        essentiaEffect: entry.querySelector(".sm-essentia-effect").value,
        essentia: pips.length,
      });
    });

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

    $("#soulmelds-container").innerHTML = "";
    soulmeldCount = 0;
    if (data.soulmelds) data.soulmelds.forEach((sm) => addSoulmeld(sm));
  }

  function resetSoulmelds() {
    $("#soulmelds-container").innerHTML = "";
    soulmeldCount = 0;
  }

  // ============================================================
  // Public API
  // ============================================================
  return { addSoulmeld, togglePip, getActiveBonuses, collectData, loadData, resetSoulmelds };
})();
