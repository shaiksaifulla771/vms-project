/** Wrap async route handlers so rejections reach the error middleware. */
const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** Build "WHERE a AND b" from a list of [sql, value] pairs, numbering $n params. */
function where(conds, params = []) {
  const parts = [];
  for (const [sql, value] of conds) {
    if (value === undefined || value === null || value === '') continue;
    params.push(value);
    parts.push(sql.replace(/\?/g, `$${params.length}`));
  }
  return { clause: parts.length ? `where ${parts.join(' and ')}` : '', params };
}

module.exports = { h, where };
