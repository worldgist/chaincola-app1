# VPS Setup Complete ✅

The ChainCola Transfer backend service has been successfully deployed and is running on your VPS.

## Server Details

- **VPS IP:** 72.62.165.208
- **Port:** 3000
- **Status:** ✅ Running
- **Node.js Version:** v20.19.6
- **npm Version:** 10.8.2

## What Was Installed

1. ✅ Node.js 20.x (LTS) via NodeSource repository
2. ✅ Project dependencies (express, axios, dotenv, cors, nodemon)
3. ✅ Environment variables configured (.env file)
4. ✅ Server started and running in background

## API Endpoints

### Health Check
```bash
GET http://72.62.165.208:3000/health
```

### Transfer Endpoints
- `POST /api/transfer` - Initiate a Flutterwave transfer
- `GET /api/transfer/:transfer_id` - Get transfer status
- `GET /api/transfer` - List all transfers
- `POST /api/transfer/callback` - Webhook for transfer notifications

## Server Management

### Check Server Status
```bash
ssh root@72.62.165.208 "ps aux | grep 'node src/index.js' | grep -v grep"
```

### View Server Logs
```bash
ssh root@72.62.165.208 "cd ~/chaincola-transfer && tail -f server.log"
```

### Restart Server
```bash
ssh root@72.62.165.208 "cd ~/chaincola-transfer && pkill -f 'node src/index.js' && nohup npm start > server.log 2>&1 &"
```

### Stop Server
```bash
ssh root@72.62.165.208 "pkill -f 'node src/index.js'"
```

## Environment Variables

The following environment variables are configured in `~/chaincola-transfer/.env`:

- `PORT=3000`
- `NODE_ENV=production`
- `FLUTTERWAVE_SECRET_KEY=FLWSECK-...`
- `FLUTTERWAVE_PUBLIC_KEY=FLWPUBK-...`
- `FLUTTERWAVE_API_BASE=https://api.flutterwave.com/v3`
- `FLUTTERWAVE_SECRET_HASH=ytD2Sio1lvrP1Opj`

## Next Steps

1. **Set up PM2 or systemd** (recommended for production):
   - Install PM2: `npm install -g pm2`
   - Start with PM2: `pm2 start src/index.js --name chaincola-transfer`
   - Save PM2 config: `pm2 save`
   - Set up PM2 startup: `pm2 startup`

2. **Configure Firewall** (if needed):
   ```bash
   ufw allow 3000/tcp
   ```

3. **Set up Reverse Proxy** (optional, for HTTPS):
   - Install nginx
   - Configure SSL with Let's Encrypt
   - Set up reverse proxy to forward requests to port 3000

4. **Monitor Server**:
   - Set up log rotation
   - Configure monitoring/alerting
   - Set up automated backups

## Testing

Test the health endpoint:
```bash
curl http://72.62.165.208:3000/health
```

Test the transfer list endpoint:
```bash
curl http://72.62.165.208:3000/api/transfer
```

## Files Location

- **Project Directory:** `~/chaincola-transfer/`
- **Server Logs:** `~/chaincola-transfer/server.log`
- **Environment File:** `~/chaincola-transfer/.env`

## Verification

✅ Node.js installed and working
✅ Dependencies installed successfully
✅ Environment variables configured
✅ Flutterwave API keys validated
✅ Server started successfully
✅ Health endpoint responding
✅ Transfer API endpoints working

---

**Setup completed on:** January 1, 2026
**Server is ready for use!** 🚀










