// race-picker.js — Populate the race input with autocomplete from the
// database, and auto-fill type/size/speed/languages when the user picks
// a race that exists in the DB. Manual typing still works — if the
// typed text doesn't match a known race, no auto-fill happens and the
// existing fields are left alone.
//
// Existing fields populated:
//   #char-race        (input)        — name (typed)
//   #char-type        (input)        — creature type (e.g. "Humanoid")
//   #char-size        (select)       — size
//   #char-speed       (input)        — base speed in feet (e.g. "30 ft.")
//   #languages        (textarea)     — comma-separated automatic languages
//
// Enhancements added:
//   #race-info        (div, new)     — small panel showing ability mods,
//                                       darkvision, favored class, etc.
//   <datalist id="race-options">     — autocomplete options

(function () {
  if (!window.DB) {
    console.warn('[race-picker] DB module not loaded');
    return;
  }

  // Map from lowercase race name → race_id, populated once the DB is ready.
  let raceIndex = new Map();

  function init() {
    const raceInput = document.getElementById('char-race');
    if (!raceInput) {
      console.warn('[race-picker] #char-race input not found');
      return;
    }

    // 1. Insert a <datalist> alongside the input for autocomplete.
    let datalist = document.getElementById('race-options');
    if (!datalist) {
      datalist = document.createElement('datalist');
      datalist.id = 'race-options';
      raceInput.setAttribute('list', 'race-options');
      raceInput.setAttribute('autocomplete', 'off');
      raceInput.parentElement.appendChild(datalist);
    }

    // 2. Insert a small info panel below the field for race details.
    let infoPanel = document.getElementById('race-info');
    if (!infoPanel) {
      infoPanel = document.createElement('div');
      infoPanel.id = 'race-info';
      infoPanel.className = 'race-info';
      infoPanel.style.cssText =
        'grid-column: 1 / -1; padding: 0.5rem; margin-top: 0.25rem; ' +
        'font-size: 0.85em; color: #ccc; background: rgba(255,255,255,0.04); ' +
        'border-left: 3px solid #6a8a6a; border-radius: 3px; display: none;';
      raceInput.parentElement.parentElement.appendChild(infoPanel);
    }

    // 3. Populate options from DB.
    const races = DB.query(
      "SELECT race_id, name, version FROM race ORDER BY name"
    );
    raceIndex = new Map();
    for (const r of races) {
      const opt = document.createElement('option');
      // Show version in the dropdown for disambiguation
      opt.value = r.version === '3.5' ? r.name : `${r.name} (${r.version})`;
      datalist.appendChild(opt);
      raceIndex.set(r.name.toLowerCase(), r.race_id);
    }
    console.log(`[race-picker] ${races.length} races available`);

    // 4. On input change: try to look up the typed name and auto-fill.
    raceInput.addEventListener('change', () => onRaceChosen(raceInput.value));
    raceInput.addEventListener('input', () => {
      // Only auto-fill on exact match (otherwise user is mid-typing)
      const exact = raceIndex.get(raceInput.value.trim().toLowerCase());
      if (exact !== undefined) {
        onRaceChosen(raceInput.value);
      }
    });
  }

  function onRaceChosen(typedName) {
    const key = typedName.trim().toLowerCase()
      .replace(/\s*\(3\.0\)\s*$/, '')
      .replace(/\s*\(3\.5\)\s*$/, '');
    const raceId = raceIndex.get(key);
    if (raceId === undefined) {
      hideInfo();
      return;
    }

    // Pull the full record + sub-tables.
    const race = DB.queryOne(
      "SELECT * FROM race WHERE race_id = ?", [raceId]
    );
    if (!race) return;
    const abilityMods = DB.query(
      "SELECT ability, modifier FROM race_ability_mod WHERE race_id = ?",
      [raceId]
    );
    const movement = DB.query(
      "SELECT mode, speed_ft, maneuverability FROM race_movement " +
      "WHERE race_id = ?", [raceId]
    );
    const languages = DB.query(
      "SELECT language, is_automatic FROM race_language " +
      "WHERE race_id = ? ORDER BY is_automatic DESC, language",
      [raceId]
    );
    const traits = DB.query(
      "SELECT name, description, tag FROM race_trait WHERE race_id = ?",
      [raceId]
    );

    // 1. Type field
    if (race.creature_type) {
      const typeField = document.getElementById('char-type');
      if (typeField && !typeField.value.trim()) {
        typeField.value = race.creature_type;
        typeField.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }

    // 1b. Racial ability adjustments — populate the Race column.
    // Always overwrite (not gated on emptiness) since this is the
    // canonical place for the racial bonus once a race is picked.
    const ABILITY_INPUTS = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
    // Reset all race inputs first, then apply mods from this race.
    for (const a of ABILITY_INPUTS) {
      const el = document.getElementById(`${a}-race`);
      if (el) el.value = '';
    }
    for (const am of abilityMods) {
      const el = document.getElementById(`${am.ability.toLowerCase()}-race`);
      if (el) {
        el.value = am.modifier;
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }

    // 2. Size dropdown
    if (race.size) {
      const sizeSelect = document.getElementById('char-size');
      if (sizeSelect) {
        sizeSelect.value = race.size;
        sizeSelect.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }

    // 3. Speed field — primary land speed; append other modes if present.
    const speedField = document.getElementById('char-speed');
    if (speedField && !speedField.value.trim() && race.base_speed_ft) {
      const parts = [`${race.base_speed_ft} ft.`];
      for (const m of movement) {
        const mod = m.maneuverability ? ` (${m.maneuverability})` : '';
        parts.push(`${m.mode} ${m.speed_ft || '?'} ft.${mod}`);
      }
      speedField.value = parts.join(', ');
      speedField.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // 4. Languages textarea — only the automatic ones, comma-separated.
    const langField = document.getElementById('languages');
    const automaticLangs = languages
      .filter(l => l.is_automatic)
      .map(l => l.language);
    if (langField && !langField.value.trim() && automaticLangs.length) {
      langField.value = automaticLangs.join(', ');
      langField.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // 5. Info panel — always show for the chosen race.
    showInfo(race, abilityMods, movement, languages, traits);

    // 6. Special abilities — auto-populate from race traits.
    populateSpecialAbilities(traits);
  }

  // Auto-populate Special Abilities from racial traits.
  // We mark race-added rows with data-from-race="1" so subsequent race
  // changes can clean them up without disturbing user-typed entries.
  function populateSpecialAbilities(traits) {
    const container = document.getElementById('special-abilities-container');
    if (!container || typeof Feats?.addSpecialAbility !== 'function') return;

    // 1. Remove previously race-added entries.
    container.querySelectorAll('[data-from-race="1"]').forEach(node => {
      const row = node.closest('.feat-row');
      if (row) row.remove();
    });

    // 2. Add the new race's traits.
    for (const t of traits) {
      // Skip empty/duplicative entries (Darkvision/Low-Light Vision are
      // expressed elsewhere in the info panel; skip if the description
      // is empty AND the name is one of those known fields).
      const skipNames = new Set(['Darkvision', 'Low-Light Vision']);
      if (skipNames.has(t.name) && !t.description) continue;
      const text = t.description
        ? `${t.name}: ${t.description}`
        : t.name;
      Feats.addSpecialAbility(text);
      // Tag the textarea we just added so we can find/remove it later.
      // (The textarea is inside the last appended .feat-row.)
      const rows = container.querySelectorAll('.feat-row');
      const lastTa = rows[rows.length - 1]?.querySelector(
        '.special-ability-entry'
      );
      if (lastTa) lastTa.setAttribute('data-from-race', '1');
    }
  }

  function showInfo(race, abilityMods, movement, languages, traits) {
    const panel = document.getElementById('race-info');
    if (!panel) return;
    const bits = [];

    // Ability mods
    if (abilityMods.length) {
      const fmt = abilityMods.map(a =>
        `${a.modifier > 0 ? '+' : ''}${a.modifier} ${a.ability}`
      ).join(', ');
      bits.push(`<b>Ability:</b> ${fmt}`);
    }
    // Vision
    const vision = [];
    if (race.darkvision_ft) vision.push(`darkvision ${race.darkvision_ft} ft.`);
    if (race.has_lowlight_vision) vision.push('low-light vision');
    if (vision.length) bits.push(`<b>Vision:</b> ${vision.join(', ')}`);
    // Favored class
    if (race.favored_class) {
      bits.push(`<b>Favored Class:</b> ${escapeHtml(race.favored_class)}`);
    }
    // Level adjustment
    if (race.level_adjustment) {
      bits.push(`<b>LA:</b> +${race.level_adjustment}`);
    }
    // Racial HD
    if (race.racial_hd && race.racial_hd_die) {
      bits.push(
        `<b>Racial HD:</b> ${race.racial_hd}d${race.racial_hd_die}`
      );
    }
    // Bonus languages (compact)
    const bonusLangs = languages.filter(l => !l.is_automatic).map(l => l.language);
    if (bonusLangs.length) {
      bits.push(`<b>Bonus Languages:</b> ${bonusLangs.join(', ')}`);
    }
    // Notable traits (just names, with descriptions on hover)
    if (traits.length) {
      const trait_html = traits.slice(0, 6).map(t => {
        const desc = (t.description || '').replace(/"/g, '&quot;');
        return `<span title="${desc}" style="border-bottom:1px dotted">` +
               escapeHtml(t.name) + '</span>';
      }).join(', ');
      bits.push(`<b>Traits:</b> ${trait_html}`);
    }

    panel.innerHTML = bits.join(' &nbsp;·&nbsp; ');
    panel.style.display = bits.length ? 'block' : 'none';
  }

  function hideInfo() {
    const panel = document.getElementById('race-info');
    if (panel) panel.style.display = 'none';
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Wait for DB to load, then init.
  DB.ready.then((db) => {
    if (db) init();
  });
})();
