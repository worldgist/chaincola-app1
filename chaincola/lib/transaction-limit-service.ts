// Transaction Limit Service
// Handles transaction limit checks based on account verification status
import { getUserVerificationStatus } from './verification-service';

const TRANSACTION_LIMIT_UNVERIFIED = 50000; // 50,000 NGN for unverified accounts
const TRANSACTION_LIMIT_VERIFIED = 10000000; // 10,000,000 NGN for verified accounts (effectively unlimited)

export interface TransactionLimitCheck {
  allowed: boolean;
  requiresVerification: boolean;
  currentLimit: number;
  transactionAmount: number;
  message?: string;
}

/**
 * Check if a transaction amount exceeds the limit based on verification status
 * @param userId - User ID
 * @param transactionAmountNGN - Transaction amount in NGN
 * @returns TransactionLimitCheck result
 */
export async function checkTransactionLimit(
  userId: string,
  transactionAmountNGN: number
): Promise<TransactionLimitCheck> {
  try {
    // Get user verification status
    const verificationStatus = await getUserVerificationStatus(userId);
    const isVerified = verificationStatus === 'approved';
    
    const currentLimit = isVerified ? TRANSACTION_LIMIT_VERIFIED : TRANSACTION_LIMIT_UNVERIFIED;
    const exceedsLimit = transactionAmountNGN > currentLimit;
    
    if (exceedsLimit && !isVerified) {
      return {
        allowed: false,
        requiresVerification: true,
        currentLimit,
        transactionAmount: transactionAmountNGN,
        message: `Transactions above ₦${currentLimit.toLocaleString()} require account verification. Please verify your account to upgrade your transaction limit.`,
      };
    }
    
    return {
      allowed: true,
      requiresVerification: false,
      currentLimit,
      transactionAmount: transactionAmountNGN,
    };
  } catch (error: any) {
    console.error('Error checking transaction limit:', error);
    // On error, allow transaction but log it
    return {
      allowed: true,
      requiresVerification: false,
      currentLimit: TRANSACTION_LIMIT_UNVERIFIED,
      transactionAmount: transactionAmountNGN,
    };
  }
}

/**
 * Get the current transaction limit for a user
 */
export async function getTransactionLimit(userId: string): Promise<number> {
  try {
    const verificationStatus = await getUserVerificationStatus(userId);
    const isVerified = verificationStatus === 'approved';
    return isVerified ? TRANSACTION_LIMIT_VERIFIED : TRANSACTION_LIMIT_UNVERIFIED;
  } catch (error) {
    console.error('Error getting transaction limit:', error);
    return TRANSACTION_LIMIT_UNVERIFIED;
  }
}

/**
 * Check if user is verified
 */
export async function isUserVerified(userId: string): Promise<boolean> {
  try {
    const verificationStatus = await getUserVerificationStatus(userId);
    return verificationStatus === 'approved';
  } catch (error) {
    console.error('Error checking verification status:', error);
    return false;
  }
}













