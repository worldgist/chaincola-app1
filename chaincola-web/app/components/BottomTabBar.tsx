"use client";

import Link from 'next/link';
import React from 'react';

type Tab = 'home' | 'assets' | 'transactions' | 'profile';

export default function BottomTabBar({ current }: { current?: Tab }) {
  const item = (key: Tab, href: string, label: string, icon: React.ReactNode) => {
    const active = current === key;
    return (
      <Link
        key={key}
        href={href}
        className={`flex-1 flex flex-col items-center justify-center py-2 ${active ? 'text-purple-600' : 'text-gray-500'}`}
        aria-current={active ? 'page' : undefined}
      >
        <div className={`w-6 h-6 mb-1 ${active ? 'text-purple-600' : 'text-gray-500'}`}>{icon}</div>
        <span className="text-xs">{label}</span>
      </Link>
    );
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-white border-t border-gray-200">
      <div className="max-w-4xl mx-auto px-4">
        <div className="flex items-center justify-between">
          {item('home', '/dashboard', 'Home', (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-6 h-6">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l9-9 9 9v8a2 2 0 01-2 2h-4a2 2 0 01-2-2v-4H9v4a2 2 0 01-2 2H3a2 2 0 01-2-2v-8z" />
            </svg>
          ))}

          {item('assets', '/assets', 'Assets', (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-6 h-6">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7h18M3 12h18M3 17h18" />
            </svg>
          ))}

          {item('transactions', '/transactions', 'Transactions', (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-6 h-6">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12A9 9 0 1112 3a9 9 0 019 9z" />
            </svg>
          ))}

          {item('profile', '/profile', 'Profile', (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-6 h-6">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.121 17.804A9 9 0 1118.879 6.196 9 9 0 015.12 17.804z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          ))}
        </div>
      </div>
    </nav>
  );
}
