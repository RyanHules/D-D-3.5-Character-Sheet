// D&D 3.5 Character Sheet - Character Tab Module

const Character = (function () {
  "use strict";

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);
  const int = (v) => parseInt(v) || 0;
  const expr = (v) => DND35.evalExpr(v);
  const fmt = (n) => (n >= 0 ? "+" + n : String(n));

  let attackCount = 0;

  // ============================================================
  // Recalculate character tab fields
  // ============================================================
  function recalc(getAbilityMod, bonuses = {}) {
    const abilityBonuses = bonuses.abilities || {};
    const saveBonuses = bonuses.saves || {};
    const acBonus = bonuses.ac || 0;

    // Ability modifiers (include active bonuses like rage)
    DND35.abilities.forEach((ab) => {
      const lower = ab.toLowerCase();
      const bonus = abilityBonuses[ab] || 0;
      const baseScore = int($(`#${lower}-score`).value) + bonus;
      const baseMod = DND35.abilityModifier(baseScore);
      $(`#${lower}-mod`).textContent = fmt(baseMod);

      const tempVal = $(`#${lower}-temp`).value;
      if (tempVal !== "") {
        $(`#${lower}-tempmod`).textContent = fmt(DND35.abilityModifier(int(tempVal) + bonus));
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

    // Auto-set AC armor/shield fields on character tab (now read-only spans)
    $("#ac-armor").textContent = armorACBonus;
    $("#ac-shield").textContent = shieldACBonus;

    // ---- Carrying load penalties (Table 9-2, PHB p.162) ----
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

    // Auto-set arcane spell failure (read by Spells.recalc for display in each spellcasting panel)
    $("#arcane-spell-failure").value = totalSpellFailure;

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
    const acMisc = expr($("#ac-misc").value);
    const acSize = sizeData.acMod;

    $("#ac-dex").textContent = fmt(cappedDexMod);
    $("#ac-size").textContent = fmt(acSize);

    // Resolve protective item bonuses with D&D 3.5 stacking rules
    // Same bonus type: take highest (except dodge, circumstance, untyped which stack)
    const protItems = Equipment.getProtectiveItems();
    const STACKING_TYPES = ["Dodge", "Circumstance", "Untyped"];

    // Seed with character tab bonuses
    const armorTouchAC = $("#armor-touch-ac")?.checked || false;
    const shieldTouchAC = $("#shield-touch-ac")?.checked || false;
    const bestByType = {
      "Armor": { ac: armorACBonus, touch: armorTouchAC, flatfooted: true },
      "Shield": { ac: shieldACBonus, touch: shieldTouchAC, flatfooted: true },
      "Natural Armor": { ac: naturalArmor, touch: false, flatfooted: true },
    };

    let stackingTotal = 0, stackingTouch = 0, stackingFF = 0;

    protItems.forEach((item) => {
      if (STACKING_TYPES.includes(item.type)) {
        stackingTotal += item.ac;
        if (item.touch) stackingTouch += item.ac;
        if (item.flatfooted) stackingFF += item.ac;
      } else {
        const existing = bestByType[item.type];
        if (!existing || item.ac > existing.ac) {
          bestByType[item.type] = { ac: item.ac, touch: item.touch, flatfooted: item.flatfooted };
        }
      }
    });

    // Auto-set deflection display from resolved equipment bonuses
    const deflectionBest = bestByType["Deflection"];
    $("#ac-deflection").textContent = deflectionBest ? deflectionBest.ac : 0;

    // Show dynamic bonus type boxes for non-standard types from equipment
    const bonusTypesContainer = $("#ac-bonus-types");
    if (bonusTypesContainer) {
      bonusTypesContainer.innerHTML = "";
      const STANDARD_TYPES = ["Armor", "Shield", "Natural Armor", "Deflection"];
      Object.entries(bestByType).forEach(([type, data]) => {
        if (STANDARD_TYPES.includes(type) || data.ac === 0) return;
        const div = document.createElement("div");
        div.className = "field field-sm";
        div.innerHTML = `<label>${type}</label><span class="calc-field">${data.ac}</span>`;
        bonusTypesContainer.appendChild(div);
      });
    }

    // Sum resolved bonuses
    let resolvedTotal = 0, resolvedTouch = 0, resolvedFF = 0;
    Object.values(bestByType).forEach((best) => {
      resolvedTotal += best.ac;
      if (best.touch) resolvedTouch += best.ac;
      if (best.flatfooted) resolvedFF += best.ac;
    });

    const acTotal = 10 + cappedDexMod + acSize + acMisc + resolvedTotal + stackingTotal + acBonus;
    const touchAC = 10 + cappedDexMod + acSize + acMisc + resolvedTouch + stackingTouch + acBonus;
    const flatFootedAC = 10 + acSize + acMisc + resolvedFF + stackingFF + acBonus;

    $("#ac-total").textContent = acTotal;
    $("#ac-touch").textContent = touchAC;
    $("#ac-flatfooted").textContent = flatFootedAC;

    // Saving throws
    [
      { prefix: "fort", ability: "CON" },
      { prefix: "ref", ability: "DEX" },
      { prefix: "will", ability: "WIS" },
    ].forEach(({ prefix, ability }) => {
      const abilityMod = getAbilityMod(ability);
      $(`#${prefix}-ability`).textContent = fmt(abilityMod);
      const saveBonus = saveBonuses[prefix] || 0;
      const total =
        int($(`#${prefix}-base`).value) +
        abilityMod +
        int($(`#${prefix}-magic`).value) +
        expr($(`#${prefix}-misc`).value) +
        int($(`#${prefix}-temp`).value) +
        saveBonus;
      $(`#${prefix}-total`).textContent = fmt(total);
    });

    // Initiative
    const initDex = getAbilityMod("DEX");
    $("#init-dex").textContent = fmt(initDex);
    $("#init-total").textContent = fmt(initDex + expr($("#init-misc").value));

    // BAB boxes (4 iterative attacks: highest, -5, -10, -15)
    const bab1 = int($("#bab-1").value);
    for (let n = 2; n <= 4; n++) {
      const val = bab1 - (n - 1) * 5;
      const el = $(`#bab-${n}`);
      const sep = $(`#bab-sep-${n}`);
      const plus = $(`#bab-plus-${n}`);
      if (val > 0) {
        el.textContent = val;
        el.style.display = "";
        if (sep) sep.style.display = "";
        if (plus) plus.style.display = "";
      } else {
        el.style.display = "none";
        if (sep) sep.style.display = "none";
        if (plus) plus.style.display = "none";
      }
    }

    // Grapple
    const strMod = getAbilityMod("STR");
    const grappleSize = sizeData.grappleMod;

    $("#grapple-bab").textContent = fmt(bab1);
    $("#grapple-str").textContent = fmt(strMod);
    $("#grapple-size").textContent = fmt(grappleSize);
    $("#grapple-total").textContent = fmt(bab1 + strMod + grappleSize + expr($("#grapple-misc").value));

    // Max skill ranks
    const level = int($("#char-level").value) || 1;
    $("#max-class-ranks").textContent = level + 3;
    $("#max-crossclass-ranks").textContent = (level + 3) / 2;

    // Carrying capacity display
    $("#carry-light").textContent = `0-${capacity[0]} lb.`;
    $("#carry-medium").textContent = `${capacity[0] + 1}-${capacity[1]} lb.`;
    $("#carry-heavy").textContent = `${capacity[1] + 1}-${capacity[2]} lb.`;
    $("#carry-overhead").textContent = `${capacity[2]} lb.`;
    $("#carry-offground").textContent = `${capacity[2] * 2} lb.`;
    $("#carry-drag").textContent = `${capacity[2] * 5} lb.`;

    // Total gear weight display
    $("#total-weight").textContent = totalWeight.toFixed(1);
  }

  // ============================================================
  // Attacks
  // ============================================================
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

  // ============================================================
  // Collect / Load
  // ============================================================
  function collectData() {
    const data = {};

    // Character info
    [
      "char-name", "char-player", "char-class", "char-race", "char-alignment",
      "char-deity", "char-level", "char-size", "char-age", "char-gender",
      "char-height", "char-weight", "char-eyes", "char-hair", "char-skin",
      "char-campaign", "char-xp", "char-speed", "damage-reduction",
    ].forEach((id) => {
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
    ["hp-total", "hp-current", "hp-temp", "hp-nonlethal"].forEach((id) => {
      data[id] = $(`#${id}`).value;
    });

    // AC (natural and misc are manual inputs; armor, shield, deflection are auto-calculated)
    ["ac-natural", "ac-misc"].forEach((id) => {
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
    data["bab-1"] = $("#bab-1").value;
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

    return data;
  }

  function loadData(data, getAbilityMod) {
    // Simple fields
    [
      "char-name", "char-player", "char-class", "char-race", "char-alignment",
      "char-deity", "char-level", "char-size", "char-age", "char-gender",
      "char-height", "char-weight", "char-eyes", "char-hair", "char-skin",
      "char-campaign", "char-xp", "char-speed", "damage-reduction",
      "hp-total", "hp-current", "hp-nonlethal",
      "ac-natural", "ac-misc",
      "save-conditional", "init-misc", "bab-1", "grapple-misc",
      "spell-resistance", "languages",
    ].forEach((id) => {
      const el = $(`#${id}`);
      if (el && data[id] !== undefined) el.value = data[id];
    });

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

    // Attacks
    $("#attacks-container").innerHTML = "";
    attackCount = 0;
    if (data.attacks) data.attacks.forEach((atk) => addAttack(atk));
  }

  function resetAttacks() {
    $("#attacks-container").innerHTML = "";
    attackCount = 0;
  }

  // ============================================================
  // Public API
  // ============================================================
  return { recalc, addAttack, collectData, loadData, resetAttacks };
})();
