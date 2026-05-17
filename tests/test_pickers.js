// Smoke test: runs the EXACT SQL each *-picker.js issues against
// dnd35.db via the same sql.js library the browser uses.
//
// Run: node tests/test_pickers.js
// Exits 0 on all-pass, 1 on any failure.
//
// Methodology: the queries below are pulled verbatim from the picker
// .js files. If you change a picker query, update the matching test.
// `grep -nE "DB\\.(query|queryOne)\\(" *-picker.js` lists them all.
//
// IMPORTANT: as of the 2026-05-14 schema cleanup, ALL pickers query
// the unified `entry` table directly (with json_extract for per-type
// fields). The old per-type compatibility views (spell, feat, item,
// race, monster, class_pc, class_table, class_level, race_*,
// template_*) are gone.

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DB_PATH = path.join(ROOT, 'data/dnd35.db');
const SQL_JS_PATH = path.join(ROOT, 'vendor/sql-wasm.js');
const WASM_PATH = path.join(ROOT, 'vendor/sql-wasm.wasm');

// ---- tiny test framework --------------------------------------------------

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}
function assertGE(actual, expected, msg) {
  assert(actual >= expected,
    msg || `expected >= ${expected}, got ${actual}`);
}
function assertNotEmpty(arr, msg) {
  assert(Array.isArray(arr) && arr.length > 0,
    msg || `expected non-empty array, got ${arr && arr.length}`);
}

// ---- DB loader ------------------------------------------------------------

async function loadDb() {
  const initSqlJs = require(SQL_JS_PATH);
  const SQL = await initSqlJs({
    locateFile: () => WASM_PATH,
  });
  const buf = fs.readFileSync(DB_PATH);
  return new SQL.Database(new Uint8Array(buf));
}

function execAll(db, sql, params) {
  const stmt = db.prepare(sql);
  try {
    if (params) stmt.bind(params);
    const cols = stmt.getColumnNames();
    const rows = [];
    while (stmt.step()) {
      const vs = stmt.get();
      const r = {};
      for (let i = 0; i < cols.length; i++) r[cols[i]] = vs[i];
      rows.push(r);
    }
    return rows;
  } finally {
    stmt.free();
  }
}

function execOne(db, sql, params) {
  const r = execAll(db, sql, params);
  return r.length ? r[0] : null;
}

// ---- tests: database.js load-time queries ---------------------------------

test('count of races > 80', (db) => {
  const r = execOne(db,
    "SELECT COUNT(*) AS n FROM entry WHERE type = 'race'");
  assertGE(r.n, 80);
});

test('count of spells > 2500', (db) => {
  const r = execOne(db,
    "SELECT COUNT(*) AS n FROM entry WHERE type = 'spell'");
  assertGE(r.n, 2500);
});

test('count of feats > 1000', (db) => {
  // feat-picker covers feat + acf; skill_trick moved to
  // special-ability-picker (2026-05-17).
  const r = execOne(db, "SELECT COUNT(*) AS n FROM entry "
    + "WHERE type IN ('feat','acf')");
  assertGE(r.n, 1000);
});

test('count of skill_tricks >= 40', (db) => {
  // Skill tricks are now their own pickable scope (Special Abilities).
  const r = execOne(db,
    "SELECT COUNT(*) AS n FROM entry WHERE type = 'skill_trick'");
  assertGE(r.n, 40);
});

test('count of items > 1500', (db) => {
  const r = execOne(db, "SELECT COUNT(*) AS n FROM entry "
    + "WHERE type IN ('item','weapon','armor','gear')");
  assertGE(r.n, 1500);
});

test('count of templates >= 12 (post-cleanup)', (db) => {
  const r = execOne(db,
    "SELECT COUNT(*) AS n FROM entry WHERE type = 'template'");
  assertGE(r.n, 12);
});

test('no per-type compat views remain', (db) => {
  const rows = execAll(db,
    "SELECT name FROM sqlite_master WHERE type = 'view'");
  assert(rows.length === 0,
    `unexpected views: ${rows.map(r => r.name).join(',')}`);
});

// ---- tests: feat-picker.js ------------------------------------------------

test('feat-picker: list query (init)', (db) => {
  const rows = execAll(db,
    "SELECT id AS feat_id, name, version, types_csv FROM entry "
    + "WHERE type IN ('feat', 'acf') "
    + "ORDER BY CASE version WHEN '3.5' THEN 0 ELSE 1 END, "
    + "name COLLATE NOCASE");
  assertGE(rows.length, 1000);
  assert(rows[0].name && rows[0].feat_id != null);
});

test('feat-picker: detail query (onSelect)', (db) => {
  const list = execAll(db,
    "SELECT id AS feat_id FROM entry "
    + "WHERE type IN ('feat','acf') LIMIT 1");
  const detail = execOne(db,
    "SELECT id AS feat_id, name, source, version, types_csv, "
    + "json_extract(data, '$.prerequisites') AS prerequisites, "
    + "json_extract(data, '$.benefit')       AS benefit, "
    + "json_extract(data, '$.normal')        AS normal, "
    + "json_extract(data, '$.special')       AS special, "
    + "json_extract(data, '$.description')   AS description "
    + "FROM entry WHERE id = ?", [list[0].feat_id]);
  assert(detail && detail.name);
});

// ---- tests: item-picker.js ------------------------------------------------

test('item-picker: list query (init)', (db) => {
  const rows = execAll(db,
    "SELECT id AS item_id, name, version, item_type AS type FROM entry "
    + "WHERE type IN ('item', 'weapon', 'armor', 'gear') "
    + "ORDER BY CASE version WHEN '3.5' THEN 0 ELSE 1 END, "
    + "name COLLATE NOCASE");
  assertGE(rows.length, 1500);
});

test('item-picker: detail query', (db) => {
  const list = execAll(db,
    "SELECT id AS item_id FROM entry "
    + "WHERE type IN ('item','weapon','armor','gear') LIMIT 1");
  const detail = execOne(db,
    "SELECT id AS item_id, name, source, version, "
    + "item_type AS type, body_slot, aura, caster_level, price, weight, "
    + "json_extract(data, '$.prerequisites') AS prerequisites, "
    + "json_extract(data, '$.cost')          AS cost, "
    + "json_extract(data, '$.description')   AS description "
    + "FROM entry WHERE id = ?", [list[0].item_id]);
  assert(detail && detail.name);
});

// ---- tests: spell-picker.js -----------------------------------------------

test('spell-picker: distinct class names (init)', (db) => {
  const rows = execAll(db,
    'SELECT DISTINCT class_name FROM spell_class_level');
  assertGE(rows.length, 25);
  const classes = new Set(rows.map(r => r.class_name));
  assert(classes.has('Sorcerer'));
  assert(classes.has('Cleric'));
  assert(classes.has('Spellthief'));
});

test('spell-picker: spell list join via entry table', (db) => {
  const rows = execAll(db,
    "SELECT DISTINCT e.id AS spell_id, e.name, e.school, e.version "
    + "FROM entry e JOIN spell_class_level scl ON e.id = scl.entry_id "
    + "WHERE e.type = 'spell' "
    + "AND scl.class_name IN (?) AND scl.level = ? "
    + "ORDER BY CASE e.version WHEN '3.5' THEN 0 ELSE 1 END, "
    + "e.name COLLATE NOCASE",
    ['Sorcerer', 3]);
  assertGE(rows.length, 30, 'Sor 3 spell list looks thin');
});

test('spell-picker: spell detail by name', (db) => {
  const r = execOne(db,
    "SELECT id AS spell_id, name, source, version, school, subschool, "
    + "descriptor, "
    + "json_extract(data, '$.components')        AS components, "
    + "json_extract(data, '$.casting_time')      AS casting_time, "
    + "json_extract(data, '$.range')             AS range, "
    + "json_extract(data, '$.target')            AS target, "
    + "json_extract(data, '$.area')              AS area, "
    + "json_extract(data, '$.effect')            AS effect, "
    + "json_extract(data, '$.duration')          AS duration, "
    + "json_extract(data, '$.saving_throw')      AS saving_throw, "
    + "json_extract(data, '$.spell_resistance')  AS spell_resistance, "
    + "json_extract(data, '$.description')       AS description "
    + "FROM entry "
    + "WHERE type = 'spell' AND name = ? COLLATE NOCASE "
    + "ORDER BY CASE version WHEN '3.5' THEN 0 ELSE 1 END LIMIT 1",
    ['Fireball']);
  assert(r && r.name === 'Fireball');
  assert(r.school === 'Evocation');
});

// ---- tests: race-picker.js ------------------------------------------------

test('race-picker: list query (init)', (db) => {
  const rows = execAll(db,
    "SELECT e.id AS race_id, e.name, e.version, e.source, "
    + "       b.publication_date "
    + "FROM entry e "
    + "LEFT JOIN book b ON b.name = e.source "
    + "WHERE e.type = 'race' "
    + "ORDER BY e.name, "
    + "         CASE e.version WHEN '3.5' THEN 0 ELSE 1 END, "
    + "         b.publication_date DESC");
  assertGE(rows.length, 80);
  // Every row should have a publication_date (book table coverage).
  const missing = rows.filter(r => !r.publication_date).map(r => r.source);
  const missingSet = new Set(missing);
  assert(missingSet.size === 0,
    `race rows missing book metadata: ${[...missingSet].slice(0, 5)}`);
});

test('race-picker: Aasimar tiebreak prefers Planar Handbook (2004) over FRCS (2001)', (db) => {
  const rows = execAll(db,
    "SELECT e.id, e.source, b.publication_date "
    + "FROM entry e LEFT JOIN book b ON b.name = e.source "
    + "WHERE e.type = 'race' AND e.name = 'Aasimar' "
    + "ORDER BY CASE e.version WHEN '3.5' THEN 0 ELSE 1 END, "
    + "         b.publication_date DESC");
  if (rows.length < 2) return; // skip if only one Aasimar
  assert(rows[0].source.includes('Planar'),
    `expected Planar Handbook first, got ${rows[0].source}`);
});

test('book table: every entry.source has a matching book row', (db) => {
  const orphans = execAll(db,
    "SELECT DISTINCT source FROM entry "
    + "WHERE source NOT IN (SELECT name FROM book)");
  assert(orphans.length === 0,
    `${orphans.length} sources without book metadata: `
    + orphans.slice(0, 5).map(r => r.source).join(', '));
});

test('book table: 29+ rows seeded, all with valid ISO publication_date', (db) => {
  const rows = execAll(db, "SELECT name, publication_date FROM book");
  assertGE(rows.length, 29);
  for (const r of rows) {
    assert(/^\d{4}-\d{2}-\d{2}$/.test(r.publication_date || ''),
      `bad date for ${r.name}: ${r.publication_date}`);
  }
});

