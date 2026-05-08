'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { getUserProfile, getUserInitials, UserProfile } from '@/lib/user-service';
import { getUserVerificationStatus } from '@/lib/verification-service';
import { getUserTransactions } from '@/lib/transaction-service';
import Navbar from '../components/Navbar';

export default function ProfilePage() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [verificationStatus, setVerificationStatus] = useState<'pending' | 'approved' | 'rejected' | null>(null);

  useEffect(() => {
    if (!user) {
      router.push('/auth/signin');
      return;
    }

    (async () => {
      if (!user?.id) {
        setLoading(false);
        return;
      }

      try {
        const profile = await getUserProfile(user.id);
        if (profile) {
          setUserProfile(profile);
        }
        
        // Fetch verification status
        const status = await getUserVerificationStatus(user.id);
        setVerificationStatus(status);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error('Error fetching user data:', msg);
      } finally {
        setLoading(false);
      }
    })();
  }, [user, router]);

  const getUserName = () => {
    if (userProfile?.name || userProfile?.full_name) {
      return userProfile.name || userProfile.full_name;
    }
    if (user?.metadata?.full_name || user?.metadata?.name) {
      return user.metadata.full_name || user.metadata.name;
    }
    if (user?.email) {
      return user.email.split('@')[0];
    }
    return 'User Profile';
  };

  const getUserEmail = () => {
    if (userProfile?.email) {
      return userProfile.email;
    }
    if (user?.email) {
      return user.email;
    }
    return 'user@example.com';
  };

  const getUserAvatar = () => {
    return getUserInitials(userProfile?.name || user?.metadata?.name, user?.email);
  };

  const handleLogout = async () => {
    if (confirm('Are you sure you want to logout?')) {
      try {
        await signOut();
        router.push('/auth/signin');
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error('Error signing out:', msg);
        alert('Failed to logout. Please try again.');
      }
    }
  };

  const handleGenerateStatement = async () => {
    if (!user?.id) {
      alert('Please sign in to generate a statement');
      return;
    }

    try {
      // Show loading indicator
      const loadingAlert = alert('Generating statement... Please wait.');

      // Fetch all user transactions
      const { transactions, error } = await getUserTransactions(user.id, 1000);

      if (error) {
        alert(`Failed to fetch transactions: ${error}`);
        return;
      }

      if (!transactions || transactions.length === 0) {
        alert('No transactions found to generate statement');
        return;
      }

      // Generate PDF Statement
      generatePDFStatement(transactions);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('Error generating statement:', msg);
      alert(`Failed to generate statement: ${msg}`);
    }
  };

  const generatePDFStatement = (transactions: any[]) => {
    const userName = getUserName();
    const userEmail = getUserEmail();
    const now = new Date();
    const dateRange = `From ${transactions[transactions.length - 1]?.date || 'N/A'} to ${transactions[0]?.date || 'N/A'}`;

    // Calculate summary statistics
    let totalCredits = 0;
    let totalDebits = 0;
    let completedCount = 0;
    let pendingCount = 0;
    let failedCount = 0;

    transactions.forEach((tx) => {
      const amount = parseFloat(tx.total.replace(/[₦$,]/g, '')) || 0;
      if (tx.type === 'fund' || tx.type === 'receive' || tx.type === 'deposit') {
        totalCredits += amount;
      } else {
        totalDebits += amount;
      }

      if (tx.status === 'completed') completedCount++;
      else if (tx.status === 'pending') pendingCount++;
      else if (tx.status === 'failed') failedCount++;
    });

    // Create HTML content for PDF
    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <title>Transaction Statement - ${userName}</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              padding: 20px;
              color: #333;
            }
            .header {
              text-align: center;
              margin-bottom: 30px;
              border-bottom: 2px solid #6B46C1;
              padding-bottom: 20px;
            }
            .header h1 {
              color: #6B46C1;
              margin: 0;
            }
            .user-info {
              margin-bottom: 20px;
            }
            .user-info p {
              margin: 5px 0;
            }
            .date-range {
              margin-bottom: 20px;
              color: #666;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 20px;
            }
            th {
              background-color: #6B46C1;
              color: white;
              padding: 12px;
              text-align: left;
              font-weight: bold;
            }
            td {
              padding: 10px;
              border-bottom: 1px solid #ddd;
            }
            tr:nth-child(even) {
              background-color: #f9f9f9;
            }
            .status-completed {
              color: #10B981;
              font-weight: bold;
            }
            .status-pending {
              color: #F59E0B;
              font-weight: bold;
            }
            .status-failed {
              color: #EF4444;
              font-weight: bold;
            }
            .footer {
              margin-top: 30px;
              text-align: center;
              color: #666;
              font-size: 12px;
            }
            .summary {
              margin-top: 20px;
              padding: 15px;
              background-color: #F3F4F6;
              border-radius: 8px;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Transaction Statement</h1>
            <p>ChainCola Platform</p>
          </div>
          
          <div class="user-info">
            <h2>User Information</h2>
            <p><strong>Name:</strong> ${userName}</p>
            <p><strong>Email:</strong> ${userEmail}</p>
            <p><strong>User ID:</strong> ${user?.id || 'N/A'}</p>
            <p><strong>Generated:</strong> ${now.toLocaleString()}</p>
          </div>

          <div class="date-range">
            <p><strong>Period:</strong> ${dateRange}</p>
            <p><strong>Total Transactions:</strong> ${transactions.length}</p>
          </div>

          <div class="summary">
            <h3>Summary</h3>
            <p><strong>Total Credits:</strong> ₦${totalCredits.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            <p><strong>Total Debits:</strong> ₦${totalDebits.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            <p><strong>Net Balance:</strong> ₦${(totalCredits - totalDebits).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            <p><strong>Completed:</strong> ${completedCount} | <strong>Pending:</strong> ${pendingCount} | <strong>Failed:</strong> ${failedCount}</p>
          </div>

          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Asset</th>
                <th>Amount</th>
                <th>Total Value</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${transactions.map((tx) => {
                const statusClass = `status-${tx.status}`;
                const statusText = tx.status.charAt(0).toUpperCase() + tx.status.slice(1);
                return `
                  <tr>
                    <td>${tx.date}</td>
                    <td>${tx.type}</td>
                    <td>${tx.crypto} (${tx.symbol})</td>
                    <td>${tx.amount} ${tx.symbol}</td>
                    <td>${tx.total}</td>
                    <td class="${statusClass}">${statusText}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>

          <div class="footer">
            <p>This is an automated statement generated by ChainCola Platform</p>
            <p>Generated on ${now.toLocaleString()}</p>
          </div>
        </body>
      </html>
    `;

    // Create a blob and download
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ChainCola-Statement-${userName}-${now.toISOString().split('T')[0]}.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    // Also try to open print dialog for PDF conversion
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(htmlContent);
      printWindow.document.close();
      setTimeout(() => {
        printWindow.print();
      }, 250);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-purple-50">
        <Navbar />
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading...</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-purple-50">
      <Navbar />
      <div className="container mx-auto px-4 py-8 pt-24">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Profile</h1>
            <p className="text-gray-600">Your account settings</p>
          </div>

          {/* Profile Card */}
          <div className="bg-gradient-to-br from-purple-600 via-purple-700 to-purple-800 rounded-2xl p-8 mb-8 shadow-xl">
            <div className="text-center">
              <div className="w-16 h-16 bg-white/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl font-bold text-white">{getUserAvatar()}</span>
              </div>
              <div className="flex items-center justify-center gap-2 mb-2">
                <h2 className="text-2xl font-bold text-white">{getUserName()}</h2>
                {verificationStatus === 'approved' && (
                  <svg className="w-6 h-6 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                )}
              </div>
              <p className="text-purple-200">{getUserEmail()}</p>
              {verificationStatus === 'pending' && (
                <span className="inline-block mt-2 bg-white/20 text-white text-xs px-3 py-1 rounded-full">
                  Under Review
                </span>
              )}
              {verificationStatus === 'rejected' && (
                <span className="inline-block mt-2 bg-red-500/30 text-white text-xs px-3 py-1 rounded-full">
                  Failed - Try Again
                </span>
              )}
            </div>
          </div>

          {/* Menu Items */}
          <div className="space-y-2">
            <Link
              href="/profile/edit"
              className="flex items-center justify-between bg-white p-4 rounded-xl border border-gray-200 hover:border-purple-300 hover:shadow-md transition-all"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
                  <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </div>
                <span className="font-medium text-gray-900">Edit Profile</span>
              </div>
              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>

            <Link
              href="/profile/verify"
              className="flex items-center justify-between bg-white p-4 rounded-xl border border-gray-200 hover:border-purple-300 hover:shadow-md transition-all"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
                  <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <div>
                  <span className="font-medium text-gray-900">Verify Account</span>
                  {verificationStatus === 'approved' && (
                    <p className="text-xs text-green-600">✓ Verified</p>
                  )}
                  {verificationStatus === 'pending' && (
                    <p className="text-xs text-yellow-600">Under Review</p>
                  )}
                  {verificationStatus === 'rejected' && (
                    <p className="text-xs text-red-600">Failed - Try Again</p>
                  )}
                  {!verificationStatus && (
                    <p className="text-xs text-gray-500">Not verified</p>
                  )}
                </div>
              </div>
              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>

            <Link
              href="/profile/security"
              className="flex items-center justify-between bg-white p-4 rounded-xl border border-gray-200 hover:border-purple-300 hover:shadow-md transition-all"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
                  <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <span className="font-medium text-gray-900">Security & PIN</span>
              </div>
              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>

            <Link
              href="/profile/referral"
              className="flex items-center justify-between bg-white p-4 rounded-xl border border-gray-200 hover:border-purple-300 hover:shadow-md transition-all"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
                  <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
                  </svg>
                </div>
                <span className="font-medium text-gray-900">Referral</span>
              </div>
              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>

            <Link
              href="/profile/contact-us"
              className="flex items-center justify-between bg-white p-4 rounded-xl border border-gray-200 hover:border-purple-300 hover:shadow-md transition-all"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
                  <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 8V7a2 2 0 00-2-2h-3M7 3H4a2 2 0 00-2 2v1m0 8v5a2 2 0 002 2h3m10 0h3a2 2 0 002-2v-5M7 8h10" />
                  </svg>
                </div>
                <span className="font-medium text-gray-900">Contact Us</span>
              </div>
              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>

            <Link
              href="/profile/chat-support"
              className="flex items-center justify-between bg-white p-4 rounded-xl border border-gray-200 hover:border-purple-300 hover:shadow-md transition-all"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
                  <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-5-5H5a2 2 0 01-2-2V7a2 2 0 012-2h14a2 2 0 012 2v6a2 2 0 01-2 2h-3l-5 5z" />
                  </svg>
                </div>
                <span className="font-medium text-gray-900">Live Chat</span>
              </div>
              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>


            <div className="border-t border-gray-200 my-4"></div>

            <Link
              href="/profile/terms"
              className="flex items-center justify-between bg-white p-4 rounded-xl border border-gray-200 hover:border-purple-300 hover:shadow-md transition-all"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                  <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <span className="font-medium text-gray-900">Terms and Conditions</span>
              </div>
              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>

            <Link
              href="/profile/privacy"
              className="flex items-center justify-between bg-white p-4 rounded-xl border border-gray-200 hover:border-purple-300 hover:shadow-md transition-all"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                  <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <span className="font-medium text-gray-900">Privacy Policy</span>
              </div>
              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>

            <div className="hidden" />
          </div>

          {/* Logout Button */}
          <div className="mt-8">
            <button
              onClick={handleLogout}
              className="w-full bg-gradient-to-r from-red-600 to-red-700 text-white py-4 rounded-xl font-semibold hover:from-red-700 hover:to-red-800 transition-all flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Logout
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}

