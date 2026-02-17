#!/bin/bash

# ChainCola Transfer Backend Setup Commands
# Run these commands after SSH'ing into your VPS: ssh root@72.62.165.208

set -e

echo "🚀 Setting up ChainCola Transfer Backend on VPS..."
echo ""

# Create project directory
echo "📁 Creating project directory..."
mkdir -p chaincola-transfer
cd chaincola-transfer

# Initialize npm project
echo "📦 Initializing npm project..."
npm init -y

# Install dependencies
echo "📥 Installing dependencies..."
npm install express axios dotenv cors

# Install dev dependencies
echo "📥 Installing dev dependencies..."
npm install --save-dev nodemon

echo ""
echo "✅ Setup complete!"
echo ""
echo "📋 Project created at: $(pwd)"
echo "📦 Dependencies installed:"
echo "   - express"
echo "   - axios"
echo "   - dotenv"
echo "   - cors"
echo "   - nodemon (dev)"
echo ""
echo "📝 Next steps:"
echo "   1. Create your server file (e.g., src/index.js)"
echo "   2. Create .env file with your configuration"
echo "   3. Update package.json scripts"
echo "   4. Start server: npm start"