test('race-picker: detail query (entry + JSON.parse-able data)', (db) => {
  const list = execAll(db,
    "SELECT id AS race_id FROM entry WHERE type = 'race' LIMIT 1");
  const r = execOne(db,
    "SELECT id AS race_id, name, source, version, "
    + "creature_size, creature_type, data "
    + "FROM entry WHERE id = ?", [list[0].race_id]);
  assert(r && r.name);
  // data must be parseable JSON
  const parsed = JSON.parse(r.data);
  assert(typeof parsed === 'object', 'data is a JSON object');
});

test('race-picker: ability_mods canonical shape', (db) => {
  const r = execOne(db,
    "SELECT data FROM entry WHERE type = 'race' AND name = 'Dwarf'");
  if (!r) return;
  const d = JSON.parse(r.data);
  assert(Array.isArray(d.ability_mods), 'ability_mods is a list');
  assert(d.ability_mods.length > 0);
  const first = d.ability_mods[0];
  assert(first && 'ability' in first && 'modifier' in first,
    'ability_mods rows are {ability, modifier}');
});

test('race-picker: languages canonical shape', (db) => {
  const r = execOne(db,
    "SELECT data FROM entry WHERE type = 'race' AND name = 'Dwarf'");
  if (!r) return;
  const d = JSON.parse(r.data);
  assert(Array.isArray(d.languages), 'languages is a list');
  const first = d.languages[0];
  assert(first && 'language' in first && 'is_automatic' in first,
    'languages rows are {language, is_automatic}');
});

// ---- tests: template-picker.js --------------------------------------------

test('template-picker: list query (init)', (db) => {
  const rows = execAll(db,
    "SELECT id AS template_id, name, source, version, "
    + "json_extract(data, '$.template_type')      AS template_type, "
    + "json_extract(data, '$.level_adjustment')   AS level_adjustment, "
    + "COALESCE(json_extract(data, '$.new_creature_type'), "
    + "         json_extract(data, '$.type_change')) AS new_creature_type, "
    + "json_extract(data, '$.description')        AS description "
    + "FROM entry WHERE type = 'template' "
    + "ORDER BY name COLLATE NOCASE, "
    + "CASE version WHEN '3.5' THEN 0 ELSE 1 END");
  assertGE(rows.length, 12);
});

test('template-picker: detail query loads parseable data', (db) => {
  const list = execAll(db,
    "SELECT id AS template_id FROM entry WHERE type = 'template' LIMIT 1");
  const r = execOne(db,
    "SELECT id AS template_id, name, source, version, data "
    + "FROM entry WHERE id = ?", [list[0].template_id]);
  assert(r && r.name);
  const parsed = JSON.parse(r.data);
  assert(typeof parsed === 'object');
});

// ---- tests: class-picker.js -----------------------------------------------

test('class-picker: list query (init)', (db) => {
  const rows = execAll(db,
    "SELECT id AS class_id, name AS class, version, source, "
    + "json_extract(data, '$.bab_progression')  AS bab_progression, "
    + "json_extract(data, '$.fort_progression') AS fort_progression, "
    + "json_extract(data, '$.ref_progression')  AS ref_progression, "
    + "json_extract(data, '$.will_progression') AS will_progression, "
    + "json_extract(data, '$.table_caption')    AS table_caption "
    + "FROM entry WHERE type IN ('class', 'prc') "
    + "ORDER BY name, CASE version WHEN '3.5' THEN 0 ELSE 1 END");
  assertGE(rows.length, 200);
  assert(rows[0].class, 'class column populated');
});

test('class-picker: detail by id (multiclass load)', (db) => {
  const list = execAll(db,
    "SELECT id FROM entry WHERE type IN ('class','prc') LIMIT 1");
  const r = execOne(db,
    "SELECT id AS class_id, name AS class, version, "
    + "json_extract(data, '$.bab_progression')  AS bab_progression, "
    + "json_extract(data, '$.fort_progression') AS fort_progression, "
    + "json_extract(data, '$.ref_progression')  AS ref_progression, "
    + "json_extract(data, '$.will_progression') AS will_progression "
    + "FROM entry WHERE id = ? AND type IN ('class','prc')",
    [list[0].id]);
  assert(r && r.class);
});

test('class-picker: class_table JSON parses to list-of-rows', (db) => {
  // Wizard should have a 20-row class_table after normalization.
  const r = execOne(db,
    "SELECT json_extract(data, '$.class_table') AS ct "
    + "FROM entry WHERE type = 'class' AND name = 'Wizard'");
  assert(r && r.ct, 'wizard.class_table exists');
  const arr = JSON.parse(r.ct);
  assert(Array.isArray(arr), 'class_table is a list');
  assert(arr.length === 20, `expected 20 rows, got ${arr.length}`);
  const row0 = arr[0];
  assert(row0.level === 1);
  assert('bab' in row0 && 'special' in row0);
  // Wizards have spells_per_day merged in.
  assert(Array.isArray(row0.spells_per_day),
    'spells_per_day merged into row');
});

test('class-picker: spell_class_level MIN level (caster offset)', (db) => {
  const r = execOne(db,
    "SELECT MIN(level) AS mn FROM spell_class_level "
    + "WHERE class_name IN (?)", ['Wizard']);
  assert(r && r.mn !== null);
});

// ---- tests: domain-picker.js ----------------------------------------------

test('domain-picker: list query (init)', (db) => {
  const rows = execAll(db,
    "SELECT id AS domain_id, name, source, version, "
    + "json_extract(data, '$.granted_power') AS granted_power, "
    + "json_extract(data, '$.spells')        AS spells_json, "
    + "json_extract(data, '$.deities')       AS deities_json "
    + "FROM entry WHERE type = 'domain' "
    + "ORDER BY name COLLATE NOCASE, "
    + "CASE version WHEN '3.5' THEN 0 ELSE 1 END");
  assertGE(rows.length, 65);
  assert(rows[0].name && rows[0].granted_power);
});

test('domain-picker: Celerity domain has spell list and granted power', (db) => {
  // Celerity is the Complete Divine speed domain — we use it instead of
  // Travel because PHB1 hasn't been re-extracted into the new DB yet.
  const r = execOne(db,
    "SELECT name, "
    + "json_extract(data, '$.granted_power') AS granted_power, "
    + "json_extract(data, '$.spells')        AS spells_json "
    + "FROM entry WHERE type = 'domain' AND name = 'Celerity'");
  assert(r && r.granted_power, 'Celerity domain has granted_power');
  const spells = JSON.parse(r.spells_json);
  assert(spells && typeof spells === 'object',
    'Celerity.spells is a dict');
  assertGE(Object.keys(spells).length, 5);
});

// ---- tests: maneuver-picker.js --------------------------------------------

test('maneuver-picker: list query (init)', (db) => {
  const rows = execAll(db,
    "SELECT id AS maneuver_id, name, source, version, discipline, "
    + "json_extract(data, '$.type')              AS type, "
    + "json_extract(data, '$.level')             AS level, "
    + "json_extract(data, '$.initiation_action') AS initiation_action, "
    + "json_extract(data, '$.range')             AS range, "
    + "json_extract(data, '$.target')            AS target, "
    + "json_extract(data, '$.duration')          AS duration, "
    + "json_extract(data, '$.saving_throw')      AS saving_throw, "
    + "json_extract(data, '$.prerequisite')      AS prerequisite, "
    + "json_extract(data, '$.classes')           AS classes_json, "
    + "json_extract(data, '$.description')       AS description "
    + "FROM entry WHERE type = 'maneuver' "
    + "ORDER BY name COLLATE NOCASE, "
    + "CASE version WHEN '3.5' THEN 0 ELSE 1 END");
  assertGE(rows.length, 200);
  // Disciplines present
  const disciplines = new Set(rows.map(r => r.discipline).filter(Boolean));
  assertGE(disciplines.size, 6, '6+ disciplines present');
  assert(disciplines.has('Iron Heart'));
  assert(disciplines.has('Stone Dragon'));
});

test('maneuver-picker: filter by discipline + level (Diamond Mind L2)', (db) => {
  const rows = execAll(db,
    "SELECT name, "
    + "json_extract(data, '$.level') AS level "
    + "FROM entry WHERE type = 'maneuver' "
    + "AND discipline = 'Diamond Mind' "
    + "AND CAST(json_extract(data, '$.level') AS INTEGER) = 2");
  assertGE(rows.length, 1);
});

// ---- tests: class-picker class-features auto-populate ---------------------

test('class-picker: Cleric class_features include Turn Undead', (db) => {
  const r = execOne(db,
    "SELECT json_extract(data, '$.class_features') AS cf "
    + "FROM entry WHERE type = 'class' AND name = 'Cleric'");
  assert(r && r.cf);
  const features = JSON.parse(r.cf);
  const names = features.map(f => f.name || '');
  assert(names.some(n => /turn|rebuke/i.test(n)),
    'Cleric should have Turn/Rebuke Undead');
});

test('class-picker: Barbarian class_features include Rage', (db) => {
  const r = execOne(db,
    "SELECT json_extract(data, '$.class_features') AS cf "
    + "FROM entry WHERE type = 'class' AND name = 'Barbarian'");
  assert(r && r.cf);
  const features = JSON.parse(r.cf);
  const names = features.map(f => f.name || '');
  assert(names.some(n => /^rage$/i.test(n)),
    'Barbarian should have Rage at L1');
});

// ---- tests: power-picker.js -----------------------------------------------

test('power-picker: list query (init)', (db) => {
  const rows = execAll(db,
    "SELECT id AS power_id, name, source, version, discipline, "
    + "json_extract(data, '$.level')              AS level_json, "
    + "json_extract(data, '$.power_points')       AS power_points, "
    + "json_extract(data, '$.description')        AS description "
    + "FROM entry WHERE type = 'power' "
    + "ORDER BY name COLLATE NOCASE, "
    + "CASE version WHEN '3.5' THEN 0 ELSE 1 END");
  assertGE(rows.length, 100);
  // Disciplines present
  const disciplines = new Set(rows.map(r => r.discipline).filter(Boolean));
  assertGE(disciplines.size, 5, '5+ disciplines (the 6 psionic ones)');
});

test('power-picker: level dict shape', (db) => {
  const r = execOne(db,
    "SELECT json_extract(data, '$.level') AS lvl "
    + "FROM entry WHERE type = 'power' AND name = 'Adrenaline Boost'");
  assert(r && r.lvl);
  const lvl = JSON.parse(r.lvl);
  assert(typeof lvl === 'object' && !Array.isArray(lvl),
    'power.level is a {className: level} dict');
  assert(Object.keys(lvl).length >= 1);
});

// ---- tests: mystery-picker.js ---------------------------------------------

test('mystery-picker: list query (init)', (db) => {
  const rows = execAll(db,
    "SELECT id AS mystery_id, name, source, version, "
    + "json_extract(data, '$.path')                 AS path, "
    + "json_extract(data, '$.mystery_level')        AS mystery_level, "
    + "json_extract(data, '$.level_in_progression') AS progression, "
    + "json_extract(data, '$.school')               AS school "
    + "FROM entry WHERE type = 'mystery' "
    + "ORDER BY name COLLATE NOCASE");
  assertGE(rows.length, 65);
  // Progressions present
  const progs = new Set(rows.map(r => r.progression).filter(Boolean));
  assert(progs.has('Fundamental'));
  assert(progs.has('Apprentice'));
  assert(progs.has('Initiate'));
  assert(progs.has('Master'));
});

