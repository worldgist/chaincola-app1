// Script to trigger ETH balance sync for a specific wallet address
const SUPABASE_URL = 'https://slleojsdpctxhlsoyenr.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsbGVvanNkcGN0eGhsc295ZW5yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjE2NTk5MSwiZXhwIjoyMDgxNzQxOTkxfQ.Tx3O8EyKK3ZqcJef2CloZI4RTmDY9Ab59SXBgmubBsA';
const WALLET_ADDRESS = '0x9e3DBCd80E495f0b3eb34c5b133B5990FB9902D2';

async function triggerSync() {
  try {
    // First, find the user_id for this wallet address
    console.log('🔍 Finding user for wallet address:', WALLET_ADDRESS);
    
    const findUserResponse = await fetch(`${SUPABASE_URL}/rest/v1/crypto_wallets?address=eq.${WALLET_ADDRESS}&select=user_id`, {
      headers: {
        'apikey': SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      },
    });

    if (!findUserResponse.ok) {
      throw new Error(`Failed to find wallet: ${findUserResponse.status}`);
    }

    const wallets = await findUserResponse.json();
    
    if (!wallets || wallets.length === 0) {
      console.error('❌ Wallet not found in database');
      return;
    }

    const userId = wallets[0].user_id;
    console.log('✅ Found user_id:', userId);

    // Trigger the detect-ethereum-deposits function which will sync balances
    console.log('\n🔄 Triggering Ethereum deposit detection and balance sync...');
    
    const syncResponse = await fetch(`${SUPABASE_URL}/functions/v1/detect-ethereum-deposits`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    if (!syncResponse.ok) {
      const errorText = await syncResponse.text();
      throw new Error(`Sync failed: ${syncResponse.status} - ${errorText}`);
    }

    const syncResult = await syncResponse.json();
    console.log('\n✅ Sync completed!');
    console.log(JSON.stringify(syncResult, null, 2));

    // Also trigger the fix-all-eth-zero-amounts to ensure any zero amounts are fixed
    console.log('\n🔧 Triggering fix for zero-amount transactions...');
    
    const fixResponse = await fetch(`${SUPABASE_URL}/functions/v1/fix-all-eth-zero-amounts`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    if (fixResponse.ok) {
      const fixResult = await fixResponse.json();
      console.log('\n✅ Fix completed!');
      console.log(JSON.stringify(fixResult, null, 2));
    }

    // Check the balance after sync
    console.log('\n📊 Checking database balance after sync...');
    
    const balanceResponse = await fetch(`${SUPABASE_URL}/rest/v1/wallet_balances?user_id=eq.${userId}&currency=eq.ETH&select=balance,updated_at`, {
      headers: {
        'apikey': SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      },
    });

    if (balanceResponse.ok) {
      const balances = await balanceResponse.json();
      if (balances && balances.length > 0) {
        console.log(`\n💰 Database Balance: ${balances[0].balance} ETH`);
        console.log(`   Last Updated: ${balances[0].updated_at}`);
      } else {
        console.log('\n⚠️  No balance record found in database');
      }
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

triggerSync().then(() => {
  console.log('\n✅ All sync operations completed!');
}).catch(error => {
  console.error('Failed:', error);
  process.exit(1);
});





