// One-shot Node script that downloads accurate logos for Nigerian banks.
//
// IMPORTANT: This script is intentionally CONSERVATIVE. Showing a wrong
// logo (e.g. a US rental-car company because the bank's name slug-derived
// to a generic English word) is much worse than showing a clean coloured
// initials avatar. So we ONLY accept logos from these explicit sources:
//
//   1. nigerianbanks.xyz — a Nigerian-specific logo CDN. We use a fixed
//      whitelist of slug→bank mappings known to return real PNGs (not the
//      placeholder `default-image.png`).
//
//   2. A curated TRUSTED_DOMAINS map of bank slug → official domain.
//      We fetch the favicon from Google's API for these explicitly listed
//      domains. The list is hand-verified to point at the actual bank or
//      fintech, not a domain that just happens to share a slug.
//
// Everything else gets skipped at download time, and <BankLogo> renders a
// coloured initials avatar at runtime.
//
// Usage:
//   node chaincola/scripts/download-bank-logos.mjs
//
// To refresh: delete chaincola/assets/banks/.flw-banks.cache.json then run.

import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import https from 'node:https';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..');
const ASSETS_DIR = join(REPO_ROOT, 'assets', 'banks');
const MANIFEST_PATH = join(ASSETS_DIR, 'manifest.ts');
const CACHE_PATH = join(ASSETS_DIR, '.flw-banks.cache.json');
const FLW_ENV_PATH = resolve(REPO_ROOT, '..', 'chaincola-transfer', '.env');

// nigerianbanks.xyz returns this exact placeholder when no real logo exists.
// Real logos are 6KB+; placeholder is ~580B.
const PLACEHOLDER_BYTE_THRESHOLD = 1000;
const FAVICON_MIN_BYTES = 250;

// ----- Source 1: nigerianbanks.xyz registry (verified PNG logos) -----
// Map name-key (lowercased, slug-stripped) -> registry slug.

const NB_REGISTRY = {
  'access bank':                'access-bank',
  'access bank diamond':        'access-bank-diamond',
  'access (diamond) bank':      'access-bank-diamond',
  'access bank (diamond)':      'access-bank-diamond',
  'diamond bank':               'access-bank-diamond',
  'alat by wema':               'alat-by-wema',
  'alat':                       'alat-by-wema',
  'aso savings and loans':      'asosavings',
  'asosavings and loans':       'asosavings',
  'aso savings':                'asosavings',
  'cemcs microfinance bank':    'cemcs-microfinance-bank',
  'citibank nigeria':           'citibank-nigeria',
  'citibank':                   'citibank-nigeria',
  'citi bank':                  'citibank-nigeria',
  'ecobank nigeria':            'ecobank-nigeria',
  'ecobank plc':                'ecobank-nigeria',
  'ecobank':                    'ecobank-nigeria',
  'ekondo microfinance bank':   'ekondo-microfinance-bank',
  'ekondo mfb':                 'ekondo-microfinance-bank',
  'fidelity bank':              'fidelity-bank',
  'first bank of nigeria':      'first-bank-of-nigeria',
  'first bank':                 'first-bank-of-nigeria',
  'first bank plc':             'first-bank-of-nigeria',
  'first city monument bank':   'first-city-monument-bank',
  'fcmb':                       'first-city-monument-bank',
  'fcmb microfinance bank':     'first-city-monument-bank',
  'globus bank':                'globus-bank',
  'guaranty trust bank':        'guaranty-trust-bank',
  'guaranty trust bank (gtb)':  'guaranty-trust-bank',
  'gtbank':                     'guaranty-trust-bank',
  'gt bank':                    'guaranty-trust-bank',
  'gtb':                        'guaranty-trust-bank',
  'heritage bank':              'heritage-bank',
  'keystone bank':              'keystone-bank',
  'kuda':                       'kuda-bank',
  'kuda bank':                  'kuda-bank',
  'kuda microfinance bank':     'kuda-bank',
  'lotus bank':                 'lotus-bank',
  'moniepoint mfb':             'moniepoint-mfb-ng',
  'moniepoint microfinance bank': 'moniepoint-mfb-ng',
  'moniepoint':                 'moniepoint-mfb-ng',
  'opay':                       'paycom',
  'opay digital services':      'paycom',
  'paycom':                     'paycom',
  'paga':                       'paga',
  'palmpay':                    'palmpay',
  'palm pay':                   'palmpay',
  'polaris bank':               'polaris-bank',
  'sparkle':                    'sparkle-microfinance-bank',
  'sparkle microfinance bank':  'sparkle-microfinance-bank',
  'sparkle mfb':                'sparkle-microfinance-bank',
  'stanbic ibtc bank':          'stanbic-ibtc-bank',
  'stanbic ibtc':               'stanbic-ibtc-bank',
  'standard chartered bank':    'standard-chartered-bank',
  'standard chartered':         'standard-chartered-bank',
  // Flutterwave's bank list has a typo for code 068 ("Chaterted" not "Chartered").
  'standard chaterted bank':    'standard-chartered-bank',
  'standard chaterted bank plc':'standard-chartered-bank',
  'standard chaterted':         'standard-chartered-bank',
  'sterling bank':              'sterling-bank',
  'sterling bank plc':          'sterling-bank',
  'taj bank':                   'taj-bank',
  'taj bank limited':           'taj-bank',
  'tajbank':                    'taj-bank',
  'union bank of nigeria':      'union-bank-of-nigeria',
  'union bank':                 'union-bank-of-nigeria',
  'union bank plc':             'union-bank-of-nigeria',
  'united bank for africa':     'united-bank-for-africa',
  'uba':                        'united-bank-for-africa',
  'wema bank':                  'wema-bank',
  'wema bank plc':              'wema-bank',
  'zenith bank':                'zenith-bank',
  'zenith bank plc':            'zenith-bank',
};

