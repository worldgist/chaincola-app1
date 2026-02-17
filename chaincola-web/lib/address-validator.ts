/**
 * Validates cryptocurrency addresses
 */
export function validateAddress(address: string, symbol: string): { valid: boolean; error?: string } {
  if (!address || address.trim().length === 0) {
    return { valid: false, error: 'Address cannot be empty' };
  }

  const trimmedAddress = address.trim();

  switch (symbol.toUpperCase()) {
    case 'BTC':
      // Bitcoin addresses: starts with 1, 3, or bc1, length varies
      if (/^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(trimmedAddress) || 
          /^bc1[a-z0-9]{39,59}$/.test(trimmedAddress)) {
        return { valid: true };
      }
      return { valid: false, error: 'Invalid Bitcoin address format' };

    case 'ETH':
      // Ethereum addresses: starts with 0x, followed by 40 hex characters
      if (/^0x[a-fA-F0-9]{40}$/.test(trimmedAddress)) {
        return { valid: true };
      }
      return { valid: false, error: 'Invalid Ethereum address format' };

    case 'TRX':
      // Tron addresses: starts with T, followed by 33 base58 characters
      if (/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(trimmedAddress)) {
        return { valid: true };
      }
      return { valid: false, error: 'Invalid Tron address format' };

    case 'XRP':
      // Ripple addresses: starts with r, followed by base58 characters
      if (/^r[1-9A-HJ-NP-Za-km-z]{25,34}$/.test(trimmedAddress)) {
        return { valid: true };
      }
      return { valid: false, error: 'Invalid Ripple address format' };

    case 'SOL':
      // Solana addresses: base58, length 32-44 characters
      if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(trimmedAddress)) {
        return { valid: true };
      }
      return { valid: false, error: 'Invalid Solana address format' };

    case 'USDT':
    case 'USDC':
      // USDT/USDC on Ethereum: same as ETH
      if (/^0x[a-fA-F0-9]{40}$/.test(trimmedAddress)) {
        return { valid: true };
      }
      return { valid: false, error: 'Invalid address format for USDT/USDC' };

    default:
      // Generic validation: at least 10 characters
      if (trimmedAddress.length >= 10) {
        return { valid: true };
      }
      return { valid: false, error: 'Invalid address format' };
  }
}

/**
 * Extracts address from QR code data
 */
export function extractAddressFromQR(qrData: string): string {
  // Remove common QR code prefixes
  let address = qrData.trim();
  
  // Remove protocol prefixes
  address = address.replace(/^(bitcoin:|ethereum:|tron:|ripple:|solana:)/i, '');
  
  // Remove query parameters (e.g., ?amount=1.0)
  address = address.split('?')[0];
  address = address.split('&')[0];
  
  return address.trim();
}










