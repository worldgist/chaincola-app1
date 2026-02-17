// Manually trigger verification function for pending transactions
const SUPABASE_URL = 'https://slleojsdpctxhlsoyenr.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsbGVvanNkcGN0eGhsc295ZW5yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjE2NTk5MSwiZXhwIjoyMDgxNzQxOTkxfQ.Tx3O8EyKK3ZqcJef2CloZI4RTmDY9Ab59SXBgmubBsA';

async function manuallyVerifyPending() {
  try {
    console.log('🔄 Manually triggering verification functions...\n');
    
    // Trigger Ethereum verification
    console.log('1. Triggering verify-ethereum-send-transactions...');
    const ethResponse = await fetch(
      `${SUPABASE_URL}/functions/v1/verify-ethereum-send-transactions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({}),
      }
    );
    
    if (ethResponse.ok) {
      const ethResult = await ethResponse.json();
      console.log('   ✅ Ethereum verification result:', JSON.stringify(ethResult, null, 2));
    } else {
      const errorText = await ethResponse.text();
      console.log('   ❌ Error:', ethResponse.status, errorText);
    }
    
    // Trigger TRON verification
    console.log('\n2. Triggering verify-tron-transaction...');
    const tronResponse = await fetch(
      `${SUPABASE_URL}/functions/v1/verify-tron-transaction`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({}),
      }
    );
    
    if (tronResponse.ok) {
      const tronResult = await tronResponse.json();
      console.log('   ✅ TRON verification result:', JSON.stringify(tronResult, null, 2));
    } else {
      const errorText = await tronResponse.text();
      console.log('   ❌ Error:', tronResponse.status, errorText);
    }
    
    // Check pending transactions again
    console.log('\n3. Checking pending transactions after verification...');
    const txResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/transactions?transaction_type=eq.SEND&status=in.(PENDING,CONFIRMING)&select=id,crypto_currency,transaction_hash,status,created_at&order=created_at.desc&limit=10`,
      {
        headers: {
          'apikey': SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        },
      }
    );
    
    if (txResponse.ok) {
      const transactions = await txResponse.json();
      console.log(`   Found ${transactions.length} pending/confirming transactions`);
      transactions.forEach(tx => {
        console.log(`   - ${tx.id.substring(0, 8)}... ${tx.crypto_currency} ${tx.status} ${tx.transaction_hash ? tx.transaction_hash.substring(0, 20) + '...' : 'NO HASH'}`);
      });
    }
    
    console.log('\n✅ Verification complete!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  }
}

manuallyVerifyPending();





