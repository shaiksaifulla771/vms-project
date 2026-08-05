# Safe React Component Splitting

Whenever you split a large React file into smaller modular files, you MUST explicitly verify:
1. The parent file has added the necessary `import` statements for the newly extracted components.
2. The newly extracted components have a valid `export default` or named export.
3. The relative paths for all imports (e.g. `../services/api`) inside the new component files are updated to reflect their new directory depth.
4. Run `npm run lint` (if available) or check the Vite build logs to confirm there are no missing imports.
