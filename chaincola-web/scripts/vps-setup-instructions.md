# VPS Backend Setup Instructions

## Step 1: SSH into your VPS

```bash
ssh root@72.62.165.208
```

(You'll need to enter your password or use SSH key authentication)

## Step 2: Run the setup script

Once you're logged into the VPS, you can either:

### Option A: Copy and paste the commands manually

```bash
# Create project directory
mkdir -p chaincola-transfer
cd chaincola-transfer

# Initialize npm project
npm init -y

# Install dependencies
npm install express axios dotenv cors

# Install dev dependencies (optional)
npm install --save-dev nodemon
```

### Option B: Upload and run the setup script

1. On your local machine, the setup script is at:
   `scripts/setup-vps-backend.sh`

2. Upload it to your VPS:
   ```bash
   scp scripts/setup-vps-backend.sh root@72.62.165.208:~/
   ```

3. SSH into your VPS and run it:
   ```bash
   ssh root@72.62.165.208
   chmod +x setup-vps-backend.sh
   ./setup-vps-backend.sh
   ```

## Step 3: Configure environment variables

```bash
cd chaincola-transfer
cp .env.example .env
nano .env  # or use your preferred editor
```

Fill in your configuration:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ALCHEMY_API_KEY`
- `ALCHEMY_ETHEREUM_URL`

## Step 4: Test the server

```bash
# Start the server
npm start

# Or for development with auto-reload
npm run dev
```

The server should start on port 3000 (or whatever you set in `.env`).

## Step 5: Verify it's working

In another terminal or browser, test the health endpoint:

```bash
curl http://localhost:3000/health
```

Or if you have a domain/IP configured:
```bash
curl http://72.62.165.208:3000/health
```

## Project Structure

After setup, you'll have:

```
chaincola-transfer/
├── src/
│   └── index.js          # Main server file
├── logs/                 # Log files directory
├── .env                  # Environment variables (create from .env.example)
├── .env.example          # Example environment file
├── .gitignore            # Git ignore file
├── package.json          # NPM package configuration
└── node_modules/         # Dependencies
```

## Next Steps

After the basic setup is complete, you can:

1. Add your transfer logic to `src/index.js`
2. Create additional route files in `src/routes/`
3. Add middleware in `src/middleware/`
4. Set up process manager (PM2) for production
5. Configure firewall rules
6. Set up SSL/TLS certificates

## Production Deployment Tips

1. **Use PM2 for process management:**
   ```bash
   npm install -g pm2
   pm2 start src/index.js --name chaincola-transfer
   pm2 save
   pm2 startup
   ```

2. **Configure firewall:**
   ```bash
   ufw allow 3000/tcp
   ufw enable
   ```

3. **Set up reverse proxy (Nginx):**
   - Configure Nginx to proxy requests to your Node.js app
   - Set up SSL with Let's Encrypt

4. **Monitor logs:**
   ```bash
   pm2 logs chaincola-transfer
   ```










