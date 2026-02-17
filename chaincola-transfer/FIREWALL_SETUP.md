# Firewall Configuration ✅

The UFW (Uncomplicated Firewall) has been successfully configured on your VPS.

## Firewall Status

- **Status:** ✅ Active and enabled on system startup
- **Default Incoming Policy:** Deny (block all incoming connections by default)
- **Default Outgoing Policy:** Allow (allow all outgoing connections)
- **Logging:** Enabled (low level)

## Allowed Ports

The following ports are open for incoming connections:

| Port | Protocol | Service | Description |
|------|----------|---------|-------------|
| 22   | TCP      | SSH     | Secure shell access |
| 80   | TCP      | HTTP    | Web traffic (HTTP) |
| 443  | TCP      | HTTPS   | Secure web traffic (HTTPS) |
| 3000 | TCP      | Node.js | ChainCola Transfer API |

## Firewall Rules

### IPv4 Rules
1. ✅ **22/tcp** - SSH access
2. ✅ **80/tcp** - HTTP web traffic
3. ✅ **443/tcp** - HTTPS secure web traffic
4. ✅ **3000/tcp** - ChainCola Transfer API

### IPv6 Rules
All rules are also applied to IPv6 connections.

## Management Commands

### Check Firewall Status
```bash
ssh root@72.62.165.208 "ufw status"
```

### View Detailed Status
```bash
ssh root@72.62.165.208 "ufw status verbose"
```

### View Numbered Rules
```bash
ssh root@72.62.165.208 "ufw status numbered"
```

### Add a New Rule
```bash
# Allow a specific port
ssh root@72.62.165.208 "ufw allow 8080/tcp comment 'Custom Service'"

# Allow from specific IP
ssh root@72.62.165.208 "ufw allow from 192.168.1.100 to any port 3000"
```

### Delete a Rule
```bash
# Delete by number (check with 'ufw status numbered' first)
ssh root@72.62.165.208 "ufw delete 1"

# Delete by rule
ssh root@72.62.165.208 "ufw delete allow 8080/tcp"
```

### Disable Firewall (if needed)
```bash
ssh root@72.62.165.208 "ufw disable"
```

### Enable Firewall
```bash
ssh root@72.62.165.208 "ufw enable"
```

### Reload Firewall
```bash
ssh root@72.62.165.208 "ufw reload"
```

## Security Notes

1. **SSH Access:** Port 22 is open for SSH. Consider:
   - Using SSH key authentication only
   - Changing the default SSH port (if desired)
   - Using fail2ban to prevent brute force attacks

2. **Port 3000:** The Node.js API is directly accessible. Consider:
   - Using nginx as a reverse proxy
   - Restricting access to specific IPs if needed
   - Implementing rate limiting

3. **HTTP/HTTPS:** Ports 80 and 443 are open for web traffic. Consider:
   - Setting up nginx reverse proxy
   - Configuring SSL certificates (Let's Encrypt)
   - Redirecting HTTP to HTTPS

## Testing

### Test SSH Access
```bash
ssh root@72.62.165.208
```

### Test API Endpoint (from external machine)
```bash
curl http://72.62.165.208:3000/health
```

### Test HTTP/HTTPS (if nginx is configured)
```bash
curl http://72.62.165.208
curl https://72.62.165.208
```

## Firewall Logs

View firewall logs:
```bash
ssh root@72.62.165.208 "tail -f /var/log/ufw.log"
```

## Additional Security Recommendations

1. **Install fail2ban** to prevent brute force attacks:
   ```bash
   ssh root@72.62.165.208 "apt-get update && apt-get install -y fail2ban"
   ```

2. **Set up nginx reverse proxy** for better security:
   - Hide the Node.js server behind nginx
   - Add SSL/TLS encryption
   - Implement rate limiting
   - Add security headers

3. **Regular Updates:**
   ```bash
   ssh root@72.62.165.208 "apt-get update && apt-get upgrade -y"
   ```

4. **Monitor Firewall Activity:**
   ```bash
   ssh root@72.62.165.208 "ufw status verbose && tail -20 /var/log/ufw.log"
   ```

## Backup

Firewall rules are automatically backed up when modified. Backups are stored in:
- `/etc/ufw/user.rules.*`
- `/etc/ufw/before.rules.*`
- `/etc/ufw/after.rules.*`

## Verification

✅ Firewall is active and enabled
✅ SSH access (port 22) is allowed
✅ HTTP (port 80) is allowed
✅ HTTPS (port 443) is allowed
✅ ChainCola Transfer API (port 3000) is allowed
✅ Server is still accessible and running
✅ Firewall will persist after reboot

---

**Firewall configured on:** January 1, 2026
**Status:** Active and protecting your VPS 🛡️










