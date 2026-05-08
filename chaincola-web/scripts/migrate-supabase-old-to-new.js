/**
 * Migrate Auth users, all known public tables, and optionally Storage from SOURCE → TARGET Supabase.
 *
 * Default SOURCE: legacy project slleojsdpctxhlsoyenr.
 *
 * Env (.env.local or shell):
 *   SOURCE_SUPABASE_URL, SOURCE_SUPABASE_SERVICE_ROLE_KEY  (OLD — service_role)
 *   TARGET_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL
 *   TARGET_SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SERVICE_ROLE_KEY (NEW — service_role)
 *
 * Usage:
 *   npm run migrate:supabase -- --dry-run
 *   npm run migrate:supabase                    # auth + all public tables (no Storage)
 *   npm run migrate:supabase:all                # same as: ... --everything
 *   node scripts/migrate-supabase-old-to-new.js --public-only
 *   node scripts/migrate-supabase-old-to-new.js --auth-only
 *   node scripts/migrate-supabase-old-to-new.js --everything   # + copy all Storage buckets
 *   node scripts/migrate-supabase-old-to-new.js --storage      # only Storage (no auth/public)
 *   node scripts/migrate-supabase-old-to-new.js --passes=2    # run public table pass twice (FK ordering)
 *
 * Auth: same user ids when API allows; passwords are random (use Forgot password) unless you
 *       copy auth schema via Postgres separately.
 *
 * Storage: objects are re-uploaded to TARGET (same paths). Large buckets can take a long time.
 *
 * Not migrated here: Edge Functions deploy, Auth MFA factors, realtime.
 */

const crypto = require('crypto');
const path = require('path');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const DEFAULT_SOURCE_URL = 'https://slleojsdpctxhlsoyenr.supabase.co';

const SOURCE_URL =
  process.env.SOURCE_SUPABASE_URL ||
  process.env.OLD_SUPABASE_URL ||
  DEFAULT_SOURCE_URL;
const SOURCE_SERVICE_ROLE =
  process.env.SOURCE_SUPABASE_SERVICE_ROLE_KEY ||
  process.env.OLD_SUPABASE_SERVICE_ROLE_KEY ||
  '';

const TARGET_URL =
  process.env.TARGET_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  '';
const TARGET_SERVICE_ROLE =
  process.env.TARGET_SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  '';

/**
 * All app tables from chaincola-web ( + airtime ) migrations, dependency-safe order.
 * onConflict must match a UNIQUE / PRIMARY KEY constraint on the target DB.
 */
