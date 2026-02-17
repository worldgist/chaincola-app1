// Check Blockchain - Verify transactions and wallet balances on-chain
// Usage: POST with { address?: "0x...", transactionHash?: "0x...", checkAllWallets?: true }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const alchemyUrl = Deno.env.get('ALCHEMY_ETHEREUM_URL') || 'https://eth-mainnet.g.alchemy.com/v2/3L_iw-7-b25_bzLHmLyUJ';

    const body = await req.json().catch(() => ({}));
    const address = body.address?.toLowerCase();
    const transactionHash = body.transactionHash?.toLowerCase();
    const checkAllWallets = body.checkAllWallets === true;

    const results: any = {
      timestamp: new Date().toISOString(),
      checks: [],
    };

    // Get latest block number
    const latestBlockResponse = await fetch(alchemyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_blockNumber',
        params: [],
        id: 1,
      }),
    });

    const latestBlockData = await latestBlockResponse.json();
    const latestBlockNumber = parseInt(latestBlockData.result || '0', 16);
    results.latestBlock = latestBlockNumber;

    // Get wallets to check
    let walletsToCheck: any[] = [];

    if (address) {
      // Check specific address
      const { data: wallet } = await supabase
        .from('crypto_wallets')
        .select('id, user_id, address, asset, network, is_active')
        .ilike('address', address)
        .eq('asset', 'ETH')
        .eq('network', 'mainnet')
        .maybeSingle();

      if (wallet) {
        walletsToCheck.push(wallet);
      } else {
        // Check address even if not in database
        walletsToCheck.push({
          address: address,
          user_id: null,
          is_active: false,
          not_in_database: true,
        });
      }
    } else if (checkAllWallets) {
      // Check all active ETH wallets
      const { data: wallets } = await supabase
        .from('crypto_wallets')
        .select('id, user_id, address, asset, network, is_active')
        .eq('asset', 'ETH')
        .eq('network', 'mainnet')
        .eq('is_active', true);

      walletsToCheck = wallets || [];
    } else {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Please provide address, transactionHash, or set checkAllWallets=true' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`🔍 Checking ${walletsToCheck.length} wallet(s)...`);

    // Check each wallet
    for (const wallet of walletsToCheck) {
      const walletAddress = wallet.address?.toLowerCase() || address;
      if (!walletAddress) continue;

      const walletCheck: any = {
        address: walletAddress,
        userId: wallet.user_id,
        isActive: wallet.is_active,
        notInDatabase: wallet.not_in_database || false,
      };

      // Check 1: Get on-chain balance
      try {
        const balanceResponse = await fetch(alchemyUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'eth_getBalance',
            params: [walletAddress, 'latest'],
            id: 999,
          }),
        });

        if (balanceResponse.ok) {
          const balanceData = await balanceResponse.json();
          const onChainBalance = parseFloat(balanceData.result || '0') / 1e18;
          walletCheck.onChainBalance = onChainBalance;

          // Compare with database balance
          if (wallet.user_id) {
            const { data: dbBalance } = await supabase
              .from('wallet_balances')
              .select('balance')
              .eq('user_id', wallet.user_id)
              .eq('currency', 'ETH')
              .maybeSingle();

            const dbBalanceAmount = dbBalance ? parseFloat(dbBalance.balance || '0') : 0;
            walletCheck.databaseBalance = dbBalanceAmount;
            walletCheck.balanceDiscrepancy = onChainBalance - dbBalanceAmount;
            walletCheck.needsSync = Math.abs(walletCheck.balanceDiscrepancy) > 0.000001;
          }
        }
      } catch (balanceError: any) {
        walletCheck.balanceError = balanceError.message;
      }

      // Check 2: Get recent transactions (last 24 hours = ~7200 blocks)
      try {
        const blocksToCheck = 7200; // ~24 hours
        const fromBlock = Math.max(0, latestBlockNumber - blocksToCheck);
        const fromBlockHex = '0x' + fromBlock.toString(16);

        const transfersResponse = await fetch(alchemyUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'alchemy_getAssetTransfers',
            params: [{
              fromBlock: fromBlockHex,
              toBlock: 'latest',
              toAddress: walletAddress,
              category: ['external', 'internal'],
              withMetadata: true,
              excludeZeroValue: false,
            }],
            id: 2,
          }),
        });

        if (transfersResponse.ok) {
          const transfersData = await transfersResponse.json();
          const transfers = transfersData.result?.transfers || [];
          
          // Process transfers
          const recentTransfers = transfers.map((t: any) => {
            const blockNum = parseInt(t.blockNum || '0', 16);
            const confirmations = latestBlockNumber - blockNum;
            
            // Parse value - handle both hex string (wei) and decimal formats
            let valueWei = '0';
            let valueEth = 0;
            
            if (t.value) {
              try {
                // Check if it's a hex string (starts with 0x)
                if (typeof t.value === 'string' && (t.value.startsWith('0x') || t.value.startsWith('0X'))) {
                  valueWei = BigInt(t.value).toString();
                  valueEth = parseFloat(valueWei) / 1e18;
                } else {
                  // Try to parse as BigInt (for large numbers)
                  try {
                    valueWei = BigInt(t.value).toString();
                    valueEth = parseFloat(valueWei) / 1e18;
                  } catch {
                    // If BigInt fails, assume it's already in ETH format
                    valueEth = parseFloat(t.value) || 0;
                    valueWei = (BigInt(Math.floor(valueEth * 1e18))).toString();
                  }
                }
              } catch (error) {
                // Fallback: try to parse as decimal
                valueEth = parseFloat(t.value) || 0;
                valueWei = (BigInt(Math.floor(valueEth * 1e18))).toString();
              }
            }

            return {
              hash: t.hash,
              from: t.from,
              to: t.to,
              value: valueEth,
              valueWei: valueWei,
              blockNumber: blockNum,
              confirmations: confirmations,
              category: t.category,
              timestamp: t.metadata?.blockTimestamp ? new Date(parseInt(t.metadata.blockTimestamp, 16) * 1000).toISOString() : null,
            };
          }).sort((a: any, b: any) => b.blockNumber - a.blockNumber);

          walletCheck.recentTransfers = {
            total: transfers.length,
            deposits: recentTransfers.filter((t: any) => t.value > 0),
            withdrawals: recentTransfers.filter((t: any) => t.to?.toLowerCase() !== walletAddress.toLowerCase()),
          };

          // Check if transactions are in database
          if (wallet.user_id && recentTransfers.length > 0) {
            const txHashes = recentTransfers.map((t: any) => t.hash.toLowerCase());
            const { data: dbTransactions } = await supabase
              .from('transactions')
              .select('transaction_hash, status, crypto_amount, confirmations')
              .eq('user_id', wallet.user_id)
              .eq('transaction_type', 'RECEIVE')
              .eq('crypto_currency', 'ETH')
              .in('transaction_hash', txHashes);

            const dbTxHashes = new Set((dbTransactions || []).map((t: any) => t.transaction_hash?.toLowerCase()));
            
            walletCheck.missingTransactions = recentTransfers
              .filter((t: any) => !dbTxHashes.has(t.hash.toLowerCase()))
              .map((t: any) => ({
                hash: t.hash,
                value: t.value,
                blockNumber: t.blockNumber,
                confirmations: t.confirmations,
              }));
          }
        }
      } catch (transfersError: any) {
        walletCheck.transfersError = transfersError.message;
      }

      // Check 3: If specific transaction hash provided, check that transaction
      if (transactionHash) {
        try {
          // Get transaction receipt
          const txReceiptResponse = await fetch(alchemyUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              method: 'eth_getTransactionReceipt',
              params: [transactionHash],
              id: 3,
            }),
          });

          if (txReceiptResponse.ok) {
            const txReceiptData = await txReceiptResponse.json();
            if (txReceiptData.result) {
              const receipt = txReceiptData.result;
              const txBlockNumber = parseInt(receipt.blockNumber, 16);
              const confirmations = latestBlockNumber - txBlockNumber;

              walletCheck.transaction = {
                hash: transactionHash,
                found: true,
                blockNumber: txBlockNumber,
                blockHash: receipt.blockHash,
                from: receipt.from,
                to: receipt.to,
                status: receipt.status === '0x1' ? 'SUCCESS' : 'FAILED',
                confirmations: confirmations,
                gasUsed: receipt.gasUsed,
                isConfirmed: confirmations >= 12,
              };

              // Get transaction details
              const txDetailResponse = await fetch(alchemyUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  jsonrpc: '2.0',
                  method: 'eth_getTransactionByHash',
                  params: [transactionHash],
                  id: 4,
                }),
              });

              if (txDetailResponse.ok) {
                const txDetailData = await txDetailResponse.json();
                if (txDetailData.result) {
                  const value = parseFloat(txDetailData.result.value || '0') / 1e18;
                  walletCheck.transaction.value = value;
                  walletCheck.transaction.valueWei = txDetailData.result.value;
                  walletCheck.transaction.isDeposit = txDetailData.result.to?.toLowerCase() === walletAddress.toLowerCase();
                }
              }

              // Check if transaction is in database
              if (wallet.user_id) {
                const { data: dbTx } = await supabase
                  .from('transactions')
                  .select('id, status, crypto_amount, confirmations, metadata')
                  .eq('transaction_hash', transactionHash.toLowerCase())
                  .eq('user_id', wallet.user_id)
                  .maybeSingle();

                walletCheck.transaction.inDatabase = !!dbTx;
                if (dbTx) {
                  walletCheck.transaction.databaseStatus = dbTx.status;
                  walletCheck.transaction.databaseAmount = dbTx.crypto_amount;
                  walletCheck.transaction.credited = dbTx.metadata?.credited || false;
                }
              }
            } else {
              walletCheck.transaction = {
                hash: transactionHash,
                found: false,
                error: txReceiptData.error?.message || 'Transaction not found',
              };
            }
          }
        } catch (txError: any) {
          walletCheck.transaction = {
            hash: transactionHash,
            error: txError.message,
          };
        }
      }

      results.checks.push(walletCheck);
    }

    // Summary
    results.summary = {
      walletsChecked: walletsToCheck.length,
      walletsNeedingSync: results.checks.filter((c: any) => c.needsSync).length,
      missingTransactions: results.checks.reduce((sum: number, c: any) => sum + (c.missingTransactions?.length || 0), 0),
    };

    return new Response(
      JSON.stringify(results, null, 2),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('❌ Blockchain check error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

