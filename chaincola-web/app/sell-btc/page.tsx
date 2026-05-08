'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { getSellBtcQuote, executeSellBtc, getSellBtcStatus } from '@/lib/buy-sell-service';

export default function SellBtcPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [btcAmount, setBtcAmount] = useState('');
  const [quote, setQuote] = useState<any>(null);
  const [sellId, setSellId] = useState<string | null>(null);
  const [sellStatus, setSellStatus] = useState<string | null>(null);
  const [btcBalance, setBtcBalance] = useState<number>(0);

  useEffect(() => {
    if (!user) {
      router.push('/login');
      return;
    }
    fetchBtcBalance();
  }, [user, router]);

  const fetchBtcBalance = async () => {
    try {
      const { getUserCryptoBalances } = await import('@/lib/crypto-price-service');
      const { balances } = await getUserCryptoBalances(user?.id || '');
      const btc = balances['BTC'];
      if (btc) {
        setBtcBalance(parseFloat(btc.balance || '0'));
      }
    } catch (error) {
      console.error('Error fetching BTC balance:', error);
    }
  };

  const handleGetQuote = async () => {
    if (!btcAmount || parseFloat(btcAmount) <= 0) {
      alert('Please enter a valid BTC amount');
      return;
    }

    const amount = parseFloat(btcAmount);
    if (amount > btcBalance) {
      alert(`Insufficient balance. You have ${btcBalance.toFixed(8)} BTC available`);
      return;
    }

    setLoading(true);
    try {
      const result = await getSellBtcQuote({ btc_amount: btcAmount });
      
      if (result.success && result.sell_id) {
        setQuote(result);
        setSellId(result.sell_id);
      } else {
        alert(result.error || 'Failed to get quote');
      }
    } catch (error: any) {
      alert(error.message || 'Failed to get quote');
    } finally {
      setLoading(false);
    }
  };

  const handleExecuteSell = async () => {
    if (!sellId) {
      alert('No sell order found');
      return;
    }

    if (!confirm(`Confirm selling ${quote.btc_amount} BTC for ₦${quote.final_ngn_payout}?`)) {
      return;
    }

    setExecuting(true);
    try {
      const result = await executeSellBtc({ sell_id: sellId });
      
      if (result.success) {
        setSellStatus(result.status || 'BTC_SENT');
        alert(`BTC transfer initiated. Transaction hash: ${result.btc_tx_hash}\n\nYour BTC will be sold automatically once credited on Luno.`);
        pollSellStatus();
      } else {
        alert(result.error || 'Failed to execute sell');
      }
    } catch (error: any) {
      alert(error.message || 'Failed to execute sell');
    } finally {
      setExecuting(false);
    }
  };

  const pollSellStatus = async () => {
    if (!sellId) return;

    const interval = setInterval(async () => {
      try {
        const result = await getSellBtcStatus({ sell_id: sellId });
        if (result.success && result.sell_order) {
          const status = result.sell_order.status;
          setSellStatus(status);

          if (status === 'COMPLETED') {
            clearInterval(interval);
            alert(`Sell completed! You received ₦${result.sell_order.ngn_received || result.sell_order.quoted_ngn} NGN`);
            router.push('/wallet');
          } else if (status === 'SELL_FAILED' || status === 'EXPIRED') {
            clearInterval(interval);
            alert('Sell failed. Please try again.');
          }
        }
      } catch (error) {
        console.error('Error polling sell status:', error);
      }
    }, 5000);

    setTimeout(() => clearInterval(interval), 600000);
  };

  const handleMaxAmount = () => {
    setBtcAmount(btcBalance.toFixed(8));
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center mb-6">
          <button
            onClick={() => router.back()}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            ← Back
          </button>
          <h1 className="text-2xl font-bold ml-4">Sell Bitcoin</h1>
        </div>

        {/* Balance Card */}
        <div className="bg-white rounded-lg shadow p-6 mb-6 text-center">
          <p className="text-gray-600 mb-2">Available Balance</p>
          <p className="text-3xl font-bold">{btcBalance.toFixed(8)} BTC</p>
        </div>

        {/* Input Section */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <label className="block text-sm font-semibold mb-3">Amount to Sell (BTC)</label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              step="0.00000001"
              className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
              placeholder="0.00"
              value={btcAmount}
              onChange={(e) => setBtcAmount(e.target.value)}
              disabled={loading || executing}
            />
            <button
              onClick={handleMaxAmount}
              className="px-4 py-3 bg-purple-100 text-purple-600 rounded-lg font-semibold hover:bg-purple-200"
              disabled={loading || executing}
            >
              MAX
            </button>
          </div>
        </div>

        {/* Quote Display */}
        {quote && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-6 mb-6">
            <h2 className="text-lg font-bold mb-4 text-green-800">Quote Details</h2>
            
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-green-700">BTC Amount:</span>
                <span className="font-semibold text-green-700">{quote.btc_amount} BTC</span>
              </div>
              <div className="flex justify-between">
                <span className="text-green-700">Exchange Rate:</span>
                <span className="font-semibold text-green-700">₦{quote.exchange_rate}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-green-700">Platform Fee ({quote.platform_fee_percentage * 100}%):</span>
                <span className="font-semibold text-green-700">₦{quote.platform_fee}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-green-700">Network Fee:</span>
                <span className="font-semibold text-green-700">{quote.network_fee_btc} BTC</span>
              </div>
              <div className="flex justify-between pt-3 border-t border-green-300">
                <span className="text-green-800 font-bold">You'll Receive:</span>
                <span className="text-xl font-bold text-green-800">₦{quote.final_ngn_payout}</span>
              </div>
              {quote.quote_expires_at && (
                <p className="text-sm text-gray-600 mt-2 italic">
                  Quote expires: {new Date(quote.quote_expires_at).toLocaleTimeString()}
                </p>
              )}
            </div>

            <button
              onClick={handleExecuteSell}
              disabled={executing}
              className="w-full mt-6 bg-purple-600 text-white py-3 rounded-lg font-semibold hover:bg-purple-700 disabled:opacity-50"
            >
              {executing ? 'Processing...' : 'Confirm Sell'}
            </button>
          </div>
        )}

        {/* Status Display */}
        {sellStatus && (
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-6">
            <h3 className="font-bold mb-2 text-purple-800">Sell Status</h3>
            <p className="text-purple-700">
              {sellStatus === 'BTC_SENT' && '⏳ BTC transfer initiated. Waiting for Luno confirmation...'}
              {sellStatus === 'BTC_CREDITED_ON_LUNO' && '✅ BTC credited on Luno. Executing sell...'}
              {sellStatus === 'SOLD_ON_LUNO' && '✅ Sell executed on Luno. Crediting NGN...'}
              {sellStatus === 'COMPLETED' && '✅ Sell completed successfully!'}
              {sellStatus === 'SELL_FAILED' && '❌ Sell failed. Please try again.'}
              {sellStatus === 'EXPIRED' && '⏰ Quote expired. Please request a new quote.'}
            </p>
          </div>
        )}

        {/* Action Button */}
        {!quote && (
          <button
            onClick={handleGetQuote}
            disabled={loading || executing || !btcAmount}
            className="w-full bg-purple-600 text-white py-4 rounded-lg font-semibold hover:bg-purple-700 disabled:opacity-50"
          >
            {loading ? 'Getting Quote...' : 'Get Quote'}
          </button>
        )}

        {/* Info Section */}
        <div className="bg-purple-50 rounded-lg p-4 mt-6">
          <h3 className="font-semibold mb-2 text-purple-800">How it works</h3>
          <ol className="list-decimal list-inside space-y-1 text-sm text-purple-700">
            <li>Enter BTC amount and get a quote</li>
            <li>Review quote details and confirm</li>
            <li>BTC is transferred to Luno</li>
            <li>BTC is sold automatically</li>
            <li>NGN is credited to your wallet</li>
          </ol>
        </div>
      </div>
    </div>
  );
}