const PUBLIC_TABLES = [
  { table: 'user_profiles', onConflict: 'user_id' },
  { table: 'user_preferences', onConflict: 'user_id' },
  { table: 'user_wallets', onConflict: 'user_id' },
  { table: 'wallets', onConflict: 'user_id' },
  { table: 'wallet_balances', onConflict: 'user_id,currency' },
  { table: 'crypto_wallets', onConflict: 'user_id,asset,network' },
  { table: 'account_verifications', onConflict: 'id' },
  { table: 'user_bank_accounts', onConflict: 'user_id,account_number,bank_code' },
  { table: 'buy_transactions', onConflict: 'id' },
  { table: 'sell_transactions', onConflict: 'id' },
  { table: 'sells', onConflict: 'sell_id' },
  { table: 'transactions', onConflict: 'id' },
  { table: 'auto_sell_logs', onConflict: 'id' },
  { table: 'btc_deposits', onConflict: 'id' },
  { table: 'withdrawals', onConflict: 'id' },
  { table: 'withdrawal_transactions', onConflict: 'id' },
  { table: 'referrals', onConflict: 'id' },
  { table: 'notifications', onConflict: 'id' },
  { table: 'account_deletions', onConflict: 'id' },
  { table: 'gift_cards', onConflict: 'id' },
  { table: 'gift_card_sales', onConflict: 'id' },
  { table: 'custom_gift_cards', onConflict: 'id' },
  { table: 'support_tickets', onConflict: 'id' },
  { table: 'support_messages', onConflict: 'id' },
  { table: 'push_notification_tokens', onConflict: 'user_id,platform' },
  { table: 'system_wallets', onConflict: 'id' },
  { table: 'admin_revenue', onConflict: 'id' },
  { table: 'admin_action_logs', onConflict: 'id' },
  { table: 'crypto_rates', onConflict: 'crypto_symbol' },
  { table: 'app_settings', onConflict: 'id' },
  { table: 'pricing_engine_config', onConflict: 'asset' },
  { table: 'settlements', onConflict: 'id' },
  { table: 'system_limits', onConflict: 'id' },
  { table: 'reconciliations', onConflict: 'id' },
  { table: 'audit_logs', onConflict: 'id' },
  { table: 'inventory_adjustments', onConflict: 'id' },
  { table: 'reconciliation_history', onConflict: 'id' },
  { table: 'treasury_reconciliation_status', onConflict: 'id' },
  { table: 'treasury_wallet_addresses', onConflict: 'id' },
  { table: 'on_chain_balances', onConflict: 'id' },
  { table: 'treasury_risk_alerts', onConflict: 'id' },
  { table: 'pricing_rules', onConflict: 'id' },
  { table: 'price_overrides', onConflict: 'id' },
  { table: 'treasury_wallets', onConflict: 'id' },
  { table: 'treasury_wallet_balances', onConflict: 'wallet_id,asset' },
  { table: 'wallet_types', onConflict: 'name' },
  { table: 'wallet_registry', onConflict: 'wallet_address,asset,blockchain_network' },
  { table: 'reconciliation_runs', onConflict: 'id' },
  { table: 'bank_accounts', onConflict: 'id' },
  { table: 'bank_reconciliation', onConflict: 'id' },
  { table: 'global_risk_controls', onConflict: 'id' },
  { table: 'risk_events', onConflict: 'id' },
  { table: 'price_sources', onConflict: 'id' },
  { table: 'asset_prices', onConflict: 'id' },
  { table: 'aggregated_prices', onConflict: 'id' },
  { table: 'treasury_reports', onConflict: 'id' },
  { table: 'price_cache', onConflict: 'id' },
  { table: 'treasury_threshold_rules', onConflict: 'id' },
  { table: 'liquidity_controls', onConflict: 'id' },
  { table: 'emergency_controls', onConflict: 'id' },
  { table: 'settlement_reports', onConflict: 'id' },
  { table: 'treasury_alerts', onConflict: 'id' },
  { table: 'alert_configurations', onConflict: 'id' },
  { table: 'transaction_anomalies', onConflict: 'id' },
  { table: 'treasury_permissions', onConflict: 'role_name' },
  { table: 'user_treasury_roles', onConflict: 'user_id,role_name' },
  { table: 'crypto_prices', onConflict: 'id' },
  { table: 'user_price_alerts', onConflict: 'id' },
  { table: 'airtime_transactions', onConflict: 'id' },
];

const PAGE = 1000;
const UPSERT_CHUNK = 50;

function randomPassword() {
  return crypto.randomBytes(24).toString('base64url') + 'Aa1!';
}

function parseArgs() {
  const a = process.argv.slice(2);
  let passes = 1;
  const pArg = a.find((x) => x.startsWith('--passes='));
  if (pArg) {
    const n = parseInt(pArg.split('=')[1], 10);
    if (n >= 1 && n <= 5) passes = n;
  }
  const everything = a.includes('--everything');
  const storageOnly = a.includes('--storage');
  const includeStorage = everything || a.includes('--storage') || a.includes('--with-storage');

  return {
    dryRun: a.includes('--dry-run'),
    authOnly: a.includes('--auth-only'),
    publicOnly: a.includes('--public-only'),
    storageOnly,
    includeStorage: includeStorage && !a.includes('--skip-storage'),
    passes,
  };
}

async function listAllUsers(sourceClient) {
  const users = [];
  let page = 1;
  for (;;) {
    const { data, error } = await sourceClient.auth.admin.listUsers({ page, perPage: PAGE });
    if (error) throw error;
    const batch = data.users || [];
    users.push(...batch);
    if (batch.length < PAGE) break;
    page += 1;
  }
  return users;
}

