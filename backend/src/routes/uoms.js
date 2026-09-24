const router = require('express').Router();
const { query } = require('../db/pool');
const { h } = require('../utils/http');

// UOM dropdown list (read-only; the list itself comes with the database migrations)
router.get('/', h(async (req, res) => {
  const { rows } = await query(`select code, name, uom_type, status from public.uoms
                                 where ($1::text is null or status = $1) order by sort_order, lower(code)`, [req.query.status || null]);
  res.json(rows);
}));

module.exports = router;
