'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { useAuth } from '@/contexts/AuthContext';
import { getUserCryptoBalances, formatCryptoBalance, formatNgnValue, getLunoPrices } from '@/lib/crypto-price-service';
import { validateAddress, extractAddressFromQR } from '@/lib/address-validator';
import Navbar from '../components/Navbar';
import CryptoSelectModal from '../components/CryptoSelectModal';

const cryptoData: Record<string, any> = {
  '1': { name: 'Bitcoin', symbol: 'BTC', logo: '/images/bitcoin.png' },
  '2': { name: 'Ethereum', symbol: 'ETH', logo: '/images/ethereum.png' },
  '3': { name: 'Tether', symbol: 'USDT', logo: '/images/tether.png' },
  '4': { name: 'USD Coin', symbol: 'USDC', logo: '/images/usdc.png' },
};

export default function SendCryptoPage() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [cryptoId, setCryptoId] = useState<string>(searchParams.get('id') || '1');
  const [showCryptoModal, setShowCryptoModal] = useState(false);
  const crypto = cryptoData[cryptoId];

  const [amount, setAmount] = useState('');
  const [recipientAddress, setRecipientAddress] = useState('');
  const [memo, setMemo] = useState('');
  const [cryptoBalance, setCryptoBalance] = useState(0);
  const [balanceLoading, setBalanceLoading] = useState(true);
  const [cryptoPrice, setCryptoPrice] = useState<number | null>(null);
  const [addressError, setAddressError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [sentAmount, setSentAmount] = useState('');

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
  }, [user, crypto, router]);

  const fetchBalance = async () => {
    if (!user?.id || !crypto) return;

    try {
      setBalanceLoading(true);
      const [balancesResult, pricesResult] = await Promise.all([
        getUserCryptoBalances(user.id),
        getLunoPrices([crypto.symbol]),
      ]);

      if (balancesResult.balances?.[crypto.symbol]) {
        setCryptoBalance(balancesResult.balances[crypto.symbol].balance || 0);
      }

      if (pricesResult.prices?.[crypto.symbol]) {
        setCryptoPrice(pricesResult.prices[crypto.symbol].price_ngn);
      }
    } catch (error: any) {
      console.error('Error fetching balance:', error);
    } finally {
      setBalanceLoading(false);
    }
  };

  const handleQuickAmount = (percentage: number) => {
    const quickCrypto = (cryptoBalance * percentage) / 100;
    setAmount(quickCrypto.toFixed(8));
  };

  const handleAddressChange = (text: string) => {
    setRecipientAddress(text);
    setAddressError(null);

    if (text.length > 10) {
      const validation = validateAddress(text, crypto.symbol);
      if (!validation.valid) {
        setAddressError(validation.error || 'Invalid address format');
      }
    }
  };

  const handlePasteAddress = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        const extractedAddress = extractAddressFromQR(text);
        const validation = validateAddress(extractedAddress, crypto.symbol);
        
        if (validation.valid) {
          setRecipientAddress(extractedAddress);
          setAddressError(null);
        } else {
          setAddressError(validation.error || 'Invalid address format');
        }
      }
    } catch (error) {
      console.error('Failed to paste address:', error);
    }
  };

  const handleProceed = () => {
    if (!amount || parseFloat(amount) <= 0) {
      alert('Please enter a valid amount');
      return;
    }

    if (parseFloat(amount) > cryptoBalance) {
      alert('Insufficient balance');
      return;
    }

    if (!recipientAddress || !validateAddress(recipientAddress, crypto.symbol).valid) {
      alert('Please enter a valid recipient address');
      return;
    }

    setShowConfirmModal(true);
  };

  const handleConfirmSend = async () => {
    setShowConfirmModal(false);
    setSending(true);

    try {
      // TODO: Call send crypto API endpoint
      // For now, simulate success
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      setSentAmount(amount);
      setSending(false);
      setShowSuccessModal(true);
      setAmount('');
      setRecipientAddress('');
      setMemo('');
      setAddressError(null);
      
      setTimeout(() => {
        fetchBalance();
      }, 1000);
    } catch (error: any) {
      alert(error.message || 'Failed to send crypto. Please try again.');
      setSending(false);
    }
  };

  if (!crypto) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-purple-50">
        <Navbar />
        <div className="container mx-auto px-4 py-8 pt-24">
          <p>Crypto not found</p>
        </div>
      </main>
    );
  }

  const quickPercentages = [
    { label: '25%', value: 25 },
    { label: '50%', value: 50 },
    { label: '75%', value: 75 },
    { label: '100%', value: 100 },
  ];

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
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Send Crypto</h1>
          </div>

          {/* Crypto Info Card - Clickable to select */}
          <button
            onClick={() => setShowCryptoModal(true)}
            className="bg-white p-6 rounded-xl border border-gray-200 mb-6 flex items-center gap-4 w-full hover:border-purple-300 hover:bg-purple-50 transition-all text-left"
          >
            <div className="relative w-14 h-14">
              <Image src={crypto.logo} alt={crypto.name} fill className="object-contain" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-gray-900">{crypto.name}</h3>
              <p className="text-sm text-gray-600">
                {cryptoPrice ? formatNgnValue(cryptoPrice) : 'Price unavailable'}
              </p>
            </div>
            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>

          {/* Available Balance */}
          <div className="bg-purple-50 p-6 rounded-xl border border-purple-200 mb-6 text-center">
            <p className="text-sm text-purple-600 font-medium mb-2">Available Balance</p>
            {balanceLoading ? (
              <div className="animate-pulse h-8 bg-purple-200 rounded w-48 mx-auto"></div>
            ) : (
              <p className="text-2xl font-bold text-purple-600">
                {formatCryptoBalance(cryptoBalance, crypto.symbol)} {crypto.symbol}
              </p>
            )}
          </div>

          {/* Amount Input */}
          <div className="mb-6">
            <label className="block text-sm font-semibold text-gray-700 mb-2">Amount</label>
            <div className="flex items-center bg-gray-50 rounded-xl border border-gray-200 p-4">
              <span className="text-gray-700 font-semibold mr-2">{crypto.symbol}</span>
              <input
                type="number"
                step="0.00000001"
                placeholder="0.00000000"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="flex-1 bg-transparent text-2xl font-bold text-gray-900 outline-none"
              />
            </div>
            {amount && cryptoPrice && (
              <p className="text-sm text-gray-600 mt-2 text-right">
                ≈ {formatNgnValue(parseFloat(amount) * cryptoPrice)}
              </p>
            )}
            {amount && parseFloat(amount) > cryptoBalance && (
              <p className="text-sm text-red-600 mt-2">Insufficient balance</p>
            )}
          </div>

          {/* Quick Amounts */}
          <div className="mb-6">
            <label className="block text-sm font-semibold text-gray-700 mb-2">Quick Amounts</label>
            <div className="flex gap-3">
              {quickPercentages.map((item) => (
                <button
                  key={item.value}
                  onClick={() => handleQuickAmount(item.value)}
                  className={`flex-1 py-3 px-4 rounded-xl border-2 font-semibold transition-all ${
                    amount === ((cryptoBalance * item.value) / 100).toFixed(8)
                      ? 'bg-purple-600 border-purple-600 text-white'
                      : 'bg-white border-gray-200 text-gray-700 hover:border-purple-300'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {/* Recipient Address */}
          <div className="mb-6">
            <label className="block text-sm font-semibold text-gray-700 mb-2">Recipient Address</label>
            <div className="relative">
              <textarea
                value={recipientAddress}
                onChange={(e) => handleAddressChange(e.target.value)}
                placeholder="Enter recipient address"
                className={`w-full p-4 rounded-xl border-2 bg-gray-50 font-mono text-sm ${
                  addressError ? 'border-red-500' : 'border-gray-200'
                } focus:border-purple-500 focus:outline-none`}
                rows={3}
              />
              <button
                onClick={handlePasteAddress}
                className="absolute top-2 right-2 p-2 text-purple-600 hover:bg-purple-50 rounded-lg"
                title="Paste from clipboard"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </button>
            </div>
            {addressError && (
              <p className="text-sm text-red-600 mt-2">{addressError}</p>
            )}
          </div>

          {/* Memo */}
          <div className="mb-6">
            <label className="block text-sm font-semibold text-gray-700 mb-2">Memo (Optional)</label>
            <textarea
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="Add a note (optional)"
              className="w-full p-4 rounded-xl border-2 border-gray-200 bg-gray-50 focus:border-purple-500 focus:outline-none"
              rows={2}
            />
          </div>

          {/* Send Button */}
          <button
            onClick={handleProceed}
            disabled={!amount || !recipientAddress || sending}
            className="w-full bg-gradient-to-r from-purple-600 to-purple-700 text-white py-4 rounded-xl font-semibold hover:from-purple-700 hover:to-purple-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
            Send {crypto.symbol}
          </button>

          {/* Confirmation Modal */}
          {showConfirmModal && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-2xl p-6 max-w-md w-full">
                <h3 className="text-xl font-bold mb-4">Confirm Send</h3>
                <div className="space-y-3 mb-6">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Crypto:</span>
                    <span className="font-semibold">{crypto.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Amount:</span>
                    <span className="font-semibold">{parseFloat(amount).toFixed(8)} {crypto.symbol}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">To:</span>
                    <span className="font-mono text-sm">{recipientAddress.substring(0, 20)}...</span>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowConfirmModal(false)}
                    className="flex-1 py-3 px-4 rounded-xl border-2 border-gray-200 font-semibold text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleConfirmSend}
                    className="flex-1 bg-gradient-to-r from-purple-600 to-purple-700 text-white py-3 px-4 rounded-xl font-semibold hover:from-purple-700 hover:to-purple-800"
                  >
                    Confirm Send
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Success Modal */}
          {showSuccessModal && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-2xl p-6 max-w-md w-full text-center">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h3 className="text-2xl font-bold mb-2">Send Successful!</h3>
                <p className="text-gray-600 mb-6">
                  You have successfully sent {parseFloat(sentAmount).toFixed(8)} {crypto.symbol} to the recipient address.
                </p>
                <button
                  onClick={() => {
                    setShowSuccessModal(false);
                    router.push('/transactions');
                  }}
                  className="w-full bg-gradient-to-r from-purple-600 to-purple-700 text-white py-3 rounded-xl font-semibold hover:from-purple-700 hover:to-purple-800"
                >
                  OK
                </button>
              </div>
            </div>
          )}

          {/* Loading Overlay */}
          {sending && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
              <div className="bg-white rounded-2xl p-8 text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
                <p className="text-gray-900 font-semibold">Sending {crypto.symbol}...</p>
                <p className="text-sm text-gray-600 mt-2">Please wait while we process your transaction</p>
              </div>
            </div>
          )}

          {/* Crypto Select Modal */}
          <CryptoSelectModal
            visible={showCryptoModal}
            onClose={() => setShowCryptoModal(false)}
            onSelect={(id) => {
              setCryptoId(id);
              setShowCryptoModal(false);
            }}
            action="send"
          />
        </div>
      </div>
    </main>
  );
}

