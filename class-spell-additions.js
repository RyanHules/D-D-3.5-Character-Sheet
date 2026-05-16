// class-spell-additions.js — Per-class catalog of spells AUTOMATICALLY
// added to the player's Spells Known list when a class is applied.
// These are class features like Sand Shaper's "Desert Insight" that
// expand the caster's accessible spell list without consuming a
// known-spells slot.
//
// Each entry maps a class name to one or more features. Each feature
// has an `acquiredAtLevel` (the class level at which the feature
// kicks in) and a `spellsByLevel` map. Spells are pushed into the
// matching spell level on the target spellcaster's structured Known
// list with a `freebie: true` flag; the cap counter excludes freebies.
//
// Routing: spells fan out to EVERY spellcasting class panel the
// character has, matching RAW for Desert Insight ("add the
// following spells to your class spell list"). Each panel's
// freebie set is capped at that panel's own max castable level —
// e.g. a Wizard 5 / Cleric 3 / Sand Shaper 1 gets the L1 desert
// spells in both Spellbook and Cleric Known, but L2+ are excluded
// from the Cleric panel until Cleric can cast at that level.
//
// Future-proofing: if a feature has narrower scope (one specific
// class), grow this catalog entry to carry a `scope` field and
// extend the matching logic in class-picker.js#applyClassSpellAdditions.
//
// Add more entries here as they come up. The format is intentionally
// verbose — copy-paste spell names from canonical text and use exact
// Title Case so the spell-picker datalist autocomplete still matches.

const ClassSpellAdditions = (function () {
  'use strict';

  const CATALOG = {
    'Sand Shaper': [
      {
        // Sandstorm p.82, "Desert Insight (Ex)". Adds desert-themed
        // spells to your spellcasting class's spell list. Doesn't
        // count toward your known-spells cap.
        featureName: 'Desert Insight',
        acquiredAtLevel: 1,
        spellsByLevel: {
          1: [
            "Bear's Endurance",
            "Bull's Strength",
            "Cat's Grace",
            'Endure Elements',
            'Parching Touch',
            'Speak with Animals',
            'Summon Desert Ally I',
          ],
          2: [
            "Eagle's Splendor",
            "Fox's Cunning",
            'Heat Metal',
            "Owl's Wisdom",
            'Resist Energy',
            'Summon Desert Ally II',
            'Summon Swarm',
          ],
          3: [
            'Control Sand',
            'Desiccate',
            'Dispel Magic',
            'Dominate Animal',
            'Haboob',
            'Slipsand',
            'Summon Desert Ally III',
            'Sunstroke',
            'Tormenting Thirst',
            'Wind Wall',
          ],
          4: [
            'Blast of Sand',
            'Summon Desert Ally IV',
            'Wall of Sand',
            'Wither',
          ],
          5: [
            'Choking Sands',
            'Flaywind Burst',
            'Flesh to Salt',
            'Summon Desert Ally V',
            'Transmute Sand to Stone',
            'Transmute Stone to Sand',
          ],
          6: [
            'Awaken Sand',
            'Mummify',
            'Sandstorm',
            'Summon Desert Ally VI',
          ],
          7: [
            'Mass Flesh to Salt',
            'Summon Desert Ally VII',
          ],
          8: [
            'Summon Desert Ally VIII',
            'Whirlwind',
          ],
          9: [
            'Summon Desert Ally IX',
          ],
        },
      },
    ],
  };

  function getFeatures(className) {
    return CATALOG[className] || [];
  }

  // All features for `className` whose threshold is <= `classLevel`.
  function applicableFeatures(className, classLevel) {
    return getFeatures(className)
      .filter(f => (f.acquiredAtLevel || 1) <= classLevel);
  }

  return { getFeatures, applicableFeatures };
})();
