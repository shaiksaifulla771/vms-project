---
name: safe-schema-migration
description: Use when adding, changing, or removing a database column, table, or index in the ERP/VMS schema. Enforces additive-first, reversible migrations so existing features don't break.
---

# Safe Schema Migration

**Target location:** rename this file to `SKILL.md` and place it at `.agents/skills/safe-schema-migration/SKILL.md` (project scope) or `~/.gemini/config/skills/safe-schema-migration/SKILL.md` (global scope, all projects).

Follow this whenever a task touches the database schema.

## Steps
1. **Classify the change**: additive (new column/table/index) vs. destructive (rename, drop, type change, adding NOT NULL to an existing column).
2. **Additive changes**: write the migration, backfill if needed, ship — low risk, proceed directly.
3. **Destructive changes**: never in one step.
   - Step A: add the new column/table alongside the old one.
   - Step B: backfill data; update writes to populate both old and new.
   - Step C: switch reads to the new column; verify behavior.
   - Step D (separate task, separate approval): drop the old column.
4. **Every migration ships with a rollback script** in the same change — if `up` fails partway, `down` must cleanly undo it.
5. **Before merging**: list every query, ORM model, and API response touching the changed table. Confirm each still works.
6. **After merging**: if anything about the migration was non-obvious or caused an issue, log it in `LEARNINGS.md`.

## Red flags — stop and ask the user
- Dropping or renaming a column/table referenced by an external vendor integration.
- Changing a column type on a table holding financial data (amounts, quantities).
- Any migration with no rollback path.
