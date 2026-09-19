// Prisma's "prisma-client" generator emits ESM-syntax .ts files regardless of
// moduleFormat, but backend/package.json declares "type": "commonjs" for the
// rest of the app. Node resolves module type per-directory via the nearest
// package.json, so the generated client directory needs its own "type":
// "module" marker for `import()` to load it. `prisma generate` recreates the
// whole output directory each run and wipes this file, so it's restored here
// as part of the generate step (see package.json's "prisma:generate" script).
const fs = require('fs');
const path = require('path');

const outDir = path.join(__dirname, '..', 'generated', 'prisma');
const markerPath = path.join(outDir, 'package.json');

fs.writeFileSync(markerPath, JSON.stringify({ type: 'module' }, null, 2) + '\n');
console.log(`[ensure_prisma_esm] wrote ${markerPath}`);