async function migrateAuth(sourceClient, targetClient, dryRun) {
  const users = await listAllUsers(sourceClient);
  console.log(`\n[auth] Found ${users.length} users on SOURCE.`);

  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const u of users) {
    const email = u.email || '';
    const phone = u.phone || '';

    if (!email && !phone) {
      console.warn(`[auth] skip user ${u.id} (no email and no phone)`);
      skipped += 1;
      continue;
    }

    if (dryRun) {
      console.log(`[auth] dry-run would migrate: ${u.id} email=${email || '-'} phone=${phone || '-'}`);
      continue;
    }

    const password = randomPassword();
    const attrs = {
      id: u.id,
      email: email || undefined,
      phone: phone || undefined,
      password,
      email_confirm: !!u.email_confirmed_at,
      phone_confirm: !!u.phone_confirmed_at,
      user_metadata: u.user_metadata || {},
      app_metadata: u.app_metadata || {},
    };

    let { error } = await targetClient.auth.admin.createUser(attrs);

    if (error && /already|duplicate|registered/i.test(error.message)) {
      console.warn(`[auth] skip (exists on target): ${email || phone} (${u.id})`);
      skipped += 1;
      continue;
    }

    if (error && /invalid|id|uuid/i.test(error.message)) {
      const { id: _omit, ...withoutId } = attrs;
      ({ error } = await targetClient.auth.admin.createUser(withoutId));
    }

    if (error) {
      console.error(`[auth] fail ${email || phone} (${u.id}): ${error.message}`);
      failed += 1;
      continue;
    }

    console.log(`[auth] ok: ${email || phone} (${u.id})`);
    created += 1;
  }

  console.log(`\n[auth] done. created=${created} skipped=${skipped} failed=${failed}`);
  if (!dryRun && created > 0) {
    console.log(
      '\n[auth] Reminder: migrated users have new random passwords unless you copy auth.users via Postgres.\n'
    );
  }
}

async function fetchAllFromTable(source, table) {
  const rows = [];
  let from = 0;
  const size = PAGE;
  for (;;) {
    const { data, error } = await source.from(table).select('*').range(from, from + size - 1);
    if (error) {
      if (/relation|does not exist|schema cache/i.test(error.message)) {
        return { rows: [], missing: true, error: error.message };
      }
      throw new Error(`[${table}] select: ${error.message}`);
    }
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < size) break;
    from += size;
  }
  return { rows, missing: false };
}

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

async function migratePublic(source, target, dryRun, passes) {
  for (let pass = 1; pass <= passes; pass++) {
    console.log(`\n[public] Pass ${pass}/${passes} — copying tables (service role bypasses RLS)...`);

    for (const { table, onConflict } of PUBLIC_TABLES) {
      const { rows, missing, error: fetchErr } = await fetchAllFromTable(source, table);
      if (missing) {
        console.warn(`[public] skip ${table}: not found — ${fetchErr}`);
        continue;
      }
      if (rows.length === 0) {
        console.log(`[public] ${table}: 0 rows`);
        continue;
      }

      console.log(`[public] ${table}: ${rows.length} rows`);

      if (dryRun) continue;

      let ok = 0;
      let errN = 0;
      for (const part of chunk(rows, UPSERT_CHUNK)) {
        const { error: upErr } = await target.from(table).upsert(part, {
          onConflict,
          ignoreDuplicates: false,
        });
        if (upErr) {
          console.error(`[public] ${table} upsert: ${upErr.message}`);
          errN += part.length;
        } else {
          ok += part.length;
        }
      }
      if (errN) console.warn(`[public] ${table}: ~${ok} ok, ~${errN} failed (retry with --passes=2 if FK order)`);
    }
  }
  console.log('\n[public] Finished.');
}

function isFolderEntry(item) {
  return item && item.metadata === null;
}

async function copyStorageFile(source, target, bucket, filePath, dryRun) {
  if (dryRun) return;
  const { data: blob, error: dlErr } = await source.storage.from(bucket).download(filePath);
  if (dlErr) {
    console.error(`[storage] download ${bucket}/${filePath}: ${dlErr.message}`);
    return;
  }
  const buf = await blob.arrayBuffer();
  const { error: upErr } = await target.storage.from(bucket).upload(filePath, buf, {
    upsert: true,
    contentType: blob.type || 'application/octet-stream',
  });
  if (upErr) console.error(`[storage] upload ${bucket}/${filePath}: ${upErr.message}`);
}

