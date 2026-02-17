/**
 * Flutterwave Configuration
 * 
 * This module handles Flutterwave API configuration
 * Keys can be set via environment variables or fetched from Supabase
 */

require('dotenv').config();

// Flutterwave API Configuration
const FLUTTERWAVE_CONFIG = {
  secretKey: process.env.FLUTTERWAVE_SECRET_KEY,
  publicKey: process.env.FLUTTERWAVE_PUBLIC_KEY,
  secretHash: process.env.FLUTTERWAVE_SECRET_HASH, // For webhook verification
  apiBase: process.env.FLUTTERWAVE_API_BASE || 'https://api.flutterwave.com/v3',
  callbackUrl: process.env.FLUTTERWAVE_TRANSFER_CALLBACK_URL || '',
  // Determine if using test or live keys
  isTestMode: process.env.FLUTTERWAVE_SECRET_KEY?.includes('test') || 
              process.env.FLUTTERWAVE_SECRET_KEY?.includes('FLWSECK_TEST') ||
              process.env.NODE_ENV === 'development'
};

/**
 * Validate Flutterwave configuration
 */
function validateConfig() {
  const errors = [];

  if (!FLUTTERWAVE_CONFIG.secretKey) {
    errors.push('FLUTTERWAVE_SECRET_KEY is required');
  }

  if (!FLUTTERWAVE_CONFIG.publicKey) {
    errors.push('FLUTTERWAVE_PUBLIC_KEY is required');
  }

  if (errors.length > 0) {
    throw new Error(`Flutterwave configuration error: ${errors.join(', ')}`);
  }

  return true;
}

/**
 * Get Flutterwave API headers
 */
function getHeaders() {
  return {
    'Authorization': `Bearer ${FLUTTERWAVE_CONFIG.secretKey}`,
    'Content-Type': 'application/json'
  };
}

/**
 * Get Flutterwave API base URL
 */
function getApiBase() {
  return FLUTTERWAVE_CONFIG.apiBase;
}

/**
 * Get secret hash for webhook verification
 */
function getSecretHash() {
  return FLUTTERWAVE_CONFIG.secretHash;
}

/**
 * Verify webhook signature
 */
function verifyWebhookSignature(payload, signature) {
  if (!FLUTTERWAVE_CONFIG.secretHash) {
    console.warn('⚠️  FLUTTERWAVE_SECRET_HASH not set, skipping webhook verification');
    return true; // Allow if hash not configured
  }

  // Flutterwave webhook verification logic
  // The signature should match the secret hash
  return signature === FLUTTERWAVE_CONFIG.secretHash;
}

module.exports = {
  FLUTTERWAVE_CONFIG,
  validateConfig,
  getHeaders,
  getApiBase,
  getSecretHash,
  verifyWebhookSignature
};
