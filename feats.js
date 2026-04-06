// D&D 3.5 Character Sheet - Feats & Abilities Module

const Feats = (function () {
  "use strict";

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

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
