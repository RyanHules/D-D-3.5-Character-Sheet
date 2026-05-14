// class-picker.js — Class + level lookup that auto-fills BAB and saves
// from the SQLite database. Designed to coexist with the existing
// free-form `#char-class` textarea so manual multi-class entries keep
// working.
//
// UI added to the page (next to the Class & Level textarea):
//   #class-lookup           (input)    — class autocomplete
//   #class-lookup-level     (input)    — level number 1-20+
//   #class-lookup-apply     (button)   — explicit apply
//   #class-info             (div)      — preview panel
//   <datalist id="class-options">      — autocomplete options
//
// Existing fields written:
//   #bab-1            — Base Attack Bonus (highest), from progression
//   #fort-base        — Fortitude base save
//   #ref-base         — Reflex base save
//   #will-base        — Will base save
//   #char-class       — appended (or set, if empty) with "ClassName Level"
//   #char-level       — set if currently empty
//
// BAB/save progression formulas (PHB):
//   BAB good   = level
//   BAB avg    = floor(level * 3/4)
//   BAB poor   = floor(level / 2)
//   Save good  = 2 + floor(level / 2)
//   Save poor  = floor(level / 3)

(function () {
  if (!window.DB) {
    console.warn('[class-picker] DB module not loaded');
    return;
  }

  // Map from lowercase class name → array of class_table rows.
  let classIndex = new Map();

  // Default spellcasting/manifesting ability for known classes. Used to
  // pre-select the .sc-ability dropdown when auto-creating a Spells tab.
  // Classes not in this map get an empty ability (user fills in).
  const SPELLCASTING_ABILITY = {
    'Wizard': 'INT', 'Sorcerer': 'CHA', 'Bard': 'CHA',
    'Cleric': 'WIS', 'Druid': 'WIS',
    'Paladin': 'WIS', 'Ranger': 'WIS',
    'Hexblade': 'CHA', 'Warmage': 'CHA',
    'Beguiler': 'INT', 'Dread Necromancer': 'CHA',
    'Healer': 'WIS', 'Spirit Shaman': 'WIS',
    'Wu Jen': 'INT', 'Shugenja': 'CHA',
    'Duskblade': 'INT', 'Sohei': 'WIS',
    'Apostle of Peace': 'WIS', 'Assassin': 'INT',
    'Blackguard': 'WIS',
  };

  // Variants of class names appearing in spell_class_level.class_name
  // (which mixes abbreviations, full names, case variants, and parser-
  // fragmented forms). Used to look up the offset between the
  // spells_per_day_json array index and actual spell level.
  const SPELL_CLASS_VARIANTS = {
    'Wizard':   ['Wiz', 'Wizard', 'wizard'],
    'Sorcerer': ['Sor', 'Sorcerer', 'sorcerer'],
    'Cleric':   ['Clr', 'Cleric', 'cleric', 'C l e r i c'],
    'Druid':    ['Drd', 'Druid', 'druid', 'd r u i d'],
    'Paladin':  ['Pal', 'Paladin', 'paladin'],
    'Ranger':   ['Rgr', 'Ranger', 'ranger', 'r a n g e r'],
    'Bard':     ['Brd', 'Bard', 'bard'],
    'Hexblade': ['Hexblade', 'hexblade'],
    'Warmage':  ['Wmg', 'Warmage', 'warmage'],
    'Beguiler': ['Beguiler', 'beguiler'],
    'Healer':   ['Healer', 'healer'],
    'Wu Jen':   ['Wuj', 'Wij', 'Wu Jen', 'wu jen'],
    'Shugenja': ['Shu', 'Sha', 'Shugenja', 'shugenja'],
    'Duskblade':['Duskblade', 'duskblade'],
    'Assassin': ['Asn', 'Assassin', 'assassin'],
    'Blackguard':['Blk', 'Blackguard', 'blackguard'],
    'Dread Necromancer': ['Dread Necromancer', 'Dread necromancer', 'dread necromancer'],
    'Spirit Shaman': ['Spirit Shaman'],
    'Apostle of Peace': ['Apostle of peace', 'apostle of peace', 'Apostle of Peace'],
  };

  // Classes that grant power points / power-known progressions. Used to
  // auto-create a Psionics tab even when the parsed `class_level` rows
  // are sparse (the parser missed PP/known columns for most psionic
  // classes — flagged in TODO.md under "DB / Parser Data Quality").
  const PSIONIC_CLASSES = new Set([
    'Psion', 'Wilder', 'Psychic Warrior', 'Ardent', 'Erudite',
    'Lurk', 'Divine Mind', 'Soulknife',
  ]);

  // Tome of Battle martial adept classes — get a Maneuvers tab.
  const MARTIAL_ADEPT_CLASSES = new Set([
    'Crusader', 'Warblade', 'Swordsage',
  ]);

  // Class-skill lists per PHB. Special tokens:
  //   "Knowledge (all)"  → expand to every Knowledge subtype
  //   "Craft" / "Perform" / "Profession" (alone) → tick all currently-
  //   added subtype entries for that base skill (auto-ticking new
  //   entries the user adds later isn't supported in MVP).
  // Skill names match `.skill-name` text content from skills.js (which
  // matches data.js entries — Knowledge subtypeLabels: Arcana,
  // Arch. & Eng., Dungeoneering, Geography, History, Local, Nature,
  // Nobility, The Planes, Religion).
  const CLASS_SKILLS = {
    'Barbarian': [
      'Climb','Craft','Handle Animal','Intimidate','Jump','Listen','Ride',
      'Survival','Swim',
    ],
    'Bard': [
      'Appraise','Balance','Bluff','Climb','Concentration','Craft',
      'Decipher Script','Diplomacy','Disguise','Escape Artist',
      'Gather Information','Hide','Jump','Knowledge (all)','Listen',
      'Move Silently','Perform','Profession','Sense Motive',
      'Sleight of Hand','Speak Language','Spellcraft','Swim','Tumble',
      'Use Magic Device',
    ],
    'Cleric': [
      'Concentration','Craft','Diplomacy','Heal','Knowledge (Arcana)',
      'Knowledge (History)','Knowledge (Religion)','Knowledge (The Planes)',
      'Profession','Spellcraft',
    ],
    'Druid': [
      'Concentration','Craft','Diplomacy','Handle Animal','Heal',
      'Knowledge (Nature)','Listen','Profession','Ride','Spellcraft',
      'Spot','Survival','Swim',
    ],
    'Fighter': [
      'Climb','Craft','Handle Animal','Intimidate','Jump','Ride','Swim',
    ],
    'Monk': [
      'Balance','Climb','Concentration','Craft','Diplomacy','Escape Artist',
      'Hide','Jump','Knowledge (Arcana)','Knowledge (Religion)','Listen',
      'Move Silently','Perform','Profession','Sense Motive','Spot','Swim',
      'Tumble',
    ],
    'Paladin': [
      'Concentration','Craft','Diplomacy','Handle Animal','Heal',
      'Knowledge (Nobility)','Knowledge (Religion)','Profession','Ride',
      'Sense Motive',
    ],
    'Ranger': [
      'Climb','Concentration','Craft','Handle Animal','Heal','Hide','Jump',
      'Knowledge (Dungeoneering)','Knowledge (Geography)',
      'Knowledge (Nature)','Listen','Move Silently','Profession','Ride',
      'Search','Spot','Survival','Swim','Use Rope',
    ],
    'Rogue': [
      'Appraise','Balance','Bluff','Climb','Craft','Decipher Script',
      'Diplomacy','Disable Device','Disguise','Escape Artist','Forgery',
      'Gather Information','Hide','Intimidate','Jump','Knowledge (Local)',
      'Listen','Move Silently','Open Lock','Perform','Profession','Search',
      'Sense Motive','Sleight of Hand','Spot','Swim','Tumble',
      'Use Magic Device','Use Rope',
    ],
    'Sorcerer': [
      'Bluff','Concentration','Craft','Knowledge (Arcana)','Profession',
      'Spellcraft',
    ],
    'Wizard': [
      'Concentration','Craft','Decipher Script','Knowledge (all)',
      'Profession','Spellcraft',
    ],
    // Common alt/PrC casters and martials that show up in CLASS_ABILITY:
    'Hexblade': [
      'Bluff','Concentration','Craft','Diplomacy','Intimidate','Knowledge (Arcana)',
      'Profession','Ride','Sense Motive','Spellcraft',
    ],
    'Warmage': [
      'Concentration','Craft','Intimidate','Knowledge (Arcana)','Knowledge (History)',
      'Profession','Spellcraft',
    ],
    'Beguiler': [
      'Bluff','Concentration','Craft','Decipher Script','Diplomacy','Disguise',
      'Escape Artist','Forgery','Gather Information','Hide','Intimidate',
      'Knowledge (Arcana)','Knowledge (Local)','Listen','Move Silently',
      'Profession','Search','Sense Motive','Sleight of Hand','Speak Language',
      'Spellcraft','Spot','Use Magic Device',
    ],
    'Dread Necromancer': [
      'Bluff','Concentration','Craft','Decipher Script','Disguise','Hide',
      'Intimidate','Knowledge (Arcana)','Knowledge (Religion)','Profession',
      'Spellcraft',
    ],
    'Healer': [
      'Concentration','Craft','Diplomacy','Handle Animal','Heal',
      'Knowledge (Nature)','Knowledge (Religion)','Profession','Spellcraft',
    ],
    'Spirit Shaman': [
      'Concentration','Craft','Diplomacy','Heal','Knowledge (Nature)',
      'Knowledge (Religion)','Listen','Profession','Spellcraft','Spot','Survival',
      'Swim',
    ],
    'Duskblade': [
      'Climb','Concentration','Craft','Intimidate','Jump','Knowledge (Arcana)',
      'Ride','Sense Motive','Spellcraft','Swim',
    ],
    'Crusader': [
      'Climb','Concentration','Craft','Diplomacy','Intimidate','Jump',
      'Knowledge (Religion)','Profession','Sense Motive','Swim',
    ],
    'Warblade': [
      'Balance','Climb','Craft','Hide','Intimidate','Jump','Knowledge (History)',
      'Martial Lore','Move Silently','Search','Swim','Tumble',
    ],
    'Swordsage': [
      'Balance','Concentration','Craft','Diplomacy','Hide','Intimidate','Jump',
      'Knowledge (History)','Knowledge (Local)','Knowledge (Nature)',
      'Knowledge (Religion)','Listen','Martial Lore','Move Silently','Profession',
      'Sense Motive','Swim','Tumble',
    ],
    'Psion': [
      'Concentration','Craft','Knowledge (Psionics)','Profession','Psicraft',
    ],
    'Wilder': [
      'Autohypnosis','Bluff','Concentration','Craft','Intimidate','Jump',
      'Knowledge (Psionics)','Listen','Profession','Psicraft','Spot','Swim',
    ],
    'Psychic Warrior': [
      'Autohypnosis','Climb','Concentration','Craft','Handle Animal','Jump',
      'Knowledge (Psionics)','Profession','Ride','Search','Swim',
    ],
  };

  // Spellcasting type per class — used to match "+1 level of existing
  // arcane/divine/manifesting class" PrCs to a target.
  const SPELLCASTING_TYPE = {
    'Wizard': 'arcane',  'Sorcerer': 'arcane',  'Bard': 'arcane',
    'Hexblade': 'arcane','Warmage': 'arcane',   'Beguiler': 'arcane',
    'Dread Necromancer': 'arcane', 'Wu Jen': 'arcane',
    'Duskblade': 'arcane', 'Assassin': 'arcane',
    'Cleric': 'divine',  'Druid': 'divine',
    'Paladin': 'divine', 'Ranger': 'divine',
    'Healer': 'divine',  'Shugenja': 'divine',
    'Spirit Shaman': 'divine', 'Sohei': 'divine',
    'Apostle of Peace': 'divine', 'Blackguard': 'divine',
    'Psion': 'psionic', 'Wilder': 'psionic',
    'Psychic Warrior': 'psionic', 'Ardent': 'psionic',
    'Erudite': 'psionic',
  };

  // PrCs whose `class_level.special` text doesn't include the
  // "+1 level of existing X spellcasting class" marker (parser missed
  // it, or the rules text only appears in the class description).
  // Each entry: { types: ['arcane'|'divine'|'psionic'|'any', …],
  //               advancesAllLevels: bool }. advancesAllLevels=true
  // means the PrC's full level count is the advancement count
  // (Mystic Theurge, Archmage, Loremaster, Arcane Trickster, etc.).
  const HARDCODED_ADVANCERS = {
    'Mystic Theurge':   { types: ['arcane', 'divine'], advancesAllLevels: true },
    'Archmage':         { types: ['arcane'],           advancesAllLevels: true },
    'Loremaster':       { types: ['any'],              advancesAllLevels: true },
    'Arcane Trickster': { types: ['any'],              advancesAllLevels: true },
    'Acolyte of the Skin': { types: ['arcane'],        advancesAllLevels: true },
    'Alienist':         { types: ['arcane'],           advancesAllLevels: true },
    'Anima Mage':       { types: ['arcane'],           advancesAllLevels: true },
    'Argent Savant':    { types: ['arcane'],           advancesAllLevels: true },
    'Blighter':         { types: ['divine'],           advancesAllLevels: true },
    'Contemplative':    { types: ['divine'],           advancesAllLevels: true },
    'Dragon Disciple':  { types: ['arcane'],           advancesAllLevels: true },
    'Dweomerkeeper':    { types: ['divine'],           advancesAllLevels: true },
    'Hierophant':       { types: ['divine'],           advancesAllLevels: true },
    'Hospitaler':       { types: ['divine'],           advancesAllLevels: true },
    'Mage of the Arcane Order': { types: ['arcane'],   advancesAllLevels: true },
    'Master Specialist': { types: ['arcane'],          advancesAllLevels: true },
    'Sacred Exorcist':  { types: ['divine'],           advancesAllLevels: true },
    'Shadowcraft Mage': { types: ['arcane'],           advancesAllLevels: true },
    'Thaumaturgist':    { types: ['divine'],           advancesAllLevels: true },
    'True Necromancer': { types: ['arcane', 'divine'], advancesAllLevels: true },
    'Ur-Priest':        { types: ['divine'],           advancesAllLevels: true },
  };

  function babAt(prog, lvl) {
    if (lvl <= 0) return 0;
    const p = (prog || '').toLowerCase();
    if (p.startsWith('good') || p === 'full' || p === 'high') return lvl;
    if (p.startsWith('ave') || p.startsWith('avg') || p.startsWith('mid') ||
        p === 'three-quarters' || p === '3/4') {
      return Math.floor(lvl * 3 / 4);
    }
    if (p.startsWith('poor') || p === 'half' || p === '1/2') return Math.floor(lvl / 2);
    return 0;
  }

  function saveAt(prog, lvl) {
    if (lvl <= 0) return 0;
    const p = (prog || '').toLowerCase();
    if (p.startsWith('good') || p === 'high') return 2 + Math.floor(lvl / 2);
    if (p.startsWith('poor') || p === 'low') return Math.floor(lvl / 3);
    return 0;
  }

  function init() {
    const classInput = document.getElementById('class-lookup');
    const levelInput = document.getElementById('class-lookup-level');
    const applyBtn   = document.getElementById('class-lookup-apply');
    const infoPanel  = document.getElementById('class-info');
    if (!classInput || !levelInput || !applyBtn || !infoPanel) {
      console.warn('[class-picker] picker UI elements not found');
      return;
    }

    // 1. datalist for autocomplete
    let datalist = document.getElementById('class-options');
    if (!datalist) {
      datalist = document.createElement('datalist');
      datalist.id = 'class-options';
      classInput.setAttribute('list', 'class-options');
      classInput.setAttribute('autocomplete', 'off');
      classInput.parentElement.appendChild(datalist);
    }

    // 2. Populate options. Prefer 3.5 versions; ties broken by newest
    // publication date so e.g. Player's Handbook II Bard wins over
    // 3.0 reprints when both exist under the same display name.
    const rows = DB.query(
      "SELECT e.id AS class_id, e.name AS class, e.version, e.source, "
      + "json_extract(e.data, '$.bab_progression')  AS bab_progression, "
      + "json_extract(e.data, '$.fort_progression') AS fort_progression, "
      + "json_extract(e.data, '$.ref_progression')  AS ref_progression, "
      + "json_extract(e.data, '$.will_progression') AS will_progression, "
      + "json_extract(e.data, '$.table_caption')    AS table_caption "
      + "FROM entry e "
      + "LEFT JOIN book b ON b.name = e.source "
      + "WHERE e.type IN ('class', 'prc') "
      + "ORDER BY e.name, "
      + "         CASE e.version WHEN '3.5' THEN 0 ELSE 1 END, "
      + "         b.publication_date DESC"
    );
    classIndex = new Map();
    for (const r of rows) {
      const key = (r.class || '').toLowerCase();
      if (!classIndex.has(key)) classIndex.set(key, []);
      classIndex.get(key).push(r);
    }
    // Build datalist (deduped by class name; only show 3.5 entry if present).
    for (const [key, list] of classIndex) {
      const r = list[0];
      const opt = document.createElement('option');
      opt.value = r.class;
      datalist.appendChild(opt);
    }
    console.log(`[class-picker] ${classIndex.size} classes available`);

    // 3. Live preview as user types/changes inputs.
    const refresh = () => updatePreview(infoPanel, classInput.value, levelInput.value);
    classInput.addEventListener('input', refresh);
    levelInput.addEventListener('input', refresh);

    // 4. Apply button writes calculated values into the sheet.
    applyBtn.addEventListener('click', () => {
      applyToSheet(classInput.value, levelInput.value, infoPanel);
    });

    // 5. Hook into Character save/load for multiclass state persistence.
    installPersistenceHooks();

    // 6. Render the chip-list area now so the UA-fractional toggle is
    // visible even before any class is applied.
    renderClassList();
  }

  // ============================================================
  // Multiclass state
  //
  // pickedClasses is the source of truth for the aggregated BAB/saves
  // computation. Each entry carries everything needed to recompute
  // without re-querying the DB. The classInfo (chip list) UI is rendered
  // from this array; char-class textarea is rebuilt from it on every
  // change. Manual edits to BAB / saves / char-class survive (they're
  // not pushed back into pickedClasses), but get overwritten on the
  // next Apply or Remove.
  // ============================================================

  let pickedClasses = [];
  // false = "consolidated" model (PHB RAW summation but applied to grouped
  // progressions, so the +2 good-save base only counts once per save type
  // — no multiclass exploit). true = UA p.73 fractional bonuses.
  let useFractional = false;

  function findClassEntry(className) {
    const k = String(className).toLowerCase();
    return pickedClasses.findIndex(e => e.className.toLowerCase() === k);
  }

  // Classify a progression label into "good" | "avg" | "poor" | null.
  function babCategory(prog) {
    const p = (prog || '').toLowerCase();
    if (p.startsWith('good') || p === 'full' || p === 'high') return 'good';
    if (p.startsWith('ave') || p.startsWith('avg') || p.startsWith('mid') ||
        p === 'three-quarters' || p === '3/4') return 'avg';
    if (p.startsWith('poor') || p === 'half' || p === '1/2') return 'poor';
    return null;
  }
  function saveCategory(prog) {
    const p = (prog || '').toLowerCase();
    if (p.startsWith('good') || p === 'high') return 'good';
    if (p.startsWith('poor') || p === 'low')  return 'poor';
    return null;
  }

  // Sum levels by progression category per attribute.
  function levelGroups(entries) {
    const g = {
      bab:  { good: 0, avg: 0, poor: 0 },
      fort: { good: 0, poor: 0 },
      ref:  { good: 0, poor: 0 },
      will: { good: 0, poor: 0 },
    };
    for (const e of entries) {
      const lvl = e.level;
      const bc = babCategory(e.prog.bab);   if (bc) g.bab[bc] += lvl;
      const fc = saveCategory(e.prog.fort); if (fc) g.fort[fc] += lvl;
      const rc = saveCategory(e.prog.ref);  if (rc) g.ref[rc]  += lvl;
      const wc = saveCategory(e.prog.will); if (wc) g.will[wc] += lvl;
    }
    return g;
  }

  function aggregateTotals(entries) {
    let lvl = 0;
    for (const e of entries) lvl += e.level;
    const g = levelGroups(entries);
    let bab, fort, ref, will;
    if (useFractional) {
      // UA p.73: BAB +1/lvl good, +3/4/lvl avg, +1/2/lvl poor; floor at end.
      // Save +2 (once per save) if any good levels, +1/2/lvl good, +1/3/lvl
      // poor; floor at end.
      bab = Math.floor(g.bab.good + g.bab.avg * 0.75 + g.bab.poor * 0.5);
      const frac = (gg, pp) =>
        Math.floor((gg > 0 ? 2 : 0) + gg * 0.5 + pp / 3);
      fort = frac(g.fort.good, g.fort.poor);
      ref  = frac(g.ref.good,  g.ref.poor);
      will = frac(g.will.good, g.will.poor);
    } else {
      // Consolidated PHB: apply each formula ONCE per progression group.
      // Good BAB = level; avg = floor(level*3/4); poor = floor(level/2).
      // Good save = 2 + floor(level/2); poor save = floor(level/3).
      const babSeg = (n, t) =>
        n <= 0 ? 0 :
        t === 'good' ? n :
        t === 'avg'  ? Math.floor(n * 3 / 4) :
                       Math.floor(n / 2);
      const saveSeg = (n, t) =>
        n <= 0 ? 0 :
        t === 'good' ? 2 + Math.floor(n / 2) : Math.floor(n / 3);
      bab  = babSeg(g.bab.good,  'good') +
             babSeg(g.bab.avg,   'avg')  +
             babSeg(g.bab.poor,  'poor');
      fort = saveSeg(g.fort.good, 'good') + saveSeg(g.fort.poor, 'poor');
      ref  = saveSeg(g.ref.good,  'good') + saveSeg(g.ref.poor,  'poor');
      will = saveSeg(g.will.good, 'good') + saveSeg(g.will.poor, 'poor');
    }
    return { bab, fort, ref, will, lvl };
  }

  function applyAggregatesToSheet() {
    const totals = aggregateTotals(pickedClasses);
    setNumeric('bab-1',     totals.bab);
    setNumeric('fort-base', totals.fort);
    setNumeric('ref-base',  totals.ref);
    setNumeric('will-base', totals.will);
    // Rebuild #char-class textarea verbatim from entries.
    const ta = document.getElementById('char-class');
    if (ta) {
      ta.value = pickedClasses
        .map(e => `${e.className} ${e.level}`).join(' / ');
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    }
    // Total Level: only set if user hasn't manually deviated. We track
    // our last-pushed value in a data attribute; if the current value
    // matches it (or is empty), update; otherwise the user has tweaked
    // it (likely to add LA from race) and we leave it alone.
    const tl = document.getElementById('char-level');
    if (tl) {
      const prev = parseInt(tl.dataset.mcComputed || '', 10);
      const cur  = parseInt(tl.value, 10);
      const userTouched = !isNaN(cur) && !isNaN(prev) && cur !== prev;
      if (!tl.value.trim() || !userTouched) {
        tl.value = totals.lvl || '';
        tl.dispatchEvent(new Event('input', { bubbles: true }));
      }
      tl.dataset.mcComputed = String(totals.lvl);
    }
    return totals;
  }

  function renderClassList() {
    const infoPanel = document.getElementById('class-info');
    if (!infoPanel) return;
    let list = document.getElementById('mc-classes-list');
    if (!list) {
      list = document.createElement('div');
      list.id = 'mc-classes-list';
      list.style.cssText =
        'display:flex; gap:0.4rem; flex-wrap:wrap; align-items:center; ' +
        'margin-top:0.25rem; min-height:1.6rem;';
      infoPanel.parentElement.insertBefore(list, infoPanel);
    }
    list.innerHTML = '';

    // Fractional-bonus toggle is always shown so users can change it
    // even with no classes applied yet (the choice persists).
    const toggleWrap = document.createElement('label');
    toggleWrap.style.cssText =
      'font-size:0.8em; opacity:0.85; cursor:pointer; margin-left:auto; ' +
      'display:inline-flex; gap:0.25rem; align-items:center;';
    toggleWrap.title =
      'When checked, BAB and saves use the Unearthed Arcana p.73 ' +
      'fractional base bonus rules (fractions per level summed across ' +
      'all classes, then floored). When unchecked, the consolidated PHB ' +
      'model is used: levels are grouped by progression type per save / ' +
      'per BAB tier, then the formula is applied once per group (so the ' +
      '+2 good-save base only counts once per save).';
    const toggleInput = document.createElement('input');
    toggleInput.type = 'checkbox';
    toggleInput.id = 'mc-use-fractional';
    toggleInput.checked = useFractional;
    toggleInput.addEventListener('change', () => {
      useFractional = toggleInput.checked;
      if (pickedClasses.length) {
        applyAggregatesToSheet();
        if (typeof window.recalcAll === 'function') {
          try { window.recalcAll(); } catch (e) { /* non-fatal */ }
        }
      }
    });
    const toggleLabel = document.createTextNode(' UA fractional (p.73)');
    toggleWrap.appendChild(toggleInput);
    toggleWrap.appendChild(toggleLabel);

    if (!pickedClasses.length) {
      list.appendChild(toggleWrap);
      return;
    }

    const label = document.createElement('span');
    label.textContent = 'Applied:';
    label.style.cssText = 'font-size:0.85em; opacity:0.7';
    list.appendChild(label);

    for (const e of pickedClasses) {
      const chip = document.createElement('span');
      chip.className = 'mc-class-chip';
      chip.dataset.class = e.className;
      chip.style.cssText =
        'background:rgba(106,138,170,0.2); padding:0.15rem 0.5rem; ' +
        'border-radius:3px; font-size:0.85em; ' +
        'display:inline-flex; gap:0.35rem; align-items:center;';
      const txt = document.createElement('span');
      txt.textContent = `${e.className} ${e.level}`;
      const x = document.createElement('button');
      x.type = 'button';
      x.textContent = '×';
      x.title = `Remove ${e.className}`;
      x.style.cssText =
        'background:transparent; border:0; color:#c88; cursor:pointer; ' +
        'font-size:1.1em; padding:0; line-height:1;';
      x.addEventListener('click', () => removeClass(e.className));
      chip.appendChild(txt);
      chip.appendChild(x);
      list.appendChild(chip);
    }

    if (pickedClasses.length >= 2) {
      const clear = document.createElement('button');
      clear.type = 'button';
      clear.textContent = 'Clear All';
      clear.title = 'Remove all applied classes';
      clear.style.cssText =
        'background:transparent; border:1px solid #844; color:#c88; ' +
        'cursor:pointer; font-size:0.8em; padding:0.1rem 0.4rem; ' +
        'border-radius:3px; margin-left:0.3rem;';
      clear.addEventListener('click', clearAllClasses);
      list.appendChild(clear);
    }
    list.appendChild(toggleWrap);
  }

  function removeClass(className) {
    const idx = findClassEntry(className);
    if (idx < 0) return;
    const removed = pickedClasses.splice(idx, 1)[0];

    // Strip this class's Special Abilities entries.
    document
      .querySelectorAll(`[data-from-class="${cssEscape(className)}"]`)
      .forEach(node => {
        const row = node.closest('.feat-row');
        if (row) row.remove();
      });

    // Remove this class's spells tab(s) if any.
    for (const type of ['spellcasting', 'psionics', 'maneuvers']) {
      const panel = findExistingCasterPanel(type, className);
      if (!panel) continue;
      const casterIdx = panel.id.replace(/^caster-/, '');
      const tabBtn = document.querySelector(
        `#spells-tab-bar .inner-tab[data-caster-idx="${casterIdx}"]`
      );
      if (tabBtn) tabBtn.remove();
      panel.remove();
    }

    // Drop advances pointing at the removed class so the chip-list and
    // refreshAllSpellTabs no longer try to advance a class that's gone.
    const removedKey = className.toLowerCase();
    for (const e of pickedClasses) {
      if (!e.advancesTargets) continue;
      e.advancesTargets = e.advancesTargets.map(t =>
        t && t.toLowerCase() === removedKey ? null : t);
    }
    // Untick class-skill checkboxes whose ONLY remaining source was
    // this class. Boxes claimed by other applied classes stay ticked.
    removeClassSkills(className);
    applyAggregatesToSheet();
    refreshAllSpellTabs();
    renderClassList();
    if (typeof window.recalcAll === 'function') {
      try { window.recalcAll(); } catch (e) { /* non-fatal */ }
    }
  }

  function clearAllClasses() {
    if (!pickedClasses.length) return;
    if (!confirm(`Remove all ${pickedClasses.length} applied classes?`)) return;
    // Remove each class via the normal path so spells tabs + special
    // abilities get cleaned up consistently.
    const names = pickedClasses.map(e => e.className);
    for (const n of names) removeClass(n);
  }

  // ============================================================
  // Save / Load persistence
  //
  // Monkey-patch Character.collectData / loadData. On save, append
  // `_multiclass` with the current state. On load, restore the array
  // and re-render the chip list, but DO NOT recompute aggregates — the
  // saved BAB/saves are authoritative (so manual edits survive).
  // ============================================================

  function installPersistenceHooks() {
    // Character is declared `const` at the top of character.js so it's
    // in the global lexical scope but NOT a property of `window` —
    // reference it bare. typeof guards against it being absent (e.g.
    // if someone loads the modules in a different order).
    if (typeof Character === 'undefined' || Character._mcHooked) return;
    Character._mcHooked = true;
    const origCollect = Character.collectData;
    const origLoad    = Character.loadData;
    Character.collectData = function () {
      const out = origCollect.apply(this, arguments) || {};
      if (pickedClasses.length) {
        // Strip prog object for compactness; rehydrate from DB on load.
        out._multiclass = pickedClasses.map(e => ({
          className: e.className, level: e.level,
          classId:   e.classId,   version: e.version,
          advancesTypes:   e.advancesTypes,
          advancesLevels:  e.advancesLevels,
          advancesTargets: e.advancesTargets,
        }));
      }
      if (useFractional) out._fractionalBaseBonus = true;
      return out;
    };
    Character.loadData = function (data) {
      const ret = origLoad.apply(this, arguments);
      pickedClasses = [];
      useFractional = !!(data && data._fractionalBaseBonus);
      if (data && Array.isArray(data._multiclass)) {
        for (const stub of data._multiclass) {
          const cls = stub.classId
            ? DB.queryOne(
                "SELECT id AS class_id, name AS class, version, "
                + "json_extract(data, '$.bab_progression')  AS bab_progression, "
                + "json_extract(data, '$.fort_progression') AS fort_progression, "
                + "json_extract(data, '$.ref_progression')  AS ref_progression, "
                + "json_extract(data, '$.will_progression') AS will_progression "
                + "FROM entry WHERE id = ? AND type IN ('class','prc')",
                [stub.classId]
              )
            : null;
          if (!cls) continue;
          pickedClasses.push({
            className: stub.className,
            level: stub.level,
            classId: stub.classId,
            version: stub.version || cls.version,
            prog: {
              bab:  cls.bab_progression,
              fort: cls.fort_progression,
              ref:  cls.ref_progression,
              will: cls.will_progression,
            },
            advancesTypes:   stub.advancesTypes   || undefined,
            advancesLevels:  stub.advancesLevels  || undefined,
            advancesTargets: stub.advancesTargets || undefined,
          });
        }
      }
      renderClassList();
      // Stamp dataset.mcComputed so the loaded total-level value is
      // recognized as "computed by us" (not a manual deviation) on the
      // next Apply.
      const tl = document.getElementById('char-level');
      if (tl && pickedClasses.length) {
        const totals = aggregateTotals(pickedClasses);
        tl.dataset.mcComputed = String(totals.lvl);
      }
      // Class skills run AFTER all other modules' loadData (Skills.loadData
      // would otherwise reset the checkboxes from saved state). Deferred
      // to the next tick so this re-tags loaded skill rows with their
      // class-skill sources for proper untick-on-remove tracking.
      if (pickedClasses.length) {
        setTimeout(() => {
          for (const e of pickedClasses) applyClassSkills(e.className);
        }, 0);
      }
      return ret;
    };
  }

  function lookupClass(typedName) {
    const key = (typedName || '').trim().toLowerCase();
    if (!key) return null;
    const list = classIndex.get(key);
    if (!list || !list.length) return null;
    return list[0]; // 3.5 preferred (sorted that way)
  }

  // Cache parsed class_table per class entry id.  Hit rate is high because
  // we hit the same class multiple times during a recompute cycle (every
  // applied class queries levelData + levelsUpTo + getSpellcastingDataAtLevel).
  const classTableCache = new Map();

  function fetchClassTable(classId) {
    if (classTableCache.has(classId)) return classTableCache.get(classId);
    const row = DB.queryOne(
      "SELECT json_extract(data, '$.class_table') AS class_table "
      + "FROM entry WHERE id = ?", [classId]);
    let arr = [];
    if (row && row.class_table) {
      try { arr = JSON.parse(row.class_table) || []; }
      catch (e) { console.warn('[class-picker] bad class_table JSON', e); }
    }
    if (!Array.isArray(arr)) arr = [];
    classTableCache.set(classId, arr);
    return arr;
  }

  // Stringify a per-row spells_per_day value into the JSON the rest of
  // class-picker.js expects ("spells_per_day_json" used to be a TEXT
  // column with a JSON array). Same for spells_known.
  function rowToLevelDetail(row) {
    if (!row) return null;
    const spd = row.spells_per_day;
    const sk  = row.spells_known;
    return {
      level: row.level,
      special: row.special || '',
      spells_per_day_json:
        spd === undefined || spd === null ? null : JSON.stringify(spd),
      spells_known_json:
        sk === undefined || sk === null ? null : JSON.stringify(sk),
      power_points_per_day: row.power_points_per_day ?? null,
      powers_known: row.powers_known ?? null,
      max_power_level: row.max_power_level ?? null,
    };
  }

  function levelData(classId, level) {
    const table = fetchClassTable(classId);
    const row = table.find(r => Number(r.level) === Number(level));
    return rowToLevelDetail(row);
  }

  function levelsUpTo(classId, level) {
    const table = fetchClassTable(classId);
    return table
      .filter(r => Number(r.level) <= Number(level))
      .map(r => ({ level: r.level, special: r.special || '' }))
      .sort((a, b) => a.level - b.level);
  }

  // Detect spell-advancing PrC. Returns { types: [...], levels: N } or null.
  // Source A: count class_level rows up to `level` whose `special` text
  //   contains the "+1 level of existing (arcane|divine|manifesting)
  //   spellcasting class" marker. Each match contributes +1 advancement.
  // Source B: hardcoded HARDCODED_ADVANCERS for parser-missed PrCs;
  //   advancesLevels == picked level when advancesAllLevels is true.
  function detectSpellAdvancement(className, classId, level) {
    const rows = levelsUpTo(classId, level);
    const types = new Set();
    let hits = 0;
    for (const r of rows) {
      const text = String(r.special || '');
      // Scan for ALL occurrences (Cerebremancer puts both arcane and
      // manifesting markers on the same level — count each as one).
      const re = /\+\s*1\s*level\s+of\s+existing\s+(arcane|divine|manifesting|psionic)\s+(?:spellcasting|manifesting)?\s*class/gi;
      let m, perRow = 0;
      while ((m = re.exec(text)) !== null) {
        let t = m[1].toLowerCase();
        if (t === 'manifesting') t = 'psionic';
        types.add(t);
        perRow++;
      }
      // Increment hits once per row that had at least one match
      // (Cerebremancer L1 has TWO markers but advances each tracked
      // class by 1, not 2).
      if (perRow > 0) hits++;
    }
    if (hits > 0) {
      return { types: [...types], levels: hits };
    }
    const hard = HARDCODED_ADVANCERS[className];
    if (hard && hard.advancesAllLevels) {
      return { types: hard.types.slice(), levels: level };
    }
    return null;
  }

  // Pick the first matching class in pickedClasses for an advancer's
  // target type. 'any' matches the first class with spellcasting at
  // its native level (regardless of type).
  function pickAdvanceTarget(typeStr, advancerEntry) {
    for (const e of pickedClasses) {
      if (e === advancerEntry) continue;
      if (!e.classId) continue;
      if (typeStr === 'any') {
        if (getSpellcastingDataAtLevel(e.classId, e.level)) return e.className;
        continue;
      }
      if (SPELLCASTING_TYPE[e.className] === typeStr) return e.className;
    }
    return null;
  }

  // Resolve advancesTargets for an entry by re-running pickAdvanceTarget
  // for each type. Updates entry.advancesTargets in place. Skips types
  // already targeting an entry that still exists.
  function refreshAdvanceTargets(entry) {
    if (!entry.advancesTypes || !entry.advancesTypes.length) return;
    const stillExists = (name) =>
      pickedClasses.some(e => e.className.toLowerCase() === name.toLowerCase());
    const oldTargets = entry.advancesTargets || [];
    const next = [];
    for (let i = 0; i < entry.advancesTypes.length; i++) {
      const t = entry.advancesTypes[i];
      const old = oldTargets[i];
      if (old && stillExists(old)) {
        next.push(old);
        continue;
      }
      const fresh = pickAdvanceTarget(t, entry);
      if (fresh) next.push(fresh);
      else next.push(null); // no match available; leave slot empty
    }
    entry.advancesTargets = next;
  }

  // Compute the effective spell-class level for a given base entry
  // (its native level + sum of advancers pointing at it). Capped at 20
  // to avoid querying epic-level rows that aren't in the DB.
  function effectiveSpellLevel(target) {
    let bonus = 0;
    for (const e of pickedClasses) {
      if (e === target) continue;
      if (!e.advancesTargets || !e.advancesTargets.length) continue;
      for (const tgt of e.advancesTargets) {
        if (tgt && tgt.toLowerCase() === target.className.toLowerCase()) {
          bonus += e.advancesLevels || 0;
        }
      }
    }
    return Math.min(20, target.level + bonus);
  }

  // After every apply/remove: refresh each non-advancer's spells tab to
  // reflect the current effective level. Advancer entries with no
  // spellcasting data of their own (Eldritch Knight, Mystic Theurge,
  // …) don't get tabs themselves.
  function refreshAllSpellTabs() {
    for (const e of pickedClasses) refreshAdvanceTargets(e);
    for (const target of pickedClasses) {
      if (!target.classId) continue;
      const effLvl = effectiveSpellLevel(target);
      const sc = getSpellcastingDataAtLevel(target.classId, effLvl);
      if (!sc) continue;
      const offset = getSpellLevelOffset(target.className, sc.spd.length);
      upsertSpellcastingPanel(target.className, effLvl, sc, offset);
    }
  }

  // Strip parser-leaked sample character names (e.g. "Krusk", "Alhandra")
  // that bleed in at the end of the L20 row. Heuristic: a single trailing
  // Capitalized-Word that follows a complete scaling notation.
  function cleanDisplay(text) {
    let s = String(text || '').trim();
    s = s.replace(/(\d+\s*\/\s*(?:day|week|round|encounter|hour|hr|minute|min))\s+[A-Z][a-z]+\s*$/i, '$1');
    s = s.replace(/([+\-]?\s*\d+d\d+)\s+[A-Z][a-z]+\s*$/i, '$1');
    return s.trim();
  }

  // Strip scaling tails (counts, dice, distances, ranks) so two entries
  // for the same feature at different levels collapse onto the same key.
  function stemOf(text) {
    let s = cleanDisplay(text).toLowerCase();
    if (!s) return '';
    // Remove "+Nd6" / "Nd6"
    s = s.replace(/[+\-]?\s*\d+\s*d\s*\d+/g, '');
    // Remove "N/day", "N/week", "N/round", "N/encounter", "N/hour", "N/minute"
    s = s.replace(/\d+\s*\/\s*(?:day|week|round|encounter|hour|hr|minute|min)/gi, '');
    // Remove "N/—" or "N/-" (DR-style)
    s = s.replace(/\d+\s*\/\s*[—\-–]/g, '');
    // Remove trailing "(N)"
    s = s.replace(/\s*\(\s*\d+\s*\)\s*$/, '');
    // Remove trailing "+N ft." / "N ft."
    s = s.replace(/\s*[+\-]?\s*\d+\s*(?:ft\.?|feet)\s*$/i, '');
    // Remove trailing "+N" or "-N" or standalone "N"
    s = s.replace(/\s*[+\-]?\s*\d+\s*$/, '');
    // Collapse whitespace
    return s.replace(/\s+/g, ' ').trim();
  }

  // Skip junk entries: empty strings, em-dashes, single chars, etc.
  function isJunkEntry(text) {
    const t = String(text || '').trim();
    if (!t) return true;
    if (/^[—–\-]+$/.test(t)) return true; // pure em/en/hyphen dashes
    if (t.length < 2) return true;
    return false;
  }

  // Collapse all `special` rows from levels 1..N into a deduplicated list.
  // For each "stem group":
  //   - If all originals match (case-insensitive), it's a stacking feature
  //     (e.g. Fighter "Bonus feat" ×11). Emit once with × count.
  //   - Otherwise it's a scaling feature (e.g. "Smite evil 1/day" → "5/day").
  //     Emit only the highest-level original.
  function dedupSpecials(levelRows) {
    const groups = new Map(); // stem → [{level, original}, ...]
    for (const row of levelRows) {
      if (!row.special) continue;
      const entries = String(row.special).split(/\s*,\s*/);
      for (const raw of entries) {
        const entry = cleanDisplay(raw);
        if (isJunkEntry(entry)) continue;
        const stem = stemOf(entry);
        if (!stem) continue;
        if (!groups.has(stem)) groups.set(stem, []);
        groups.get(stem).push({ level: row.level, original: entry });
      }
    }
    const out = [];
    for (const entries of groups.values()) {
      const originals = new Set(entries.map(e => e.original.toLowerCase()));
      if (originals.size === 1) {
        // Stacking — same text repeated. Use canonical-cased original.
        const e = entries[0];
        out.push({
          label: entries.length > 1
            ? `${e.original} ×${entries.length}`
            : e.original,
          firstLevel: e.level,
        });
      } else {
        // Scaling — keep latest.
        const latest = entries.reduce((a, b) => a.level >= b.level ? a : b);
        out.push({ label: latest.original, firstLevel: latest.level });
      }
    }
    out.sort((a, b) =>
      a.firstLevel - b.firstLevel || a.label.localeCompare(b.label));
    return out;
  }

  function updatePreview(panel, typedName, levelStr) {
    const cls = lookupClass(typedName);
    const level = parseInt(levelStr, 10);
    if (!cls || !level || level < 1) {
      panel.style.display = 'none';
      panel.innerHTML = '';
      return;
    }
    const lvlRow = levelData(cls.class_id, level);

    const bab = babAt(cls.bab_progression, level);
    const fort = saveAt(cls.fort_progression, level);
    const ref  = saveAt(cls.ref_progression, level);
    const will = saveAt(cls.will_progression, level);

    const bits = [];
    bits.push(`<b>${escapeHtml(cls.class)} ${level}</b>` +
      ` <span style="opacity:.7">(${escapeHtml(cls.version || '?')})</span>`);
    bits.push(`<b>BAB:</b> +${bab}`);
    bits.push(`<b>Saves:</b> Fort +${fort}, Ref +${ref}, Will +${will}`);

    // Cumulative class features (1..level), with stack-vs-scale dedup.
    const cumulative = dedupSpecials(levelsUpTo(cls.class_id, level));
    if (cumulative.length) {
      const head = cumulative.slice(0, 8).map(c => {
        return `<span title="Gained at level ${c.firstLevel}">` +
               escapeHtml(c.label) + '</span>';
      }).join(', ');
      const tail = cumulative.length > 8
        ? ` <span style="opacity:.7">+${cumulative.length - 8} more</span>`
        : '';
      bits.push(`<b>Class Features (cumulative):</b> ${head}${tail}`);
    }

    if (lvlRow) {
      const spd = parseJsonArray(lvlRow.spells_per_day_json);
      if (spd && spd.some(x => x !== null && x !== undefined)) {
        bits.push(`<b>Spells/Day:</b> ${formatSpellArray(spd)}`);
      }
      const sk = parseJsonArray(lvlRow.spells_known_json);
      if (sk && sk.some(x => x !== null && x !== undefined)) {
        bits.push(`<b>Spells Known:</b> ${formatSpellArray(sk)}`);
      }
      if (lvlRow.power_points_per_day) {
        bits.push(`<b>PP/Day:</b> ${lvlRow.power_points_per_day}`);
      }
      if (lvlRow.powers_known) {
        bits.push(`<b>Powers Known:</b> ${lvlRow.powers_known}`);
      }
      if (lvlRow.max_power_level) {
        bits.push(`<b>Max Power Lvl:</b> ${escapeHtml(lvlRow.max_power_level)}`);
      }
    } else {
      bits.push(`<i style="opacity:.7">No data for level ${level} in this table</i>`);
    }

    panel.innerHTML = bits.join(' &nbsp;·&nbsp; ');
    panel.style.display = 'block';
  }

  function applyToSheet(typedName, levelStr, panel) {
    const cls = lookupClass(typedName);
    const level = parseInt(levelStr, 10);
    if (!cls || !level || level < 1) {
      flashPanel(panel, 'Pick a class and a valid level first.', '#a66');
      return;
    }

    // Update the multiclass state: replace existing entry for this class,
    // or push a new one. Aggregates (BAB, saves, char-class, total level)
    // are then recomputed across the full pickedClasses list.
    const existingIdx = findClassEntry(cls.class);
    const entry = {
      className: cls.class,
      level: level,
      classId: cls.class_id,
      version: cls.version,
      prog: {
        bab:  cls.bab_progression,
        fort: cls.fort_progression,
        ref:  cls.ref_progression,
        will: cls.will_progression,
      },
    };
    // Detect "+1 caster level of existing X spellcasting class" PrCs.
    const adv = detectSpellAdvancement(cls.class, cls.class_id, level);
    if (adv) {
      entry.advancesTypes = adv.types;
      entry.advancesLevels = adv.levels;
    }
    if (existingIdx >= 0) {
      // Preserve user-pinned target overrides on re-apply (advancesTargets
      // may have been manually selected by the user later via UI).
      const prev = pickedClasses[existingIdx];
      if (prev.advancesTargets) entry.advancesTargets = prev.advancesTargets;
      pickedClasses[existingIdx] = entry;
    } else {
      pickedClasses.push(entry);
    }

    const totals = applyAggregatesToSheet();
    renderClassList();

    // Cumulative class features into Special Abilities, tagged per-class
    // so re-applying the same class (different level) refreshes only its
    // own entries, leaving other classes' (and the race's) entries alone.
    const cumulative = dedupSpecials(levelsUpTo(cls.class_id, level));
    populateSpecialAbilities(cls.class, cumulative);

    // Tick class-skill checkboxes (idempotent on re-apply).
    applyClassSkills(cls.class);

    // Auto-populate the Class Features tab (turn-undead, rage, etc.) for
    // classes whose features map onto existing UI fields. Only fills
    // empty fields, so user customizations on re-apply survive.
    populateClassFeaturesTab(cls.class, level, cls.class_id);

    // If the class has spellcasting at this level (paladin L4+, wizard L1+,
    // etc.), or is a known psionic/martial-adept class, ensure the
    // appropriate Spells sub-tab exists and is populated. No tab is
    // created when the class doesn't grant spell access at this level
    // (e.g. paladin L1-3) — per the user's "0 or more, not none" rule.
    const casterPanel = ensureCasterTab(cls.class, level, cls.class_id);

    // Refresh effective spell levels in case this class is an advancer
    // (Eldritch Knight, Mystic Theurge, …) or in case the just-applied
    // class is the new target of a previously-applied advancer.
    refreshAllSpellTabs();

    // Trigger the orchestrator's recalc if available.
    if (typeof window.recalcAll === 'function') {
      try { window.recalcAll(); } catch (e) { /* non-fatal */ }
    }

    const tabNote = casterPanel ? ' + Spells tab' : '';
    const advNote = entry.advancesTargets && entry.advancesTargets.some(t => t)
      ? ` (advances ${entry.advancesTargets.filter(Boolean).join(' + ')})`
      : (entry.advancesTypes && entry.advancesTypes.length
          ? ` (advances ${entry.advancesTypes.join('+')} caster — no target found)`
          : '');
    const summary = pickedClasses
      .map(e => `${e.className} ${e.level}`).join(' / ');
    flashPanel(panel,
      `Classes: ${summary} → BAB +${totals.bab}, ` +
      `Fort +${totals.fort}, Ref +${totals.ref}, Will +${totals.will}` +
      (cumulative.length ? ` (+${cumulative.length} ${cls.class} features)` : '') +
      tabNote + advNote,
      '#7a9');
  }

  // ============================================================
  // Class → Spells-tab integration
  // ============================================================

  // Look up the offset between spells_per_day_json[i] and actual spell
  // level. Wizards/Sorcerers/Bards/Clerics/Druids/Shugenja: 0 (have
  // cantrips). Paladins/Rangers/Hexblades/Assassins/Blackguards: 1 (no
  // cantrips). Drives the data-driven query against spell_class_level
  // first, falls back to a length-based heuristic when no spell_class_level
  // entries exist for the class.
  function getSpellLevelOffset(className, spdLength) {
    const variants = SPELL_CLASS_VARIANTS[className];
    if (variants && variants.length) {
      const placeholders = variants.map(() => '?').join(',');
      const r = DB.queryOne(
        `SELECT MIN(level) AS mn FROM spell_class_level ` +
        `WHERE class_name IN (${placeholders})`,
        variants
      );
      if (r && r.mn !== null && r.mn !== undefined) return r.mn;
    }
    // Heuristic fallback by progression length:
    //   ≥7 (full caster, bard) → starts at 0-level
    //   <7 (paladin/ranger/etc.) → starts at 1st-level
    return spdLength >= 7 ? 0 : 1;
  }

  // Returns { spd, sk } at the given level if the class grants any spell
  // slots (including 0-base slots — paladin L4 has [0, null,...] which
  // counts), else null. Per the user's spec: "0 or more spell slots,
  // not none" — `none` meaning the array entry is null/undefined.
  function getSpellcastingDataAtLevel(classId, classLevel) {
    const row = levelData(classId, classLevel);
    if (!row) return null;
    const spd = parseJsonArray(row.spells_per_day_json);
    if (!spd || !spd.length) return null;
    const hasAny = spd.some(n => n !== null && n !== undefined);
    if (!hasAny) return null;
    const sk = parseJsonArray(row.spells_known_json);
    return { spd, sk };
  }

  // Find an existing caster panel whose notes start with the class name
  // (case-insensitive). Used for tab dedup so re-applying the same
  // class at a different level updates rather than duplicates.
  function findExistingCasterPanel(type, className) {
    const panels = document.querySelectorAll(
      `#spells-content [data-caster-type="${type}"]`
    );
    const needle = className.toLowerCase();
    for (const p of panels) {
      const notes = p.querySelector('.caster-notes')?.value?.trim().toLowerCase() || '';
      if (notes === needle || notes.startsWith(needle + ' ') ||
          notes.startsWith(needle + ':')) {
        return p;
      }
    }
    return null;
  }

  function ensureCasterTab(className, classLevel, classId) {
    if (typeof Spells?.addCaster !== 'function') return null;
    const sc = getSpellcastingDataAtLevel(classId, classLevel);
    if (sc) {
      const offset = getSpellLevelOffset(className, sc.spd.length);
      return upsertSpellcastingPanel(className, classLevel, sc, offset);
    }
    if (PSIONIC_CLASSES.has(className)) {
      return ensureSimpleCasterTab('psionics', className, classLevel);
    }
    if (MARTIAL_ADEPT_CLASSES.has(className)) {
      return ensureSimpleCasterTab('maneuvers', className, classLevel);
    }
    return null;
  }

  // Parse a single entry from spells_per_day_json. Cleric (and other
  // domain casters) store entries as the string "N+M" — N base slots
  // plus M domain/specialist slot. Returns { base, bonus } where bonus
  // covers domain (Cleric) or specialist (Wizard) extras.
  function parseSlotEntry(raw) {
    if (raw === null || raw === undefined) return null;
    if (typeof raw === 'number') return { base: raw, bonus: 0 };
    const s = String(raw).trim();
    const m = s.match(/^(\d+)\s*\+\s*(\d+)$/);
    if (m) return { base: parseInt(m[1], 10), bonus: parseInt(m[2], 10) };
    const n = parseInt(s, 10);
    if (!isNaN(n)) return { base: n, bonus: 0 };
    return null;
  }

  function upsertSpellcastingPanel(className, classLevel, sc, offset) {
    const data = {
      name: className,
      notes: className,
      casterLevel: classLevel,
      ability: SPELLCASTING_ABILITY[className] || '',
      maxLevel: 9,
    };
    let anyBonus = false;
    for (let i = 0; i < sc.spd.length; i++) {
      const lvl = offset + i;
      if (lvl < 0 || lvl > 9) continue;
      const v = parseSlotEntry(sc.spd[i]);
      if (v) {
        data[`perDay-${lvl}`] = v.base;
        if (v.bonus > 0 && lvl >= 1) {
          data[`domain-${lvl}`] = v.bonus;
          anyBonus = true;
        }
      }
      if (sc.sk) {
        const k = parseSlotEntry(sc.sk[i]);
        if (k) data[`known-${lvl}`] = k.base;
      }
    }
    // Enable domain access for clerics (and any class whose progression
    // has "N+M" entries — that "+M" is the domain/specialist slot).
    // Cleric is the canonical case; specialist wizards get +1 too but
    // the stored generic-wizard progression doesn't include it.
    if (anyBonus && className === 'Cleric') data.domainAccess = true;

    const existing = findExistingCasterPanel('spellcasting', className);
    if (existing) {
      updateSpellcastingPanel(existing, data, classLevel, sc.spd.length, offset);
      return existing;
    }
    Spells.addCaster('spellcasting', data);
    return findExistingCasterPanel('spellcasting', className);
  }

  function updateSpellcastingPanel(panel, data, classLevel, spdLength, offset) {
    // Notes: only set if currently empty or matches a leading class name
    // (don't clobber user-added text like "Wizard — focused conjurer").
    const notes = panel.querySelector('.caster-notes');
    if (notes && !notes.value.trim()) {
      notes.value = data.notes;
      notes.dispatchEvent(new Event('input', { bubbles: true }));
    }
    const cl = panel.querySelector('.sc-caster-level');
    if (cl) {
      cl.value = classLevel;
      cl.dispatchEvent(new Event('input', { bubbles: true }));
    }
    const ab = panel.querySelector('.sc-ability');
    if (ab && data.ability && !ab.value) {
      ab.value = data.ability;
      ab.dispatchEvent(new Event('change', { bubbles: true }));
    }
    // Clear the per-day/known fields IN THE CLASS'S RANGE first so that
    // re-applying at a lower level (e.g. Wizard 7 → Wizard 3) drops the
    // higher-level slots back to empty. Levels outside the class's range
    // (e.g. Bonus Spells from a multiclass other-source) are left alone.
    const lo = offset, hi = offset + spdLength - 1;
    for (let lvl = lo; lvl <= Math.min(9, hi); lvl++) {
      const pd  = panel.querySelector(`.sc-per-day[data-lvl="${lvl}"]`);
      const kn  = panel.querySelector(`.sc-known[data-lvl="${lvl}"]`);
      const dom = panel.querySelector(`.sc-domain-slots[data-lvl="${lvl}"]`);
      if (pd)  pd.value  = '';
      if (kn)  kn.value  = '';
      if (dom) dom.value = '';
    }
    // If the new data activates domain access on a tab that previously
    // didn't have it, flip the toggle so the column becomes visible.
    if (data.domainAccess) {
      const dt = panel.querySelector('.sc-domain-toggle');
      if (dt && !dt.checked) {
        dt.checked = true;
        dt.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
    for (const key of Object.keys(data)) {
      const m = key.match(/^(perDay|known|domain)-(\d+)$/);
      if (!m) continue;
      const klass = m[1] === 'perDay' ? 'sc-per-day'
                  : m[1] === 'known'  ? 'sc-known'
                  : 'sc-domain-slots';
      const inp = panel.querySelector(`.${klass}[data-lvl="${m[2]}"]`);
      if (inp) {
        inp.value = data[key];
        inp.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
    if (typeof Spells?.recalc === 'function') {
      try { Spells.recalc(); } catch (e) { /* non-fatal */ }
    }
  }

  function ensureSimpleCasterTab(type, className, classLevel) {
    const existing = findExistingCasterPanel(type, className);
    if (existing) {
      const cl = existing.querySelector('.sc-caster-level, .pp-manifester-level');
      if (cl) {
        cl.value = classLevel;
        cl.dispatchEvent(new Event('input', { bubbles: true }));
      }
      return existing;
    }
    Spells.addCaster(type, { name: className, notes: className });
    return findExistingCasterPanel(type, className);
  }

  // ============================================================
  // Class skills integration
  // ============================================================

  // Resolve a class-skill spec to the matching `.skill-class-check`
  // checkboxes in the Skills tab. Specs:
  //   "Climb"                → exact-match by .skill-name
  //   "Knowledge (Religion)" → exact-match against the displayName of a
  //                            Knowledge subtype row
  //   "Knowledge (all)"      → all Knowledge subtype rows
  //   "Craft" / "Perform" / "Profession" → all currently-added subtype
  //                            entries for that base skill
  function findSkillCheckboxesForSpec(spec) {
    const out = [];
    const tab = document.getElementById('tab-skills');
    if (!tab) return out;

    if (spec === 'Knowledge (all)') {
      tab.querySelectorAll('tr[data-skill-index]').forEach(tr => {
        const name = tr.querySelector('.skill-name')?.textContent?.trim() || '';
        if (name.startsWith('Knowledge (')) {
          const cb = tr.querySelector('.skill-class-check');
          if (cb) out.push(cb);
        }
      });
      return out;
    }
    if (spec === 'Craft' || spec === 'Perform' || spec === 'Profession') {
      tab.querySelectorAll(`tr[data-subtype-of="${spec}"]`).forEach(tr => {
        const cb = tr.querySelector('.skill-class-check');
        if (cb) out.push(cb);
      });
      return out;
    }
    // Plain skill OR explicit Knowledge subtype.
    tab.querySelectorAll('tr[data-skill-index]').forEach(tr => {
      const name = tr.querySelector('.skill-name')?.textContent?.trim() || '';
      if (name === spec) {
        const cb = tr.querySelector('.skill-class-check');
        if (cb) out.push(cb);
      }
    });
    return out;
  }

  // Tick class-skill checkboxes for `className`. Tracks the originating
  // class on the checkbox via dataset.classSkillSources (comma-separated)
  // so removeClass can untick only when no other applied class still
  // claims it. Manually-ticked boxes (no dataset.classSkillSources) are
  // never modified by remove.
  // Auto-fill the Class Features tab from a class's class_features data.
  // For classes that have UI fields (turn-undead, rage), we map the
  // relevant features. Existing non-empty fields are left alone so user
  // overrides survive re-apply. Idempotent.
  function populateClassFeaturesTab(className, level, classId) {
    if (!classId) return;
    const features = fetchClassFeatures(classId);
    if (!features) return;
    const acquired = features.filter(f =>
      Number(f.level_acquired || 0) <= Number(level));
    if (!acquired.length) return;

    const setIfEmpty = (id, val) => {
      const el = document.getElementById(id);
      if (!el || el.value.trim()) return;
      el.value = val;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };

    // ---- Turn / Rebuke Undead --------------------------------------------
    const hasTurn = acquired.some(f =>
      /\bturn\b|\brebuke\b/i.test(f.name || ''));
    if (hasTurn) {
      setIfEmpty('turn-per-day', '3 + CHA mod');
      setIfEmpty('turn-check', '1d20 + CHA mod');
      setIfEmpty('turn-damage', `2d6 + ${level} + CHA mod`);
    }

    // ---- Rage / Greater Rage / Mighty Rage --------------------------------
    const rageFeat = acquired.find(f => /^rage$/i.test(f.name || ''));
    if (rageFeat) {
      // Rages/day progression for Barbarian (PHB p.25):
      //   L1=1, L4=2, L8=3, L12=4, L16=5, L20=6.
      // Use a closed-form: 1 + floor((L-1)/4), capped at level/4 milestones.
      const perDay = 1 +
        (level >= 4 ? 1 : 0) +
        (level >= 8 ? 1 : 0) +
        (level >= 12 ? 1 : 0) +
        (level >= 16 ? 1 : 0) +
        (level >= 20 ? 1 : 0);
      setIfEmpty('rage-per-day', String(perDay));
      setIfEmpty('rage-duration', '3 + CON mod');
      // Greater (L11), Mighty (L20) bumps.
      const hasMighty = acquired.some(f => /mighty rage/i.test(f.name || ''));
      const hasGreater = acquired.some(f => /greater rage/i.test(f.name || ''));
      const ab = hasMighty ? '+8' : hasGreater ? '+6' : '+4';
      const will = hasMighty ? '+4' : hasGreater ? '+3' : '+2';
      setIfEmpty('rage-str-con', ab);
      setIfEmpty('rage-will', will);
      setIfEmpty('rage-ac', '-2');
    }
  }

  // Cache parsed class_features per class entry id, same pattern as
  // fetchClassTable.
  const classFeaturesCache = new Map();
  function fetchClassFeatures(classId) {
    if (classFeaturesCache.has(classId)) {
      return classFeaturesCache.get(classId);
    }
    const row = DB.queryOne(
      "SELECT json_extract(data, '$.class_features') AS cf "
      + "FROM entry WHERE id = ?", [classId]);
    let arr = [];
    if (row && row.cf) {
      try { arr = JSON.parse(row.cf) || []; }
      catch (e) { console.warn('[class-picker] bad class_features JSON', e); }
    }
    if (!Array.isArray(arr)) arr = [];
    classFeaturesCache.set(classId, arr);
    return arr;
  }

  function applyClassSkills(className) {
    const skills = CLASS_SKILLS[className];
    if (!skills) return;
    for (const spec of skills) {
      for (const cb of findSkillCheckboxesForSpec(spec)) {
        const sources = (cb.dataset.classSkillSources || '')
          .split(',').filter(Boolean);
        if (!sources.includes(className)) sources.push(className);
        cb.dataset.classSkillSources = sources.join(',');
        if (!cb.checked) {
          cb.checked = true;
          cb.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
    }
  }

  function removeClassSkills(className) {
    const tab = document.getElementById('tab-skills');
    if (!tab) return;
    tab.querySelectorAll('.skill-class-check[data-class-skill-sources]')
      .forEach(cb => {
        const sources = (cb.dataset.classSkillSources || '')
          .split(',').filter(Boolean);
        const idx = sources.indexOf(className);
        if (idx < 0) return;
        sources.splice(idx, 1);
        if (sources.length === 0) {
          delete cb.dataset.classSkillSources;
          if (cb.checked) {
            cb.checked = false;
            cb.dispatchEvent(new Event('change', { bubbles: true }));
          }
        } else {
          cb.dataset.classSkillSources = sources.join(',');
        }
      });
  }

  // Auto-populate Special Abilities from cumulative class features.
  // Tags entries with data-from-class="<className>" so subsequent applies
  // of the same class clean up only that class's entries (preserving
  // race traits and other classes' features).
  function populateSpecialAbilities(className, cumulative) {
    const container = document.getElementById('special-abilities-container');
    if (!container || typeof Feats?.addSpecialAbility !== 'function') return;

    // 1. Remove previously class-added entries for this specific class.
    const tag = String(className);
    container
      .querySelectorAll(`[data-from-class="${cssEscape(tag)}"]`)
      .forEach(node => {
        const row = node.closest('.feat-row');
        if (row) row.remove();
      });

    // 2. Add new cumulative entries.
    for (const c of cumulative) {
      const text = `[${className} ${c.firstLevel}] ${c.label}`;
      Feats.addSpecialAbility(text);
      const rows = container.querySelectorAll('.feat-row');
      const lastTa = rows[rows.length - 1]?.querySelector(
        '.special-ability-entry'
      );
      if (lastTa) lastTa.setAttribute('data-from-class', tag);
    }
  }

  // Minimal CSS.escape polyfill — quotes selector parts that contain
  // characters with special meaning (e.g. spaces in "Black Flame Zealot").
  function cssEscape(s) {
    if (window.CSS && typeof window.CSS.escape === 'function') {
      return window.CSS.escape(s);
    }
    return String(s).replace(/[^a-zA-Z0-9_-]/g, ch =>
      '\\' + ch.charCodeAt(0).toString(16) + ' ');
  }

  function setNumeric(id, value) {
    const el = document.getElementById(id);
    if (!el) return;
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
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

  function parseJsonArray(s) {
    if (!s) return null;
    try { return JSON.parse(s); } catch { return null; }
  }

  // Render an array like [4,3,2,1,null,...] as "0:4 / 1:3 / 2:2 / 3:1"
  function formatSpellArray(arr) {
    return arr
      .map((n, i) => (n === null || n === undefined) ? null : `${i}:${n}`)
      .filter(Boolean)
      .join(' / ');
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  DB.ready.then((db) => {
    if (db) init();
  });

  // Expose for testing + integration with future Character module wrappers.
  window.ClassPicker = {
    getState: () => pickedClasses.slice(),
    findEntry: findClassEntry,
    removeClass,
    clearAll: clearAllClasses,
  };
})();
