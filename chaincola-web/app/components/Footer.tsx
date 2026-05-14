'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { appSettingsApi } from '@/lib/admin-api';

export default function Footer() {
  const [contactInfo, setContactInfo] = useState({
    email: 'support@chaincola.com',
    phone: '+234 800 000 0000',
    address: 'Lagos, Nigeria',
  });

  useEffect(() => {
    const fetchContactInfo = async () => {
      try {
        const response = await appSettingsApi.getAppSettings();
        if (response.success && response.data) {
          setContactInfo({
            email: response.data.support_email || 'support@chaincola.com',
            phone: response.data.support_phone || '+234 800 000 0000',
            address: response.data.support_address || 'Lagos, Nigeria',
          });
        }
      } catch (error) {
        console.error('Error fetching contact info:', error);
      }
    };

    fetchContactInfo();
  }, []);

  return (
    <footer id="contact" className="bg-gray-900 text-white py-16 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="grid md:grid-cols-4 gap-8 mb-12">
          {/* Brand */}
          <div>
            <div className="flex items-center space-x-2 mb-4">
              <div className="w-10 h-10 bg-gradient-purple rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-xl">C</span>
              </div>
              <span className="text-2xl font-bold">ChainCola</span>
            </div>
            <p className="text-gray-400">
              Your trusted cryptocurrency wallet and exchange platform.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="font-semibold mb-4">Quick Links</h3>
            <ul className="space-y-2">
              <li>
                <Link href="/" className="text-gray-400 hover:text-white transition-colors">
                  Home
                </Link>
              </li>
              <li>
                <Link href="#features" className="text-gray-400 hover:text-white transition-colors">
                  Features
                </Link>
              </li>
              <li>
                <Link href="#about" className="text-gray-400 hover:text-white transition-colors">
                  About
                </Link>
              </li>
              <li>
                <Link href="/auth/signup" className="text-gray-400 hover:text-white transition-colors">
                  Sign Up
                </Link>
              </li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h3 className="font-semibold mb-4">Legal</h3>
            <ul className="space-y-2">
              <li>
                <Link href="/profile/terms" className="text-gray-400 hover:text-white transition-colors">
                  Terms & Conditions
                </Link>
              </li>
              <li>
                <Link href="/profile/privacy" className="text-gray-400 hover:text-white transition-colors">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/profile/security" className="text-gray-400 hover:text-white transition-colors">
                  Security
                </Link>
              </li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h3 className="font-semibold mb-4">Contact</h3>
            <ul className="space-y-2 text-gray-400">
              <li>Email: {contactInfo.email}</li>
              <li>Phone: {contactInfo.phone}</li>
              {contactInfo.address && <li>Address: {contactInfo.address}</li>}
            </ul>
          </div>
        </div>

        <div className="border-t border-gray-800 pt-8 text-center text-gray-400">
          <p>&copy; {new Date().getFullYear()} ChainCola. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}


