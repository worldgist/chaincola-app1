// Helpers for resolving a logo for a Nigerian bank.
//
// Resolution order (tried in this order by <BankLogo>):
//   0. A bundled PNG asset shipped with the app
//      (chaincola/assets/banks/manifest.ts — populated by
//      chaincola/scripts/download-bank-logos.mjs).
//   1. nigerianbanks.xyz CDN — high-quality PNGs for ~32 well-known banks.
//   2. Google favicon API — works for almost any indexed business domain.
//   3. Coloured initials avatar (rendered by <BankLogo>).
//
// Prefer step 0 because it works offline, has zero perceived latency, and
// can never break due to a CDN outage. Re-run the downloader script when
// adding new banks to refresh the manifest.

import {
  BUNDLED_BANK_LOGOS_BY_CODE,
  BUNDLED_BANK_LOGOS_BY_NAME,
} from '@/assets/banks/manifest';

export type BankLogoInput = {
  code?: string | null;
  name?: string | null;
  logo?: string | null;
};

type RegistryEntry = { code: string; name: string; slug: string };

// ---- Source 1: nigerianbanks.xyz registry (verified PNG logos only) ----

const REGISTRY: RegistryEntry[] = [
  { code: '044',    name: 'Access Bank',                slug: 'access-bank' },
  { code: '063',    name: 'Access Bank (Diamond)',      slug: 'access-bank-diamond' },
  { code: '035A',   name: 'ALAT by WEMA',               slug: 'alat-by-wema' },
  { code: '401',    name: 'ASO Savings and Loans',      slug: 'asosavings' },
  { code: '50823',  name: 'CEMCS Microfinance Bank',    slug: 'cemcs-microfinance-bank' },
  { code: '023',    name: 'Citibank Nigeria',           slug: 'citibank-nigeria' },
  { code: '050',    name: 'Ecobank Nigeria',            slug: 'ecobank-nigeria' },
  { code: '562',    name: 'Ekondo Microfinance Bank',   slug: 'ekondo-microfinance-bank' },
  { code: '070',    name: 'Fidelity Bank',              slug: 'fidelity-bank' },
  { code: '011',    name: 'First Bank of Nigeria',      slug: 'first-bank-of-nigeria' },
  { code: '214',    name: 'First City Monument Bank',   slug: 'first-city-monument-bank' },
  { code: '00103',  name: 'Globus Bank',                slug: 'globus-bank' },
  { code: '058',    name: 'Guaranty Trust Bank',        slug: 'guaranty-trust-bank' },
  { code: '030',    name: 'Heritage Bank',              slug: 'heritage-bank' },
  { code: '082',    name: 'Keystone Bank',              slug: 'keystone-bank' },
  { code: '50211',  name: 'Kuda Bank',                  slug: 'kuda-bank' },
  { code: '303',    name: 'Lotus Bank',                 slug: 'lotus-bank' },
  { code: '50515',  name: 'Moniepoint MFB',             slug: 'moniepoint-mfb-ng' },
  { code: '999992', name: 'OPay',                       slug: 'paycom' },
  { code: '100004', name: 'PayCom',                     slug: 'paycom' },
  { code: '327',    name: 'Paga',                       slug: 'paga' },
  { code: '999991', name: 'PalmPay',                    slug: 'palmpay' },
  { code: '076',    name: 'Polaris Bank',               slug: 'polaris-bank' },
  { code: '51310',  name: 'Sparkle Microfinance Bank',  slug: 'sparkle-microfinance-bank' },
  { code: '221',    name: 'Stanbic IBTC Bank',          slug: 'stanbic-ibtc-bank' },
  { code: '068',    name: 'Standard Chartered Bank',    slug: 'standard-chartered-bank' },
  { code: '232',    name: 'Sterling Bank',              slug: 'sterling-bank' },
  { code: '302',    name: 'TAJ Bank',                   slug: 'taj-bank' },
  { code: '032',    name: 'Union Bank of Nigeria',      slug: 'union-bank-of-nigeria' },
  { code: '033',    name: 'United Bank For Africa',     slug: 'united-bank-for-africa' },
  { code: '035',    name: 'Wema Bank',                  slug: 'wema-bank' },
  { code: '057',    name: 'Zenith Bank',                slug: 'zenith-bank' },
];

const REGISTRY_BASE = 'https://nigerianbanks.xyz/logo';

const REGISTRY_CODE_TO_SLUG: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const r of REGISTRY) out[r.code] = r.slug;
  return out;
})();

