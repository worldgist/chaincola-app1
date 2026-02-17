# Scripts Directory

This directory contains all utility scripts for managing and debugging the ChainCola application.

## Script Categories

### SOL (Solana) Related Scripts
- `check-sol-balance-*.js` - Check SOL balance and locked amounts
- `check-sol-wallet-*.js` - Check Solana wallet transactions and on-chain data
- `fix-sol-balance-*.js` - Fix SOL balance issues
- `fix-sol-sell-*.js` - Fix SOL sell order issues
- `check-pending-sol-sells.js` - Check pending SOL sell orders
- `check-recent-sol-sells.js` - Check recent SOL sell orders
- `check-user-sol-sells.js` - Check user-specific SOL sells
- `execute-sol-sell-luno.js` - Execute SOL sell on Luno
- `manual-detect-sol-deposit.js` - Manually detect SOL deposits
- `regenerate-sol-wallet.js` - Regenerate Solana wallet
- `store-sol-keys.js` - Store Solana keys
- `unlock-sol-balance.js` - Unlock SOL balance
- `sync-sol-balance-ids.js` - Sync SOL balance IDs

### ETH (Ethereum) Related Scripts
- `check-eth-balance.js` - Check ETH balance
- `check-eth-blockchain-balance.js` - Check ETH on-chain balance
- `check-ethereum-deposit-detection.js` - Check ETH deposit detection
- `check-user-eth-deposits.js` - Check user ETH deposits
- `fix-missing-eth-deposit.js` - Fix missing ETH deposits
- `manually-trigger-eth-detection.js` - Manually trigger ETH detection
- `reconcile-eth-balance.js` - Reconcile ETH balance
- `verify-deposit-detection.js` - Verify deposit detection
- `verify-send-ethereum.js` - Verify Ethereum send transactions

### BTC (Bitcoin) Related Scripts
- `verify-btc-address.js` - Verify Bitcoin address
- `verify-btc-wallet.js` - Verify Bitcoin wallet

### Transaction Management Scripts
- `check-all-transactions.js` - Check all transactions
- `check-all-user-transactions.js` - Check all user transactions
- `check-completed-sells.js` - Check completed sell orders
- `check-luno-transaction.js` - Check Luno transactions
- `check-pending-send-tx.js` - Check pending send transactions
- `check-recent-transactions.js` - Check recent transactions
- `check-specific-transaction.js` - Check specific transaction
- `check-uncredited-deposits.js` - Check uncredited deposits
- `check-wallet-transactions.js` - Check wallet transactions
- `fix-all-pending-transactions.js` - Fix all pending transactions
- `fix-pending-sell-transactions.js` - Fix pending sell transactions
- `record-missing-sell-transactions.js` - Record missing sell transactions
- `update-completed-sell.js` - Update completed sell order
- `verify-failed-transactions.js` - Verify failed transactions
- `verify-pending-transaction.js` - Verify pending transaction
- `verify-tx-receipt.js` - Verify transaction receipt

### Balance & Wallet Management Scripts
- `check-and-sync-wallets.js` - Check and sync wallets
- `check-ngn-balance.js` - Check NGN balance
- `check-ngn-balance-issue.js` - Check NGN balance issues
- `check-user-balance-issue.js` - Check user balance issues
- `check-wallet-keys.js` - Check wallet keys
- `credit-ngn-for-sell.js` - Credit NGN for sell order
- `credit-ngn-for-sol-sell.js` - Credit NGN for SOL sell
- `fix-ngn-balance.js` - Fix NGN balance
- `fix-all-wallet-balances.js` - Fix all wallet balances
- `sync-wallets-manual.js` - Manually sync wallets
- `verify-wallet-addresses.js` - Verify wallet addresses

### Sell Order Management Scripts
- `check-successful-sells-no-ngn.js` - Check successful sells without NGN
- `execute-sol-sell-luno.js` - Execute SOL sell on Luno
- `fix-duplicate-completed-transactions.js` - Fix duplicate completed transactions
- `fix-duplicate-failed-transactions.js` - Fix duplicate failed transactions
- `fix-failed-sol-sells.js` - Fix failed SOL sells
- `fix-previous-sol-sells.js` - Fix previous SOL sells
- `fix-sol-sell-ngn-credit.js` - Fix SOL sell NGN credit
- `fix-successful-sell.js` - Fix successful sell order
- `fix-worldgist-sell.js` - Fix specific user sell
- `manually-execute-sell.js` - Manually execute sell order
- `manual-execute-sol-sell.js` - Manually execute SOL sell
- `reverse-incorrect-ngn-credits.js` - Reverse incorrect NGN credits

### Debugging & Investigation Scripts
- `check-blockchain-transactions.js` - Check blockchain transactions
- `check-send-crypto-issues.js` - Check send crypto issues
- `debug-sol-balance.js` - Debug SOL balance
- `find-missing-deposits.js` - Find missing deposits
- `find-sol-transactions-and-fix.js` - Find SOL transactions and fix
- `investigate-tx-failures.js` - Investigate transaction failures
- `monitor-contract-failures.js` - Monitor contract failures
- `verify-deposit-detection.js` - Verify deposit detection

### Fix Scripts
- `fix-missing-credit.js` - Fix missing credit
- `fix-missing-deposit.js` - Fix missing deposit
- `fix-missing-sol-debits.js` - Fix missing SOL debits
- `fix-missing-tx-hash-and-execute.js` - Fix missing transaction hash and execute
- `fix-sol-balance.js` - Fix SOL balance
- `fix-sol-balance-debit.js` - Fix SOL balance debit
- `fix-solana-zero-amounts.js` - Fix Solana zero amounts
- `fix-wallet-deposit.js` - Fix wallet deposit

### Testing Scripts
- `test-sell-eth.js` - Test ETH sell
- `test-sell-eth-admin.js` - Test ETH sell (admin)
- `test-sell-eth-direct.js` - Test ETH sell (direct)
- `test-wallet-balance-insert.js` - Test wallet balance insert
- `test-xrp-generation.js` - Test XRP generation

### Utility Scripts
- `check-user-sol-transactions.js` - Check user SOL transactions
- `force-credit-missing-deposits.js` - Force credit missing deposits
- `generate-encryption-key.js` - Generate encryption key
- `manually-verify-pending.js` - Manually verify pending transactions
- `refund-failed-transaction.js` - Refund failed transaction
- `regenerate-all-wallets.js` - Regenerate all wallets
- `regenerate-failed-wallets.js` - Regenerate failed wallets
- `trigger-eth-sync.js` - Trigger ETH sync

## Usage

All scripts require environment variables to be set. Make sure you have a `.env.local` file in the root directory with:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

Run scripts from the `chaincola-web` directory:

```bash
node scripts/script-name.js
```

## Notes

- Most scripts are designed for debugging and fixing specific issues
- Always review scripts before running them in production
- Some scripts modify database records - use with caution
- Scripts are organized by functionality but may overlap in purpose