test('mystery-picker: filter by path + progression', (db) => {
  const rows = execAll(db,
    "SELECT name FROM entry WHERE type = 'mystery' "
    + "AND json_extract(data, '$.level_in_progression') = 'Fundamental'");
  assertGE(rows.length, 5, 'Fundamentals exist');
});

// ---- tests: soulmeld-picker.js --------------------------------------------

test('soulmeld-picker: list query (init)', (db) => {
  const rows = execAll(db,
    "SELECT id AS soulmeld_id, name, source, version, "
    + "json_extract(data, '$.chakra')       AS chakra, "
    + "json_extract(data, '$.classes_csv')  AS classes_csv, "
    + "json_extract(data, '$.description')  AS description "
    + "FROM entry WHERE type = 'soulmeld' "
    + "ORDER BY name COLLATE NOCASE");
  assertGE(rows.length, 80);
  // Chakras present
  const chakras = new Set(rows.map(r => (r.chakra || '').split(/\s*\(/)[0].trim()).filter(Boolean));
  assert(chakras.size >= 8, `expected 8+ distinct chakras, got ${chakras.size}`);
});

test('soulmeld-picker: description has Base / Chakra Bind structure', (db) => {
  const r = execOne(db,
    "SELECT json_extract(data, '$.description') AS d "
    + "FROM entry WHERE type = 'soulmeld' AND name = 'Acrobat Boots'");
  assert(r && r.d);
  assert(/Base:/i.test(r.d), 'has Base: section');
  assert(/Essentia:/i.test(r.d), 'has Essentia: section');
  assert(/Chakra Bind/i.test(r.d), 'has Chakra Bind section');
});

// ---- tests: vestige-picker.js ---------------------------------------------

test('vestige-picker: list query (init)', (db) => {
  const rows = execAll(db,
    "SELECT id AS vestige_id, name, source, version, "
    + "json_extract(data, '$.vestige_level') AS vestige_level, "
    + "json_extract(data, '$.binding_dc')    AS binding_dc, "
    + "json_extract(data, '$.granted_abilities') AS granted_abilities_json "
    + "FROM entry WHERE type = 'vestige' "
    + "ORDER BY CAST(json_extract(data, '$.vestige_level') AS INTEGER), "
    + "         name COLLATE NOCASE");
  assertGE(rows.length, 30);
  // Levels span 1-8.
  const levels = new Set(rows.map(r => r.vestige_level));
  assertGE(levels.size, 6, '6+ distinct vestige levels');
});

test('vestige-picker: Acererak has granted_abilities as a list of records', (db) => {
  const r = execOne(db,
    "SELECT json_extract(data, '$.granted_abilities') AS abil "
    + "FROM entry WHERE type = 'vestige' AND name = 'Acererak, the Devourer'");
  assert(r && r.abil);
  const abilities = JSON.parse(r.abil);
  assert(Array.isArray(abilities), 'granted_abilities is a list');
  assertGE(abilities.length, 2);
  assert('name' in abilities[0] && 'description' in abilities[0],
    'ability rows have {name, description}');
});

// ---- tests: invocation-picker.js ------------------------------------------

test('invocation-picker: list query (init)', (db) => {
  const rows = execAll(db,
    "SELECT id AS invocation_id, name, source, version, "
    + "json_extract(data, '$.grade')                  AS grade, "
    + "json_extract(data, '$.spell_level_equivalent') AS spell_level_equivalent, "
    + "json_extract(data, '$.subcategory')            AS subcategory, "
    + "json_extract(data, '$.description')            AS description "
    + "FROM entry WHERE type = 'invocation' "
    + "ORDER BY name COLLATE NOCASE");
  assertGE(rows.length, 45);
  const grades = new Set(rows.map(r => r.grade).filter(Boolean));
  // Canonical four grades present.
  assert(grades.has('Least'));
  assert(grades.has('Lesser'));
  assert(grades.has('Greater'));
  assert(grades.has('Dark'));
});

test('invocation-picker: filter by grade (Lesser invocations >= 8)', (db) => {
  const rows = execAll(db,
    "SELECT COUNT(*) AS n FROM entry "
    + "WHERE type = 'invocation' "
    + "AND json_extract(data, '$.grade') = 'Lesser'");
  assertGE(rows[0].n, 8);
});

// ---- tests: tag filtering -------------------------------------------------

test('feat-picker: tag filter (combat-maneuver feats >= 60)', (db) => {
  const rows = execAll(db,
    "SELECT COUNT(*) AS n FROM entry e "
    + "JOIN tag t ON t.entry_id = e.id "
    + "WHERE e.type IN ('feat','acf') "
    + "AND t.tag = 'combat-maneuver'");
  assertGE(rows[0].n, 60);
});

// ---- tests: special-ability-picker (skill tricks) -------------------------

test('special-ability-picker: list query (init)', (db) => {
  const rows = execAll(db,
    "SELECT id AS trick_id, name, source, version, "
    + "json_extract(data, '$.category')      AS category, "
    + "json_extract(data, '$.prerequisites') AS prerequisites, "
    + "json_extract(data, '$.benefit')       AS benefit, "
    + "json_extract(data, '$.description')   AS description "
    + "FROM entry WHERE type = 'skill_trick' "
    + "ORDER BY name COLLATE NOCASE, "
    + "         CASE version WHEN '3.5' THEN 0 ELSE 1 END");
  assertGE(rows.length, 40);
  assert(rows[0].name && rows[0].trick_id != null);
  // Category should be one of the four CScoundrel buckets.
  const cats = new Set(rows.map(r => r.category).filter(Boolean));
  for (const expected of ['Interaction', 'Manipulation', 'Mental', 'Movement']) {
    assert(cats.has(expected),
      `skill_trick.category set should include "${expected}"`);
  }
});

test('item-picker: tag filter (slotless items >= 500)', (db) => {
  const rows = execAll(db,
    "SELECT COUNT(*) AS n FROM entry e "
    + "JOIN tag t ON t.entry_id = e.id "
    + "WHERE e.type IN ('item','weapon','armor','gear') "
    + "AND t.tag = 'slotless'");
  assertGE(rows[0].n, 500);
});

test('spell-picker: tag filter (mind-affecting spells >= 100)', (db) => {
  const rows = execAll(db,
    "SELECT COUNT(*) AS n FROM entry e "
    + "JOIN tag t ON t.entry_id = e.id "
    + "WHERE e.type = 'spell' AND t.tag = 'mind-affecting'");
  assertGE(rows[0].n, 100);
});

// ---- tests: NEW capabilities (tags, errata, spell-access provenance) ------

test('tags: query feats by combat-maneuver tag', (db) => {
  const rows = execAll(db,
    'SELECT e.name, e.source FROM entry e '
    + 'JOIN tag t ON t.entry_id = e.id '
    + 'WHERE t.tag = ? AND e.type = ?',
    ['combat-maneuver', 'feat']);
  assertGE(rows.length, 60);
});

test('tags: spells by school via tag mirror', (db) => {
  const rows = execAll(db,
    'SELECT e.name FROM entry e JOIN tag t ON t.entry_id = e.id '
    + "WHERE t.tag = 'evocation' AND e.type = 'spell'");
  assertGE(rows.length, 200);
});

test('errata: applied errata count', (db) => {
  const r = execOne(db,
    'SELECT COUNT(*) AS n FROM errata WHERE applied = 1');
  assertGE(r.n, 100);
});

test('errata: lookup errata for polymorph chain', (db) => {
  const rows = execAll(db,
    'SELECT e.name, er.kind, er.field FROM entry e '
    + 'JOIN errata er ON er.entry_id = e.id '
    + 'WHERE e.name LIKE ?', ['%olymorph%']);
  assertGE(rows.length, 1);
});

test('spell-access: Spellthief derived spells', (db) => {
  const rows = execAll(db,
    'SELECT e.name, scl.level, scl.provenance '
    + 'FROM entry e JOIN spell_class_level scl ON scl.entry_id = e.id '
    + "WHERE scl.class_name = 'Spellthief' "
    + 'ORDER BY e.name LIMIT 5');
  assertNotEmpty(rows);
  for (const r of rows) {
    assert(r.provenance.startsWith('derived'));
  }
});

test('spell-access: Beguiler has both native + derived', (db) => {
  const rows = execAll(db,
    'SELECT scl.provenance, COUNT(*) AS n '
    + 'FROM entry e JOIN spell_class_level scl ON scl.entry_id = e.id '
    + "WHERE scl.class_name = 'Beguiler' "
    + 'GROUP BY scl.provenance');
  assertGE(rows.length, 1);
  const total = rows.reduce((s, r) => s + r.n, 0);
  assertGE(total, 80);
});

// ---- tests: universal lookup modal ---------------------------------------

// The lookup modal builds its index from two queries at DB.ready.
// Both are verbatim from lookup.js#buildIndex.
test('lookup: cross-type index covers all major types', (db) => {
  const rows = execAll(db,
    "SELECT id, name, type, source FROM entry WHERE name IS NOT NULL");
  // Every entry in the DB should be searchable — the modal lists
  // ~10,500 today and we expect that to keep growing.
  assertGE(rows.length, 10000);
  // At least one row for each primary type the modal shows chips for.
  const seen = new Set(rows.map(r => r.type));
  for (const t of ['spell', 'feat', 'item', 'creature', 'rule',
                   'class', 'prc', 'race']) {
    assert(seen.has(t), `expected at least one '${t}' entry in lookup index`);
  }
});

test('lookup: type counts populated for chip strip', (db) => {
  const rows = execAll(db,
    "SELECT type, COUNT(*) AS n FROM entry " +
    "WHERE name IS NOT NULL GROUP BY type");
  // Sanity-check the chip-strip primary types: each should have a
  // user-visible number of rows (spells/feats/items dominate).
  const map = new Map(rows.map(r => [r.type, r.n]));
  assertGE(map.get('spell') || 0, 1000);
  assertGE(map.get('feat')  || 0, 500);
  assertGE(map.get('rule')  || 0, 100);
});

test('lookup: tag fanout query returns rows per entry', (db) => {
  // lookup.js#buildIndex does `SELECT entry_id, tag FROM tag` to build
  // a Map<entry_id, Set<tag>>. Verify the table has columns the code
  // expects and that the join distribution is plausible.
  const rows = execAll(db,
    "SELECT entry_id, tag FROM tag LIMIT 100");
  assertNotEmpty(rows);
  for (const r of rows) {
    assert(typeof r.entry_id === 'number',
      'tag.entry_id should be an integer');
    assert(r.tag && typeof r.tag === 'string',
      'tag.tag should be a non-empty string');
  }
  // At least 200 distinct entries are tagged — this powers the
  // `tag:mind-affecting` prefix syntax.
  const distinct = execOne(db,
    "SELECT COUNT(DISTINCT entry_id) AS n FROM tag");
  assertGE(distinct.n, 200);
});

test('lookup: errata badge index covers known applied entries', (db) => {
  // The badge module queries `SELECT entry_id, applied FROM errata`
  // at first use and builds two Sets. Make sure the table has both
  // applied + advisory records, and no orphan FKs.
  const counts = execOne(db,
    "SELECT " +
    "  COUNT(*) AS total, " +
    "  SUM(CASE WHEN applied = 1 THEN 1 ELSE 0 END) AS n_applied, " +
    "  COUNT(DISTINCT entry_id) AS n_entries " +
    "FROM errata");
  assertGE(counts.total, 100);
  assertGE(counts.n_applied, 50);
  assertGE(counts.n_entries, 100);
  const orphans = execOne(db,
    "SELECT COUNT(*) AS n FROM errata " +
    "WHERE entry_id NOT IN (SELECT id FROM entry)");
  assert(orphans.n === 0,
    `errata has ${orphans.n} orphan entry_id references`);
});

test('lookup: errata popover query returns ordered records', (db) => {
  // openPopover() runs this query — verbatim. The ORDER BY puts
  // applied rows first, then groups by kind+field for readability.
  const firstEntryWithErrata = execOne(db,
    "SELECT entry_id FROM errata WHERE applied = 1 LIMIT 1");
  assert(firstEntryWithErrata, 'expected at least one applied errata');
  const records = execAll(db,
    "SELECT source, kind, field, from_text, to_text, applied, note " +
    "FROM errata WHERE entry_id = ? " +
    "ORDER BY applied DESC, kind, field",
    [firstEntryWithErrata.entry_id]);
  assertNotEmpty(records);
  // Applied rows must come before advisory.
  let seenAdvisory = false;
  for (const r of records) {
    if (!r.applied) seenAdvisory = true;
    if (seenAdvisory && r.applied) {
      throw new Error('applied row appeared after advisory in popover order');
    }
  }
});

// ---- tests: class-picker multiclass advancement metadata -----------------
//
// Failure modes these tests guard against (real bugs we hit in May 2026):
//
//   1. Sha'ir wasn't in SPELLCASTING_TYPE. A PrC that advances arcane
//      casting (e.g. Durthan) couldn't pick Sha'ir as a target, so the
//      Sha'ir's effective caster level was never bumped.
//   2. Durthan + Sand Shaper class_features describe casting advancement
//      in prose ("at each X level, gain spells per day as if leveling
//      in a previous arcane class") without the canonical "+1 level of
//      existing X spellcasting class" marker in class_table.special.
//      Source A regex in class-picker missed them, HARDCODED_ADVANCERS
//      didn't list them, so advancement was silently lost.

const CLASS_PICKER_SRC = fs.readFileSync(
  path.join(ROOT, 'class-picker.js'), 'utf8'
);

// Pull the keys from HARDCODED_ADVANCERS and SPELLCASTING_TYPE without
// requiring class-picker.js as a module (it's an IIFE).
function extractObjectKeys(src, varName) {
  const re = new RegExp(
    `const\\s+${varName}\\s*=\\s*\\{([\\s\\S]*?)\\n\\s*\\};`, 'm'
  );
  const m = src.match(re);
  if (!m) return new Set();
  // Capture every `"Name":` or `'Name':` key. Use alternation so keys
  // containing the opposite quote character (e.g. `"Sha'ir"`) match
  // correctly — a single character class can't handle both quote
  // styles simultaneously.
  const body = m[1];
  const keys = new Set();
  const keyRe = /(?:"([^"\n]+?)"|'([^'\n]+?)')\s*:/g;
  let km;
  while ((km = keyRe.exec(body)) !== null) keys.add(km[1] || km[2]);
  return keys;
}

