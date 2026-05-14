// lookup.js — Universal search/lookup modal over every entry in
// `dnd35.db`. Acts as a Spotlight-style reference layer on top of
// the existing 13 per-tab pickers.
//
// Activation:
//   - Ctrl/Cmd+K from anywhere on the page
//   - The "?" button injected into the header next to the title
//
// Behavior:
//   - Modal overlay; click backdrop or press Esc to close
//   - Search box auto-focused
//   - Filter chips for the most common entry types
//   - ↑/↓ to navigate result list; Enter to expand selected row;
//     Esc to close the modal
//
// Phase 1 (this file): modal shell + hotkey + button + keyboard
// nav. Search and result rendering are stubbed out — the index
// build and ranked filter happen in Phase 2; rich result rows +
// inline expand in Phase 3; errata badges in Phase 4; empty-state
// in Phase 5.

(function () {
  if (!window.DB) {
    console.warn('[lookup] DB module not loaded');
    return;
  }

  // ---- DOM construction ---------------------------------------------------

  let modalEl = null;       // the overlay root
  let inputEl = null;       // the search input
  let resultsEl = null;     // the results list container
  let footerEl = null;      // status / hint text at the bottom
  let chipsEl = null;       // the type-filter chip strip
  let selectedIdx = 0;      // index of the highlighted row (for ↑↓ nav)
  let lastResults = [];     // last rendered result list (cached for Enter)

  // Cross-type search index built at DB.ready. Each entry:
  //   { id, name, type, source, tags: Set<string>, nameKey, searchKey }
  // `nameKey` is lowercased+squashed for prefix/contains matching;
  // `searchKey` includes name + type + source + tags for fuzzy fallback.
  let entries = [];
  // Type → count, for the chip strip.
  const typeCounts = new Map();
  // Set of active type filters (empty = no filter).
  const activeTypes = new Set();

  // The 8 chips shown by default; everything else is grouped under
  // a "More…" expander. Order is tuned for player-facing utility.
  const PRIMARY_TYPES = [
    'spell', 'feat', 'item', 'creature', 'rule',
    'class', 'prc', 'race',
  ];
  // Display-friendly labels.
  const TYPE_LABELS = {
    spell: 'Spell', feat: 'Feat', item: 'Item', weapon: 'Weapon',
    armor: 'Armor', gear: 'Gear', creature: 'Creature', rule: 'Rule',
    class: 'Class', prc: 'PrC', race: 'Race', template: 'Template',
    domain: 'Domain', deity: 'Deity', region: 'Region', plane: 'Plane',
    maneuver: 'Maneuver', power: 'Power', mystery: 'Mystery',
    vestige: 'Vestige', utterance: 'Utterance', invocation: 'Invocation',
    soulmeld: 'Soulmeld', acf: 'ACF', subst_level: 'Subst. level',
    organization: 'Organization', poison: 'Poison',
    ravage_affliction: 'Ravage/Affliction', skill: 'Skill',
    skill_use: 'Skill use', skill_trick: 'Skill trick',
    condition: 'Condition',
  };

  function ensureModal() {
    if (modalEl) return modalEl;
    modalEl = document.createElement('div');
    modalEl.id = 'lookup-modal';
    modalEl.className = 'lookup-modal';
    modalEl.setAttribute('role', 'dialog');
    modalEl.setAttribute('aria-modal', 'true');
    modalEl.setAttribute('aria-label', 'Universal lookup');
    modalEl.style.display = 'none';
    modalEl.innerHTML = `
      <div class="lookup-backdrop" data-close="1"></div>
      <div class="lookup-card">
        <div class="lookup-search-row">
          <input id="lookup-input" type="text" autocomplete="off"
                 spellcheck="false"
                 placeholder="Search anything — feat, spell, rule, item, …">
          <button type="button" class="lookup-close" data-close="1"
                  aria-label="Close (Esc)">×</button>
        </div>
        <div class="lookup-chips" id="lookup-chips">
          <!-- Phase 2 will populate type-filter chips here -->
        </div>
        <div class="lookup-results" id="lookup-results" role="listbox">
          <!-- Phase 2/3 will render results here -->
        </div>
        <div class="lookup-footer" id="lookup-footer">
          <span class="lookup-hint">
            <kbd>↑</kbd><kbd>↓</kbd> navigate &nbsp;
            <kbd>Enter</kbd> expand &nbsp;
            <kbd>Esc</kbd> close
          </span>
          <span class="lookup-count" id="lookup-count"></span>
        </div>
      </div>
    `;
    document.body.appendChild(modalEl);

    inputEl   = modalEl.querySelector('#lookup-input');
    resultsEl = modalEl.querySelector('#lookup-results');
    footerEl  = modalEl.querySelector('#lookup-footer');
    chipsEl   = modalEl.querySelector('#lookup-chips');
    // Phase 5: wire click delegation for the empty-state widgets.
    wireEmptyStateClicks();

    // Close on backdrop / × click.
    modalEl.addEventListener('click', (ev) => {
      if (ev.target instanceof Element && ev.target.dataset.close === '1') {
        close();
      }
    });

    inputEl.addEventListener('input', onInput);
    inputEl.addEventListener('keydown', onInputKey);
    return modalEl;
  }

  function ensureTriggerButton() {
    // Inject a "?" button into the header. Find the header — falls
    // back to body if the header structure changes.
    if (document.getElementById('lookup-trigger-btn')) return;
    const btn = document.createElement('button');
    btn.id = 'lookup-trigger-btn';
    btn.type = 'button';
    btn.className = 'lookup-trigger';
    btn.title = 'Lookup anything (Ctrl+K)';
    btn.setAttribute('aria-label', 'Open universal lookup');
    btn.innerHTML = '🔍';
    btn.addEventListener('click', open);
    // Try to attach to the header; fall back to a corner-fixed
    // floating button so the user always has the affordance.
    const header = document.querySelector('header');
    if (header) {
      header.appendChild(btn);
    } else {
      btn.classList.add('lookup-trigger-floating');
      document.body.appendChild(btn);
    }
  }

  // ---- Open / close -------------------------------------------------------

  function open() {
    ensureModal();
    modalEl.style.display = '';
    // Defer focus until the browser has painted so the input is
    // actually focusable (Firefox quirk with display toggling).
    requestAnimationFrame(() => inputEl.focus());
    // Re-render in case the DB just loaded or the query persisted.
    render(inputEl.value.trim());
  }

  function close() {
    if (!modalEl) return;
    modalEl.style.display = 'none';
    // Return focus to whatever opened the modal — best-effort by
    // re-clicking the originating element isn't possible, so we just
    // blur our own input.
    inputEl?.blur();
  }

  function toggle() {
    if (!modalEl || modalEl.style.display === 'none') open();
    else close();
  }

  // ---- Keyboard handling --------------------------------------------------

  function onInput() {
    selectedIdx = 0;
    render(inputEl.value.trim());
  }

  function onInputKey(ev) {
    if (ev.key === 'Escape') {
      ev.preventDefault();
      close();
      return;
    }
    if (ev.key === 'ArrowDown') {
      ev.preventDefault();
      moveSelection(1);
      return;
    }
    if (ev.key === 'ArrowUp') {
      ev.preventDefault();
      moveSelection(-1);
      return;
    }
    if (ev.key === 'Enter') {
      ev.preventDefault();
      expandSelected();
      return;
    }
  }

  function moveSelection(delta) {
    if (!lastResults.length) return;
    selectedIdx = (selectedIdx + delta + lastResults.length) % lastResults.length;
    paintSelection();
    scrollSelectedIntoView();
  }

  function paintSelection() {
    const rows = resultsEl.querySelectorAll('.lookup-row');
    rows.forEach((r, i) => {
      r.classList.toggle('selected', i === selectedIdx);
      r.setAttribute('aria-selected', i === selectedIdx ? 'true' : 'false');
    });
  }

  function scrollSelectedIntoView() {
    const row = resultsEl.querySelectorAll('.lookup-row')[selectedIdx];
    if (!row) return;
    row.scrollIntoView({ block: 'nearest' });
  }

  function expandSelected() {
    const row = resultsEl.querySelectorAll('.lookup-row')[selectedIdx];
    if (!row) return;
    if (row.classList.contains('expanded')) {
      row.classList.remove('expanded');
      row.querySelector('.lookup-row-detail')?.remove();
      return;
    }
    // Record the query that produced this result. Saving here (instead
    // of on every input change) keeps the recent list signal-rich:
    // it captures queries the user actually found something useful in.
    if (inputEl) recordRecent(inputEl.value);
    // Collapse any other expanded row (single-expansion mode keeps
    // the list scannable).
    resultsEl.querySelectorAll('.lookup-row.expanded').forEach(r => {
      r.classList.remove('expanded');
      r.querySelector('.lookup-row-detail')?.remove();
    });
    // Render the detail panel inline.
    const entryId = parseInt(row.dataset.entryId, 10);
    const entryType = row.dataset.entryType;
    const detail = renderDetail(entryId, entryType);
    if (detail) {
      row.appendChild(detail);
      row.classList.add('expanded');
    }
  }

  // ---- Detail rendering ---------------------------------------------------

  // Cache fetched detail JSON by entry id; opening the same row twice
  // is cheap.
  const detailCache = new Map();

  function fetchDetail(entryId) {
    if (detailCache.has(entryId)) return detailCache.get(entryId);
    const row = DB.queryOne(
      "SELECT id, type, name, source, version, school, subschool, "
      + "descriptor, types_csv, item_type, body_slot, aura, "
      + "caster_level, price, weight, creature_size, creature_type, "
      + "cr, alignment, discipline, data "
      + "FROM entry WHERE id = ?", [entryId]
    );
    if (!row) { detailCache.set(entryId, null); return null; }
    let parsed = {};
    try { parsed = JSON.parse(row.data || '{}'); }
    catch (e) { /* leave parsed empty */ }
    const combined = Object.assign({}, parsed, row);
    delete combined.data;
    detailCache.set(entryId, combined);
    return combined;
  }

  function renderDetail(entryId, entryType) {
    const data = fetchDetail(entryId);
    if (!data) return null;
    const wrap = document.createElement('div');
    wrap.className = 'lookup-row-detail';
    wrap.innerHTML = renderDetailHtml(data, entryType);
    // Stop click bubbling so clicking inside the detail (e.g. on a
    // link) doesn't collapse the row.
    wrap.addEventListener('click', (ev) => ev.stopPropagation());
    // If this entry has errata of any kind (applied or advisory),
    // append a clickable ✦ errata button to the header that opens a
    // popover listing each record. Anchored to the header so it sits
    // next to the type label.
    if (window.ErrataBadge) {
      // Show even advisory-only records here — the user has opted in
      // by expanding the row.
      const btn = ErrataBadge.badge(entryId, { applied: false });
      if (btn) {
        const head = wrap.querySelector('.lookup-detail-head');
        if (head) head.appendChild(btn);
      }
    }
    return wrap;
  }

  function renderDetailHtml(d, type) {
    const bits = [];
    bits.push(renderHeader(d, type));
    bits.push(renderMeta(d, type));
    if (d.description) {
      bits.push(`<div class="lookup-detail-desc">${escapeHtml(d.description)}</div>`);
    }
    bits.push(renderTypeSpecific(d, type));
    bits.push(renderTags(d));
    return bits.filter(Boolean).join('');
  }

  function renderHeader(d, type) {
    const pieces = [];
    if (d.source) pieces.push(escapeHtml(d.source));
    if (d.version && d.version !== '3.5') pieces.push(escapeHtml(d.version));
    return `<div class="lookup-detail-head">` +
      `<span class="lookup-detail-type">${escapeHtml(TYPE_LABELS[type] || type)}</span>` +
      (pieces.length ? `<span class="lookup-detail-source">${pieces.join(' · ')}</span>` : '') +
      `</div>`;
  }

  // Top-of-detail "meta strip" with the most common at-a-glance
  // fields per entry type. School/components for spells, prereq for
  // feats, body slot/price for items, etc.
  function renderMeta(d, type) {
    const fields = META_FIELDS_BY_TYPE[type] || META_FIELDS_BY_TYPE._default;
    const items = [];
    for (const [label, key] of fields) {
      const v = pickField(d, key);
      if (v == null || v === '' || v === '—') continue;
      items.push(
        `<span class="lookup-meta-item">` +
        `<b>${escapeHtml(label)}:</b> ${escapeHtml(formatValue(v))}` +
        `</span>`
      );
    }
    if (!items.length) return '';
    return `<div class="lookup-detail-meta">${items.join('')}</div>`;
  }

  // First non-null field from a list. Handles dotted paths into the
  // parsed `data` blob.
  function pickField(d, keys) {
    const list = Array.isArray(keys) ? keys : [keys];
    for (const k of list) {
      const v = d[k];
      if (v != null && v !== '') return v;
    }
    return null;
  }

  function formatValue(v) {
    if (v == null) return '';
    if (Array.isArray(v)) return v.join(', ');
    if (typeof v === 'object') {
      // dicts like spell.level → "Sor/Wiz 3, Fire 3"
      return Object.entries(v).map(([k, vv]) => `${k} ${vv}`).join(', ');
    }
    return String(v);
  }

  // Per-type meta fields, in display order. The first key in each
  // tuple is the label; the second is the key (or list of keys) on
  // the entry/data dict.
  const META_FIELDS_BY_TYPE = {
    spell: [
      ['School',     ['school']],
      ['Subschool',  ['subschool']],
      ['Descriptor', ['descriptor']],
      ['Level',      ['level']],
      ['Components', ['components']],
      ['Casting',    ['casting_time']],
      ['Range',      ['range']],
      ['Target',     ['target']],
      ['Area',       ['area']],
      ['Effect',     ['effect']],
      ['Duration',   ['duration']],
      ['Save',       ['saving_throw']],
      ['SR',         ['spell_resistance']],
    ],
    feat: [
      ['Type',       ['types_csv', 'types']],
      ['Prereq',     ['prerequisites']],
    ],
    item: [
      ['Type',       ['item_type', 'type']],
      ['Slot',       ['body_slot']],
      ['Aura',       ['aura']],
      ['CL',         ['caster_level']],
      ['Price',      ['price']],
      ['Weight',     ['weight']],
      ['Prereq',     ['prerequisites']],
    ],
    weapon: [
      ['Type',       ['item_type', 'type', 'weapon_type']],
      ['Damage',     ['damage']],
      ['Critical',   ['critical']],
      ['Range',      ['range_increment']],
      ['Price',      ['price']],
      ['Weight',     ['weight']],
    ],
    armor: [
      ['Type',       ['item_type', 'armor_type']],
      ['Bonus',      ['armor_bonus']],
      ['Max Dex',    ['max_dex']],
      ['Check pen.', ['armor_check_penalty']],
      ['ASF',        ['arcane_spell_failure']],
      ['Price',      ['price']],
      ['Weight',     ['weight']],
    ],
    gear: [
      ['Type',       ['item_type', 'type']],
      ['Price',      ['price', 'cost']],
      ['Weight',     ['weight']],
    ],
    creature: [
      ['Size',       ['creature_size', 'size']],
      ['Type',       ['creature_type', 'type']],
      ['CR',         ['cr', 'challenge_rating']],
      ['HD',         ['hit_dice']],
      ['AC',         ['armor_class']],
      ['Alignment',  ['alignment']],
    ],
    race: [
      ['Size',       ['creature_size', 'size']],
      ['Type',       ['creature_type', 'type']],
      ['LA',         ['level_adjustment']],
      ['Favored',    ['favored_class']],
    ],
    template: [
      ['CR adj',     ['cr_adjustment']],
      ['LA',         ['level_adjustment']],
      ['Type',       ['new_creature_type', 'type_change']],
      ['Source ct',  ['source_creature_type']],
    ],
    class: [
      ['HD',         ['hit_die']],
      ['Skill pts',  ['skill_points_per_level']],
      ['Alignment',  ['alignment_restriction', 'alignment']],
    ],
    prc: [
      ['HD',         ['hit_die']],
      ['Skill pts',  ['skill_points_per_level']],
      ['Alignment',  ['alignment_restriction', 'alignment']],
    ],
    maneuver: [
      ['Discipline', ['discipline']],
      ['Type',       ['type']],
      ['Level',      ['level']],
      ['Action',     ['initiation_action']],
      ['Range',      ['range']],
      ['Save',       ['saving_throw']],
    ],
    power: [
      ['Discipline', ['discipline']],
      ['Level',      ['level']],
      ['Time',       ['manifesting_time']],
      ['Range',      ['range']],
      ['PP',         ['power_points']],
      ['Save',       ['saving_throw']],
      ['PR',         ['power_resistance']],
    ],
    mystery: [
      ['Path',       ['path']],
      ['Progression',['level_in_progression']],
      ['Level',      ['mystery_level']],
      ['Type',       ['type']],
      ['School',     ['school']],
    ],
    utterance: [
      ['Lexicon',    ['lexicon']],
      ['Level',      ['level']],
    ],
    vestige: [
      ['Level',      ['vestige_level']],
      ['DC',         ['binding_dc']],
    ],
    soulmeld: [
      ['Chakra',     ['chakra']],
      ['Classes',    ['classes_csv']],
    ],
    invocation: [
      ['Grade',      ['grade']],
      ['Lvl equiv',  ['spell_level_equivalent']],
      ['Subcategory',['subcategory']],
    ],
    domain: [
      ['Deities',    ['deities']],
    ],
    deity: [
      ['Alignment',  ['alignment']],
      ['Domains',    ['domains']],
      ['Symbol',     ['symbol']],
    ],
    region: [],
    plane: [
      ['Type',       ['type']],
      ['Alignment',  ['alignment']],
    ],
    rule: [
      ['Category',   ['category']],
    ],
    skill: [
      ['Key ability',['key_ability']],
      ['Trained only',['trained_only']],
    ],
    skill_use:   [['Skill', ['skill']]],
    skill_trick: [['Type',  ['type']], ['Prereq', ['prerequisites']]],
    poison:      [['Type', ['type']], ['DC', ['save_dc']], ['Price', ['price']]],
    acf:         [['Class', ['class', 'class_name']], ['Level', ['level']],
                  ['Replaces', ['replaces']]],
    subst_level: [['Class', ['class', 'class_name']], ['Level', ['level']]],
    organization:[['Type', ['type']]],
    ravage_affliction: [['Type', ['type']]],
    condition:   [['Category', ['category']]],
    _default:    [],
  };

  // Type-specific extras shown below the description.
  function renderTypeSpecific(d, type) {
    if (type === 'feat') {
      const lines = [];
      if (d.benefit) lines.push(`<b>Benefit:</b> ${escapeHtml(d.benefit)}`);
      if (d.normal)  lines.push(`<b>Normal:</b> ${escapeHtml(d.normal)}`);
      if (d.special) lines.push(`<b>Special:</b> ${escapeHtml(d.special)}`);
      return lines.length
        ? `<div class="lookup-detail-extra">${lines.join('<br>')}</div>` : '';
    }
    if (type === 'spell' && d.augment) {
      // (only Sha'ir gets augments — actually that's psionic powers)
    }
    if (type === 'vestige') {
      const lines = [];
      if (d.sign)       lines.push(`<b>Sign:</b> ${escapeHtml(d.sign)}`);
      if (d.influence)  lines.push(`<b>Influence:</b> ${escapeHtml(d.influence)}`);
      if (Array.isArray(d.granted_abilities) && d.granted_abilities.length) {
        const list = d.granted_abilities.map(a =>
          `${escapeHtml(a.name || '')}${a.type ? ` (${escapeHtml(a.type)})` : ''}` +
          (a.description ? `: ${escapeHtml(a.description)}` : '')
        ).join('<br>');
        lines.push(`<b>Granted:</b><br>${list}`);
      }
      return lines.length
        ? `<div class="lookup-detail-extra">${lines.join('<br>')}</div>` : '';
    }
    if (type === 'domain') {
      const lines = [];
      if (d.granted_power) lines.push(`<b>Granted:</b> ${escapeHtml(d.granted_power)}`);
      if (d.spells && typeof d.spells === 'object') {
        const lvls = Object.keys(d.spells)
          .sort((a, b) => parseInt(a, 10) - parseInt(b, 10))
          .map(k => `<b>${escapeHtml(k)}:</b> ${escapeHtml(d.spells[k])}`)
          .join(' · ');
        lines.push(`<b>Spells:</b> ${lvls}`);
      }
      return lines.length
        ? `<div class="lookup-detail-extra">${lines.join('<br>')}</div>` : '';
    }
    if (type === 'power' && d.augment) {
      return `<div class="lookup-detail-extra"><b>Augment:</b> ${escapeHtml(d.augment)}</div>`;
    }
    if (type === 'rule' && d.category && !d.description) {
      // category already in meta; nothing more to render
    }
    return '';
  }

  function renderTags(d) {
    if (!Array.isArray(d.tags) || !d.tags.length) return '';
    const tags = d.tags.map(t =>
      `<span class="lookup-tag">${escapeHtml(t)}</span>`).join('');
    return `<div class="lookup-detail-tags">${tags}</div>`;
  }

  // ---- Search index -------------------------------------------------------

  function buildIndex() {
    if (entries.length) return;          // already built
    if (!DB.isLoaded()) return;
    const rows = DB.query(
      "SELECT id, name, type, source FROM entry WHERE name IS NOT NULL"
    );
    // Pull tags in one shot.
    const tagRows = DB.query(
      "SELECT entry_id, tag FROM tag"
    );
    const tagsById = new Map();
    for (const r of tagRows) {
      if (!tagsById.has(r.entry_id)) tagsById.set(r.entry_id, new Set());
      tagsById.get(r.entry_id).add(r.tag);
    }
    typeCounts.clear();
    entries = rows.map(r => {
      const nameKey = squash(r.name);
      const tags = tagsById.get(r.id) || new Set();
      typeCounts.set(r.type, (typeCounts.get(r.type) || 0) + 1);
      return {
        id: r.id,
        name: r.name,
        type: r.type,
        source: r.source,
        tags,
        nameKey,
        // searchKey lets a fuzzy fallback hit tag names and the type
        // label (so a user typing "evocation" still surfaces evocation
        // spells even if their names don't include the word).
        searchKey: nameKey + '·' +
          (TYPE_LABELS[r.type] || r.type).toLowerCase() + '·' +
          (r.source || '').toLowerCase() + '·' +
          [...tags].join('·'),
      };
    });
    console.log(`[lookup] indexed ${entries.length} entries across ` +
      `${typeCounts.size} types`);
    renderChips();
  }

  // Drop case, punctuation, and runs of whitespace so "Bull's Strength"
  // and "Bull-Headed" both reduce to a stable lowercase key.
  function squash(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/['']/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // ---- Search ranking -----------------------------------------------------

  // Parse `feat:metamagic` / `spell:fireball` / `tag:combat-maneuver`
  // / `@source:DMG` prefixes out of the raw query. Returns
  // `{ q, types: Set<string>, tags: Set<string>, sources: Set<string> }`.
  function parseQuery(raw) {
    const out = {
      q: '',
      types: new Set(),
      tags: new Set(),
      sources: new Set(),
    };
    const parts = [];
    for (const token of String(raw || '').split(/\s+/)) {
      if (!token) continue;
      const m = token.match(/^(@?[a-z_]+):(.*)$/i);
      if (m) {
        const k = m[1].toLowerCase();
        const v = m[2];
        if (k === 'tag' && v)       out.tags.add(v.toLowerCase());
        else if ((k === '@source' || k === 'source') && v)
                                    out.sources.add(v.toLowerCase());
        else if (k === 'type' && v) out.types.add(v.toLowerCase());
        else if (k in TYPE_LABELS || k === 'prc' || k === 'class') {
          // `feat:` (no value) filters to feats; `feat:metamagic`
          // filters to feats AND pushes "metamagic" into the query.
          out.types.add(k);
          if (v) parts.push(v);
        }
        else parts.push(token);    // unknown prefix → treat as bare text
      } else {
        parts.push(token);
      }
    }
    out.q = squash(parts.join(' '));
    return out;
  }

  // Rank a single entry against the parsed query.
  // 0 = no match; higher = better.
  function score(entry, parsed) {
    // Hard filters first.
    if (parsed.types.size && !parsed.types.has(entry.type)) {
      // Also accept type:item matching item/weapon/armor/gear.
      if (!(parsed.types.has('item') &&
            ['item', 'weapon', 'armor', 'gear'].includes(entry.type))) {
        return 0;
      }
    }
    if (activeTypes.size && !activeTypes.has(entry.type)) {
      // Same item-bucket aggregation for chip filters.
      if (!(activeTypes.has('item') &&
            ['item', 'weapon', 'armor', 'gear'].includes(entry.type))) {
        return 0;
      }
    }
    if (parsed.tags.size) {
      for (const t of parsed.tags) {
        if (!entry.tags.has(t)) return 0;
      }
    }
    if (parsed.sources.size) {
      const src = (entry.source || '').toLowerCase();
      let ok = false;
      for (const s of parsed.sources) {
        if (src.includes(s)) { ok = true; break; }
      }
      if (!ok) return 0;
    }
    // No remaining query text: any entry passing the filters scores 1.
    if (!parsed.q) return 1;

    const q = parsed.q;
    // Tiered scoring on the name:
    //   100 — exact match
    //    80 — prefix match
    //    60 — word-boundary contains match
    //    40 — anywhere contains
    //    20 — searchKey contains (tag/type/source fallback)
    if (entry.nameKey === q) return 100;
    if (entry.nameKey.startsWith(q)) return 80;
    // Word boundary: " " + q must appear, OR nameKey starts with q.
    if ((' ' + entry.nameKey).includes(' ' + q)) return 60;
    if (entry.nameKey.includes(q)) return 40;
    if (entry.searchKey.includes(q)) return 20;
    return 0;
  }

  // ---- Chips --------------------------------------------------------------

  function renderChips() {
    if (!chipsEl) return;
    chipsEl.innerHTML = '';
    // Primary chips: PRIMARY_TYPES, with item aggregated.
    for (const t of PRIMARY_TYPES) {
      const count = countForChip(t);
      if (!count) continue;
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'lookup-chip' + (activeTypes.has(t) ? ' active' : '');
      chip.dataset.type = t;
      chip.textContent = `${TYPE_LABELS[t] || t} (${count})`;
      chip.addEventListener('click', () => toggleChip(t));
      chipsEl.appendChild(chip);
    }
    // "Clear" chip when filters are active.
    if (activeTypes.size) {
      const clear = document.createElement('button');
      clear.type = 'button';
      clear.className = 'lookup-chip lookup-chip-clear';
      clear.textContent = 'Clear';
      clear.addEventListener('click', () => {
        activeTypes.clear();
        renderChips();
        render(inputEl.value.trim());
      });
      chipsEl.appendChild(clear);
    }
  }

  function countForChip(t) {
    if (t === 'item') {
      return (typeCounts.get('item') || 0) +
             (typeCounts.get('weapon') || 0) +
             (typeCounts.get('armor') || 0) +
             (typeCounts.get('gear') || 0);
    }
    return typeCounts.get(t) || 0;
  }

  function toggleChip(t) {
    if (activeTypes.has(t)) activeTypes.delete(t);
    else activeTypes.add(t);
    renderChips();
    render(inputEl.value.trim());
  }

  // ---- Recent searches ----------------------------------------------------

  // Persistent list of queries the user actually opened something from.
  // We deliberately only record on "expand" — not every keystroke —
  // so the recent list stays signal-rich.
  const RECENT_KEY = 'dnd35-lookup-recent';
  const RECENT_MAX = 8;

  function loadRecent() {
    try {
      const raw = localStorage.getItem(RECENT_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr.filter(s => typeof s === 'string') : [];
    } catch (e) { return []; }
  }

  function saveRecent(list) {
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)); }
    catch (e) { /* private mode etc. — silently ignore */ }
  }

  function recordRecent(q) {
    q = (q || '').trim();
    if (!q) return;
    const list = loadRecent();
    // De-dupe (case-insensitive) and bring to front.
    const filtered = list.filter(s => s.toLowerCase() !== q.toLowerCase());
    filtered.unshift(q);
    saveRecent(filtered.slice(0, RECENT_MAX));
  }

  function clearRecent() {
    saveRecent([]);
  }

  // ---- Render -------------------------------------------------------------

  const MAX_RESULTS = 200;  // Cap rendered rows to keep the DOM lean.

  function renderEmptyState() {
    const recent = loadRecent();

    // Type breakdown: every type that has at least one entry, sorted by
    // count descending. We pull from typeCounts (populated at buildIndex
    // time, also used by the chip strip).
    const types = Array.from(typeCounts.entries())
      .filter(([, n]) => n > 0)
      .sort((a, b) => b[1] - a[1]);

    const recentHtml = recent.length
      ? `<div class="lookup-empty-section">` +
        `<div class="lookup-empty-head">` +
        `<span>Recent searches</span>` +
        `<button type="button" class="lookup-empty-clear" ` +
        `data-action="clear-recent">Clear</button>` +
        `</div>` +
        `<div class="lookup-empty-recent">` +
        recent.map(q =>
          `<button type="button" class="lookup-recent-chip" ` +
          `data-recent="${escapeHtml(q)}">${escapeHtml(q)}</button>`
        ).join('') +
        `</div></div>`
      : '';

    const browseHtml =
      `<div class="lookup-empty-section">` +
      `<div class="lookup-empty-head">` +
      `<span>Browse by type</span>` +
      `<span class="lookup-empty-total">${entries.length} entries</span>` +
      `</div>` +
      `<div class="lookup-empty-grid">` +
      types.map(([t, n]) =>
        `<button type="button" class="lookup-type-tile" ` +
        `data-type="${escapeHtml(t)}">` +
        `<span class="lookup-type-tile-name">` +
        `${escapeHtml(TYPE_LABELS[t] || t)}</span>` +
        `<span class="lookup-type-tile-count">${n}</span>` +
        `</button>`
      ).join('') +
      `</div></div>`;

    resultsEl.innerHTML =
      `<div class="lookup-empty-state">${recentHtml}${browseHtml}</div>`;
  }

  // Delegate clicks inside the empty-state to: recent chip → re-fill
  // the input; type tile → activate that filter; clear button → wipe
  // recent searches. We attach once during ensureModal().
  function wireEmptyStateClicks() {
    if (!resultsEl || resultsEl.dataset.emptyWired) return;
    resultsEl.dataset.emptyWired = '1';
    resultsEl.addEventListener('click', (ev) => {
      const t = ev.target instanceof Element ? ev.target : null;
      if (!t) return;
      const recentChip = t.closest('[data-recent]');
      if (recentChip) {
        ev.preventDefault();
        inputEl.value = recentChip.getAttribute('data-recent') || '';
        inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        inputEl.focus();
        return;
      }
      const typeTile = t.closest('[data-type]');
      if (typeTile && typeTile.classList.contains('lookup-type-tile')) {
        ev.preventDefault();
        const type = typeTile.getAttribute('data-type');
        activeTypes.clear();
        activeTypes.add(type);
        renderChips();
        render(inputEl.value.trim());
        inputEl.focus();
        return;
      }
      if (t.closest('[data-action="clear-recent"]')) {
        ev.preventDefault();
        clearRecent();
        render(inputEl.value.trim());
        return;
      }
    });
  }

  function render(query) {
    if (!resultsEl) return;
    if (!DB.isLoaded()) {
      resultsEl.innerHTML =
        '<div class="lookup-empty">Database still loading…</div>';
      setCount('');
      lastResults = [];
      return;
    }
    if (!entries.length) buildIndex();

    const parsed = parseQuery(query);
    // Empty state: no query and no filters → show type breakdown + recent
    // searches. Both are clickable: a type chip narrows by type, a recent
    // chip re-fills the input.
    if (!parsed.q && !activeTypes.size && !parsed.types.size &&
        !parsed.tags.size && !parsed.sources.size) {
      renderEmptyState();
      setCount('');
      lastResults = [];
      return;
    }

    // Score + sort.
    const scored = [];
    for (const e of entries) {
      const s = score(e, parsed);
      if (s > 0) scored.push({ entry: e, score: s });
    }
    scored.sort((a, b) =>
      b.score - a.score ||
      a.entry.name.localeCompare(b.entry.name)
    );
    lastResults = scored.slice(0, MAX_RESULTS).map(x => x.entry);

    resultsEl.innerHTML = '';
    if (!lastResults.length) {
      resultsEl.innerHTML =
        '<div class="lookup-empty">No matches.</div>';
      setCount('0');
      return;
    }
    for (let i = 0; i < lastResults.length; i++) {
      const e = lastResults[i];
      const row = document.createElement('div');
      row.className = 'lookup-row' + (i === selectedIdx ? ' selected' : '');
      row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', i === selectedIdx ? 'true' : 'false');
      row.dataset.entryId = e.id;
      row.dataset.entryType = e.type;
      row.innerHTML =
        `<span class="lookup-row-type">${escapeHtml(TYPE_LABELS[e.type] || e.type)}</span>` +
        `<span class="lookup-row-name">${escapeHtml(e.name)}</span>` +
        `<span class="lookup-row-meta">${escapeHtml(e.source || '')}</span>`;
      // Subtle ✦ marker if this entry has applied errata. We use the
      // indicator (non-clickable) here because the whole row is
      // clickable — the popover lives in the expanded detail panel.
      if (window.ErrataBadge) {
        const ind = ErrataBadge.indicator(e.id);
        if (ind) {
          row.querySelector('.lookup-row-name').appendChild(
            document.createTextNode(' ')
          );
          row.querySelector('.lookup-row-name').appendChild(ind);
        }
      }
      row.addEventListener('click', () => {
        selectedIdx = i;
        paintSelection();
        expandSelected();
      });
      resultsEl.appendChild(row);
    }
    const total = scored.length;
    setCount(
      total > MAX_RESULTS
        ? `showing ${MAX_RESULTS} of ${total}`
        : `${total} match${total === 1 ? '' : 'es'}`
    );
    // Ensure selection is valid.
    if (selectedIdx >= lastResults.length) selectedIdx = 0;
    paintSelection();
  }

  function setCount(text) {
    const el = document.getElementById('lookup-count');
    if (el) el.textContent = text;
  }

  // ---- Global hotkey ------------------------------------------------------

  function wireHotkey() {
    document.addEventListener('keydown', (ev) => {
      // Ctrl+K (Linux/Win) or Cmd+K (Mac). Skip if a modifier-K is
      // happening inside an editable field for some app-specific
      // shortcut (Slack-style); for us the hotkey wins.
      const isK = ev.key === 'k' || ev.key === 'K';
      if (!isK) return;
      if (!(ev.ctrlKey || ev.metaKey)) return;
      // Don't grab Ctrl+K inside contenteditable specifically, but
      // textarea / input is fine — that's where you'd most want it.
      ev.preventDefault();
      toggle();
    });
  }

  // ---- Bootstrap ----------------------------------------------------------

  function init() {
    ensureTriggerButton();
    wireHotkey();
    // Pre-create the modal so it's ready to open instantly. (Skips
    // first-open jank.)
    ensureModal();
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Expose minimal API for the future per-picker integration (Phase 4
  // errata badge + maybe deep-linking from a picker into the modal).
  window.Lookup = { open, close, toggle };

  // Init when the DOM is ready and the DB module exists. We don't
  // need DB.ready to fire — the modal shell works without data; the
  // search just shows "loading" until DB.ready resolves.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
