// Professional Email Templates for Crypto Transactions

export interface BuyCryptoEmailData {
  userName: string;
  cryptoCurrency: string;
  cryptoAmount: string;
  ngnAmount: string;
  feeAmount: string;
  orderId: string;
  transactionId: string;
  transactionDate: string;
  status: 'PENDING' | 'COMPLETED' | 'FAILED';
}

export interface SellCryptoEmailData {
  userName: string;
  cryptoCurrency: string;
  cryptoAmount: string;
  ngnAmount: string;
  feeAmount: string;
  orderId: string;
  transactionId: string;
  transactionDate: string;
  status: 'PENDING' | 'COMPLETED' | 'FAILED';
}

/**
 * Generate professional buy crypto email template
 */
export function generateBuyCryptoEmail(data: BuyCryptoEmailData): string {
  const isCompleted = data.status === 'COMPLETED';
  const isFailed = data.status === 'FAILED';
  const statusColor = isCompleted ? '#10B981' : isFailed ? '#EF4444' : '#F59E0B';
  const statusText = isCompleted ? 'Completed' : isFailed ? 'Failed' : 'Pending';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Crypto Purchase ${statusText}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #F3F4F6;">
  <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #F3F4F6; padding: 20px;">
    <tr>
      <td align="center">
        <table role="presentation" style="max-width: 600px; width: 100%; border-collapse: collapse; background-color: #FFFFFF; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #6B46C1 0%, #9333EA 100%); padding: 50px 30px; text-align: center; position: relative; overflow: hidden;">
              <div style="position: absolute; top: -50px; right: -50px; width: 200px; height: 200px; background: rgba(255, 255, 255, 0.1); border-radius: 50%;"></div>
              <div style="position: absolute; bottom: -30px; left: -30px; width: 150px; height: 150px; background: rgba(255, 255, 255, 0.08); border-radius: 50%;"></div>
              <h1 style="margin: 0; color: #FFFFFF; font-size: 32px; font-weight: 700; letter-spacing: -0.5px; position: relative; z-index: 1;">ChainCola</h1>
              <p style="margin: 12px 0 0 0; color: #E9D5FF; font-size: 15px; font-weight: 500; position: relative; z-index: 1;">Your Trusted Crypto Exchange</p>
            </td>
          </tr>

          <!-- Status Badge -->
          <tr>
            <td style="padding: 30px 30px 20px 30px; text-align: center;">
              <div style="display: inline-block; background-color: ${statusColor}15; border: 2px solid ${statusColor}; border-radius: 50px; padding: 8px 20px;">
                <span style="color: ${statusColor}; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">${statusText}</span>
              </div>
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td style="padding: 0 30px 30px 30px;">
              <h2 style="margin: 0 0 20px 0; color: #111827; font-size: 24px; font-weight: 700;">Crypto Purchase ${isCompleted ? 'Completed' : isFailed ? 'Failed' : 'Initiated'}</h2>
              
              <p style="margin: 0 0 30px 0; color: #6B7280; font-size: 16px; line-height: 1.6;">
                ${isCompleted 
                  ? `Hello ${data.userName},<br><br>Your purchase of <strong>${data.cryptoAmount} ${data.cryptoCurrency}</strong> has been successfully completed. The cryptocurrency has been credited to your wallet.`
                  : isFailed
                  ? `Hello ${data.userName},<br><br>We regret to inform you that your purchase of <strong>${data.cryptoCurrency}</strong> could not be completed. Your funds have been refunded to your wallet.`
                  : `Hello ${data.userName},<br><br>Your purchase order for <strong>${data.cryptoCurrency}</strong> has been placed successfully. We'll notify you once the transaction is completed.`
                }
              </p>

              <!-- Transaction Details Card -->
              <div style="background: linear-gradient(135deg, #F9FAFB 0%, #FFFFFF 100%); border: 1px solid #E5E7EB; border-radius: 12px; padding: 28px; margin-bottom: 30px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);">
                <h3 style="margin: 0 0 24px 0; color: #111827; font-size: 18px; font-weight: 600; display: flex; align-items: center;">
                  <span style="display: inline-block; width: 4px; height: 20px; background: linear-gradient(135deg, #6B46C1 0%, #9333EA 100%); border-radius: 2px; margin-right: 12px;"></span>
                  Transaction Details
                </h3>
                
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 12px 0; color: #6B7280; font-size: 14px; border-bottom: 1px solid #E5E7EB;">Cryptocurrency</td>
                    <td style="padding: 12px 0; text-align: right; color: #111827; font-size: 14px; font-weight: 600; border-bottom: 1px solid #E5E7EB;">${data.cryptoCurrency}</td>
                  </tr>
                  ${isCompleted ? `
                  <tr>
                    <td style="padding: 12px 0; color: #6B7280; font-size: 14px; border-bottom: 1px solid #E5E7EB;">Amount Received</td>
                    <td style="padding: 12px 0; text-align: right; color: #111827; font-size: 14px; font-weight: 600; border-bottom: 1px solid #E5E7EB;">${data.cryptoAmount} ${data.cryptoCurrency}</td>
                  </tr>
                  ` : ''}
                  <tr>
                    <td style="padding: 12px 0; color: #6B7280; font-size: 14px; border-bottom: 1px solid #E5E7EB;">Amount Paid</td>
                    <td style="padding: 12px 0; text-align: right; color: #111827; font-size: 16px; font-weight: 700; border-bottom: 1px solid #E5E7EB;">₦${parseFloat(data.ngnAmount).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  </tr>
                  <tr>
                    <td style="padding: 12px 0; color: #6B7280; font-size: 14px; border-bottom: 1px solid #E5E7EB;">Transaction Fee</td>
                    <td style="padding: 12px 0; text-align: right; color: #111827; font-size: 14px; font-weight: 600; border-bottom: 1px solid #E5E7EB;">₦${parseFloat(data.feeAmount).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  </tr>
                  <tr>
                    <td style="padding: 12px 0; color: #6B7280; font-size: 14px; border-bottom: 1px solid #E5E7EB;">Order ID</td>
                    <td style="padding: 12px 0; text-align: right; color: #6B7280; font-size: 13px; font-family: 'Courier New', monospace; border-bottom: 1px solid #E5E7EB;">${data.orderId}</td>
                  </tr>
                  <tr>
                    <td style="padding: 12px 0; color: #6B7280; font-size: 14px;">Transaction Date</td>
                    <td style="padding: 12px 0; text-align: right; color: #6B7280; font-size: 14px;">${data.transactionDate}</td>
                  </tr>
                </table>
              </div>

              ${isCompleted ? `
              <!-- Success Message -->
              <div style="background-color: #ECFDF5; border-left: 4px solid #10B981; padding: 16px; border-radius: 4px; margin-bottom: 30px;">
                <p style="margin: 0; color: #065F46; font-size: 14px; line-height: 1.6;">
                  <strong>✓ Success!</strong> Your ${data.cryptoCurrency} has been added to your wallet. You can now use it for trading, sending, or holding.
                </p>
              </div>
              ` : isFailed ? `
              <!-- Failure Message -->
              <div style="background-color: #FEF2F2; border-left: 4px solid #EF4444; padding: 16px; border-radius: 4px; margin-bottom: 30px;">
                <p style="margin: 0; color: #991B1B; font-size: 14px; line-height: 1.6;">
                  <strong>⚠ Transaction Failed</strong> If you have any questions or concerns, please contact our support team.
                </p>
              </div>
              ` : `
              <!-- Pending Message -->
              <div style="background-color: #FFFBEB; border-left: 4px solid #F59E0B; padding: 16px; border-radius: 4px; margin-bottom: 30px;">
                <p style="margin: 0; color: #92400E; font-size: 14px; line-height: 1.6;">
                  <strong>⏳ Processing</strong> Your order is being processed. You'll receive another email once it's completed.
                </p>
              </div>
              `}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #F9FAFB; padding: 30px; text-align: center; border-top: 1px solid #E5E7EB;">
              <p style="margin: 0 0 12px 0; color: #6B7280; font-size: 14px; line-height: 1.6;">
                If you have any questions, please contact our support team.
              </p>
              <p style="margin: 0; color: #9CA3AF; font-size: 12px;">
                © ${new Date().getFullYear()} ChainCola. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

/**
 * Generate professional sell crypto email template
 */
export function generateSellCryptoEmail(data: SellCryptoEmailData): string {
  const isCompleted = data.status === 'COMPLETED';
  const isFailed = data.status === 'FAILED';
  const statusColor = isCompleted ? '#10B981' : isFailed ? '#EF4444' : '#F59E0B';
  const statusText = isCompleted ? 'Completed' : isFailed ? 'Failed' : 'Pending';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Crypto Sale ${statusText}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #F3F4F6;">
  <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #F3F4F6; padding: 20px;">
    <tr>
      <td align="center">
        <table role="presentation" style="max-width: 600px; width: 100%; border-collapse: collapse; background-color: #FFFFFF; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #6B46C1 0%, #9333EA 100%); padding: 40px 30px; text-align: center;">
              <h1 style="margin: 0; color: #FFFFFF; font-size: 28px; font-weight: 700; letter-spacing: -0.5px;">ChainCola</h1>
              <p style="margin: 8px 0 0 0; color: #E9D5FF; font-size: 14px; font-weight: 500;">Your Trusted Crypto Exchange</p>
            </td>
          </tr>

          <!-- Status Badge -->
          <tr>
            <td style="padding: 30px 30px 20px 30px; text-align: center;">
              <div style="display: inline-block; background-color: ${statusColor}15; border: 2px solid ${statusColor}; border-radius: 50px; padding: 8px 20px;">
                <span style="color: ${statusColor}; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">${statusText}</span>
              </div>
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td style="padding: 0 30px 30px 30px;">
              <h2 style="margin: 0 0 20px 0; color: #111827; font-size: 24px; font-weight: 700;">Crypto Sale ${isCompleted ? 'Completed' : isFailed ? 'Failed' : 'Initiated'}</h2>
              
              <p style="margin: 0 0 30px 0; color: #6B7280; font-size: 16px; line-height: 1.6;">
                ${isCompleted 
                  ? `Hello ${data.userName},<br><br>Your sale of <strong>${data.cryptoAmount} ${data.cryptoCurrency}</strong> has been successfully completed. The proceeds have been credited to your NGN wallet.`
                  : isFailed
                  ? `Hello ${data.userName},<br><br>We regret to inform you that your sale of <strong>${data.cryptoCurrency}</strong> could not be completed. Your cryptocurrency has been returned to your wallet.`
                  : `Hello ${data.userName},<br><br>Your sale order for <strong>${data.cryptoAmount} ${data.cryptoCurrency}</strong> has been placed successfully. We'll notify you once the transaction is completed.`
                }
              </p>

              <!-- Transaction Details Card -->
              <div style="background-color: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 8px; padding: 24px; margin-bottom: 30px;">
                <h3 style="margin: 0 0 20px 0; color: #111827; font-size: 18px; font-weight: 600;">Transaction Details</h3>
                
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 12px 0; color: #6B7280; font-size: 14px; border-bottom: 1px solid #E5E7EB;">Cryptocurrency Sold</td>
                    <td style="padding: 12px 0; text-align: right; color: #111827; font-size: 14px; font-weight: 600; border-bottom: 1px solid #E5E7EB;">${data.cryptoAmount} ${data.cryptoCurrency}</td>
                  </tr>
                  ${isCompleted ? `
                  <tr>
                    <td style="padding: 12px 0; color: #6B7280; font-size: 14px; border-bottom: 1px solid #E5E7EB;">Amount Received</td>
                    <td style="padding: 12px 0; text-align: right; color: #10B981; font-size: 18px; font-weight: 700; border-bottom: 1px solid #E5E7EB;">₦${parseFloat(data.ngnAmount).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  </tr>
                  ` : `
                  <tr>
                    <td style="padding: 12px 0; color: #6B7280; font-size: 14px; border-bottom: 1px solid #E5E7EB;">Estimated Amount</td>
                    <td style="padding: 12px 0; text-align: right; color: #111827; font-size: 16px; font-weight: 600; border-bottom: 1px solid #E5E7EB;">₦${parseFloat(data.ngnAmount).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  </tr>
                  `}
                  <tr>
                    <td style="padding: 12px 0; color: #6B7280; font-size: 14px; border-bottom: 1px solid #E5E7EB;">Transaction Fee</td>
                    <td style="padding: 12px 0; text-align: right; color: #111827; font-size: 14px; font-weight: 600; border-bottom: 1px solid #E5E7EB;">₦${parseFloat(data.feeAmount).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  </tr>
                  <tr>
                    <td style="padding: 12px 0; color: #6B7280; font-size: 14px; border-bottom: 1px solid #E5E7EB;">Order ID</td>
                    <td style="padding: 12px 0; text-align: right; color: #6B7280; font-size: 13px; font-family: 'Courier New', monospace; border-bottom: 1px solid #E5E7EB;">${data.orderId}</td>
                  </tr>
                  <tr>
                    <td style="padding: 12px 0; color: #6B7280; font-size: 14px;">Transaction Date</td>
                    <td style="padding: 12px 0; text-align: right; color: #6B7280; font-size: 14px;">${data.transactionDate}</td>
                  </tr>
                </table>
              </div>

              ${isCompleted ? `
              <!-- Success Message -->
              <div style="background-color: #ECFDF5; border-left: 4px solid #10B981; padding: 16px; border-radius: 4px; margin-bottom: 30px;">
                <p style="margin: 0; color: #065F46; font-size: 14px; line-height: 1.6;">
                  <strong>✓ Success!</strong> Your NGN has been added to your wallet. You can now use it for purchases, withdrawals, or other transactions.
                </p>
              </div>
              ` : isFailed ? `
              <!-- Failure Message -->
              <div style="background-color: #FEF2F2; border-left: 4px solid #EF4444; padding: 16px; border-radius: 4px; margin-bottom: 30px;">
                <p style="margin: 0; color: #991B1B; font-size: 14px; line-height: 1.6;">
                  <strong>⚠ Transaction Failed</strong> If you have any questions or concerns, please contact our support team.
                </p>
              </div>
              ` : `
              <!-- Pending Message -->
              <div style="background-color: #FFFBEB; border-left: 4px solid #F59E0B; padding: 16px; border-radius: 4px; margin-bottom: 30px;">
                <p style="margin: 0; color: #92400E; font-size: 14px; line-height: 1.6;">
                  <strong>⏳ Processing</strong> Your order is being processed. You'll receive another email once it's completed.
                </p>
              </div>
              `}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #F9FAFB; padding: 30px; text-align: center; border-top: 1px solid #E5E7EB;">
              <p style="margin: 0 0 12px 0; color: #6B7280; font-size: 14px; line-height: 1.6;">
                If you have any questions, please contact our support team.
              </p>
              <p style="margin: 0; color: #9CA3AF; font-size: 12px;">
                © ${new Date().getFullYear()} ChainCola. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}


export interface WalletFundingEmailData {
  userName: string;
  amount: string;
  netAmount: string;
  fee: string;
  currency: string;
  transactionId: string;
  transactionDate: string;
  status: 'COMPLETED' | 'FAILED';
}

/**
 * Generate professional wallet funding email template
 */
export function generateWalletFundingEmail(data: WalletFundingEmailData): string {
  const isCompleted = data.status === 'COMPLETED';
  const statusColor = isCompleted ? '#10B981' : '#EF4444';
  const statusText = isCompleted ? 'Completed' : 'Failed';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Wallet Funding ${statusText}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #F3F4F6;">
  <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #F3F4F6; padding: 20px;">
    <tr>
      <td align="center">
        <table role="presentation" style="max-width: 600px; width: 100%; border-collapse: collapse; background-color: #FFFFFF; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #6B46C1 0%, #9333EA 100%); padding: 50px 30px; text-align: center; position: relative; overflow: hidden;">
              <div style="position: absolute; top: -50px; right: -50px; width: 200px; height: 200px; background: rgba(255, 255, 255, 0.1); border-radius: 50%;"></div>
              <div style="position: absolute; bottom: -30px; left: -30px; width: 150px; height: 150px; background: rgba(255, 255, 255, 0.08); border-radius: 50%;"></div>
              <h1 style="margin: 0; color: #FFFFFF; font-size: 32px; font-weight: 700; letter-spacing: -0.5px; position: relative; z-index: 1;">ChainCola</h1>
              <p style="margin: 12px 0 0 0; color: #E9D5FF; font-size: 15px; font-weight: 500; position: relative; z-index: 1;">Your Trusted Crypto Exchange</p>
            </td>
          </tr>

          <!-- Status Badge -->
          <tr>
            <td style="padding: 30px 30px 20px 30px; text-align: center;">
              <div style="display: inline-block; background-color: ${statusColor}15; border: 2px solid ${statusColor}; border-radius: 50px; padding: 8px 20px;">
                <span style="color: ${statusColor}; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">${statusText}</span>
              </div>
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td style="padding: 0 30px 30px 30px;">
              <h2 style="margin: 0 0 20px 0; color: #111827; font-size: 24px; font-weight: 700;">Wallet Funding ${isCompleted ? 'Successful' : 'Failed'}</h2>
              
              <p style="margin: 0 0 30px 0; color: #6B7280; font-size: 16px; line-height: 1.6;">
                ${isCompleted 
                  ? `Hello ${data.userName},<br><br>Your wallet has been successfully funded. Your account has been credited with <strong>${data.netAmount} ${data.currency}</strong>.`
                  : `Hello ${data.userName},<br><br>We regret to inform you that your wallet funding transaction could not be completed. Please try again or contact support if the issue persists.`
                }
              </p>

              <!-- Transaction Details Card -->
              <div style="background: linear-gradient(135deg, #F9FAFB 0%, #FFFFFF 100%); border: 1px solid #E5E7EB; border-radius: 12px; padding: 28px; margin-bottom: 30px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);">
                <h3 style="margin: 0 0 24px 0; color: #111827; font-size: 18px; font-weight: 600; display: flex; align-items: center;">
                  <span style="display: inline-block; width: 4px; height: 20px; background: linear-gradient(135deg, #6B46C1 0%, #9333EA 100%); border-radius: 2px; margin-right: 12px;"></span>
                  Transaction Details
                </h3>
                
                <table style="width: 100%; border-collapse: collapse;">
                  ${isCompleted ? `
                  <tr>
                    <td style="padding: 12px 0; color: #6B7280; font-size: 14px; border-bottom: 1px solid #E5E7EB;">Amount Credited</td>
                    <td style="padding: 12px 0; text-align: right; color: #10B981; font-size: 18px; font-weight: 700; border-bottom: 1px solid #E5E7EB;">${data.currency === 'NGN' ? '₦' : '$'}${parseFloat(data.netAmount).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  </tr>
                  <tr>
                    <td style="padding: 12px 0; color: #6B7280; font-size: 14px; border-bottom: 1px solid #E5E7EB;">Gross Amount</td>
                    <td style="padding: 12px 0; text-align: right; color: #111827; font-size: 14px; font-weight: 600; border-bottom: 1px solid #E5E7EB;">${data.currency === 'NGN' ? '₦' : '$'}${parseFloat(data.amount).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  </tr>
                  <tr>
                    <td style="padding: 12px 0; color: #6B7280; font-size: 14px; border-bottom: 1px solid #E5E7EB;">Processing fee</td>
                    <td style="padding: 12px 0; text-align: right; color: #111827; font-size: 14px; font-weight: 600; border-bottom: 1px solid #E5E7EB;">${data.currency === 'NGN' ? '₦' : '$'}${parseFloat(data.fee).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  </tr>
                  ` : `
                  <tr>
                    <td style="padding: 12px 0; color: #6B7280; font-size: 14px; border-bottom: 1px solid #E5E7EB;">Amount</td>
                    <td style="padding: 12px 0; text-align: right; color: #111827; font-size: 14px; font-weight: 600; border-bottom: 1px solid #E5E7EB;">${data.currency === 'NGN' ? '₦' : '$'}${parseFloat(data.amount).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  </tr>
                  `}
                  <tr>
                    <td style="padding: 12px 0; color: #6B7280; font-size: 14px; border-bottom: 1px solid #E5E7EB;">Transaction ID</td>
                    <td style="padding: 12px 0; text-align: right; color: #6B7280; font-size: 13px; font-family: 'Courier New', monospace; border-bottom: 1px solid #E5E7EB;">${data.transactionId}</td>
                  </tr>
                  <tr>
                    <td style="padding: 12px 0; color: #6B7280; font-size: 14px;">Transaction Date</td>
                    <td style="padding: 12px 0; text-align: right; color: #6B7280; font-size: 14px;">${data.transactionDate}</td>
                  </tr>
                </table>
              </div>

              ${isCompleted ? `
              <!-- Success Message -->
              <div style="background-color: #ECFDF5; border-left: 4px solid #10B981; padding: 16px; border-radius: 4px; margin-bottom: 30px;">
                <p style="margin: 0; color: #065F46; font-size: 14px; line-height: 1.6;">
                  <strong>✓ Success!</strong> Your wallet has been credited. You can now use your balance to buy cryptocurrency, make payments, or withdraw funds.
                </p>
              </div>
              ` : `
              <!-- Failure Message -->
              <div style="background-color: #FEF2F2; border-left: 4px solid #EF4444; padding: 16px; border-radius: 4px; margin-bottom: 30px;">
                <p style="margin: 0; color: #991B1B; font-size: 14px; line-height: 1.6;">
                  <strong>⚠ Transaction Failed</strong> If you have any questions or concerns, please contact our support team.
                </p>
              </div>
              `}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #F9FAFB; padding: 30px; text-align: center; border-top: 1px solid #E5E7EB;">
              <p style="margin: 0 0 12px 0; color: #6B7280; font-size: 14px; line-height: 1.6;">
                If you have any questions, please contact our support team.
              </p>
              <p style="margin: 0; color: #9CA3AF; font-size: 12px;">
                © ${new Date().getFullYear()} ChainCola. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

export interface CryptoDepositEmailData {
  userName: string;
  cryptoCurrency: string;
  cryptoAmount: string;
  transactionHash: string;
  confirmations: number;
  transactionDate: string;
  walletAddress: string;
}

/**
 * Generate professional crypto deposit email template
 */
export function generateCryptoDepositEmail(data: CryptoDepositEmailData): string {
  const statusColor = '#10B981';
  const statusText = 'Completed';

  // Format amount based on currency
  const formatAmount = (amt: string, currency: string): string => {
    const amount = parseFloat(amt);
    if (currency === 'BTC') {
      return `${amount.toFixed(8)} BTC`;
    } else if (currency === 'ETH') {
      return `${amount.toFixed(6)} ETH`;
    } else if (currency === 'USDT' || currency === 'USDC') {
      return `${amount.toFixed(2)} ${currency}`;
    } else if (currency === 'TRX') {
      return `${amount.toFixed(2)} TRX`;
    } else if (currency === 'XRP') {
      return `${amount.toFixed(2)} XRP`;
    }
    return `${amount} ${currency}`;
  };

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Crypto Deposit Successful</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #F3F4F6;">
  <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #F3F4F6; padding: 20px;">
    <tr>
      <td align="center">
        <table role="presentation" style="max-width: 600px; width: 100%; border-collapse: collapse; background-color: #FFFFFF; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #6B46C1 0%, #9333EA 100%); padding: 50px 30px; text-align: center; position: relative; overflow: hidden;">
              <div style="position: absolute; top: -50px; right: -50px; width: 200px; height: 200px; background: rgba(255, 255, 255, 0.1); border-radius: 50%;"></div>
              <div style="position: absolute; bottom: -30px; left: -30px; width: 150px; height: 150px; background: rgba(255, 255, 255, 0.08); border-radius: 50%;"></div>
              <h1 style="margin: 0; color: #FFFFFF; font-size: 32px; font-weight: 700; letter-spacing: -0.5px; position: relative; z-index: 1;">ChainCola</h1>
              <p style="margin: 12px 0 0 0; color: #E9D5FF; font-size: 15px; font-weight: 500; position: relative; z-index: 1;">Your Trusted Crypto Exchange</p>
            </td>
          </tr>

          <!-- Status Badge -->
          <tr>
            <td style="padding: 30px 30px 20px 30px; text-align: center;">
              <div style="display: inline-block; background-color: ${statusColor}15; border: 2px solid ${statusColor}; border-radius: 50px; padding: 8px 20px;">
                <span style="color: ${statusColor}; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">${statusText}</span>
              </div>
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td style="padding: 0 30px 30px 30px;">
              <h2 style="margin: 0 0 20px 0; color: #111827; font-size: 24px; font-weight: 700;">💰 Deposit Successful</h2>
              
              <p style="margin: 0 0 30px 0; color: #6B7280; font-size: 16px; line-height: 1.6;">
                Hello ${data.userName},<br><br>Your deposit of <strong>${formatAmount(data.cryptoAmount, data.cryptoCurrency)}</strong> has been successfully received and credited to your wallet.
              </p>

              <!-- Transaction Details Card -->
              <div style="background: linear-gradient(135deg, #F9FAFB 0%, #FFFFFF 100%); border: 1px solid #E5E7EB; border-radius: 12px; padding: 28px; margin-bottom: 30px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);">
                <h3 style="margin: 0 0 24px 0; color: #111827; font-size: 18px; font-weight: 600; display: flex; align-items: center;">
                  <span style="display: inline-block; width: 4px; height: 20px; background: linear-gradient(135deg, #6B46C1 0%, #9333EA 100%); border-radius: 2px; margin-right: 12px;"></span>
                  Transaction Details
                </h3>
                
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 12px 0; color: #6B7280; font-size: 14px; border-bottom: 1px solid #E5E7EB;">Amount Received</td>
                    <td style="padding: 12px 0; text-align: right; color: #10B981; font-size: 18px; font-weight: 700; border-bottom: 1px solid #E5E7EB;">${formatAmount(data.cryptoAmount, data.cryptoCurrency)}</td>
                  </tr>
                  <tr>
                    <td style="padding: 12px 0; color: #6B7280; font-size: 14px; border-bottom: 1px solid #E5E7EB;">Cryptocurrency</td>
                    <td style="padding: 12px 0; text-align: right; color: #111827; font-size: 14px; font-weight: 600; border-bottom: 1px solid #E5E7EB;">${data.cryptoCurrency}</td>
                  </tr>
                  <tr>
                    <td style="padding: 12px 0; color: #6B7280; font-size: 14px; border-bottom: 1px solid #E5E7EB;">Confirmations</td>
                    <td style="padding: 12px 0; text-align: right; color: #111827; font-size: 14px; font-weight: 600; border-bottom: 1px solid #E5E7EB;">${data.confirmations}</td>
                  </tr>
                  <tr>
                    <td style="padding: 12px 0; color: #6B7280; font-size: 14px; border-bottom: 1px solid #E5E7EB;">Transaction Hash</td>
                    <td style="padding: 12px 0; text-align: right; color: #6B7280; font-size: 13px; font-family: 'Courier New', monospace; border-bottom: 1px solid #E5E7EB; word-break: break-all;">${data.transactionHash.substring(0, 20)}...${data.transactionHash.substring(data.transactionHash.length - 8)}</td>
                  </tr>
                  <tr>
                    <td style="padding: 12px 0; color: #6B7280; font-size: 14px; border-bottom: 1px solid #E5E7EB;">Wallet Address</td>
                    <td style="padding: 12px 0; text-align: right; color: #6B7280; font-size: 13px; font-family: 'Courier New', monospace; border-bottom: 1px solid #E5E7EB; word-break: break-all;">${data.walletAddress.substring(0, 10)}...${data.walletAddress.substring(data.walletAddress.length - 8)}</td>
                  </tr>
                  <tr>
                    <td style="padding: 12px 0; color: #6B7280; font-size: 14px;">Transaction Date</td>
                    <td style="padding: 12px 0; text-align: right; color: #6B7280; font-size: 14px;">${data.transactionDate}</td>
                  </tr>
                </table>
              </div>

              <!-- Success Message -->
              <div style="background-color: #ECFDF5; border-left: 4px solid #10B981; padding: 16px; border-radius: 4px; margin-bottom: 30px;">
                <p style="margin: 0; color: #065F46; font-size: 14px; line-height: 1.6;">
                  <strong>✓ Success!</strong> Your ${data.cryptoCurrency} has been added to your wallet. You can now use it for trading, sending, or holding.
                </p>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #F9FAFB; padding: 30px; text-align: center; border-top: 1px solid #E5E7EB;">
              <p style="margin: 0 0 12px 0; color: #6B7280; font-size: 14px; line-height: 1.6;">
                If you have any questions, please contact our support team.
              </p>
              <p style="margin: 0; color: #9CA3AF; font-size: 12px;">
                © ${new Date().getFullYear()} ChainCola. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}
