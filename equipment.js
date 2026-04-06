// D&D 3.5 Character Sheet - Equipment Tab Module

const Equipment = (function () {
  "use strict";

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  // ============================================================
  // Gear rows
  // ============================================================
  function addGearRow(data = {}) {
    const tbody = $("#gear-body");
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><input type="text" class="gear-name" value="${data.name || ""}" placeholder="Item name"></td>
      <td><input type="text" class="gear-location" value="${data.location || ""}" placeholder="Location"></td>
      <td><input type="number" class="gear-weight" value="${data.weight || ""}" min="0" step="0.1" style="width:70px"></td>
      <td><button class="btn-remove" onclick="this.closest('tr').remove(); Equipment.recalcWeight();">X</button></td>
    `;
    tbody.appendChild(tr);
    tr.querySelector(".gear-weight").addEventListener("input", recalcWeight);
  }

  // ============================================================
  // Protective Items
  // ============================================================
  const BONUS_TYPES = [
    "Untyped", "Deflection", "Dodge", "Natural Armor", "Sacred", "Profane",
    "Insight", "Luck", "Morale", "Circumstance", "Enhancement", "Shield", "Armor",
  ];

  function addProtectiveItem(data = {}) {
    const container = $("#protective-items-container");
    const div = document.createElement("div");
    div.className = "protective-entry";

    const typeOptions = BONUS_TYPES.map((t) =>
      `<option value="${t}"${t === (data.type || "Untyped") ? " selected" : ""}>${t}</option>`
    ).join("");

    div.innerHTML = `
      <div class="prot-row">
        <div class="field" style="flex:2"><label>Item</label><input type="text" class="prot-name" value="${data.name || ""}"></div>
        <div class="field field-sm"><label>AC Bonus</label><input type="number" class="prot-ac" value="${data.ac || "0"}"></div>
        <div class="field field-sm"><label>Bonus Type</label><select class="prot-type">${typeOptions}</select></div>
        <div class="field field-sm"><label>Weight</label><input type="number" class="prot-weight" value="${data.weight || ""}" step="0.1"></div>
        <button class="btn-remove" style="align-self:flex-end" onclick="this.closest('.protective-entry').remove()">X</button>
      </div>
      <div class="prot-row">
        <div class="field" style="flex:2"><label>Special</label><input type="text" class="prot-special" value="${data.special || ""}"></div>
        <label class="prot-toggle"><input type="checkbox" class="prot-touch" ${data.touch ? "checked" : ""}> Applies to Touch AC</label>
        <label class="prot-toggle"><input type="checkbox" class="prot-flatfooted" ${data.flatfooted !== false ? "checked" : ""}> Applies to Flat-Footed AC</label>
      </div>
    `;
    container.appendChild(div);
  }

  // ============================================================
  // Magic Item Slots
  // ============================================================
  function buildMagicItemSlots() {
    const grid = $("#magic-items-grid");
    grid.innerHTML = "";
    DND35.itemSlots.forEach((slot) => {
      const div = document.createElement("div");
      div.className = "magic-item-slot";
      div.innerHTML = `
        <label>${slot.label}</label>
        <div class="slot-desc">${slot.description}</div>
        <input type="text" id="slot-${slot.id}" placeholder="Item name">
      `;
      grid.appendChild(div);
    });
  }

  // ============================================================
  // Weight recalculation
  // ============================================================
  function recalcWeight() {
    let totalWeight = 0;
    $$("#gear-body tr").forEach((row) => {
      totalWeight += parseFloat(row.querySelector(".gear-weight")?.value) || 0;
    });
    totalWeight += parseFloat($("#armor-weight").value) || 0;
    totalWeight += parseFloat($("#shield-weight").value) || 0;
    $("#total-weight").textContent = totalWeight.toFixed(1);
  }

  // ============================================================
  // Collect / Load
  // ============================================================
  function collectData() {
    const data = {};

    // Armor & shield fields
    [
      "armor-name", "armor-type", "armor-ac-bonus", "armor-max-dex",
      "armor-check-pen", "armor-spell-fail", "armor-speed", "armor-weight", "armor-special",
      "shield-name", "shield-ac-bonus", "shield-weight", "shield-check-pen",
      "shield-spell-fail", "shield-special",
    ].forEach((id) => {
      data[id] = $(`#${id}`).value;
    });

    // Worn state
    data["armor-worn"] = $("#armor-worn").checked;
    data["shield-worn"] = $("#shield-worn").checked;

    // Protective items
    data.protectiveItems = [];
    $$(".protective-entry").forEach((entry) => {
      data.protectiveItems.push({
        name: entry.querySelector(".prot-name").value,
        ac: entry.querySelector(".prot-ac").value,
        type: entry.querySelector(".prot-type").value,
        weight: entry.querySelector(".prot-weight").value,
        special: entry.querySelector(".prot-special").value,
        touch: entry.querySelector(".prot-touch").checked,
        flatfooted: entry.querySelector(".prot-flatfooted").checked,
      });
    });

    // Magic item slots
    DND35.itemSlots.forEach((slot) => {
      data[`slot-${slot.id}`] = $(`#slot-${slot.id}`).value;
    });

    // Gear
    data.gear = [];
    $$("#gear-body tr").forEach((row) => {
      data.gear.push({
        name: row.querySelector(".gear-name").value,
        location: row.querySelector(".gear-location").value,
        weight: row.querySelector(".gear-weight").value,
      });
    });

    // Money
    ["money-cp", "money-sp", "money-gp", "money-pp"].forEach((id) => {
      data[id] = $(`#${id}`).value;
    });

    return data;
  }

  function loadData(data) {
    // Armor & shield fields
    [
      "armor-name", "armor-type", "armor-ac-bonus", "armor-max-dex",
      "armor-check-pen", "armor-spell-fail", "armor-speed", "armor-weight", "armor-special",
      "shield-name", "shield-ac-bonus", "shield-weight", "shield-check-pen",
      "shield-spell-fail", "shield-special",
      "money-cp", "money-sp", "money-gp", "money-pp",
    ].forEach((id) => {
      const el = $(`#${id}`);
      if (el && data[id] !== undefined) el.value = data[id];
    });

    // Worn state (default to true)
    $("#armor-worn").checked = data["armor-worn"] !== undefined ? data["armor-worn"] : true;
    $("#shield-worn").checked = data["shield-worn"] !== undefined ? data["shield-worn"] : true;

    // Magic item slots
    DND35.itemSlots.forEach((slot) => {
      const key = `slot-${slot.id}`;
      if (data[key] !== undefined) $(`#${key}`).value = data[key];
    });

    // Gear
    $("#gear-body").innerHTML = "";
    if (data.gear) data.gear.forEach((g) => addGearRow(g));

    // Protective items
    $("#protective-items-container").innerHTML = "";
    if (data.protectiveItems) data.protectiveItems.forEach((p) => addProtectiveItem(p));
  }

  // ============================================================
  // Get raw protective item data for AC calculation
  // ============================================================
  function getProtectiveItems() {
    const items = [];
    $$(".protective-entry").forEach((entry) => {
      const ac = parseInt(entry.querySelector(".prot-ac").value) || 0;
      if (ac === 0) return;
      items.push({
        type: entry.querySelector(".prot-type").value || "Untyped",
        ac,
        touch: entry.querySelector(".prot-touch").checked,
        flatfooted: entry.querySelector(".prot-flatfooted").checked,
      });
    });
    return items;
  }

  // ============================================================
  // Public API
  // ============================================================
  return {
    addGearRow, addProtectiveItem, buildMagicItemSlots,
    recalcWeight, getProtectiveItems, collectData, loadData,
  };
})();
