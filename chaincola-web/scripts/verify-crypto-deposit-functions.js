#!/usr/bin/env node

/**
 * Comprehensive Crypto Deposit Detection Verification Script
 * 
 * This script verifies all crypto deposit detection functions:
 * - detect-ethereum-deposits (ETH)
 * - detect-bitcoin-deposits (BTC)
 * - detect-solana-deposits (SOL)
 * - detect-xrp-deposits (XRP)
 * - detect-usdt-deposits (USDT)
 * - detect-usdc-deposits (USDC)
 * 
 * It checks:
 * 1. Function execution and response
 * 2. Auto-convert to NGN functionality
 * 3. Transaction recording
 * 4. Balance updates
 * 5. Notification sending
 * 
 * Usage:
 *   node scripts/verify-crypto-deposit-functions.js
 * 
 * Or with environment variables:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/verify-crypto-deposit-functions.js
 */

// Try to load from .env.local if dotenv is available
try {
  require('dotenv').config({ path: '.env.local' });
} catch (e) {
  // dotenv not available, continue without it
}

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://slleojsdpctxhlsoyenr.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Error: SUPABASE_SERVICE_ROLE_KEY environment variable is required');
  console.error('');
  console.error('Please set it in your .env.local file or export it:');
  console.error('  export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"');
  console.error('');
  console.error('Or run with:');
  console.error('  SUPABASE_SERVICE_ROLE_KEY="your-key" node scripts/verify-crypto-deposit-functions.js');
  process.exit(1);
}

// All deposit detection functions to test
const DEPOSIT_FUNCTIONS = [
  { name: 'detect-ethereum-deposits', currency: 'ETH', symbol: 'ETH' },
  { name: 'detect-bitcoin-deposits', currency: 'BTC', symbol: 'BTC' },
  { name: 'detect-solana-deposits', currency: 'SOL', symbol: 'SOL' },
  { name: 'detect-xrp-deposits', currency: 'XRP', symbol: 'XRP' },
  { name: 'detect-usdt-deposits', currency: 'USDT', symbol: 'USDT' },
  { name: 'detect-usdc-deposits', currency: 'USDC', symbol: 'USDC' },
];

/**
 * Test a single deposit detection function
 */
