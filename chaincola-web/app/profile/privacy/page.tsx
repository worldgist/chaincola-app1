'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Navbar from '../../components/Navbar';
import { getAppSettingsData } from '@/lib/app-settings-service';

export default function PrivacyPage() {
  const [loading, setLoading] = useState(true);
  const [privacy, setPrivacy] = useState<string>('');
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [supportEmail, setSupportEmail] = useState<string>('support@chaincola.app');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const { settings } = await getAppSettingsData();
      if (cancelled) return;
      if (settings?.privacy_policy) setPrivacy(settings.privacy_policy);
      if (settings?.updated_at) setUpdatedAt(settings.updated_at);
      if (settings?.support_email) setSupportEmail(settings.support_email);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
            <p className="text-gray-600">
              Last updated:{' '}
              {updatedAt ? new Date(updatedAt).toLocaleDateString() : new Date().toLocaleDateString()}
            </p>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-8">
            {loading ? (
              <div className="text-gray-600">Loading privacy policy…</div>
            ) : privacy ? (
              <div className="prose max-w-none whitespace-pre-wrap text-gray-800">{privacy}</div>
            ) : (
              <div className="text-gray-700">
                Privacy policy content is not available at this time. Please contact us at{' '}
                <a className="text-purple-600 hover:text-purple-700" href={`mailto:${supportEmail}`}>
                  {supportEmail}
                </a>
                .
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
