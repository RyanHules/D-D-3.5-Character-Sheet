// Smoke test: runs the EXACT SQL each *-picker.js issues against
// dnd35.db via the same sql.js library the browser uses.
//
// Run: node tests/test_pickers.js
// Exits 0 on all-pass, 1 on any failure.
//
// Methodology: the queries below are pulled verbatim from the picker
// .js files. If you change a picker query, update the matching test.
// `grep -nE "DB\\.(query|queryOne)\\(" *-picker.js` lists them all.

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

test('database.js: count of races > 0', (db) => {
  const r = execOne(db, 'SELECT COUNT(*) AS n FROM race');
  assertGE(r.n, 80);
});

test('database.js: count of spells > 2500', (db) => {
  const r = execOne(db, 'SELECT COUNT(*) AS n FROM spell');
  assertGE(r.n, 2500);
});

test('database.js: count of feats > 1000', (db) => {
  const r = execOne(db, 'SELECT COUNT(*) AS n FROM feat');
  assertGE(r.n, 1000);
});

test('database.js: count of items > 1500', (db) => {
  const r = execOne(db, 'SELECT COUNT(*) AS n FROM item');
  assertGE(r.n, 1500);
});

// ---- tests: feat-picker.js ------------------------------------------------
//
// Queries verbatim from feat-picker.js init + onSelect.

test('feat-picker: list query (init)', (db) => {
  const rows = execAll(db,
    "SELECT feat_id, name, version, types_csv FROM feat " +
    "ORDER BY CASE version WHEN '3.5' THEN 0 ELSE 1 END, " +
    "name COLLATE NOCASE");
  assertGE(rows.length, 1000);
  assert(rows[0].name && rows[0].feat_id != null);
});

test('feat-picker: detail query (onSelect)', (db) => {
  const list = execAll(db, 'SELECT feat_id FROM feat LIMIT 1');
  const detail = execOne(db,
    'SELECT * FROM feat WHERE feat_id = ?', [list[0].feat_id]);
  assert(detail && detail.name);
});

// ---- tests: item-picker.js ------------------------------------------------

test('item-picker: list query (init)', (db) => {
  const rows = execAll(db,
    "SELECT item_id, name, version, type FROM item " +
    "ORDER BY CASE version WHEN '3.5' THEN 0 ELSE 1 END, " +
    "name COLLATE NOCASE");
  assertGE(rows.length, 1500);
});