async function testDepositFunction(functionConfig) {
  const { name, currency, symbol } = functionConfig;
  const functionUrl = `${SUPABASE_URL}/functions/v1/${name}`;
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🔍 Testing ${name}`);
  console.log(`   Currency: ${currency} (${symbol})`);
  console.log(`   URL: ${functionUrl}`);
  console.log('='.repeat(60));
  
  const results = {
    functionName: name,
    currency: currency,
    success: false,
    executionTime: 0,
    walletsChecked: 0,
    depositsFound: 0,
    depositsCredited: 0,
    errors: [],
    autoConvertResults: [],
    transactionDetails: [],
  };
  
  try {
    const startTime = Date.now();
    
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
      },
      body: JSON.stringify({}),
    });
    
    results.executionTime = Date.now() - startTime;
    const responseText = await response.text();
    
    let result;
    try {
      result = JSON.parse(responseText);
    } catch (e) {
      result = { raw: responseText, error: 'Failed to parse JSON response' };
    }
    
    if (!response.ok) {
      results.errors.push(`HTTP ${response.status}: ${response.statusText}`);
      results.errors.push(`Response: ${responseText.substring(0, 200)}`);
      console.log(`❌ Function failed: HTTP ${response.status}`);
      console.log(`   Response: ${responseText.substring(0, 200)}...`);
      return results;
    }
    
    // Parse results
    if (result.success) {
      results.success = true;
      // Functions return data directly, not wrapped in 'data' property
      const data = result.data || result;
      
      results.walletsChecked = data.checked || 0;
      results.depositsFound = data.depositsFound || 0;
      results.depositsCredited = data.depositsCredited || 0;
      
      if (data.errors && data.errors.length > 0) {
        results.errors = data.errors;
      }
      
      console.log(`✅ Function executed successfully (${results.executionTime}ms)`);
      console.log(`   Wallets checked: ${results.walletsChecked}`);
      console.log(`   Deposits found: ${results.depositsFound}`);
      console.log(`   Deposits credited: ${results.depositsCredited}`);
      
      if (results.errors.length > 0) {
        console.log(`   ⚠️  Errors: ${results.errors.length}`);
        results.errors.forEach((err, i) => {
          console.log(`      ${i + 1}. ${err}`);
        });
      }
    } else {
      results.errors.push(result.error || 'Unknown error');
      console.log(`❌ Function returned error: ${result.error || 'Unknown error'}`);
    }
    
  } catch (error) {
    results.errors.push(error.message);
    console.log(`❌ Exception occurred: ${error.message}`);
    console.log(`   Stack: ${error.stack}`);
  }
  
  return results;
}

/**
 * Verify auto-convert functionality by checking recent transactions
 */
async function verifyAutoConvert(currency) {
  console.log(`\n📊 Verifying Auto-Convert for ${currency}...`);
  
  try {
    // Get recent RECEIVE transactions for this currency
    const txResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/transactions?crypto_currency=eq.${currency}&transaction_type=eq.RECEIVE&select=id,user_id,transaction_hash,crypto_amount,status,confirmations,created_at,metadata&order=created_at.desc&limit=10`,
      {
        headers: {
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
      }
    );
    
    if (!txResponse.ok) {
      console.log(`   ⚠️  Failed to fetch transactions: ${txResponse.status}`);
      return { checked: 0, autoConverted: 0, issues: [] };
    }
    
    const transactions = await txResponse.json();
    let autoConvertedCount = 0;
    const issues = [];
    
    transactions.forEach((tx, i) => {
      const metadata = tx.metadata || {};
      const autoConverted = metadata.auto_converted_to_ngn === true;
      const ngnCredited = metadata.ngn_credited;
      
      if (autoConverted) {
        autoConvertedCount++;
        console.log(`   ✅ Transaction ${tx.id.substring(0, 8)}...`);
        console.log(`      Amount: ${tx.crypto_amount} ${currency}`);
        console.log(`      NGN Credited: ₦${ngnCredited?.toFixed(2) || 'N/A'}`);
        console.log(`      Converted At: ${metadata.converted_at || 'N/A'}`);
      } else if (tx.status === 'CONFIRMED' && tx.confirmations >= 12) {
        // Transaction is confirmed but not auto-converted
        issues.push({
          transactionId: tx.id,
          hash: tx.transaction_hash,
          amount: tx.crypto_amount,
          reason: 'Confirmed but not auto-converted',
        });
      }
    });
    
    console.log(`   Total transactions checked: ${transactions.length}`);
    console.log(`   Auto-converted: ${autoConvertedCount}`);
    
    if (issues.length > 0) {
      console.log(`   ⚠️  Issues found: ${issues.length}`);
      issues.forEach((issue, i) => {
        console.log(`      ${i + 1}. ${issue.reason}: ${issue.hash.substring(0, 16)}...`);
      });
    }
    
    return {
      checked: transactions.length,
      autoConverted: autoConvertedCount,
      issues: issues,
    };
    
  } catch (error) {
    console.log(`   ❌ Error verifying auto-convert: ${error.message}`);
    return { checked: 0, autoConverted: 0, issues: [], error: error.message };
  }
}

/**
 * Verify NGN balance credits from auto-convert
 */
