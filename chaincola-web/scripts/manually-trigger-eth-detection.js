// Manually trigger Ethereum deposit detection
const SUPABASE_URL = 'https://slleojsdpctxhlsoyenr.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsbGVvanNkcGN0eGhsc295ZW5yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjE2NTk5MSwiZXhwIjoyMDgxNzQxOTkxfQ.Tx3O8EyKK3ZqcJef2CloZI4RTmDY9Ab59SXBgmubBsA';

async function triggerDetection() {
  try {
    console.log('🔄 Manually triggering Ethereum deposit detection...\n');
    
    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/detect-ethereum-deposits`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({}),
      }
    );
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Error:', response.status, errorText);
      return;
    }
    
    const result = await response.json();
    console.log('✅ Detection triggered successfully:');
    console.log(JSON.stringify(result, null, 2));
    
    if (result.data) {
      console.log('\n📊 Results:');
      console.log('   Wallets checked:', result.data.checked || 0);
      console.log('   Deposits found:', result.data.depositsFound || 0);
      console.log('   Deposits credited:', result.data.depositsCredited || 0);
      console.log('   Errors:', result.data.errors?.length || 0);
      
      if (result.data.errors && result.data.errors.length > 0) {
        console.log('\n❌ Errors:');
        result.data.errors.forEach((err, i) => {
          console.log(`   ${i + 1}. ${err}`);
        });
      }
      
      if (result.data.balanceReconciliation && result.data.balanceReconciliation.length > 0) {
        console.log('\n⚠️  Balance discrepancies:');
        result.data.balanceReconciliation.forEach((bal, i) => {
          console.log(`   ${i + 1}. Address: ${bal.address.substring(0, 10)}...`);
          console.log(`      On-chain: ${bal.onChainBalance} ETH`);
          console.log(`      Database: ${bal.databaseBalance} ETH`);
          console.log(`      Difference: ${bal.discrepancy} ETH`);
        });
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  }
}

triggerDetection();





