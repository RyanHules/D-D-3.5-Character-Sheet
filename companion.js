// D&D 3.5 Character Sheet - Companion Tab Module

const Companion = (function () {
  "use strict";

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);
  const int = (v) => parseInt(v) || 0;
  const abilMod = (score) => Math.floor((score - 10) / 2);

  let companionIndex = 0;
  let _mainGetAbilityMod = null;

  // ============================================================
  // Add a companion sub-tab
  // ============================================================
  function addCompanion(data = {}) {
    const idx = companionIndex++;
    const name = data.name || "Companion";

    const tabBar = $("#companion-tab-bar");
    const btn = document.createElement("button");
    btn.className = "inner-tab";
    btn.dataset.compIdx = idx;
    btn.textContent = name;
    btn.addEventListener("click", () => switchCompanion(idx));
    btn.addEventListener("dblclick", () => {
      const rm = btn.querySelector(".comp-tab-remove");
      const cur = btn.textContent.replace("×", "").trim();
      const nw = prompt("Rename companion:", cur);
      if (nw && nw.trim()) { btn.textContent = nw.trim(); btn.appendChild(rm); }
    });

    const rm = document.createElement("span");
    rm.className = "caster-tab-remove";
    rm.textContent = "×";
    rm.classList.add("comp-tab-remove");
    rm.addEventListener("click", (e) => {
      e.stopPropagation();
      if (confirm(`Remove "${btn.textContent.replace("×", "").trim()}"?`)) {
        btn.remove();
        document.getElementById(`companion-${idx}`)?.remove();
        const first = tabBar.querySelector(".inner-tab");
        if (first) first.click();
      }
    });
    btn.appendChild(rm);
    tabBar.appendChild(btn);

    const container = $("#companion-content");
    const panel = document.createElement("div");
    panel.className = "inner-tab-content";
    panel.id = `companion-${idx}`;
    panel.innerHTML = buildCompanionHTML(idx, data);
    container.appendChild(panel);

    wireCompanion(idx, panel, data);
    switchCompanion(idx);
    return idx;
  }

  function switchCompanion(idx) {
    $$(".inner-tab[data-comp-idx]").forEach((t) => t.classList.remove("active"));
    $$("#companion-content > .inner-tab-content").forEach((c) => c.classList.remove("active"));
    const btn = $(`.inner-tab[data-comp-idx="${idx}"]`);
    const panel = $(`#companion-${idx}`);
    if (btn) btn.classList.add("active");
    if (panel) panel.classList.add("active");
  }

  // ============================================================
  // Build companion panel HTML
  // ============================================================
  function buildCompanionHTML(idx, d = {}) {
    const mods = ["STR","DEX","CON","INT","WIS","CHA"].map((ab) => {
      const sc = int(d[`comp-${ab.toLowerCase()}-score`]);
      return `<div class="field field-sm">
        <label>${ab}</label>
        <input type="number" class="comp-score" data-ab="${ab}" value="${d[`comp-${ab.toLowerCase()}-score`] || ""}">
        <span class="comp-mod calc-field" data-ab="${ab}">--</span>
      </div>`;
    }).join("");

    return `
    <div class="comp-header info-grid">
      <div class="field"><label>Name</label><input type="text" class="comp-name" value="${d.compName || ""}"></div>
      <div class="field"><label>Type</label><select class="comp-type">
        <option${d.compType === "animal" ? " selected" : ""}>Animal Companion</option>
        <option${d.compType === "familiar" ? " selected" : ""}>Familiar</option>
        <option${d.compType === "cohort" ? " selected" : ""}>Cohort</option>
        <option${d.compType === "psicrystal" ? " selected" : ""}>Psicrystal</option>
        <option${d.compType === "other" ? " selected" : ""}>Other</option>
      </select></div>
      <label class="mi-toggle"><input type="checkbox" class="comp-familiar-toggle"${d.isFamiliar ? " checked" : ""}> Familiar</label>
    </div>
    <div class="two-column">
      <div class="column">
        <h3>Ability Scores</h3>
        <div class="companion-abilities">${mods}</div>
        <h3>Hit Points</h3>
        <div class="info-grid">
          <div class="field field-sm"><label>Max HP</label><input type="number" class="comp-hp-max" value="${d.compHpMax || ""}"></div>
          <div class="field field-sm"><label>Current HP</label><input type="number" class="comp-hp-cur" value="${d.compHpCur || ""}"></div>
          <div class="field field-sm"><label>Speed</label><input type="text" class="comp-speed" value="${d.compSpeed || ""}"></div>
        </div>
        <h3>Initiative</h3>
        <div class="info-grid">
          <div class="field field-sm"><label>DEX Mod</label><span class="comp-init-dex calc-field">--</span></div>
          <div class="field field-sm"><label>Misc</label><input type="number" class="comp-init-misc" value="${d.compInitMisc || ""}"></div>
          <div class="field field-sm"><label>Total</label><span class="comp-init-total calc-field">--</span></div>
        </div>
        <h3>Armor Class</h3>
        <div class="info-grid">
          <div class="field field-sm"><label>Armor</label><input type="number" class="comp-ac-armor" value="${d.compAcArmor || ""}"></div>
          <div class="field field-sm"><label>Shield</label><input type="number" class="comp-ac-shield" value="${d.compAcShield || ""}"></div>
          <div class="field field-sm"><label>Natural</label><input type="number" class="comp-ac-natural" value="${d.compAcNatural || ""}"></div>
          <div class="field field-sm"><label>Size</label><input type="number" class="comp-ac-size" value="${d.compAcSize || ""}"></div>
          <div class="field field-sm"><label>Misc</label><input type="number" class="comp-ac-misc" value="${d.compAcMisc || ""}"></div>
        </div>
        <div class="info-grid">
          <div class="field field-sm"><label>AC Total</label><span class="comp-ac-total calc-field">--</span></div>
          <div class="field field-sm"><label>Touch</label><span class="comp-ac-touch calc-field">--</span></div>
          <div class="field field-sm"><label>Flat-Footed</label><span class="comp-ac-ff calc-field">--</span></div>
        </div>
        <h3>Saving Throws</h3>
        <div class="comp-saves">
          ${["Fort","Ref","Will"].map((s, si) => {
            const ab = ["CON","DEX","WIS"][si];
            return `<div class="save-row">
              <span class="save-label">${s}</span>
              <input type="number" class="comp-save-base" data-save="${s}" value="${d[`compSave${s}Base`] || ""}">
              <span class="comp-save-ab calc-field" data-save="${s}">+0</span>
              <input type="number" class="comp-save-misc" data-save="${s}" value="${d[`compSave${s}Misc`] || ""}">
              <span class="comp-save-total calc-field" data-save="${s}">--</span>
              <span class="comp-familiar-save" data-save="${s}" style="display:none;font-size:0.7rem;color:var(--accent)">↑ main</span>
            </div>`;
          }).join("")}
        </div>
        <h3>Grapple</h3>
        <div class="info-grid">
          <div class="field field-sm"><label>BAB</label><input type="number" class="comp-bab" value="${d.compBab || ""}"></div>
          <div class="field field-sm"><label>STR Mod</label><span class="comp-grapple-str calc-field">+0</span></div>
          <div class="field field-sm"><label>Size</label><input type="number" class="comp-grapple-size" value="${d.compGrappleSize || ""}"></div>
          <div class="field field-sm"><label>Misc</label><input type="number" class="comp-grapple-misc" value="${d.compGrappleMisc || ""}"></div>
          <div class="field field-sm"><label>Total</label><span class="comp-grapple-total calc-field">--</span></div>
        </div>
        <h3>Notes</h3>
        <textarea class="comp-notes" rows="3">${d.compNotes || ""}</textarea>
      </div>
      <div class="column">
        <h3>Attacks</h3>
        <div class="comp-attacks-list"></div>
        <button class="btn-add comp-add-attack">+ Add Attack</button>
        <h3>Skills</h3>
        <div class="comp-skills-list"></div>
        <button class="btn-add comp-add-skill">+ Add Skill</button>
        <h3>Feats</h3>
        <div class="comp-feats-list"></div>
        <button class="btn-add comp-add-feat">+ Add Feat</button>
        <h3>Tricks</h3>
        <div class="comp-tricks-list"></div>
        <button class="btn-add comp-add-trick">+ Add Trick</button>
        <h3>Special Abilities</h3>
        <textarea class="comp-special" rows="4">${d.compSpecial || ""}</textarea>
      </div>
    </div>`;
  }

  // ============================================================
  // Wire all interactions for a companion panel
  // ============================================================
  function wireCompanion(idx, panel, d = {}) {
    // Recalc on any input
    panel.addEventListener("input", () => recalcCompanion(panel));
    panel.addEventListener("change", () => recalcCompanion(panel));

    // Familiar toggle
    const famToggle = panel.querySelector(".comp-familiar-toggle");
    famToggle.addEventListener("change", () => {
      panel.querySelectorAll(".comp-familiar-save").forEach((el) => {
        el.style.display = famToggle.checked ? "" : "none";
      });
      recalcCompanion(panel);
    });
    if (d.isFamiliar) {
      panel.querySelectorAll(".comp-familiar-save").forEach((el) => { el.style.display = ""; });
    }

    // Dynamic attacks
    const atksContainer = panel.querySelector(".comp-attacks-list");
    panel.querySelector(".comp-add-attack").addEventListener("click", () => addAttackRow(atksContainer));
    (d.compAttacks || [{}]).forEach((a) => addAttackRow(atksContainer, a));

    // Dynamic skills
    const skillsContainer = panel.querySelector(".comp-skills-list");
    panel.querySelector(".comp-add-skill").addEventListener("click", () => addSkillRow(skillsContainer));
    (d.compSkills || []).forEach((s) => addSkillRow(skillsContainer, s));

    // Dynamic feats
    const featsContainer = panel.querySelector(".comp-feats-list");
    panel.querySelector(".comp-add-feat").addEventListener("click", () => addListRow(featsContainer, "comp-feat", "Feat name", "Notes"));
    (d.compFeats || [""]).forEach((f) => addListRow(featsContainer, "comp-feat", "Feat name", "Notes", f));

    // Dynamic tricks
    const tricksContainer = panel.querySelector(".comp-tricks-list");
    panel.querySelector(".comp-add-trick").addEventListener("click", () => addListRow(tricksContainer, "comp-trick", "Trick name", "Description"));
    (d.compTricks || [""]).forEach((t) => addListRow(tricksContainer, "comp-trick", "Trick name", "Description", t));

    recalcCompanion(panel);
  }

  // ============================================================
  // Dynamic row helpers
  // ============================================================
  function addAttackRow(container, d = {}) {
    const div = document.createElement("div");
    div.className = "comp-attack-entry";
    div.innerHTML = `
      <input type="text" class="comp-atk-weapon" placeholder="Weapon/Natural" value="${d.weapon || ""}">
      <input type="text" class="comp-atk-bonus" placeholder="Attack Bonus" value="${d.bonus || ""}">
      <input type="text" class="comp-atk-damage" placeholder="Damage" value="${d.damage || ""}">
      <input type="text" class="comp-atk-crit" placeholder="Crit" value="${d.crit || ""}">
      <button class="btn-remove comp-remove-attack" title="Remove">X</button>`;
    div.querySelector(".comp-remove-attack").addEventListener("click", () => div.remove());
    container.appendChild(div);
  }

  function addSkillRow(container, d = {}) {
    const div = document.createElement("div");
    div.className = "comp-skill-row";
    div.innerHTML = `
      <input type="text" class="comp-skill-name" placeholder="Skill name" value="${d.name || ""}">
      <input type="number" class="comp-skill-ranks" placeholder="Ranks" value="${d.ranks || ""}">
      <input type="number" class="comp-skill-misc" placeholder="Misc" value="${d.misc || ""}">
      <span class="comp-skill-total calc-field">--</span>
      <button class="btn-remove" title="Remove">X</button>`;
    div.querySelector(".comp-skill-ranks, .comp-skill-misc") && div.addEventListener("input", () => {
      const total = int(div.querySelector(".comp-skill-ranks").value) + int(div.querySelector(".comp-skill-misc").value);
      div.querySelector(".comp-skill-total").textContent = total >= 0 ? "+" + total : total;
    });
    div.querySelector(".btn-remove").addEventListener("click", () => div.remove());
    container.appendChild(div);
    if (d.name || d.ranks) div.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function addListRow(container, cls, placeholder, notePlaceholder, data = "") {
    const d = typeof data === "object" ? data : { name: data };
    const div = document.createElement("div");
    div.className = `${cls}-entry feat-entry`;
    div.innerHTML = `
      <div class="feat-main">
        <input type="text" class="${cls}-name" placeholder="${placeholder}" value="${d.name || ""}">
        <button class="btn-remove" title="Remove">X</button>
      </div>
      <textarea class="${cls}-notes" rows="1" placeholder="${notePlaceholder}">${d.notes || ""}</textarea>`;
    div.querySelector(".btn-remove").addEventListener("click", () => div.remove());
    container.appendChild(div);
  }

  // ============================================================
  // Auto-calculate companion stats
  // ============================================================
  function recalcCompanion(panel) {
    const score = (ab) => int(panel.querySelector(`.comp-score[data-ab="${ab}"]`)?.value);
    const mod = (ab) => abilMod(score(ab));

    // Ability modifier display
    ["STR","DEX","CON","INT","WIS","CHA"].forEach((ab) => {
      const el = panel.querySelector(`.comp-mod[data-ab="${ab}"]`);
      if (el) { const m = mod(ab); el.textContent = (m >= 0 ? "+" : "") + m; }
    });

    // Initiative
    const dexMod = mod("DEX");
    const initMiscEl = panel.querySelector(".comp-init-misc");
    const initTotal = dexMod + int(initMiscEl?.value);
    const initDexEl = panel.querySelector(".comp-init-dex");
    if (initDexEl) initDexEl.textContent = (dexMod >= 0 ? "+" : "") + dexMod;
    const initTotalEl = panel.querySelector(".comp-init-total");
    if (initTotalEl) initTotalEl.textContent = (initTotal >= 0 ? "+" : "") + initTotal;

    // AC
    const armor = int(panel.querySelector(".comp-ac-armor")?.value);
    const shield = int(panel.querySelector(".comp-ac-shield")?.value);
    const natural = int(panel.querySelector(".comp-ac-natural")?.value);
    const acSize = int(panel.querySelector(".comp-ac-size")?.value);
    const acMisc = int(panel.querySelector(".comp-ac-misc")?.value);
    const acTotal = 10 + armor + shield + dexMod + natural + acSize + acMisc;
    const acTouch = 10 + dexMod + acSize + acMisc;
    const acFF = 10 + armor + shield + natural + acSize + acMisc;
    const setEl = (sel, val) => { const el = panel.querySelector(sel); if (el) el.textContent = val; };
    setEl(".comp-ac-total", acTotal);
    setEl(".comp-ac-touch", acTouch);
    setEl(".comp-ac-ff", acFF);

    // Saves
    const saveAbility = { Fort: "CON", Ref: "DEX", Will: "WIS" };
    const isFamiliar = panel.querySelector(".comp-familiar-toggle")?.checked;
    ["Fort","Ref","Will"].forEach((s) => {
      const ab = saveAbility[s];
      const abMod = mod(ab);
      const base = int(panel.querySelector(`.comp-save-base[data-save="${s}"]`)?.value);
      const misc = int(panel.querySelector(`.comp-save-misc[data-save="${s}"]`)?.value);
      const abEl = panel.querySelector(`.comp-save-ab[data-save="${s}"]`);
      if (abEl) abEl.textContent = (abMod >= 0 ? "+" : "") + abMod;

      let total = base + abMod + misc;
      // Familiar: mirror main character saves
      if (isFamiliar && _mainGetAbilityMod) {
        const mainSave = $(`#save-${s.toLowerCase()}-total`);
        const mainVal = mainSave ? int(mainSave.textContent) : null;
        if (mainVal !== null && mainVal > total) total = mainVal;
      }
      const totalEl = panel.querySelector(`.comp-save-total[data-save="${s}"]`);
      if (totalEl) totalEl.textContent = (total >= 0 ? "+" : "") + total;
    });

    // Grapple
    const strMod = mod("STR");
    const grappleStrEl = panel.querySelector(".comp-grapple-str");
    if (grappleStrEl) grappleStrEl.textContent = (strMod >= 0 ? "+" : "") + strMod;
    const bab = int(panel.querySelector(".comp-bab")?.value);
    const grappleSize = int(panel.querySelector(".comp-grapple-size")?.value);
    const grappleMisc = int(panel.querySelector(".comp-grapple-misc")?.value);
    const grapple = bab + strMod + grappleSize + grappleMisc;
    setEl(".comp-grapple-total", (grapple >= 0 ? "+" : "") + grapple);
  }

  // ============================================================
  // Collect / Load all companions
  // ============================================================
  function collectData() {
    const companions = [];
    $$(".inner-tab[data-comp-idx]").forEach((btn) => {
      const idx = btn.dataset.compIdx;
      const panel = $(`#companion-${idx}`);
      if (!panel) return;
      const d = {};
      d.name = btn.textContent.replace("×", "").trim();
      d.compName = panel.querySelector(".comp-name")?.value || "";
      d.compType = panel.querySelector(".comp-type")?.value || "";
      d.isFamiliar = panel.querySelector(".comp-familiar-toggle")?.checked || false;
      ["STR","DEX","CON","INT","WIS","CHA"].forEach((ab) => {
        d[`comp-${ab.toLowerCase()}-score`] = panel.querySelector(`.comp-score[data-ab="${ab}"]`)?.value || "";
      });
      d.compHpMax = panel.querySelector(".comp-hp-max")?.value || "";
      d.compHpCur = panel.querySelector(".comp-hp-cur")?.value || "";
      d.compSpeed = panel.querySelector(".comp-speed")?.value || "";
      d.compInitMisc = panel.querySelector(".comp-init-misc")?.value || "";
      ["armor","shield","natural","size","misc"].forEach((f) => {
        d[`compAc${f.charAt(0).toUpperCase()+f.slice(1)}`] = panel.querySelector(`.comp-ac-${f}`)?.value || "";
      });
      ["Fort","Ref","Will"].forEach((s) => {
        d[`compSave${s}Base`] = panel.querySelector(`.comp-save-base[data-save="${s}"]`)?.value || "";
        d[`compSave${s}Misc`] = panel.querySelector(`.comp-save-misc[data-save="${s}"]`)?.value || "";
      });
      d.compBab = panel.querySelector(".comp-bab")?.value || "";
      d.compGrappleSize = panel.querySelector(".comp-grapple-size")?.value || "";
      d.compGrappleMisc = panel.querySelector(".comp-grapple-misc")?.value || "";
      d.compNotes = panel.querySelector(".comp-notes")?.value || "";
      d.compSpecial = panel.querySelector(".comp-special")?.value || "";
      d.compAttacks = Array.from(panel.querySelectorAll(".comp-attack-entry")).map((r) => ({
        weapon: r.querySelector(".comp-atk-weapon")?.value || "",
        bonus: r.querySelector(".comp-atk-bonus")?.value || "",
        damage: r.querySelector(".comp-atk-damage")?.value || "",
        crit: r.querySelector(".comp-atk-crit")?.value || "",
      }));
      d.compSkills = Array.from(panel.querySelectorAll(".comp-skill-row")).map((r) => ({
        name: r.querySelector(".comp-skill-name")?.value || "",
        ranks: r.querySelector(".comp-skill-ranks")?.value || "",
        misc: r.querySelector(".comp-skill-misc")?.value || "",
      }));
      d.compFeats = Array.from(panel.querySelectorAll(".comp-feat-entry")).map((r) => ({
        name: r.querySelector(".comp-feat-name")?.value || "",
        notes: r.querySelector(".comp-feat-notes")?.value || "",
      }));
      d.compTricks = Array.from(panel.querySelectorAll(".comp-trick-entry")).map((r) => ({
        name: r.querySelector(".comp-trick-name")?.value || "",
        notes: r.querySelector(".comp-trick-notes")?.value || "",
      }));
      companions.push(d);
    });
    return { companions };
  }

  function loadData(data) {
    const tabBar = $("#companion-tab-bar");
    const content = $("#companion-content");
    if (!tabBar || !content) return;

    // Clear existing
    tabBar.innerHTML = "";
    content.innerHTML = "";
    companionIndex = 0;

    // Legacy migration: single companion from old schema
    if (!data.companions && (data["comp-name"] !== undefined || data.compAttacks)) {
      const legacy = {
        name: "Companion",
        compName: data["comp-name"] || "",
        compType: data["comp-type"] || "",
        compSpeed: data["comp-speed"] || "",
        compNotes: data["comp-personality"] || "",
        compSpecial: data["comp-special"] || "",
        compAttacks: data.compAttacks || [],
        compSkills: [],
        compFeats: data["comp-feats"] ? [{ name: data["comp-feats"], notes: "" }] : [],
        compTricks: data["comp-tricks"] ? [{ name: data["comp-tricks"], notes: "" }] : [],
      };
      ["STR","DEX","CON","INT","WIS","CHA"].forEach((ab) => {
        legacy[`comp-${ab.toLowerCase()}-score`] = data[`comp-${ab.toLowerCase()}`] || "";
      });
      addCompanion(legacy);
    } else {
      (data.companions || []).forEach((c) => addCompanion(c));
    }

    // Ensure at least one companion tab exists
    if (companionIndex === 0) addCompanion();
  }

  function setMainGetAbilityMod(fn) { _mainGetAbilityMod = fn; }

  function recalcAll() {
    $$("#companion-content > .inner-tab-content").forEach((panel) => recalcCompanion(panel));
  }

  return { addCompanion, loadData, collectData, recalcAll, setMainGetAbilityMod };
})();