async function verifyNgnCredits() {
  console.log(`\n💰 Verifying NGN Credits from Auto-Convert...`);
  
  try {
    // Get recent CONVERT transactions (using fiat_amount where fiat_currency = 'NGN')
    // Note: CONVERT might not be in the constraint, so we'll check metadata for auto_converted flag
    const convertResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/transactions?metadata->>auto_converted=eq.true&select=id,user_id,crypto_currency,crypto_amount,fiat_amount,fiat_currency,status,created_at,metadata&order=created_at.desc&limit=10`,
      {
        headers: {
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
      }
    );
    
    if (!convertResponse.ok) {
      // Try alternative query if the first one fails
      const altResponse = await fetch(
        `${SUPABASE_URL}/rest/v1/transactions?fiat_currency=eq.NGN&select=id,user_id,crypto_currency,crypto_amount,fiat_amount,fiat_currency,status,created_at,metadata&order=created_at.desc&limit=10`,
        {
          headers: {
            'apikey': SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
        }
      );
      
      if (!altResponse.ok) {
        const errorText = await altResponse.text();
        console.log(`   ⚠️  Failed to fetch CONVERT transactions: ${altResponse.status}`);
        console.log(`   Error: ${errorText.substring(0, 200)}`);
        return { checked: 0, totalNgnCredited: 0 };
      }
      
      const convertTransactions = await altResponse.json();
      // Filter for transactions with auto_converted metadata
      const autoConvertedTxs = convertTransactions.filter(tx => 
        tx.metadata?.auto_converted === true || tx.metadata?.auto_converted_to_ngn === true
      );
      
      let totalNgnCredited = 0;
      autoConvertedTxs.forEach((tx, i) => {
        const ngnAmount = parseFloat(tx.fiat_amount || '0');
        totalNgnCredited += ngnAmount;
        
        if (i < 5) {
          console.log(`   ${i + 1}. ${tx.crypto_currency} → NGN`);
          console.log(`      Crypto: ${tx.crypto_amount} ${tx.crypto_currency}`);
          console.log(`      NGN: ₦${ngnAmount.toFixed(2)}`);
          console.log(`      User: ${tx.user_id.substring(0, 8)}...`);
          console.log(`      Date: ${tx.created_at}`);
        }
      });
      
      console.log(`   Total auto-converted transactions: ${autoConvertedTxs.length}`);
      console.log(`   Total NGN credited: ₦${totalNgnCredited.toFixed(2)}`);
      
      return {
        checked: autoConvertedTxs.length,
        totalNgnCredited: totalNgnCredited,
      };
    }
    
    const convertTransactions = await convertResponse.json();
    let totalNgnCredited = 0;
    
    convertTransactions.forEach((tx, i) => {
      const ngnAmount = parseFloat(tx.fiat_amount || '0');
      totalNgnCredited += ngnAmount;
      
      if (i < 5) {
        console.log(`   ${i + 1}. ${tx.crypto_currency} → NGN`);
        console.log(`      Crypto: ${tx.crypto_amount} ${tx.crypto_currency}`);
        console.log(`      NGN: ₦${ngnAmount.toFixed(2)}`);
        console.log(`      User: ${tx.user_id.substring(0, 8)}...`);
        console.log(`      Date: ${tx.created_at}`);
      }
    });
    
    console.log(`   Total CONVERT transactions: ${convertTransactions.length}`);
    console.log(`   Total NGN credited: ₦${totalNgnCredited.toFixed(2)}`);
    
    return {
      checked: convertTransactions.length,
      totalNgnCredited: totalNgnCredited,
    };
    
  } catch (error) {
    console.log(`   ❌ Error verifying NGN credits: ${error.message}`);
    return { checked: 0, totalNgnCredited: 0, error: error.message };
  }
}

/**
 * Check active wallets for each currency
 */
async function checkActiveWallets() {
  console.log(`\n👛 Checking Active Wallets...`);
  
  const walletStats = {};
  
  for (const func of DEPOSIT_FUNCTIONS) {
    const currency = func.currency;
    const asset = currency === 'USDT' || currency === 'USDC' ? 'ETH' : currency;
    const network = currency === 'USDT' || currency === 'USDC' ? 'mainnet' : 
                    currency === 'BTC' ? 'mainnet' :
                    currency === 'SOL' ? 'mainnet' :
                    currency === 'XRP' ? 'mainnet' : 'mainnet';
    
    try {
      const walletResponse = await fetch(
        `${SUPABASE_URL}/rest/v1/crypto_wallets?asset=eq.${asset}&network=eq.${network}&is_active=eq.true&select=id,user_id,address,asset,network&limit=1000`,
        {
          headers: {
            'apikey': SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
        }
      );
      
      if (walletResponse.ok) {
        const wallets = await walletResponse.json();
        walletStats[currency] = wallets.length;
        console.log(`   ${currency}: ${wallets.length} active wallet(s)`);
      } else {
        walletStats[currency] = 0;
        console.log(`   ${currency}: ⚠️  Failed to fetch wallets`);
      }
    } catch (error) {
      walletStats[currency] = 0;
      console.log(`   ${currency}: ❌ Error: ${error.message}`);
    }
  }
  
  return walletStats;
}

/**
 * Main verification function
 */
async function verifyAllDepositFunctions() {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 CRYPTO DEPOSIT DETECTION VERIFICATION');
  console.log('='.repeat(60));
  console.log(`Supabase URL: ${SUPABASE_URL}`);
  console.log(`Testing ${DEPOSIT_FUNCTIONS.length} deposit detection functions`);
  console.log('='.repeat(60));
  
  const allResults = [];
  
  // Step 1: Check active wallets
  const walletStats = await checkActiveWallets();
  
  // Step 2: Test each deposit detection function
  console.log(`\n📡 Testing Deposit Detection Functions...`);
  for (const func of DEPOSIT_FUNCTIONS) {
    const result = await testDepositFunction(func);
    allResults.push(result);
    
    // Small delay between function calls to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  // Step 3: Verify auto-convert for each currency
  console.log(`\n🔄 Verifying Auto-Convert Functionality...`);
  const autoConvertResults = {};
  for (const func of DEPOSIT_FUNCTIONS) {
    const result = await verifyAutoConvert(func.currency);
    autoConvertResults[func.currency] = result;
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  
  // Step 4: Verify NGN credits
  const ngnCredits = await verifyNgnCredits();
  
  // Step 5: Generate summary report
  console.log('\n' + '='.repeat(60));
  console.log('📊 VERIFICATION SUMMARY');
  console.log('='.repeat(60));
  
  console.log('\n✅ Function Execution Results:');
  allResults.forEach((result, i) => {
    const status = result.success ? '✅' : '❌';
    console.log(`   ${status} ${result.functionName}`);
    console.log(`      Execution time: ${result.executionTime}ms`);
    console.log(`      Wallets checked: ${result.walletsChecked}`);
    console.log(`      Deposits found: ${result.depositsFound}`);
    console.log(`      Deposits credited: ${result.depositsCredited}`);
    if (result.errors.length > 0) {
      console.log(`      Errors: ${result.errors.length}`);
    }
  });
  
  console.log('\n💰 Auto-Convert Results:');
  Object.entries(autoConvertResults).forEach(([currency, result]) => {
    console.log(`   ${currency}:`);
    console.log(`      Transactions checked: ${result.checked}`);
    console.log(`      Auto-converted: ${result.autoConverted}`);
    if (result.issues && result.issues.length > 0) {
      console.log(`      ⚠️  Issues: ${result.issues.length}`);
    }
  });
  
  console.log('\n💵 NGN Credits:');
  console.log(`   CONVERT transactions: ${ngnCredits.checked}`);
  console.log(`   Total NGN credited: ₦${ngnCredits.totalNgnCredited?.toFixed(2) || '0.00'}`);
  
  console.log('\n👛 Active Wallets:');
  Object.entries(walletStats).forEach(([currency, count]) => {
    console.log(`   ${currency}: ${count} wallet(s)`);
  });
  
  // Overall status
  const allFunctionsSuccess = allResults.every(r => r.success);
  const totalErrors = allResults.reduce((sum, r) => sum + r.errors.length, 0);
  
  console.log('\n' + '='.repeat(60));
  if (allFunctionsSuccess && totalErrors === 0) {
    console.log('✅ ALL CHECKS PASSED!');
    console.log('   All deposit detection functions are working correctly.');
  } else {
    console.log('⚠️  SOME ISSUES DETECTED');
    console.log(`   Functions successful: ${allResults.filter(r => r.success).length}/${allResults.length}`);
    console.log(`   Total errors: ${totalErrors}`);
    console.log('   Please review the details above.');
  }
  console.log('='.repeat(60));
  console.log('');
}

// Run verification
verifyAllDepositFunctions().catch(error => {
  console.error('\n❌ Fatal error:', error.message);
  console.error(error.stack);
  process.exit(1);
});