// ----- Source 2: hand-curated trusted domain map -----
// Each entry: name-key -> { domain, label }. We fetch
// https://www.google.com/s2/favicons?domain=<domain>&sz=128 for these.
// EVERY entry has been hand-verified to point at the actual bank/fintech.

const TRUSTED_DOMAINS = {
  // Commercial banks NOT on nigerianbanks.xyz
  'jaiz bank':                  'jaizbankplc.com',
  'optimus bank':               'optimusbank.com',
  'parallex bank':              'parallexbank.com',
  'premium trust bank':         'premiumtrustbank.com',
  'premiumtrust bank':          'premiumtrustbank.com',
  'providus bank':              'providusbank.com',
  'providusbank':               'providusbank.com',
  'providusbank plc':           'providusbank.com',
  'signature bank':             'signaturebankng.com',
  'suntrust bank':              'suntrustng.com',
  'titan trust bank':           'titantrustbank.com',
  'unity bank':                 'unitybankng.com',
  'unity bank plc':             'unitybankng.com',
  'coronation merchant bank':   'coronationmb.com',
  'rand merchant bank':         'rmb.com.ng',
  'central bank of nigeria':    'cbn.gov.ng',
  'fbnquest merchant bank':     'fbnquestmb.com',
  'nova merchant bank':         'novamb.com',
  'fcmb easy account':          'fcmb.com',

  // Microfinance / fintech / digital banks
  'carbon':                                     'getcarbon.co',
  'fairmoney microfinance bank':                'fairmoney.io',
  'fairmoney microfinance bank ltd':            'fairmoney.io',
  'fairmoney':                                  'fairmoney.io',
  'renmoney microfinance bank':                 'renmoney.com',
  'renmoney mfb':                               'renmoney.com',
  'renmoney':                                   'renmoney.com',
  'aella mfb':                                  'aellaapp.com',
  'aella microfinance bank':                    'aellaapp.com',
  'page financials':                            'pagefinancials.com',
  'page mfb':                                   'pagefinancials.com',
  'mintyn digital bank':                        'mintyn.com',
  'mintyn bank':                                'mintyn.com',
  'mintyn':                                     'mintyn.com',
  'tangerine money':                            'tangerine.africa',
  'tangerine bank':                             'tangerine.africa',
  'eyowo':                                      'eyowo.com',
  'eyowo mfb':                                  'eyowo.com',
  'vfd microfinance bank':                      'vfdgroup.com',
  'vfd micro finance bank':                     'vfdgroup.com',
  'vfd mfb':                                    'vfdgroup.com',
  'nirsal microfinance bank':                   'nirsalmfb.com',

  // Payment Service Banks
  '9 payment service bank':                     '9psb.com.ng',
  '9 psb':                                      '9psb.com.ng',
  '9psb':                                       '9psb.com.ng',
  'hope psb':                                   'hopepsb.com',
  'hopepsb':                                    'hopepsb.com',
  'hope payment service bank':                  'hopepsb.com',
  'momo psb':                                   'momopsb.com',
  'momo payment service bank':                  'momopsb.com',
  'smartcash payment service bank':             'smartcashpsb.com',
  'smartcash psb':                              'smartcashpsb.com',
  'smartcash':                                  'smartcashpsb.com',
};

