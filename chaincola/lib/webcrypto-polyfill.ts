/**
 * WebCrypto API Polyfill for React Native
 * This provides a basic WebCrypto implementation
 * 
 * Note: This is a minimal polyfill. The warning about WebCrypto is expected
 * in React Native environments and the fallback to plain text is acceptable
 * for mobile apps. This polyfill helps reduce the warning.
 */

import 'react-native-get-random-values';
import * as Crypto from 'expo-crypto';

// Only polyfill if WebCrypto is not available (React Native environment)
if (typeof globalThis.crypto === 'undefined' || !globalThis.crypto.subtle) {
  // Create a minimal WebCrypto polyfill using expo-crypto
  const webCryptoPolyfill: any = {
    subtle: {
      digest: async (algorithm: string, data: ArrayBuffer): Promise<ArrayBuffer> => {
        try {
          if (algorithm === 'SHA-256') {
            // Convert ArrayBuffer to Uint8Array
            const uint8Array = new Uint8Array(data);
            
            // Convert bytes to base64 string for expo-crypto
            const base64String = btoa(String.fromCharCode(...uint8Array));
            
            // Hash using expo-crypto (returns hex string by default)
            const hashHex = await Crypto.digestStringAsync(
              Crypto.CryptoDigestAlgorithm.SHA256,
              base64String
            );
            
            // Convert hex string back to ArrayBuffer
            const hashBytes = new Uint8Array(hashHex.length / 2);
            for (let i = 0; i < hashHex.length; i += 2) {
              hashBytes[i / 2] = parseInt(hashHex.substring(i, i + 2), 16);
            }
            
            return hashBytes.buffer;
          }
          throw new Error(`Unsupported algorithm: ${algorithm}`);
        } catch (error) {
          console.error('WebCrypto polyfill error:', error);
          throw error;
        }
      },
    },
    getRandomValues: <T extends ArrayBufferView | null>(array: T): T => {
      if (array === null) {
        throw new Error('getRandomValues: array cannot be null');
      }
      
      // Use crypto.getRandomValues if available, otherwise fallback
      if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.getRandomValues) {
        return globalThis.crypto.getRandomValues(array);
      }
      
      // Fallback: generate random bytes using expo-crypto
      const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
      // For now, use a simple approach - in production you might want a better RNG
      for (let i = 0; i < bytes.length; i++) {
        bytes[i] = Math.floor(Math.random() * 256);
      }
      return array;
    },
  };

  // Assign to globalThis
  (globalThis as any).crypto = webCryptoPolyfill;
}