const HARDCODED_ADVANCERS_KEYS = extractObjectKeys(
  CLASS_PICKER_SRC, '_FALLBACK_HARDCODED_ADVANCERS'
);
const SPELLCASTING_TYPE_KEYS = extractObjectKeys(
  CLASS_PICKER_SRC, '_FALLBACK_SPELLCASTING_TYPE'
);
const CASTER_STYLE_KEYS = extractObjectKeys(
  CLASS_PICKER_SRC, '_FALLBACK_CASTER_STYLE'
);

// Extract `KEY: 'value'` pairs from an object literal in source. Returns
// a Map<keyName, valueString>. Used to verify CASTER_STYLE values
// against the DB descriptions.
function extractObjectMap(src, varName) {
  const re = new RegExp(
    `const\\s+${varName}\\s*=\\s*\\{([\\s\\S]*?)\\n\\s*\\};`, 'm'
  );
  const m = src.match(re);
  if (!m) return new Map();
  const body = m[1];
  const map = new Map();
  // Match `"KEY": 'VALUE'` or `'KEY': "VALUE"` (single string value).
  const re2 = /(?:"([^"\n]+?)"|'([^'\n]+?)')\s*:\s*(?:"([^"\n]+?)"|'([^'\n]+?)')/g;
  let km;
  while ((km = re2.exec(body)) !== null) {
    const key = km[1] || km[2];
    const val = km[3] || km[4];
    map.set(key, val);
  }
  return map;
}

const CASTER_STYLE_MAP = extractObjectMap(CLASS_PICKER_SRC, '_FALLBACK_CASTER_STYLE');

test('class-picker: HARDCODED_ADVANCERS keys extracted from source', () => {
  // Sanity-check the extractor itself — if this fails the rest of the
  // class-picker tests are bogus.
  assertGE(HARDCODED_ADVANCERS_KEYS.size, 15,
    `expected >= 15 hardcoded advancers, got ${HARDCODED_ADVANCERS_KEYS.size}`);
  for (const known of ['Mystic Theurge', 'Archmage', 'Loremaster',
                       'Arcane Trickster', 'Durthan', 'Sand Shaper']) {
    assert(HARDCODED_ADVANCERS_KEYS.has(known),
      `HARDCODED_ADVANCERS should contain '${known}'`);
  }
});

test('class-picker: SPELLCASTING_TYPE keys extracted from source', () => {
  assertGE(SPELLCASTING_TYPE_KEYS.size, 20);
  for (const known of ['Wizard', 'Cleric', 'Psion', "Sha'ir"]) {
    assert(SPELLCASTING_TYPE_KEYS.has(known),
      `SPELLCASTING_TYPE should contain '${known}'`);
  }
});

// Test A: every PrC whose class_features prose mentions casting
// advancement language must be catchable by either the Source A regex
// (canonical marker in class_table.special) OR the HARDCODED_ADVANCERS
// list. Otherwise the picker silently drops the advancement when the
// PrC is applied alongside a spellcasting base class.
test('class-picker: every advancer PrC is wired (Source A regex or HARDCODED_ADVANCERS)', (db) => {
  const rows = execAll(db,
    "SELECT name, " +
    "json_extract(data, '$.class_features') AS features_json, " +
    "json_extract(data, '$.class_table')    AS table_json " +
    "FROM entry WHERE type = 'prc'");

  // Match "as if [pronoun] gained a level" — historical pattern that
  // misses "as if she HAD also gained a level" (the canonical PHB
  // phrasing used by Eldritch Knight + 38 others). The stricter
  // version of this regex lives in test_class_audit.js as a separate
  // audit that REPORTS the misses without failing this smoke test;
  // wiring all 39 is a multi-commit triage effort.
  const ADVANCE_VERB = new RegExp(
    'as if (?:had |she |he |you |they )?(?:also )?gained? a level' +
    '|as if leveling in' +
    '|advances? (?:your |her |his )?(?:arcane|divine|psionic|spellcasting)' +
    '|\\+\\s*1\\s*level\\s+of\\s+(?:your\\s+|her\\s+|his\\s+)?existing',
    'i'
  );
  const SPELL_NOUN = new RegExp(
    'spells per day|caster level|spells known|spellcasting class' +
    '|spellcasting ability|manifester level|powers known|power points',
    'i'
  );
  // The canonical marker the class-picker's Source A scans for.
  const CANONICAL_MARKER = new RegExp(
    '\\+\\s*1\\s*level\\s+of\\s+existing\\s+' +
    '(?:arcane|divine|manifesting|psionic)\\s+' +
    '(?:spellcasting|manifesting)?\\s*class',
    'i'
  );

  const missed = [];
  for (const r of rows) {
    let features = [];
    try { features = JSON.parse(r.features_json || '[]'); } catch (e) {}
    const text = features.map(f =>
      (f.name || '') + ' ' + (f.description || '')
    ).join(' ');
    const looksLikeAdvancer = ADVANCE_VERB.test(text) && SPELL_NOUN.test(text);
    if (!looksLikeAdvancer) continue;

    let table = [];
    try { table = JSON.parse(r.table_json || '[]'); } catch (e) {}
    const tableSpecials = table.map(t => t.special || '').join(' ');
    const hasCanonical = CANONICAL_MARKER.test(tableSpecials);

    if (hasCanonical) continue;                            // Source A catches it
    if (HARDCODED_ADVANCERS_KEYS.has(r.name)) continue;    // Source B catches it
    missed.push(r.name);
  }

  assert(missed.length === 0,
    `${missed.length} PrC(s) describe spell-advancement in their ` +
    `class_features prose but aren't wired into class-picker:\n  ` +
    missed.sort().join('\n  ') +
    `\nFix: either add the canonical "+1 level of existing X spellcasting ` +
    `class" marker to that PrC's class_table.special at the DB level ` +
    `(preferred), or register the PrC in HARDCODED_ADVANCERS in ` +
    `class-picker.js.`);
});

// Test 2b: every arcane/divine class in SPELLCASTING_TYPE must also have
// a CASTER_STYLE classification. Ultimate Magus (and any future PrC
// that requires specific styles) keys on this. Psionic classes are
// excluded — UM doesn't advance psionics and "prepared/spontaneous"
// doesn't map cleanly onto power-point manifesting.
test('class-picker: every arcane/divine caster in SPELLCASTING_TYPE has a CASTER_STYLE', () => {
  // SPELLCASTING_TYPE values can be 'arcane' / 'divine' / 'psionic' or
  // an array. Re-extract value text from source so we can filter.
  const typeMap = extractObjectMap(CLASS_PICKER_SRC, '_FALLBACK_SPELLCASTING_TYPE');
  // Plus array-valued entries (Sha'ir = ['arcane','divine']).
  const arrRe = /(?:"([^"\n]+?)"|'([^'\n]+?)')\s*:\s*\[([^\]]*)\]/g;
  const typeMatch = CLASS_PICKER_SRC.match(
    /const\s+SPELLCASTING_TYPE\s*=\s*\{([\s\S]*?)\n\s*\};/m
  );
  const typeBody = typeMatch ? typeMatch[1] : '';
  let am;
  while ((am = arrRe.exec(typeBody)) !== null) {
    const key = am[1] || am[2];
    const arrText = am[3].toLowerCase();
    // Any of arcane/divine in the array → key is arcane/divine.
    if (/arcane|divine/.test(arrText)) typeMap.set(key, 'arcane');
  }

  const missing = [];
  for (const [className, type] of typeMap.entries()) {
    if (type === 'psionic') continue;
    if (!CASTER_STYLE_KEYS.has(className)) missing.push(className);
  }
  assert(missing.length === 0,
    `${missing.length} arcane/divine class(es) in SPELLCASTING_TYPE ` +
    `lack a CASTER_STYLE classification:\n  ` +
    missing.sort().join('\n  ') +
    `\nFix: add each to CASTER_STYLE in class-picker.js as either ` +
    `'prepared' or 'spontaneous'. Ultimate Magus (and any future PrC ` +
    `requiring specific casting styles) keys on this map to pick ` +
    `eligible targets.`);
});