// ----- HTTP utilities -----

function fetchBuffer(url, { timeoutMs = 15000, redirects = 5 } = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 chaincola-bank-logo-downloader',
          Accept: 'image/png,image/jpeg,image/*;q=0.9,*/*;q=0.5',
        },
        timeout: timeoutMs,
      },
      (res) => {
        const status = res.statusCode || 0;
        if (status >= 300 && status < 400 && res.headers.location && redirects > 0) {
          res.resume();
          const next = new URL(res.headers.location, url).toString();
          fetchBuffer(next, { timeoutMs, redirects: redirects - 1 }).then(resolve, reject);
          return;
        }
        if (status !== 200) {
          res.resume();
          reject(new Error(`HTTP ${status} for ${url}`));
          return;
        }
        const ct = String(res.headers['content-type'] || '');
        if (!ct.startsWith('image/')) {
          res.resume();
          reject(new Error(`non-image "${ct}" for ${url}`));
          return;
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      },
    );
    req.on('timeout', () => req.destroy(new Error(`timeout for ${url}`)));
    req.on('error', reject);
  });
}

function fetchJson(url, { headers = {}, timeoutMs = 30000 } = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      { headers: { 'User-Agent': 'Mozilla/5.0', ...headers }, timeout: timeoutMs },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
          } catch (err) {
            reject(err);
          }
        });
        res.on('error', reject);
      },
    );
    req.on('timeout', () => req.destroy(new Error('json timeout')));
    req.on('error', reject);
  });
}

async function readEnvFile(p) {
  try {
    const raw = await readFile(p, 'utf8');
    const out = {};
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) out[m[1]] = m[2].trim();
    }
    return out;
  } catch {
    return {};
  }
}

async function loadFlutterwaveBanks() {
  if (existsSync(CACHE_PATH)) {
    try {
      const cached = JSON.parse(await readFile(CACHE_PATH, 'utf8'));
      if (Array.isArray(cached) && cached.length > 0) {
        console.log(`Using cached bank list (${cached.length} banks). Delete ${CACHE_PATH} to refresh.`);
        return cached;
      }
    } catch {}
  }
  const env = await readEnvFile(FLW_ENV_PATH);
  const key = process.env.FLUTTERWAVE_SECRET_KEY || env.FLUTTERWAVE_SECRET_KEY;
  if (!key) {
    throw new Error(`FLUTTERWAVE_SECRET_KEY not found. Set the env var or put it in ${FLW_ENV_PATH}.`);
  }
  console.log('Fetching live bank list from Flutterwave...');
  const json = await fetchJson('https://api.flutterwave.com/v3/banks/NG', {
    headers: { Authorization: `Bearer ${key}` },
  });
  const banks = Array.isArray(json?.data) ? json.data : [];
  if (banks.length === 0) throw new Error('Empty bank list from Flutterwave');
  await writeFile(CACHE_PATH, JSON.stringify(banks, null, 2));
  console.log(`Cached ${banks.length} banks at ${CACHE_PATH}`);
  return banks;
}