const REGISTRY_NAME_TO_SLUG: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const r of REGISTRY) out[normalizeName(r.name)] = r.slug;
  // Common Flutterwave-returned aliases that don't match registry name exactly.
  const aliases: Array<[string, string]> = [
    ['GTBank',                       'guaranty-trust-bank'],
    ['GT Bank',                      'guaranty-trust-bank'],
    ['GTB',                          'guaranty-trust-bank'],
    ['Guaranty Trust',               'guaranty-trust-bank'],
    ['UBA',                          'united-bank-for-africa'],
    ['UBA Plc',                      'united-bank-for-africa'],
    ['FCMB',                         'first-city-monument-bank'],
    ['FBN',                          'first-bank-of-nigeria'],
    ['FBNQuest',                     'first-bank-of-nigeria'],
    ['First Bank',                   'first-bank-of-nigeria'],
    ['FirstBank',                    'first-bank-of-nigeria'],
    ['Firstbank',                    'first-bank-of-nigeria'],
    ['Diamond Bank',                 'access-bank-diamond'],
    ['Stanbic IBTC',                 'stanbic-ibtc-bank'],
    ['Stanbic',                      'stanbic-ibtc-bank'],
    ['Zenith',                       'zenith-bank'],
    ['Access',                       'access-bank'],
    ['Access Diamond',               'access-bank-diamond'],
    ['Sterling',                     'sterling-bank'],
    ['Wema',                         'wema-bank'],
    ['Polaris',                      'polaris-bank'],
    ['Fidelity',                     'fidelity-bank'],
    ['Heritage',                     'heritage-bank'],
    ['Ecobank',                      'ecobank-nigeria'],
    ['EcoBank',                      'ecobank-nigeria'],
    ['Eco Bank',                     'ecobank-nigeria'],
    ['Keystone',                     'keystone-bank'],
    ['Citibank',                     'citibank-nigeria'],
    ['Citi Bank',                    'citibank-nigeria'],
    ['Standard Chartered',           'standard-chartered-bank'],
    ['Globus',                       'globus-bank'],
    ['Lotus',                        'lotus-bank'],
    ['TAJ',                          'taj-bank'],
    ['TajBank',                      'taj-bank'],
    ['Kuda',                         'kuda-bank'],
    ['Kuda Microfinance Bank',       'kuda-bank'],
    ['Paga',                         'paga'],
    ['PalmPay',                      'palmpay'],
    ['Palm Pay',                     'palmpay'],
    ['OPay Digital Services',        'paycom'],
    ['Opay',                         'paycom'],
    ['O Pay',                        'paycom'],
    ['Moniepoint Microfinance Bank', 'moniepoint-mfb-ng'],
    ['Moniepoint',                   'moniepoint-mfb-ng'],
    ['Moniepoint MFB',               'moniepoint-mfb-ng'],
    ['Sparkle MFB',                  'sparkle-microfinance-bank'],
    ['Sparkle',                      'sparkle-microfinance-bank'],
    ['ALAT',                         'alat-by-wema'],
    ['Alat',                         'alat-by-wema'],
    ['ASO Savings',                  'asosavings'],
    ['Aso Savings',                  'asosavings'],
    ['CEMCS',                        'cemcs-microfinance-bank'],
    ['Ekondo',                       'ekondo-microfinance-bank'],
  ];
  for (const [n, s] of aliases) out[normalizeName(n)] = s;
  return out;
})();

// ---- Source 2: Google favicon API for the long tail ----
//
// Map normalised bank-key -> domain. Both `code` and `name` keys are folded
// into the same lookup table so either an exact CBN code match or a name
// alias hits the same record.

const DOMAIN_BY_KEY: Record<string, string> = {};

function addDomain(keys: string[], domain: string) {
  for (const k of keys) DOMAIN_BY_KEY[normalizeKey(k)] = domain;
}

