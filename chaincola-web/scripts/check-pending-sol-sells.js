const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://slleojsdpctxhlsoyenr.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsbGVvanNkcGN0eGhsc295ZW5yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjE2NTk5MSwiZXhwIjoyMDgxNzQxOTkxfQ.Tx3O8EyKK3ZqcJef2CloZI4RTmDY9Ab59SXBgmubBsA';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkPendingSells() {
  try {
    console.log(`🔍 Checking pending SOL sells...\n`);
    
    // Find all SOL_SENT sell orders that need to be executed
    const { data: sells, error: sellsError } = await supabase
      .from('sells')
      .select('*')
      .not('sol_amount', 'is', null)
      .in('status', ['SOL_SENT', 'SOL_CREDITED_ON_LUNO'])
      .not('sol_tx_hash', 'is', null)
      .order('created_at', { ascending: false })
      .limit(10);
    
    if (sellsError) {
      console.error('❌ Error fetching sells:', sellsError);
      return;
    }
    
    if (!sells || sells.length === 0) {
      console.log('✅ No pending SOL_SENT orders found');
      
      // Check for other statuses
      const { data: allSells } = await supabase
        .from('sells')
        .select('*')
        .not('sol_amount', 'is', null)
        .order('created_at', { ascending: false })
        .limit(5);
      
      if (allSells && allSells.length > 0) {
        console.log(`\n📋 Recent sell orders:`);
        allSells.forEach((sell, idx) => {
          console.log(`\n   ${idx + 1}. Sell ID: ${sell.sell_id}`);
          console.log(`      Status: ${sell.status}`);
          console.log(`      SOL Amount: ${sell.sol_amount}`);
          console.log(`      TX Hash: ${sell.sol_tx_hash || 'N/A'}`);
          console.log(`      Created: ${sell.created_at}`);
        });
      }
      return;
    }
    
    console.log(`📋 Found ${sells.length} pending SOL_SENT/SOL_CREDITED_ON_LUNO orders:\n`);
    
    for (const sell of sells) {
      console.log(`\n🔍 Sell ID: ${sell.sell_id}`);
      console.log(`   Status: ${sell.status}`);
      console.log(`   SOL Amount: ${sell.sol_amount}`);
      console.log(`   SOL TX Hash: ${sell.sol_tx_hash}`);
      console.log(`   Created: ${sell.created_at}`);
      console.log(`   Updated: ${sell.updated_at}`);
      
      // Get user email
      const { data: authUsers } = await supabase.auth.admin.listUsers();
      const authUser = authUsers?.users?.find(u => u.id === sell.user_id);
      console.log(`   User: ${authUser?.email || sell.user_id}`);
      
      // Check if NGN was credited
      const { data: ngnTx } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', sell.user_id)
        .eq('transaction_type', 'SELL')
        .not('fiat_amount', 'is', null)
        .eq('fiat_currency', 'NGN')
        .or(`metadata->>sell_id.eq.${sell.sell_id},transaction_hash.eq.${sell.sol_tx_hash}`)
        .limit(1);
      
      if (ngnTx && ngnTx.length > 0) {
        console.log(`   ✅ NGN already credited: ₦${ngnTx[0].fiat_amount}`);
      } else {
        console.log(`   ⚠️ NGN NOT credited yet`);
        
        // Try to execute the sell
        console.log(`\n📡 Attempting to execute sell on Luno...`);
        const functionUrl = `${supabaseUrl}/functions/v1/execute-luno-sell`;
        
        try {
          const response = await fetch(functionUrl, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${supabaseServiceKey}`,
              'apikey': supabaseServiceKey,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              sell_id: sell.sell_id,
            }),
          });
          
          if (!response.ok) {
            const errorText = await response.text();
            console.error(`   ❌ Error: ${response.status}`, errorText);
          } else {
            const result = await response.json();
            console.log(`   ✅ Result:`, JSON.stringify(result, null, 2));
          }
        } catch (error) {
          console.error(`   ❌ Error calling execute-luno-sell:`, error.message);
        }
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  }
}

checkPendingSells();


