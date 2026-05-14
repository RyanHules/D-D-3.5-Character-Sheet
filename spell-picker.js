// spell-picker.js — Inject a spell autocomplete + filter widget into
// every Spellcasting sub-tab. Lets the user search for spells by
// class+level, see school/components/duration, and add them to the
// appropriate Known/Available or Prepared textarea with one click.
//
// Pure additive — `spells.js` is untouched; we attach via a
// MutationObserver on #spells-content that fires when new
// `.inner-tab-content[data-caster-type="spellcasting"]` panels appear.
//
// Per-panel UI inserted above the level tabs:
//   .sp-class    (input + datalist) — class picker (Wizard, Sorcerer, …)
//   .sp-level    (input number)     — spell level 0..9 (or higher)
//   .sp-spell    (input + datalist) — spell name autocomplete (filtered)
//   .sp-add-known (button)          — append to .sc-spell-text[data-lvl=N]
//   .sp-add-prep  (button)          — append to .sc-spell-prepared[data-lvl=N]
//   .sp-info     (div)              — school, components, range, …
//
// The class column in `spell_class_level` is messy: a mix of full names
// ("Wizard"), abbreviations ("Wiz"), case-different duplicates ("wizard",
// "C l e r i c"). We normalize via CLASS_ALIASES + space-collapse, then
// reverse-map canonical name → [raw variants] so a lookup for "Wizard"
// finds spells filed under any of those variants.

