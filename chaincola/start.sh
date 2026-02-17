#!/bin/bash
# Run this in Terminal to install deps (if needed) and start the Expo app.
set -e
eval "$(/usr/local/bin/brew shellenv zsh)"
cd "$(dirname "$0")"
echo "Installing dependencies..."
unset devdir 2>/dev/null
npm install --no-audit --no-fund
echo "Starting Expo..."
npx expo start --lan
