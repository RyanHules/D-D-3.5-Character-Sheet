// soulmeld-picker.js — Soulmeld autocomplete + auto-fill for the
// Equipment tab's body-slot soulmeld inputs (and the Totemist totem
// slot at the bottom).
//
// Each magic-item slot in equipment.js has a "Soulmeld" checkbox; when
// checked, the slot exposes `.slot-sm-name` (+ a few related fields).
// Some slots also support Double Chakra, exposing `.slot-sm2-name`.
// The Totemist totem block has the same shape with id-prefixed inputs.
//
// Strategy: shared datalist on every `.slot-sm-name` / `.slot-sm2-name`
// input. On exact match, parse the soulmeld's description into Base /
// Chakra Bind portions and auto-fill `.slot-sm-base` and
// `.slot-sm-bind-effect`. MutationObserver re-syncs the `list`
// attribute when new soulmeld inputs appear.

(function () {
  if (!window.DB) {
    console.warn('[soulmeld-picker] DB module not loaded');
    return;
  }

  // Lower-case name → soulmeld record (see init() for shape).
  const soulmeldIndex = new Map();

  function init() {
    const rows = DB.query(
      "SELECT id AS soulmeld_id, name, source, version, "
      + "json_extract(data, '$.chakra')       AS chakra, "
      + "json_extract(data, '$.classes_csv')  AS classes_csv, "
      + "json_extract(data, '$.descriptors')  AS descriptors, "
      + "json_extract(data, '$.saving_throw') AS saving_throw, "
      + "json_extract(data, '$.description')  AS description "
      + "FROM entry WHERE type = 'soulmeld' "
      + "ORDER BY name COLLATE NOCASE"
    );
    for (const r of rows) {
      const key = (r.name || '').toLowerCase();
      if (soulmeldIndex.has(key)) continue;
      const parsed = parseDescription(r.description || '');
      soulmeldIndex.set(key, {
        name: r.name,
        source: r.source,
        version: r.version,
        chakra: r.chakra,
        classes_csv: r.classes_csv,
        descriptors: r.descriptors,
        saving_throw: r.saving_throw,
        description: r.description,
        baseEffect: parsed.base,
        essentiaScaling: parsed.essentia,
        bindEffects: parsed.binds,   // [{chakra, text}, ...]
      });
    }
    console.log(`[soulmeld-picker] indexed ${soulmeldIndex.size} soulmelds`);

    buildDatalist();
    syncInputs();
    wireDelegation();
    observeNew();
  }

  // Parse a soulmeld description of the form
  //   "Base: <text>. Essentia: <text>."
  //   "Chakra Bind (<chakra>): <text>."
  //   [optionally more Chakra Bind lines]
  // by locating each header keyword and slicing between them.
  function parseDescription(text) {
    const out = { base: '', essentia: '', binds: [] };
    if (!text) return out;
    const headerRx =
      /(Base|Essentia|Chakra Bind\s*\(([^)]+)\))\s*:\s*/g;
    const matches = [];
    let m;
    while ((m = headerRx.exec(text)) !== null) {
      matches.push({
        kind: m[1].startsWith('Chakra Bind') ? 'bind' : m[1].toLowerCase(),
        chakra: m[2] ? m[2].trim() : null,
        headerStart: m.index,
        bodyStart: m.index + m[0].length,
      });
    }
    for (let i = 0; i < matches.length; i++) {
      const cur = matches[i];
      const end = i + 1 < matches.length
        ? matches[i + 1].headerStart : text.length;
      const body = text.slice(cur.bodyStart, end)
        .trim()
        .replace(/^[.\s]+|[.\s]+$/g, '')
        .trim();
      if (cur.kind === 'base') out.base = body;
      else if (cur.kind === 'essentia') out.essentia = body;
      else if (cur.kind === 'bind') out.binds.push({
        chakra: cur.chakra,
        text: body,
      });
    }
    return out;
  }

  function buildDatalist() {
    let dl = document.getElementById('soulmeld-picker-options');
    if (dl) return;
    dl = document.createElement('datalist');
    dl.id = 'soulmeld-picker-options';
    for (const sm of soulmeldIndex.values()) {
      const opt = document.createElement('option');
      opt.value = sm.name;
      opt.label = sm.chakra || '';
      dl.appendChild(opt);
    }
    document.body.appendChild(dl);
  }

  function syncInputs() {
    const inputs = document.querySelectorAll(
      '.slot-sm-name, .slot-sm2-name, #totem-sm-name, #totem-sm2-name'
    );
    for (const inp of inputs) {
      if (inp.getAttribute('list') !== 'soulmeld-picker-options') {
        inp.setAttribute('list', 'soulmeld-picker-options');
        inp.setAttribute('autocomplete', 'off');
      }
    }
  }

  function observeNew() {
    const ob = new MutationObserver(() => syncInputs());
    ob.observe(document.body, { childList: true, subtree: true });
  }

  function wireDelegation() {
    const handler = (ev) => {
      const inp = ev.target;
      if (!(inp instanceof HTMLInputElement)) return;
      const isPrimary = inp.classList.contains('slot-sm-name') ||
                        inp.id === 'totem-sm-name';
      const isSecond  = inp.classList.contains('slot-sm2-name') ||
                        inp.id === 'totem-sm2-name';
      if (!isPrimary && !isSecond) return;
      const sm = soulmeldIndex.get(
        String(inp.value || '').trim().toLowerCase());
      if (!sm) return;
      fillFromSoulmeld(inp, sm, isSecond);
    };
    document.addEventListener('input', handler);
    document.addEventListener('change', handler);
  }

  // Map equipment.js body-slot IDs to the chakra keywords soulmelds
  // use. Some slots map to multiple chakras; we prefer the first match.
  const SLOT_TO_CHAKRAS = {
    head:      ['Crown', 'Brow'],
    eyes:      ['Brow'],
    neck:      ['Throat'],
    shoulders: ['Shoulders'],
    hands:     ['Hands'],
    arms:      ['Arms'],
    body:      ['Heart'],
    torso:     ['Heart'],
    waist:     ['Waist'],
    feet:      ['Feet'],
    totem:     ['Totem'],
  };

  function fillFromSoulmeld(input, sm, isSecond) {
    const slot = input.closest('.magic-item-slot');
    let baseEl, bindEl, slotId;
    if (slot) {
      slotId = slot.dataset.slotId || null;
      if (isSecond) {
        baseEl = slot.querySelector('.slot-sm2-base');
        bindEl = slot.querySelector('.slot-sm2-bind-effect');
      } else {
        baseEl = slot.querySelector('.slot-sm-base');
        bindEl = slot.querySelector('.slot-sm-bind-effect');
      }
    } else if (input.id === 'totem-sm-name') {
      baseEl = document.getElementById('totem-sm-base');
      bindEl = document.getElementById('totem-sm-bind-effect');
      slotId = 'totem';
    } else if (input.id === 'totem-sm2-name') {
      baseEl = document.getElementById('totem-sm2-base');
      bindEl = document.getElementById('totem-sm2-bind-effect');
      slotId = 'totem';
    }

    // Base effect text: combine Base + Essentia so both show up.
    const baseText = sm.essentiaScaling
      ? `${sm.baseEffect} (Essentia: ${sm.essentiaScaling})`
      : sm.baseEffect;
    if (baseEl && !baseEl.value.trim() && baseText) {
      baseEl.value = baseText;
      baseEl.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // Bind effect: pick the bind for this slot's chakra; fall back to
    // first non-Totem (or Totem for totem inputs).
    const chosen = pickBindForSlot(sm.bindEffects, slotId);
    if (bindEl && !bindEl.value.trim() && chosen) {
      const prefix = chosen.chakra ? `(${chosen.chakra}) ` : '';
      bindEl.value = `${prefix}${chosen.text}`;
      bindEl.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // Light hint: if the picked soulmeld's chakra doesn't match the
    // slot, flash a non-blocking warning in the bind textarea
    // placeholder so the user notices the mismatch.
    maybeFlashChakraMismatch(slot || null, sm, slotId);
  }

  function pickBindForSlot(binds, slotId) {
    if (!Array.isArray(binds) || !binds.length) return null;
    const wantList = (SLOT_TO_CHAKRAS[slotId] || []).map(s => s.toLowerCase());
    // Exact chakra match first.
    for (const want of wantList) {
      const hit = binds.find(b => (b.chakra || '').toLowerCase() === want);
      if (hit) return hit;
    }
    // Partial-substring match (e.g. "Feet (totem)" matches "feet").
    for (const want of wantList) {
      const hit = binds.find(b =>
        (b.chakra || '').toLowerCase().includes(want));
      if (hit) return hit;
    }
    if (slotId === 'totem') {
      return binds.find(b => /totem/i.test(b.chakra || '')) || binds[0];
    }
    return binds.find(b => !/totem/i.test(b.chakra || '')) || binds[0];
  }

  function maybeFlashChakraMismatch(slot, sm, slotId) {
    if (!slot || !sm.chakra) return;
    const wantList = SLOT_TO_CHAKRAS[slotId] || [];
    if (!wantList.length) return;
    const chakras = String(sm.chakra)
      .toLowerCase()
      .split(/\s*,\s*|\s+or\s+/);
    const ok = chakras.some(c =>
      wantList.some(w => c.includes(w.toLowerCase())));
    if (ok) return;
    // Mismatch — surface a hint as a one-time tooltip on the slot header.
    const header = slot.querySelector('.slot-header');
    if (!header) return;
    let hint = header.querySelector('.sm-mismatch-hint');
    if (!hint) {
      hint = document.createElement('span');
      hint.className = 'sm-mismatch-hint';
      hint.style.cssText =
        'margin-left:0.5rem; font-size:0.8em; color:#c88; ' +
        'font-style:italic;';
      header.appendChild(hint);
    }
    hint.textContent = `(soulmeld chakra: ${sm.chakra})`;
  }

  DB.ready.then((db) => { if (db) init(); });
})();
