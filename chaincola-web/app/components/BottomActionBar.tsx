"use client";

import Link from 'next/link';
import React from 'react';

type Action = {
  href?: string;
  label: string;
  variant?: 'primary' | 'secondary';
  onClick?: () => void;
};

export default function BottomActionBar({ actions }: { actions: Action[] }) {
  return (
    <div className="fixed inset-x-0 bottom-4 z-40 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
        {actions.map((action, idx) => {
          const cls = action.variant === 'secondary'
            ? 'flex-1 bg-white/20 border border-white/30 text-white px-4 py-3 rounded-xl font-semibold text-center hover:bg-white/30 transition-colors'
            : 'flex-1 bg-gradient-to-r from-purple-600 to-purple-700 text-white px-4 py-3 rounded-xl font-semibold text-center hover:opacity-95 transition-opacity';

          if (action.href) {
            return (
              <Link key={idx} href={action.href} className={cls}>
                {action.label}
              </Link>
            );
          }

          return (
            <button key={idx} onClick={action.onClick} className={cls}>
              {action.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
