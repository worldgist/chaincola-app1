/**
 * Manually fix stuck SOL sell orders by calling execute-luno-sell
 * This script helps fix orders that are SOLD_ON_LUNO but NGN wasn't credited
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function fixStuckSells() {
  console.log('🔍 Finding stuck SOL sell orders...\n');

  // Find SOL sells that are SOLD_ON_LUNO but not COMPLETED
  const { data: stuckSells, error } = await supabase
    .from('sells')
    .select('*')
    .eq('status', 'SOLD_ON_LUNO')
    .not('sol_amount', 'is', null)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('❌ Error fetching sells:', error);
    return;
  }

  if (!stuckSells || stuckSells.length === 0) {
    console.log('✅ No stuck sell orders found');
    return;
  }

  console.log(`Found ${stuckSells.length} stuck SOL sell order(s)\n`);

  for (const sell of stuckSells) {
    console.log(`\n📋 Processing Sell ID: ${sell.sell_id}`);
    console.log(`   User ID: ${sell.user_id}`);
    console.log(`   SOL Amount: ${sell.sol_amount}`);
    console.log(`   NGN Received: ${sell.ngn_received || 'N/A'}`);
    console.log(`   Luno Order ID: ${sell.luno_order_id || 'N/A'}`);

    try {
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
          sell_id: sell.sell_id,
        }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        console.log(`   ✅ Successfully processed!`);
        console.log(`   NGN Credited: ₦${result.ngn_received || 'N/A'}`);
      } else {
        console.error(`   ❌ Failed: ${result.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error(`   ❌ Error processing: ${error.message}`);
    }
  }

  console.log('\n✅ Done processing stuck sell orders');
}

fixStuckSells().catch(console.error);







