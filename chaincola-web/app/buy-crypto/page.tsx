'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { useAuth } from '@/contexts/AuthContext';
import { getUserCryptoBalances, formatCryptoBalance, formatNgnValue, getLunoPrices } from '@/lib/crypto-price-service';
import { instantBuyCrypto } from '@/lib/buy-crypto-service';
import Navbar from '../components/Navbar';
import CryptoSelectModal from '../components/CryptoSelectModal';

const cryptoData: Record<string, any> = {
  '1': { name: 'Bitcoin', symbol: 'BTC', logo: '/images/bitcoin.png' },
  '2': { name: 'Ethereum', symbol: 'ETH', logo: '/images/ethereum.png' },
  '3': { name: 'Tether', symbol: 'USDT', logo: '/images/tether.png' },
  '4': { name: 'USD Coin', symbol: 'USDC', logo: '/images/usdc.png' },
  '5': { name: 'Ripple', symbol: 'XRP', logo: '/images/ripple.png' },
  '6': { name: 'Solana', symbol: 'SOL', logo: '/images/solana.png' },
};

export default function BuyCryptoPage() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [cryptoId, setCryptoId] = useState<string>(searchParams.get('id') || '1');
  const [showCryptoModal, setShowCryptoModal] = useState(false);
  const crypto = cryptoData[cryptoId];

  const [ngnAmount, setNgnAmount] = useState('');
  const [ngnBalance, setNgnBalance] = useState(0);
  const [balanceLoading, setBalanceLoading] = useState(true);
  const [cryptoPrice, setCryptoPrice] = useState<number | null>(null);
  const [buying, setBuying] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [buyResult, setBuyResult] = useState<any>(null);
  const [estimatedCrypto, setEstimatedCrypto] = useState<number | null>(null);

  useEffect(() => {
    if (!user) {
      router.push('/auth/signin');
      return;
    }
    if (!crypto) {
      setShowCryptoModal(true);
      return;
    }
    fetchBalance();
    fetchPrice();
  }, [user, crypto, router]);

  useEffect(() => {
    if (cryptoPrice && ngnAmount && parseFloat(ngnAmount) > 0) {
      const amount = parseFloat(ngnAmount);
      const fee = amount * 0.01; // 1% fee
      const afterFee = amount - fee;
      const estimated = afterFee / cryptoPrice;
      setEstimatedCrypto(estimated);
    } else {
      setEstimatedCrypto(null);
    }
  }, [ngnAmount, cryptoPrice]);

  const fetchBalance = async () => {
    if (!user?.id || !crypto) return;

    try {
      setBalanceLoading(true);
      const balancesResult = await getUserCryptoBalances(user.id);

      if (balancesResult.balances?.['NGN']) {
        setNgnBalance(parseFloat(balancesResult.balances['NGN'].balance || '0'));
      }
    } catch (error: any) {
      console.error('Error fetching balance:', error);
    } finally {
      setBalanceLoading(false);
    }
  };

  const fetchPrice = async () => {
    if (!crypto) return;

    try {
      const pricesResult = await getLunoPrices([crypto.symbol]);
      if (pricesResult.prices?.[crypto.symbol]) {
        setCryptoPrice(pricesResult.prices[crypto.symbol].price_ngn);
      }
    } catch (error: any) {
      console.error('Error fetching price:', error);
    }
  };

  const handleQuickAmount = (percentage: number) => {
    const amount = (ngnBalance * percentage) / 100;
    setNgnAmount(amount.toFixed(2));
  };

  const quickAmounts = [
    { label: '25%', value: 25 },
    { label: '50%', value: 50 },
    { label: '75%', value: 75 },
    { label: '100%', value: 100 },
  ];

  const handleBuy = async () => {
    if (!ngnAmount || parseFloat(ngnAmount) <= 0) {
      alert('Please enter a valid NGN amount');
      return;
    }

    const amount = parseFloat(ngnAmount);
    if (amount > ngnBalance) {
      alert(`Insufficient balance. You have ${formatNgnValue(ngnBalance)} available`);
      return;
    }

    if (amount < 100) {
      alert('Minimum purchase amount is ₦100');
      return;
    }

    setShowConfirmModal(true);
  };

  const handleConfirmBuy = async () => {
    if (!crypto) return;

    setBuying(true);
    setShowConfirmModal(false);

    try {
      const result = await instantBuyCrypto({
        asset: crypto.symbol as 'BTC' | 'ETH' | 'USDT' | 'USDC' | 'XRP' | 'SOL',
        ngn_amount: parseFloat(ngnAmount),
      });

      if (result.success && result.crypto_amount !== undefined) {
        setBuyResult(result);
        setShowSuccessModal(true);
        await fetchBalance();
      } else {
        alert(result.error || 'Failed to buy crypto');
      }
    } catch (error: any) {
      alert(error.message || 'Failed to buy crypto');
    } finally {
      setBuying(false);
    }
  };

  const handleCloseSuccess = () => {
    setShowSuccessModal(false);
    setNgnAmount('');
    setBuyResult(null);
    router.push('/dashboard');
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-purple-50">
      <Navbar />
      <div className="container mx-auto px-4 py-8 pt-24">
        <div className="max-w-2xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <Link href="/dashboard" className="inline-flex items-center text-purple-600 hover:text-purple-700 mb-4">
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back
            </Link>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Buy Crypto</h1>
            <p className="text-gray-600">Purchase cryptocurrency instantly with Naira</p>
          </div>

          {/* Crypto Info Card - Clickable to select */}
          <button
            onClick={() => setShowCryptoModal(true)}
            className="bg-white p-6 rounded-xl border border-gray-200 mb-6 flex items-center gap-4 w-full hover:border-purple-300 hover:bg-purple-50 transition-all text-left shadow-sm"
          >
            <div className="relative w-14 h-14">
              <Image src={crypto.logo} alt={crypto.name} fill className="object-contain" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-gray-900">{crypto.name}</h3>
              <p className="text-sm text-gray-600">
                {cryptoPrice ? `${formatNgnValue(cryptoPrice)} per unit (buy rate)` : 'Price unavailable'}
              </p>
            </div>
            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>

          {/* Available Balance */}
          <div className="bg-purple-50 p-6 rounded-xl border border-purple-200 mb-6 text-center">
            <p className="text-sm text-purple-600 font-medium mb-2">Available NGN Balance</p>
            {balanceLoading ? (
              <div className="animate-pulse">
                <div className="h-8 bg-purple-200 rounded w-32 mx-auto"></div>
              </div>
            ) : (
              <p className="text-3xl font-bold text-purple-900">{formatNgnValue(ngnBalance)}</p>
            )}
          </div>

          {/* Amount Input */}
          <div className="bg-white p-6 rounded-xl border border-gray-200 mb-6 shadow-sm">
            <label className="block text-sm font-semibold text-gray-700 mb-3">
              Amount to Spend (NGN)
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-500 font-medium">
                ₦
              </span>
              <input
                type="number"
                step="0.01"
                min="100"
                className="w-full pl-8 pr-4 py-4 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent text-lg"
                placeholder="0.00"
                value={ngnAmount}
                onChange={(e) => setNgnAmount(e.target.value)}
                disabled={buying || balanceLoading}
              />
            </div>

            {/* Quick Amount Buttons */}
            <div className="flex gap-2 mt-4">
              {quickAmounts.map(({ label, value }) => (
                <button
                  key={value}
                  onClick={() => handleQuickAmount(value)}
                  disabled={buying || balanceLoading}
                  className="flex-1 px-4 py-2 bg-purple-100 text-purple-700 rounded-lg font-medium hover:bg-purple-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Estimated Crypto Amount */}
            {estimatedCrypto !== null && cryptoPrice && (
              <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-green-700 font-medium">You'll receive:</span>
                  <span className="text-lg font-bold text-green-900">
                    {formatCryptoBalance(estimatedCrypto, crypto.symbol)} {crypto.symbol}
                  </span>
                </div>
                <div className="flex justify-between items-center mt-2 text-xs text-green-600">
                  <span>Fee (1%):</span>
                  <span>{formatNgnValue(parseFloat(ngnAmount) * 0.01)}</span>
                </div>
              </div>
            )}
          </div>

          {/* Buy Button */}
          <button
            onClick={handleBuy}
            disabled={buying || balanceLoading || !ngnAmount || parseFloat(ngnAmount) <= 0 || parseFloat(ngnAmount) > ngnBalance}
            className="w-full bg-purple-600 text-white py-4 rounded-lg font-semibold hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg text-lg"
          >
            {buying ? 'Processing...' : 'Buy ' + crypto.symbol}
          </button>

          {/* Info Section */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 mt-6">
            <h3 className="font-semibold mb-3 text-blue-900">How it works</h3>
            <ol className="list-decimal list-inside space-y-2 text-sm text-blue-800">
              <li>Select the cryptocurrency you want to buy</li>
              <li>Enter the NGN amount you want to spend</li>
              <li>Review the estimated crypto amount you'll receive</li>
              <li>Confirm your purchase</li>
              <li>Crypto is instantly credited to your wallet</li>
            </ol>
            <div className="mt-4 p-3 bg-blue-100 rounded-lg">
              <p className="text-xs text-blue-900">
                <strong>Note:</strong> A 1% platform fee applies to all purchases. Minimum purchase amount is ₦100.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Crypto Selection Modal */}
      <CryptoSelectModal
        visible={showCryptoModal}
        onClose={() => setShowCryptoModal(false)}
        onSelect={(id) => {
          setCryptoId(id);
          setShowCryptoModal(false);
          fetchPrice();
        }}
        action="buy"
      />

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-4">Confirm Purchase</h3>
            <div className="space-y-3 mb-6">
              <div className="flex justify-between">
                <span className="text-gray-600">Cryptocurrency:</span>
                <span className="font-semibold">{crypto.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Amount to Spend:</span>
                <span className="font-semibold">{formatNgnValue(parseFloat(ngnAmount))}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Platform Fee (1%):</span>
                <span className="font-semibold">{formatNgnValue(parseFloat(ngnAmount) * 0.01)}</span>
              </div>
              {estimatedCrypto !== null && (
                <div className="flex justify-between pt-3 border-t border-gray-200">
                  <span className="text-gray-900 font-bold">You'll Receive:</span>
                  <span className="text-lg font-bold text-purple-600">
                    {formatCryptoBalance(estimatedCrypto, crypto.symbol)} {crypto.symbol}
                  </span>
                </div>
              )}
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirmModal(false)}
                className="flex-1 px-4 py-3 bg-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-300 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmBuy}
                disabled={buying}
                className="flex-1 px-4 py-3 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 transition-colors disabled:opacity-50"
              >
                {buying ? 'Processing...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success Modal */}
      {showSuccessModal && buyResult && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-2">Purchase Successful!</h3>
              <p className="text-gray-600">Your crypto has been credited to your wallet</p>
            </div>
            <div className="space-y-3 mb-6 bg-green-50 p-4 rounded-lg">
              <div className="flex justify-between">
                <span className="text-gray-600">Crypto Received:</span>
                <span className="font-bold text-green-900">
                  {formatCryptoBalance(buyResult.crypto_amount || 0, crypto.symbol)} {crypto.symbol}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Amount Spent:</span>
                <span className="font-semibold">{formatNgnValue(buyResult.ngn_amount || 0)}</span>
              </div>
            </div>
            <button
              onClick={handleCloseSuccess}
              className="w-full px-4 py-3 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 transition-colors"
            >
              Go to Dashboard
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
