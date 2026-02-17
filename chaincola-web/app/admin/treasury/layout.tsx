'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';

export default function TreasuryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    // UI-only: No authentication check, just set checking to false
    setChecking(false);
  }, [pathname]);

  return <>{children}</>;
}