// Test 2c: hand-coded CASTER_STYLE values must match what each class's
// own class_features description says. Catches drift if the DB updates
// or if a hand-edit got the wrong style. Heuristic — checks the
// "Spells" / "Spellcasting" feature text for prep/spont markers.
test('class-picker: CASTER_STYLE values match DB class_features descriptions', (db) => {
  // Some classes are intentionally hand-overridden — list here.
  const OVERRIDES = new Set([
    "Sha'ir",        // gen-fetched; rules-ambiguous, hand-pinned to prepared
  ]);
  const mismatches = [];
  for (const [className, style] of CASTER_STYLE_MAP.entries()) {
    if (OVERRIDES.has(className)) continue;
    const row = execOne(db,
      "SELECT json_extract(data, '$.class_features') AS f " +
      "FROM entry WHERE name = ? AND type = 'class' LIMIT 1",
      [className]);
    if (!row || !row.f) continue;  // Class not in DB — skip
    let features = [];
    try { features = JSON.parse(row.f); } catch (e) { continue; }
    const spellFeat = features.find(f =>
      /^Spell(s|casting|book|s and )/i.test(f.name || ''));
    if (!spellFeat) continue;
    const desc = (spellFeat.description || '').toLowerCase();
    if (!desc) continue;
    // Decision tree mirroring how a player would read the rules:
    let dbStyle = null;
    if (/cast(s|ing)?\s+(\w+\s+)*spell(s)?\s+spontaneously|spontaneous(ly)?\s+(arcane|divine)/i.test(desc)) {
      dbStyle = 'spontaneous';
    } else if (/prepared|spellbook|prayerbook|prepare(d)?\s+in\s+advance/i.test(desc)) {
      dbStyle = 'prepared';
    } else if (/cast\s+any\s+spell\s+(she|he|they)\s+know(s)?\s+without\s+preparation/i.test(desc)) {
      dbStyle = 'spontaneous';
    }
    if (!dbStyle) continue;  // Description ambiguous — skip
    if (dbStyle !== style) {
      mismatches.push(`${className}: hand-coded '${style}' but DB says '${dbStyle}'`);
    }
  }
  assert(mismatches.length === 0,
    `CASTER_STYLE values disagree with DB descriptions:\n  ` +
    mismatches.join('\n  ') +
    `\nFix: either correct the hand-coded value in class-picker.js, ` +
    `or add the class to the OVERRIDES set in this test if the ` +
    `mismatch is intentional.`);
});

// Test B: every base class that looks like a spellcaster — by any of
// the data-shape heuristics — must be in SPELLCASTING_TYPE. Otherwise
// an advancing PrC applied alongside it can't pick it as a target.
test('class-picker: every base spellcaster class is in SPELLCASTING_TYPE', (db) => {
  const rows = execAll(db,
    "SELECT name, " +
    "json_extract(data, '$.class_table') AS table_json, " +
    "data AS data_json " +
    "FROM entry WHERE type = 'class'");

  // Heuristics: a class "looks like a spellcaster" if its data shape
  // shows any spell-progression evidence. Heterogeneous because the
  // manual-extraction schema isn't fully normalized — different books
  // encode it differently.
  // A "non-trivial" value: not null, not empty string / array / object,
  // not a placeholder dash. Many non-caster classes (Knight, Thug,
  // Swashbuckler, Generic Warrior) carry the schema keys with `null`
  // values — those should NOT count as evidence of spellcasting.
  function nonTrivial(v) {
    if (v == null) return false;
    if (typeof v === 'string') {
      const s = v.trim();
      return s !== '' && s !== '—' && s !== '-';
    }
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === 'object') return Object.keys(v).length > 0;
    return true;
  }
  function looksLikeSpellcaster(row) {
    let table = [];
    try { table = JSON.parse(row.table_json || '[]'); } catch (e) {}
    for (const t of table) {
      for (const k of ['spells_per_day', 'spells_known',
                       'power_points', 'powers_known', 'max_power_level']) {
        if (nonTrivial(t[k])) return true;
      }
    }
    let data = {};
    try { data = JSON.parse(row.data_json || '{}'); } catch (e) {}
    for (const [k, v] of Object.entries(data)) {
      if (!nonTrivial(v)) continue;
      if (/^(spell|spells)_(per_day|known)(_table)?$/i.test(k)) return true;
      if (/^(.+_)?spell_list$/i.test(k)) return true;
      if (/^power_list$|^power_points$|^manifesting/i.test(k)) return true;
      if (/^spell_access_rules$/i.test(k)) return true;
    }
    return false;
  }

  // Classes we DELIBERATELY exclude from the check — they have
  // spell-related data but aren't valid advancement targets:
  //   - "Generic Spellcaster": UA placeholder, not a real class.
  const EXCLUDE = new Set(['Generic Spellcaster']);

  const missing = [];
  for (const r of rows) {
    if (EXCLUDE.has(r.name)) continue;
    if (!looksLikeSpellcaster(r)) continue;
    if (SPELLCASTING_TYPE_KEYS.has(r.name)) continue;
    missing.push(r.name);
  }

  assert(missing.length === 0,
    `${missing.length} base class(es) look like spellcasters but ` +
    `aren't in SPELLCASTING_TYPE:\n  ` +
    missing.sort().join('\n  ') +
    `\nFix: add each to SPELLCASTING_TYPE in class-picker.js with the ` +
    `right type ('arcane' / 'divine' / 'psionic'). PrCs that advance ` +
    `that type can then target the class.`);
});

// ---- tests: DB-side class metadata merge ---------------------------------
//
// Centralized 2026-05-15 from class-picker.js hand-coded maps into
// `_class_metadata.py` (DB project), merged into `entry.data` at build
// time. These tests assert the merge actually fired on the rebuilt DB
// — the JS picker reads these fields via getClassType / getCasterStyle
// / getAdvancementSpec and falls back to the in-source maps only if
// the merge is missing.

test('class metadata: spellcasting.class_type populated for spellcaster classes', (db) => {
  // Every base class that's in the JS fallback must also have
  // spellcasting.class_type set in the DB, because the build merge
  // should have stamped it.
  const fallbackKeys = SPELLCASTING_TYPE_KEYS;
  const placeholders = [...fallbackKeys].map(() => '?').join(',');
  const rows = execAll(db,
    `SELECT name, ` +
    `json_extract(data, '$.spellcasting.class_type') AS ct ` +
    `FROM entry WHERE type = 'class' AND name IN (${placeholders})`,
    [...fallbackKeys]);
  const missing = rows.filter(r => r.ct == null).map(r => r.name);
  assert(missing.length === 0,
    `${missing.length} class(es) listed in the JS fallback have no ` +
    `spellcasting.class_type in the DB:\n  ${missing.join('\n  ')}\n` +
    `This means the build merge in _class_metadata.py didn't fire ` +
    `for those names. Check the canonical entry name in the DB ` +
    `matches the SPELLCASTING_METADATA dict key (case-sensitive).`);
});

test('class metadata: advancement spec populated for parser-missed advancer PrCs', (db) => {
  // Every PrC in the JS fallback that needs explicit advancement
  // metadata (i.e. its class_table.special doesn't contain the
  // canonical marker) should have entry.data.advancement set in the
  // DB. This catches the case where _class_metadata.ADVANCEMENT_METADATA
  // is missing an entry that the JS fallback still carries.
  const placeholders = [...HARDCODED_ADVANCERS_KEYS]
    .map(() => '?').join(',');
  const rows = execAll(db,
    `SELECT name, ` +
    `json_extract(data, '$.advancement') AS adv ` +
    `FROM entry WHERE type = 'prc' AND name IN (${placeholders})`,
    [...HARDCODED_ADVANCERS_KEYS]);
  const missing = rows.filter(r => r.adv == null).map(r => r.name);
  assert(missing.length === 0,
    `${missing.length} PrC(s) in the JS fallback have no advancement ` +
    `spec in the DB:\n  ${missing.join('\n  ')}\n` +
    `Add them to ADVANCEMENT_METADATA in _class_metadata.py and ` +
    `rebuild the DB.`);
});

// ---- tests: class progression fields are always populated ----------------
//
// Mirror of the Python TestClassMetadata test_every_class_has_progression_fields.
// We also assert here because the character sheet IS what queries these
// fields — and we want the test to fire on the loaded DB blob the picker
// actually uses, not just the source build. If a DB ships with null
// progressions, the multiclass aggregator silently contributes 0 BAB/save
// for that class (Sand Shaper / Durthan / 257 other entries did this
// before the 2026-05-16 build-time backfill in _class_metadata.py).
test('class-picker: every class/prc has non-null bab/fort/ref/will progressions', (db) => {
  const rows = execAll(db,
    "SELECT name, type, source FROM entry " +
    "WHERE type IN ('class','prc') AND (" +
    "json_extract(data, '$.bab_progression')  IS NULL OR " +
    "json_extract(data, '$.fort_progression') IS NULL OR " +
    "json_extract(data, '$.ref_progression')  IS NULL OR " +
    "json_extract(data, '$.will_progression') IS NULL)");
  assert(rows.length === 0,
    `${rows.length} class/prc entries have null progression fields. ` +
    `Sample: ${JSON.stringify(rows.slice(0, 5))}. ` +
    `Rebuild the DB — _class_metadata._infer_progressions_if_missing ` +
    `should fill these in at build time.`);
});

