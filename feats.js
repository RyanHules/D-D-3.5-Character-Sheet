// D&D 3.5 Character Sheet - Feats & Abilities Module

const Feats = (function () {
  "use strict";

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  function addFeat(text = "") {
    const container = $("#feats-container");
    const div = document.createElement("div");
    div.className = "feat-row";
    const ta = document.createElement("textarea");
    ta.className = "feat-entry";
    ta.placeholder = "Feat name & details";
    ta.rows = 1;
    ta.value = text;
    const btn = document.createElement("button");
    btn.className = "btn-remove";
    btn.textContent = "X";
    btn.addEventListener("click", () => div.remove());
    div.appendChild(ta);
    div.appendChild(btn);
    container.appendChild(div);
  }

  function addSpecialAbility(text = "") {
    const container = $("#special-abilities-container");
    const div = document.createElement("div");
    div.className = "feat-row";
    const ta = document.createElement("textarea");
    ta.className = "special-ability-entry";
    ta.placeholder = "Ability name & description";
    ta.rows = 1;
    ta.value = text;
    const btn = document.createElement("button");
    btn.className = "btn-remove";
    btn.textContent = "X";
    btn.addEventListener("click", () => div.remove());
    div.appendChild(ta);
    div.appendChild(btn);
    container.appendChild(div);
  }

  function collectData() {
    const data = {};
    data.feats = [];
    $$(".feat-entry").forEach((input) => data.feats.push(input.value));
    data.specialAbilities = [];
    $$(".special-ability-entry").forEach((input) => data.specialAbilities.push(input.value));
    data.languages = $("#languages").value;
    return data;
  }

  function loadData(data) {
    if (data.languages !== undefined) $("#languages").value = data.languages;
    $("#feats-container").innerHTML = "";
    if (data.feats) data.feats.forEach((f) => addFeat(f));
    $("#special-abilities-container").innerHTML = "";
    if (data.specialAbilities) data.specialAbilities.forEach((a) => addSpecialAbility(a));
  }

  return { addFeat, addSpecialAbility, collectData, loadData };
})();
