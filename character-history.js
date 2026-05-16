// character-history.js — Per-level character build history substrate.
//
// Phase 1 of the #3 validation work: scaffolds the data shape and the
// save/load round-trip, with auto-reconstruction from current totals
// for existing characters. ZERO UI in this session — the Build
// Timeline view comes next, and the guided level-up wizard after that.
// This module is the foundation everything else hangs off:
//
//   character.history = [
//     {
//       level:              1..N,
//       class_taken:        'Wizard',
//       hp_rolled:          4,
//       ability_boost:      null | 'STR' | 'DEX' | ...,  (L4/8/12/16/20 only)
//       skills_purchased:   { 'Concentration': 4, 'Spellcraft': 4, ... },
//       feats_taken:        ['Combat Casting', 'Spell Focus (Evocation)'],
//       spells_learned:     ['Magic Missile', 'Shield', ...],
//       spells_unlearned:   [],  // sorcerer-style swaps at L4/6/8...
//       choices:            { specialty_school: 'Evocation', ... },
//       notes:              '',
//       _reconstructed:     true | undefined,  // best-guess from totals
//     },
//     ...
//   ];
//
// The history is the source of truth for any per-level validation
// check (feat prereqs at time of acquisition, skill rank caps and
// cost accounting, PrC entry requirements). It does NOT yet drive
// any field on the sheet — manual entries on the Character /
// Skills / Feats tabs still win for now. Session 2 (Build Timeline)
// will expose edit-in-place UI; Session 3 (Wizard) will be the
// new-character build flow; Session 4+ layers validation on top.
//
// **Migration on load:** if the saved data has no `history` field
// (existing characters predating this module), we run
// `reconstructFromTotals()` to fabricate a best-guess history from
// the applied classes, current ability scores, current feats, etc.
// Every reconstructed entry gets `_reconstructed: true` so the
// future Build Timeline view can highlight rows the player should
// audit.

const CharacterHistory = (function () {
  'use strict';

  // In-memory store. `history` is null until loaded or reconstructed.
  let history = null;
  let reconstructedFlag = false;

  // ---- Public read/write API ----------------------------------------

  function get() { return history; }
  function isReconstructed() { return reconstructedFlag; }
  function set(arr, opts) {
    history = Array.isArray(arr) ? arr.slice() : null;
    reconstructedFlag = !!(opts && opts.reconstructed);
  }

  function clear() {
    history = null;
    reconstructedFlag = false;
  }

  // ---- Validation helpers (used by tests + future audit) -----------
  //
  // PHB Table 3-2 schedule for the "core" feats (every 3 levels: L1,
  // 3, 6, 9, 12, 15, 18). Pathfinder-style variant (every odd level)
  // is a toggle that the wizard / replay UI will honor — for v1 we
  // record the schedule against the RAW pattern.
  const FEAT_LEVELS_RAW = [1, 3, 6, 9, 12, 15, 18];
  const FEAT_LEVELS_PATHFINDER = [1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
  function featLevels(usePathfinder) {
    return usePathfinder ? FEAT_LEVELS_PATHFINDER : FEAT_LEVELS_RAW;
  }

  // Ability score increase: every 4th level (L4, 8, 12, 16, 20).
  function isAbilityBoostLevel(level) { return level > 0 && level % 4 === 0; }

  // ---- Auto-reconstruction from current totals ----------------------
  //
  // Best-guess: walks the current state and fabricates a plausible
  // history. Each generated entry is flagged `_reconstructed: true`
  // so the Build Timeline view can highlight rows the user should
  // audit / fix. Reconstruction never deletes or overrides existing
  // history — it only runs when `history` is missing entirely.
  //
  // Inputs:
  //   classes  : [{ className, level }]  from ClassPicker.getState()
  //   feats    : [string]                feat names in order
  //   options  : { pathfinderFeats?: bool, hitDieByClass?: {Class: N} }

  function reconstructFromTotals(classes, feats, options) {
    options = options || {};
    classes = Array.isArray(classes) ? classes : [];
    feats = Array.isArray(feats) ? feats : [];
    const hitDieByClass = options.hitDieByClass || {};
    const pathfinder = !!options.pathfinderFeats;

    // 1. Distribute classes across levels in PICKER ORDER.
    //    If pickedClasses is [{Druid, 5}, {Beastmaster, 3}], levels
    //    1-5 are Druid, levels 6-8 are Beastmaster. This isn't always
    //    correct (the player may have multiclassed mid-progression),
    //    but it's the simplest defensible guess. The Timeline UI
    //    will let them shuffle.
    const classByLevel = [];
    for (const c of classes) {
      const lvl = parseInt(c.level, 10) || 0;
      for (let i = 0; i < lvl; i++) classByLevel.push(c.className);
    }

    if (!classByLevel.length) {
      // No classes applied — emit a stub history (empty array).
      // We don't fabricate a level 1 for an unbuilt character.
      return [];
    }

    // 2. Assign feats to feat-levels in order.
    //    Feats[0] → level 1 feat slot, Feats[1] → level 3 slot, etc.
    //    Excess feats spill over with no level assignment (collected
    //    onto the highest level's feats_taken for now — the Timeline
    //    UI will let the player redistribute).
    const featLvlList = featLevels(pathfinder);
    const featsByLevel = new Map();
    for (let i = 0; i < feats.length; i++) {
      const lvl = i < featLvlList.length
        ? featLvlList[i]
        : classByLevel.length;  // overflow → highest level
      if (!featsByLevel.has(lvl)) featsByLevel.set(lvl, []);
      featsByLevel.get(lvl).push(feats[i]);
    }

    // 3. Build the history array.
    const out = [];
    for (let lvl = 1; lvl <= classByLevel.length; lvl++) {
      const cls = classByLevel[lvl - 1];
      const die = hitDieByClass[cls] || 8;
      const entry = {
        level: lvl,
        class_taken: cls,
        // HP rolled defaults to average rounded up: (die + 1) / 2.
        // At L1 the player typically maxes the die — represent that
        // by using the full die value. The wizard UI will let the
        // user roll / override either way.
        hp_rolled: lvl === 1 ? die : Math.ceil((die + 1) / 2),
        ability_boost: null,
        skills_purchased: {},
        feats_taken: featsByLevel.get(lvl) || [],
        spells_learned: [],
        spells_unlearned: [],
        choices: {},
        notes: '',
        _reconstructed: true,
      };
      out.push(entry);
    }
    return out;
  }

  // ---- Save / Load --------------------------------------------------
  //
  // Round-trips through the character JSON the same way every other
  // module does. We persist the reconstruction flag too so a
  // reconstructed history that the user hasn't audited yet still
  // shows up as "needs review" after save/load.

  function collectData() {
    if (!history) return {};
    return {
      history: history,
      history_reconstructed: reconstructedFlag,
    };
  }

  function loadData(data, opts) {
    opts = opts || {};
    if (data && Array.isArray(data.history)) {
      history = data.history.slice();
      reconstructedFlag = !!data.history_reconstructed;
      return;
    }
    // Migration: no history in the saved data. Reconstruct from
    // whatever current state has been loaded already (this runs
    // late in the loadData pipeline so other modules have populated
    // first). `opts` carries the inputs needed.
    if (opts.classes || opts.feats) {
      history = reconstructFromTotals(
        opts.classes || [], opts.feats || [], opts.options || {});
      reconstructedFlag = true;
    } else {
      history = null;
      reconstructedFlag = false;
    }
  }

  return {
    get, set, clear, isReconstructed,
    reconstructFromTotals,
    isAbilityBoostLevel,
    featLevels,
    collectData, loadData,
  };
})();
