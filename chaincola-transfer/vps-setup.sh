#!/bin/bash

# VPS Setup Script for ChainCola Transfer Backend
# Run this on your VPS server

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
npm install express axios dotenv cors nodemon

# Create directory structure
echo "📁 Creating directory structure..."
mkdir -p src/routes src/config logs

echo ""
echo "✅ Setup complete!"
echo ""
echo "📋 Next steps:"
echo "   1. Upload project files from local machine"
echo "   2. Create .env file with Flutterwave keys"
echo "   3. Run: npm start"
echo ""
echo "Current directory: $(pwd)"
echo "Files created:"
ls -la










