'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';

export default function Navbar() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { user, signOut } = useAuth();

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-sm border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center space-x-2">
            <div className="w-10 h-10 bg-gradient-purple rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-xl">C</span>
            </div>
            <span className="text-2xl font-bold text-gray-900">ChainCola</span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-8">
            {user ? (
              <>
                <Link href="/dashboard" className="text-gray-700 hover:text-purple-600 transition-colors font-medium">
                  Dashboard
                </Link>
                <Link href="/assets" className="text-gray-700 hover:text-purple-600 transition-colors font-medium">
                  Assets
                </Link>
                <Link href="/transactions" className="text-gray-700 hover:text-purple-600 transition-colors font-medium">
                  Transactions
                </Link>
                <Link href="/profile" className="text-gray-700 hover:text-purple-600 transition-colors font-medium">
                  Profile
                </Link>
                <button
                  onClick={async () => {
                    await signOut();
                    window.location.href = '/';
                  }}
                  className="text-gray-700 hover:text-purple-600 transition-colors font-medium"
                >
                  Logout
                </button>
              </>
            ) : (
              <>
                <Link href="/" className="text-gray-700 hover:text-purple-600 transition-colors font-medium">
                  Home
                </Link>
                <Link href="#features" className="text-gray-700 hover:text-purple-600 transition-colors font-medium">
                  Features
                </Link>
                <Link href="#about" className="text-gray-700 hover:text-purple-600 transition-colors font-medium">
                  About
                </Link>
                <Link href="#contact" className="text-gray-700 hover:text-purple-600 transition-colors font-medium">
                  Contact
                </Link>
                <Link 
                  href="/auth/signin" 
                  className="text-gray-700 hover:text-purple-600 transition-colors font-medium"
                >
                  Sign In
                </Link>
                <Link 
                  href="/auth/signup" 
                  className="bg-gradient-purple text-white px-6 py-2 rounded-full font-medium hover:opacity-90 transition-opacity"
                >
                  Get Started
                </Link>
              </>
            )}
          </div>

          {/* Mobile menu button */}
          <button
            className="md:hidden p-2 rounded-md text-gray-700 hover:bg-gray-100"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {isMenuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>

        {/* Mobile menu */}
        {isMenuOpen && (
          <div className="md:hidden py-4 space-y-4">
            {user ? (
              <>
                <Link href="/dashboard" className="block text-gray-700 hover:text-purple-600 transition-colors font-medium">
                  Dashboard
                </Link>
                <Link href="/assets" className="block text-gray-700 hover:text-purple-600 transition-colors font-medium">
                  Assets
                </Link>
                <Link href="/transactions" className="block text-gray-700 hover:text-purple-600 transition-colors font-medium">
                  Transactions
                </Link>
                <Link href="/profile" className="block text-gray-700 hover:text-purple-600 transition-colors font-medium">
                  Profile
                </Link>
                <button
                  onClick={async () => {
                    await signOut();
                    window.location.href = '/';
                  }}
                  className="block w-full text-left text-gray-700 hover:text-purple-600 transition-colors font-medium"
                >
                  Logout
                </button>
              </>
            ) : (
              <>
                <Link href="/" className="block text-gray-700 hover:text-purple-600 transition-colors font-medium">
                  Home
                </Link>
                <Link href="#features" className="block text-gray-700 hover:text-purple-600 transition-colors font-medium">
                  Features
                </Link>
                <Link href="#about" className="block text-gray-700 hover:text-purple-600 transition-colors font-medium">
                  About
                </Link>
                <Link href="#contact" className="block text-gray-700 hover:text-purple-600 transition-colors font-medium">
                  Contact
                </Link>
                <Link href="/auth/signin" className="block text-gray-700 hover:text-purple-600 transition-colors font-medium">
                  Sign In
                </Link>
                <Link 
                  href="/auth/signup" 
                  className="block bg-gradient-purple text-white px-6 py-2 rounded-full font-medium text-center hover:opacity-90 transition-opacity"
                >
                  Get Started
                </Link>
              </>
            )}
          </div>
        )}
      </div>
    </nav>
  );
}


