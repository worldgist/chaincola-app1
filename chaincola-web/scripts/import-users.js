/**
 * Import users into Supabase Auth + public.user_profiles (trigger creates profile).
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY in .env.local (Dashboard → Settings → API).
 *
 * Usage:
 *   node scripts/import-users.js data/users.json
 *   node scripts/import-users.js data/users.csv
 *   node scripts/import-users.js --dry-run data/users.json
 *
 * JSON: array of objects
 *   [{ "email": "a@b.com", "password": "optional", "full_name": "...", "phone_number": "...", "referred_by": "REFCODE" }]
 *
 * CSV: header row (commas only in values if you quote fields — simple unquoted values recommended)
 *   email,password,full_name,phone_number,referred_by
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  '';
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

function usage() {
  console.log(`
Import users (Auth Admin API).

  node scripts/import-users.js [--dry-run] <users.json|users.csv>

Set in .env.local:
  NEXT_PUBLIC_SUPABASE_URL=https://....supabase.co
  SUPABASE_SERVICE_ROLE_KEY=eyJ...   (service_role — keep secret)
`);
}

function randomPassword() {
  return crypto.randomBytes(18).toString('base64url') + 'Aa1!';
}

function parseJsonFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const data = JSON.parse(raw);
  if (!Array.isArray(data)) {
    throw new Error('JSON root must be an array of user objects');
  }
  return data.map(normalizeRow);
}

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && c === ',') {
      out.push(cur.trim());
      cur = '';
      continue;
    }
    cur += c;
  }
  out.push(cur.trim());
  return out;
}

function parseCsvFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    throw new Error('CSV needs a header row and at least one data row');
  }
  const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase().replace(/\s+/g, '_'));
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = cells[idx] ?? '';
    });
    rows.push(normalizeRow(obj));
  }
  return rows;
}

function normalizeRow(obj) {
  const email = (obj.email || obj.Email || '').trim().toLowerCase();
  const password = (obj.password || obj.Password || '').trim() || null;
  const full_name = (obj.full_name || obj.fullName || obj.name || '').trim() || null;
  const phone_number = (obj.phone_number || obj.phone || obj.phoneNumber || '').trim() || null;
  const referred_by = (obj.referred_by || obj.referredBy || '').trim() || null;
  return { email, password, full_name, phone_number, referred_by };
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const fileArg = args.find((a) => !a.startsWith('-'));

  if (!fileArg) {
    usage();
    process.exit(1);
  }

  if (!SUPABASE_URL || !SERVICE_ROLE) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
    process.exit(1);
  }

  const filePath = path.resolve(process.cwd(), fileArg);
  if (!fs.existsSync(filePath)) {
    console.error('File not found:', filePath);
    process.exit(1);
  }

  const ext = path.extname(filePath).toLowerCase();
  let rows;
  if (ext === '.json') {
    rows = parseJsonFile(filePath);
  } else if (ext === '.csv') {
    rows = parseCsvFile(filePath);
  } else {
    console.error('Use .json or .csv');
    process.exit(1);
  }

  const invalid = rows.filter((r) => !r.email);
  if (invalid.length) {
    console.error('Every row must include email. Invalid rows:', invalid.length);
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log(`Rows: ${rows.length}  dry-run: ${dryRun}\n`);

  let created = 0;
  let skipped = 0;
  let failed = 0;
  const generatedPasswords = [];

  for (const row of rows) {
    const password = row.password || randomPassword();
    const displayName = row.full_name || row.email.split('@')[0];

    if (dryRun) {
      console.log(`[dry-run] would create: ${row.email} (${displayName})`);
      continue;
    }

    const { data, error } = await supabase.auth.admin.createUser({
      email: row.email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: displayName,
        ...(row.phone_number ? { phone_number: row.phone_number } : {}),
      },
    });

    if (error) {
      const msg = error.message || String(error);
      if (/already been registered|already exists|duplicate/i.test(msg)) {
        console.warn(`skip (exists): ${row.email}`);
        skipped += 1;
        continue;
      }
      console.error(`fail: ${row.email} — ${msg}`);
      failed += 1;
      continue;
    }

    if (!row.password) {
      generatedPasswords.push({ email: row.email, password });
    }

    if (row.referred_by && data.user?.id) {
      const { error: upErr } = await supabase
        .from('user_profiles')
        .update({ referred_by: row.referred_by })
        .eq('user_id', data.user.id);
      if (upErr) {
        console.warn(`  profile referred_by not set for ${row.email}: ${upErr.message}`);
      }
    }

    console.log(`ok: ${row.email}`);
    created += 1;
  }

  console.log(`\nDone. created=${created} skipped=${skipped} failed=${failed}`);

  if (generatedPasswords.length && !dryRun) {
    const outPath = path.join(
      path.dirname(filePath),
      `imported-passwords-${Date.now()}.json`
    );
    fs.writeFileSync(outPath, JSON.stringify(generatedPasswords, null, 2), 'utf8');
    console.log(`\nWrote generated passwords to:\n  ${outPath}\n(store securely; delete when finished)`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
