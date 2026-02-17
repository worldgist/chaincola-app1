/**
 * Address validation utilities for different cryptocurrencies
 */

// Bitcoin address validation (P2PKH, P2SH, Bech32)
export function isValidBitcoinAddress(address: string): boolean {
  if (!address || typeof address !== 'string') return false;
  
  // P2PKH addresses start with '1' (26-35 chars)
  // P2SH addresses start with '3' (26-35 chars)
  // Bech32 addresses start with 'bc1' (42-62 chars)
  const p2pkhPattern = /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/;
  const bech32Pattern = /^bc1[a-z0-9]{39,59}$/i;
  
  return p2pkhPattern.test(address) || bech32Pattern.test(address);
}

// Ethereum address validation (checksummed or lowercase)
export function isValidEthereumAddress(address: string): boolean {
  if (!address || typeof address !== 'string') return false;
  
  // Ethereum addresses are 42 characters (0x + 40 hex chars)
  const ethPattern = /^0x[a-fA-F0-9]{40}$/;
  
  return ethPattern.test(address);
}


// Solana address validation (base58, 32-44 chars)
export function isValidSolanaAddress(address: string): boolean {
  if (!address || typeof address !== 'string') return false;
  
  // Solana addresses are base58 encoded, typically 32-44 characters
  const solanaPattern = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
  
  return solanaPattern.test(address);
}

// Ripple address validation (base58, starts with 'r')
export function isValidRippleAddress(address: string): boolean {
  if (!address || typeof address !== 'string') return false;
  
  // Ripple addresses start with 'r' and are 25-35 characters
  const ripplePattern = /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;
  
  return ripplePattern.test(address);
}

/**
 * Validate address for a specific cryptocurrency
 */
export function validateAddress(address: string, currency: string): { valid: boolean; error?: string } {
  if (!address || !address.trim()) {
    return { valid: false, error: 'Address is required' };
  }

  const trimmedAddress = address.trim();

  switch (currency.toUpperCase()) {
    case 'BTC':
    case 'BITCOIN':
      if (!isValidBitcoinAddress(trimmedAddress)) {
        return { valid: false, error: 'Invalid Bitcoin address format' };
      }
      break;

    case 'ETH':
    case 'ETHEREUM':
      if (!isValidEthereumAddress(trimmedAddress)) {
        return { valid: false, error: 'Invalid Ethereum address format' };
      }
      break;


    case 'SOL':
    case 'SOLANA':
      if (!isValidSolanaAddress(trimmedAddress)) {
        return { valid: false, error: 'Invalid Solana address format' };
      }
      break;

    case 'XRP':
    case 'RIPPLE':
      if (!isValidRippleAddress(trimmedAddress)) {
        return { valid: false, error: 'Invalid Ripple address format' };
      }
      break;

    default:
      // For unknown currencies, do basic validation
      if (trimmedAddress.length < 10 || trimmedAddress.length > 100) {
        return { valid: false, error: 'Invalid address length' };
      }
  }

  return { valid: true };
}

/**
 * Extract address from QR code data
 * Handles various QR code formats:
 * - Plain address
 * - bitcoin:address
 * - ethereum:address
 * - Address with amount: bitcoin:address?amount=0.1
 */
export function extractAddressFromQR(qrData: string): string {
  if (!qrData) return '';

  // Remove whitespace
  let address = qrData.trim();

  // Handle URI schemes (bitcoin:, ethereum:, etc.)
  const uriMatch = address.match(/^(bitcoin|ethereum|solana|ripple|xrp):([a-zA-Z0-9]+)/i);
  if (uriMatch) {
    address = uriMatch[2];
  }

  // Handle addresses with parameters (e.g., bitcoin:address?amount=0.1)
  const paramMatch = address.match(/^([a-zA-Z0-9]+)[?&]/);
  if (paramMatch) {
    address = paramMatch[1];
  }

  // Extract destination tag for XRP (e.g., address?dt=123456)
  const dtMatch = address.match(/[?&]dt=(\d+)/);
  if (dtMatch) {
    // Keep the destination tag in the address for now
    // You might want to extract it separately
  }

  return address.trim();
}







