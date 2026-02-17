'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { getUserVerificationStatus } from '@/lib/verification-service';

interface VerificationGuardProps {
  children: React.ReactNode;
  redirectTo?: string;
  showModal?: boolean;
}

export default function VerificationGuard({ 
  children, 
  redirectTo = '/profile/verify',
  showModal = false 
}: VerificationGuardProps) {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [verificationStatus, setVerificationStatus] = useState<'pending' | 'approved' | 'rejected' | null | 'checking'>(null);
  const [showVerificationModal, setShowVerificationModal] = useState(false);

  useEffect(() => {
    const checkVerification = async () => {
      if (authLoading) return;
      
      if (!user) {
        return; // Not logged in, let auth handle redirect
      }

      try {
        setVerificationStatus('checking');
        const status = await getUserVerificationStatus(user.id);
        setVerificationStatus(status);

        // If user has no verification record or verification is not approved, redirect or show modal
        if (status !== 'approved') {
          if (showModal) {
            setShowVerificationModal(true);
          } else {
            // Redirect to verification page
            router.push(redirectTo);
          }
        }
      } catch (error) {
        console.error('Error checking verification status:', error);
        // On error, allow access but log it
        setVerificationStatus(null);
      }
    };

    checkVerification();
  }, [user, authLoading, redirectTo, showModal, router]);

  // Show loading state while checking
  if (authLoading || verificationStatus === 'checking') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 via-white to-purple-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Verifying your account...</p>
        </div>
      </div>
    );
  }

  // If verification is not approved, show modal or redirect
  if (verificationStatus !== 'approved' && user) {
    if (showModal && showVerificationModal) {
      return (
        <>
          {children}
          <VerificationModal 
            isOpen={showVerificationModal}
            onClose={() => setShowVerificationModal(false)}
            verificationStatus={verificationStatus}
            onVerify={() => router.push(redirectTo)}
          />
        </>
      );
    }
    // If not showing modal, redirect will happen in useEffect
    return null;
  }

  // User is verified or no user, render children
  return <>{children}</>;
}

interface VerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  verificationStatus: 'pending' | 'approved' | 'rejected' | null;
  onVerify: () => void;
}

function VerificationModal({ isOpen, onClose, verificationStatus, onVerify }: VerificationModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4">
        <div className="flex items-center justify-center w-16 h-16 mx-auto bg-yellow-100 rounded-full mb-4">
          <svg className="w-8 h-8 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>

        <h2 className="text-2xl font-bold text-gray-900 text-center">
          Account Verification Required
        </h2>

        <p className="text-gray-600 text-center">
          {verificationStatus === 'pending' 
            ? 'Your verification is currently pending review. Please wait for admin approval.'
            : verificationStatus === 'rejected'
            ? 'Your verification was rejected. Please submit a new verification request.'
            : 'Please verify your account to continue using ChainCola. This helps us ensure security and compliance.'
          }
        </p>

        <div className="space-y-3 pt-4">
          <button
            onClick={onVerify}
            className="w-full bg-gradient-purple text-white py-3 rounded-lg font-semibold hover:opacity-90 transition-opacity shadow-lg"
          >
            {verificationStatus === null ? 'Verify My Account' : 'View Verification Status'}
          </button>
          
          {verificationStatus === 'pending' && (
            <button
              onClick={onClose}
              className="w-full bg-gray-100 text-gray-700 py-3 rounded-lg font-semibold hover:bg-gray-200 transition-colors"
            >
              Continue Later
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