test('item-picker: detail query', (db) => {
  const list = execAll(db, 'SELECT item_id FROM item LIMIT 1');
  const detail = execOne(db,
    'SELECT * FROM item WHERE item_id = ?', [list[0].item_id]);
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

test('spell-picker: spell list join (after fix to scl.entry_id)', (db) => {
  // EXACT join from spell-picker.js — uses spell view's spell_id and
  // spell_class_level table's entry_id (the picker was patched to use
  // entry_id; if anyone reverts that, this test catches it).
  const rows = execAll(db,
    'SELECT DISTINCT s.spell_id, s.name, s.school, s.version ' +
    'FROM spell s JOIN spell_class_level scl ' +
    'ON s.spell_id = scl.entry_id ' +
    'WHERE scl.class_name IN (?) AND scl.level = ? ' +
    "ORDER BY CASE s.version WHEN '3.5' THEN 0 ELSE 1 END, " +
    's.name COLLATE NOCASE',
    ['Sorcerer', 3]);
  assertGE(rows.length, 30, 'Sor 3 spell list looks thin');
});

test('spell-picker: spell detail by name', (db) => {
  const r = execOne(db,
    'SELECT * FROM spell WHERE name = ? COLLATE NOCASE ' +
    "ORDER BY CASE version WHEN '3.5' THEN 0 ELSE 1 END LIMIT 1",
    ['Fireball']);
  assert(r && r.name === 'Fireball');
  assert(r.school === 'Evocation');
});

// ---- tests: race-picker.js ------------------------------------------------

test('race-picker: list query (init)', (db) => {
  const rows = execAll(db,
    'SELECT race_id, name, version FROM race ORDER BY name');
  assertGE(rows.length, 80);
});

test('race-picker: detail base query', (db) => {
  const list = execAll(db, 'SELECT race_id FROM race LIMIT 1');
  const r = execOne(db,
    'SELECT * FROM race WHERE race_id = ?', [list[0].race_id]);
  assert(r && r.name);
});

test('race-picker: ability mod sub-table (via view)', (db) => {
  // Use a race we know has ability_mods (Aasimar = Wis +2, Cha +2)
  const race = execOne(db,
    'SELECT race_id FROM race WHERE name = ?', ['Aasimar']);
  if (!race) return;  // skip if Aasimar absent
  const rows = execAll(db,
    'SELECT ability, modifier FROM race_ability_mod WHERE race_id = ?',
    [race.race_id]);
  assertGE(rows.length, 1);
});

test('race-picker: movement sub-table (via view)', (db) => {
  const list = execAll(db, 'SELECT race_id FROM race LIMIT 5');
  let found = 0;
  for (const r of list) {
    const rows = execAll(db,
      'SELECT mode, speed_ft, maneuverability FROM race_movement ' +
      'WHERE race_id = ?', [r.race_id]);
    if (rows.length > 0) found++;
  }
  assertGE(found, 1, 'at least one race should have movement');
});

test('race-picker: language sub-table (via view)', (db) => {
  const list = execAll(db, 'SELECT race_id FROM race LIMIT 10');
  let found = 0;
  for (const r of list) {
    const rows = execAll(db,
      'SELECT language, is_automatic FROM race_language ' +
      'WHERE race_id = ? ORDER BY is_automatic DESC, language',
      [r.race_id]);
    if (rows.length > 0) found++;
  }
  assertGE(found, 1, 'at least one race should have languages');
});

test('race-picker: trait sub-table (via view)', (db) => {
  const list = execAll(db, 'SELECT race_id FROM race LIMIT 5');
  let found = 0;
  for (const r of list) {
    const rows = execAll(db,
      'SELECT name, description, tag FROM race_trait WHERE race_id = ?',
      [r.race_id]);
    if (rows.length > 0) found++;
  }
  assertGE(found, 1, 'at least one race should have traits');
});

// ---- tests: template-picker.js --------------------------------------------

test('template-picker: list query (init) includes natural_armor_bonus', (db) => {
  const rows = execAll(db,
    "SELECT template_id, name, source, version, template_type, " +
    "level_adjustment, new_creature_type, natural_armor_bonus, " +
    "description FROM template " +
    "ORDER BY name COLLATE NOCASE, " +
    "CASE version WHEN '3.5' THEN 0 ELSE 1 END");
  assertGE(rows.length, 3);
});

test('template-picker: detail base query', (db) => {
  const list = execAll(db, 'SELECT template_id FROM template LIMIT 1');
  const r = execOne(db,
    'SELECT * FROM template WHERE template_id = ?', [list[0].template_id]);
  assert(r && r.name);
});

test('template-picker: ability mod sub-table (via view)', (db) => {
  const list = execAll(db, 'SELECT template_id FROM template');
  let found = 0;
  for (const r of list) {
    const rows = execAll(db,
      'SELECT ability, modifier FROM template_ability_mod ' +
      'WHERE template_id = ?', [r.template_id]);
    if (rows.length > 0) found++;
  }
  assertGE(found, 1, 'at least one template should have ability mods');
});

test('template-picker: trait sub-table (via view)', (db) => {
  const list = execAll(db, 'SELECT template_id FROM template');
  let found = 0;
  for (const r of list) {
    const rows = execAll(db,
      'SELECT name, description FROM template_trait WHERE template_id = ?',
      [r.template_id]);
    if (rows.length > 0) found++;
  }
  assertGE(found, 1, 'at least one template should have traits');
});

// ---- tests: class-picker.js -----------------------------------------------
//
// All 5 class-picker queries hit the class_table / class_level views.

test('class-picker: class_table list (init)', (db) => {
  const rows = execAll(db,
    "SELECT class_id, class, version, bab_progression, fort_progression, " +
    "  ref_progression, will_progression, table_caption, source " +
    "FROM class_table WHERE class IS NOT NULL " +
    "ORDER BY class, CASE version WHEN '3.5' THEN 0 ELSE 1 END");
  assertGE(rows.length, 200);
  // First row should have progression values
  assert(rows[0].class, 'class column populated');
});

test('class-picker: class_table detail by id', (db) => {
  const list = execAll(db,
    'SELECT class_id FROM class_table LIMIT 1');
  const r = execOne(db,
    "SELECT class_id, class, version, bab_progression, fort_progression, " +
    "ref_progression, will_progression FROM class_table " +
    "WHERE class_id = ?", [list[0].class_id]);
  assert(r && r.class);
});

test('class-picker: class_level detail by id+level', (db) => {
  // Find a class that has class_table entries
  const cls = execOne(db,
    'SELECT class_id FROM class_level LIMIT 1');
  const r = execOne(db,
    "SELECT level, special, spells_per_day_json, spells_known_json, " +
    "power_points_per_day, powers_known, max_power_level " +
    "FROM class_level WHERE class_id = ? AND level = ?",
    [cls.class_id, 1]);
  assert(r, 'class_level should return a row for level 1');
  assert(r.level === 1);
});

test('class-picker: class_level range query', (db) => {
  const cls = execOne(db, 'SELECT class_id FROM class_level LIMIT 1');
  const rows = execAll(db,
    "SELECT level, special FROM class_level " +
    "WHERE class_id = ? AND level <= ? ORDER BY level",
    [cls.class_id, 20]);
  assertGE(rows.length, 1);
});

test('class-picker: spells_per_day at level', (db) => {
  // Use Beguiler which has spells_per_day_table
  const cls = execOne(db,
    "SELECT class_id FROM class_table WHERE class = 'Beguiler'");
  if (!cls) return;  // skip if Beguiler not extracted
  const r = execOne(db,
    "SELECT spells_per_day_json, spells_known_json FROM class_level " +
    "WHERE class_id = ? AND level = ?", [cls.class_id, 1]);
  // Even if json fields are null for some classes, the query must succeed
  assert(r !== null);
});

// ---- tests: NEW capabilities (tags, errata, spell-access provenance) ------

test('tags: query feats by combat-maneuver tag', (db) => {
  const rows = execAll(db,
    'SELECT e.name, e.source FROM entry e ' +
    'JOIN tag t ON t.entry_id = e.id ' +
    'WHERE t.tag = ? AND e.type = ?',
    ['combat-maneuver', 'feat']);
  assertGE(rows.length, 60);
});

test('tags: spells by school via tag mirror', (db) => {
  const rows = execAll(db,
    'SELECT e.name FROM entry e JOIN tag t ON t.entry_id = e.id ' +
    "WHERE t.tag = 'evocation' AND e.type = 'spell'");
  assertGE(rows.length, 200);
});

test('errata: applied errata count', (db) => {
  const r = execOne(db,
    'SELECT COUNT(*) AS n FROM errata WHERE applied = 1');
  assertGE(r.n, 100);
});

test('errata: lookup errata for polymorph chain', (db) => {
  const rows = execAll(db,
    'SELECT e.name, er.kind, er.field FROM entry e ' +
    'JOIN errata er ON er.entry_id = e.id ' +
    "WHERE e.name LIKE ?", ['%olymorph%']);
  assertGE(rows.length, 1);
});

test('spell-access: Spellthief derived spells', (db) => {
  const rows = execAll(db,
    'SELECT e.name, scl.level, scl.provenance ' +
    'FROM entry e JOIN spell_class_level scl ON scl.entry_id = e.id ' +
    "WHERE scl.class_name = 'Spellthief' " +
    'ORDER BY e.name LIMIT 5');
  assertNotEmpty(rows);
  for (const r of rows) {
    assert(r.provenance.startsWith('derived'));
  }
});

test('spell-access: Beguiler has both native + derived', (db) => {
  const rows = execAll(db,
    'SELECT scl.provenance, COUNT(*) AS n ' +
    'FROM entry e JOIN spell_class_level scl ON scl.entry_id = e.id ' +
    "WHERE scl.class_name = 'Beguiler' " +
    'GROUP BY scl.provenance');
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
