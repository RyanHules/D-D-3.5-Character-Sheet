// D&D 3.5 Character Sheet Application

(function () {
  "use strict";

  // ============================================================
  // Utility helpers
  // ============================================================
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);
  const int = (v) => parseInt(v) || 0;
  const fmt = (n) => (n >= 0 ? "+" + n : String(n));

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

  // ============================================================
  // Tab navigation
  // ============================================================
  $$(".tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      $$(".tab").forEach((t) => t.classList.remove("active"));
      $$(".tab-content").forEach((c) => c.classList.remove("active"));
      btn.classList.add("active");
      $(`#${btn.dataset.tab}`).classList.add("active");
      // Re-expand textareas when switching tabs (they may have been hidden)
      setTimeout(autoExpandAll, 10);
    });
  });

  // Inner tabs (Spellcasting / Psionics)
  $$(".inner-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      const parent = btn.closest(".tab-content");
      parent.querySelectorAll(".inner-tab").forEach((t) => t.classList.remove("active"));
      parent.querySelectorAll(".inner-tab-content").forEach((c) => c.classList.remove("active"));
      btn.classList.add("active");
      $(`#${btn.dataset.inner}`).classList.add("active");
      setTimeout(autoExpandAll, 10);
    });
  });

  // Spell level sub-tabs
  $$(".spell-level-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      $$(".spell-level-tab").forEach((t) => t.classList.remove("active"));
      $$(".spell-list-content").forEach((c) => c.classList.remove("active"));
      btn.classList.add("active");
      $(`#spell-list-${btn.dataset.level}`).classList.add("active");
      setTimeout(autoExpandAll, 10);
    });
  });

  // ============================================================
  // Get ability modifier (uses temp if available, else base)
  // ============================================================
  function getAbilityMod(ability) {
    const ab = ability.toLowerCase();
    const temp = $(`#${ab}-temp`).value;
    const base = $(`#${ab}-score`).value;
    const score = temp !== "" ? int(temp) : int(base);
    return DND35.abilityModifier(score);
  }

  function getBaseAbilityMod(ability) {
    const ab = ability.toLowerCase();
    return DND35.abilityModifier(int($(`#${ab}-score`).value));
  }

  // ============================================================
  // Recalculate everything
  // ============================================================
  function recalcAll() {
    // Ability modifiers
    DND35.abilities.forEach((ab) => {
      const lower = ab.toLowerCase();
      const baseScore = int($(`#${lower}-score`).value);
      const baseMod = DND35.abilityModifier(baseScore);
      $(`#${lower}-mod`).textContent = fmt(baseMod);

      const tempVal = $(`#${lower}-temp`).value;
      if (tempVal !== "") {
        const tempMod = DND35.abilityModifier(int(tempVal));
        $(`#${lower}-tempmod`).textContent = fmt(tempMod);
      } else {
        $(`#${lower}-tempmod`).textContent = "";
      }
    });

    // Size modifier
    const size = $("#char-size").value;
    const sizeData = DND35.sizes[size] || DND35.sizes["Medium"];

    // ---- Armor auto-application ----
    const armorWorn = $("#armor-worn").checked;
    const shieldWorn = $("#shield-worn").checked;
    const armorACBonus = armorWorn ? int($("#armor-ac-bonus").value) : 0;
    const shieldACBonus = shieldWorn ? int($("#shield-ac-bonus").value) : 0;
    const armorMaxDexStr = $("#armor-max-dex").value.trim();
    const armorMaxDex = armorWorn && armorMaxDexStr !== "" ? int(armorMaxDexStr) : Infinity;
    const armorCheckPen = armorWorn ? int($("#armor-check-pen").value) : 0;
    const shieldCheckPen = shieldWorn ? int($("#shield-check-pen").value) : 0;
    const armorTotalCheckPen = armorCheckPen + shieldCheckPen;
    const armorSpellFail = armorWorn ? int($("#armor-spell-fail").value) : 0;
    const shieldSpellFail = shieldWorn ? int($("#shield-spell-fail").value) : 0;
    const totalSpellFailure = armorSpellFail + shieldSpellFail;

    // Auto-set AC armor/shield fields on character tab
    $("#ac-armor").value = armorACBonus;
    $("#ac-shield").value = shieldACBonus;

    // ---- Carrying load penalties (Table 9-2, PHB p.162) ----
    // Calculate total weight and load category
    const strScore = int($("#str-score").value) || 10;
    const capacity = DND35.getCarryingCapacity(strScore);
    let totalWeight = 0;
    $$("#gear-body tr").forEach((row) => {
      totalWeight += parseFloat(row.querySelector(".gear-weight")?.value) || 0;
    });
    totalWeight += parseFloat($("#armor-weight").value) || 0;
    totalWeight += parseFloat($("#shield-weight").value) || 0;
    const loadCategory = DND35.getLoadCategory(totalWeight, capacity);
    const loadPenalties = DND35.carryingLoads[loadCategory];

    // Use worse of armor or load for max dex and check penalty (don't stack)
    const effectiveMaxDex = Math.min(armorMaxDex, loadPenalties.maxDex);
    const effectiveCheckPenalty = Math.min(armorTotalCheckPen, loadPenalties.checkPenalty);

    // Auto-set armor check penalty (effective = worse of armor or load)
    $("#armor-check-penalty").value = effectiveCheckPenalty;
    $("#armor-check-penalty-display").textContent = effectiveCheckPenalty;

    // Auto-set arcane spell failure
    $("#arcane-spell-failure").value = totalSpellFailure;
    $("#arcane-spell-failure-display").textContent = totalSpellFailure + "%";

    // Show load category
    const loadDisplayEl = $("#load-category");
    if (loadDisplayEl) {
      loadDisplayEl.textContent = loadCategory.charAt(0).toUpperCase() + loadCategory.slice(1);
      loadDisplayEl.className = `load-indicator load-${loadCategory}`;
    }

    // AC calculation with max dex cap (worse of armor or load)
    const dexMod = getAbilityMod("DEX");
    const cappedDexMod = Math.min(dexMod, effectiveMaxDex);
    const naturalArmor = int($("#ac-natural").value);
    const deflection = int($("#ac-deflection").value);
    const acMisc = int($("#ac-misc").value);
    const acSize = sizeData.acMod;

    $("#ac-dex").textContent = fmt(cappedDexMod);
    $("#ac-size").textContent = fmt(acSize);

    const acTotal = 10 + armorACBonus + shieldACBonus + cappedDexMod + acSize + naturalArmor + deflection + acMisc;
    const touchAC = 10 + cappedDexMod + acSize + deflection + acMisc;
    const flatFootedAC = 10 + armorACBonus + shieldACBonus + acSize + naturalArmor + deflection + acMisc;

    $("#ac-total").textContent = acTotal;
    $("#ac-touch").textContent = touchAC;
    $("#ac-flatfooted").textContent = flatFootedAC;

    // Saving throws
    const saveMappings = [
      { prefix: "fort", ability: "CON" },
      { prefix: "ref", ability: "DEX" },
      { prefix: "will", ability: "WIS" },
    ];

    saveMappings.forEach(({ prefix, ability }) => {
      const abilityMod = getAbilityMod(ability);
      $(`#${prefix}-ability`).textContent = fmt(abilityMod);
      const total =
        int($(`#${prefix}-base`).value) +
        abilityMod +
        int($(`#${prefix}-magic`).value) +
        int($(`#${prefix}-misc`).value) +
        int($(`#${prefix}-temp`).value);
      $(`#${prefix}-total`).textContent = fmt(total);
    });

    // Initiative
    const initDex = getAbilityMod("DEX");
    $("#init-dex").textContent = fmt(initDex);
    const initTotal = initDex + int($("#init-misc").value);
    $("#init-total").textContent = fmt(initTotal);

    // Grapple
    const babNum = int($("#bab-numeric").value);
    const strMod = getAbilityMod("STR");
    const grappleSize = sizeData.grappleMod;

    $("#grapple-bab").textContent = fmt(babNum);
    $("#grapple-str").textContent = fmt(strMod);
    $("#grapple-size").textContent = fmt(grappleSize);
    const grappleTotal = babNum + strMod + grappleSize + int($("#grapple-misc").value);
    $("#grapple-total").textContent = fmt(grappleTotal);

    // Max skill ranks
    const level = int($("#char-level").value) || 1;
    const maxClassRanks = level + 3;
    const maxCrossClassRanks = (level + 3) / 2;
    $("#max-class-ranks").textContent = maxClassRanks;
    $("#max-crossclass-ranks").textContent = maxCrossClassRanks;

    // Skills
    recalcSkills();

    // Carrying capacity (strScore, capacity already computed above)
    $("#carry-light").textContent = `0-${capacity[0]} lb.`;
    $("#carry-medium").textContent = `${capacity[0] + 1}-${capacity[1]} lb.`;
    $("#carry-heavy").textContent = `${capacity[1] + 1}-${capacity[2]} lb.`;
    $("#carry-overhead").textContent = `${capacity[2]} lb.`;
    $("#carry-offground").textContent = `${capacity[2] * 2} lb.`;
    $("#carry-drag").textContent = `${capacity[2] * 5} lb.`;

    // Total gear weight (include armor & shield weight)
    recalcWeight();

    // Spell DCs & slot tracking
    const spellDCMod = int($("#spell-dc-mod").value);
    for (let i = 0; i <= 9; i++) {
      $(`#spell-dc-${i}`).textContent = 10 + i + spellDCMod;
      // Remaining slots
      const perDay = int($(`#spell-per-day-${i}`).value);
      const bonus = int($(`#spell-bonus-${i}`).value);
      const used = int($(`#spell-used-${i}`).value);
      const totalSlots = perDay + bonus;
      const remaining = totalSlots - used;
      const el = $(`#spell-remain-${i}`);
      if (totalSlots > 0) {
        el.textContent = remaining;
        el.classList.remove("spell-remain-zero", "spell-remain-low");
        if (remaining <= 0) el.classList.add("spell-remain-zero");
        else if (remaining <= Math.ceil(totalSlots * 0.25)) el.classList.add("spell-remain-low");
      } else {
        el.textContent = "--";
        el.classList.remove("spell-remain-zero", "spell-remain-low");
      }
    }

    // Psionic PP remaining
    const ppDay = int($("#psi-pp-day").value);
    const ppSpent = int($("#psi-pp-spent").value);
    const ppRemainEl = $("#psi-pp-remaining");
    if (ppDay > 0) {
      ppRemainEl.textContent = ppDay - ppSpent;
    } else {
      ppRemainEl.textContent = "--";
    }
  }

  function recalcSkills() {
    Skills.recalc(getAbilityMod);
  }

  function recalcWeight() {
    let totalWeight = 0;
    $$("#gear-body tr").forEach((row) => {
      totalWeight += parseFloat(row.querySelector(".gear-weight")?.value) || 0;
    });
    // Include armor and shield weight
    totalWeight += parseFloat($("#armor-weight").value) || 0;
    totalWeight += parseFloat($("#shield-weight").value) || 0;
    $("#total-weight").textContent = totalWeight.toFixed(1);
  }

  // Skills are now handled by the Skills module (skills.js)
  $("#btn-add-custom-skill").addEventListener("click", () => Skills.addCustomSkill());

  // ============================================================
  // Attacks
  // ============================================================
  let attackCount = 0;
  function addAttack(data = {}) {
    const container = $("#attacks-container");
    const div = document.createElement("div");
    div.className = "attack-entry";
    div.dataset.attackIndex = attackCount++;

    div.innerHTML = `
      <div class="attack-row">
        <div class="field" style="flex:2"><label>Weapon</label><input type="text" class="atk-name" value="${data.name || ""}"></div>
        <div class="field"><label>Attack Bonus</label><input type="text" class="atk-bonus" value="${data.bonus || ""}"></div>
        <div class="field"><label>Damage</label><input type="text" class="atk-damage" value="${data.damage || ""}"></div>
        <div class="field field-sm"><label>Critical</label><input type="text" class="atk-crit" value="${data.crit || ""}"></div>
      </div>
      <div class="attack-row">
        <div class="field field-sm"><label>Range</label><input type="text" class="atk-range" value="${data.range || ""}"></div>
        <div class="field field-sm"><label>Type</label><input type="text" class="atk-type" value="${data.type || ""}"></div>
        <div class="field" style="flex:2"><label>Notes</label><input type="text" class="atk-notes" value="${data.notes || ""}"></div>
        <button class="btn-remove" onclick="this.closest('.attack-entry').remove()">Remove</button>
      </div>
    `;
    container.appendChild(div);
  }

  $("#btn-add-attack").addEventListener("click", () => addAttack());

  // ============================================================
  // Feats & Special Abilities
  // ============================================================
  function addFeat(text = "") {
    const container = $("#feats-container");
    const div = document.createElement("div");
    div.style.display = "flex";
    div.style.gap = "0.3rem";
    div.style.marginBottom = "0.3rem";
    div.innerHTML = `
      <input type="text" class="feat-entry" value="${text}" style="flex:1" placeholder="Feat name & details">
      <button class="btn-remove" onclick="this.parentElement.remove()">X</button>
    `;
    container.appendChild(div);
  }

  function addSpecialAbility(text = "") {
    const container = $("#special-abilities-container");
    const div = document.createElement("div");
    div.style.display = "flex";
    div.style.gap = "0.3rem";
    div.style.marginBottom = "0.3rem";
    div.innerHTML = `
      <input type="text" class="special-ability-entry" value="${text}" style="flex:1" placeholder="Ability name & description">
      <button class="btn-remove" onclick="this.parentElement.remove()">X</button>
    `;
    container.appendChild(div);
  }

  $("#btn-add-feat").addEventListener("click", () => addFeat());
  $("#btn-add-special-ability").addEventListener("click", () => addSpecialAbility());

  // ============================================================
  // Gear
  // ============================================================
  function addGearRow(data = {}) {
    const tbody = $("#gear-body");
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><input type="text" class="gear-name" value="${data.name || ""}" placeholder="Item name"></td>
      <td><input type="text" class="gear-location" value="${data.location || ""}" placeholder="Location"></td>
      <td><input type="number" class="gear-weight" value="${data.weight || ""}" min="0" step="0.1" style="width:70px"></td>
      <td><button class="btn-remove" onclick="this.closest('tr').remove(); recalcWeight();">X</button></td>
    `;
    tbody.appendChild(tr);
    tr.querySelector(".gear-weight").addEventListener("input", recalcWeight);
  }

  // Make recalcWeight available globally for inline onclick
  window.recalcWeight = recalcWeight;

  $("#btn-add-gear").addEventListener("click", () => addGearRow());

  // ============================================================
  // Protective Items
  // ============================================================
  function addProtectiveItem(data = {}) {
    const container = $("#protective-items-container");
    const div = document.createElement("div");
    div.className = "protective-entry";
    div.innerHTML = `
      <div class="field" style="flex:2"><label>Item</label><input type="text" class="prot-name" value="${data.name || ""}"></div>
      <div class="field field-sm"><label>AC Bonus</label><input type="number" class="prot-ac" value="${data.ac || "0"}"></div>
      <div class="field field-sm"><label>Weight</label><input type="number" class="prot-weight" value="${data.weight || ""}" step="0.1"></div>
      <div class="field" style="flex:2"><label>Special</label><input type="text" class="prot-special" value="${data.special || ""}"></div>
      <button class="btn-remove" style="align-self:flex-end" onclick="this.parentElement.remove()">X</button>
    `;
    container.appendChild(div);
  }

  $("#btn-add-protective").addEventListener("click", () => addProtectiveItem());

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
  // Spell Lists (Known + Prepared)
  // ============================================================
  function buildSpellLists() {
    const container = $("#spell-lists");
    container.innerHTML = "";
    const labels = ["0 (Cantrips)", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th"];
    for (let i = 0; i <= 9; i++) {
      const div = document.createElement("div");
      div.className = `spell-list-content${i === 0 ? " active" : ""}`;
      div.id = `spell-list-${i}`;
      div.innerHTML = `
        <div class="two-column">
          <div class="column">
            <h3>${labels[i]} Level - Known/Available Spells</h3>
            <textarea id="spell-text-${i}" rows="8" placeholder="Enter ${labels[i]} level spells you know, one per line..."></textarea>
          </div>
          <div class="column">
            <h3>${labels[i]} Level - Prepared Spells</h3>
            <textarea id="spell-prepared-${i}" rows="8" placeholder="Enter prepared ${labels[i]} level spells, one per line. Mark used with [X]..."></textarea>
          </div>
        </div>
      `;
      container.appendChild(div);
    }
  }

  // Reset expended spell slots
  function resetSpellSlots() {
    for (let i = 0; i <= 9; i++) {
      $(`#spell-used-${i}`).value = 0;
    }
    recalcAll();
  }

  // ============================================================
  // Soulmelds
  // ============================================================
  let soulmeldCount = 0;
  function addSoulmeld(data = {}) {
    const container = $("#soulmelds-container");
    const div = document.createElement("div");
    div.className = "soulmeld-entry";
    const idx = soulmeldCount++;
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
            (n) => `<button class="essentia-pip${data.essentia >= n ? " filled" : ""}" data-pip="${n}" onclick="togglePip(this)"></button>`
          )
          .join("")}
      </div>
    `;
    container.appendChild(div);
  }

  window.togglePip = function (btn) {
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
  };

  $("#btn-add-soulmeld").addEventListener("click", () => addSoulmeld());

  // ============================================================
  // Save / Load / Export / Import
  // ============================================================
  function collectData() {
    const data = {};

    // Character info
    const textFields = [
      "char-name", "char-player", "char-class", "char-race", "char-alignment",
      "char-deity", "char-level", "char-size", "char-age", "char-gender",
      "char-height", "char-weight", "char-eyes", "char-hair", "char-skin",
      "char-campaign", "char-xp", "char-speed", "damage-reduction",
    ];
    textFields.forEach((id) => {
      const el = $(`#${id}`);
      if (el) data[id] = el.value;
    });

    // Ability scores
    DND35.abilities.forEach((ab) => {
      const lower = ab.toLowerCase();
      data[`${lower}-score`] = $(`#${lower}-score`).value;
      data[`${lower}-temp`] = $(`#${lower}-temp`).value;
    });

    // HP
    ["hp-total", "hp-current", "hp-nonlethal"].forEach((id) => {
      data[id] = $(`#${id}`).value;
    });

    // AC
    ["ac-armor", "ac-shield", "ac-natural", "ac-deflection", "ac-misc"].forEach((id) => {
      data[id] = $(`#${id}`).value;
    });

    // Saves
    ["fort", "ref", "will"].forEach((prefix) => {
      ["base", "magic", "misc", "temp"].forEach((suffix) => {
        data[`${prefix}-${suffix}`] = $(`#${prefix}-${suffix}`).value;
      });
    });
    data["save-conditional"] = $("#save-conditional").value;

    // Initiative, BAB, Grapple
    data["init-misc"] = $("#init-misc").value;
    data["bab"] = $("#bab").value;
    data["bab-numeric"] = $("#bab-numeric").value;
    data["grapple-misc"] = $("#grapple-misc").value;
    data["spell-resistance"] = $("#spell-resistance").value;

    // Attacks
    data.attacks = [];
    $$("#attacks-container .attack-entry").forEach((entry) => {
      data.attacks.push({
        name: entry.querySelector(".atk-name").value,
        bonus: entry.querySelector(".atk-bonus").value,
        damage: entry.querySelector(".atk-damage").value,
        crit: entry.querySelector(".atk-crit").value,
        range: entry.querySelector(".atk-range").value,
        type: entry.querySelector(".atk-type").value,
        notes: entry.querySelector(".atk-notes").value,
      });
    });

    // Skills (delegated to Skills module)
    data.skills = Skills.collectData();
    data.customSkills = Skills.collectCustomSkills();

    // Feats
    data.feats = [];
    $$(".feat-entry").forEach((input) => data.feats.push(input.value));

    // Special abilities
    data.specialAbilities = [];
    $$(".special-ability-entry").forEach((input) => data.specialAbilities.push(input.value));

    // Languages
    data.languages = $("#languages").value;

    // Equipment
    [
      "armor-name", "armor-type", "armor-ac-bonus", "armor-max-dex",
      "armor-check-pen", "armor-spell-fail", "armor-speed", "armor-weight", "armor-special",
      "shield-name", "shield-ac-bonus", "shield-weight", "shield-check-pen",
      "shield-spell-fail", "shield-special",
    ].forEach((id) => {
      data[id] = $(`#${id}`).value;
    });

    // Armor/shield worn state
    data["armor-worn"] = $("#armor-worn").checked;
    data["shield-worn"] = $("#shield-worn").checked;

    // Protective items
    data.protectiveItems = [];
    $$(".protective-entry").forEach((entry) => {
      data.protectiveItems.push({
        name: entry.querySelector(".prot-name").value,
        ac: entry.querySelector(".prot-ac").value,
        weight: entry.querySelector(".prot-weight").value,
        special: entry.querySelector(".prot-special").value,
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

    // Spells
    [
      "spell-dc-mod", "spell-domains", "spell-conditional",
    ].forEach((id) => {
      data[id] = $(`#${id}`).value;
    });

    for (let i = 0; i <= 9; i++) {
      data[`spell-known-${i}`] = $(`#spell-known-${i}`).value;
      data[`spell-per-day-${i}`] = $(`#spell-per-day-${i}`).value;
      data[`spell-bonus-${i}`] = $(`#spell-bonus-${i}`).value;
      data[`spell-used-${i}`] = $(`#spell-used-${i}`).value;
      data[`spell-text-${i}`] = $(`#spell-text-${i}`).value;
      data[`spell-prepared-${i}`] = $(`#spell-prepared-${i}`).value;
    }

    // Companion
    const compFields = [
      "comp-name", "comp-type", "comp-personality",
      "comp-str", "comp-dex", "comp-con", "comp-int", "comp-wis", "comp-cha",
      "comp-hp", "comp-init", "comp-speed",
      "comp-ac", "comp-touch-ac", "comp-ff-ac",
      "comp-fort", "comp-ref", "comp-will", "comp-grapple",
      "comp-skills", "comp-feats", "comp-special", "comp-tricks",
    ];
    compFields.forEach((id) => {
      data[id] = $(`#${id}`).value;
    });

    data.compAttacks = [];
    $$(".comp-attack-entry").forEach((entry) => {
      data.compAttacks.push({
        weapon: entry.querySelector(".comp-attack-weapon").value,
        bonus: entry.querySelector(".comp-attack-bonus").value,
        damage: entry.querySelector(".comp-attack-damage").value,
        crit: entry.querySelector(".comp-attack-crit").value,
      });
    });

    // Class features
    const classFeatureFields = [
      "turn-per-day", "turn-check", "turn-damage",
      "domain1-name", "domain1-power", "domain2-name", "domain2-power",
      "specialty-school", "prohibited1", "prohibited2",
      "rage-per-day", "rage-duration", "rage-str-con", "rage-will", "rage-ac",
      "rage-used", "rage-rounds",
      "psi-discipline", "psi-pp-day", "psi-pp-spent", "psi-powers-known", "psi-max-level", "psi-powers",
    ];
    classFeatureFields.forEach((id) => {
      const el = $(`#${id}`);
      if (el) data[id] = el.value;
    });

    // Soulmelds
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

    // Notes
    data.notes = $("#notes").value;

    return data;
  }

  function loadData(data) {
    if (!data) return;

    // Simple fields
    const simpleFields = [
      "char-name", "char-player", "char-class", "char-race", "char-alignment",
      "char-deity", "char-level", "char-size", "char-age", "char-gender",
      "char-height", "char-weight", "char-eyes", "char-hair", "char-skin",
      "char-campaign", "char-xp", "char-speed", "damage-reduction",
      "hp-total", "hp-current", "hp-nonlethal",
      "ac-armor", "ac-shield", "ac-natural", "ac-deflection", "ac-misc",
      "save-conditional", "init-misc", "bab", "bab-numeric", "grapple-misc",
      "spell-resistance",
      "armor-name", "armor-type", "armor-ac-bonus", "armor-max-dex",
      "armor-check-pen", "armor-spell-fail", "armor-speed", "armor-weight", "armor-special",
      "shield-name", "shield-ac-bonus", "shield-weight", "shield-check-pen",
      "shield-spell-fail", "shield-special",
      "money-cp", "money-sp", "money-gp", "money-pp",
      "spell-dc-mod", "spell-domains", "spell-conditional",
      "languages",
      "comp-name", "comp-type", "comp-personality",
      "comp-str", "comp-dex", "comp-con", "comp-int", "comp-wis", "comp-cha",
      "comp-hp", "comp-init", "comp-speed",
      "comp-ac", "comp-touch-ac", "comp-ff-ac",
      "comp-fort", "comp-ref", "comp-will", "comp-grapple",
      "comp-skills", "comp-feats", "comp-special", "comp-tricks",
      "turn-per-day", "turn-check", "turn-damage",
      "domain1-name", "domain1-power", "domain2-name", "domain2-power",
      "specialty-school", "prohibited1", "prohibited2",
      "rage-per-day", "rage-duration", "rage-str-con", "rage-will", "rage-ac",
      "rage-used", "rage-rounds",
      "psi-discipline", "psi-pp-day", "psi-pp-spent", "psi-powers-known", "psi-max-level", "psi-powers",
      "notes",
    ];
    simpleFields.forEach((id) => {
      const el = $(`#${id}`);
      if (el && data[id] !== undefined) el.value = data[id];
    });

    // Armor/shield worn state (default to true if not in save data)
    $("#armor-worn").checked = data["armor-worn"] !== undefined ? data["armor-worn"] : true;
    $("#shield-worn").checked = data["shield-worn"] !== undefined ? data["shield-worn"] : true;

    // Abilities
    DND35.abilities.forEach((ab) => {
      const lower = ab.toLowerCase();
      if (data[`${lower}-score`] !== undefined) $(`#${lower}-score`).value = data[`${lower}-score`];
      if (data[`${lower}-temp`] !== undefined) $(`#${lower}-temp`).value = data[`${lower}-temp`];
    });

    // Saves
    ["fort", "ref", "will"].forEach((prefix) => {
      ["base", "magic", "misc", "temp"].forEach((suffix) => {
        const key = `${prefix}-${suffix}`;
        if (data[key] !== undefined) $(`#${key}`).value = data[key];
      });
    });

    // Spell slots
    for (let i = 0; i <= 9; i++) {
      if (data[`spell-known-${i}`] !== undefined) $(`#spell-known-${i}`).value = data[`spell-known-${i}`];
      if (data[`spell-per-day-${i}`] !== undefined) $(`#spell-per-day-${i}`).value = data[`spell-per-day-${i}`];
      if (data[`spell-bonus-${i}`] !== undefined) $(`#spell-bonus-${i}`).value = data[`spell-bonus-${i}`];
      if (data[`spell-used-${i}`] !== undefined) $(`#spell-used-${i}`).value = data[`spell-used-${i}`];
      if (data[`spell-text-${i}`] !== undefined) $(`#spell-text-${i}`).value = data[`spell-text-${i}`];
      if (data[`spell-prepared-${i}`] !== undefined) $(`#spell-prepared-${i}`).value = data[`spell-prepared-${i}`];
    }

    // Magic item slots
    DND35.itemSlots.forEach((slot) => {
      const key = `slot-${slot.id}`;
      if (data[key] !== undefined) $(`#${key}`).value = data[key];
    });

    // Attacks
    $("#attacks-container").innerHTML = "";
    attackCount = 0;
    if (data.attacks) {
      data.attacks.forEach((atk) => addAttack(atk));
    }

    // Skills (delegated to Skills module)
    if (data.skills) {
      Skills.loadData(data.skills, getAbilityMod);
    }

    // Custom skills
    Skills.loadCustomSkills(data.customSkills || [], getAbilityMod);

    // Feats
    $("#feats-container").innerHTML = "";
    if (data.feats) data.feats.forEach((f) => addFeat(f));

    // Special abilities
    $("#special-abilities-container").innerHTML = "";
    if (data.specialAbilities) data.specialAbilities.forEach((a) => addSpecialAbility(a));

    // Gear
    $("#gear-body").innerHTML = "";
    if (data.gear) data.gear.forEach((g) => addGearRow(g));

    // Protective items
    $("#protective-items-container").innerHTML = "";
    if (data.protectiveItems) data.protectiveItems.forEach((p) => addProtectiveItem(p));

    // Companion attacks
    if (data.compAttacks) {
      const entries = $$(".comp-attack-entry");
      data.compAttacks.forEach((atk, i) => {
        if (entries[i]) {
          entries[i].querySelector(".comp-attack-weapon").value = atk.weapon || "";
          entries[i].querySelector(".comp-attack-bonus").value = atk.bonus || "";
          entries[i].querySelector(".comp-attack-damage").value = atk.damage || "";
          entries[i].querySelector(".comp-attack-crit").value = atk.crit || "";
        }
      });
    }

    // Soulmelds
    $("#soulmelds-container").innerHTML = "";
    soulmeldCount = 0;
    if (data.soulmelds) data.soulmelds.forEach((sm) => addSoulmeld(sm));

    recalcAll();
    setTimeout(autoExpandAll, 20);
  }

  // ============================================================
  // LocalStorage management
  // ============================================================
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
    Object.keys(chars)
      .sort()
      .forEach((name) => {
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
    // Reset all fields
    $$("input, select, textarea").forEach((el) => {
      if (el.type === "checkbox") el.checked = false;
      else if (el.tagName === "SELECT") el.selectedIndex = el.id === "char-size" ? 4 : 0;
      else el.value = el.type === "number" && el.defaultValue ? el.defaultValue : "";
    });
    $("#attacks-container").innerHTML = "";
    $("#feats-container").innerHTML = "";
    $("#special-abilities-container").innerHTML = "";
    $("#gear-body").innerHTML = "";
    $("#protective-items-container").innerHTML = "";
    $("#soulmelds-container").innerHTML = "";
    Skills.resetCustomSkills();
    Skills.build(getAbilityMod);
    attackCount = 0;
    soulmeldCount = 0;

    // Add default empty entries
    addAttack();
    addFeat();
    addSpecialAbility();
    for (let i = 0; i < 5; i++) addGearRow();

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
  $("#btn-reset-slots").addEventListener("click", resetSpellSlots);

  // Auto-recalc on any input change
  document.addEventListener("input", (e) => {
    const target = e.target;
    if (
      target.closest("#tab-character") ||
      target.closest("#tab-equipment") ||
      target.closest("#tab-spells") ||
      target.id === "spell-dc-mod" ||
      target.id === "char-level"
    ) {
      recalcAll();
    }
  });

  // Also recalc when size changes
  $("#char-size").addEventListener("change", recalcAll);
  $("#armor-worn").addEventListener("change", recalcAll);
  $("#shield-worn").addEventListener("change", recalcAll);

  // ============================================================
  // Initialize
  // ============================================================
  Skills.build(getAbilityMod);
  buildMagicItemSlots();
  buildSpellLists();

  // Add some default empty entries
  addAttack();
  for (let i = 0; i < 5; i++) addGearRow();
  addFeat();
  addSpecialAbility();

  updateCharacterSelect();
  recalcAll();

  // Auto-save reminder via keyboard shortcut
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
      e.preventDefault();
      saveCharacter();
    }
  });

  // Initial auto-expand
  setTimeout(autoExpandAll, 50);
})();
