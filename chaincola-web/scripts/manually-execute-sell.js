/**
 * Script to manually trigger execute-luno-sell for a specific sell order
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://slleojsdpctxhlsoyenr.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsbGVvanNkcGN0eGhsc295ZW5yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjE2NTk5MSwiZXhwIjoyMDgxNzQxOTkxfQ.Tx3O8EyKK3ZqcJef2CloZI4RTmDY9Ab59SXBgmubBsA';

async function manuallyExecuteSell() {
  const sellId = '5beecd8b-a4d0-47df-add3-301eab958cd9';

  console.log(`\n🔍 Manually executing sell: ${sellId}\n`);

  // Call execute-luno-sell function
  const functionUrl = `${supabaseUrl}/functions/v1/execute-luno-sell`;
  
  const response = await fetch(functionUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${supabaseServiceKey}`,
      'apikey': supabaseServiceKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sell_id: sellId,
    }),
  });

  const result = await response.text();
  console.log(`Response Status: ${response.status}`);
  console.log(`Response:`, result);

  if (response.ok) {
    const data = JSON.parse(result);
    console.log(`\n✅ Sell executed successfully!`);
    console.log(`   NGN Received: ${data.ngn_received || 'N/A'}`);
    console.log(`   Status: ${data.status || 'N/A'}`);
  } else {
    console.log(`\n⚠️  Response indicates an issue`);
    try {
      const errorData = JSON.parse(result);
      console.log(`   Error: ${errorData.error || 'Unknown error'}`);
    } catch (e) {
      console.log(`   Raw response: ${result}`);
    }
  }
}

manuallyExecuteSell()
  .then(() => {
    console.log('\n✅ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  });


