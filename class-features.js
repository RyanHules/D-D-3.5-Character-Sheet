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
  return { addSoulmeld, togglePip, collectData, loadData, resetSoulmelds };
})();