async function walkStoragePrefix(source, target, bucket, prefix, dryRun, stats) {
  const { data: items, error } = await source.storage.from(bucket).list(prefix, { limit: 1000 });
  if (error) {
    console.error(`[storage] list ${bucket}/${prefix || '(root)'}: ${error.message}`);
    return;
  }
  for (const item of items || []) {
    const rel = prefix ? `${prefix}/${item.name}` : item.name;
    if (isFolderEntry(item)) {
      await walkStoragePrefix(source, target, bucket, rel, dryRun, stats);
    } else {
      stats.files += 1;
      if (dryRun) continue;
      await copyStorageFile(source, target, bucket, rel, dryRun);
      if (stats.files % 200 === 0) console.log(`[storage] ${bucket}: ${stats.files} files...`);
    }
  }
}

async function ensureTargetBucket(target, bucketMeta) {
  const { data: buckets, error: lbErr } = await target.storage.listBuckets();
  if (lbErr) throw lbErr;
  if (buckets?.some((b) => b.name === bucketMeta.name)) return;
  const { error } = await target.storage.createBucket(bucketMeta.name, {
    public: bucketMeta.public,
    fileSizeLimit: bucketMeta.file_size_limit ?? undefined,
    allowedMimeTypes: bucketMeta.allowed_mime_types ?? undefined,
  });
  if (error && !/already exists/i.test(error.message)) {
    console.warn(`[storage] create bucket ${bucketMeta.name}: ${error.message}`);
  }
}

async function migrateStorage(source, target, dryRun) {
  console.log('\n[storage] Listing SOURCE buckets...');
  const { data: srcBuckets, error } = await source.storage.listBuckets();
  if (error) throw error;
  if (!srcBuckets?.length) {
    console.log('[storage] No buckets on SOURCE.');
    return;
  }

  for (const b of srcBuckets) {
    console.log(`[storage] Bucket "${b.name}" (public=${b.public})`);
    if (!dryRun) await ensureTargetBucket(target, b);
    const stats = { files: 0 };
    await walkStoragePrefix(source, target, b.name, '', dryRun, stats);
    console.log(`[storage] Bucket "${b.name}": ${stats.files} files ${dryRun ? '(dry-run)' : 'copied'}`);
  }
  console.log('\n[storage] Done.');
}

async function main() {
  const { dryRun, authOnly, publicOnly, storageOnly, includeStorage, passes } = parseArgs();

  if (storageOnly) {
    if (!SOURCE_SERVICE_ROLE || !TARGET_URL || !TARGET_SERVICE_ROLE) {
      console.error('Missing SOURCE/TARGET service role or TARGET URL for storage migration.');
      process.exit(1);
    }
    const source = createClient(SOURCE_URL, SOURCE_SERVICE_ROLE, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const target = createClient(TARGET_URL, TARGET_SERVICE_ROLE, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    console.log(`SOURCE: ${SOURCE_URL}\nTARGET: ${TARGET_URL}\nstorage-only dry-run=${dryRun}`);
    await migrateStorage(source, target, dryRun);
    console.log('\nDone.');
    return;
  }

  if (!SOURCE_SERVICE_ROLE) {
    console.error(
      'Missing SOURCE_SUPABASE_SERVICE_ROLE_KEY (or OLD_SUPABASE_SERVICE_ROLE_KEY) for OLD project.'
    );
    process.exit(1);
  }
  if (!TARGET_URL || !TARGET_SERVICE_ROLE) {
    console.error('Missing TARGET URL or TARGET_SUPABASE_SERVICE_ROLE_KEY / SUPABASE_SERVICE_ROLE_KEY.');
    process.exit(1);
  }

  console.log(`SOURCE: ${SOURCE_URL}`);
  console.log(`TARGET: ${TARGET_URL}`);
  console.log(
    `dry-run=${dryRun} auth-only=${authOnly} public-only=${publicOnly} storage=${includeStorage} passes=${passes}`
  );

  const source = createClient(SOURCE_URL, SOURCE_SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const target = createClient(TARGET_URL, TARGET_SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  if (!publicOnly) {
    await migrateAuth(source, target, dryRun);
  }
  if (!authOnly) {
    await migratePublic(source, target, dryRun, passes);
  }
  if (includeStorage && !authOnly) {
    await migrateStorage(source, target, dryRun);
  } else if (includeStorage && authOnly) {
    console.log('\n[storage] skipped (--auth-only). Run with --storage or --everything without --auth-only.');
  }

  console.log('\nDone.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
