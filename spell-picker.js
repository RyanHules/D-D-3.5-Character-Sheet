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
    // Prepared lists routinely contain duplicates — wizards prepare
    // Fireball ×3, etc. — and metamagicked entries differ from their
    // base spell only by a `[suffix]`, so dedup-by-name would be
    // actively wrong. Just append.
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
      <div class="sp-metamagic" style="display:none;margin-top:0.4rem;
                                       padding-top:0.4rem;
                                       border-top:1px dashed rgba(255,255,255,0.1);
                                       font-size:0.85em">
        <span style="opacity:0.8;margin-right:0.4rem">Metamagic:</span>
        <span class="sp-mm-options" style="display:inline-flex;flex-wrap:wrap;gap:0.5rem"></span>
        <span class="sp-mm-effective" style="margin-left:0.5rem;opacity:0.85"></span>
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
    const mmWrap     = picker.querySelector('.sp-metamagic');
    const mmOpts     = picker.querySelector('.sp-mm-options');
    const mmEff      = picker.querySelector('.sp-mm-effective');

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
    levelInput.addEventListener('input', refreshMetamagicRow);
    tagSelect.addEventListener('change', refreshSpellList);
    spellInput.addEventListener('input', updateInfoPanel);
    spellInput.addEventListener('change', updateInfoPanel);

    // --- Metamagic row -------------------------------------------------
    // Read the character's metamagic feats from the Feats tab, filter
    // against the catalog, and build a checkbox + numeric-input row.
    // Re-runs whenever the picker becomes visible, the base level
    // changes, or feats get added on the Feats tab.
    function readCharacterMetamagicFeats() {
      // Feats live in #feats-container as .feat-entry textareas;
      // each textarea's first line is the feat name (additional
      // lines are notes/details).
      const inputs = document.querySelectorAll('#feats-container .feat-entry');
      const names = [];
      for (const el of inputs) {
        const raw = String(el.value || '').trim();
        if (!raw) continue;
        // Take only the first line as the feat name. Strip a trailing
        // parenthetical ("Quicken Spell (Spec)" → "Quicken Spell").
        const firstLine = raw.split(/\r?\n/)[0].trim();
        const stripped = firstLine.replace(/\s*\([^)]*\)\s*$/, '').trim();
        if (stripped) names.push(stripped);
      }
      // Filter to names that look up successfully in DB (preferred)
      // or the local catalog (fallback for homebrew). DB lookup
      // hits `entry.data.metamagic.level_adjustment`.
      return names.filter(n => lookupMetamagic(n) !== null);
    }

    // Unified metamagic lookup: DB first, JS catalog fallback. Returns
    // `{ levelAdjustment, effect, actionTypeMod, variableTarget? }`
    // or null. Cached per-name to avoid re-querying.
    const _mmLookupCache = new Map();
    function lookupMetamagic(name) {
      const key = String(name || '').trim();
      if (!key) return null;
      if (_mmLookupCache.has(key)) return _mmLookupCache.get(key);
      let result = null;
      if (window.DB && DB.isLoaded()) {
        const row = DB.queryOne(
          "SELECT json_extract(data, '$.metamagic.level_adjustment') AS adj, " +
          "       json_extract(data, '$.metamagic.action_type_mod')   AS act, " +
          "       json_extract(data, '$.metamagic.effect_summary')    AS eff " +
          "FROM entry WHERE type='feat' AND name = :n COLLATE NOCASE " +
          "AND types_csv LIKE '%Metamagic%' LIMIT 1", { ':n': key });
        if (row && row.adj !== null) {
          const adj = row.adj;
          result = {
            levelAdjustment: (adj === 'variable') ? 'variable'
                             : (typeof adj === 'number' ? adj : parseInt(adj, 10)),
            effect: row.eff || '',
            actionTypeMod: row.act || undefined,
            variableTarget: (key === 'Heighten Spell' || key === 'Improved Heighten Spell'),
          };
        }
      }
      // Fall back to the JS catalog (homebrew feats not in DB).
      if (!result && window.MetamagicCatalog && MetamagicCatalog.has(key)) {
        result = MetamagicCatalog.get(key);
      }
      _mmLookupCache.set(key, result);
      return result;
    }

    function refreshMetamagicRow() {
      const feats = readCharacterMetamagicFeats();
      if (!feats.length) {
        mmWrap.style.display = 'none';
        mmOpts.innerHTML = '';
        mmEff.textContent = '';
        return;
      }
      mmWrap.style.display = '';
      // Preserve checkbox/input state across rebuilds so the row stays
      // sticky when the user changes spell level.
      const prevState = collectMetamagicState();
      mmOpts.innerHTML = '';
      for (const featName of feats) {
        const meta = lookupMetamagic(featName);
        if (!meta) continue;
        const label = document.createElement('label');
        label.style.cssText = 'display:inline-flex;align-items:center;gap:0.2rem';
        label.title = meta.effect;
        if (meta.variableTarget) {
          // Heighten Spell — target-level number input next to the
          // checkbox. The checkbox enables it; the number sets target.
          const cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.className = 'sp-mm-check';
          cb.dataset.feat = featName;
          cb.dataset.variable = '1';
          const num = document.createElement('input');
          num.type = 'number';
          num.className = 'sp-mm-target';
          num.dataset.feat = featName;
          num.min = '0';
          num.max = '9';
          num.style.cssText = 'width:3.2rem';
          // Restore prior state, with a default target one level up.
          const baseLvl = parseInt(levelInput.value, 10);
          const priorChecked = prevState.checked.has(featName);
          const priorTarget = prevState.targets.get(featName);
          cb.checked = priorChecked;
          num.value = priorTarget !== undefined
            ? priorTarget
            : (isNaN(baseLvl) ? '' : Math.min(9, baseLvl + 1));
          cb.addEventListener('change', recomputeEffective);
          num.addEventListener('input', recomputeEffective);
          label.append(cb, document.createTextNode(' '),
            document.createTextNode(featName), document.createTextNode(' → '),
            num);
        } else {
          const cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.className = 'sp-mm-check';
          cb.dataset.feat = featName;
          cb.checked = prevState.checked.has(featName);
          cb.addEventListener('change', recomputeEffective);
          const adj = meta.levelAdjustment;
          const adjLabel = (typeof adj === 'number')
            ? ` (+${adj})`
            : ` (±?)`;
          label.append(cb, document.createTextNode(' '),
            document.createTextNode(featName + adjLabel));
        }
        mmOpts.appendChild(label);
      }
      recomputeEffective();
    }

    function collectMetamagicState() {
      const checked = new Set();
      const targets = new Map();
      for (const cb of mmOpts.querySelectorAll('.sp-mm-check')) {
        if (cb.checked) checked.add(cb.dataset.feat);
      }
      for (const num of mmOpts.querySelectorAll('.sp-mm-target')) {
        targets.set(num.dataset.feat, num.value);
      }
      return { checked, targets };
    }

    // Compute the spell's effective level (base + sum of fixed
    // adjustments) plus the Heighten target if active. Returns
    // { effectiveLevel, parts: [{name, delta}], suffixes: [string] }.
    function effectiveMetamagic() {
      const base = parseInt(levelInput.value, 10);
      const baseValid = !isNaN(base) && base >= 0;
      const parts = [];
      const suffixes = [];
      let total = baseValid ? base : 0;
      let heightenTarget = null;
      for (const cb of mmOpts.querySelectorAll('.sp-mm-check')) {
        if (!cb.checked) continue;
        const meta = lookupMetamagic(cb.dataset.feat);
        if (!meta) continue;
        if (meta.variableTarget) {
          const num = mmOpts.querySelector(
            `.sp-mm-target[data-feat="${cb.dataset.feat}"]`);
          const t = parseInt(num?.value, 10);
          if (!isNaN(t) && t > base) {
            heightenTarget = Math.max(heightenTarget || 0, t);
            parts.push({ name: cb.dataset.feat, delta: t - base });
            suffixes.push(`Heightened to ${t}`);
          }
        } else if (typeof meta.levelAdjustment === 'number') {
          total += meta.levelAdjustment;
          parts.push({ name: cb.dataset.feat, delta: meta.levelAdjustment });
          // Strip the trailing " Spell" so the bracket suffix reads
          // "Empowered" not "Empower Spell". A few feats don't have
          // that suffix so we fall back to the literal name.
          const tag = featNameToTag(cb.dataset.feat);
          suffixes.push(tag);
        }
      }
      // Heighten target replaces total when higher than the additive.
      if (heightenTarget !== null) {
        total = Math.max(total, heightenTarget);
      }
      return { effectiveLevel: total, base, parts, suffixes, baseValid };
    }

    function recomputeEffective() {
      const r = effectiveMetamagic();
      if (!r.baseValid || r.parts.length === 0) {
        mmEff.textContent = '';
        return;
      }
      mmEff.innerHTML =
        `→ <b>L${r.effectiveLevel}</b> slot ` +
        `<span style="opacity:0.6">(${r.parts
          .map(p => `${p.name} +${p.delta}`).join(', ')})</span>`;
    }

    function featNameToTag(name) {
      // "Empower Spell" → "Empowered"; "Maximize Spell" → "Maximized";
      // most metamagic feats end in " Spell". For odd ones (Sanctum
      // Spell stays as-is; Energy Substitution, etc.) return the name.
      const m = name.match(/^(\w+)\s+Spell$/);
      if (!m) return name;
      const stem = m[1];
      // -ify → -ified (Purify → Purified), -en → -ened, default +ed/+d
      if (stem.endsWith('y'))      return stem.slice(0, -1) + 'ied';   // Purify, …
      if (stem.endsWith('e'))      return stem + 'd';                  // Maximize, Quicken (-en/-ed) handled below
      if (stem.endsWith('en'))     return stem + 'ed';                 // Widen → Widened, Heighten → Heightened
      // Generic regular past participle.
      return stem + 'ed';
    }

    // The metamagic row needs to refresh whenever the user opens or
    // returns to this panel — feats may have been added on the Feats
    // tab in the meantime. Use a focus listener on the picker root
    // plus a document-level listener on #feats-container, plus an
    // initial sweep.
    picker.addEventListener('focusin', refreshMetamagicRow);
    document.addEventListener('input', (e) => {
      if (e.target?.closest?.('#feats-container')) refreshMetamagicRow();
    });
    // Initial render.
    refreshMetamagicRow();

    function findTarget(kind) {
      const lvl = parseInt(levelInput.value, 10);
      if (isNaN(lvl)) return null;
      if (kind === 'known') {
        // Structured list in the left column — see spells.js
        // appendSpellListDiv. Returns the .sc-known-list[data-lvl=N]
        // container so we can append a row.
        return panel.querySelector(`.sc-known-list[data-lvl="${lvl}"]`);
      }
      return panel.querySelector(`.sc-spell-prepared[data-lvl="${lvl}"]`);
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
      // Metamagic ignored for Known — you learn / scribe the base
      // spell. Apply at cast/prep time. Same goes for invalid base
      // level on Prepared (can't compute effective level).
      if (kind === 'known') {
        const target = findTarget('known');
        if (!target) {
          flash(`No level ${levelInput.value} list — try Add Spell Level first.`, '#a66');
          return;
        }
        // Skip duplicates — match case-insensitively on existing rows.
        const existing = Array.from(target.querySelectorAll('.sc-known-name'))
          .map(el => (el.value || '').trim().toLowerCase());
        if (existing.includes(name.toLowerCase())) {
          flash(`"${name}" already in Known.`, '#aa8');
          return;
        }
        if (typeof Spells !== 'undefined' &&
            typeof Spells.addKnownSpell === 'function') {
          Spells.addKnownSpell(target, parseInt(levelInput.value, 10), name);
        } else {
          const row = document.createElement('div');
          row.className = 'sc-known-row';
          row.innerHTML =
            `<input type="text" class="sc-known-name" value="${name}">`;
          target.appendChild(row);
        }
        flash(`Added "${name}" to Known.`, '#7a9');
        return;
      }
      // Prepared path — apply any active metamagic. Route to the
      // effective-level Prepared textarea with a bracketed suffix.
      const r = effectiveMetamagic();
      const lvl = r.baseValid && r.parts.length > 0
        ? r.effectiveLevel
        : parseInt(levelInput.value, 10);
      if (isNaN(lvl)) {
        flash('Invalid spell level.', '#a66');
        return;
      }
      const target = panel.querySelector(`.sc-spell-prepared[data-lvl="${lvl}"]`);
      if (!target) {
        flash(`No level ${lvl} Prepared list — try Add Spell Level first.`, '#a66');
        return;
      }
      const entry = r.suffixes.length
        ? `${name} [${r.suffixes.join(', ')}]`
        : name;
      appendLine(target, entry);
      flash(
        r.suffixes.length
          ? `Added "${entry}" to L${lvl} Prepared.`
          : `Added "${entry}" to Prepared.`,
        '#7a9'
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

  // Global #spell-options datalist with every spell name in the DB.
  // Used by the structured Known list's row inputs (created in
  // spells.js::createKnownRow with `list="spell-options"`) so the
  // user gets autocomplete when typing directly into a row instead
  // of going through the picker bar. Built once at DB.ready; tiny
  // (~2,800 <option> elements ≈ <100 KB).
  function buildGlobalSpellDatalist() {
    if (document.getElementById('spell-options')) return;
    // 3.5-first dedup by case-insensitive name so we don't emit two
    // "Fireball" options when both 3.0 and 3.5 versions are indexed.
    const rows = DB.query(
      "SELECT e.name AS name FROM entry e " +
      "LEFT JOIN book b ON b.name = e.source " +
      "WHERE e.type = 'spell' AND e.name IS NOT NULL " +
      "ORDER BY CASE e.version WHEN '3.5' THEN 0 ELSE 1 END, " +
      "         b.publication_date DESC, " +
      "         e.name COLLATE NOCASE"
    );
    const seen = new Set();
    const dl = document.createElement('datalist');
    dl.id = 'spell-options';
    for (const r of rows) {
      const key = String(r.name || '').toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const opt = document.createElement('option');
      opt.value = r.name;
      // No `label` attribute — Firefox renders labels as visible
      // suggestion text in datalists (see CLAUDE.md datalist note).
      dl.appendChild(opt);
    }
    document.body.appendChild(dl);
    console.log(`[spell-picker] built #spell-options datalist with ` +
      `${seen.size} unique spell names`);
  }

  DB.ready.then((db) => {
    if (!db) return;
    buildCanonicalMap();
    buildGlobalSpellDatalist();
    injectIntoExistingPanels();
    watchForNewPanels();
  });
})();
