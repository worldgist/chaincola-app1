const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const transferRoutes = require('./routes/transfer');
const { validateConfig } = require('./config/flutterwave');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'UP', message: 'ChainCola Transfer Service is running' });
});

// Flutterwave Transfer Routes
app.use('/api/transfer', transferRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.stack);
  res.status(500).json({ success: false, error: 'Internal Server Error' });
});

// Validate Flutterwave config on startup
try {
  validateConfig();
  console.log('✅ Flutterwave configuration is valid');
} catch (error) {
  console.error('❌ Flutterwave configuration error:', error.message);
  process.exit(1); // Exit if critical config is missing
}

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV}`);
});
