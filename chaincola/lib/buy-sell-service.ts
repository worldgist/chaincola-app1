import Constants from 'expo-constants';
import { supabase } from './supabase';

export interface BuyCryptoRequest {
  crypto_currency: string;  // BTC, ETH, USDT, USDC, XRP
  ngn_amount: string;        // Amount in NGN to spend
  client_order_id?: string;
}

export interface BuyCryptoResponse {
  success: boolean;
  data?: {
    order_id: string;
    transaction_id?: string;
    status: string;
    crypto_amount?: string;
    ngn_amount?: string;
    price_per_unit?: string;
  };
  error?: string;
  message?: string;
}

export interface SellCryptoRequest {
  btc_amount?: string;  // Amount in BTC to sell
  eth_amount?: string;  // Amount in ETH to sell
  xrp_amount?: string;  // Amount in XRP to sell
}

export interface SellCryptoQuoteResponse {
  success: boolean;
  sell_id?: string;
  btc_amount?: string;
  eth_amount?: string;
  xrp_amount?: string;
  exchange_rate?: string;
  market_rate?: string;
  spread_percentage?: number;
  platform_fee?: string;
  platform_fee_percentage?: number;
  network_fee_btc?: string;
  network_fee_eth?: string;
  network_fee_xrp?: string;
  final_ngn_payout?: string;
  quote_expires_at?: string;
  message?: string;
  error?: string;
}

export interface SellCryptoExecuteResponse {
  success: boolean;
  sell_id?: string;
  status?: string;
  btc_tx_hash?: string;
  eth_tx_hash?: string;
  xrp_tx_hash?: string;
  sol_tx_hash?: string;
  message?: string;
  error?: string;
}

export interface SellCryptoStatusResponse {
  success: boolean;
  sell_order?: any;
  error?: string;
}

export interface InstantSellRequest {
  asset: string;  // BTC, ETH, USDT, USDC, XRP, SOL
  amount: number; // Amount in crypto to sell
}

export interface InstantSellResponse {
  success: boolean;
  ngn_amount?: number;
  new_balances?: {
    ngn_balance: number;
    btc_balance: number;
    eth_balance: number;
    usdt_balance: number;
    usdc_balance: number;
    xrp_balance: number;
    sol_balance: number;
  };
  error?: string;
}



/**
 * Buy cryptocurrency using NGN
 */
export async function buyCrypto(request: BuyCryptoRequest): Promise<BuyCryptoResponse> {
  try {
    console.log('💰 Buying crypto:', request);

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return {
        success: false,
        error: 'Not authenticated',
      };
    }

    // Get Supabase URL from environment (React Native compatible)
    const supabaseUrl = Constants.expoConfig?.extra?.supabaseUrl || 
                       process.env.NEXT_PUBLIC_SUPABASE_URL || 
                       process.env.EXPO_PUBLIC_SUPABASE_URL ||
                       'https://slleojsdpctxhlsoyenr.supabase.co';

    if (!supabaseUrl) {
      return {
        success: false,
        error: 'Supabase URL not configured',
      };
    }

    const functionUrl = `${supabaseUrl}/functions/v1/luno-buy-crypto`;

    console.log('📡 Calling buy crypto function:', functionUrl);

    // Get Supabase anon key for API calls
    const supabaseAnonKey = Constants.expoConfig?.extra?.supabaseAnonKey || 
                           process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 
                           process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseAnonKey) {
      return {
        success: false,
        error: 'Supabase anon key not configured',
      };
    }

    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': supabaseAnonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        crypto_currency: request.crypto_currency,
        ngn_amount: request.ngn_amount,
        client_order_id: request.client_order_id,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Error buying crypto:', response.status, errorText);
      
      let errorMessage = `HTTP ${response.status}`;
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error || errorJson.message || errorMessage;
        
        // Provide user-friendly error messages
        if (errorMessage.toLowerCase().includes('volume is below the minimum') ||
            errorMessage.toLowerCase().includes('below the minimum') ||
            errorMessage.toLowerCase().includes('minimum')) {
          // Keep the detailed error message from the server
          // It already includes the minimum amount needed
        } else if (errorMessage.toLowerCase().includes('price would vary') || 
            errorMessage.toLowerCase().includes('market rate')) {
          errorMessage = 'The market price changed. Please try again - the system will automatically adjust.';
        } else if (errorMessage.toLowerCase().includes('insufficient')) {
          errorMessage = 'Insufficient balance. Please check your wallet balance.';
        } else if (errorMessage.toLowerCase().includes('not authenticated')) {
          errorMessage = 'Please log in to continue.';
        }
      } catch {
        errorMessage = errorText || errorMessage;
      }

      return {
        success: false,
        error: errorMessage,
      };
    }

    const result = await response.json();
    console.log('✅ Buy crypto response:', result);

    return {
      success: result.success !== false,
      data: result.data,
      error: result.error,
      message: result.message,
    };
  } catch (error: any) {
    console.error('❌ Exception buying crypto:', error);
    return {
      success: false,
      error: error.message || 'Failed to buy crypto',
    };
  }
}


