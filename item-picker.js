// item-picker.js — Autocomplete item search + info panel + add buttons
// for Possessions or Magic Items. Injected into the Equipment tab
// above the existing "+ Add Item" button.
//
// Two destinations:
//   + Gear         → Equipment.addGearRow({ name, weight })  for ordinary
//                    possessions (weapons, mundane gear, consumables)
//   + Magic Item   → Equipment.addMagicItem({ name, weight, special })
//                    for items with a body slot or persistent properties
//
// Data quirks:
//   * Item `name` is stored UPPER CASE — Title-Case for display.
//   * Both 3.5 and 3.0 versions of many items exist — dedup with 3.5 win.
//   * `weight` is a free-form string ("1 lb", "—", "1/2 lb"); parsed to a
//      decimal pound value.
//   * `body_slot` is mostly NULL (parser data quality); we don't try to
//      auto-pick a slot for magic items — user picks via the existing
//      slot dropdown.
//
// UI inserted into the Possessions section (before #btn-add-gear):
//   #item-lookup           (input)   — name autocomplete
//   #item-lookup-type      (select)  — filter by item.type
//   #item-add-gear         (button)  — append to gear table
//   #item-add-magic        (button)  — append to magic items list
//   #item-info             (div)     — info panel
//   <datalist id="item-options">     — autocomplete options

