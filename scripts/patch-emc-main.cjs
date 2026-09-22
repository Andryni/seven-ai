/**
 * Patches expo-modules-core's package.json so its "main" entry points to the
 * compiled build/index.js instead of src/index.ts.
 *
 * WHY: with Node.js >= 22.6 (and hard-required on Node 26), ESM "type
 * stripping" refuses to load .ts files under node_modules
 * (ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING), which breaks `expo start`
 * / `expo config` on SDK 52 projects. Pointing "main" at the shipped JS
 * build resolves it without touching app code.
 *
 * Idempotent: safe to run on every npm install.
 */
const fs = require('fs');
const path = require('path');

const pkgPath = path.join(__dirname, '..', 'node_modules', 'expo-modules-core', 'package.json');

try {
  if (!fs.existsSync(pkgPath)) {
    console.log('[patch-emc] expo-modules-core not installed yet; skipping.');
    process.exit(0);
  }
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  if (pkg.main === 'src/index.ts') {
    pkg.main = 'build/index.js';
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
    console.log('[patch-emc] expo-modules-core main -> build/index.js (Node 26 type-stripping fix)');
  } else {
    console.log(`[patch-emc] expo-modules-core main is "${pkg.main}"; no patch needed.`);
  }
} catch (e) {
  // Never fail the install over this patch.
  console.warn('[patch-emc] warning:', e?.message || e);
}