export interface SendEthereumRequest {
  destination_address: string;
  amount_eth: string;
}

export interface SendEthereumResponse {
  success: boolean;
  transaction_hash?: string;
  amount?: string;
  fee?: string;
  error?: string;
  message?: string;
}


/**
 * Store SOL private keys (encrypted) in the database
 * This generates a new SOL wallet and stores the encrypted private key
 */
export async function storeSOLKeys(): Promise<{ success: boolean; address?: string; error?: string }> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return {
        success: false,
        error: 'Not authenticated',
      };
    }

    const supabaseUrl = Constants.expoConfig?.extra?.supabaseUrl || 
                       process.env.NEXT_PUBLIC_SUPABASE_URL || 
                       process.env.EXPO_PUBLIC_SUPABASE_URL ||
                       'https://slleojsdpctxhlsoyenr.supabase.co';

    if (!supabaseUrl) {
      return {
        success: false,
        error: 'Supabase URL not configured',
      };
    }

    const functionUrl = `${supabaseUrl}/functions/v1/store-crypto-keys`;

    const supabaseAnonKey = Constants.expoConfig?.extra?.supabaseAnonKey || 
                           process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 
                           process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseAnonKey) {
      return {
        success: false,
        error: 'Supabase anon key not configured',
      };
    }

    console.log('🔐 Storing SOL private keys...');

    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': supabaseAnonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        asset: 'SOL', // Only store SOL keys
        regenerate_if_no_keys: true, // Regenerate if wallet exists but has no keys
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `HTTP ${response.status}`;
      
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error || errorJson.message || errorMessage;
      } catch {
        errorMessage = errorText || errorMessage;
      }

      console.error('❌ Error storing SOL keys:', errorMessage);
      return {
        success: false,
        error: errorMessage,
      };
    }

    const result = await response.json();
    console.log('✅ SOL keys stored:', result);

    // Find SOL result in the response
    const solResult = result.results?.find((r: any) => r.asset === 'SOL');
    
    if (solResult && solResult.success) {
      return {
        success: true,
        address: solResult.address,
      };
    } else {
      return {
        success: false,
        error: solResult?.error || 'Failed to store SOL keys',
      };
    }
  } catch (error: any) {
    console.error('❌ Exception storing SOL keys:', error);
    return {
      success: false,
      error: error.message || 'Failed to store SOL keys',
    };
  }
}

/**
 * Store ETH private keys (encrypted) in the database
 * This generates a new ETH wallet and stores the encrypted private key
 */
export async function storeETHKeys(): Promise<{ success: boolean; address?: string; error?: string }> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return {
        success: false,
        error: 'Not authenticated',
      };
    }

    const supabaseUrl = Constants.expoConfig?.extra?.supabaseUrl || 
                       process.env.NEXT_PUBLIC_SUPABASE_URL || 
                       process.env.EXPO_PUBLIC_SUPABASE_URL ||
                       'https://slleojsdpctxhlsoyenr.supabase.co';

    if (!supabaseUrl) {
      return {
        success: false,
        error: 'Supabase URL not configured',
      };
    }

    const functionUrl = `${supabaseUrl}/functions/v1/store-crypto-keys`;

    const supabaseAnonKey = Constants.expoConfig?.extra?.supabaseAnonKey || 
                           process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 
                           process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseAnonKey) {
      return {
        success: false,
        error: 'Supabase anon key not configured',
      };
    }

    console.log('🔐 Storing ETH private keys...');

    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': supabaseAnonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        assets: ['ETH'], // Only store ETH keys
        force_regenerate: true, // Force regenerate to re-encrypt with current key
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `HTTP ${response.status}`;
      
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error || errorJson.message || errorMessage;
      } catch {
        errorMessage = errorText || errorMessage;
      }

      console.error('❌ Error storing ETH keys:', errorMessage);
      return {
        success: false,
        error: errorMessage,
      };
    }

    const result = await response.json();
    console.log('✅ ETH keys stored:', result);

    // Find ETH result in the response
    const ethResult = result.results?.find((r: any) => r.asset === 'ETH' || r.asset === 'ETHEREUM');
    
    if (ethResult && ethResult.success) {
      return {
        success: true,
        address: ethResult.address,
      };
    } else {
      return {
        success: false,
        error: ethResult?.error || 'Failed to store ETH keys',
      };
    }
  } catch (error: any) {
    console.error('❌ Exception storing ETH keys:', error);
    return {
      success: false,
      error: error.message || 'Failed to store ETH keys',
    };
  }
}

/**
 * Send ETH using Ethereum network
 */
// Track retry attempts to prevent infinite loops
let sendEthereumRetryCount = 0;
const MAX_RETRY_ATTEMPTS = 2;

