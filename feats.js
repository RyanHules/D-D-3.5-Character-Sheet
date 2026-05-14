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
    // ⓘ button toggles a collapsible panel below the row showing the
    // feat's rules text (type, prereq, benefit, normal, special) pulled
    // from the DB. Falls back gracefully for homebrew / custom entries
    // that don't match a DB row. The panel is generated on demand and
    // not persisted — collapses again if the textarea is edited.
    const info = document.createElement("button");
    info.type = "button";
    info.className = "btn-feat-info";
    info.title = "Show rules text";
    info.setAttribute("aria-expanded", "false");
    info.textContent = "ⓘ";
    info.addEventListener("click", () => toggleFeatRules(div));
    const btn = document.createElement("button");
    btn.className = "btn-remove";
    btn.textContent = "X";
    btn.addEventListener("click", () => div.remove());
    // Collapse the panel when the user edits the feat name — the cached
    // rules text might no longer match what they typed.
    ta.addEventListener("input", () => collapseFeatRules(div));
    div.appendChild(ta);
    div.appendChild(info);
    div.appendChild(btn);
    container.appendChild(div);
  }

  function toggleFeatRules(row) {
    const existing = row.querySelector(".feat-rules");
    if (existing) {
      collapseFeatRules(row);
      return;
    }
    const ta = row.querySelector(".feat-entry");
    const btn = row.querySelector(".btn-feat-info");
    const name = (ta.value || "").trim();
    const panel = document.createElement("div");
    panel.className = "feat-rules";
    if (!name) {
      panel.innerHTML = '<i style="opacity:.7">Type a feat name first.</i>';
    } else if (!(window.DB && DB.isLoaded())) {
      panel.innerHTML = '<i style="opacity:.7">Database not loaded — rules text unavailable.</i>';
    } else {
      const rendered = renderFeatRules(name);
      panel.innerHTML = rendered.html;
      // Tack on the errata badge (advisory + applied) when the lookup
      // resolved to a real entry.
      if (rendered.entryId && window.ErrataBadge) {
        ErrataBadge.attach(panel, rendered.entryId);
      }
    }
    row.appendChild(panel);
    btn.setAttribute("aria-expanded", "true");
    btn.classList.add("active");
  }

  function collapseFeatRules(row) {
    const panel = row.querySelector(".feat-rules");
    if (panel) panel.remove();
    const btn = row.querySelector(".btn-feat-info");
    if (btn) {
      btn.setAttribute("aria-expanded", "false");
      btn.classList.remove("active");
    }
  }

  // Look up a feat by typed name (case-insensitive). Returns rendered
  // HTML for the rules panel. Tries the typed name as a whole-string
  // match first; if that fails (e.g. the user typed "Power Attack
  // (Str 17)"), tries a prefix match on the leading word group.
  function renderFeatRules(name) {
    const TYPES = "('feat','acf','skill_trick')";
    // Whole-string match. Latest version wins (3.5 > 3.0).
    let row = DB.queryOne(
      "SELECT e.id, e.name, e.version, e.source, e.types_csv, " +
      "  json_extract(e.data, '$.prerequisites') AS prerequisites, " +
      "  json_extract(e.data, '$.benefit')       AS benefit, " +
      "  json_extract(e.data, '$.normal')        AS normal, " +
      "  json_extract(e.data, '$.special')       AS special, " +
      "  json_extract(e.data, '$.description')   AS description " +
      "FROM entry e " +
      "WHERE e.type IN " + TYPES + " AND LOWER(e.name) = LOWER(?) " +
      "ORDER BY CASE e.version WHEN '3.5' THEN 0 ELSE 1 END LIMIT 1",
      [name]
    );
    if (!row) {
      // Strip trailing parenthetical / annotation and retry.
      const stripped = name.replace(/\s*\(.*\)\s*$/, "").trim();
      if (stripped && stripped !== name) {
        row = DB.queryOne(
          "SELECT e.id, e.name, e.version, e.source, e.types_csv, " +
          "  json_extract(e.data, '$.prerequisites') AS prerequisites, " +
          "  json_extract(e.data, '$.benefit')       AS benefit, " +
          "  json_extract(e.data, '$.normal')        AS normal, " +
          "  json_extract(e.data, '$.special')       AS special, " +
          "  json_extract(e.data, '$.description')   AS description " +
          "FROM entry e " +
          "WHERE e.type IN " + TYPES + " AND LOWER(e.name) = LOWER(?) " +
          "ORDER BY CASE e.version WHEN '3.5' THEN 0 ELSE 1 END LIMIT 1",
          [stripped]
        );
      }
    }
    if (!row) {
      return {
        html: '<i style="opacity:.7">No rules text found in database — ' +
          'this looks like a homebrew or custom entry.</i>',
        entryId: null,
      };
    }
    const bits = [];
    bits.push(`<b>${escapeHtml(row.name)}</b>` +
      ` <span style="opacity:.7">(${escapeHtml(row.source || "?")}` +
      `${row.version && row.version !== "3.5" ? ", " + escapeHtml(row.version) : ""})</span>`);
    if (row.types_csv)     bits.push(`<b>Type:</b> ${escapeHtml(row.types_csv)}`);
    if (row.prerequisites) bits.push(`<b>Prereq:</b> ${escapeHtml(row.prerequisites)}`);
    if (row.benefit)       bits.push(`<b>Benefit:</b> ${escapeHtml(row.benefit)}`);
    if (row.normal)        bits.push(`<b>Normal:</b> ${escapeHtml(row.normal)}`);
    if (row.special)       bits.push(`<b>Special:</b> ${escapeHtml(row.special)}`);
    if (row.description && !row.benefit) {
      bits.push(`<b>Description:</b> ${escapeHtml(row.description)}`);
    }
    return { html: bits.join("<br>"), entryId: row.id };
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
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
