export default function Features() {
  const features = [
    {
      icon: '🔒',
      title: 'Top-Tier Security',
      description: 'Your assets are protected with bank-level encryption and multi-layer security protocols.',
    },
    {
      icon: '💳',
      title: 'Easy Payments',
      description: 'Fund your wallet instantly with multiple payment methods including bank transfers and cards.',
    },
    {
      icon: '📊',
      title: 'Real-Time Trading',
      description: 'Buy and convert cryptocurrencies at the best market rates in real-time.',
    },
    {
      icon: '🌍',
      title: 'Multi-Currency Support',
      description: 'Support for Bitcoin, Ethereum, Tether, USDC, Tron, and Naira with more coming soon.',
    },
    {
      icon: '📱',
      title: 'Mobile First',
      description: 'Beautiful, intuitive mobile app available on iOS and Android for managing crypto on the go.',
    },
    {
      icon: '⚡',
      title: 'Lightning Fast',
      description: 'Process transactions in seconds with our optimized blockchain infrastructure.',
    },
  ];

  return (
    <section id="features" className="py-20 px-4 sm:px-6 lg:px-8 bg-white">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-4">
            Everything You Need to{' '}
            <span className="text-gradient-purple">Manage Crypto</span>
          </h2>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Powerful features designed to make cryptocurrency management simple, secure, and accessible.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <div
              key={index}
              className="bg-gray-50 rounded-2xl p-8 hover:shadow-xl transition-shadow duration-300 border border-gray-100 hover:border-purple-200"
            >
              <div className="text-5xl mb-4">{feature.icon}</div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">{feature.title}</h3>
              <p className="text-gray-600 leading-relaxed">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}