export async function sendEthereum(request: SendEthereumRequest): Promise<SendEthereumResponse> {
  try {
    console.log('📤 Sending ETH:', request);

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return {
        success: false,
        error: 'Not authenticated',
      };
    }

    // Get Supabase URL from environment (React Native compatible)
    const supabaseUrl = Constants.expoConfig?.extra?.supabaseUrl || 
                       process.env.NEXT_PUBLIC_SUPABASE_URL || 
                       process.env.EXPO_PUBLIC_SUPABASE_URL ||
                       'https://slleojsdpctxhlsoyenr.supabase.co';

    if (!supabaseUrl) {
      return {
        success: false,
        error: 'Supabase URL not configured',
      };
    }

    const functionUrl = `${supabaseUrl}/functions/v1/send-ethereum-transaction`;

    console.log('📡 Calling send ETH function:', functionUrl);

    // Get Supabase anon key for API calls
    const supabaseAnonKey = Constants.expoConfig?.extra?.supabaseAnonKey || 
                           process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 
                           process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseAnonKey) {
      return {
        success: false,
        error: 'Supabase anon key not configured',
      };
    }

    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': supabaseAnonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        destination_address: request.destination_address,
        amount_eth: request.amount_eth,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Error sending ETH:', response.status, errorText);
      
      let errorMessage = `HTTP ${response.status}`;
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error || errorJson.message || errorMessage;
        
        // Check if error is about missing private key or decryption failure
        if ((errorMessage.toLowerCase().includes('no private key') || 
            errorMessage.toLowerCase().includes('store your ethereum wallet keys') ||
            errorMessage.toLowerCase().includes('decrypt') ||
            errorMessage.toLowerCase().includes('encryption key')) &&
            sendEthereumRetryCount < MAX_RETRY_ATTEMPTS) {
          
          sendEthereumRetryCount++;
          console.log(`🔐 Private key issue detected (attempt ${sendEthereumRetryCount}/${MAX_RETRY_ATTEMPTS}), attempting to regenerate ETH wallet...`);
          
          // Try to regenerate ETH wallet with current encryption key
          // Import regenerateWallet dynamically to avoid circular dependencies
          const { regenerateWallet } = await import('./crypto-wallet-service');
          const regenerateResult = await regenerateWallet('ETH', 'mainnet');
          
          if (regenerateResult.success) {
            console.log('✅ ETH wallet regenerated, waiting a moment for database sync...');
            // Wait a moment for database to sync
            await new Promise(resolve => setTimeout(resolve, 1000));
            console.log('🔄 Retrying send transaction...');
            // Retry the send transaction
            return sendEthereum(request);
          } else {
            // Fallback: try storing keys (might work if wallet exists but keys are missing)
            console.log('⚠️ Regeneration failed, trying to store keys...');
            const storeResult = await storeETHKeys();
            
            if (storeResult.success) {
              console.log('✅ ETH keys stored, waiting a moment for database sync...');
              await new Promise(resolve => setTimeout(resolve, 1000));
              console.log('🔄 Retrying send transaction...');
              return sendEthereum(request);
            }
            
            sendEthereumRetryCount = 0; // Reset counter on failure
            return {
              success: false,
              error: `Wallet setup failed after ${sendEthereumRetryCount} attempts: ${regenerateResult.error || storeResult.error || 'Please set up your ETH wallet first'}`,
            };
          }
        } else if (sendEthereumRetryCount >= MAX_RETRY_ATTEMPTS) {
          sendEthereumRetryCount = 0; // Reset counter
          return {
            success: false,
            error: `Failed to resolve encryption key issue after ${MAX_RETRY_ATTEMPTS} attempts. The wallet may have been encrypted with a different key. Please contact support.`,
          };
        }
        
        // Reset retry counter if error is not related to encryption
        sendEthereumRetryCount = 0;
        
        // Check for insufficient funds error (wallet has 0 ETH on-chain)
        if (errorMessage.toLowerCase().includes('insufficient funds') && 
            errorMessage.toLowerCase().includes('0 eth on-chain')) {
          // Extract wallet address from error if available
          const walletMatch = errorText.match(/"wallet_address":"([^"]+)"/);
          const walletAddress = walletMatch ? walletMatch[1] : null;
          
          return {
            success: false,
            error: `Your wallet address has 0 ETH on-chain. This may happen after wallet regeneration. ` +
                   `Your ETH balance is on a previous wallet address. ` +
                   (walletAddress ? `Current wallet: ${walletAddress.substring(0, 10)}...${walletAddress.substring(walletAddress.length - 8)}. ` : '') +
                   `Please contact support to recover your funds or deposit ETH to your current wallet address.`,
          };
        }
        
        // Provide user-friendly error messages
        if (errorMessage.toLowerCase().includes('insufficient balance')) {
          // Keep the detailed error message from the server
          // It already includes available balance and required amount
        } else if (errorMessage.toLowerCase().includes('insufficient')) {
          errorMessage = 'Insufficient balance. Please check your wallet balance.';
        } else if (errorMessage.toLowerCase().includes('invalid address') ||
                   errorMessage.toLowerCase().includes('invalid destination')) {
          errorMessage = 'Invalid destination address. Please check the address and try again.';
        } else if (errorMessage.toLowerCase().includes('gas') ||
                   errorMessage.toLowerCase().includes('fee')) {
          // Keep the detailed error message as it includes gas fee information
        } else if (errorMessage.toLowerCase().includes('not authenticated')) {
          errorMessage = 'Please log in to continue.';
        }
      } catch {
        errorMessage = errorText || errorMessage;
      }

      return {
        success: false,
        error: errorMessage,
      };
    }

    const result = await response.json();
    console.log('✅ Send ETH response:', result);

    return {
      success: result.success !== false,
      transaction_hash: result.transaction_hash,
      amount: result.amount,
      fee: result.fee,
      error: result.error,
      message: result.message,
    };
  } catch (error: any) {
    console.error('❌ Exception sending ETH:', error);
    return {
      success: false,
      error: error.message || 'Failed to send ETH',
    };
  }
}

