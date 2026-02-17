# Nginx Reverse Proxy Setup ✅

Nginx has been successfully installed and configured as a reverse proxy for the ChainCola Transfer API.

## Configuration

- **Domain:** `api.chaincola.com`
- **Nginx Version:** 1.24.0 (Ubuntu)
- **Status:** ✅ Active and running
- **Configuration File:** `/etc/nginx/sites-available/chaincola-api`
- **Enabled Site:** `/etc/nginx/sites-enabled/chaincola-api`

## What Was Configured

1. ✅ Nginx installed
2. ✅ Reverse proxy configuration created
3. ✅ Site enabled and default site disabled
4. ✅ Nginx reloaded and running
5. ✅ API accessible via `http://api.chaincola.com`

## Access URLs

Your API is now accessible at:

- **Health Check:** `http://api.chaincola.com/health`
- **Transfer API:** `http://api.chaincola.com/api/transfer`
- **Transfer Status:** `http://api.chaincola.com/api/transfer/:transfer_id`
- **Transfer Callback:** `http://api.chaincola.com/api/transfer/callback`

## Configuration Details

The nginx configuration includes:

- **Reverse Proxy:** Forwards requests from port 80 to Node.js on port 3000
- **Security Headers:** X-Frame-Options, X-Content-Type-Options, X-XSS-Protection
- **Logging:** Access and error logs in `/var/log/nginx/`
- **Client Limits:** 10MB max body size
- **Timeouts:** 60s for connect, send, and read operations
- **Real IP Forwarding:** Preserves client IP addresses

## Management Commands

### Check Nginx Status
```bash
ssh root@72.62.165.208 "systemctl status nginx"
```

### Test Configuration
```bash
ssh root@72.62.165.208 "nginx -t"
```

### Reload Nginx (after config changes)
```bash
ssh root@72.62.165.208 "systemctl reload nginx"
```

### Restart Nginx
```bash
ssh root@72.62.165.208 "systemctl restart nginx"
```

### View Access Logs
```bash
ssh root@72.62.165.208 "tail -f /var/log/nginx/chaincola-api-access.log"
```

### View Error Logs
```bash
ssh root@72.62.165.208 "tail -f /var/log/nginx/chaincola-api-error.log"
```

### Edit Configuration
```bash
ssh root@72.62.165.208 "nano /etc/nginx/sites-available/chaincola-api"
```

After editing, test and reload:
```bash
ssh root@72.62.165.208 "nginx -t && systemctl reload nginx"
```

## Next Steps: SSL/HTTPS Setup

To enable HTTPS, you'll need to:

1. **Install Certbot:**
   ```bash
   ssh root@72.62.165.208 "apt-get install -y certbot python3-certbot-nginx"
   ```

2. **Obtain SSL Certificate:**
   ```bash
   ssh root@72.62.165.208 "certbot --nginx -d api.chaincola.com"
   ```

3. **Auto-renewal (already configured):**
   Certbot sets up automatic renewal. Test with:
   ```bash
   ssh root@72.62.165.208 "certbot renew --dry-run"
   ```

After SSL setup, your API will be accessible at:
- `https://api.chaincola.com/health`
- `https://api.chaincola.com/api/transfer`

## Configuration File Location

- **Available:** `/etc/nginx/sites-available/chaincola-api`
- **Enabled:** `/etc/nginx/sites-enabled/chaincola-api` (symlink)

## Verification

✅ Nginx is running
✅ Configuration is valid
✅ Reverse proxy is working
✅ API is accessible via domain
✅ Security headers are set
✅ Logging is configured

## Testing

Test the API endpoints:

```bash
# Health check
curl http://api.chaincola.com/health

# List transfers
curl http://api.chaincola.com/api/transfer

# Check response headers
curl -I http://api.chaincola.com/health
```

---

**Nginx configured on:** January 1, 2026
**Status:** Active and serving requests 🚀