(function () {
  if (!window.DB) {
    console.warn('[spell-picker] DB module not loaded');
    return;
  }

  // Lowercased input → canonical class name. Order doesn't matter; the
  // raw DB values are normalized through this map at index-build time.
  const CLASS_ALIASES = {
    // Core casters
    'wiz': 'Wizard',         'wizard': 'Wizard',
    'sor': 'Sorcerer',       'sorcerer': 'Sorcerer',
    'clr': 'Cleric',         'cleric': 'Cleric',
    'drd': 'Druid',          'druid': 'Druid',
    'pal': 'Paladin',        'paladin': 'Paladin',
    'rgr': 'Ranger',         'ranger': 'Ranger',
    'brd': 'Bard',           'bard': 'Bard',
    // Common prestige + alt casters
    'asn': 'Assassin',       'assassin': 'Assassin',
    'blk': 'Blackguard',     'blackguard': 'Blackguard',
    'hrp': 'Harper Scout',   'harper scout': 'Harper Scout',
    'hexblade': 'Hexblade',
    'wmg': 'Warmage',        'warmage': 'Warmage',
    'wuj': 'Wu Jen',         'wij': 'Wu Jen',  'wu jen': 'Wu Jen',
    'shu': 'Shugenja',       'shugenja': 'Shugenja',
    'sha': 'Shugenja',       // ambiguous; shugenja is the most common in spell tables
    'soh': 'Sohei',
    'maho': 'Maho-tsukai',
    'duskblade': 'Duskblade',
    'beguiler': 'Beguiler',
    'dread necromancer': 'Dread Necromancer',
    'healer': 'Healer',
    'urban druid': 'Urban Druid',
    'death delver': 'Death Delver',
    'champion of gwynharwyf': 'Champion of Gwynharwyf',
    'apostle of peace': 'Apostle of Peace',
  };

  // canonical class name → [raw class_name variants in DB]
  let canonical = new Map();
  // sorted canonical names for the class datalist
  let classNamesSorted = [];
  // used to mint unique datalist IDs per panel
  let datalistCounter = 0;

  // Collapse runs of single letters separated by spaces ("C l e r i c" →
  // "cleric"), then trim/lowercase.
  function squashKey(s) {
    let t = String(s || '').trim();
    if (/^(\s*[a-zA-Z]\s+){2,}[a-zA-Z]\s*$/.test(t)) {
      t = t.replace(/\s+/g, '');
    }
    return t.toLowerCase().replace(/\s+/g, ' ').trim();
  }

  function normalizeClass(rawName) {
    const k = squashKey(rawName);
    if (!k) return null;
    if (CLASS_ALIASES[k]) return CLASS_ALIASES[k];
    // Title-case the squashed form so "wizard" / "WIZARD" / "Wizard"
    // collapse to one bucket even without an explicit alias.
    return k.replace(/\b\w/g, c => c.toUpperCase());
  }

  function buildCanonicalMap() {
    const rows = DB.query("SELECT DISTINCT class_name FROM spell_class_level");
    canonical = new Map();
    for (const r of rows) {
      if (!r.class_name) continue;
      const norm = normalizeClass(r.class_name);
      if (!norm) continue;
      if (!canonical.has(norm)) canonical.set(norm, []);
      canonical.get(norm).push(r.class_name);
    }
    classNamesSorted = [...canonical.keys()].sort((a, b) => a.localeCompare(b));
    console.log(`[spell-picker] indexed ${rows.length} raw class entries → ` +
      `${classNamesSorted.length} canonical classes`);
  }

  function spellsFor(canonicalName, level) {
    const variants = canonical.get(canonicalName);
    if (!variants || !variants.length) return [];
    const placeholders = variants.map(() => '?').join(',');
    // Order 3.5 rows first, then newest publication date, so the
    // case-insensitive dedup picks the canonical 3.5 form (e.g.
    // Spell Compendium "Cure Light Wounds" wins over PHB if both
    // exist, since SC is newer).
    return DB.query(
      "SELECT DISTINCT e.id AS spell_id, e.name, e.school, e.version, " +
      "       e.source, b.publication_date " +
      "FROM entry e JOIN spell_class_level scl ON e.id = scl.entry_id " +
      "LEFT JOIN book b ON b.name = e.source " +
      "WHERE e.type = 'spell' " +
      `AND scl.class_name IN (${placeholders}) AND scl.level = ? ` +
      "ORDER BY CASE e.version WHEN '3.5' THEN 0 ELSE 1 END, " +
      "         b.publication_date DESC, " +
      "         e.name COLLATE NOCASE",
      [...variants, level]
    );
  }

  function spellByName(name) {
    // Case-insensitive match so "Fireball" matches both 3.5 "Fireball"
    // and 3.0 "FIREBALL"; 3.5 wins via the ORDER BY, then newest book.
    return DB.queryOne(
      "SELECT e.id AS spell_id, e.name, e.source, e.version, "
      + "e.school, e.subschool, e.descriptor, "
      + "json_extract(e.data, '$.components')        AS components, "
      + "json_extract(e.data, '$.casting_time')      AS casting_time, "
      + "json_extract(e.data, '$.range')             AS range, "
      + "json_extract(e.data, '$.target')            AS target, "
      + "json_extract(e.data, '$.area')              AS area, "
      + "json_extract(e.data, '$.effect')            AS effect, "
      + "json_extract(e.data, '$.duration')          AS duration, "
      + "json_extract(e.data, '$.saving_throw')      AS saving_throw, "
      + "json_extract(e.data, '$.spell_resistance')  AS spell_resistance, "
      + "json_extract(e.data, '$.description')       AS description "
      + "FROM entry e "
      + "LEFT JOIN book b ON b.name = e.source "
      + "WHERE e.type = 'spell' AND e.name = ? COLLATE NOCASE "
      + "ORDER BY CASE e.version WHEN '3.5' THEN 0 ELSE 1 END, "
      + "         b.publication_date DESC LIMIT 1",
      [name]
    );
  }

  // Append `entry` as its own line to `textarea`, skipping if an
  // exact-trimmed-equals match already exists. Triggers the input event
  // so spell counters update.
  function appendLine(textarea, entry) {
    if (!textarea) return false;
    const lines = String(textarea.value || '').split(/\r?\n/);
    const exists = lines.some(l => l.trim().toLowerCase() === entry.trim().toLowerCase());
    if (exists) return false;
    const existing = String(textarea.value || '').replace(/\s+$/, '');
    textarea.value = existing ? `${existing}\n${entry}` : entry;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }

  function buildSharedClassDatalist() {
    let dl = document.getElementById('spell-picker-class-options');
    if (dl) return dl;
    dl = document.createElement('datalist');
    dl.id = 'spell-picker-class-options';
    for (const c of classNamesSorted) {
      const opt = document.createElement('option');
      opt.value = c;
      dl.appendChild(opt);
    }
    document.body.appendChild(dl);
    return dl;
  }

  // Tag → Set<spell_id> + counts for fast filtering.
  const spellTagIndex = new Map();
  const spellTagCounts = new Map();
  let spellTagsBuilt = false;

  function buildSpellTagIndex() {
    if (spellTagsBuilt) return;
    spellTagsBuilt = true;
    const rows = DB.query(
      "SELECT t.tag, t.entry_id FROM tag t "
      + "JOIN entry e ON e.id = t.entry_id WHERE e.type = 'spell'"
    );
    for (const r of rows) {
      if (!spellTagIndex.has(r.tag)) spellTagIndex.set(r.tag, new Set());
      spellTagIndex.get(r.tag).add(r.entry_id);
      spellTagCounts.set(r.tag, (spellTagCounts.get(r.tag) || 0) + 1);
    }
  }

  function injectPicker(panel) {
    if (!panel || panel.querySelector('.spell-picker')) return;
    const tabsEl = panel.querySelector('.spell-list-tabs');
    if (!tabsEl) return; // panel not ready yet

    buildSharedClassDatalist();
    buildSpellTagIndex();

    const dlId = `spell-picker-spells-${++datalistCounter}`;
    // Top tags only — keep the dropdown tractable.
    const sortedTags = [...spellTagCounts.entries()]
      .filter(([, c]) => c >= 20)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const wrap = document.createElement('div');
    wrap.className = 'spell-picker';
    wrap.style.cssText =
      'padding:0.5rem; margin-bottom:0.5rem; ' +
      'background:rgba(255,255,255,0.04); border-left:3px solid #8a6a8a; ' +
      'border-radius:3px;';
    wrap.innerHTML = `
      <div style="display:flex;gap:0.4rem;align-items:flex-end;flex-wrap:wrap">
        <div class="field" style="flex:1 1 10rem;min-width:8rem">
          <label>Class</label>
          <input type="text" class="sp-class" list="spell-picker-class-options"
                 placeholder="e.g. Wizard" autocomplete="off">
        </div>
        <div class="field field-sm" style="width:5rem">
          <label>Level</label>
          <input type="number" class="sp-level" min="0" max="9" value="0">
        </div>
        <div class="field" style="flex:1 1 8rem;min-width:7rem">
          <label>Tag</label>
          <select class="sp-tag">
            <option value="">Any tag</option>
            ${sortedTags.map(([t, c]) =>
              `<option value="${escapeHtml(t)}">${escapeHtml(t)} (${c})</option>`
            ).join('')}
          </select>
        </div>
        <div class="field" style="flex:2 1 14rem;min-width:12rem">
          <label>Spell</label>
          <input type="text" class="sp-spell" list="${dlId}"
                 placeholder="(pick class + level first)" autocomplete="off">
          <datalist id="${dlId}"></datalist>
        </div>
        <button type="button" class="btn-add sp-add-known"
                title="Add to Known/Available list at the picker level">
          + Known
        </button>
        <button type="button" class="btn-add sp-add-prep"
                title="Add to Prepared list at the picker level">
          + Prepared
        </button>
      </div>
      <div class="sp-info"
           style="display:none;font-size:0.85em;color:#ccc;margin-top:0.4rem">
      </div>
    `;
    tabsEl.parentElement.insertBefore(wrap, tabsEl);

    wirePicker(panel, wrap, dlId);
  }

  function wirePicker(panel, picker, dlId) {
    const classInput = picker.querySelector('.sp-class');
    const levelInput = picker.querySelector('.sp-level');
    const tagSelect  = picker.querySelector('.sp-tag');
    const spellInput = picker.querySelector('.sp-spell');
    const info       = picker.querySelector('.sp-info');
    const addKnown   = picker.querySelector('.sp-add-known');
    const addPrep    = picker.querySelector('.sp-add-prep');
    const datalist   = picker.querySelector(`#${dlId}`);

    let currentSpells = []; // last filter result, by lowercase name
    let currentByName = new Map();

    function refreshSpellList() {
      const cls = normalizeClass(classInput.value);
      const lvl = parseInt(levelInput.value, 10);
      const tag = tagSelect.value;
      const tagSet = tag ? spellTagIndex.get(tag) : null;
      datalist.innerHTML = '';
      currentSpells = [];
      currentByName = new Map();
      if (!cls || !canonical.has(cls) || isNaN(lvl) || lvl < 0) {
        spellInput.placeholder = '(pick class + level first)';
        return;
      }
      currentSpells = spellsFor(cls, lvl);
      // Dedupe by case-insensitive name; prefer 3.5 over 3.0 since the
      // ORDER BY in spellsFor puts 3.5 rows first, so the FIRST entry
      // for each name is the canonical (3.5) form. Also apply the
      // tag filter if set.
      for (const s of currentSpells) {
        if (tagSet && !tagSet.has(s.spell_id)) continue;
        const k = s.name.toLowerCase();
        if (currentByName.has(k)) continue;
        currentByName.set(k, s);
        const opt = document.createElement('option');
        opt.value = s.name;
        // No opt.label — Firefox renders it as visible suggestion text.
        datalist.appendChild(opt);
      }
      const n = currentByName.size;
      const suffix = tag ? ` (tag:${tag})` : '';
      spellInput.placeholder =
        n
          ? `${n} ${cls} ${lvl} spell${n === 1 ? '' : 's'}${suffix}`
          : `(no ${cls} ${lvl} spells${suffix})`;
      updateInfoPanel();
    }

    function updateInfoPanel() {
      const typed = spellInput.value.trim();
      if (!typed) { info.style.display = 'none'; info.innerHTML = ''; return; }
      // Look up by typed name (prefer current filter, fall back to any spell).
      let s = currentByName.get(typed.toLowerCase());
      if (!s) s = spellByName(typed);
      if (!s) { info.style.display = 'none'; info.innerHTML = ''; return; }
      // Pull the full record for richer info if we only got a stub.
      const full = (s.description !== undefined) ? s : spellByName(s.name);
      const bits = [];
      bits.push(`<b>${escapeHtml(full.name)}</b>` +
        ` <span style="opacity:.7">(${escapeHtml(full.version || '?')})</span>`);
      if (full.school) {
        const subAndDesc = [full.subschool, full.descriptor].filter(Boolean).join(', ');
        bits.push(`<b>School:</b> ${escapeHtml(full.school)}` +
          (subAndDesc ? ` (${escapeHtml(subAndDesc)})` : ''));
      }
      if (full.components)    bits.push(`<b>Components:</b> ${escapeHtml(full.components)}`);
      if (full.casting_time)  bits.push(`<b>Cast:</b> ${escapeHtml(full.casting_time)}`);
      if (full.range)         bits.push(`<b>Range:</b> ${escapeHtml(full.range)}`);
      if (full.duration)      bits.push(`<b>Duration:</b> ${escapeHtml(full.duration)}`);
      if (full.saving_throw)  bits.push(`<b>Save:</b> ${escapeHtml(full.saving_throw)}`);
      if (full.spell_resistance) bits.push(`<b>SR:</b> ${escapeHtml(full.spell_resistance)}`);
      info.innerHTML = bits.join(' &nbsp;·&nbsp; ');
      if (window.ErrataBadge) ErrataBadge.attach(info, full.spell_id);
      info.style.display = 'block';
    }

    classInput.addEventListener('input', refreshSpellList);
    levelInput.addEventListener('input', refreshSpellList);
    tagSelect.addEventListener('change', refreshSpellList);
    spellInput.addEventListener('input', updateInfoPanel);
    spellInput.addEventListener('change', updateInfoPanel);

    function findTextarea(kind) {
      const lvl = parseInt(levelInput.value, 10);
      if (isNaN(lvl)) return null;
      const sel = kind === 'known'
        ? `.sc-spell-text[data-lvl="${lvl}"]`
        : `.sc-spell-prepared[data-lvl="${lvl}"]`;
      return panel.querySelector(sel);
    }

    function flash(msg, color) {
      const note = document.createElement('div');
      note.style.cssText = `margin-top:0.3rem;color:${color};font-style:italic`;
      note.textContent = msg;
      info.appendChild(note);
      info.style.display = 'block';
      setTimeout(() => note.remove(), 3500);
    }

    function add(kind) {
      const name = spellInput.value.trim();
      if (!name) { flash('Pick a spell first.', '#a66'); return; }
      const ta = findTextarea(kind);
      if (!ta) {
        flash(`No level ${levelInput.value} list — try Add Spell Level first.`, '#a66');
        return;
      }
      const ok = appendLine(ta, name);
      flash(
        ok ? `Added "${name}" to ${kind === 'known' ? 'Known/Available' : 'Prepared'}.`
           : `"${name}" already in that list.`,
        ok ? '#7a9' : '#aa8'
      );
    }
    addKnown.addEventListener('click', () => add('known'));
    addPrep .addEventListener('click', () => add('prep'));
  }

  function injectIntoExistingPanels() {
    document
      .querySelectorAll('#spells-content [data-caster-type="spellcasting"]')
      .forEach(injectPicker);
  }

  function watchForNewPanels() {
    const root = document.getElementById('spells-content');
    if (!root) return;
    const obs = new MutationObserver(muts => {
      for (const m of muts) {
        for (const node of m.addedNodes) {
          if (node.nodeType !== 1) continue;
          if (node.matches?.('[data-caster-type="spellcasting"]')) {
            // Defer slightly so spells.js can finish populating innards.
            setTimeout(() => injectPicker(node), 0);
          } else {
            node.querySelectorAll?.('[data-caster-type="spellcasting"]')
                .forEach(p => setTimeout(() => injectPicker(p), 0));
          }
        }
      }
    });
    obs.observe(root, { childList: true, subtree: true });
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  DB.ready.then((db) => {
    if (!db) return;
    buildCanonicalMap();
    injectIntoExistingPanels();
    watchForNewPanels();
  });
})();