/**
 * Get quote for selling BTC
 */
export async function getSellBtcQuote(request: SellCryptoRequest): Promise<SellCryptoQuoteResponse> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return {
        success: false,
        error: 'Not authenticated',
      };
    }

    const supabaseUrl = Constants.expoConfig?.extra?.supabaseUrl || 
                       process.env.NEXT_PUBLIC_SUPABASE_URL || 
                       process.env.EXPO_PUBLIC_SUPABASE_URL ||
                       'https://slleojsdpctxhlsoyenr.supabase.co';

    if (!supabaseUrl) {
      return {
        success: false,
        error: 'Supabase URL not configured',
      };
    }

    const functionUrl = `${supabaseUrl}/functions/v1/sell-btc`;

    const supabaseAnonKey = Constants.expoConfig?.extra?.supabaseAnonKey || 
                           process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 
                           process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseAnonKey) {
      return {
        success: false,
        error: 'Supabase anon key not configured',
      };
    }

    console.log('📡 Getting sell BTC quote...');

    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': supabaseAnonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'quote',
        btc_amount: request.btc_amount,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `HTTP ${response.status}`;
      
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error || errorJson.message || errorMessage;
      } catch {
        errorMessage = errorText || errorMessage;
      }

      return {
        success: false,
        error: errorMessage,
      };
    }

    const result = await response.json();
    return result;

  } catch (error: any) {
    console.error('Error getting sell BTC quote:', error);
    return {
      success: false,
      error: error.message || 'Failed to get sell quote',
    };
  }
}

/**
 * Execute BTC sell (after user confirms quote)
 */
export async function executeSellBtc(sell_id: string): Promise<SellCryptoExecuteResponse> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return {
        success: false,
        error: 'Not authenticated',
      };
    }

    const supabaseUrl = Constants.expoConfig?.extra?.supabaseUrl || 
                       process.env.NEXT_PUBLIC_SUPABASE_URL || 
                       process.env.EXPO_PUBLIC_SUPABASE_URL ||
                       'https://slleojsdpctxhlsoyenr.supabase.co';

    if (!supabaseUrl) {
      return {
        success: false,
        error: 'Supabase URL not configured',
      };
    }

    const functionUrl = `${supabaseUrl}/functions/v1/sell-btc`;

    const supabaseAnonKey = Constants.expoConfig?.extra?.supabaseAnonKey || 
                           process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 
                           process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseAnonKey) {
      return {
        success: false,
        error: 'Supabase anon key not configured',
      };
    }

    console.log('📡 Executing BTC sell...');

    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': supabaseAnonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'execute',
        sell_id: sell_id,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `HTTP ${response.status}`;
      
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error || errorJson.message || errorMessage;
      } catch {
        errorMessage = errorText || errorMessage;
      }

      return {
        success: false,
        error: errorMessage,
      };
    }

    const result = await response.json();
    return result;

  } catch (error: any) {
    console.error('Error executing BTC sell:', error);
    return {
      success: false,
      error: error.message || 'Failed to execute sell',
    };
  }
}

/**
 * Get sell order status
 */
export async function getSellBtcStatus(sell_id: string): Promise<SellCryptoStatusResponse> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return {
        success: false,
        error: 'Not authenticated',
      };
    }

    const supabaseUrl = Constants.expoConfig?.extra?.supabaseUrl || 
                       process.env.NEXT_PUBLIC_SUPABASE_URL || 
                       process.env.EXPO_PUBLIC_SUPABASE_URL ||
                       'https://slleojsdpctxhlsoyenr.supabase.co';

    if (!supabaseUrl) {
      return {
        success: false,
        error: 'Supabase URL not configured',
      };
    }

    const functionUrl = `${supabaseUrl}/functions/v1/sell-btc`;

    const supabaseAnonKey = Constants.expoConfig?.extra?.supabaseAnonKey || 
                           process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 
                           process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseAnonKey) {
      return {
        success: false,
        error: 'Supabase anon key not configured',
      };
    }

    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': supabaseAnonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'status',
        sell_id: sell_id,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `HTTP ${response.status}`;
      
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error || errorJson.message || errorMessage;
      } catch {
        errorMessage = errorText || errorMessage;
      }

      return {
        success: false,
        error: errorMessage,
      };
    }

    const result = await response.json();
    return result;

  } catch (error: any) {
    console.error('Error getting sell status:', error);
    return {
      success: false,
      error: error.message || 'Failed to get sell status',
    };
  }
}

/**
 * Get quote for selling ETH
 */
