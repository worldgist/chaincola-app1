/**
 * Contract address checker for Ethereum
 * Checks if an Ethereum address is a contract or an EOA (Externally Owned Account)
 */

const ALCHEMY_URL = 'https://eth-mainnet.g.alchemy.com/v2/3L_iw-7-b25_bzLHmLyUJ';

export interface ContractCheckResult {
  isContract: boolean;
  error?: string;
}

/**
 * Check if an Ethereum address is a contract
 * @param address - Ethereum address to check
 * @returns Promise with contract check result
 */
export async function checkIfContract(address: string): Promise<ContractCheckResult> {
  try {
    if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return {
        isContract: false,
        error: 'Invalid Ethereum address format',
      };
    }

    const response = await fetch(ALCHEMY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_getCode',
        params: [address, 'latest'],
        id: 1,
      }),
    });

    if (!response.ok) {
      return {
        isContract: false,
        error: 'Failed to check address',
      };
    }

    const data = await response.json();
    const code = data.result;
    const isContract = code && code !== '0x' && code !== '0x0';

    return {
      isContract,
    };
  } catch (error: any) {
    return {
      isContract: false,
      error: error.message || 'Failed to check if address is a contract',
    };
  }
}











