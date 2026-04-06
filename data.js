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

  // Size categories and their modifiers
  sizes: {
    "Fine": { acMod: 8, grappleMod: -16, hideMod: 16 },
    "Diminutive": { acMod: 4, grappleMod: -12, hideMod: 12 },
    "Tiny": { acMod: 2, grappleMod: -8, hideMod: 8 },
    "Small": { acMod: 1, grappleMod: -4, hideMod: 4 },
    "Medium": { acMod: 0, grappleMod: 0, hideMod: 0 },
    "Large": { acMod: -1, grappleMod: 4, hideMod: -4 },
    "Huge": { acMod: -2, grappleMod: 8, hideMod: -8 },
    "Gargantuan": { acMod: -4, grappleMod: 12, hideMod: -12 },
    "Colossal": { acMod: -8, grappleMod: 16, hideMod: -16 },
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
  ],

  // Get synergy bonus key from skill name + optional subtype
  getSkillKey(name, subtypeLabel) {
    if (subtypeLabel) return `${name} (${subtypeLabel})`;
    return name;
  },
};
