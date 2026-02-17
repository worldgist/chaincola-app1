// Quick script to check ETH balance for a wallet address
const ALCHEMY_URL = process.env.ALCHEMY_ETHEREUM_URL || 'https://eth-mainnet.g.alchemy.com/v2/3L_iw-7-b25_bzLHmLyUJ';
const WALLET_ADDRESS = '0x9e3DBCd80E495f0b3eb34c5b133B5990FB9902D2';

async function checkBalance() {
  try {
    // Check on-chain balance
    const balanceResponse = await fetch(ALCHEMY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_getBalance',
        params: [WALLET_ADDRESS, 'latest'],
        id: 1,
      }),
    });

    const balanceData = await balanceResponse.json();
    const balanceWeiHex = balanceData.result || '0x0';
    
    // Convert hex wei to BigInt, then to ETH
    const balanceWeiBigInt = BigInt(balanceWeiHex);
    const weiPerEth = BigInt('1000000000000000000'); // 1e18
    const wholeEth = balanceWeiBigInt / weiPerEth;
    const remainderWei = balanceWeiBigInt % weiPerEth;
    const decimalPart = Number(remainderWei) / Number(weiPerEth);
    const balanceEth = Number(wholeEth) + decimalPart;

    console.log('\n📊 Ethereum Wallet Balance Check');
    console.log('================================');
    console.log(`Wallet Address: ${WALLET_ADDRESS}`);
    console.log(`On-chain Balance: ${balanceEth.toFixed(8)} ETH`);
    console.log(`Balance (Wei): ${balanceWeiHex} (${balanceWeiBigInt.toString()} decimal)`);

    // Check database balance (if we have Supabase access)
    console.log('\n💾 Database Balance:');
    console.log('(Run a database query to check wallet_balances table)');
    
    return {
      address: WALLET_ADDRESS,
      onChainBalance: balanceEth,
      balanceWei: balanceWeiBigInt.toString(),
      balanceWeiHex: balanceWeiHex
    };
  } catch (error) {
    console.error('❌ Error checking balance:', error);
    throw error;
  }
}

checkBalance().then(result => {
  console.log('\n✅ Balance check complete');
  console.log(JSON.stringify(result, null, 2));
}).catch(error => {
  console.error('Failed:', error);
  process.exit(1);
});

