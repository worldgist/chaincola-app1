'use client';

import Link from 'next/link';
import Navbar from '../../components/Navbar';

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-purple-50">
      <Navbar />
      <div className="container mx-auto px-4 py-8 pt-24">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8">
            <Link href="/profile" className="inline-flex items-center text-purple-600 hover:text-purple-700 mb-4">
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back to Profile
            </Link>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Privacy Policy</h1>
            <p className="text-gray-600">Last updated: {new Date().toLocaleDateString()}</p>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-8 prose max-w-none">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">1. Information We Collect</h2>
            <p className="text-gray-700 mb-6">
              We collect information that you provide directly to us, including your name, email address, phone number, and payment information. We also collect information about your use of our services.
            </p>

            <h2 className="text-2xl font-bold text-gray-900 mb-4">2. How We Use Your Information</h2>
            <p className="text-gray-700 mb-6">
              We use the information we collect to provide, maintain, and improve our services, process transactions, send you technical notices and support messages, and communicate with you about products and services.
            </p>

            <h2 className="text-2xl font-bold text-gray-900 mb-4">3. Information Sharing</h2>
            <p className="text-gray-700 mb-6">
              We do not sell, trade, or otherwise transfer your personal information to third parties without your consent, except as described in this policy. We may share information with service providers who assist us in operating our platform.
            </p>

            <h2 className="text-2xl font-bold text-gray-900 mb-4">4. Data Security</h2>
            <p className="text-gray-700 mb-6">
              We implement appropriate security measures to protect your personal information. However, no method of transmission over the Internet is 100% secure, and we cannot guarantee absolute security.
            </p>

            <h2 className="text-2xl font-bold text-gray-900 mb-4">5. Private Keys</h2>
            <p className="text-gray-700 mb-6">
              Your cryptocurrency private keys are encrypted and stored securely. We never have access to your unencrypted private keys. You are solely responsible for maintaining the security of your account credentials.
            </p>

            <h2 className="text-2xl font-bold text-gray-900 mb-4">6. Cookies</h2>
            <p className="text-gray-700 mb-6">
              We use cookies to enhance your experience, analyze site traffic, and personalize content. You can control cookies through your browser settings.
            </p>

            <h2 className="text-2xl font-bold text-gray-900 mb-4">7. Your Rights</h2>
            <p className="text-gray-700 mb-6">
              You have the right to access, update, or delete your personal information at any time. You can do this through your account settings or by contacting us.
            </p>

            <h2 className="text-2xl font-bold text-gray-900 mb-4">8. Changes to This Policy</h2>
            <p className="text-gray-700 mb-6">
              We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page and updating the "Last updated" date.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