// Commercial banks
addDomain(['044', 'Access Bank', 'Access', 'Access Bank Plc'],          'accessbankplc.com');
addDomain(['063', 'Access Bank Diamond', 'Diamond Bank'],               'accessbankplc.com');
addDomain(['023', 'Citibank Nigeria', 'Citibank'],                      'citigroup.com');
addDomain(['050', 'Ecobank Nigeria', 'Ecobank', 'EcoBank'],             'ecobank.com');
addDomain(['070', 'Fidelity Bank', 'Fidelity'],                         'fidelitybank.ng');
addDomain(['011', 'First Bank of Nigeria', 'First Bank', 'FirstBank'],  'firstbanknigeria.com');
addDomain(['214', 'First City Monument Bank', 'FCMB'],                  'fcmb.com');
addDomain(['00103', 'Globus Bank', 'Globus'],                           'globusbank.com');
addDomain(['058', 'Guaranty Trust Bank', 'GTBank', 'GTB', 'GT Bank'],   'gtbank.com');
addDomain(['030', 'Heritage Bank', 'Heritage'],                         'hbng.com');
addDomain(['301', 'Jaiz Bank', 'Jaiz'],                                 'jaizbankplc.com');
addDomain(['082', 'Keystone Bank', 'Keystone'],                         'keystonebankng.com');
addDomain(['303', 'Lotus Bank', 'Lotus'],                               'lotusbank.com');
addDomain(['107', 'Optimus Bank', 'Optimus'],                           'optimusbank.com');
addDomain(['526', 'Parallex Bank', 'Parallex'],                         'parallexbank.com');
addDomain(['076', 'Polaris Bank', 'Polaris'],                           'polarisbanklimited.com');
addDomain(['105', 'Premium Trust Bank', 'PremiumTrust'],                'premiumtrustbank.com');
addDomain(['101', 'Providus Bank', 'Providus'],                         'providusbank.com');
addDomain(['106', 'Signature Bank', 'Signature'],                       'signaturebankng.com');
addDomain(['221', 'Stanbic IBTC Bank', 'Stanbic IBTC', 'Stanbic'],      'stanbicibtcbank.com');
addDomain(['068', 'Standard Chartered Bank', 'Standard Chartered'],     'sc.com');
addDomain(['232', 'Sterling Bank', 'Sterling'],                         'sterling.ng');
addDomain(['100', 'SunTrust Bank', 'Suntrust'],                         'suntrustng.com');
addDomain(['302', 'TAJ Bank', 'TAJBank', 'TAJ'],                        'tajbank.com');
addDomain(['102', 'Titan Trust Bank', 'Titan Trust'],                   'titantrustbank.com');
addDomain(['032', 'Union Bank of Nigeria', 'Union Bank'],               'unionbankng.com');
addDomain(['033', 'United Bank For Africa', 'UBA', 'UBA Plc'],          'ubagroup.com');
addDomain(['215', 'Unity Bank', 'Unity'],                               'unitybankng.com');
addDomain(['035', 'Wema Bank', 'Wema'],                                 'wemabank.com');
addDomain(['057', 'Zenith Bank', 'Zenith'],                             'zenithbank.com');
addDomain(['035A', 'ALAT by WEMA', 'ALAT', 'Alat'],                     'alat.ng');
addDomain(['023', 'Coronation Merchant Bank'],                          'coronationmb.com');

// Microfinance / digital / fintech banks
addDomain(['50211', 'Kuda Bank', 'Kuda', 'Kuda Microfinance Bank'],     'kuda.com');
addDomain(['50515', 'Moniepoint MFB', 'Moniepoint', 'Moniepoint Microfinance Bank'], 'moniepoint.com');
addDomain(['51310', 'Sparkle Microfinance Bank', 'Sparkle MFB', 'Sparkle'], 'sparkle.ng');
addDomain(['565', 'Carbon', 'OneFi', 'One Finance'],                    'getcarbon.co');
addDomain(['100022', 'TCF MFB', 'TCF Microfinance Bank'],               'tcfmfb.com');
addDomain(['NIRSAL', 'NIRSAL Microfinance Bank', 'NIRSAL MFB'],         'nirsalmfb.com');
addDomain(['VFD', 'VFD Microfinance Bank', 'VFD MFB'],                  'vfdgroup.com');
addDomain(['Mintyn', 'Mintyn Bank', 'Mintyn Digital Bank'],             'mintyn.com');
addDomain(['Eyowo'],                                                     'eyowo.com');
addDomain(['Tangerine', 'Tangerine Money', 'Tangerine MFB'],            'tangerine.africa');
addDomain(['FairMoney', 'FairMoney MFB'],                               'fairmoney.io');
addDomain(['Renmoney', 'Renmoney MFB'],                                 'renmoney.com');
addDomain(['Branch', 'Branch International'],                           'branch.co');
addDomain(['Aella', 'Aella Credit', 'Aella MFB'],                       'aellaapp.com');
addDomain(['Cowrywise'],                                                 'cowrywise.com');
addDomain(['Risevest', 'Rise'],                                          'risevest.com');
addDomain(['PiggyVest', 'Piggyvest'],                                    'piggyvest.com');
addDomain(['Page Financials', 'Page'],                                   'pagefinancials.com');
addDomain(['Rosabon', 'Rosabon Financial Services'],                     'rosabon-finance.com');
addDomain(['Bowen Microfinance Bank', 'Bowen MFB'],                      'bowenmfb.com');
addDomain(['Hasal Microfinance Bank', 'Hasal MFB'],                      'hasalmfb.com');
addDomain(['CEMCS Microfinance Bank', 'CEMCS MFB'],                      'cemcsmfbank.com');
addDomain(['Ekondo Microfinance Bank', 'Ekondo MFB'],                    'ekondomfb.com');

