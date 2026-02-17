# Quick VPS Setup Guide

## Step 1: SSH into your VPS

```bash
ssh root@72.62.165.208
```

Enter your password when prompted.

## Step 2: Run the setup commands

Once you're connected, copy and paste these commands:

```bash
# Create project directory
mkdir -p chaincola-transfer
cd chaincola-transfer

# Initialize npm project
npm init -y

# Install dependencies
npm install express axios dotenv cors

# Install dev dependencies
npm install --save-dev nodemon
```

## Alternative: Upload and run the script

If you prefer, you can upload the setup script:

```bash
# From your local machine
scp scripts/vps-setup-commands.sh root@72.62.165.208:~/

# Then SSH in and run it
ssh root@72.62.165.208
chmod +x vps-setup-commands.sh
./vps-setup-commands.sh
```

## What gets installed

- **express** - Web framework for Node.js
- **axios** - HTTP client for making API requests
- **dotenv** - Environment variable management
- **cors** - Cross-Origin Resource Sharing middleware
- **nodemon** - Development tool for auto-restarting server

## Verification

After installation, verify everything is set up:

```bash
cd chaincola-transfer
ls -la
cat package.json
```

You should see:
- `package.json` with all dependencies listed
- `node_modules/` directory with installed packages

## Next Steps

1. Create your server file
2. Set up environment variables
3. Configure your routes
4. Start the server










