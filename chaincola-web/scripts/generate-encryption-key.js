#!/usr/bin/env node
/**
 * Generate a secure encryption key for Supabase Edge Functions
 * 
 * Usage:
 *   node generate-encryption-key.js
 * 
 * This generates a cryptographically secure 32-byte (256-bit) key
 * encoded in base64 format, suitable for AES-256-GCM encryption.
 */

const crypto = require('crypto');

// Generate a secure 32-byte (256-bit) random key
const encryptionKey = crypto.randomBytes(32).toString('base64');

console.log('\n🔐 Generated Encryption Key:');
console.log('═══════════════════════════════════════════════════════════');
console.log(encryptionKey);
console.log('═══════════════════════════════════════════════════════════\n');

console.log('📋 To store this key in Supabase Edge Function secrets, run:\n');
console.log('   # For shared crypto encryption (recommended):');
console.log(`   supabase secrets set CRYPTO_ENCRYPTION_KEY="${encryptionKey}"\n`);
console.log('   # Or for asset-specific keys:');
console.log(`   supabase secrets set ETH_ENCRYPTION_KEY="${encryptionKey}"`);
console.log(`   supabase secrets set TRON_ENCRYPTION_KEY="${encryptionKey}"`);
console.log(`   supabase secrets set BTC_ENCRYPTION_KEY="${encryptionKey}"\n`);
console.log('⚠️  IMPORTANT: Save this key securely! You will need it to decrypt existing encrypted data.\n');
console.log('💡 Tip: Store this key in a password manager or secure vault.\n');

// Also output as environment variable format for easy copy-paste
console.log('📝 Environment variable format (for .env files):');
console.log('═══════════════════════════════════════════════════════════');
console.log(`CRYPTO_ENCRYPTION_KEY="${encryptionKey}"`);
console.log('═══════════════════════════════════════════════════════════\n');




