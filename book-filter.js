// book-filter.js — campaign-scope filter for picker results.
//
// Lets the user restrict every picker (and the universal lookup
// modal) to a subset of source books — e.g. "only PHB / DMG / FRCS
// for my Realms campaign". Filter state is **per-character** and
// persists in saved sheets. By default no filter is active and
// every book is in scope.
//
// Design notes:
// - Filter key is the book ABBREVIATION (e.g. "PHB", "FRCS"). The
//   `book` table has multiple rows that share an abbreviation
//   (the 5 "Forgotten Realms Campaign Setting (X entry)" variants
//   all have abbrev=FRCS) — filtering by abbrev keeps those
//   together naturally.
// - Source-string → abbrev resolution is cached in memory after the
//   DB loads. Sources with no matching book row (homebrew, future
//   additions) are *always allowed* — we don't want a stale filter
//   set to silently hide newly added content the user can't see in
//   the modal yet.
// - Errata indicators are unaffected by this filter; the universal
//   lookup modal still surfaces errata icons for hidden entries
//   when they appear elsewhere (e.g. as prereqs).
//
// Public API:
//   BookFilter.ready                — Promise (resolves after DB load)
//   BookFilter.getBooks()           — array of {name, abbreviation,
//                                      publication_date, edition,
//                                      book_type, publisher}
//   BookFilter.getActiveAbbrevs()   — Set<string>
//   BookFilter.setActiveAbbrevs(set) — replace + fire event
//   BookFilter.clear()              — alias for setActiveAbbrevs(new Set())
//   BookFilter.isActive()           — boolean (false when empty)
//   BookFilter.allowsSource(src)    — boolean (filter-aware row check)
//   BookFilter.allowsAbbrev(abbrev) — boolean
//   BookFilter.collectData()        — { _book_filter: [...] | null }
//   BookFilter.loadData(data)       — reads `_book_filter` if present
//
// Event:
//   document dispatches 'book-filter-changed' (no detail) whenever
//   the active set changes. Pickers re-run their index on this event.

(function () {
  const EVENT_NAME = 'book-filter-changed';

  // Internal state.
  let books = [];                    // all book rows, sorted by date
  let sourceToAbbrev = new Map();    // source string → abbrev
  let activeAbbrevs = new Set();     // empty = no filter

  function buildBookIndex() {
    if (!window.DB || !window.DB.isLoaded()) return;
    try {
      books = window.DB.query(
        "SELECT name, abbreviation, publication_date, edition, " +
        "book_type, publisher FROM book " +
        "ORDER BY CASE edition WHEN '3.5' THEN 0 ELSE 1 END, " +
        "         publication_date ASC, name ASC"
      );
      sourceToAbbrev = new Map();
      for (const b of books) {
        if (b.name && b.abbreviation) {
          sourceToAbbrev.set(b.name, b.abbreviation);
        }
      }
      console.log(`[book-filter] indexed ${books.length} books, ` +
        `${new Set(books.map(b => b.abbreviation)).size} distinct abbrevs`);
    } catch (err) {
      console.warn('[book-filter] failed to index books:', err);
    }
  }

  const ready = (async function init() {
    if (!window.DB) return;
    await window.DB.ready;
    buildBookIndex();
  })();

  function getBooks() {
    return books.slice();
  }

  function getActiveAbbrevs() {
    return new Set(activeAbbrevs);
  }

  function isActive() {
    return activeAbbrevs.size > 0;
  }

  function setActiveAbbrevs(setLike) {
    const next = new Set();
    if (setLike) {
      for (const a of setLike) {
        if (typeof a === 'string' && a) next.add(a);
      }
    }
    // Skip no-op changes so we don't churn pickers needlessly.
    if (next.size === activeAbbrevs.size &&
        [...next].every(a => activeAbbrevs.has(a))) {
      return;
    }
    activeAbbrevs = next;
    document.dispatchEvent(new CustomEvent(EVENT_NAME));
  }

  function clear() {
    setActiveAbbrevs(new Set());
  }

  function allowsAbbrev(abbrev) {
    if (activeAbbrevs.size === 0) return true;
    if (!abbrev) return true;        // homebrew / unknown — always allow
    return activeAbbrevs.has(abbrev);
  }

  function allowsSource(source) {
    if (activeAbbrevs.size === 0) return true;
    if (!source) return true;
    const abbrev = sourceToAbbrev.get(source);
    if (!abbrev) return true;        // unknown source — always allow
    return activeAbbrevs.has(abbrev);
  }

  function collectData() {
    return {
      _book_filter: activeAbbrevs.size > 0
        ? [...activeAbbrevs].sort()
        : null,
    };
  }

  function loadData(data) {
    if (!data || !('_book_filter' in data)) {
      // Older saves had no filter field — leave whatever the user
      // had set in their UI session intact rather than wiping it.
      return;
    }
    const arr = data._book_filter;
    if (Array.isArray(arr) && arr.length) {
      setActiveAbbrevs(new Set(arr));
    } else {
      clear();
    }
  }

  window.BookFilter = {
    ready,
    getBooks,
    getActiveAbbrevs,
    setActiveAbbrevs,
    clear,
    isActive,
    allowsSource,
    allowsAbbrev,
    collectData,
    loadData,
    EVENT_NAME,
  };
})();
