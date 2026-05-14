'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { useAuth } from '@/contexts/AuthContext';
import { getUserCryptoBalances, formatCryptoBalance, formatUsdValue, formatNgnValue, getLunoPrices } from '@/lib/crypto-price-service';
import Navbar from '../components/Navbar';
import BottomActionBar from '../components/BottomActionBar';
import BottomTabBar from '../components/BottomTabBar';

interface CryptoAsset {
  id: string;
  name: string;
  symbol: string;
  logo: string;
  balance: string;
  usdValue: string;
  pricePerUnit?: string;
  pricePerUnitNGN?: string;
}

const cryptoAssetsConfig = [
  { id: '1', name: 'Bitcoin', symbol: 'BTC', logo: '/images/bitcoin.png' },
  { id: '2', name: 'Ethereum', symbol: 'ETH', logo: '/images/ethereum.png' },
  { id: '3', name: 'Tether', symbol: 'USDT', logo: '/images/tether.png' },
  { id: '4', name: 'USD Coin', symbol: 'USDC', logo: '/images/usdc.png' },
];

export default function AssetsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [cryptoAssets, setCryptoAssets] = useState<CryptoAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalValue, setTotalValue] = useState(0);

  useEffect(() => {
    if (!user) {
      router.push('/auth/signin');
      return;
    }
    fetchAssets();
  }, [user, router]);

  const fetchAssets = async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    try {
      setError(null);
      setLoading(true);
      
      const [balancesResult, pricesResult] = await Promise.all([
        getUserCryptoBalances(user.id),
        getLunoPrices(['BTC', 'ETH', 'USDT', 'USDC', 'XRP', 'SOL'], { retailOverlay: false }),
      ]);

      const assets: CryptoAsset[] = cryptoAssetsConfig.map((config) => {
        const balanceData = balancesResult.balances?.[config.symbol];
        const balance = balanceData?.balance || 0;
        const price = pricesResult.prices?.[config.symbol];
        
        let usdValue = 0;
        if (price && balance > 0) {
          usdValue = balance * price.price_usd;
        }
        
        return {
          ...config,
          balance: formatCryptoBalance(balance, config.symbol),
          usdValue: formatUsdValue(usdValue),
          pricePerUnit: price ? formatUsdValue(price.price_usd) : 'N/A',
          pricePerUnitNGN: price ? formatNgnValue(price.price_ngn) : 'N/A',
        };
      });

      setCryptoAssets(assets);
      
      const total = assets.reduce((sum, asset) => {
        const value = parseFloat(asset.usdValue.replace(/[^0-9.]/g, '')) || 0;
        return sum + value;
      }, 0);
      setTotalValue(total);
    } catch (err: unknown) {
      console.error('Error fetching assets:', err);
      const message = ((): string => {
        if (err instanceof Error) return err.message;
        if (typeof err === 'string') return err;
        try {
          return JSON.stringify(err) || String(err);
        } catch {
          return 'Failed to load assets';
        }
      })();
      setError(message || 'Failed to load assets');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-purple-50">
        <Navbar />
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading assets...</p>
          </div>
          </div>
          <BottomActionBar
            actions={[{ href: '/buy-crypto', label: 'Buy Crypto', variant: 'primary' }]}
          />
          <BottomTabBar current="assets" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-purple-50">
      <Navbar />
      <div className="container mx-auto px-4 py-8 pt-24">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Assets</h1>
            <p className="text-gray-600">Your cryptocurrency assets</p>
          </div>

          {/* Total Assets Card */}
          <div className="bg-gradient-to-br from-purple-600 via-purple-700 to-purple-800 rounded-2xl p-8 mb-8 shadow-xl">
            <div className="text-center">
              <p className="text-purple-200 text-sm font-medium mb-2">Total Assets</p>
              <h2 className="text-4xl font-bold text-white mb-6">${totalValue.toFixed(2)}</h2>
              {/* Primary action moved to bottom action bar for parity with mobile app */}
              <div className="hidden" />
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
              {error}
            </div>
          )}

          {/* Assets List */}
          <div className="space-y-4">
            {cryptoAssets.length > 0 ? (
              cryptoAssets.map((asset) => (
                <div
                  key={asset.id}
                  className="bg-white p-6 rounded-xl border border-gray-200 hover:border-purple-300 hover:shadow-md transition-all"
                >
                  <div className="flex items-center justify-between">
                    <Link href={`/crypto-detail?id=${asset.id}`} className="flex items-center gap-4 flex-1">
                      <div className="relative w-12 h-12">
                        <Image
                          src={asset.logo}
                          alt={asset.name}
                          fill
                          className="object-contain"
                        />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold text-gray-900">{asset.name}</h3>
                        <p className="text-sm text-gray-600">{asset.symbol}</p>
                      </div>
                    </Link>
                    <div className="text-right">
                      <p className="font-semibold text-gray-900">{asset.balance}</p>
                      {asset.pricePerUnit && asset.pricePerUnit !== 'N/A' && (
                        <>
                          <p className="text-sm text-purple-600">{asset.pricePerUnit}</p>
                          {asset.pricePerUnitNGN && asset.pricePerUnitNGN !== 'N/A' && (
                            <p className="text-xs text-gray-500">{asset.pricePerUnitNGN}</p>
                          )}
                          {parseFloat(asset.balance.replace(/,/g, '')) > 0 && asset.usdValue !== '$0.00' && (
                            <p className="text-xs text-gray-500 mt-1">{asset.usdValue}</p>
                          )}
                        </>
                      )}
                      {asset.symbol === 'BTC' && parseFloat(asset.balance.replace(/,/g, '')) > 0 && (
                        <Link
                          href="/sell-btc"
                          className="mt-2 inline-block bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-purple-700 transition-colors"
                        >
                          Sell BTC
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="bg-white p-12 rounded-xl border border-gray-200 text-center">
                <svg className="w-16 h-16 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-gray-600">No assets found</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

