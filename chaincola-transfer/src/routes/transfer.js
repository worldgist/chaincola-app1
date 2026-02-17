const express = require('express');
const axios = require('axios');
const router = express.Router();
const { validateConfig, getHeaders, getApiBase } = require('../config/flutterwave');

// Validate Flutterwave configuration on module load
try {
  validateConfig();
} catch (error) {
  console.warn('⚠️  Flutterwave configuration warning:', error.message);
  console.warn('   Please set FLUTTERWAVE_SECRET_KEY and FLUTTERWAVE_PUBLIC_KEY in .env file');
  console.warn('   Get keys from Supabase Dashboard > Settings > Edge Functions > Secrets');
}

/**
 * Initiate a Flutterwave transfer
 * POST /api/transfer
 * 
 * Body:
 * {
 *   "account_bank": "044", // Bank code
 *   "account_number": "0690000031", // Account number
 *   "amount": 500, // Amount in NGN
 *   "narration": "Payment for services",
 *   "currency": "NGN",
 *   "reference": "unique-ref-123", // Optional: unique reference
 *   "beneficiary_name": "John Doe" // Optional
 * }
 */
router.post('/', async (req, res) => {
  try {
    // Validate required fields
    const { account_bank, account_number, amount, narration, currency = 'NGN', reference, beneficiary_name } = req.body;

    if (!account_bank || !account_number || !amount || !narration) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: account_bank, account_number, amount, narration'
      });
    }

    // Validate configuration
    try {
      validateConfig();
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: 'Flutterwave API credentials not configured',
        message: 'Please set FLUTTERWAVE_SECRET_KEY and FLUTTERWAVE_PUBLIC_KEY in .env file'
      });
    }

    // Validate amount
    if (amount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Amount must be greater than 0'
      });
    }

    // Generate unique reference if not provided
    const transferReference = reference || `CHAINCOLA-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    // Prepare Flutterwave transfer payload
    const transferPayload = {
      account_bank: account_bank.toString(),
      account_number: account_number.toString(),
      amount: parseFloat(amount),
      narration: narration,
      currency: currency,
      reference: transferReference,
      beneficiary_name: beneficiary_name || '',
      callback_url: process.env.FLUTTERWAVE_TRANSFER_CALLBACK_URL || '',
      debit_currency: currency
    };

    console.log(`📤 Initiating Flutterwave transfer:`, {
      reference: transferReference,
      account_bank,
      account_number: account_number.substring(0, 4) + '****',
      amount,
      currency
    });

    // Call Flutterwave API to initiate transfer
    const response = await axios.post(
      `${getApiBase()}/transfers`,
      transferPayload,
      {
        headers: getHeaders()
      }
    );

    if (response.data.status === 'success') {
      const transferData = response.data.data;

      console.log(`✅ Transfer initiated successfully:`, {
        id: transferData.id,
        reference: transferReference,
        status: transferData.status
      });

      return res.json({
        success: true,
        data: {
          transfer_id: transferData.id,
          reference: transferReference,
          amount: transferData.amount,
          currency: transferData.currency,
          status: transferData.status,
          account_number: account_number.substring(0, 4) + '****',
          account_bank: account_bank,
          narration: narration,
          created_at: transferData.created_at,
          complete_message: transferData.complete_message
        }
      });
    } else {
      console.error('❌ Flutterwave transfer failed:', response.data.message);
      return res.status(400).json({
        success: false,
        error: response.data.message || 'Transfer initiation failed',
        details: response.data
      });
    }
  } catch (error) {
    console.error('❌ Error initiating transfer:', error.message);
    
    if (error.response) {
      // Flutterwave API error
      return res.status(error.response.status || 500).json({
        success: false,
        error: error.response.data?.message || 'Transfer initiation failed',
        details: error.response.data
      });
    }

    return res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
});

/**
 * Get transfer status
 * GET /api/transfer/:transfer_id
 */
router.get('/:transfer_id', async (req, res) => {
  try {
    const { transfer_id } = req.params;

    // Validate configuration
    try {
      validateConfig();
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: 'Flutterwave API credentials not configured'
      });
    }

    // Call Flutterwave API to get transfer status
    const response = await axios.get(
      `${getApiBase()}/transfers/${transfer_id}`,
      {
        headers: getHeaders()
      }
    );

    if (response.data.status === 'success') {
      return res.json({
        success: true,
        data: response.data.data
      });
    } else {
      return res.status(400).json({
        success: false,
        error: response.data.message || 'Failed to fetch transfer status'
      });
    }
  } catch (error) {
    console.error('❌ Error fetching transfer status:', error.message);
    
    if (error.response) {
      return res.status(error.response.status || 500).json({
        success: false,
        error: error.response.data?.message || 'Failed to fetch transfer status',
        details: error.response.data
      });
    }

    return res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
});

/**
 * Get all transfers
 * GET /api/transfer
 * Query params: page, status, from, to
 */
router.get('/', async (req, res) => {
  try {
    const { page = 1, status, from, to } = req.query;

    // Validate configuration
    try {
      validateConfig();
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: 'Flutterwave API credentials not configured'
      });
    }

    // Build query parameters
    const params = new URLSearchParams();
    if (page) params.append('page', page);
    if (status) params.append('status', status);
    if (from) params.append('from', from);
    if (to) params.append('to', to);

    // Call Flutterwave API to get transfers
    const response = await axios.get(
      `${getApiBase()}/transfers?${params.toString()}`,
      {
        headers: getHeaders()
      }
    );

    if (response.data.status === 'success') {
      return res.json({
        success: true,
        data: response.data.data,
        meta: response.data.meta
      });
    } else {
      return res.status(400).json({
        success: false,
        error: response.data.message || 'Failed to fetch transfers'
      });
    }
  } catch (error) {
    console.error('❌ Error fetching transfers:', error.message);
    
    if (error.response) {
      return res.status(error.response.status || 500).json({
        success: false,
        error: error.response.data?.message || 'Failed to fetch transfers',
        details: error.response.data
      });
    }

    return res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
});

module.exports = router;
