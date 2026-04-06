// D&D 3.5 Character Sheet - Companion Tab Module

const Companion = (function () {
  "use strict";

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const COMP_FIELDS = [
    "comp-name", "comp-type", "comp-personality",
    "comp-str", "comp-dex", "comp-con", "comp-int", "comp-wis", "comp-cha",
    "comp-hp", "comp-init", "comp-speed",
    "comp-ac", "comp-touch-ac", "comp-ff-ac",
    "comp-fort", "comp-ref", "comp-will", "comp-grapple",
    "comp-skills", "comp-feats", "comp-special", "comp-tricks",
  ];

  function collectData() {
    const data = {};
    COMP_FIELDS.forEach((id) => {
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

    return data;
  }

  function loadData(data) {
    COMP_FIELDS.forEach((id) => {
      const el = $(`#${id}`);
      if (el && data[id] !== undefined) el.value = data[id];
    });

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
  }

  return { collectData, loadData };
})();
