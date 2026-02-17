#!/bin/bash

# Install Node.js on Ubuntu VPS
# Run this on your VPS server

set -e

echo "📦 Installing Node.js on VPS..."
echo ""

# Update package list
echo "🔄 Updating package list..."
apt-get update -y

# Install Node.js using NodeSource repository (recommended for latest LTS)
echo "📥 Installing Node.js..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# Verify installation
echo ""
echo "✅ Node.js installation complete!"
echo ""
node --version
npm --version
echo ""

echo "📋 Node.js and npm are now installed and ready to use!"










