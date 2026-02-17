# Install Node.js on VPS

Node.js is not installed on your VPS. Run these commands in your SSH session:

## Quick Install (Recommended)

```bash
# Install Node.js 20.x (LTS)
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# Verify installation
node --version
npm --version
```

## Alternative: Using Ubuntu Repository

```bash
# Update package list
apt-get update -y

# Install Node.js from Ubuntu repository
apt-get install -y nodejs npm

# Verify installation
node --version
npm --version
```

## After Installing Node.js

Then run:

```bash
cd ~/chaincola-transfer
npm install
```

## Full Setup Sequence

```bash
# 1. Install Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# 2. Verify installation
node --version
npm --version

# 3. Install project dependencies
cd ~/chaincola-transfer
npm install

# 4. Create .env file
cat > .env << 'EOF'
PORT=3000
NODE_ENV=production
FLUTTERWAVE_SECRET_KEY=FLWSECK-f74a8cc8506c173efd1e8ff3fedcf804-19959c985d4vt-X
FLUTTERWAVE_PUBLIC_KEY=FLWPUBK-7a52f5a97dca86f95d238a36570b3080-X
FLUTTERWAVE_API_BASE=https://api.flutterwave.com/v3
FLUTTERWAVE_SECRET_HASH=ytD2Sio1lvrP1Opj
EOF

# 5. Start the server
npm start
```










