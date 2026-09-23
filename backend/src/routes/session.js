const router = require('express').Router();
const { query } = require('../db/pool');
const { h } = require('../utils/http');

// Current acting user + users available in the UI switcher (no-login mode)
router.get('/', h(async (req, res) => {
  const users = await query(`select id, full_name, email, role::text as role
                               from public.user_profiles order by role, full_name`);
  const company = await query('select id, name from public.companies order by created_at limit 1');
  res.json({ user: req.user, users: users.rows, company: company.rows[0] || null });
}));

module.exports = router;