export async function getSellEthQuote(request: { eth_amount: string }): Promise<SellCryptoQuoteResponse> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return {
        success: false,
        error: 'Not authenticated',
      };
    }

    const supabaseUrl = Constants.expoConfig?.extra?.supabaseUrl ||
                       process.env.NEXT_PUBLIC_SUPABASE_URL ||
                       process.env.EXPO_PUBLIC_SUPABASE_URL ||
                       'https://slleojsdpctxhlsoyenr.supabase.co';

    if (!supabaseUrl) {
      return {
        success: false,
        error: 'Supabase URL not configured',
      };
    }

    const functionUrl = `${supabaseUrl}/functions/v1/sell-eth`;

    const supabaseAnonKey = Constants.expoConfig?.extra?.supabaseAnonKey ||
                           process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
                           process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseAnonKey) {
      return {
        success: false,
        error: 'Supabase anon key not configured',
      };
    }

    console.log('📡 Getting sell ETH quote...');

    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': supabaseAnonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'quote',
        eth_amount: request.eth_amount,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `HTTP ${response.status}`;

      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error || errorJson.message || errorMessage;
      } catch {
        errorMessage = errorText || errorMessage;
      }

      return {
        success: false,
        error: errorMessage,
      };
    }

    const result = await response.json();
    return result;

  } catch (error: any) {
    console.error('Error getting sell ETH quote:', error);
    return {
      success: false,
      error: error.message || 'Failed to get sell quote',
    };
  }
}

/**
 * Execute ETH sell (after user confirms quote)
 */
export async function executeSellEth(sell_id: string): Promise<SellCryptoExecuteResponse> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return {
        success: false,
        error: 'Not authenticated',
      };
    }

    const supabaseUrl = Constants.expoConfig?.extra?.supabaseUrl ||
                       process.env.NEXT_PUBLIC_SUPABASE_URL ||
                       process.env.EXPO_PUBLIC_SUPABASE_URL ||
                       'https://slleojsdpctxhlsoyenr.supabase.co';

    if (!supabaseUrl) {
      return {
        success: false,
        error: 'Supabase URL not configured',
      };
    }

    const functionUrl = `${supabaseUrl}/functions/v1/sell-eth`;

    const supabaseAnonKey = Constants.expoConfig?.extra?.supabaseAnonKey ||
                           process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
                           process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseAnonKey) {
      return {
        success: false,
        error: 'Supabase anon key not configured',
      };
    }

    console.log('📡 Executing ETH sell...');

    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': supabaseAnonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'execute',
        sell_id: sell_id,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `HTTP ${response.status}`;

      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error || errorJson.message || errorMessage;
      } catch {
        errorMessage = errorText || errorMessage;
      }

      return {
        success: false,
        error: errorMessage,
      };
    }

    const result = await response.json();
    return result;

  } catch (error: any) {
    console.error('Error executing ETH sell:', error);
    return {
      success: false,
      error: error.message || 'Failed to execute sell',
    };
  }
}

/**
 * Get sell ETH order status
 */
export async function getSellEthStatus(sell_id: string): Promise<SellCryptoStatusResponse> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return {
        success: false,
        error: 'Not authenticated',
      };
    }

    const supabaseUrl = Constants.expoConfig?.extra?.supabaseUrl ||
                       process.env.NEXT_PUBLIC_SUPABASE_URL ||
                       process.env.EXPO_PUBLIC_SUPABASE_URL ||
                       'https://slleojsdpctxhlsoyenr.supabase.co';

    if (!supabaseUrl) {
      return {
        success: false,
        error: 'Supabase URL not configured',
      };
    }

    const functionUrl = `${supabaseUrl}/functions/v1/sell-eth`;

    const supabaseAnonKey = Constants.expoConfig?.extra?.supabaseAnonKey ||
                           process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
                           process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseAnonKey) {
      return {
        success: false,
        error: 'Supabase anon key not configured',
      };
    }

    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': supabaseAnonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'status',
        sell_id: sell_id,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `HTTP ${response.status}`;

      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error || errorJson.message || errorMessage;
      } catch {
        errorMessage = errorText || errorMessage;
      }

      return {
        success: false,
        error: errorMessage,
      };
    }

    const result = await response.json();
    return result;

  } catch (error: any) {
    console.error('Error getting sell ETH status:', error);
    return {
      success: false,
      error: error.message || 'Failed to get sell status',
    };
  }
}

/**
 * Get quote for selling XRP
 */