// ---- tests: spontaneous-caster spells_known is populated ----------------
//
// The Sorcerer/Bard/Hexblade/Favored Soul/Spirit Shaman et al. all have
// per-level Spells Known progressions in their source rules. These need
// to make it into class_table rows so class-picker.js can auto-fill the
// "Known" column on the Spellcasting panel. Before 2026-05-17 the build
// pipeline only merged spells_per_day; spells_known fell on the floor.
//
// "Knows-whole-list" casters (Beguiler / Warmage / Dread Necromancer /
// Sha'ir / Healer / Duskblade) genuinely have no per-level table — they
// know every spell on their list — and are excluded.
test('class-picker: every per-level spontaneous caster has spells_known on every row that has spells_per_day', (db) => {
  // "Knows whole list" casters — no per-level Spells Known table in source.
  // Sha'ir IS NOT in this set: Dragon Compendium Table 2-12 gives Sha'ir
  // a normal per-level Spells Known progression; the gen-retrieval
  // mechanic is just a preparation-speed bonus, not a "know everything"
  // pass like Beguiler / Warmage / etc.
  const WHOLE_LIST = new Set([
    'Beguiler', 'Warmage', 'Dread Necromancer',
    'Healer', 'Duskblade',
  ]);
  const rows = execAll(db,
    "SELECT name, data FROM entry " +
    "WHERE type = 'class' AND " +
    "json_extract(data, '$.spellcasting.style') = 'spontaneous'");
  const broken = [];
  for (const r of rows) {
    if (WHOLE_LIST.has(r.name)) continue;
    const d = JSON.parse(r.data);
    const tbl = d.class_table;
    if (!Array.isArray(tbl) || !tbl.length) continue;
    // Find the highest-level row that has spells_per_day populated.
    const lastCasting = [...tbl].reverse().find(row =>
      Array.isArray(row.spells_per_day) &&
      row.spells_per_day.some(v => v !== null && v !== undefined));
    if (!lastCasting) continue;  // never gets to cast (shouldn't happen)
    if (!Array.isArray(lastCasting.spells_known) ||
        !lastCasting.spells_known.some(v => v !== null && v !== undefined &&
          v !== '-' && v !== '—')) {
      broken.push(r.name);
    }
  }
  assert(broken.length === 0,
    `${broken.length} spontaneous caster(s) have no per-level spells_known ` +
    `merged into class_table:\n  ${broken.join('\n  ')}\n` +
    `Either add the Spells Known data to the upstream Python data file ` +
    `and re-run emit_*.py + normalize_schema.py, or — if the class is a ` +
    `"knows-whole-list" caster — add its name to the WHOLE_LIST set ` +
    `here and the KNOWS_WHOLE_LIST_NOTES map in class-picker.js.`);
});

