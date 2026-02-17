/**
 * Script to set main wallet addresses in system_wallets table
 * Run with: node scripts/set-main-wallet-addresses.js
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const MAIN_WALLET_ADDRESSES = {
  btc_main_address: 'bc1qyq3ass2a8eqxznl5qkqzlhl6lg6lxyg4fnnqvs',
  eth_main_address: '0x51A04925c2EAE355236C3196872A46621F7FfE30',
  sol_main_address: 'CZsQKrVwmhETVW58JrgZbK8qFkuL5aGxLN47ZLw9hnAi',
  xrp_main_address: 'rLRQpZbg6k6x9NkVxAhfhsA1XdPofE6YLV',
  usdt_eth_main_address: '0x51A04925c2EAE355236C3196872A46621F7FfE30',
  usdt_tron_main_address: 'TLFvwSfRQvAfwN84iv92hnrXsYEGLYNUL7',
  usdc_eth_main_address: '0x51A04925c2EAE355236C3196872A46621F7FfE30',
  usdc_sol_main_address: 'CZsQKrVwmhETVW58JrgZbK8qFkuL5aGxLN47ZLw9hnAi',
};

async function setMainWalletAddresses() {
  try {
    console.log('🔐 Setting main wallet addresses...\n');

    const { data, error } = await supabase
      .from('system_wallets')
      .update(MAIN_WALLET_ADDRESSES)
      .eq('id', 1)
      .select();

    if (error) {
      console.error('❌ Error updating main wallet addresses:', error);
      return;
    }

    console.log('✅ Main wallet addresses updated successfully!\n');
    console.log('📋 Updated addresses:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Bitcoin (BTC):        ${MAIN_WALLET_ADDRESSES.btc_main_address}`);
    console.log(`Ethereum (ETH):       ${MAIN_WALLET_ADDRESSES.eth_main_address}`);
    console.log(`Solana (SOL):        ${MAIN_WALLET_ADDRESSES.sol_main_address}`);
    console.log(`XRP:                 ${MAIN_WALLET_ADDRESSES.xrp_main_address}`);
    console.log(`USDT (Ethereum):     ${MAIN_WALLET_ADDRESSES.usdt_eth_main_address}`);
    console.log(`USDT (TRON):         ${MAIN_WALLET_ADDRESSES.usdt_tron_main_address}`);
    console.log(`USDC (Ethereum):     ${MAIN_WALLET_ADDRESSES.usdc_eth_main_address}`);
    console.log(`USDC (Solana):       ${MAIN_WALLET_ADDRESSES.usdc_sol_main_address}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    if (data && data.length > 0) {
      console.log('✅ Database record updated successfully!');
    }
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

setMainWalletAddresses().catch(console.error);