export async function getSellXrpQuote(request: { xrp_amount: string }): Promise<SellCryptoQuoteResponse> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return {
        success: false,
        error: 'Not authenticated',
      };
    }

    const supabaseUrl = Constants.expoConfig?.extra?.supabaseUrl ||
                       process.env.NEXT_PUBLIC_SUPABASE_URL ||
                       process.env.EXPO_PUBLIC_SUPABASE_URL ||
                       'https://slleojsdpctxhlsoyenr.supabase.co';

    if (!supabaseUrl) {
      return {
        success: false,
        error: 'Supabase URL not configured',
      };
    }

    const functionUrl = `${supabaseUrl}/functions/v1/sell-xrp`;

    const supabaseAnonKey = Constants.expoConfig?.extra?.supabaseAnonKey ||
                           process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
                           process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseAnonKey) {
      return {
        success: false,
        error: 'Supabase anon key not configured',
      };
    }

    console.log('📡 Getting sell XRP quote...');

    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': supabaseAnonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'quote',
        xrp_amount: request.xrp_amount,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `HTTP ${response.status}`;

      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error || errorJson.message || errorMessage;
      } catch {
        errorMessage = errorText || errorMessage;
      }

      return {
        success: false,
        error: errorMessage,
      };
    }

    const result = await response.json();
    return result;

  } catch (error: any) {
    console.error('Error getting sell XRP quote:', error);
    return {
      success: false,
      error: error.message || 'Failed to get sell quote',
    };
  }
}

/**
 * Execute XRP sell (after user confirms quote)
 */
export async function executeSellXrp(sell_id: string): Promise<SellCryptoExecuteResponse> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return {
        success: false,
        error: 'Not authenticated',
      };
    }

    const supabaseUrl = Constants.expoConfig?.extra?.supabaseUrl ||
                       process.env.NEXT_PUBLIC_SUPABASE_URL ||
                       process.env.EXPO_PUBLIC_SUPABASE_URL ||
                       'https://slleojsdpctxhlsoyenr.supabase.co';

    if (!supabaseUrl) {
      return {
        success: false,
        error: 'Supabase URL not configured',
      };
    }

    const functionUrl = `${supabaseUrl}/functions/v1/sell-xrp`;

    const supabaseAnonKey = Constants.expoConfig?.extra?.supabaseAnonKey ||
                           process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
                           process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseAnonKey) {
      return {
        success: false,
        error: 'Supabase anon key not configured',
      };
    }

    console.log('📡 Executing XRP sell...');

    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': supabaseAnonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'execute',
        sell_id: sell_id,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `HTTP ${response.status}`;

      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error || errorJson.message || errorMessage;
      } catch {
        errorMessage = errorText || errorMessage;
      }

      return {
        success: false,
        error: errorMessage,
      };
    }

    const result = await response.json();
    return result;

  } catch (error: any) {
    console.error('Error executing XRP sell:', error);
    return {
      success: false,
      error: error.message || 'Failed to execute sell',
    };
  }
}

/**
 * Get sell XRP order status
 */
export async function getSellXrpStatus(sell_id: string): Promise<SellCryptoStatusResponse> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return {
        success: false,
        error: 'Not authenticated',
      };
    }

    const supabaseUrl = Constants.expoConfig?.extra?.supabaseUrl ||
                       process.env.NEXT_PUBLIC_SUPABASE_URL ||
                       process.env.EXPO_PUBLIC_SUPABASE_URL ||
                       'https://slleojsdpctxhlsoyenr.supabase.co';

    if (!supabaseUrl) {
      return {
        success: false,
        error: 'Supabase URL not configured',
      };
    }

    const functionUrl = `${supabaseUrl}/functions/v1/sell-xrp`;

    const supabaseAnonKey = Constants.expoConfig?.extra?.supabaseAnonKey ||
                           process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
                           process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseAnonKey) {
      return {
        success: false,
        error: 'Supabase anon key not configured',
      };
    }

    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': supabaseAnonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'status',
        sell_id: sell_id,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `HTTP ${response.status}`;

      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error || errorJson.message || errorMessage;
      } catch {
        errorMessage = errorText || errorMessage;
      }

      return {
        success: false,
        error: errorMessage,
      };
    }

    const result = await response.json();
    return result;

  } catch (error: any) {
    console.error('Error getting sell XRP status:', error);
    return {
      success: false,
      error: error.message || 'Failed to get sell status',
    };
  }
}

/**
 * Get quote for selling SOL
 */
export async function getSellSolQuote(request: { sol_amount: string }): Promise<SellCryptoQuoteResponse> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return {
        success: false,
        error: 'Not authenticated',
      };
    }

    const supabaseUrl = Constants.expoConfig?.extra?.supabaseUrl ||
                       process.env.NEXT_PUBLIC_SUPABASE_URL ||
                       process.env.EXPO_PUBLIC_SUPABASE_URL ||
                       'https://slleojsdpctxhlsoyenr.supabase.co';

    if (!supabaseUrl) {
      return {
        success: false,
        error: 'Supabase URL not configured',
      };
    }

    const functionUrl = `${supabaseUrl}/functions/v1/sell-sol`;

    const supabaseAnonKey = Constants.expoConfig?.extra?.supabaseAnonKey ||
                           process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
                           process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseAnonKey) {
      return {
        success: false,
        error: 'Supabase anon key not configured',
      };
    }

    console.log('📡 Getting sell SOL quote...');

    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': supabaseAnonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'quote',
        sol_amount: request.sol_amount,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `HTTP ${response.status}`;

      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error || errorJson.message || errorMessage;
      } catch {
        errorMessage = errorText || errorMessage;
      }

      return {
        success: false,
        error: errorMessage,
      };
    }

    const result = await response.json();
    return result;

  } catch (error: any) {
    console.error('Error getting sell SOL quote:', error);
    return {
      success: false,
      error: error.message || 'Failed to get sell quote',
    };
  }
}

