'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { useAuth } from '@/contexts/AuthContext';
import { getUserCryptoBalances, formatCryptoBalance, formatNgnValue, getLunoPrices } from '@/lib/crypto-price-service';

interface CryptoAsset {
  id: string;
  name: string;
  symbol: string;
  logo: string;
  balance: number;
  pricePerUnitNGN?: string;
}

const cryptoAssetsConfig = [
  { id: '1', name: 'Bitcoin', symbol: 'BTC', logo: '/images/bitcoin.png' },
  { id: '2', name: 'Ethereum', symbol: 'ETH', logo: '/images/ethereum.png' },
  { id: '3', name: 'Tether', symbol: 'USDT', logo: '/images/tether.png' },
  { id: '4', name: 'USD Coin', symbol: 'USDC', logo: '/images/usdc.png' },
  { id: '5', name: 'Ripple', symbol: 'XRP', logo: '/images/ripple.png' },
  { id: '6', name: 'Solana', symbol: 'SOL', logo: '/images/solana.png' },
];

interface CryptoSelectModalProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (cryptoId: string) => void;
  action: 'send' | 'receive' | 'buy';
}

export default function CryptoSelectModal({
  visible,
  onClose,
  onSelect,
  action,
}: CryptoSelectModalProps) {
  const { user } = useAuth();
  const [cryptoAssets, setCryptoAssets] = useState<CryptoAsset[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (visible && user) {
      fetchCryptoAssets();
    } else if (visible) {
      // Show default assets even without user
      const defaultAssets = cryptoAssetsConfig.map((config) => ({
        ...config,
        balance: 0,
        pricePerUnitNGN: 'Loading...',
      }));
      setCryptoAssets(defaultAssets);
      fetchPrices();
    }
  }, [visible, user]);

  const fetchCryptoAssets = async () => {
    if (!user?.id) {
      setCryptoAssets(cryptoAssetsConfig.map((config) => ({
        ...config,
        balance: 0,
        pricePerUnitNGN: 'Loading...',
      })));
      fetchPrices();
      return;
    }

    try {
      setLoading(true);
      
      const [balancesResult, pricesResult] = await Promise.all([
        getUserCryptoBalances(user.id),
        getLunoPrices(['BTC', 'ETH', 'USDT', 'USDC', 'XRP', 'SOL']),
      ]);

      const assets: CryptoAsset[] = cryptoAssetsConfig.map((config) => {
        const balanceData = balancesResult.balances?.[config.symbol];
        const balance = balanceData?.balance || 0;
        const price = pricesResult.prices?.[config.symbol];
        
        return {
          ...config,
          balance,
          pricePerUnitNGN: price ? formatNgnValue(price.price_ngn) : 'N/A',
        };
      });

      setCryptoAssets(assets);
    } catch (error: any) {
      console.error('Error fetching crypto assets:', error);
      // Fallback to default assets
      setCryptoAssets(cryptoAssetsConfig.map((config) => ({
        ...config,
        balance: 0,
        pricePerUnitNGN: 'N/A',
      })));
    } finally {
      setLoading(false);
    }
  };

  const fetchPrices = async () => {
    try {
      const pricesResult = await getLunoPrices(['BTC', 'ETH', 'USDT', 'USDC']);
      
      setCryptoAssets((prev) =>
        prev.map((asset) => {
          const price = pricesResult.prices?.[asset.symbol];
          return {
            ...asset,
            pricePerUnitNGN: price ? formatNgnValue(price.price_ngn) : 'N/A',
          };
        })
      );
    } catch (error) {
      console.error('Error fetching prices:', error);
    }
  };

  const handleSelect = (cryptoId: string) => {
    onSelect(cryptoId);
    onClose();
  };

  const getActionTitle = () => {
    switch (action) {
      case 'send':
        return 'Select Crypto to Send';
      case 'receive':
        return 'Select Crypto to Receive';
      case 'buy':
        return 'Select Crypto to Buy';
      default:
        return 'Select Cryptocurrency';
    }
  };

  if (!visible) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl max-w-md w-full max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-900">{getActionTitle()}</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Crypto List */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
            </div>
          ) : (
            <div className="space-y-2">
              {cryptoAssets.map((crypto) => (
                <button
                  key={crypto.id}
                  onClick={() => handleSelect(crypto.id)}
                  className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-gray-200 hover:border-purple-300 hover:bg-purple-50 transition-all text-left"
                >
                  <div className="relative w-12 h-12 flex-shrink-0">
                    <Image
                      src={crypto.logo}
                      alt={crypto.name}
                      fill
                      className="object-contain"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900">{crypto.name}</h3>
                    <p className="text-sm text-gray-600">{crypto.symbol}</p>
                    {crypto.pricePerUnitNGN && (
                      <p className="text-xs text-gray-500 mt-1">
                        {crypto.pricePerUnitNGN} NGN
                      </p>
                    )}
                  </div>
                  {user && (
                    <div className="text-right flex-shrink-0">
                      <p className="font-semibold text-gray-900">
                        {formatCryptoBalance(crypto.balance, crypto.symbol)}
                      </p>
                      <p className="text-xs text-gray-500">{crypto.symbol}</p>
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}










