#!/bin/bash

# Setup script for ChainCola Transfer Backend on VPS
# Run this script on your VPS server after SSH'ing in

set -e

echo "🚀 Setting up ChainCola Transfer Backend..."
echo ""

# Step 1: Create project directory
echo "📁 Creating project directory..."
mkdir -p chaincola-transfer
cd chaincola-transfer

# Step 2: Initialize npm project
echo "📦 Initializing npm project..."
npm init -y

# Step 3: Install dependencies
echo "📥 Installing dependencies..."
npm install express axios dotenv cors

# Step 4: Install dev dependencies (optional but recommended)
echo "📥 Installing dev dependencies..."
npm install --save-dev nodemon

# Step 5: Create basic project structure
echo "📝 Creating project structure..."
mkdir -p src
mkdir -p logs

# Step 6: Create basic files
cat > src/index.js << 'EOF'
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    service: 'chaincola-transfer-backend'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 ChainCola Transfer Backend running on port ${PORT}`);
  console.log(`📡 Health check: http://localhost:${PORT}/health`);
});
EOF

cat > .env.example << 'EOF'
# Server Configuration
PORT=3000
NODE_ENV=production

# Supabase Configuration
SUPABASE_URL=your_supabase_url_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here

# Alchemy Configuration
ALCHEMY_API_KEY=your_alchemy_api_key_here
ALCHEMY_ETHEREUM_URL=your_alchemy_ethereum_url_here
EOF

cat > .gitignore << 'EOF'
# Dependencies
node_modules/

# Environment variables
.env

# Logs
logs/
*.log
npm-debug.log*

# OS files
.DS_Store
Thumbs.db

# IDE
.vscode/
.idea/
*.swp
*.swo
EOF

cat > package.json << 'EOF'
{
  "name": "chaincola-transfer",
  "version": "1.0.0",
  "description": "ChainCola Transfer Backend Service",
  "main": "src/index.js",
  "scripts": {
    "start": "node src/index.js",
    "dev": "nodemon src/index.js",
    "test": "echo \"Error: no test specified\" && exit 1"
  },
  "keywords": ["chaincola", "transfer", "backend"],
  "author": "",
  "license": "ISC"
}
EOF

# Update package.json with installed dependencies
npm install express axios dotenv cors --save
npm install nodemon --save-dev

echo ""
echo "✅ Setup complete!"
echo ""
echo "📋 Next steps:"
echo "   1. Copy .env.example to .env and fill in your configuration"
echo "   2. Start the server: npm start"
echo "   3. For development: npm run dev"
echo ""
echo "📁 Project structure:"
echo "   chaincola-transfer/"
echo "   ├── src/"
echo "   │   └── index.js"
echo "   ├── logs/"
echo "   ├── .env.example"
echo "   ├── .gitignore"
echo "   └── package.json"
echo ""










