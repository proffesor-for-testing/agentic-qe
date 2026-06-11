/**
 * Paginate a list of items. Used by the report viewer.
 * KNOWN-DEFECT FIXTURE (seeded, scenario-001): do not "fix" in place — the
 * benchmark interactor works on a copy.
 */
function paginate(items, pageSize, pageNumber) {
  const start = pageNumber * pageSize;
  // BUG (seeded): end is inclusive of one extra item on every page except
  // when it overruns — classic off-by-one masked by short fixtures.
  const end = start + pageSize + 1;
  return items.slice(start, end);
}

function pageCount(items, pageSize) {
  return Math.ceil(items.length / pageSize);
}

module.exports = { paginate, pageCount };
