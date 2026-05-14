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
  const r = execOne(db, "SELECT COUNT(*) AS n FROM entry "
    + "WHERE type IN ('feat','acf','skill_trick')");
  assertGE(r.n, 1000);
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
    + "WHERE type IN ('feat', 'acf', 'skill_trick') "
    + "ORDER BY CASE version WHEN '3.5' THEN 0 ELSE 1 END, "
    + "name COLLATE NOCASE");
  assertGE(rows.length, 1000);
  assert(rows[0].name && rows[0].feat_id != null);
});

test('feat-picker: detail query (onSelect)', (db) => {
  const list = execAll(db,
    "SELECT id AS feat_id FROM entry "
    + "WHERE type IN ('feat','acf','skill_trick') LIMIT 1");
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
    + "WHERE e.type IN ('feat','acf','skill_trick') "
    + "AND t.tag = 'combat-maneuver'");
  assertGE(rows[0].n, 60);
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
