/**
 * Deploy every Edge Function in supabase/functions to the linked Supabase project.
 *
 * Uses project ref from supabase/.temp/project-ref (from `npx supabase link`).
 *
 * Usage (from chaincola-web):
 *   node scripts/deploy-all-edge-functions.js
 *
 * Options:
 *   --project-ref=abcxyz   Override project ref
 *   --dry-run              List function names only
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.cwd();
const functionsDir = path.join(root, 'supabase', 'functions');
const refFile = path.join(root, 'supabase', '.temp', 'project-ref');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const refArg = args.find((a) => a.startsWith('--project-ref='));
const projectRef = refArg
  ? refArg.split('=')[1].trim()
  : fs.existsSync(refFile)
    ? fs.readFileSync(refFile, 'utf8').trim()
    : '';

if (!projectRef) {
  console.error('Missing project ref. Run: npx supabase link --project-ref <ref>');
  process.exit(1);
}

const names = fs
  .readdirSync(functionsDir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && d.name !== '_shared')
  .map((d) => d.name)
  .sort();

console.log(`Project: ${projectRef}\nFunctions: ${names.length}\n`);

if (dryRun) {
  names.forEach((n) => console.log(n));
  process.exit(0);
}

let ok = 0;
const failed = [];

for (const name of names) {
  process.stdout.write(`\n=== ${name} ===\n`);
  const r = spawnSync(
    'npx',
    ['supabase', 'functions', 'deploy', name, '--project-ref', projectRef, '--use-api', '--yes'],
    { stdio: 'inherit', shell: true, cwd: root }
  );
  if (r.status !== 0) {
    failed.push(name);
  } else {
    ok++;
  }
}

console.log(`\nSummary: ok=${ok} failed=${failed.length}`);
if (failed.length) {
  failed.forEach((n) => console.error(`  FAILED: ${n}`));
  process.exit(1);
}