/**
 * Execute SOL sell order
 */
export async function executeSellSol(sell_id: string): Promise<SellCryptoExecuteResponse> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return {
        success: false,
        error: 'Not authenticated',
      };
    }

    const supabaseUrl = Constants.expoConfig?.extra?.supabaseUrl ||
                       process.env.NEXT_PUBLIC_SUPABASE_URL ||
                       process.env.EXPO_PUBLIC_SUPABASE_URL ||
                       'https://slleojsdpctxhlsoyenr.supabase.co';

    if (!supabaseUrl) {
      return {
        success: false,
        error: 'Supabase URL not configured',
      };
    }

    const functionUrl = `${supabaseUrl}/functions/v1/sell-sol`;

    const supabaseAnonKey = Constants.expoConfig?.extra?.supabaseAnonKey ||
                           process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
                           process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseAnonKey) {
      return {
        success: false,
        error: 'Supabase anon key not configured',
      };
    }

    console.log('📡 Executing sell SOL order...');

    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': supabaseAnonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'execute',
        sell_id: sell_id,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `HTTP ${response.status}`;

      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error || errorJson.message || errorMessage;
      } catch {
        errorMessage = errorText || errorMessage;
      }

      return {
        success: false,
        error: errorMessage,
      };
    }

    const result = await response.json();
    return result;

  } catch (error: any) {
    console.error('Error executing sell SOL:', error);
    return {
      success: false,
      error: error.message || 'Failed to execute sell',
    };
  }
}

/**
 * Get SOL sell order status
 */
export async function getSellSolStatus(sell_id: string): Promise<SellCryptoStatusResponse> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return {
        success: false,
        error: 'Not authenticated',
      };
    }

    const supabaseUrl = Constants.expoConfig?.extra?.supabaseUrl ||
                       process.env.NEXT_PUBLIC_SUPABASE_URL ||
                       process.env.EXPO_PUBLIC_SUPABASE_URL ||
                       'https://slleojsdpctxhlsoyenr.supabase.co';

    if (!supabaseUrl) {
      return {
        success: false,
        error: 'Supabase URL not configured',
      };
    }

    const functionUrl = `${supabaseUrl}/functions/v1/sell-sol`;

    const supabaseAnonKey = Constants.expoConfig?.extra?.supabaseAnonKey ||
                           process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
                           process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseAnonKey) {
      return {
        success: false,
        error: 'Supabase anon key not configured',
      };
    }

    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': supabaseAnonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'status',
        sell_id: sell_id,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `HTTP ${response.status}`;

      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error || errorJson.message || errorMessage;
      } catch {
        errorMessage = errorText || errorMessage;
      }

      return {
        success: false,
        error: errorMessage,
      };
    }

    const result = await response.json();
    return result;

  } catch (error: any) {
    console.error('Error getting sell SOL status:', error);
    return {
      success: false,
      error: error.message || 'Failed to get sell status',
    };
  }
}

/**
 * Instant Sell Crypto - Internal ledger swap (no blockchain movement)
 * Swaps crypto to NGN instantly using system inventory
 */
export async function instantSellCrypto(request: InstantSellRequest): Promise<InstantSellResponse> {
  try {
    console.log('💰 Instant sell request:', request);

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return {
        success: false,
        error: 'Not authenticated',
      };
    }

    const supabaseUrl = Constants.expoConfig?.extra?.supabaseUrl ||
                       process.env.NEXT_PUBLIC_SUPABASE_URL ||
                       process.env.EXPO_PUBLIC_SUPABASE_URL ||
                       'https://slleojsdpctxhlsoyenr.supabase.co';

    if (!supabaseUrl) {
      return {
        success: false,
        error: 'Supabase URL not configured',
      };
    }

    const functionUrl = `${supabaseUrl}/functions/v1/instant-sell-crypto-v2`;

    const supabaseAnonKey = Constants.expoConfig?.extra?.supabaseAnonKey ||
                           process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
                           process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseAnonKey) {
      return {
        success: false,
        error: 'Supabase anon key not configured',
      };
    }

    console.log('📡 Calling instant sell function:', functionUrl);

    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': supabaseAnonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        asset: request.asset,
        amount: request.amount,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Error in instant sell:', response.status, errorText);
      
      let errorMessage = `HTTP ${response.status}`;
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error || errorJson.message || errorMessage;
      } catch {
        errorMessage = errorText || errorMessage;
      }

      return {
        success: false,
        error: errorMessage,
      };
    }

    const result = await response.json();
    console.log('✅ Instant sell response:', result);

    if (result.success) {
      return {
        success: true,
        ngn_amount: result.ngn_amount,
        new_balances: result.new_balances,
      };
    } else {
      return {
        success: false,
        error: result.error || 'Failed to execute instant sell',
      };
    }
  } catch (error: any) {
    console.error('❌ Exception in instant sell:', error);
    return {
      success: false,
      error: error.message || 'Failed to execute instant sell',
    };
  }
}

