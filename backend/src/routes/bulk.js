const router = require('express').Router();
const { withTransaction } = require('../db/pool');
const { h } = require('../utils/http');
const { badRequest } = require('../utils/errors');
const bulk = require('../services/bulk');

const ENTITIES = ['materials', 'vendors', 'mpns'];
const MODES = ['create', 'update'];

function params(req) {
  const { entity } = req.params;
  if (!ENTITIES.includes(entity)) throw badRequest('Unknown entity');
  const mode = req.query.mode || req.body?.mode || 'create';
  if (!MODES.includes(mode)) throw badRequest('mode must be create or update');
  return { entity, mode };
}

function send(res, buffer, type, filename) {
  res.setHeader('Content-Type', type);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
  res.send(buffer);
}

const stamp = () => new Date().toISOString().slice(0, 10);

// Blank template (create) or pre-filled template (update)
router.get('/:entity/template', h(async (req, res) => {
  const { entity, mode } = params(req);
  const buf = await bulk.templateBuffer(entity, mode);
  send(res, buf, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    `${entity}_${mode === 'update' ? 'bulk_update' : 'bulk_entry'}_template.xlsx`);
}));

router.get('/:entity/export', h(async (req, res) => {
  const { entity } = params(req);
  const f = await bulk.exportFile(entity, req.query.format === 'csv' ? 'csv' : 'xlsx');
  send(res, f.buffer, f.type, `${entity}_${stamp()}.${f.ext}`);
}));

// Uploaded file (base64) -> rows
router.post('/:entity/parse', h(async (req, res) => {
  const { entity, mode } = params(req);
  const rows = await bulk.parseFile(entity, mode, req.body?.filename, req.body?.data);
  res.json({ rows });
}));

router.post('/:entity/preview', h(async (req, res) => {
  const { entity, mode } = params(req);
  const rows = await bulk.validate(entity, mode, req.body?.rows);
  res.json({ summary: bulk.summary(rows), rows: rows.map(({ data, patch, ...r }) => r), missing_categories: rows.missingCategories });
}));

// Save every row or none
router.post('/:entity/commit', h(async (req, res) => {
  const { entity, mode } = params(req);
  const result = await withTransaction(async (c) => {
    const rows = await bulk.validate(entity, mode, req.body?.rows, c);
    const sum = bulk.summary(rows);
    if (sum.errors) return { failed: true, summary: sum, rows: rows.map(({ data, patch, ...r }) => r), missing_categories: rows.missingCategories };
    const saved = await bulk.commit(c, entity, mode, rows, req.user.id);
    return { summary: sum, saved };
  });
  if (result.failed) return res.status(400).json({ error: 'Some rows have errors. Nothing was saved.', ...result });
  res.status(201).json(result);
}));

module.exports = router;