// ----- Name normalisation -----

function normalizeNameKey(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[\u2018\u2019'.,()\/\\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function safeFilename(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'bank';
}

// Try several normalisation variants of the bank name to look up in our maps.
function nameKeyVariants(rawName) {
  const base = normalizeNameKey(rawName);
  const variants = new Set([base]);

  // Strip common suffixes that vary across listings.
  const trimmedSuffixes = base
    .replace(/\b(plc|limited|ltd)\b\s*$/g, '')
    .trim();
  variants.add(trimmedSuffixes);

  // Strip "(...)" annotations.
  variants.add(base.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim());

  // For banks named "X Bank" also try "X" alone.
  const stripBank = base.replace(/\s*\bbank\b\s*/g, ' ').replace(/\s+/g, ' ').trim();
  if (stripBank) variants.add(stripBank);

  // For "X Microfinance Bank" / "X MFB" also try "X".
  const stripMfb = base
    .replace(/\b(microfinance bank|mfb|microfinance)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (stripMfb) variants.add(stripMfb);

  // For "X Payment Service Bank" also "X PSB" / "X".
  variants.add(
    base
      .replace(/\b(payment service bank|psb)\b/g, '')
      .replace(/\s+/g, ' ')
      .trim(),
  );

  return [...variants].filter(Boolean);
}

function lookupRegistrySlug(name) {
  for (const k of nameKeyVariants(name)) {
    if (NB_REGISTRY[k]) return NB_REGISTRY[k];
  }
  return null;
}

function lookupTrustedDomain(name) {
  for (const k of nameKeyVariants(name)) {
    if (TRUSTED_DOMAINS[k]) return TRUSTED_DOMAINS[k];
  }
  return null;
}

// For sub-products like "AccessMobile", "Stanbic IBTC @ease wallet", "Ecobank
// Xpress Account": look for a bank token *anywhere* in the name. We sort
// tokens longest-first so "stanbic ibtc" matches before "stanbic". Tokens are
// curated to be unambiguous brand identifiers — generic words like "bank"
// or "trust" are NOT included.
const PARENT_BRAND_TOKENS = [
  // multi-word brand identifiers first (longest match wins)
  ['stanbic ibtc',          { kind: 'nb',     value: 'stanbic-ibtc-bank' }],
  ['standard chartered',    { kind: 'nb',     value: 'standard-chartered-bank' }],
  ['titan trust',           { kind: 'domain', value: 'titantrustbank.com' }],
  ['premium trust',         { kind: 'domain', value: 'premiumtrustbank.com' }],
  ['premiumtrust',          { kind: 'domain', value: 'premiumtrustbank.com' }],
  ['first city monument',   { kind: 'nb',     value: 'first-city-monument-bank' }],
  ['guaranty trust',        { kind: 'nb',     value: 'guaranty-trust-bank' }],
  ['first bank',            { kind: 'nb',     value: 'first-bank-of-nigeria' }],
  ['union bank',            { kind: 'nb',     value: 'union-bank-of-nigeria' }],
  ['unity bank',            { kind: 'domain', value: 'unitybankng.com' }],
  ['ecobank xpress',        { kind: 'nb',     value: 'ecobank-nigeria' }],
  ['providus',              { kind: 'domain', value: 'providusbank.com' }],
  ['signature',             { kind: 'domain', value: 'signaturebankng.com' }],
  ['suntrust',              { kind: 'domain', value: 'suntrustng.com' }],
  ['parallex',              { kind: 'domain', value: 'parallexbank.com' }],
  ['optimus',               { kind: 'domain', value: 'optimusbank.com' }],
  ['globus',                { kind: 'nb',     value: 'globus-bank' }],
  ['polaris',               { kind: 'nb',     value: 'polaris-bank' }],
  ['fidelity',              { kind: 'nb',     value: 'fidelity-bank' }],
  // 'heritage' intentionally NOT a substring token: Heritage Bank is defunct
  // and "First Heritage MFB" is its own separate brand. Mapping any "heritage"
  // substring to the old commercial Heritage logo would be misleading.
  ['keystone',              { kind: 'nb',     value: 'keystone-bank' }],
  ['ecobank',               { kind: 'nb',     value: 'ecobank-nigeria' }],
  ['sterling',              { kind: 'nb',     value: 'sterling-bank' }],
  ['access',                { kind: 'nb',     value: 'access-bank' }],
  ['zenith',                { kind: 'nb',     value: 'zenith-bank' }],
  ['fcmb',                  { kind: 'nb',     value: 'first-city-monument-bank' }],
  ['gtbank',                { kind: 'nb',     value: 'guaranty-trust-bank' }],
  ['gtb',                   { kind: 'nb',     value: 'guaranty-trust-bank' }],
  ['wema',                  { kind: 'nb',     value: 'wema-bank' }],
  ['fbnquest',              { kind: 'domain', value: 'fbnquestmb.com' }],
  ['fbn',                   { kind: 'nb',     value: 'first-bank-of-nigeria' }],
  ['uba',                   { kind: 'nb',     value: 'united-bank-for-africa' }],
  ['lotus',                 { kind: 'nb',     value: 'lotus-bank' }],
  ['palmpay',               { kind: 'nb',     value: 'palmpay' }],
  ['palm pay',              { kind: 'nb',     value: 'palmpay' }],
  ['paystack',              { kind: 'domain', value: 'paystack.com' }],
  ['opay',                  { kind: 'nb',     value: 'paycom' }],
  ['paycom',                { kind: 'nb',     value: 'paycom' }],
  ['paga',                  { kind: 'nb',     value: 'paga' }],
  ['kuda',                  { kind: 'nb',     value: 'kuda-bank' }],
  ['moniepoint',            { kind: 'nb',     value: 'moniepoint-mfb-ng' }],
  ['sparkle',               { kind: 'nb',     value: 'sparkle-microfinance-bank' }],
  ['carbon',                { kind: 'domain', value: 'getcarbon.co' }],
  ['mintyn',                { kind: 'domain', value: 'mintyn.com' }],
  ['fairmoney',             { kind: 'domain', value: 'fairmoney.io' }],
  ['renmoney',              { kind: 'domain', value: 'renmoney.com' }],
  ['eyowo',                 { kind: 'domain', value: 'eyowo.com' }],
  ['tangerine',             { kind: 'domain', value: 'tangerine.africa' }],
  ['aella',                 { kind: 'domain', value: 'aellaapp.com' }],
  ['nirsal',                { kind: 'domain', value: 'nirsalmfb.com' }],
  ['9psb',                  { kind: 'domain', value: '9psb.com.ng' }],
  ['hopepsb',               { kind: 'domain', value: 'hopepsb.com' }],
  ['momo psb',              { kind: 'domain', value: 'momopsb.com' }],
  ['smartcash',             { kind: 'domain', value: 'smartcashpsb.com' }],
  ['coronation',            { kind: 'domain', value: 'coronationmb.com' }],
  ['nova merchant',         { kind: 'domain', value: 'novamb.com' }],
  ['jaiz',                  { kind: 'domain', value: 'jaizbankplc.com' }],
  ['citi bank',             { kind: 'nb',     value: 'citibank-nigeria' }],
  ['citibank',              { kind: 'nb',     value: 'citibank-nigeria' }],
  ['taj bank',              { kind: 'nb',     value: 'taj-bank' }],
  ['alat',                  { kind: 'nb',     value: 'alat-by-wema' }],
  ['asosavings',            { kind: 'nb',     value: 'asosavings' }],
  ['aso savings',           { kind: 'nb',     value: 'asosavings' }],
  ['cemcs',                 { kind: 'nb',     value: 'cemcs-microfinance-bank' }],
  ['ekondo',                { kind: 'nb',     value: 'ekondo-microfinance-bank' }],
  ['vfd',                   { kind: 'domain', value: 'vfdgroup.com' }],
  ['cbn',                   { kind: 'domain', value: 'cbn.gov.ng' }],
  ['central bank',          { kind: 'domain', value: 'cbn.gov.ng' }],
  ['page financials',       { kind: 'domain', value: 'pagefinancials.com' }],
];

function lookupParentBrand(name) {
  const haystack = ` ${normalizeNameKey(name)} `;
  for (const [token, target] of PARENT_BRAND_TOKENS) {
    // require token boundary (space / dash / hyphen) on both sides so we
    // don't match e.g. "fcmb" inside "afcmbs" — but allow concatenation like
    // "AccessMobile" -> "accessmobile" by also matching token at start of any word
    const pat = new RegExp(`(?:\\s|^)${escapeRegex(token)}(?:[\\s\\-]|$|[a-z])`, 'i');
    if (pat.test(haystack)) {
      // Be a bit stricter: require the first letter after the token to either
      // not be a letter (clean boundary) or to be uppercase in the original.
      if (looksLikeBrandToken(name, token)) return target;
    }
  }
  return null;
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function looksLikeBrandToken(rawName, token) {
  const norm = normalizeNameKey(rawName);
  // Whole-word: " token " or "<token>(end|punct)"
  const wordPat = new RegExp(`(?:^|\\s)${escapeRegex(token)}(?:\\s|$|[\\-_.,/])`, 'i');
  if (wordPat.test(norm)) return true;
  // Or the original name has the token exactly at a word boundary (handles
  // CamelCase like "AccessMobile").
  const lower = String(rawName || '').toLowerCase();
  const idx = lower.indexOf(token);
  if (idx === -1) return false;
  const before = idx === 0 ? '' : lower[idx - 1];
  const afterChar = lower[idx + token.length] || '';
  const isWordStart = idx === 0 || /[\s\-_.,/&]/.test(before);
  // Allow CamelCase: token at start AND followed by an uppercase letter.
  const orig = String(rawName || '');
  const origAfter = orig[idx + token.length] || '';
  const isCamelBoundary = idx > 0 && origAfter && origAfter === origAfter.toUpperCase() && /[A-Za-z]/.test(origAfter);
  return isWordStart || isCamelBoundary;
}

// ----- Per-bank download -----

async function tryNigerianBanks(slug) {
  try {
    const buf = await fetchBuffer(`https://nigerianbanks.xyz/logo/${slug}.png`);
    if (buf.length > PLACEHOLDER_BYTE_THRESHOLD) {
      return { ok: true, bytes: buf.length, source: `nb:${slug}`, buf };
    }
  } catch {}
  return null;
}

async function tryFavicon(domain) {
  try {
    const buf = await fetchBuffer(`https://www.google.com/s2/favicons?domain=${domain}&sz=128`);
    if (buf.length >= FAVICON_MIN_BYTES) {
      return { ok: true, bytes: buf.length, source: `favicon:${domain}`, buf };
    }
  } catch {}
  return null;
}

async function downloadOne(bank) {
  // Source 1: exact match against nigerianbanks.xyz registry (highest quality)
  const slug = lookupRegistrySlug(bank.name);
  if (slug) {
    const r = await tryNigerianBanks(slug);
    if (r) return r;
  }

  // Source 2: exact match against trusted domain map (Google favicon)
  const domain = lookupTrustedDomain(bank.name);
  if (domain) {
    const r = await tryFavicon(domain);
    if (r) return r;
  }

  // Source 3: parent-brand substring match for sub-products like
  // "AccessMobile", "Stanbic IBTC @ease wallet", "Ecobank Xpress Account".
  const parent = lookupParentBrand(bank.name);
  if (parent) {
    if (parent.kind === 'nb') {
      const r = await tryNigerianBanks(parent.value);
      if (r) return r;
    } else if (parent.kind === 'domain') {
      const r = await tryFavicon(parent.value);
      if (r) return r;
    }
  }

  return { ok: false };
}

async function main() {
  if (!existsSync(ASSETS_DIR)) await mkdir(ASSETS_DIR, { recursive: true });

  // Wipe any existing PNGs so we start from a clean slate.
  const existing = await readdir(ASSETS_DIR).catch(() => []);
  let wiped = 0;
  for (const f of existing) {
    if (f.endsWith('.png')) {
      try { await rm(join(ASSETS_DIR, f)); wiped++; } catch {}
    }
  }
  if (wiped > 0) console.log(`Wiped ${wiped} stale PNGs.`);

  const banks = await loadFlutterwaveBanks();
  console.log(`Resolving logos for ${banks.length} banks (strict mode)...`);

  const results = [];
  let saved = 0;
  let skipped = 0;

  const concurrency = 8;
  for (let i = 0; i < banks.length; i += concurrency) {
    const batch = banks.slice(i, i + concurrency);
    const out = await Promise.all(
      batch.map(async (bank) => ({ bank, result: await downloadOne(bank) })),
    );
    for (const { bank, result } of out) {
      if (result.ok) {
        const fname = `${String(bank.code).replace(/[^a-zA-Z0-9]/g, '_')}-${safeFilename(bank.name)}.png`;
        await writeFile(join(ASSETS_DIR, fname), result.buf);
        results.push({ bank, file: fname, source: result.source });
        saved++;
        console.log(`  ✓  ${String(bank.code).padEnd(8)} ${String(bank.name).padEnd(38)} ${result.source}`);
      } else {
        skipped++;
      }
    }
  }

  // Generate manifest.ts
  const lines = [];
  lines.push('// AUTO-GENERATED by chaincola/scripts/download-bank-logos.mjs');
  lines.push('// Do not edit by hand. Re-run the script to refresh logos.');
  lines.push('');
  lines.push(`// Strict-mode generation. ${saved} verified logos bundled.`);
  lines.push(`// ${skipped} of ${banks.length} banks fall back to the coloured initials avatar.`);
  lines.push('');
  lines.push('export const BUNDLED_BANK_LOGOS_BY_CODE: Record<string, number> = {');
  for (const r of results) {
    lines.push(`  ${JSON.stringify(String(r.bank.code))}: require('./${r.file}'),`);
  }
  lines.push('};');
  lines.push('');
  lines.push('export const BUNDLED_BANK_LOGOS_BY_NAME: Record<string, number> = {');
  for (const r of results) {
    const key = normalizeNameKey(r.bank.name);
    lines.push(`  ${JSON.stringify(key)}: require('./${r.file}'),`);
  }
  // Common name aliases that point to the same image as the canonical bank.
  // This lets runtime lookups by alternate name/spelling still hit a logo.
  const aliasGroups = [
    [['gtbank', 'gt bank', 'gtb', 'guaranty trust bank (gtb)'], 'guaranty trust bank'],
    [['uba'], 'united bank for africa'],
    [['fcmb'], 'first city monument bank'],
    [['first bank'], 'first bank of nigeria'],
    [['gt bank plc'], 'guaranty trust bank'],
    [['palm pay'], 'palmpay'],
    [['opay'], 'paycom'],
    [['stanbic ibtc'], 'stanbic ibtc bank'],
    [['standard chartered'], 'standard chartered bank'],
    [['union bank'], 'union bank of nigeria'],
    [['diamond bank'], 'access bank diamond'],
  ];
  const namedResults = new Map();
  for (const r of results) namedResults.set(normalizeNameKey(r.bank.name), r.file);
  for (const [aliases, canonical] of aliasGroups) {
    const file = namedResults.get(canonical);
    if (!file) continue;
    for (const alias of aliases) {
      lines.push(`  ${JSON.stringify(alias)}: require('./${file}'),`);
    }
  }
  lines.push('};');
  lines.push('');

  await writeFile(MANIFEST_PATH, lines.join('\n'));

  console.log('');
  console.log(`Saved ${saved} logos, skipped ${skipped} (will use coloured initials avatar at runtime).`);
  console.log(`Manifest: ${MANIFEST_PATH}`);
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
