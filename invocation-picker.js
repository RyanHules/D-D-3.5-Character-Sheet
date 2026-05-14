// invocation-picker.js — Warlock / Dragonfire Adept / etc. invocation
// picker. Warlock invocations are essentially the class's spell list —
// known, at-will, picked at level-up. No dedicated UI surface exists
// for them today, so we wire into the Feats tab's Special Abilities
// list (which already hosts class features and racial traits).
//
// Layout: picker bar injected next to the "+ Add Special Ability"
// button with Grade + Subcategory filters + Invocation autocomplete +
// "+ Add" button. Selecting an invocation and clicking + Add inserts
// a formatted entry ("Name (Grade, Lvl-equiv N) — description") into
// the Special Abilities list via Feats.addSpecialAbility.

(function () {
  if (!window.DB) {
    console.warn('[invocation-picker] DB module not loaded');
    return;
  }

  // Lower-case name → invocation record (see init).
  const invocationIndex = new Map();
  let grades = [];
  let subcategories = [];

  function init() {
    const rows = DB.query(
      "SELECT id AS invocation_id, name, source, version, "
      + "json_extract(data, '$.kind')                    AS kind, "
      + "json_extract(data, '$.warlock_class')           AS warlock_class, "
      + "json_extract(data, '$.grade')                   AS grade, "
      + "json_extract(data, '$.spell_level_equivalent')  AS spell_level_equivalent, "
      + "json_extract(data, '$.subcategory')             AS subcategory, "
      + "json_extract(data, '$.description')             AS description "
      + "FROM entry WHERE type = 'invocation' "
      + "ORDER BY name COLLATE NOCASE, "
      + "CASE version WHEN '3.5' THEN 0 ELSE 1 END"
    );
    const gradeSet = new Set();
    const subSet = new Set();
    for (const r of rows) {
      const key = (r.name || '').toLowerCase();
      if (invocationIndex.has(key)) continue;
      invocationIndex.set(key, r);
      if (r.grade) gradeSet.add(r.grade);
      if (r.subcategory) subSet.add(r.subcategory);
    }
    // Sort grades by canonical D&D order (Least → Lesser → Greater → Dark).
    const ORDER = ['Least', 'Lesser', 'Greater', 'Dark'];
    grades = [...gradeSet].sort((a, b) => {
      const ai = ORDER.indexOf(a), bi = ORDER.indexOf(b);
      if (ai >= 0 && bi >= 0) return ai - bi;
      if (ai >= 0) return -1;
      if (bi >= 0) return 1;
      return a.localeCompare(b);
    });
    subcategories = [...subSet].sort();
    console.log(`[invocation-picker] indexed ${invocationIndex.size} ` +
      `invocations across ${grades.length} grades, ` +
      `${subcategories.length} subcategories`);

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', injectUI);
    } else {
      injectUI();
    }
  }

  function injectUI() {
    if (document.querySelector('.invocation-picker')) return;
    const addBtn = document.getElementById('btn-add-special-ability');
    if (!addBtn) {
      console.warn('[invocation-picker] #btn-add-special-ability not found');
      return;
    }
    const wrap = document.createElement('div');
    wrap.className = 'invocation-picker';
    wrap.style.cssText =
      'padding:0.5rem; margin-bottom:0.5rem; ' +
      'background:rgba(255,255,255,0.04); border-left:3px solid #6a6a8a; ' +
      'border-radius:3px;';

    const gradeOpts = grades
      .map(g => `<option value="${escapeAttr(g)}">${escapeHtml(g)}</option>`)
      .join('');
    const subOpts = subcategories
      .map(s => `<option value="${escapeAttr(s)}">${escapeHtml(s)}</option>`)
      .join('');

    wrap.innerHTML = `
      <div style="display:flex;gap:0.4rem;align-items:flex-end;flex-wrap:wrap">
        <div class="field" style="flex:1 1 8rem;min-width:7rem">
          <label>Grade</label>
          <select id="invo-lookup-grade">
            <option value="">Any grade</option>
            ${gradeOpts}
          </select>
        </div>
        <div class="field" style="flex:1 1 10rem;min-width:9rem">
          <label>Subcategory</label>
          <select id="invo-lookup-sub">
            <option value="">Any subcategory</option>
            ${subOpts}
          </select>
        </div>
        <div class="field" style="flex:2 1 14rem;min-width:12rem">
          <label>Invocation</label>
          <input type="text" id="invo-lookup" list="invocation-options"
                 placeholder="(filter then pick)" autocomplete="off">
          <datalist id="invocation-options"></datalist>
        </div>
        <button type="button" id="invo-lookup-add" class="btn-add"
                style="height:2rem"
                title="Add to Special Abilities list">
          + Add to Specials
        </button>
      </div>
      <div id="invo-info"
           style="display:none;font-size:0.85em;color:#ccc;margin-top:0.4rem">
      </div>
    `;
    addBtn.parentElement.insertBefore(wrap, addBtn);
    wirePicker();
  }

  function wirePicker() {
    const gradeSel = document.getElementById('invo-lookup-grade');
    const subSel   = document.getElementById('invo-lookup-sub');
    const invoIn   = document.getElementById('invo-lookup');
    const info     = document.getElementById('invo-info');
    const addBtn   = document.getElementById('invo-lookup-add');
    const datalist = document.getElementById('invocation-options');

    function refresh() {
      const g = gradeSel.value;
      const s = subSel.value;
      datalist.innerHTML = '';
      let n = 0;
      for (const r of invocationIndex.values()) {
        if (g && r.grade !== g) continue;
        if (s && r.subcategory !== s) continue;
        const opt = document.createElement('option');
        opt.value = r.name;
        opt.label = [r.grade, r.subcategory].filter(Boolean).join(' / ')
          || `L${r.spell_level_equivalent ?? '?'}`;
        datalist.appendChild(opt);
        n++;
      }
      const parts = [];
      if (g) parts.push(g);
      if (s) parts.push(s);
      invoIn.placeholder = parts.length
        ? `${n} ${parts.join(' + ')} invocation${n === 1 ? '' : 's'}`
        : 'e.g. Eldritch Spear';
    }

    function updateInfo() {
      const r = invocationIndex.get(invoIn.value.trim().toLowerCase());
      if (!r) { info.style.display = 'none'; info.innerHTML = ''; return; }
      info.style.display = 'block';
      info.innerHTML = renderInfo(r);
      if (window.ErrataBadge) ErrataBadge.attach(info, r.invocation_id);
    }

    function addToSpecials() {
      const r = invocationIndex.get(invoIn.value.trim().toLowerCase());
      if (!r) { flash('Pick an invocation first.', '#a66'); return; }
      const text = formatForSpecials(r);
      // De-dupe by name (case-insensitive) so re-adding is a no-op.
      const existing = Array.from(
        document.querySelectorAll('#special-abilities-container ' +
          '.special-ability-entry')
      ).map(t => (t.value || '').toLowerCase());
      if (existing.some(s => s.startsWith(r.name.toLowerCase()))) {
        flash(`"${r.name}" already in Special Abilities.`, '#aa8');
        return;
      }
      if (typeof window.Feats?.addSpecialAbility === 'function') {
        window.Feats.addSpecialAbility(text);
        flash(`Added "${r.name}".`, '#7a9');
      } else {
        flash('Feats module unavailable.', '#a66');
      }
    }

    function flash(msg, color) {
      const note = document.createElement('div');
      note.style.cssText = `margin-top:0.3rem;color:${color};font-style:italic`;
      note.textContent = msg;
      info.appendChild(note);
      info.style.display = 'block';
      setTimeout(() => note.remove(), 3500);
    }

    gradeSel.addEventListener('change', refresh);
    subSel  .addEventListener('change', refresh);
    invoIn  .addEventListener('input',  updateInfo);
    invoIn  .addEventListener('change', updateInfo);
    addBtn  .addEventListener('click',  addToSpecials);

    refresh();
  }

  function formatForSpecials(r) {
    const head = [
      r.name,
      r.grade && `${r.grade} invocation`,
      r.spell_level_equivalent != null
        ? `lvl-equiv ${r.spell_level_equivalent}` : null,
      r.subcategory,
    ].filter(Boolean).join(' · ');
    return r.description ? `${head}\n${r.description}` : head;
  }

  function renderInfo(r) {
    const head = `<b>${escapeHtml(r.name)}</b> ` +
      `<span style="opacity:.7">(${escapeHtml(r.source || '?')})</span>`;
    const bits = [head];
    const meta = [
      r.warlock_class,
      r.grade && `${r.grade} invocation`,
      r.spell_level_equivalent != null
        ? `Spell-level equivalent: ${r.spell_level_equivalent}` : null,
      r.subcategory,
    ].filter(Boolean).map(escapeHtml).join(' · ');
    if (meta) bits.push(meta);
    if (r.description) {
      const d = r.description.length > 400
        ? r.description.slice(0, 400) + '…' : r.description;
      bits.push(escapeHtml(d));
    }
    return bits.join('<br>');
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function escapeAttr(s) { return escapeHtml(s); }

  DB.ready.then((db) => { if (db) init(); });
})();
