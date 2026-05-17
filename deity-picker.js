// deity-picker.js — Autocomplete + info panel on the Character tab's
// Deity field. Queries `entry WHERE type='deity'` (121 entries, all
// from FRCS today). On exact-match input the info panel renders
// alignment / rank / pantheon / domains / favored weapon / symbol /
// portfolio / worshipers + a short description. Alignment dropdown
// is auto-filled (when blank) from the deity's `alignment` two-
// letter code.
//
// Future enhancement: clickable domain chips in the info panel that
// insert into the next-empty `.sc-domain-name` slot on the Spells
// tab. For MVP the user reads the domain list and types it in
// manually (matches how other deity-related sheet fields work).

(function () {
  if (!window.DB) {
    console.warn('[deity-picker] DB module not loaded');
    return;
  }

  // Lower-case name → deity record.
  const deityIndex = new Map();
  let datalist = null;
  let infoPanel = null;

  // Two-letter alignment codes from the deity stat blocks map to the
  // character sheet's alignment dropdown values. "N" / "TN" both
  // resolve to True Neutral.
  const ALIGNMENT_BY_CODE = {
    LG: 'Lawful Good',  NG: 'Neutral Good',  CG: 'Chaotic Good',
    LN: 'Lawful Neutral', N: 'True Neutral', TN: 'True Neutral',
    CN: 'Chaotic Neutral',
    LE: 'Lawful Evil',  NE: 'Neutral Evil',  CE: 'Chaotic Evil',
  };

  function init() {
    const deityInput = document.getElementById('char-deity');
    if (!deityInput) {
      console.warn('[deity-picker] #char-deity input not found');
      return;
    }

    // 1. Insert <datalist> for autocomplete.
    datalist = document.getElementById('deity-options');
    if (!datalist) {
      datalist = document.createElement('datalist');
      datalist.id = 'deity-options';
      deityInput.setAttribute('list', 'deity-options');
      deityInput.setAttribute('autocomplete', 'off');
      deityInput.parentElement.appendChild(datalist);
    }

    // 2. Insert info panel below the deity field. The Character info-
    // grid spans the full width; setting grid-column to span all cells
    // makes the panel appear on its own row below the grid.
    infoPanel = document.getElementById('deity-info');
    if (!infoPanel) {
      infoPanel = document.createElement('div');
      infoPanel.id = 'deity-info';
      infoPanel.className = 'race-info deity-info';
      // Reuse race-info's styling (dark themed left-bordered card) but
      // override the left-border color so deity / race info are
      // visually distinct.
      infoPanel.style.cssText =
        'grid-column: 1 / -1; padding: 0.5rem; margin-top: 0.25rem; ' +
        'font-size: 0.85em; color: #ccc; background: rgba(255,255,255,0.04); ' +
        'border-left: 3px solid #aa8a6a; border-radius: 3px; display: none;';
      deityInput.parentElement.parentElement.appendChild(infoPanel);
    }

    // 3. Populate options from DB. Same source-recency tiebreak as
    // every other picker (3.5 first, then newest publication date).
    function populate() {
      const deities = DB.query(
        "SELECT e.id AS deity_id, e.name, e.version, e.source, "
        + "       b.publication_date "
        + "FROM entry e "
        + "LEFT JOIN book b ON b.name = e.source "
        + "WHERE e.type = 'deity' "
        + "ORDER BY e.name COLLATE NOCASE, "
        + "         CASE e.version WHEN '3.5' THEN 0 ELSE 1 END, "
        + "         b.publication_date DESC"
      );
      deityIndex.clear();
      datalist.innerHTML = '';
      let kept = 0;
      for (const r of deities) {
        if (window.BookFilter && !window.BookFilter.allowsSource(r.source)) continue;
        const key = r.name.toLowerCase();
        if (deityIndex.has(key)) continue;  // first hit wins (3.5 preferred)
        deityIndex.set(key, { id: r.deity_id, name: r.name });
        const opt = document.createElement('option');
        opt.value = r.name;
        // No opt.label — Firefox renders labels as visible completion
        // text (CLAUDE.md datalist note).
        datalist.appendChild(opt);
        kept++;
      }
      console.log(`[deity-picker] ${kept}/${deities.length} deities available`);
    }
    populate();
    document.addEventListener('book-filter-changed', populate);

    // 4. On input/change: try exact-match lookup, render info panel,
    //    optionally auto-fill alignment.
    const onChange = () => onDeityChosen(deityInput.value);
    deityInput.addEventListener('change', onChange);
    deityInput.addEventListener('input', () => {
      // Exact-match auto-fill while typing — matches race-picker UX.
      if (deityIndex.has(deityInput.value.trim().toLowerCase())) {
        onChange();
      } else {
        hideInfo();
      }
    });

    // Re-render the info panel on book-filter change — the typed
    // deity might have been filtered out, in which case clear.
    document.addEventListener('book-filter-changed', () => {
      if (deityInput.value.trim()) onChange();
    });

    // Rehydrate on init: if a saved character already has a deity
    // typed, populate the info panel + alignment immediately.
    if (deityInput.value.trim()) onChange();
  }

  function onDeityChosen(typedName) {
    const key = typedName.trim().toLowerCase();
    const stub = deityIndex.get(key);
    if (!stub) { hideInfo(); return; }
    // Pull full record only on demand — keeps the per-keystroke
    // lookup cheap.
    const row = DB.queryOne(
      "SELECT name, source, version, data FROM entry WHERE id = ?",
      [stub.id]);
    if (!row) { hideInfo(); return; }
    let d = {};
    try { d = JSON.parse(row.data || '{}'); }
    catch (e) { /* ignore */ }
    renderInfo(row, d);
    maybeAutoFillAlignment(d.alignment);
  }

  function maybeAutoFillAlignment(code) {
    const target = ALIGNMENT_BY_CODE[String(code || '').toUpperCase()];
    if (!target) return;
    const sel = document.getElementById('char-alignment');
    if (!sel) return;
    // Only fill when blank, or when we previously filled it
    // ourselves (data-from-deity marker, same pattern as
    // data-from-class). User edits clear the marker via the input
    // listener wired below.
    const isBlank = !sel.value;
    const ourFill = sel.dataset.fromDeity === '1';
    if (!isBlank && !ourFill) return;
    if (sel.value !== target) {
      sel.value = target;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }
    sel.dataset.fromDeity = '1';
    if (!sel.dataset.fromDeityWired) {
      sel.dataset.fromDeityWired = '1';
      sel.addEventListener('change', (ev) => {
        if (ev.isTrusted) delete sel.dataset.fromDeity;
      });
    }
  }

  function renderInfo(row, d) {
    if (!infoPanel) return;
    const bits = [];
    bits.push(`<b>${escapeHtml(d.name || row.name)}</b>`
      + (d.title ? ` <span style="opacity:.7">— ${escapeHtml(d.title)}</span>` : '')
      + ` <span style="opacity:.6">(${escapeHtml(row.source || '?')})</span>`);
    const meta = [];
    if (d.alignment) meta.push(`<b>Alignment:</b> ${escapeHtml(d.alignment)}`);
    if (d.rank)      meta.push(`<b>Rank:</b> ${escapeHtml(d.rank)}`);
    if (d.pantheon)  meta.push(`<b>Pantheon:</b> ${escapeHtml(d.pantheon)}`);
    if (meta.length) bits.push(meta.join(' &nbsp;·&nbsp; '));
    if (d.portfolio) bits.push(`<b>Portfolio:</b> ${escapeHtml(d.portfolio)}`);
    if (Array.isArray(d.domains) && d.domains.length) {
      bits.push(`<b>Domains:</b> ${d.domains.map(escapeHtml).join(', ')}`);
    }
    if (d.favored_weapon) {
      bits.push(`<b>Favored weapon:</b> ${escapeHtml(d.favored_weapon)}`);
    }
    if (d.symbol) {
      bits.push(`<b>Symbol:</b> ${escapeHtml(d.symbol)}`);
    }
    if (d.worshipers) {
      bits.push(`<b>Worshipers:</b> ${escapeHtml(d.worshipers)}`);
    }
    let html = bits.join('<br>');
    if (d.description) {
      html += `<div class="deity-info-desc" style="margin-top:0.4rem;line-height:1.4">`
        + escapeHtml(d.description) + '</div>';
    }
    infoPanel.innerHTML = html;
    if (window.ErrataBadge) ErrataBadge.attach(infoPanel, row.deity_id || row.id);
    infoPanel.style.display = 'block';
  }

  function hideInfo() {
    if (!infoPanel) return;
    infoPanel.style.display = 'none';
    infoPanel.innerHTML = '';
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  DB.ready.then((db) => { if (db) init(); });
})();