/**
 * Instant Buy Crypto - Internal ledger swap (no blockchain movement)
 * Swaps NGN to crypto instantly using system inventory
 */
export async function instantBuyCrypto(request: InstantBuyRequest): Promise<InstantBuyResponse> {
  try {
    console.log('💰 Instant buy request:', request);

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return {
        success: false,
        error: 'Not authenticated',
      };
    }

    const supabaseUrl = Constants.expoConfig?.extra?.supabaseUrl ||
                       process.env.NEXT_PUBLIC_SUPABASE_URL ||
                       process.env.EXPO_PUBLIC_SUPABASE_URL ||
                       'https://slleojsdpctxhlsoyenr.supabase.co';

    if (!supabaseUrl) {
      return {
        success: false,
        error: 'Supabase URL not configured',
      };
    }

    const functionUrl = `${supabaseUrl}/functions/v1/instant-buy-crypto`;

    const supabaseAnonKey = Constants.expoConfig?.extra?.supabaseAnonKey ||
                           process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
                           process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseAnonKey) {
      return {
        success: false,
        error: 'Supabase anon key not configured',
      };
    }

    console.log('📡 Calling instant buy function:', functionUrl);

    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': supabaseAnonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        asset: request.asset,
        ngn_amount: request.ngn_amount,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Error in instant buy:', response.status, errorText);
      
      let errorMessage = `HTTP ${response.status}`;
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error || errorJson.message || errorMessage;
      } catch {
        errorMessage = errorText || errorMessage;
      }

      return {
        success: false,
        error: errorMessage,
      };
    }

    const result = await response.json();
    console.log('✅ Instant buy response:', result);

    if (result.success) {
      return {
        success: true,
        crypto_amount: result.crypto_amount,
        ngn_amount: result.ngn_amount,
        rate: result.rate,
        fee_percentage: result.fee_percentage,
        balances: result.balances,
      };
    } else {
      return {
        success: false,
        error: result.error || 'Failed to execute instant buy',
      };
    }
  } catch (error: any) {
    console.error('❌ Exception in instant buy:', error);
    return {
      success: false,
      error: error.message || 'Failed to execute instant buy',
    };
  }
}

export interface SwapCryptoRequest {
  from_asset: string;  // BTC, ETH, USDT, USDC, XRP, SOL
  to_asset: string;    // BTC, ETH, USDT, USDC, XRP, SOL
  from_amount: number; // Amount of from_asset to swap
}

export interface SwapCryptoResponse {
  success: boolean;
  from_asset?: string;
  to_asset?: string;
  from_amount?: number;
  to_amount?: number;
  value_in_ngn?: number;
  swap_fee?: number;
  new_balances?: {
    from_balance: number;
    to_balance: number;
    system_from_inventory: number;
    system_to_inventory: number;
  };
  exchange_rate?: {
    from_sell_price: number;
    to_buy_price: number;
    rate_source: string;
  };
  error?: string;
}

/**
 * Swap Crypto - Exchange one cryptocurrency for another
 * Logic: Sell Crypto A at sell price → Buy Crypto B at buy price
 * Atomic transaction: debit user Asset A, credit system Asset A, debit system Asset B, credit user Asset B
 */
export async function swapCrypto(request: SwapCryptoRequest): Promise<SwapCryptoResponse> {
  try {
    console.log('🔄 Swap crypto request:', request);

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return {
        success: false,
        error: 'Not authenticated',
      };
    }

    const supabaseUrl = Constants.expoConfig?.extra?.supabaseUrl || process.env.EXPO_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl) {
      return {
        success: false,
        error: 'Supabase URL not configured',
      };
    }

    const functionUrl = `${supabaseUrl}/functions/v1/swap-crypto`;
    const supabaseAnonKey = Constants.expoConfig?.extra?.supabaseAnonKey || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseAnonKey) {
      return {
        success: false,
        error: 'Supabase anon key not configured',
      };
    }

    console.log('📡 Calling swap function:', functionUrl);

    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': supabaseAnonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from_asset: request.from_asset,
        to_asset: request.to_asset,
        from_amount: request.from_amount,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { error: errorText || `HTTP ${response.status}` };
      }
      
      console.error('❌ Error in swap:', response.status, errorText);
      return {
        success: false,
        error: errorData.error || `Failed to swap crypto: ${response.status}`,
      };
    }

    const result = await response.json();
    
    console.log('✅ Swap response:', result);

    if (result.success) {
      return {
        success: true,
        from_asset: result.from_asset,
        to_asset: result.to_asset,
        from_amount: result.from_amount,
        to_amount: result.to_amount,
        value_in_ngn: result.value_in_ngn,
        swap_fee: result.swap_fee,
        new_balances: result.new_balances,
        exchange_rate: result.exchange_rate,
      };
    } else {
      return {
        success: false,
        error: result.error || 'Failed to execute swap',
      };
    }
  } catch (error: any) {
    console.error('❌ Exception in swap:', error);
    return {
      success: false,
      error: error.message || 'Failed to execute swap',
    };
  }
}