// Payment Service Banks
addDomain(['120001', '9 Payment Service Bank', '9 PSB', '9PSB'],         '9psb.com.ng');
addDomain(['120002', 'HopePSB', 'Hope PSB'],                             'hopepsb.com');
addDomain(['120003', 'MoMo PSB', 'Momo PSB', 'MTN MoMo PSB'],            'momopsb.com');
addDomain(['120004', 'SmartCash PSB', 'SmartCashPSB'],                   'smartcashpsb.com');

// Wallets / digital banks
addDomain(['327', 'Paga'],                                               'mypaga.com');
addDomain(['999991', 'PalmPay', 'Palm Pay'],                             'palmpay.com');
addDomain(['999992', 'OPay', 'Opay', 'OPay Digital Services'],           'opaycheckout.com');
addDomain(['100004', 'PayCom'],                                          'opaycheckout.com');

// ---- public API ----

// Returns a require()-d local asset module ID if we have a bundled logo for
// this bank, else null.
export function getBundledBankLogo(bank: BankLogoInput): number | null {
  if (!bank) return null;
  if (bank.code) {
    const byCode = BUNDLED_BANK_LOGOS_BY_CODE[bank.code];
    if (byCode != null) return byCode;
  }
  if (bank.name) {
    const key = normalizeKey(bank.name).replace(/[\u2018\u2019'.,()\/\\]/g, '');
    const byName = BUNDLED_BANK_LOGOS_BY_NAME[key];
    if (byName != null) return byName;
  }
  return null;
}

export function getBankLogoCandidates(bank: BankLogoInput): string[] {
  const candidates: string[] = [];
  const seen = new Set<string>();
  const push = (url: string | null | undefined) => {
    if (!url) return;
    if (seen.has(url)) return;
    seen.add(url);
    candidates.push(url);
  };

  if (bank?.logo && typeof bank.logo === 'string' && bank.logo.startsWith('http')) {
    push(bank.logo);
  }

  // Source 1: nigerianbanks.xyz registry
  const slug = lookupRegistrySlug(bank);
  if (slug) push(`${REGISTRY_BASE}/${slug}.png`);

  // Source 2: Google favicon by domain
  const domain = lookupDomain(bank);
  if (domain) push(`https://www.google.com/s2/favicons?domain=${domain}&sz=128`);

  return candidates;
}

// Backwards-compatible single-URL API (used by older callers).
export function getBankLogoUrl(bank: BankLogoInput): string | null {
  const list = getBankLogoCandidates(bank);
  return list.length ? list[0] : null;
}

function lookupRegistrySlug(bank: BankLogoInput): string | null {
  if (!bank) return null;
  if (bank.code && REGISTRY_CODE_TO_SLUG[bank.code]) return REGISTRY_CODE_TO_SLUG[bank.code];
  if (bank.name) {
    const k = normalizeName(bank.name);
    if (REGISTRY_NAME_TO_SLUG[k]) return REGISTRY_NAME_TO_SLUG[k];
  }
  return null;
}

function lookupDomain(bank: BankLogoInput): string | null {
  if (!bank) return null;
  if (bank.code) {
    const k = normalizeKey(bank.code);
    if (DOMAIN_BY_KEY[k]) return DOMAIN_BY_KEY[k];
  }
  if (bank.name) {
    const k = normalizeKey(bank.name);
    if (DOMAIN_BY_KEY[k]) return DOMAIN_BY_KEY[k];
  }
  return null;
}

function normalizeKey(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[\u2018\u2019'.,()\/\\]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\s/g, '-');
}

// ---- Initials avatar ----

const FALLBACK_COLOURS = [
  '#6B46C1', '#9333EA', '#2563EB', '#0EA5E9', '#10B981',
  '#F59E0B', '#F97316', '#EF4444', '#EC4899', '#14B8A6',
];

export function getBankAvatarColour(bank: BankLogoInput): string {
  const seed = (bank.code || bank.name || '').trim();
  if (!seed) return FALLBACK_COLOURS[0];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  const idx = Math.abs(hash) % FALLBACK_COLOURS.length;
  return FALLBACK_COLOURS[idx];
}

export function getBankInitials(bank: BankLogoInput): string {
  const name = (bank.name || '').trim();
  if (!name) return '?';
  const cleaned = name.replace(/\b(bank|microfinance|mfb|nigeria|plc|ltd|limited|psb|services?|payment|trust|merchant|digital)\b/gi, '').trim();
  const target = cleaned || name;
  const words = target.split(/\s+/).filter(Boolean);
  if (words.length === 0) return name.slice(0, 2).toUpperCase();
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}
