#!/usr/bin/env node
/**
 * Check environment variables from .env.local
 * 
 * Usage:
 *   node scripts/check-env.js
 *   node scripts/check-env.js [VAR_NAME]
 */

const path = require('path');
const fs = require('fs');

// Load .env.local file
const envPath = path.join(__dirname, '../.env.local');

if (!fs.existsSync(envPath)) {
  console.error('❌ .env.local file not found at:', envPath);
  process.exit(1);
}

// Parse .env.local file
const envFile = fs.readFileSync(envPath, 'utf8');
const envVars = {};

envFile.split('\n').forEach(line => {
  const trimmed = line.trim();
  // Skip comments and empty lines
  if (!trimmed || trimmed.startsWith('#')) return;
  
  const match = trimmed.match(/^([^=:#]+)=(.*)$/);
  if (match) {
    const key = match[1].trim();
    let value = match[2].trim();
    // Remove quotes if present
    value = value.replace(/^["']|["']$/g, '');
    envVars[key] = value;
  }
});

// If specific variable requested, check only that one
const requestedVar = process.argv[2];
if (requestedVar) {
  const value = envVars[requestedVar];
  if (value) {
    console.log(`✅ ${requestedVar}: SET`);
    console.log(`   Value: ${value.substring(0, 50)}${value.length > 50 ? '...' : ''}`);
  } else {
    console.log(`❌ ${requestedVar}: MISSING`);
  }
  process.exit(value ? 0 : 1);
}

// Check common Supabase variables
console.log('📋 Environment Variables Check:\n');

const commonVars = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'NEXT_PUBLIC_APP_URL',
];

let allSet = true;

commonVars.forEach(varName => {
  const value = envVars[varName];
  if (value) {
    // Mask sensitive values
    let displayValue = value;
    if (varName.includes('KEY') || varName.includes('SECRET')) {
      displayValue = value.substring(0, 20) + '...' + value.substring(value.length - 10);
    } else if (value.length > 50) {
      displayValue = value.substring(0, 50) + '...';
    }
    console.log(`✅ ${varName}: SET`);
    console.log(`   ${displayValue}\n`);
  } else {
    console.log(`❌ ${varName}: MISSING\n`);
    allSet = false;
  }
});

// Show all other variables (non-sensitive)
const otherVars = Object.keys(envVars).filter(key => !commonVars.includes(key));
if (otherVars.length > 0) {
  console.log('📝 Other variables found:');
  otherVars.forEach(varName => {
    const value = envVars[varName];
    let displayValue = value;
    if (value.length > 60) {
      displayValue = value.substring(0, 60) + '...';
    }
    console.log(`   ${varName}=${displayValue}`);
  });
}

process.exit(allSet ? 0 : 1);
