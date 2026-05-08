# ChainCola Transfer - Deploy to New VPS (72.61.136.143)

One-shot deployment of `chaincola-transfer` to **`root@72.61.136.143`** behind
`https://api.chaincola.com`.

The whole thing is driven by [`deploy.sh`](./deploy.sh) which is **idempotent**
- you can re-run it safely after pulling new code or editing `.env`.

---

## 0. Prerequisites

- DNS: the **A record for `api.chaincola.com` must point to `72.61.136.143`**.
  If it still points to the old VPS, update it at your registrar first; the SSL
  step will be skipped automatically until DNS resolves to this server.
- Real Flutterwave + Supabase credentials ready (no `...` placeholders).
- SSH access to `root@72.61.136.143`.

---

## 1. One-shot deploy from Windows (recommended)

Open a **regular PowerShell window** (not the Cursor terminal) and run:

```powershell
cd C:\Users\Netpa\myapp\chaincola-app1
powershell -ExecutionPolicy Bypass -File chaincola-transfer\setup-vps.ps1
```

The script will:

1. Package the project (excluding `node_modules` / `.env`).
2. Upload it to `/root/chaincola-transfer` on the VPS via `scp` (one SSH
   password prompt). Any pre-existing `.env` is preserved.
3. Inspect the remote `.env`. If it's missing or has placeholders, it prompts
   you for each secret (Flutterwave + Supabase) and writes them with `chmod 600`.
4. Runs `bash deploy.sh` on the VPS over SSH (interactive, so you'll see live
   output).

Useful flags:

```powershell
# After updating local code, just push + reload PM2 (skips infra install):
powershell -ExecutionPolicy Bypass -File chaincola-transfer\setup-vps.ps1 -ReloadOnly

# DNS for api.chaincola.com is not pointing here yet -> skip Let's Encrypt:
powershell -ExecutionPolicy Bypass -File chaincola-transfer\setup-vps.ps1 -NoSSL

# Re-run only the deploy (don't re-upload code):
powershell -ExecutionPolicy Bypass -File chaincola-transfer\setup-vps.ps1 -SkipUpload
```

> Requires `ssh.exe`, `scp.exe`, `tar.exe` in PATH. Windows 10 1803+ ships with
> all three by default; if missing, enable "OpenSSH Client" under
> Settings > Apps > Optional Features.

---

## 2. Manual path (alternative)

If you'd rather drive it yourself, do these three steps from a fresh
PowerShell window:

```powershell
cd C:\Users\Netpa\myapp\chaincola-app1

tar --exclude='chaincola-transfer/node_modules' `
    --exclude='chaincola-transfer/.env' `
    -czf chaincola-transfer.tgz chaincola-transfer

scp chaincola-transfer.tgz root@72.61.136.143:/root/

ssh root@72.61.136.143 "cd /root && (mv chaincola-transfer chaincola-transfer.bak 2>/dev/null || true) && tar -xzf chaincola-transfer.tgz && rm chaincola-transfer.tgz && if [ -f chaincola-transfer.bak/.env ]; then cp chaincola-transfer.bak/.env chaincola-transfer/.env; fi"
```

Then in your existing SSH session (terminal 13), create `.env` with the real
secrets:

```bash
cat > /root/chaincola-transfer/.env <<'ENVEOF'
PORT=3000
NODE_ENV=production
FLUTTERWAVE_SECRET_KEY=FLWSECK-...REAL_KEY...
FLUTTERWAVE_PUBLIC_KEY=FLWPUBK-...REAL_KEY...
FLUTTERWAVE_API_BASE=https://api.flutterwave.com/v3
FLUTTERWAVE_SECRET_HASH=...REAL_HASH...
FLUTTERWAVE_TRANSFER_CALLBACK_URL=https://api.chaincola.com/api/transfer/callback
SUPABASE_URL=https://woyvzsysasgvpigaflul.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...REAL_SERVICE_ROLE...
ENVEOF
chmod 600 /root/chaincola-transfer/.env
```

And run the installer:

```bash
cd /root/chaincola-transfer
chmod +x deploy.sh
bash deploy.sh
```

This will:

1. Install Node.js 20.x, build tools, nginx, ufw, certbot, PM2.
2. `npm ci` inside the project.
3. Validate `.env` (refuses placeholders).
4. Start the app under PM2 (`chaincola-transfer`) with auto-restart on boot.
5. Enable UFW: 22, 80, 443 (port 3000 is **not** exposed publicly - nginx
   proxies to it on `127.0.0.1:3000`).
6. Install nginx site for `api.chaincola.com`.
7. Auto-detect DNS: if `api.chaincola.com` already resolves to this server it
   will obtain a Let's Encrypt SSL cert and enable HTTPS + HTTP→HTTPS redirect.
   Otherwise it skips SSL and tells you to re-run `bash deploy.sh --ssl-only`
   after fixing DNS.
8. Verify the local `/health` endpoint.

---

## 4. Common operations after first deploy

```bash
# View live logs
pm2 logs chaincola-transfer

# Restart after pulling new code
cd /root/chaincola-transfer && bash deploy.sh --reload

# Just (re-)issue the SSL cert once DNS is correct
bash deploy.sh --ssl-only

# Skip SSL on first deploy (e.g. before DNS is updated)
bash deploy.sh --no-ssl

# Status
pm2 status
systemctl status nginx
ufw status verbose
certbot certificates
```

---

## 5. Verifying

From any machine:

```bash
curl -i https://api.chaincola.com/health
# -> {"status":"UP","message":"ChainCola Transfer Service is running"}
```

From the VPS itself:

```bash
curl -i http://127.0.0.1:3000/health
```

---

## 6. Migrating from the old VPS (72.62.165.208)

If `api.chaincola.com` is still pointing to the old VPS:

1. Run steps 1-3 above on **the new VPS** with `bash deploy.sh --no-ssl`.
   The app will be running on `72.61.136.143:80`.
2. Test via IP/host header:
   ```bash
   curl -i -H "Host: api.chaincola.com" http://72.61.136.143/health
   ```
3. Update the DNS A record to `72.61.136.143`. Wait for propagation.
4. On the new VPS, run `bash deploy.sh --ssl-only` to pull the certificate.
5. Optionally stop the service on the old VPS.

---

## 7. File layout on the VPS

```
/root/chaincola-transfer/
├── deploy.sh                # this installer
├── ecosystem.config.cjs     # PM2 config
├── package.json
├── package-lock.json
├── .env                     # secrets (chmod 600)
└── src/
    ├── index.js
    ├── supabase.js
    ├── config/flutterwave.js
    └── routes/transfer.js
```

`/etc/nginx/sites-available/chaincola-api`  → managed by `deploy.sh`
`/etc/letsencrypt/live/api.chaincola.com/`  → managed by certbot
`/root/.pm2/logs/`                          → app logs (rotated, 14 files × 10MB)