(function () {
  if (!window.DB) {
    console.warn('[item-picker] DB module not loaded');
    return;
  }

  // canonical name (lowercase) → { displayName, primaryRow }
  let itemIndex = new Map();
  // Title-cased names for the datalist, sorted.
  let displayNames = [];
  // type → count
  let typeIndex = new Map();

  const SMALL_WORDS = new Set([
    'of','the','and','or','a','an','in','on','to','for','with','by','at','from','as','is',
  ]);
  function titleCase(s) {
    if (!s) return '';
    const lower = String(s).toLowerCase();
    return lower.replace(/\b([a-z])([a-z'-]*)/gi, (m, first, rest, idx) => {
      const word = first.toLowerCase() + rest.toLowerCase();
      if (idx > 0 && SMALL_WORDS.has(word)) return word;
      return first.toUpperCase() + rest.toLowerCase();
    });
  }

  // "1 lb", "1.5 lb", "—", "1/2 lb", "" → number (pounds, 0 if unknown).
  function parseWeight(s) {
    if (!s) return 0;
    const t = String(s).trim().toLowerCase();
    if (!t || t === '—' || t === '-' || t === 'negligible') return 0;
    // "1/2 lb" or "1/4 lb"
    const frac = t.match(/^(\d+)\s*\/\s*(\d+)/);
    if (frac) return parseInt(frac[1], 10) / parseInt(frac[2], 10);
    // "1 lb", "10 lb.", "1.5 lb"
    const num = t.match(/(\d+(?:\.\d+)?)/);
    if (num) return parseFloat(num[1]) || 0;
    return 0;
  }

  function buildIndex() {
    const rows = DB.query(
      "SELECT item_id, name, version, type FROM item " +
      "ORDER BY CASE version WHEN '3.5' THEN 0 ELSE 1 END, " +
      "name COLLATE NOCASE"
    );
    itemIndex = new Map();
    typeIndex = new Map();
    for (const r of rows) {
      if (!r.name) continue;
      const key = r.name.toLowerCase();
      if (!itemIndex.has(key)) {
        itemIndex.set(key, {
          displayName: titleCase(r.name),
          primaryRow: r,
        });
      }
      if (r.type) {
        typeIndex.set(r.type, (typeIndex.get(r.type) || 0) + 1);
      }
    }
    displayNames = [...itemIndex.values()]
      .map(v => v.displayName)
      .sort((a, b) => a.localeCompare(b));
    console.log(`[item-picker] indexed ${rows.length} item rows → ` +
      `${itemIndex.size} distinct items, ${typeIndex.size} types`);
  }

  function fullItemRow(itemId) {
    return DB.queryOne("SELECT * FROM item WHERE item_id = ?", [itemId]);
  }

  function refreshDatalist(datalist, chosenType) {
    datalist.innerHTML = '';
    let n = 0;
    for (const display of displayNames) {
      const entry = itemIndex.get(display.toLowerCase());
      if (!entry) continue;
      if (chosenType && entry.primaryRow.type !== chosenType) continue;
      const opt = document.createElement('option');
      opt.value = display;
      opt.label = entry.primaryRow.type || '';
      datalist.appendChild(opt);
      n++;
    }
    return n;
  }

  function init() {
    const addBtn = document.getElementById('btn-add-gear');
    if (!addBtn) {
      console.warn('[item-picker] #btn-add-gear not found');
      return;
    }
    buildIndex();

    const sortedTypes = [...typeIndex.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

    const wrap = document.createElement('div');
    wrap.className = 'item-picker';
    wrap.style.cssText =
      'padding:0.5rem; margin-bottom:0.5rem; ' +
      'background:rgba(255,255,255,0.04); border-left:3px solid #6aaa8a; ' +
      'border-radius:3px;';
    wrap.innerHTML = `
      <div style="display:flex;gap:0.4rem;align-items:flex-end;flex-wrap:wrap">
        <div class="field" style="flex:2 1 14rem;min-width:12rem">
          <label>Item Lookup</label>
          <input type="text" id="item-lookup" list="item-options"
                 placeholder="e.g. Cloak of Resistance" autocomplete="off">
          <datalist id="item-options"></datalist>
        </div>
        <div class="field" style="flex:1 1 8rem;min-width:7rem">
          <label>Type Filter</label>
          <select id="item-lookup-type">
            <option value="">Any type</option>
            ${sortedTypes.map(([t, c]) =>
              `<option value="${escapeHtml(t)}">${escapeHtml(t)} (${c})</option>`
            ).join('')}
          </select>
        </div>
        <button type="button" id="item-add-gear" class="btn-add"
                title="Add to Possessions list (mundane gear / weapons / consumables)"
                style="height:2rem">+ Gear</button>
        <button type="button" id="item-add-magic" class="btn-add"
                title="Add to Magic Items list (items with body slot or persistent effect)"
                style="height:2rem">+ Magic Item</button>
      </div>
      <div id="item-info"
           style="display:none;font-size:0.85em;color:#ccc;margin-top:0.4rem">
      </div>
    `;
    addBtn.parentElement.insertBefore(wrap, addBtn);

    const itemInput = document.getElementById('item-lookup');
    const typeSel   = document.getElementById('item-lookup-type');
    const addGear   = document.getElementById('item-add-gear');
    const addMagic  = document.getElementById('item-add-magic');
    const info      = document.getElementById('item-info');
    const datalist  = document.getElementById('item-options');

    refreshDatalist(datalist, '');

    typeSel.addEventListener('change', () => {
      const n = refreshDatalist(datalist, typeSel.value);
      itemInput.placeholder = typeSel.value
        ? `${n} ${typeSel.value} item${n === 1 ? '' : 's'}`
        : 'e.g. Cloak of Resistance';
    });

    function updateInfo() {
      const typed = itemInput.value.trim();
      if (!typed) { info.style.display = 'none'; info.innerHTML = ''; return; }
      const entry = itemIndex.get(typed.toLowerCase());
      if (!entry) { info.style.display = 'none'; info.innerHTML = ''; return; }
      const full = fullItemRow(entry.primaryRow.item_id);
      if (!full) return;
      const bits = [];
      bits.push(`<b>${escapeHtml(entry.displayName)}</b>` +
        ` <span style="opacity:.7">(${escapeHtml(full.version || '?')})</span>`);
      if (full.type)         bits.push(`<b>Type:</b> ${escapeHtml(full.type)}`);
      if (full.body_slot)    bits.push(`<b>Slot:</b> ${escapeHtml(full.body_slot)}`);
      if (full.aura)         bits.push(`<b>Aura:</b> ${escapeHtml(full.aura)}`);
      if (full.caster_level) bits.push(`<b>CL:</b> ${escapeHtml(full.caster_level)}`);
      if (full.prerequisites)bits.push(`<b>Prereq:</b> ${escapeHtml(full.prerequisites)}`);
      if (full.price)        bits.push(`<b>Price:</b> ${escapeHtml(full.price)}`);
      if (full.weight)       bits.push(`<b>Weight:</b> ${escapeHtml(full.weight)}`);
      if (full.cost)         bits.push(`<b>Cost:</b> ${escapeHtml(full.cost)}`);
      if (full.description) {
        const trimmed = full.description.length > 400
          ? full.description.slice(0, 400) + '…'
          : full.description;
        bits.push(`<b>Description:</b> ${escapeHtml(trimmed)}`);
      }
      info.innerHTML = bits.join('<br>');
      info.style.display = 'block';
    }
    itemInput.addEventListener('input', updateInfo);
    itemInput.addEventListener('change', updateInfo);

    function flash(msg, color) {
      const note = document.createElement('div');
      note.style.cssText = `margin-top:0.3rem;color:${color};font-style:italic`;
      note.textContent = msg;
      info.appendChild(note);
      info.style.display = 'block';
      setTimeout(() => note.remove(), 3500);
    }

    function resolveTyped() {
      const typed = itemInput.value.trim();
      if (!typed) { flash('Pick an item first.', '#a66'); return null; }
      const entry = itemIndex.get(typed.toLowerCase());
      if (entry) {
        const full = fullItemRow(entry.primaryRow.item_id);
        return {
          name: entry.displayName,
          weight: parseWeight(full?.weight),
          special: full?.description
            ? (full.description.length > 200
                ? full.description.slice(0, 200) + '…'
                : full.description)
            : '',
        };
      }
      // Custom / not-in-DB item — pass through with no detail.
      return { name: typed, weight: 0, special: '' };
    }

    addGear.addEventListener('click', () => {
      const it = resolveTyped();
      if (!it) return;
      if (typeof Equipment?.addGearRow !== 'function') {
        flash('Equipment module unavailable.', '#a66');
        return;
      }
      Equipment.addGearRow({ name: it.name, weight: it.weight || '' });
      if (typeof Equipment.recalcWeight === 'function') Equipment.recalcWeight();
      flash(`Added "${it.name}" to Possessions.`, '#7a9');
    });

    addMagic.addEventListener('click', () => {
      const it = resolveTyped();
      if (!it) return;
      if (typeof Equipment?.addMagicItem !== 'function') {
        flash('Equipment module unavailable.', '#a66');
        return;
      }
      Equipment.addMagicItem({
        name: it.name,
        weight: it.weight || '',
        special: it.special,
      });
      flash(`Added "${it.name}" to Magic Items.`, '#7a9');
    });
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  DB.ready.then((db) => {
    if (db) init();
  });
})();
