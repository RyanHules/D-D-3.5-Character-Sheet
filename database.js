// database.js — load dnd35.db (SQLite) and expose query helpers.
//
// This module is purely additive: existing manual-entry fields keep
// working. When the database loads, we populate dropdown options and
// wire selection handlers; if the DB fails to load we log a warning and
// leave the sheet operating as before.
//
// Public API:
//   DB.ready             — Promise that resolves when DB is loaded
//   DB.query(sql, params) — returns array of row objects
//   DB.queryOne(sql, params) — returns first row or null
//
// SQL.js docs: https://sql.js.org/

(function () {
  const DB_PATH = 'data/dnd35.db';
  const SQLJS_WASM_PATH = 'vendor/sql-wasm.wasm';

  let db = null;

  // Convert a sql.js exec() result to an array of row objects.
  function execToRows(stmt) {
    const cols = stmt.getColumnNames();
    const rows = [];
    while (stmt.step()) {
      const values = stmt.get();
      const row = {};
      for (let i = 0; i < cols.length; i++) {
        row[cols[i]] = values[i];
      }
      rows.push(row);
    }
    return rows;
  }

  function query(sql, params) {
    if (!db) {
      console.warn('DB not ready; query ignored:', sql);
      return [];
    }
    const stmt = db.prepare(sql);
    try {
      if (params) stmt.bind(params);
      return execToRows(stmt);
    } finally {
      stmt.free();
    }
  }

  function queryOne(sql, params) {
    const rows = query(sql, params);
    return rows.length ? rows[0] : null;
  }

  // Load: fetch sql.js, then fetch the DB blob, then open it.
  const ready = (async function load() {
    try {
      // initSqlJs is exposed globally by sql-wasm.js.
      const SQL = await window.initSqlJs({
        locateFile: file => SQLJS_WASM_PATH,
      });
      const response = await fetch(DB_PATH);
      if (!response.ok) {
        throw new Error(`Failed to fetch ${DB_PATH}: ${response.status}`);
      }
      const buf = await response.arrayBuffer();
      db = new SQL.Database(new Uint8Array(buf));
      const races = queryOne('SELECT COUNT(*) AS n FROM race');
      console.log(`[DB] Loaded ${DB_PATH} — ${races.n} races, ` +
        `${queryOne('SELECT COUNT(*) AS n FROM spell').n} spells, ` +
        `${queryOne('SELECT COUNT(*) AS n FROM feat').n} feats, ` +
        `${queryOne('SELECT COUNT(*) AS n FROM item').n} items`);
      return db;
    } catch (err) {
      console.warn('[DB] Failed to load — sheet will operate without ' +
        'database-driven features:', err);
      return null;
    }
  })();

  window.DB = { ready, query, queryOne, isLoaded: () => db !== null };
})();
