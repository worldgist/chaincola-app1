import { generateBuyCryptoEmail, generateSellCryptoEmail, generateWalletFundingEmail, generateCryptoDepositEmail } from './email-templates.ts';

interface SendEmailParams {
  supabase: any;
  userId: string;
  to: string;
  subject: string;
  html: string;
}

/**
 * Sends an email using the send-email edge function
 */
async function sendEmail({ supabase, userId, to, subject, html }: SendEmailParams): Promise<{ success: boolean; error?: string }> {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const functionUrl = `${supabaseUrl}/functions/v1/send-email`;

    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''}`,
      },
      body: JSON.stringify({
        to,
        subject,
        html,
        userId,
        type: 'transaction',
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('❌ Email sending failed:', response.status, errorData);
      return {
        success: false,
        error: `Email sending failed: ${response.status}`,
      };
    }

    const result = await response.json();
    if (!result.success) {
      return {
        success: false,
        error: result.error || 'Email sending failed',
      };
    }

    console.log('✅ Email sent successfully to', to);
    return { success: true };
  } catch (error: any) {
    console.error('❌ Exception sending email:', error);
    return {
      success: false,
      error: error.message || 'Failed to send email',
    };
  }
}

/**
 * Sends buy crypto transaction email
 */
export async function sendBuyCryptoEmail(
  supabase: any,
  userId: string,
  userEmail: string,
  userName: string,
  transactionData: {
    cryptoCurrency: string;
    cryptoAmount: string;
    ngnAmount: string;
    feeAmount: string;
    orderId: string;
    transactionId: string;
    transactionDate: string;
    status: 'PENDING' | 'COMPLETED' | 'FAILED';
  }
): Promise<void> {
  try {
    const html = generateBuyCryptoEmail({
      userName,
      cryptoCurrency: transactionData.cryptoCurrency,
      cryptoAmount: transactionData.cryptoAmount,
      ngnAmount: transactionData.ngnAmount,
      feeAmount: transactionData.feeAmount,
      orderId: transactionData.orderId,
      transactionId: transactionData.transactionId,
      transactionDate: transactionData.transactionDate,
      status: transactionData.status,
    });

    const subject = `Buy ${transactionData.cryptoCurrency} ${transactionData.status === 'COMPLETED' ? 'Completed' : transactionData.status === 'FAILED' ? 'Failed' : 'Initiated'}`;

    await sendEmail({
      supabase,
      userId,
      to: userEmail,
      subject,
      html,
    });
  } catch (error) {
    console.error('⚠️ Error sending buy crypto email:', error);
    // Don't throw - email failure shouldn't fail the transaction
  }
}

/**
 * Sends sell crypto transaction email
 */
export async function sendSellCryptoEmail(
  supabase: any,
  userId: string,
  userEmail: string,
  userName: string,
  transactionData: {
    cryptoCurrency: string;
    cryptoAmount: string;
    ngnAmount: string;
    feeAmount: string;
    orderId: string;
    transactionId: string;
    transactionDate: string;
    status: 'PENDING' | 'COMPLETED' | 'FAILED';
  }
): Promise<void> {
  try {
    const html = generateSellCryptoEmail({
      userName,
      cryptoCurrency: transactionData.cryptoCurrency,
      cryptoAmount: transactionData.cryptoAmount,
      ngnAmount: transactionData.ngnAmount,
      feeAmount: transactionData.feeAmount,
      orderId: transactionData.orderId,
      transactionId: transactionData.transactionId,
      transactionDate: transactionData.transactionDate,
      status: transactionData.status,
    });

    const subject = `Sell ${transactionData.cryptoCurrency} ${transactionData.status === 'COMPLETED' ? 'Completed' : transactionData.status === 'FAILED' ? 'Failed' : 'Initiated'}`;

    await sendEmail({
      supabase,
      userId,
      to: userEmail,
      subject,
      html,
    });
  } catch (error) {
    console.error('⚠️ Error sending sell crypto email:', error);
    // Don't throw - email failure shouldn't fail the transaction
  }
}

/**
 * Sends wallet funding email
 */
export async function sendWalletFundingEmail(
  supabase: any,
  userId: string,
  userEmail: string,
  userName: string,
  transactionData: {
    amount: string;
    netAmount: string;
    fee: string;
    currency: string;
    transactionId: string;
    transactionDate: string;
    status: 'COMPLETED' | 'FAILED';
  }
): Promise<void> {
  try {
    const html = generateWalletFundingEmail({
      userName,
      amount: transactionData.amount,
      netAmount: transactionData.netAmount,
      fee: transactionData.fee,
      currency: transactionData.currency,
      transactionId: transactionData.transactionId,
      transactionDate: transactionData.transactionDate,
      status: transactionData.status,
    });

    const subject = `Wallet Funding ${transactionData.status === 'COMPLETED' ? 'Successful' : 'Failed'}`;

    await sendEmail({
      supabase,
      userId,
      to: userEmail,
      subject,
      html,
    });
  } catch (error) {
    console.error('⚠️ Error sending wallet funding email:', error);
    // Don't throw - email failure shouldn't fail the transaction
  }
}

/**
 * Sends crypto deposit success email
 */
export async function sendCryptoDepositEmail(
  supabase: any,
  userId: string,
  userEmail: string,
  userName: string,
  depositData: {
    cryptoCurrency: string;
    cryptoAmount: string;
    transactionHash: string;
    confirmations: number;
    transactionDate: string;
    walletAddress: string;
  }
): Promise<void> {
  try {
    const html = generateCryptoDepositEmail({
      userName,
      cryptoCurrency: depositData.cryptoCurrency,
      cryptoAmount: depositData.cryptoAmount,
      transactionHash: depositData.transactionHash,
      confirmations: depositData.confirmations,
      transactionDate: depositData.transactionDate,
      walletAddress: depositData.walletAddress,
    });

    const subject = `${depositData.cryptoCurrency} Deposit Successful - ${depositData.cryptoAmount} ${depositData.cryptoCurrency} Received`;

    await sendEmail({
      supabase,
      userId,
      to: userEmail,
      subject,
      html,
    });
  } catch (error) {
    console.error('⚠️ Error sending crypto deposit email:', error);
    // Don't throw - email failure shouldn't fail the transaction
  }
}