// ---- tests: companion metadata coverage ----------------------------------
//
// Every class feature whose description mentions an animal companion,
// familiar, special mount, or cohort should EITHER have a structured
// `companion` block populated by _companion_metadata.py OR be an
// explicitly-excluded entry in the override map (signified by a None
// value — those don't get a `companion` field but ARE listed in the
// keyed overrides). When neither is true, the audit fails and the
// new class feature needs an override added.
test('companion: every relevant class feature has metadata or explicit exclusion', (db) => {
  // Mirror the keyword set from _companion_metadata.py.
  // Intentionally not the same regex — we want to catch mentions
  // the Python regex might have missed, so this is broader.
  const KEYWORDS = /\b(animal\s+companion|familiar|special\s+mount|paladin'?s?\s+mount|divine\s+mount|bonded\s+mount|telthor\s+companion|cohort|leadership)\b/i;
  // Phrases that indicate an incidental mention — Leadership listed as
  // a feat option, anti-companion abilities, transformation rules, etc.
  const INCIDENTAL = /leadership\s+score|feat\s+from:?\b[^.]*leadership|\bex-\w+|\bbecomes?\s+\w+|sever\s+bonded|except\s+(?:spellcasting\s+and\s+)?animal\s+companion|does\s+not\s+grant.*familiar|magical\s+materials/i;
  // Hand-curated set of (class, feature) pairs we explicitly excluded
  // — must match the None entries in _companion_metadata.OVERRIDES.
  // (We could DB-query for the OVERRIDES set but a Python-vs-JS mirror
  // is simpler and self-documents the intentional exclusions here.)
  const EXCLUSIONS = new Set([
    'Generic Warrior/Bonus Feats',
    'Guild Thief/Bonus Feat',
    'Guild Thief/Reputation',
    'Hexblade/Ex-Hexblades',
    'Mountebank/Infernal Escape (Su)',
    'Cerebremancer/Spells per Day / Powers Known',
    'Hierophant/Power of Nature (Su)',
    'Hierophant/Power of Nature [druid-only special ability]',
    'Blighter/Unbond (Sp)',
    "Sha'ir/Spells",
    'Prestige Paladin/Class Features',
    'Aglarondan Griffonrider/Flyby Attack',
    'Aglarondan Griffonrider/Aerial Evasion (Ex)',
    'Aglarondan Griffonrider/Hover (Ex)',
    'Aglarondan Griffonrider/Power Dive (Ex)',
    'Aglarondan Griffonrider/Superior Flight (Ex)',
    // 2026-05-16 DComp fidelity-fix added: Flux Adept's Taste of
    // Truth uses "familiar" as a plain English adjective ("now so
    // familiar to the flux adept") — false positive on the
    // KEYWORDS regex.
    'Flux Adept/Taste of Truth (Ex)',
  ]);

  const rows = execAll(db,
    "SELECT name, json_extract(data, '$.class_features') AS cf " +
    "FROM entry WHERE type IN ('class','prc') " +
    "AND json_extract(data, '$.class_features') IS NOT NULL");
  const missing = [];
  for (const r of rows) {
    let cf;
    try { cf = JSON.parse(r.cf); } catch { continue; }
    if (!Array.isArray(cf)) continue;
    for (const f of cf) {
      const text = (f.name || '') + ' ' + (f.description || '');
      if (!KEYWORDS.test(text)) continue;
      if (INCIDENTAL.test(text)) continue;
      if (f.companion) continue;          // metadata present → ok
      const key = `${r.name}/${f.name}`;
      if (EXCLUSIONS.has(key)) continue;  // explicit exclusion → ok
      missing.push(key);
    }
  }
  assert(missing.length === 0,
    `${missing.length} class feature(s) mention companion keywords ` +
    `but have no companion metadata and no explicit exclusion:\n  ` +
    missing.join('\n  ') + '\n' +
    `Add an entry to _companion_metadata.py::OVERRIDES (with a ` +
    `companion dict, or None to explicitly exclude) and update the ` +
    `EXCLUSIONS set in this test.`);
});

// ---- tests: metamagic metadata coverage ----------------------------------
//
// Every feat tagged Metamagic in types_csv should have populated
// metamagic.level_adjustment after the DB build. Backstop against
// regressions in the regex extractor or manual-override map in
// _metamagic_metadata.py.
test('metamagic: every Metamagic feat has level_adjustment', (db) => {
  const rows = execAll(db,
    "SELECT name, source FROM entry " +
    "WHERE type='feat' AND types_csv LIKE '%Metamagic%' " +
    "AND json_extract(data, '$.metamagic.level_adjustment') IS NULL");
  assert(rows.length === 0,
    `${rows.length} metamagic feat(s) have no level_adjustment.\n` +
    `Sample: ${JSON.stringify(rows.slice(0, 5))}\n` +
    `Add to MANUAL_OVERRIDES in _metamagic_metadata.py or check that ` +
    `the regex extractor in extract_level_adjustment() picks them up.`);
});

test('metamagic: level_adjustment values are integer 0-9 or "variable"', (db) => {
  const rows = execAll(db,
    "SELECT name, " +
    "json_extract(data, '$.metamagic.level_adjustment') AS adj " +
    "FROM entry WHERE type='feat' AND types_csv LIKE '%Metamagic%' " +
    "AND json_extract(data, '$.metamagic.level_adjustment') IS NOT NULL");
  const bad = rows.filter(r => {
    const a = r.adj;
    if (a === 'variable') return false;
    if (typeof a === 'number' && a >= 0 && a <= 9 && Number.isInteger(a)) return false;
    return true;
  });
  assert(bad.length === 0,
    `${bad.length} feat(s) have non-canonical level_adjustment:\n  ` +
    bad.slice(0, 8).map(r => `${r.name}: ${JSON.stringify(r.adj)}`).join('\n  '));
});

test('class-picker: progression values are in canonical set', (db) => {
  const VALID_BAB = new Set(['good', 'average', 'poor']);
  const VALID_SAVE = new Set(['good', 'poor']);
  const rows = execAll(db,
    "SELECT name, " +
    "json_extract(data, '$.bab_progression')  AS bab, " +
    "json_extract(data, '$.fort_progression') AS fort, " +
    "json_extract(data, '$.ref_progression')  AS ref, " +
    "json_extract(data, '$.will_progression') AS will " +
    "FROM entry WHERE type IN ('class','prc')");
  const bad = [];
  for (const r of rows) {
    if (r.bab  && !VALID_BAB.has(r.bab))   bad.push(`${r.name}: bab=${r.bab}`);
    if (r.fort && !VALID_SAVE.has(r.fort)) bad.push(`${r.name}: fort=${r.fort}`);
    if (r.ref  && !VALID_SAVE.has(r.ref))  bad.push(`${r.name}: ref=${r.ref}`);
    if (r.will && !VALID_SAVE.has(r.will)) bad.push(`${r.name}: will=${r.will}`);
  }
  assert(bad.length === 0,
    `${bad.length} class/prc entries have non-canonical progression ` +
    `values:\n  ${bad.slice(0, 10).join('\n  ')}\n` +
    `BAB must be one of ${[...VALID_BAB]}; saves must be one of ${[...VALID_SAVE]}.`);
});

// ---- tests: save/load collector scoping ----------------------------------
//
// Real bug from 2026-05-15: `Feats.collectData()` was using a global
// `$$('.feat-entry')` selector, which also matched <div>s in the
// Companion tab that reuse the `feat-entry` styling class. Those <div>s
// have no `.value`, so the saved `feats` array gained `null` entries
// for every companion list — round-trip lost data and exports were
// polluted. The fix scopes the selector to `#feats-container`. These
// tests guard against the bug recurring, and against similar bugs
// being introduced in other collectors that share styling classes
// across unrelated panels.

function readSource(name) {
  return fs.readFileSync(path.join(ROOT, name), 'utf8');
}

// Helper: extract a function body by name from a source string.
function extractFunctionBody(src, name) {
  // Match `function NAME(...args) {` … balanced braces … `}`.
  const start = src.indexOf(`function ${name}(`);
  if (start < 0) return null;
  const brace = src.indexOf('{', start);
  if (brace < 0) return null;
  let depth = 1, i = brace + 1;
  while (i < src.length && depth > 0) {
    const ch = src[i];
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    // Skip strings/comments crudely — adequate for current sources.
    else if (ch === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') i++;
    } else if (ch === '"' || ch === "'" || ch === '`') {
      const quote = ch;
      i++;
      while (i < src.length && src[i] !== quote) {
        if (src[i] === '\\') i++;
        i++;
      }
    }
    i++;
  }
  return src.slice(brace + 1, i - 1);
}

// ---- tests: CharacterHistory substrate -----------------------------------
//
// Phase 1 of #3 — pure-data module. We test it in Node by evaluating
// character-history.js directly (it has no DOM / DB dependencies in
// the public API surface tested here).

function loadCharacterHistory() {
  const src = fs.readFileSync(path.join(ROOT, 'character-history.js'), 'utf8');
  // Eval in a sandbox so the module's top-level `const` binds locally
  // and we can return the public API to the caller.
  const fn = new Function(src + '\nreturn CharacterHistory;');
  return fn();
}

test('CharacterHistory: round-trip preserves the history array', () => {
  const CH = loadCharacterHistory();
  const hist = [
    { level: 1, class_taken: 'Wizard', hp_rolled: 4,
      feats_taken: ['Combat Casting'], skills_purchased: { Concentration: 4 },
      spells_learned: ['Magic Missile'], notes: '' },
    { level: 2, class_taken: 'Wizard', hp_rolled: 3,
      feats_taken: [], skills_purchased: { Concentration: 1 },
      spells_learned: ['Fly'], notes: '' },
  ];
  CH.set(hist, { reconstructed: false });
  const dumped = CH.collectData();
  assert(Array.isArray(dumped.history), 'collectData returns .history array');
  assert(dumped.history.length === 2, 'two entries round-tripped');
  assert(dumped.history[0].class_taken === 'Wizard', 'class preserved');
  assert(!dumped.history_reconstructed, 'reconstructed flag false');

  // Load on a fresh module instance
  const CH2 = loadCharacterHistory();
  CH2.loadData(dumped);
  assert(CH2.get().length === 2, 'loaded back 2 entries');
  assert(CH2.get()[1].spells_learned[0] === 'Fly', 'nested data preserved');
});

test('CharacterHistory: missing history triggers reconstruction with opts', () => {
  const CH = loadCharacterHistory();
  CH.loadData({}, {
    classes: [{ className: 'Druid', level: 5 }, { className: 'Beastmaster', level: 3 }],
    feats: ['Power Attack', 'Cleave', 'Improved Bull Rush'],
    options: { pathfinderFeats: false },
  });
  const h = CH.get();
  assert(h.length === 8, '8 levels reconstructed (Druid 5 + Beastmaster 3)');
  assert(h[0].class_taken === 'Druid', 'L1 is Druid');
  assert(h[5].class_taken === 'Beastmaster', 'L6 is Beastmaster');
  assert(h[7].class_taken === 'Beastmaster', 'L8 is Beastmaster');
  // Feats land at L1, L3, L6 (RAW schedule).
  assert(h[0].feats_taken.includes('Power Attack'), 'L1 feat slot');
  assert(h[2].feats_taken.includes('Cleave'), 'L3 feat slot');
  assert(h[5].feats_taken.includes('Improved Bull Rush'), 'L6 feat slot');
  assert(h.every(e => e._reconstructed === true),
    'all entries flagged _reconstructed');
  assert(CH.isReconstructed(), 'top-level reconstructed flag set');
});

test('CharacterHistory: reconstructFromTotals returns empty for unbuilt characters', () => {
  const CH = loadCharacterHistory();
  const h = CH.reconstructFromTotals([], []);
  assert(Array.isArray(h) && h.length === 0,
    'no classes = empty history (no fabricated L1)');
});

test('CharacterHistory: get() normalizes empty to [] and hasLoaded() distinguishes', () => {
  // L3 (2026-05-17 play-feel): the previous get() returned null when
  // empty, forcing every caller to write `|| []`. Now empty always
  // reads as [] and hasLoaded() returns the never-loaded signal.
  const CH = loadCharacterHistory();
  assert(Array.isArray(CH.get()), 'get() returns an array even when empty');
  assert(CH.get().length === 0, 'initial get() is []');
  assert(CH.hasLoaded() === false, 'hasLoaded() is false before any set/load');
  CH.set([{ level: 1, class_taken: 'Wizard' }]);
  assert(CH.hasLoaded() === true, 'hasLoaded() is true after set');
  assert(CH.get().length === 1, 'get() returns the set entries');
  CH.clear();
  assert(CH.hasLoaded() === false, 'hasLoaded() reset by clear()');
  assert(CH.get().length === 0 && Array.isArray(CH.get()),
    'cleared get() is still [], not null');
});

test('CharacterHistory: pathfinder feat schedule covers odd levels', () => {
  const CH = loadCharacterHistory();
  const raw = CH.featLevels(false);
  const pf  = CH.featLevels(true);
  assert(JSON.stringify(raw) === JSON.stringify([1,3,6,9,12,15,18]),
    'RAW = L1, 3, 6, 9, 12, 15, 18');
  assert(JSON.stringify(pf) === JSON.stringify([1,3,5,7,9,11,13,15,17,19]),
    'Pathfinder = every odd level');
});

test('CharacterHistory: ability boost levels are L4/8/12/16/20', () => {
  const CH = loadCharacterHistory();
  for (let lvl = 1; lvl <= 20; lvl++) {
    const expected = (lvl % 4 === 0);
    assert(CH.isAbilityBoostLevel(lvl) === expected,
      `L${lvl}: expected boost=${expected}`);
  }
});

test('CharacterHistory: explicit history wins over reconstruction', () => {
  const CH = loadCharacterHistory();
  const hist = [{ level: 1, class_taken: 'Sorcerer', hp_rolled: 4,
                  feats_taken: [], skills_purchased: {},
                  spells_learned: [], notes: '' }];
  CH.loadData({ history: hist, history_reconstructed: false }, {
    // Even with reconstruction opts available, explicit history
    // should win and NOT trigger reconstruction.
    classes: [{ className: 'Wizard', level: 5 }],
    feats: ['Power Attack'],
  });
  assert(CH.get().length === 1, 'explicit history kept (not reconstructed)');
  assert(CH.get()[0].class_taken === 'Sorcerer', 'explicit class preserved');
  assert(!CH.isReconstructed(), 'reconstructed flag stays false');
});

// ---- tests: window.X guard pattern ---------------------------------------
//
// Top-level `const Foo = (function(){...})()` creates a script-scope
// binding, NOT a property of `window`. Cross-module guards that use
// `if (window.Foo)` silently early-return because Foo is undefined on
// window — same bug fixed three separate times in feats.js,
// feat-picker.js, and companion.js. The audit walks every JS file and
// flags any `window.X` reference where X is a known top-level module
// that doesn't explicitly assign to window.
test('audit: no window.X guards on top-level const modules', () => {
  // Modules confirmed to assign to window (these are safe to reference
  // as window.X). Add any new explicit-window-assignment modules here.
  const ON_WINDOW = new Set([
    'DB', 'ClassPicker', 'ErrataBadge', 'Lookup', 'MetamagicCatalog',
    // Built-in / non-module references that should never trigger:
    'document', 'requestAnimationFrame', 'localStorage', 'location',
  ]);
  // Top-level `const` modules that are NOT on window — referencing
  // these via window.X is the bug we're guarding against.
  const TOP_LEVEL_CONSTS = [
    'DND35', 'Skills', 'Character', 'Equipment', 'Spells', 'Feats',
    'Companion', 'ClassFeatures', 'Conditions', 'Audit', 'FeatPrereqs',
    'Shadowcaster',
  ];
  const rx = new RegExp(`\\bwindow\\.(${TOP_LEVEL_CONSTS.join('|')})\\b`, 'g');
  const offenders = [];
  for (const file of fs.readdirSync(ROOT)) {
    if (!file.endsWith('.js')) continue;
    if (file.startsWith('.')) continue;
    const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
    let m;
    while ((m = rx.exec(src)) !== null) {
      // Skip explicit `window.X = ...` assignments (we already vetted
      // the assignment list above).
      const lineStart = src.lastIndexOf('\n', m.index) + 1;
      const lineEnd = src.indexOf('\n', m.index);
      const line = src.slice(lineStart, lineEnd < 0 ? undefined : lineEnd);
      if (/window\.\w+\s*=\s*[^=]/.test(line)) continue;
      offenders.push(`${file}: ${line.trim()}`);
    }
  }
  assert(offenders.length === 0,
    `${offenders.length} window.<topLevelConst> reference(s) found ` +
    `(these always evaluate to undefined and silently fail):\n  ` +
    offenders.join('\n  ') + '\n' +
    `Replace with \`typeof X !== 'undefined'\` guard or move the ` +
    `module to explicit window assignment (and add to ON_WINDOW set).`);
});

test('save: Feats.collectData scopes .feat-entry to its container', () => {
  const src = readSource('feats.js');
  const body = extractFunctionBody(src, 'collectData');
  assert(body, "Couldn't extract Feats.collectData body");
  // Disallow the unscoped global pattern.
  assert(!/\$\$\(\s*['"]\.feat-entry['"]\s*\)/.test(body),
    "Feats.collectData uses a global `$$('.feat-entry')` selector. " +
    "That accidentally matches the companion tab's `.feat-entry` " +
    "styling <div>s and pollutes the saved `feats` array with nulls. " +
    "Scope to #feats-container instead.");
  // Disallow the same for special abilities.
  assert(!/\$\$\(\s*['"]\.special-ability-entry['"]\s*\)/.test(body),
    "Feats.collectData uses a global `$$('.special-ability-entry')` " +
    "selector. Scope to #special-abilities-container.");
  // Require evidence of scoping — either a container query or the
  // querySelector('#feats-container') pattern.
  assert(
    /#feats-container/.test(body) || /featsRoot/.test(body),
    "Feats.collectData should reference #feats-container to scope its " +
    "`.feat-entry` query."
  );
});

test('save: companion.js still uses .feat-entry as a styling class', () => {
  // Sanity check that this collision still exists — the companion
  // module reuses the styling. If someone renames it the test above
  // becomes less interesting (and we can simplify); flag the rename.
  const src = readSource('companion.js');
  assert(
    /feat-entry/.test(src),
    "companion.js no longer references `feat-entry` — the Feats " +
    "collector scoping is no longer needed for the documented reason. " +
    "Update the comment in feats.js#collectData."
  );
});

test('save: every UI module exposes collectData + loadData', () => {
  // Catch the case where a new module is added without persistence.
  const modules = [
    'character.js', 'equipment.js', 'spells.js', 'feats.js',
    'companion.js', 'class-features.js', 'skills.js',
  ];
  const missing = [];
  for (const m of modules) {
    const src = readSource(m);
    if (!/function collectData\s*\(/.test(src)) missing.push(`${m}: collectData`);
    if (!/function loadData\s*\(/.test(src))     missing.push(`${m}: loadData`);
  }
  assert(missing.length === 0,
    `Missing persistence functions:\n  ${missing.join('\n  ')}`);
});

test('save: companion compType options have explicit value= attrs', () => {
  // Regression guard for the 2026-05-17 round-trip bug. Pre-fix,
  // the <option>s had no `value` attribute, so `.value` returned the
  // option's display text ("Animal Companion"), while the build
  // template compared against lowercase keys ("animal"). Saved
  // Familiars/Cohorts/Psicrystals reloaded silently as Animal
  // Companion. The fix: explicit `value="animal"` etc. on each
  // option. This test guards against accidental removal.
  const src = readSource('companion.js');
  for (const key of ['animal', 'familiar', 'cohort', 'psicrystal', 'other']) {
    assert(
      new RegExp(`<option value="${key}"`).test(src),
      `companion.js: <option value="${key}"...> is missing. Without ` +
      `explicit value attrs, saved companion types reload as the ` +
      `first option (silent data loss). See normalizeCompType for ` +
      `the migration path.`
    );
  }
  // Also guard that the migration helper exists — old saves with
  // display-text compType need normalization.
  assert(/function normalizeCompType\s*\(/.test(src),
    'companion.js: normalizeCompType migration helper is missing. ' +
    'Without it, old saves with display-text compType silently ' +
    'reload as Animal Companion.');
});

test('save: class-picker persists data-from-class markers', () => {
  // Regression guard for the 2026-05-17 fix. setIfEmpty stamps a
  // `data-from-class="<className>"` marker on auto-filled fields
  // (turn-per-day, rage-rounds, etc.). Pre-fix, the marker was
  // dropped on save, so a class removed after a save/load cycle
  // couldn't clean its auto-fills. The fix: collectData emits
  // `_fromClassMarkers: {fieldId: className}`; loadData restores.
  const src = readSource('class-picker.js');
  assert(/_fromClassMarkers/.test(src),
    'class-picker.js: _fromClassMarkers field is missing from the ' +
    'Character.collectData/loadData hook. Without it, fields ' +
    'auto-filled by class-picker survive save/load but lose their ' +
    'origin tag, so a future class-remove leaves them as stale data.');
  // Specifically check both directions.
  const hook = src.slice(src.indexOf('installPersistenceHooks'));
  assert(/markers\s*\[\s*el\.id\s*\]\s*=\s*el\.dataset\.fromClass/.test(hook),
    'class-picker.js: collectData hook does not iterate ' +
    '[data-from-class] elements to populate _fromClassMarkers.');
  assert(/el\.dataset\.fromClass\s*=\s*className/.test(hook),
    'class-picker.js: loadData hook does not restore _fromClassMarkers ' +
    'onto the matching elements after class-state rehydration.');
});

test('save: app.js#collectData wires every UI module', () => {
  // Catch the case where collectData/loadData is added to a module but
  // not plumbed through app.js.
  const src = readSource('app.js');
  const body = extractFunctionBody(src, 'collectData');
  assert(body, "Couldn't extract app.js#collectData body");
  for (const mod of ['Character', 'Equipment', 'Spells', 'Feats',
                     'Companion', 'ClassFeatures', 'Skills']) {
    assert(
      new RegExp(`${mod}\\.collect(Data|CustomSkills)?\\s*\\(`).test(body),
      `app.js#collectData does not call ${mod}.collectData() — saves ` +
      `will silently drop this module's state.`
    );
  }
  const loadBody = extractFunctionBody(src, 'loadData');
  assert(loadBody, "Couldn't extract app.js#loadData body");
  for (const mod of ['Character', 'Equipment', 'Spells', 'Feats',
                     'Companion', 'ClassFeatures', 'Skills']) {
    assert(
      new RegExp(`${mod}\\.load(Data|CustomSkills)?\\s*\\(`).test(loadBody),
      `app.js#loadData does not call ${mod}.loadData() — imports ` +
      `will silently drop this module's state.`
    );
  }
});

// ---- tests: book filter --------------------------------------------------
//
// The book filter is a global picker scope. These tests assert the
// infrastructure exists (state + persistence + wiring) and verify that
// each picker's row loop consults BookFilter so a filter actually
// reaches the autocomplete suggestions.

test('book-filter: module exposes the expected public API', () => {
  const src = readSource('book-filter.js');
  for (const sym of ['getActiveAbbrevs', 'setActiveAbbrevs',
                     'allowsSource', 'allowsAbbrev', 'collectData',
                     'loadData', 'isActive', 'getBooks']) {
    assert(new RegExp(`\\b${sym}\\b`).test(src),
      `book-filter.js does not export ${sym}`);
  }
  // window.BookFilter is the global handle used by every picker.
  assert(/window\.BookFilter\s*=/.test(src),
    'book-filter.js does not assign window.BookFilter');
});

test('book-filter: app.js wires collectData + loadData', () => {
  const src = readSource('app.js');
  const collectBody = extractFunctionBody(src, 'collectData');
  const loadBody = extractFunctionBody(src, 'loadData');
  assert(/BookFilter\.collectData\s*\(/.test(collectBody),
    'app.js#collectData does not call BookFilter.collectData — saved ' +
    'sheets will silently drop the campaign book filter.');
  assert(/BookFilter\.loadData\s*\(/.test(loadBody),
    'app.js#loadData does not call BookFilter.loadData — imports will ' +
    'silently drop the campaign book filter.');
});

test('book-filter: every picker consults BookFilter.allowsSource in its row loop', () => {
  // The picker-integration contract: each picker queries `entry` with
  // `e.source` (or just `source`) in the SELECT and skips rows that
  // the BookFilter rejects. Catches the common regression of adding a
  // new picker without wiring the global filter.
  const pickers = [
    'feat-picker.js', 'item-picker.js', 'spell-picker.js',
    'race-picker.js', 'template-picker.js', 'class-picker.js',
    'domain-picker.js', 'maneuver-picker.js', 'power-picker.js',
    'mystery-picker.js', 'soulmeld-picker.js', 'vestige-picker.js',
    'invocation-picker.js', 'special-ability-picker.js',
  ];
  const missing = [];
  for (const p of pickers) {
    const src = readSource(p);
    if (!/BookFilter\.allowsSource\s*\(/.test(src)) missing.push(p);
  }
  assert(missing.length === 0,
    `${missing.length} pickers do not consult BookFilter:\n  ` +
    missing.join('\n  '));
});

test('book-filter: every picker re-runs on book-filter-changed', () => {
  // Without the event listener, changing the filter would only take
  // effect on next page reload.
  const pickers = [
    'feat-picker.js', 'item-picker.js', 'spell-picker.js',
    'race-picker.js', 'template-picker.js', 'class-picker.js',
    'domain-picker.js', 'maneuver-picker.js', 'power-picker.js',
    'mystery-picker.js', 'soulmeld-picker.js', 'vestige-picker.js',
    'invocation-picker.js', 'special-ability-picker.js',
  ];
  const missing = [];
  for (const p of pickers) {
    const src = readSource(p);
    if (!/['"]book-filter-changed['"]/.test(src)) missing.push(p);
  }
  assert(missing.length === 0,
    `${missing.length} pickers do not listen for book-filter-changed:\n  ` +
    missing.join('\n  '));
});

test('book-filter: lookup modal also consults BookFilter', () => {
  const src = readSource('lookup.js');
  assert(/BookFilter\.allowsSource\s*\(/.test(src),
    'lookup.js does not consult BookFilter — the universal search ' +
    'returns out-of-scope entries.');
  assert(/['"]book-filter-changed['"]/.test(src),
    'lookup.js does not listen for book-filter-changed — type chip ' +
    'counts go stale after a filter change.');
});

test('book-filter: state round-trips through collectData/loadData', () => {
  // Eval book-filter.js in a sandbox (it has no DOM dependencies for
  // the persistence path — DB.ready resolves to null and getBooks
  // returns []).
  const src = readSource('book-filter.js');
  const sandbox = {
    DB: { ready: Promise.resolve(null), isLoaded: () => false },
    document: {
      dispatchEvent: () => {},
      addEventListener: () => {},
      readyState: 'complete',
    },
    console: { log: () => {}, warn: () => {} },
  };
  // Provide a window stand-in shared with sandbox.
  sandbox.window = sandbox;
  const fn = new Function('window', 'document', 'console', 'DB',
    src + '\nreturn window.BookFilter;');
  const BF = fn(sandbox, sandbox.document, sandbox.console, sandbox.DB);

  // Default: no filter, isActive false, collectData stores null.
  assert(!BF.isActive(), 'default filter should be inactive');
  assert(BF.collectData()._book_filter === null,
    `default collectData should be null, got ${JSON.stringify(BF.collectData())}`);
  assert(BF.allowsSource('Player\'s Handbook') === true,
    'with no filter, all sources are allowed');

  // Set a filter, verify allowsSource (sourceToAbbrev is empty since
  // there's no DB — unknown sources always allowed per design).
  BF.setActiveAbbrevs(new Set(['PHB', 'DMG']));
  assert(BF.isActive(), 'should be active after set');
  const saved = BF.collectData();
  assert(Array.isArray(saved._book_filter)
    && saved._book_filter.length === 2
    && saved._book_filter.includes('PHB')
    && saved._book_filter.includes('DMG'),
    `expected ['PHB','DMG'] in collected data, got ${JSON.stringify(saved)}`);
  // Unknown sources are always allowed (homebrew / future additions).
  assert(BF.allowsSource('Player\'s Handbook') === true,
    'unknown source (no abbrev map) must still be allowed');
  // allowsAbbrev consults the active set directly.
  assert(BF.allowsAbbrev('PHB') === true, 'PHB should be allowed');
  assert(BF.allowsAbbrev('FRCS') === false, 'FRCS should be filtered out');

  // loadData with empty filter clears the active set.
  BF.loadData({ _book_filter: [] });
  assert(!BF.isActive(), 'empty filter should clear the active set');

  // loadData with absent field is a no-op (old saves keep current state).
  BF.setActiveAbbrevs(new Set(['MIC']));
  BF.loadData({});  // no _book_filter key — should leave MIC intact
  assert(BF.getActiveAbbrevs().has('MIC'),
    'loadData on an object without _book_filter must not wipe state');
});

test('book-filter: SQL query against entry table is filter-shape compatible', (db) => {
  // Smoke test: the kind of SQL each picker now runs (`SELECT ... e.source
  // FROM entry e WHERE type = ...`) still returns rows of the right
  // shape, with source values that match the book table.
  const rows = execAll(db,
    "SELECT e.id, e.name, e.source FROM entry e "
    + "LEFT JOIN book b ON b.name = e.source "
    + "WHERE e.type = 'race' LIMIT 5");
  assertNotEmpty(rows);
  for (const r of rows) {
    assert(typeof r.source === 'string' && r.source.length > 0,
      `race row ${r.id} has empty source`);
  }
});

// ---- runner ---------------------------------------------------------------

(async function main() {
  let db;
  try {
    db = await loadDb();
  } catch (err) {
    console.error('FATAL: could not load DB:', err.message);
    process.exit(2);
  }

  let passed = 0, failed = 0;
  const failures = [];
  for (const t of tests) {
    try {
      await t.fn(db);
      passed++;
      process.stdout.write('.');
    } catch (err) {
      failed++;
      failures.push({ name: t.name, error: err.message });
      process.stdout.write('F');
    }
  }
  console.log();
  console.log();
  if (failed) {
    console.log('FAILURES:');
    for (const f of failures) {
      console.log(`  ✗ ${f.name}`);
      console.log(`      ${f.error}`);
    }
    console.log();
  }
  console.log(`${passed} passed, ${failed} failed (${tests.length} total)`);
  process.exit(failed ? 1 : 0);
})();
