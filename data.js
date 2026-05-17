// D&D 3.5 Edition Rules Data

const DND35 = {
  // Safe math expression evaluator for misc modifier boxes
  // Supports: +, -, *, / and parentheses. Returns integer result or 0.
  evalExpr(str) {
    if (!str || typeof str !== 'string') return parseInt(str) || 0;
    const s = str.replace(/\s/g, '');
    if (/^-?\d+$/.test(s)) return parseInt(s);
    // Only allow digits, operators, parens, decimal points
    if (!/^[\d+\-*/().]+$/.test(s)) return 0;
    try {
      const result = Function('"use strict"; return (' + s + ')')();
      return isFinite(result) ? Math.floor(result) : 0;
    } catch { return 0; }
  },

  // Ability score modifier calculation
  abilityModifier(score) {
    if (score === null || score === undefined || score === '') return 0;
    return Math.floor((parseInt(score) - 10) / 2);
  },

  // Standard D&D 3.5 skills with key ability and whether they can be used untrained
  skills: [
    { name: "Appraise", ability: "INT", untrained: true, armorPenalty: false },
    { name: "Balance", ability: "DEX", untrained: true, armorPenalty: true },
    { name: "Bluff", ability: "CHA", untrained: true, armorPenalty: false },
    { name: "Climb", ability: "STR", untrained: true, armorPenalty: true },
    { name: "Concentration", ability: "CON", untrained: true, armorPenalty: false },
    { name: "Craft", ability: "INT", untrained: true, armorPenalty: false, hasSubtype: true, editableSubtype: true },
    { name: "Decipher Script", ability: "INT", untrained: false, armorPenalty: false },
    { name: "Diplomacy", ability: "CHA", untrained: true, armorPenalty: false },
    { name: "Disable Device", ability: "INT", untrained: false, armorPenalty: false },
    { name: "Disguise", ability: "CHA", untrained: true, armorPenalty: false },
    { name: "Escape Artist", ability: "DEX", untrained: true, armorPenalty: true },
    { name: "Forgery", ability: "INT", untrained: true, armorPenalty: false },
    { name: "Gather Information", ability: "CHA", untrained: true, armorPenalty: false },
    { name: "Handle Animal", ability: "CHA", untrained: false, armorPenalty: false },
    { name: "Heal", ability: "WIS", untrained: true, armorPenalty: false },
    { name: "Hide", ability: "DEX", untrained: true, armorPenalty: true },
    { name: "Intimidate", ability: "CHA", untrained: true, armorPenalty: false },
    { name: "Jump", ability: "STR", untrained: true, armorPenalty: true },
    { name: "Knowledge", ability: "INT", untrained: false, armorPenalty: false, hasSubtype: true, subtypeLabel: "Arcana" },
    { name: "Knowledge", ability: "INT", untrained: false, armorPenalty: false, hasSubtype: true, subtypeLabel: "Arch. & Eng." },
    { name: "Knowledge", ability: "INT", untrained: false, armorPenalty: false, hasSubtype: true, subtypeLabel: "Dungeoneering" },
    { name: "Knowledge", ability: "INT", untrained: false, armorPenalty: false, hasSubtype: true, subtypeLabel: "Geography" },
    { name: "Knowledge", ability: "INT", untrained: false, armorPenalty: false, hasSubtype: true, subtypeLabel: "History" },
    { name: "Knowledge", ability: "INT", untrained: false, armorPenalty: false, hasSubtype: true, subtypeLabel: "Local" },
    { name: "Knowledge", ability: "INT", untrained: false, armorPenalty: false, hasSubtype: true, subtypeLabel: "Nature" },
    { name: "Knowledge", ability: "INT", untrained: false, armorPenalty: false, hasSubtype: true, subtypeLabel: "Nobility" },
    { name: "Knowledge", ability: "INT", untrained: false, armorPenalty: false, hasSubtype: true, subtypeLabel: "The Planes" },
    { name: "Knowledge", ability: "INT", untrained: false, armorPenalty: false, hasSubtype: true, subtypeLabel: "Religion" },
    { name: "Listen", ability: "WIS", untrained: true, armorPenalty: false },
    { name: "Move Silently", ability: "DEX", untrained: true, armorPenalty: true },
    { name: "Open Lock", ability: "DEX", untrained: false, armorPenalty: false },
    { name: "Perform", ability: "CHA", untrained: true, armorPenalty: false, hasSubtype: true, editableSubtype: true },
    { name: "Profession", ability: "WIS", untrained: false, armorPenalty: false, hasSubtype: true, editableSubtype: true },
    { name: "Ride", ability: "DEX", untrained: true, armorPenalty: false },
    { name: "Search", ability: "INT", untrained: true, armorPenalty: false },
    { name: "Sense Motive", ability: "WIS", untrained: true, armorPenalty: false },
    { name: "Sleight of Hand", ability: "DEX", untrained: false, armorPenalty: true },
    { name: "Speak Language", ability: "NONE", untrained: false, armorPenalty: false },
    { name: "Spellcraft", ability: "INT", untrained: false, armorPenalty: false },
    { name: "Spot", ability: "WIS", untrained: true, armorPenalty: false },
    { name: "Survival", ability: "WIS", untrained: true, armorPenalty: false },
    { name: "Swim", ability: "STR", untrained: true, armorPenalty: true, doubleArmorPenalty: true },
    { name: "Tumble", ability: "DEX", untrained: false, armorPenalty: true },
    { name: "Use Magic Device", ability: "CHA", untrained: false, armorPenalty: false },
    { name: "Use Rope", ability: "DEX", untrained: true, armorPenalty: false },
  ],

  // Table 9-2: Carrying Loads (PHB p.162)
  // Light load = no penalties; use worse of armor or load penalties (don't stack)
  carryingLoads: {
    light:  { maxDex: Infinity, checkPenalty: 0 },
    medium: { maxDex: 3, checkPenalty: -3 },
    heavy:  { maxDex: 1, checkPenalty: -6 },
  },

  // Determine load category from total weight and STR-based capacity
  getLoadCategory(totalWeight, capacity) {
    if (totalWeight <= capacity[0]) return "light";
    if (totalWeight <= capacity[1]) return "medium";
    return "heavy";
  },

  // ---- Companion progression tables --------------------------------
  //
  // Canonical level-based stat adjustments for the four companion
  // types. Indexed by effective master level (1-20). Each entry is
  // the cumulative bonus AT THAT LEVEL (so consult once with the
  // effective level — no need to sum across rows).
  //
  // Used by companion.js's auto-computed "Progression" info panel
  // and (Phase 2) by the auto-fill of stat fields.
  //
  // Sources: PHB Table 5-1 (p.36 Animal Companion), p.53 sidebar
  // (Wizard/Sorcerer Familiar), Table 3-9 (p.45 Paladin Mount).

  // Returns null when level is outside the valid range for that
  // companion type (e.g. paladin mount before level 5).
  companionProgressions: {
    animal_companion: [
      // level, bonusHD, naAdj, abilityAdj (Str AND Dex), bonusTricks, specials
      { lvlMin: 1,  lvlMax: 2,  bonusHD:  0, naAdj:  0, abilityAdj: 0, bonusTricks: 1,
        specials: ['Link', 'Share Spells'] },
      { lvlMin: 3,  lvlMax: 5,  bonusHD:  2, naAdj:  2, abilityAdj: 1, bonusTricks: 2,
        specials: ['Evasion'] },
      { lvlMin: 6,  lvlMax: 8,  bonusHD:  4, naAdj:  4, abilityAdj: 2, bonusTricks: 3,
        specials: ['Devotion'] },
      { lvlMin: 9,  lvlMax: 11, bonusHD:  6, naAdj:  6, abilityAdj: 3, bonusTricks: 4,
        specials: ['Multiattack'] },
      { lvlMin: 12, lvlMax: 14, bonusHD:  8, naAdj:  8, abilityAdj: 4, bonusTricks: 5,
        specials: [] },
      { lvlMin: 15, lvlMax: 17, bonusHD: 10, naAdj: 10, abilityAdj: 5, bonusTricks: 6,
        specials: ['Improved Evasion'] },
      { lvlMin: 18, lvlMax: 20, bonusHD: 12, naAdj: 12, abilityAdj: 6, bonusTricks: 7,
        specials: [] },
    ],
    familiar: [
      // level, naAdj, intMin, specials (cumulative; abilities are gained
      // at the listed level, persist thereafter)
      { lvlMin: 1,  lvlMax: 2,  naAdj:  1, intMin: 6,
        specials: ['Alertness', 'Improved Evasion', 'Share Spells', 'Empathic Link'] },
      { lvlMin: 3,  lvlMax: 4,  naAdj:  2, intMin: 7,
        specials: ['Deliver Touch Spells'] },
      { lvlMin: 5,  lvlMax: 6,  naAdj:  3, intMin: 8,
        specials: ['Speak with Master'] },
      { lvlMin: 7,  lvlMax: 8,  naAdj:  4, intMin: 9,
        specials: ['Speak with Animals of Its Kind'] },
      { lvlMin: 9,  lvlMax: 10, naAdj:  5, intMin: 10, specials: [] },
      { lvlMin: 11, lvlMax: 12, naAdj:  6, intMin: 11,
        specials: ['Spell Resistance (5 + master level)'] },
      { lvlMin: 13, lvlMax: 14, naAdj:  7, intMin: 12,
        specials: ['Scry on Familiar'] },
      { lvlMin: 15, lvlMax: 16, naAdj:  8, intMin: 13, specials: [] },
      { lvlMin: 17, lvlMax: 18, naAdj:  9, intMin: 14, specials: [] },
      { lvlMin: 19, lvlMax: 20, naAdj: 10, intMin: 15, specials: [] },
    ],
    special_mount: [
      // Paladin mount only kicks in at L5+. Returns null below L5.
      { lvlMin: 5,  lvlMax: 7,  bonusHD: 2, naAdj:  4, strAdj: 1, intMin: 6,
        specials: ['Empathic Link', 'Improved Evasion', 'Share Spells',
                   'Share Saving Throws'] },
      { lvlMin: 8,  lvlMax: 10, bonusHD: 4, naAdj:  6, strAdj: 2, intMin: 7,
        specials: ['Improved Speed'] },
      { lvlMin: 11, lvlMax: 14, bonusHD: 6, naAdj:  8, strAdj: 3, intMin: 8,
        specials: ['Command Creatures of Its Kind'] },
      { lvlMin: 15, lvlMax: 20, bonusHD: 8, naAdj: 10, strAdj: 4, intMin: 9,
        specials: ['Spell Resistance (5 + master level)'] },
    ],
    // Cohort progression isn't a stat block — Leadership (PHB p.97)
    // grants a cohort whose max level is the leader's level - 2.
    // We expose only the cap rule; the cohort is itself a character
    // and its sheet is built separately.
    cohort: null,
  },

  // Look up the progression row for a given type + effective level.
  // Returns null when the level is below the type's threshold.
  getCompanionProgression(type, effectiveLevel) {
    const table = this.companionProgressions[type];
    if (!Array.isArray(table)) return null;
    for (const row of table) {
      if (effectiveLevel >= row.lvlMin && effectiveLevel <= row.lvlMax) {
        return row;
      }
    }
    // Above L20: clamp to the last row (epic rules vary).
    if (effectiveLevel > 20) return table[table.length - 1];
    return null;
  },

  // ============================================================
  // Creature type → BAB / save / hit-die / skill table
  // ============================================================
  //
  // Per the SRD's "Creature Types" section: each type has a fixed BAB
  // progression (full / 3/4 / 1/2), a set of good saves (those without
  // are "poor"), a hit die size, and a per-HD skill point base. Used
  // by companion.js's AUTO mode to recompute BAB / saves / skills
  // when bonus HD are stacked onto a base creature (animal companion
  // / paladin mount).
  //
  // The `parseCreatureType` helper strips parenthesized subtype lists
  // ("Animal (Aquatic)" → "Animal") so the table only needs one row
  // per primary type.

  creatureTypes: {
    // Format: [babPerHd, [goodSaves], hitDieSize, skillBase]
    // babPerHd: 1 (full), 0.75 (3/4), 0.5 (1/2)
    // skillBase: per-HD addition; the FIRST HD also gets ×4 multiplier
    //   per MM ("a creature with racial hit dice gains skill points as
    //   if it were a 1st-level character...").
    Aberration:         { bab: 0.75, goodSaves: ['Will'],        hd: 8,  skillBase: 2 },
    Animal:             { bab: 0.75, goodSaves: ['Fort', 'Ref'], hd: 8,  skillBase: 2 },
    Construct:          { bab: 0.75, goodSaves: [],              hd: 10, skillBase: 2 },
    Deathless:          { bab: 0.5,  goodSaves: ['Will'],        hd: 12, skillBase: 4 },
    Dragon:             { bab: 1,    goodSaves: ['Fort','Ref','Will'], hd: 12, skillBase: 6 },
    Elemental:          { bab: 0.75, goodSaves: ['Fort'],        hd: 8,  skillBase: 2 },
    Fey:                { bab: 0.5,  goodSaves: ['Ref', 'Will'], hd: 6,  skillBase: 6 },
    Giant:              { bab: 0.75, goodSaves: ['Fort'],        hd: 8,  skillBase: 2 },
    Humanoid:           { bab: 0.75, goodSaves: ['Ref'],         hd: 8,  skillBase: 2 },
    'Magical Beast':    { bab: 1,    goodSaves: ['Fort', 'Ref'], hd: 10, skillBase: 2 },
    'Monstrous Humanoid': { bab: 1,  goodSaves: ['Ref', 'Will'], hd: 8,  skillBase: 2 },
    Ooze:               { bab: 0.75, goodSaves: [],              hd: 10, skillBase: 2 },
    Outsider:           { bab: 1,    goodSaves: ['Fort','Ref','Will'], hd: 8,  skillBase: 8 },
    Plant:              { bab: 0.75, goodSaves: ['Fort'],        hd: 8,  skillBase: 2 },
    Shapechanger:       { bab: 0.75, goodSaves: ['Fort', 'Ref'], hd: 8,  skillBase: 2 },
    Undead:             { bab: 0.5,  goodSaves: ['Will'],        hd: 12, skillBase: 4 },
    Vermin:             { bab: 0.75, goodSaves: ['Fort'],        hd: 8,  skillBase: 2 },
  },

  // Strip parenthesized subtype list ("Animal (Aquatic)" → "Animal"),
  // titlecase the result, and return the primary type. Returns null
  // for unrecognized types (e.g. the one Outsider variant typed as
  // "Construct, Outsider (Lawful)" — caller falls back to no recomputation).
  parseCreatureType(raw) {
    if (!raw) return null;
    const primary = String(raw).split(/[,(]/)[0].trim();
    return this.creatureTypes[primary] ? primary : null;
  },

  // BAB at the given total HD for the type's progression. Floor as
  // per SRD (a 3/4-BAB creature with 4 HD has BAB +3, not +3.5).
  creatureBABAtHD(type, hd) {
    const info = this.creatureTypes[type];
    if (!info || !hd) return 0;
    return Math.floor(info.bab * hd);
  },

  // Base save at the given HD for the type. Good save = floor(HD/2)+2;
  // poor save = floor(HD/3). Per SRD Table 3-1 ("Base Save and Base
  // Attack Bonus" — applies to all creature racial HD as well as
  // class levels).
  creatureSaveAtHD(type, hd, which /* 'Fort' | 'Ref' | 'Will' */) {
    const info = this.creatureTypes[type];
    if (!info || !hd) return 0;
    const isGood = info.goodSaves.includes(which);
    return isGood ? Math.floor(hd / 2) + 2 : Math.floor(hd / 3);
  },

  // Skill points per the MM advancement rules:
  //   ×4 multiplier on the FIRST HD, plain on subsequent HD.
  //   Per HD = max(1, skillBase + INT mod) (min 1 from the SRD rule
  //   "characters always get at least 1 skill point per HD").
  creatureSkillPoints(type, hd, intMod) {
    const info = this.creatureTypes[type];
    if (!info || !hd || hd <= 0) return 0;
    const perHd = Math.max(1, info.skillBase + (intMod || 0));
    if (hd === 1) return perHd * 4;
    return perHd * 4 + perHd * (hd - 1);
  },

  // Bonus feat count from racial HD per PHB Table 3-2: 1 feat at HD 1
  // and +1 at every HD divisible by 3 (L3 / 6 / 9 / 12 / ...).
  // Formula: 1 + floor(HD / 3).
  creatureFeatCount(hd) {
    if (!hd || hd < 1) return 0;
    return 1 + Math.floor(hd / 3);
  },

  // Parse hit-die count from a creature's `hit_dice` string
  //   "2d8+4 (13 hp)"  → 2
  //   "1d10"           → 1
  //   "1/2 d8"         → 1 (the half-HD edge case clamps to 1 since
  //                         BAB/skill formulas assume hd >= 1)
  // Returns null if the string doesn't match the expected pattern.
  parseHitDieCount(raw) {
    if (!raw) return null;
    const s = String(raw).trim();
    if (/^1\/2\s*d/i.test(s)) return 1;
    const m = s.match(/^(\d+)\s*d/i);
    return m ? parseInt(m[1], 10) : null;
  },

  // Speed reduction table from PHB p.162 (also used for medium/heavy
  // armor speed reductions, which follow the same numeric pattern):
  // a 1/3 reduction rounded to the nearest 5 ft increment.
  //   30 → 20, 20 → 15, 40 → 30, 15 → 10, etc.
  // Heavy and medium loads apply the same reduction.
  reducedSpeed(baseFt) {
    if (!baseFt || baseFt <= 0) return baseFt || 0;
    if (baseFt === 5)  return 5;
    if (baseFt === 10) return 5;
    if (baseFt === 15) return 10;
    if (baseFt === 20) return 15;
    if (baseFt === 30) return 20;
    if (baseFt === 40) return 30;
    if (baseFt === 50) return 35;
    if (baseFt === 60) return 40;
    // Fallback for unusual speeds: 2/3 rule, rounded down to 5 ft.
    return Math.max(5, Math.floor((baseFt * 2 / 3) / 5) * 5);
  },

  // Size categories and their modifiers
  sizes: {
    "Fine": { acMod: 8, grappleMod: -16, hideMod: 16, carryMult: 1/8 },
    "Diminutive": { acMod: 4, grappleMod: -12, hideMod: 12, carryMult: 1/4 },
    "Tiny": { acMod: 2, grappleMod: -8, hideMod: 8, carryMult: 1/2 },
    "Small": { acMod: 1, grappleMod: -4, hideMod: 4, carryMult: 3/4 },
    "Medium": { acMod: 0, grappleMod: 0, hideMod: 0, carryMult: 1 },
    "Large": { acMod: -1, grappleMod: 4, hideMod: -4, carryMult: 2 },
    "Huge": { acMod: -2, grappleMod: 8, hideMod: -8, carryMult: 4 },
    "Gargantuan": { acMod: -4, grappleMod: 12, hideMod: -12, carryMult: 8 },
    "Colossal": { acMod: -8, grappleMod: 16, hideMod: -16, carryMult: 16 },
  },

  // Carrying capacity by STR score (light load max, medium load max, heavy load max)
  carryingCapacity: {
    1: [3, 6, 10],
    2: [6, 13, 20],
    3: [10, 20, 30],
    4: [13, 26, 40],
    5: [16, 33, 50],
    6: [20, 40, 60],
    7: [23, 46, 70],
    8: [26, 53, 80],
    9: [30, 60, 90],
    10: [33, 66, 100],
    11: [38, 76, 115],
    12: [43, 86, 130],
    13: [50, 100, 150],
    14: [58, 116, 175],
    15: [66, 133, 200],
    16: [76, 153, 230],
    17: [86, 173, 260],
    18: [100, 200, 300],
    19: [116, 233, 350],
    20: [133, 266, 400],
    21: [153, 306, 460],
    22: [173, 346, 520],
    23: [200, 400, 600],
    24: [233, 466, 700],
    25: [266, 533, 800],
    26: [306, 613, 920],
    27: [346, 693, 1040],
    28: [400, 800, 1200],
    29: [466, 933, 1400],
  },

  // For STR 30+, multiply the 20-lower value by 4 for each +10
  getCarryingCapacity(strScore) {
    if (strScore <= 0) return [0, 0, 0];
    if (strScore <= 29) return this.carryingCapacity[strScore] || [0, 0, 0];
    // For scores above 29
    const remainder = strScore % 10;
    const base = (remainder === 0) ? 10 : remainder;
    const multiplier = Math.pow(4, Math.floor((strScore - base) / 10) - (base <= 10 ? 0 : 0));
    const baseCapacity = this.carryingCapacity[base + 10] || this.carryingCapacity[base + 20] || [0, 0, 0];
    // Simplified: for very high scores, approximate
    if (strScore <= 29) return this.carryingCapacity[strScore];
    const tens = Math.floor((strScore - 10) / 10);
    const ones = strScore - 10 - (tens * 10);
    const baseVal = this.carryingCapacity[10 + ones] || [33, 66, 100];
    const mult = Math.pow(4, tens);
    return baseVal.map(v => v * mult);
  },

  // Magic item body slots
  itemSlots: [
    { id: "head", label: "Head", description: "Headband, Hat, Helmet, or Phylactery" },
    { id: "eyes", label: "Eyes", description: "Eye Lenses or Goggles" },
    { id: "neck", label: "Neck", description: "Amulet, Brooch, Medallion, Periapt, or Scarab" },
    { id: "shoulders", label: "Shoulders", description: "Cloak, Cape, or Mantle" },
    { id: "ring1", label: "Ring #1", description: "Ring" },
    { id: "ring2", label: "Ring #2", description: "Ring" },
    { id: "hands", label: "Hands", description: "Gloves or Gauntlets" },
    { id: "arms", label: "Arms/Wrists", description: "Bracers or Bracelets" },
    { id: "body", label: "Body", description: "Robe or Suit of Armor" },
    { id: "torso", label: "Torso", description: "Vest, Vestment, or Shirt" },
    { id: "waist", label: "Waist", description: "Belt or Girdle" },
    { id: "feet", label: "Feet", description: "Boots, Shoes, or Slippers" },
  ],

  // Spell levels
  spellLevels: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],

  // Alignment options
  alignments: [
    "Lawful Good", "Neutral Good", "Chaotic Good",
    "Lawful Neutral", "True Neutral", "Chaotic Neutral",
    "Lawful Evil", "Neutral Evil", "Chaotic Evil"
  ],

  // Ability names
  abilities: ["STR", "DEX", "CON", "INT", "WIS", "CHA"],
  abilityNames: {
    STR: "Strength",
    DEX: "Dexterity",
    CON: "Constitution",
    INT: "Intelligence",
    WIS: "Wisdom",
    CHA: "Charisma"
  },

  // Table 4-5: Skill Synergies (PHB p.66)
  // Each entry: { from: skillName, to: skillName, note?: string }
  // "from" having 5+ ranks gives +2 to "to"
  synergies: [
    { from: "Bluff", to: "Diplomacy" },
    { from: "Bluff", to: "Disguise", note: "when acting in character" },
    { from: "Bluff", to: "Intimidate" },
    { from: "Bluff", to: "Sleight of Hand" },
    { from: "Craft", to: "Appraise", note: "related items only" },
    { from: "Decipher Script", to: "Use Magic Device", note: "involving scrolls" },
    { from: "Escape Artist", to: "Use Rope", note: "involving bindings" },
    { from: "Handle Animal", to: "Ride" },
    { from: "Handle Animal", to: "Wild Empathy", note: "class feature" },
    { from: "Jump", to: "Tumble" },
    { from: "Knowledge (Arcana)", to: "Spellcraft" },
    { from: "Knowledge (Arch. & Eng.)", to: "Search", note: "secret doors & compartments" },
    { from: "Knowledge (Dungeoneering)", to: "Survival", note: "when underground" },
    { from: "Knowledge (Geography)", to: "Survival", note: "to avoid getting lost/hazards" },
    { from: "Knowledge (History)", to: "Bardic Knowledge", note: "class feature" },
    { from: "Knowledge (Local)", to: "Gather Information" },
    { from: "Knowledge (Nature)", to: "Survival", note: "aboveground natural environments" },
    { from: "Knowledge (Nobility)", to: "Diplomacy" },
    { from: "Knowledge (Religion)", to: "Turn/Rebuke Undead", note: "class feature" },
    { from: "Knowledge (The Planes)", to: "Survival", note: "on other planes" },
    { from: "Search", to: "Survival", note: "when following tracks" },
    { from: "Sense Motive", to: "Diplomacy" },
    { from: "Spellcraft", to: "Use Magic Device", note: "involving scrolls" },
    { from: "Survival", to: "Knowledge (Nature)" },
    { from: "Tumble", to: "Balance" },
    { from: "Tumble", to: "Jump" },
    { from: "Use Magic Device", to: "Spellcraft", note: "to decipher spells on scrolls" },
    { from: "Use Rope", to: "Climb", note: "involving climbing ropes" },
    { from: "Use Rope", to: "Escape Artist", note: "involving ropes" },
    // Expanded Psionics Handbook
    { from: "Autohypnosis", to: "Knowledge (Psionics)" },
    { from: "Concentration", to: "Autohypnosis" },
    { from: "Knowledge (Psionics)", to: "Psicraft" },
    { from: "Psicraft", to: "Use Psionic Device", note: "involving power stones" },
    { from: "Use Psionic Device", to: "Psicraft", note: "to address power stones" },
    // Races of Stone
    { from: "Perform", to: "Appraise", note: "related performances" },
    // Races of Destiny
    { from: "Knowledge (Local)", to: "Survival", note: "in urban areas" },
  ],

  // Get synergy bonus key from skill name + optional subtype
  getSkillKey(name, subtypeLabel) {
    if (subtypeLabel) return `${name} (${subtypeLabel})`;
    return name;
  },
};
