import Link from 'next/link';

export default function Hero() {
  return (
    <section className="relative pt-32 pb-20 px-4 sm:px-6 lg:px-8 overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-purple-50 via-white to-purple-50"></div>
      
      <div className="relative max-w-7xl mx-auto">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left content */}
          <div className="text-center lg:text-left">
            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold text-gray-900 mb-6 leading-tight">
              Your Trusted{' '}
              <span className="text-gradient-purple">Cryptocurrency</span>{' '}
              Wallet
            </h1>
            <p className="text-xl text-gray-600 mb-8 leading-relaxed">
              Store, send, receive, buy, and convert cryptocurrencies with top-tier security. 
              Experience seamless crypto management on the go.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
              <Link
                href="/auth/signup"
                className="bg-gradient-purple text-white px-8 py-4 rounded-full font-semibold text-lg hover:opacity-90 transition-opacity shadow-lg hover:shadow-xl transform hover:-translate-y-1 transition-all duration-200"
              >
                Get Started Free
              </Link>
              <Link
                href="#features"
                className="border-2 border-purple-600 text-purple-600 px-8 py-4 rounded-full font-semibold text-lg hover:bg-purple-50 transition-colors"
              >
                Learn More
              </Link>
            </div>
            
            {/* Stats */}
            <div className="mt-12 grid grid-cols-3 gap-8">
              <div>
                <div className="text-3xl font-bold text-purple-600">100K+</div>
                <div className="text-sm text-gray-600 mt-1">Active Users</div>
              </div>
              <div>
                <div className="text-3xl font-bold text-purple-600">$50M+</div>
                <div className="text-sm text-gray-600 mt-1">Transactions</div>
              </div>
              <div>
                <div className="text-3xl font-bold text-purple-600">99.9%</div>
                <div className="text-sm text-gray-600 mt-1">Uptime</div>
              </div>
            </div>
          </div>

          {/* Right content - Phone mockup */}
          <div className="relative">
            <div className="relative mx-auto max-w-sm">
              <div className="bg-gradient-purple rounded-[3rem] p-4 shadow-2xl">
                <div className="bg-white rounded-[2.5rem] overflow-hidden">
                  <div className="bg-gray-100 h-12 flex items-center justify-center">
                    <div className="w-32 h-6 bg-gray-300 rounded-full"></div>
                  </div>
                  <div className="p-6 space-y-4">
                    <div className="bg-gradient-purple rounded-2xl p-6 text-white">
                      <div className="text-sm opacity-90">Total Balance</div>
                      <div className="text-3xl font-bold mt-2">$12,450.00</div>
                      <div className="text-sm opacity-90 mt-1">₦18,675,000.00</div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <button className="bg-purple-100 text-purple-700 py-3 rounded-xl font-semibold">
                        Fund Wallet
                      </button>
                      <button className="bg-purple-100 text-purple-700 py-3 rounded-xl font-semibold">
                        Withdraw
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <button className="bg-gray-100 py-4 rounded-xl text-center">
                        <div className="text-2xl mb-1">📤</div>
                        <div className="text-xs font-medium">Send</div>
                      </button>
                      <button className="bg-gray-100 py-4 rounded-xl text-center">
                        <div className="text-2xl mb-1">📥</div>
                        <div className="text-xs font-medium">Receive</div>
                      </button>
                      <button className="bg-gray-100 py-4 rounded-xl text-center">
                        <div className="text-2xl mb-1">🔄</div>
                        <div className="text-xs font-medium">Convert</div>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}


