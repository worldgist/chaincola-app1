'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { getUserVerificationStatus, submitVerification, verifyNIN } from '@/lib/verification-service';
import { createClient } from '@/lib/supabase/client';
import Navbar from '../../components/Navbar';

export default function VerifyAccountPage() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [verifyingNIN, setVerifyingNIN] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState<'pending' | 'approved' | 'rejected' | null>(null);
  const [showPromptBanner, setShowPromptBanner] = useState(false);
  const [ninVerified, setNinVerified] = useState(false);
  const [ninVerificationError, setNinVerificationError] = useState<string | null>(null);

  // Step 1: Personal Information
  const [fullName, setFullName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [address, setAddress] = useState('');

  // Step 2: NIN
  const [nin, setNin] = useState('');

  // Step 3: Documents
  const [ninFront, setNinFront] = useState<File | null>(null);
  const [ninBack, setNinBack] = useState<File | null>(null);
  const [passportPhoto, setPassportPhoto] = useState<File | null>(null);

  useEffect(() => {
    if (!user) {
      router.push('/auth/signin');
      return;
    }
    
    // Check if redirected from login with prompt
    const prompt = searchParams.get('prompt');
    if (prompt === 'true') {
      setShowPromptBanner(true);
    }
    
    fetchVerificationStatus();
  }, [user, router, searchParams]);

  const fetchVerificationStatus = async () => {
    if (!user?.id) return;
    try {
      const status = await getUserVerificationStatus(user.id);
      setVerificationStatus(status);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('Error fetching verification status:', msg);
    }
  };

  const handleFileChange = (setter: (file: File | null) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setter(e.target.files[0]);
    }
  };

  const handleNext = async () => {
    if (currentStep === 1) {
      if (!fullName.trim() || !phoneNumber.trim() || !address.trim()) {
        alert('Please fill in all fields');
        return;
      }
      setCurrentStep(2);
    } else if (currentStep === 2) {
      if (!nin.trim()) {
        alert('Please enter your NIN');
        return;
      }
      
      // Validate NIN format
      if (nin.length !== 11 || !/^\d+$/.test(nin)) {
        alert('NIN must be exactly 11 digits');
        return;
      }

      // Verify NIN with Flutterwave
      setVerifyingNIN(true);
      setNinVerificationError(null);
      
      try {
        const nameParts = fullName.trim().split(' ');
        const firstName = nameParts[0] || '';
        const lastName = nameParts.slice(1).join(' ') || '';
        
        const result = await verifyNIN(nin, firstName, lastName, phoneNumber);
        
        if (result.success && result.verified) {
          setNinVerified(true);
          setCurrentStep(3);
        } else {
          setNinVerificationError(result.error || 'Failed to verify NIN. Please check your NIN and try again.');
          setNinVerified(false);
        }
      } catch (error: any) {
        console.error('Error verifying NIN:', error);
        setNinVerificationError(error.message || 'Failed to verify NIN. Please try again.');
        setNinVerified(false);
      } finally {
        setVerifyingNIN(false);
      }
    } else if (currentStep === 3) {
      if (!ninFront || !ninBack || !passportPhoto) {
        alert('Please upload all required documents');
        return;
      }
      handleSubmit();
    }
  };

  const handleSubmit = async () => {
    if (!user?.id) {
      alert('User not found');
      return;
    }

    if (!ninFront || !ninBack || !passportPhoto) {
      alert('Please upload all required documents');
      return;
    }

    setLoading(true);

    try {
      const supabase = createClient();
      
      // Upload files to storage
      const uploadFile = async (file: File, path: string) => {
        const { data, error } = await supabase.storage
          .from('verifications')
          .upload(`${user.id}/${path}`, file, {
            cacheControl: '3600',
            upsert: false,
          });
        
        if (error) throw error;
        
        const { data: { publicUrl } } = supabase.storage
          .from('verifications')
          .getPublicUrl(data.path);
        
        return publicUrl;
      };

      const [ninFrontUrl, ninBackUrl, passportUrl] = await Promise.all([
        uploadFile(ninFront, `nin-front-${Date.now()}.jpg`),
        uploadFile(ninBack, `nin-back-${Date.now()}.jpg`),
        uploadFile(passportPhoto, `passport-${Date.now()}.jpg`),
      ]);

      // Submit verification
      const result = await submitVerification(user.id, {
        full_name: fullName,
        phone_number: phoneNumber,
        address: address,
        nin: nin,
        nin_front_url: ninFrontUrl,
        nin_back_url: ninBackUrl,
        passport_photo_url: passportUrl,
      });

      if (result.success) {
        setVerificationStatus('pending');
        alert('Verification submitted successfully! Your documents are under review.');
        router.push('/profile');
      } else {
        alert(result.error?.message || 'Failed to submit verification');
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      alert(`Error: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-purple-50">
      <Navbar />
      <div className="container mx-auto px-4 py-8 pt-24">
        <div className="max-w-3xl mx-auto">
          <div className="mb-8">
            <Link href="/profile" className="inline-flex items-center text-purple-600 hover:text-purple-700 mb-4">
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back to Profile
            </Link>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Verify Account</h1>
            <p className="text-gray-600">Complete verification to unlock all features</p>
          </div>

          {/* Prompt Banner - shown when redirected from login */}
          {showPromptBanner && (
            <div className="mb-6 bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded-lg">
              <div className="flex items-start">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3 flex-1">
                  <h3 className="text-sm font-medium text-yellow-800">
                    Account Verification Required
                  </h3>
                  <div className="mt-2 text-sm text-yellow-700">
                    <p>
                      {verificationStatus === 'pending' 
                        ? 'Your verification is currently pending review. Please wait for admin approval before accessing all features.'
                        : verificationStatus === 'rejected'
                        ? 'Your previous verification was rejected. Please submit a new verification request to continue.'
                        : 'Please verify your account to continue using ChainCola. This helps us ensure security and compliance.'
                      }
                    </p>
                  </div>
                </div>
                <div className="ml-4 flex-shrink-0">
                  <button
                    onClick={() => setShowPromptBanner(false)}
                    className="inline-flex text-yellow-400 hover:text-yellow-500"
                  >
                    <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Show status message if verification is pending or rejected */}
          {verificationStatus === 'pending' && !showPromptBanner && (
            <div className="mb-6 bg-blue-50 border-l-4 border-blue-400 p-4 rounded-lg">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm text-blue-700">
                    Your verification is currently pending review. You will be notified once it's approved.
                  </p>
                </div>
              </div>
            </div>
          )}

          {verificationStatus === 'rejected' && !showPromptBanner && (
            <div className="mb-6 bg-red-50 border-l-4 border-red-400 p-4 rounded-lg">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm text-red-700">
                    Your verification was rejected. Please submit a new verification request with correct information.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Progress Steps */}
          <div className="mb-8">
            <div className="flex items-center justify-between">
              {[1, 2, 3].map((step) => (
                <div key={step} className="flex items-center flex-1">
                  <div className={`flex items-center justify-center w-10 h-10 rounded-full border-2 ${
                    currentStep >= step ? 'bg-purple-600 border-purple-600 text-white' : 'border-gray-300 text-gray-400'
                  }`}>
                    {currentStep > step ? (
                      <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    ) : (
                      <span>{step}</span>
                    )}
                  </div>
                  {step < 3 && (
                    <div className={`flex-1 h-1 mx-2 ${currentStep > step ? 'bg-purple-600' : 'bg-gray-300'}`} />
                  )}
                </div>
              ))}
            </div>
            <div className="flex justify-between mt-2 text-sm text-gray-600">
              <span>Personal Info</span>
              <span>NIN</span>
              <span>Documents</span>
            </div>
          </div>

          {/* Only show form if verification is not approved */}
          {verificationStatus !== 'approved' && (
            <div className="bg-white rounded-xl shadow-lg p-6">
            {currentStep === 1 && (
              <div className="space-y-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-4">Personal Information</h2>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Full Name *</label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Phone Number *</label>
                  <input
                    type="tel"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Address *</label>
                  <textarea
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    rows={3}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent outline-none resize-none"
                    required
                  />
                </div>
              </div>
            )}

            {currentStep === 2 && (
              <div className="space-y-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-4">National Identification Number</h2>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">NIN *</label>
                  <input
                    type="text"
                    value={nin}
                    onChange={(e) => {
                      setNin(e.target.value);
                      setNinVerified(false);
                      setNinVerificationError(null);
                    }}
                    disabled={verifyingNIN}
                    className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent outline-none ${
                      ninVerified ? 'border-green-500 bg-green-50' : 
                      ninVerificationError ? 'border-red-500 bg-red-50' : 
                      'border-gray-300'
                    } ${verifyingNIN ? 'opacity-50 cursor-not-allowed' : ''}`}
                    placeholder="Enter your 11-digit NIN"
                    maxLength={11}
                    required
                  />
                  <p className="mt-1 text-xs text-gray-500">Enter your 11-digit National Identification Number</p>
                  
                  {verifyingNIN && (
                    <div className="mt-2 flex items-center gap-2 text-sm text-blue-600">
                      <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      <span>Verifying NIN...</span>
                    </div>
                  )}
                  
                  {ninVerified && (
                    <div className="mt-2 flex items-center gap-2 text-sm text-green-600">
                      <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      <span>NIN verified successfully!</span>
                    </div>
                  )}
                  
                  {ninVerificationError && (
                    <div className="mt-2 flex items-start gap-2 text-sm text-red-600">
                      <svg className="h-4 w-4 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                      </svg>
                      <span>{ninVerificationError}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {currentStep === 3 && (
              <div className="space-y-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-4">Upload Documents</h2>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">NIN Front *</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange(setNinFront)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent outline-none"
                    required
                  />
                  {ninFront && <p className="mt-1 text-sm text-green-600">✓ {ninFront.name}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">NIN Back *</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange(setNinBack)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent outline-none"
                    required
                  />
                  {ninBack && <p className="mt-1 text-sm text-green-600">✓ {ninBack.name}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Passport Photo *</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange(setPassportPhoto)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent outline-none"
                    required
                  />
                  {passportPhoto && <p className="mt-1 text-sm text-green-600">✓ {passportPhoto.name}</p>}
                </div>
              </div>
            )}

            <div className="flex gap-4 mt-8 pt-6 border-t border-gray-200">
              {currentStep > 1 && (
                <button
                  onClick={() => setCurrentStep(currentStep - 1)}
                  className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-lg font-semibold hover:bg-gray-200 transition-colors"
                >
                  Previous
                </button>
              )}
              <button
                onClick={handleNext}
                disabled={loading || verifyingNIN || (currentStep === 2 && !ninVerified && !ninVerificationError)}
                className="flex-1 bg-gradient-to-r from-purple-600 to-purple-700 text-white py-3 rounded-lg font-semibold hover:from-purple-700 hover:to-purple-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {verifyingNIN ? 'Verifying...' : loading ? 'Submitting...' : currentStep === 3 ? 'Submit' : 'Next'}
              </button>
            </div>
          </div>
          )}

          {/* Show success message if already verified */}
          {verificationStatus === 'approved' && (
            <div className="bg-white rounded-xl shadow-lg p-8 text-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Account Verified</h2>
              <p className="text-gray-600 mb-6">Your account has been successfully verified. You can now access all features.</p>
              <Link
                href="/dashboard"
                className="inline-block bg-gradient-purple text-white px-6 py-3 rounded-lg font-semibold hover:opacity-90 transition-opacity"
              >
                Go to Dashboard
              </Link>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
