// template-picker.js — Apply / remove template stacks (Half-Dragon,
// Vampire, Lich, Fiendish, Celestial, etc.) on top of the base race.
//
// Templates are additive layers: ability mods stack into the new
// ability-table Template column; natural armor adds to #ac-natural;
// LA is reflected in the info panel only (the "Total Level (+LA)"
// field is user-managed); creature type may override #char-type;
// per-template traits populate Special Abilities tagged with
// data-from-template="<TemplateName>" so removing a template only
// strips that template's contributions.
//
// UI injected into the basic-info section (after #race-info):
//   #template-lookup           (input)        — autocomplete
//   #template-lookup-apply     (button)       — apply
//   #template-info             (div)          — info preview panel
//   #template-applied-list     (div)          — chips for applied templates
//   <datalist id="template-options">          — autocomplete options
//
// Persistence: monkey-patches Character.collectData / loadData,
// appending `_templates: [{name, templateId, version, abilityMods,
// naturalArmor, creatureTypeBefore}]` so removal can correctly
// reverse the contributions on load.

(function () {
  if (!window.DB) {
    console.warn('[template-picker] DB module not loaded');
    return;
  }

  let templateIndex = new Map(); // lower(name) → row
  let appliedTemplates = [];     // [{ name, templateId, version, ...reversal info }]

  const ABILITY_KEYS = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];

  function init() {
    const raceInput = document.getElementById('char-race');
    if (!raceInput) {
      console.warn('[template-picker] #char-race not found');
      return;
    }

    // Index templates (3.5 preferred over 3.0 if collisions exist).
    const rows = DB.query(
      "SELECT template_id, name, source, version, template_type, " +
      "level_adjustment, new_creature_type, natural_armor_bonus, " +
      "description FROM template " +
      "ORDER BY name COLLATE NOCASE, " +
      "CASE version WHEN '3.5' THEN 0 ELSE 1 END"
    );
    templateIndex = new Map();
    for (const r of rows) {
      const key = (r.name || '').toLowerCase();
      if (!templateIndex.has(key)) templateIndex.set(key, r);
    }

    buildUI(raceInput);
    installPersistenceHooks();
    renderAppliedList();
  }

  function buildUI(raceInput) {
    // Inject AFTER the info-grid (the grandparent of the race input)
    // so the template-picker spans the full section width on its own
    // row, not squeezed into a flex cell of the info-grid.
    const infoGrid = raceInput.closest('.info-grid');
    const section = infoGrid?.parentElement || raceInput.closest('.section');
    if (!section) return;

    const wrap = document.createElement('div');
    wrap.id = 'template-picker';
    wrap.innerHTML = `
      <div>
        <div class="field" style="flex:2 1 14rem; min-width:12rem">
          <label>Template Lookup</label>
          <input type="text" id="template-lookup" list="template-options"
                 placeholder="e.g. Half-Dragon, Vampire, Lich" autocomplete="off">
          <datalist id="template-options"></datalist>
        </div>
        <button type="button" id="template-lookup-apply" class="btn-add btn-add-inline">+ Apply Template</button>
      </div>
      <div id="template-info" class="race-info" style="display:none; border-left-color:#aa6a6a"></div>
      <div id="template-applied-list"></div>
    `;
    // Insert as the FIRST child after the info-grid so it precedes
    // the class & level textarea / class lookup.
    if (infoGrid && infoGrid.nextSibling) {
      section.insertBefore(wrap, infoGrid.nextSibling);
    } else {
      section.appendChild(wrap);
    }

    // Populate datalist
    const dl = document.getElementById('template-options');
    for (const [, r] of templateIndex) {
      const opt = document.createElement('option');
      opt.value = r.name;
      dl.appendChild(opt);
    }

    const tInput = document.getElementById('template-lookup');
    const apply  = document.getElementById('template-lookup-apply');
    const info   = document.getElementById('template-info');

    const refresh = () => updatePreview(info, tInput.value);
    tInput.addEventListener('input', refresh);
    tInput.addEventListener('change', refresh);
    apply.addEventListener('click', () => applyTemplate(tInput.value, info));
  }

  function lookupTemplate(typedName) {
    if (!typedName) return null;
    return templateIndex.get(typedName.trim().toLowerCase()) || null;
  }

  function templateDetail(templateId) {
    const tpl = DB.queryOne(
      "SELECT * FROM template WHERE template_id = ?", [templateId]
    );
    if (!tpl) return null;
    const mods = DB.query(
      "SELECT ability, modifier FROM template_ability_mod " +
      "WHERE template_id = ?", [templateId]
    );
    const traits = DB.query(
      "SELECT name, description FROM template_trait " +
      "WHERE template_id = ?", [templateId]
    );
    const movement = DB.query(
      "SELECT mode, speed_ft, maneuverability FROM template_movement " +
      "WHERE template_id = ?", [templateId]
    );
    const resistance = DB.query(
      "SELECT damage_type, amount FROM template_resistance " +
      "WHERE template_id = ?", [templateId]
    );
    return { tpl, mods, traits, movement, resistance };
  }

  function updatePreview(panel, typedName) {
    const tpl = lookupTemplate(typedName);
    if (!tpl) {
      panel.style.display = 'none';
      panel.innerHTML = '';
      return;
    }
    const detail = templateDetail(tpl.template_id);
    if (!detail) return;

    const bits = [];
    bits.push(`<b>${escapeHtml(tpl.name)}</b>` +
      ` <span style="opacity:.7">(${escapeHtml(tpl.version || '?')}, ${escapeHtml(tpl.source || '?')})</span>`);

    if (detail.mods.length) {
      const fmt = detail.mods.map(m =>
        `${m.modifier > 0 ? '+' : ''}${m.modifier} ${m.ability}`
      ).join(', ');
      bits.push(`<b>Ability:</b> ${fmt}`);
    }
    if (tpl.new_creature_type) {
      bits.push(`<b>Type → ${escapeHtml(tpl.new_creature_type)}</b>`);
    }
    if (tpl.natural_armor_bonus) {
      bits.push(`<b>Natural Armor:</b> +${tpl.natural_armor_bonus}`);
    }
    if (tpl.level_adjustment) {
      bits.push(`<b>LA:</b> +${tpl.level_adjustment}`);
    }
    if (detail.movement.length) {
      const moves = detail.movement.map(m =>
        `${m.mode} ${m.speed_ft || '?'} ft.${m.maneuverability ? ' (' + m.maneuverability + ')' : ''}`
      ).join(', ');
      bits.push(`<b>Movement:</b> ${moves}`);
    }
    if (detail.resistance.length) {
      const r = detail.resistance.map(x => `${x.damage_type} ${x.amount}`).join(', ');
      bits.push(`<b>Resist:</b> ${r}`);
    }
    if (detail.traits.length) {
      const t = detail.traits.slice(0, 6).map(x => {
        const desc = (x.description || '').replace(/"/g, '&quot;');
        return `<span title="${desc}" style="border-bottom:1px dotted">` +
               escapeHtml(x.name) + '</span>';
      }).join(', ');
      const more = detail.traits.length > 6
        ? ` <span style="opacity:.7">+${detail.traits.length - 6} more</span>`
        : '';
      bits.push(`<b>Traits:</b> ${t}${more}`);
    }
    panel.innerHTML = bits.join(' &nbsp;·&nbsp; ');
    panel.style.display = 'block';
  }

  function applyTemplate(typedName, infoPanel) {
    const tpl = lookupTemplate(typedName);
    if (!tpl) {
      flashPanel(infoPanel, 'Pick a template first.', '#a66');
      return;
    }
    if (appliedTemplates.some(t => t.name.toLowerCase() === tpl.name.toLowerCase())) {
      flashPanel(infoPanel, `${tpl.name} already applied.`, '#aa8');
      return;
    }
    const detail = templateDetail(tpl.template_id);
    if (!detail) return;

    // Track contributions for clean removal.
    const reversal = {
      name: tpl.name,
      templateId: tpl.template_id,
      version: tpl.version,
      abilityMods: {},          // ability → amount we added
      naturalArmorAdded: 0,
      creatureTypeBefore: null,
    };

    // 1. Stack ability mods into the Template column.
    for (const m of detail.mods) {
      const a = m.ability.toLowerCase();
      const el = document.getElementById(`${a}-template`);
      if (!el) continue;
      const cur = parseInt(el.value, 10) || 0;
      el.value = cur + (m.modifier || 0);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      reversal.abilityMods[m.ability] = m.modifier || 0;
    }

    // 2. Natural armor bonus stacks into #ac-natural.
    if (tpl.natural_armor_bonus) {
      const na = document.getElementById('ac-natural');
      if (na) {
        const cur = parseInt(na.value, 10) || 0;
        na.value = cur + tpl.natural_armor_bonus;
        na.dispatchEvent(new Event('input', { bubbles: true }));
        reversal.naturalArmorAdded = tpl.natural_armor_bonus;
      }
    }

    // 3. Override creature type if specified.
    if (tpl.new_creature_type) {
      const tf = document.getElementById('char-type');
      if (tf) {
        reversal.creatureTypeBefore = tf.value || '';
        tf.value = tpl.new_creature_type;
        tf.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }

    // 4. Populate Special Abilities with this template's traits.
    populateTemplateTraits(tpl.name, detail.traits);

    appliedTemplates.push(reversal);
    renderAppliedList();
    if (typeof window.recalcAll === 'function') {
      try { window.recalcAll(); } catch (e) { /* non-fatal */ }
    }

    const summary = [];
    if (Object.keys(reversal.abilityMods).length) {
      summary.push(Object.entries(reversal.abilityMods)
        .map(([a, n]) => `${n > 0 ? '+' : ''}${n} ${a}`).join(', '));
    }
    if (tpl.natural_armor_bonus) summary.push(`+${tpl.natural_armor_bonus} NA`);
    if (tpl.level_adjustment) summary.push(`LA +${tpl.level_adjustment}`);
    flashPanel(infoPanel,
      `Applied ${tpl.name}${summary.length ? ': ' + summary.join('; ') : ''}.`,
      '#7a9');
  }

  function removeTemplate(name) {
    const idx = appliedTemplates.findIndex(t =>
      t.name.toLowerCase() === name.toLowerCase());
    if (idx < 0) return;
    const reversal = appliedTemplates.splice(idx, 1)[0];

    // 1. Subtract ability mods.
    for (const [ab, amt] of Object.entries(reversal.abilityMods)) {
      const el = document.getElementById(`${ab.toLowerCase()}-template`);
      if (!el) continue;
      const cur = parseInt(el.value, 10) || 0;
      const next = cur - amt;
      el.value = next === 0 ? '' : String(next);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
    // 2. Subtract natural armor.
    if (reversal.naturalArmorAdded) {
      const na = document.getElementById('ac-natural');
      if (na) {
        const cur = parseInt(na.value, 10) || 0;
        const next = cur - reversal.naturalArmorAdded;
        na.value = next === 0 ? '0' : String(next);
        na.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
    // 3. Restore creature type only if it still equals what we set
    //    (i.e. user hasn't manually changed it since).
    if (reversal.creatureTypeBefore !== null) {
      const tf = document.getElementById('char-type');
      if (tf) {
        // We don't know what the current template wanted to set it to
        // exactly without re-querying, but since this template was
        // most recently applied to it we restore. If the user has
        // manually changed it, this still attempts the restore — they
        // can re-edit. (Conservative behavior preferred to elaborate
        // checks since multiple templates can stack their type changes.)
        tf.value = reversal.creatureTypeBefore;
        tf.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
    // 4. Strip this template's traits.
    document
      .querySelectorAll(`[data-from-template="${cssEscape(reversal.name)}"]`)
      .forEach(node => {
        const row = node.closest('.feat-row');
        if (row) row.remove();
      });
    renderAppliedList();
    if (typeof window.recalcAll === 'function') {
      try { window.recalcAll(); } catch (e) { /* non-fatal */ }
    }
  }

  function populateTemplateTraits(templateName, traits) {
    const container = document.getElementById('special-abilities-container');
    if (!container || typeof Feats?.addSpecialAbility !== 'function') return;
    const skipNames = new Set(['Darkvision', 'Low-Light Vision']);
    for (const t of traits) {
      if (!t.name && !t.description) continue;
      if (skipNames.has(t.name) && !t.description) continue;
      const text = t.description
        ? `[${templateName}] ${t.name}: ${t.description}`
        : `[${templateName}] ${t.name}`;
      Feats.addSpecialAbility(text);
      const rows = container.querySelectorAll('.feat-row');
      const lastTa = rows[rows.length - 1]?.querySelector(
        '.special-ability-entry'
      );
      if (lastTa) lastTa.setAttribute('data-from-template', templateName);
    }
  }

  function renderAppliedList() {
    const list = document.getElementById('template-applied-list');
    if (!list) return;
    list.innerHTML = '';
    if (!appliedTemplates.length) return;
    const label = document.createElement('span');
    label.textContent = 'Templates:';
    label.style.cssText = 'font-size:0.85em; opacity:0.7';
    list.appendChild(label);
    for (const t of appliedTemplates) {
      const chip = document.createElement('span');
      chip.className = 'template-chip';
      chip.dataset.template = t.name;
      chip.style.cssText =
        'background:rgba(170,106,106,0.2); padding:0.15rem 0.5rem; ' +
        'border-radius:3px; font-size:0.85em; ' +
        'display:inline-flex; gap:0.35rem; align-items:center;';
      const txt = document.createElement('span');
      txt.textContent = t.name;
      const x = document.createElement('button');
      x.type = 'button';
      x.textContent = '×';
      x.title = `Remove ${t.name}`;
      x.style.cssText =
        'background:transparent; border:0; color:#c88; cursor:pointer; ' +
        'font-size:1.1em; padding:0; line-height:1;';
      x.addEventListener('click', () => removeTemplate(t.name));
      chip.appendChild(txt);
      chip.appendChild(x);
      list.appendChild(chip);
    }
  }

  function flashPanel(panel, msg, color) {
    if (!panel) return;
    const note = document.createElement('div');
    note.style.cssText = `margin-top:0.3rem;color:${color};font-style:italic`;
    note.textContent = msg;
    panel.appendChild(note);
    panel.style.display = 'block';
    setTimeout(() => note.remove(), 4000);
  }

  // ============================================================
  // Save / Load persistence (monkey-patches Character)
  // ============================================================

  function installPersistenceHooks() {
    if (typeof Character === 'undefined' || Character._tplHooked) return;
    Character._tplHooked = true;
    const origCollect = Character.collectData;
    const origLoad    = Character.loadData;
    Character.collectData = function () {
      const out = origCollect.apply(this, arguments) || {};
      if (appliedTemplates.length) {
        out._templates = appliedTemplates.map(t => ({
          name: t.name,
          templateId: t.templateId,
          version: t.version,
          abilityMods: t.abilityMods,
          naturalArmorAdded: t.naturalArmorAdded,
          creatureTypeBefore: t.creatureTypeBefore,
        }));
      }
      return out;
    };
    Character.loadData = function (data) {
      const ret = origLoad.apply(this, arguments);
      appliedTemplates = [];
      if (data && Array.isArray(data._templates)) {
        for (const t of data._templates) {
          appliedTemplates.push({
            name: t.name,
            templateId: t.templateId,
            version: t.version || '3.5',
            abilityMods: t.abilityMods || {},
            naturalArmorAdded: t.naturalArmorAdded || 0,
            creatureTypeBefore: t.creatureTypeBefore || null,
          });
        }
      }
      renderAppliedList();
      return ret;
    };
  }

  function cssEscape(s) {
    if (window.CSS && typeof window.CSS.escape === 'function') {
      return window.CSS.escape(s);
    }
    return String(s).replace(/[^a-zA-Z0-9_-]/g, ch =>
      '\\' + ch.charCodeAt(0).toString(16) + ' ');
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  DB.ready.then((db) => {
    if (db) init();
  });

  window.TemplatePicker = {
    getApplied: () => appliedTemplates.slice(),
    apply: applyTemplate,
    remove: removeTemplate,
  };
})();
