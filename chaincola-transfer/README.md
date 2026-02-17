# ChainCola Transfer Backend

Backend service for handling Flutterwave transfers and other payment operations.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create `.env` file:
```bash
cp .env.example .env
```

3. Configure environment variables in `.env`:
```env
PORT=3000
NODE_ENV=production
FLUTTERWAVE_SECRET_KEY=your_flutterwave_secret_key
FLUTTERWAVE_PUBLIC_KEY=your_flutterwave_public_key
FLUTTERWAVE_API_BASE=https://api.flutterwave.com/v3
FLUTTERWAVE_SECRET_HASH=your_secret_hash
```

## Running the Server

### Development (with auto-reload):
```bash
npm run dev
```

### Production:
```bash
npm start
```

## API Endpoints

### Health Check
```
GET /health
```

### Transfer API

#### Initiate Transfer
```
POST /api/transfer
Content-Type: application/json

{
  "account_bank": "044",
  "account_number": "0690000031",
  "amount": 500,
  "narration": "Payment for services",
  "currency": "NGN"
}
```

#### Get Transfer Status
```
GET /api/transfer/:transfer_id
```

#### List All Transfers
```
GET /api/transfer?page=1&status=SUCCESSFUL
```

## Deployment

### Using PM2 (Recommended):
```bash
npm install -g pm2
pm2 start src/index.js --name chaincola-transfer
pm2 save
pm2 startup
```
