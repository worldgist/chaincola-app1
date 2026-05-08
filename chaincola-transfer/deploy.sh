#!/usr/bin/env bash
# ============================================================================
# ChainCola Transfer - VPS Deploy Script
# ----------------------------------------------------------------------------
# Run this on the VPS:
#   bash /root/chaincola-transfer/deploy.sh
#
# What it does (idempotent - safe to re-run):
#   1. Installs Node.js 20.x (NodeSource), build tools, curl, git
#   2. Installs nginx, ufw, certbot + nginx plugin
#   3. Installs PM2 globally
#   4. Runs `npm ci` (or `npm install`) inside this project
#   5. Validates .env has real secrets (not "...")
#   6. Starts/Reloads the app under PM2 (chaincola-transfer)
#   7. Configures UFW firewall (22, 80, 443) and enables it
#   8. Installs nginx site for api.chaincola.com
#   9. (Optional) Obtains/renews Let's Encrypt SSL via certbot
#  10. Verifies /health endpoint
#
# Re-run after pulling new code with:  bash deploy.sh --reload
# ============================================================================
set -euo pipefail

# ---------- config ----------
APP_NAME="chaincola-transfer"
APP_DIR="/root/${APP_NAME}"
APP_PORT="3000"
DOMAIN="api.chaincola.com"
EMAIL_FOR_CERTBOT="${CERTBOT_EMAIL:-admin@chaincola.com}"
NGINX_SITE="/etc/nginx/sites-available/chaincola-api"
NGINX_LINK="/etc/nginx/sites-enabled/chaincola-api"

# ---------- helpers ----------
log()  { printf "\033[1;32m[deploy]\033[0m %s\n" "$*"; }
warn() { printf "\033[1;33m[warn ]\033[0m %s\n" "$*"; }
err()  { printf "\033[1;31m[error]\033[0m %s\n" "$*" >&2; }

require_root() {
  if [[ $(id -u) -ne 0 ]]; then
    err "Run as root (or with sudo)."
    exit 1
  fi
}

apt_install() {
  DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends "$@"
}

# ---------- 1. base packages ----------
install_base() {
  log "Updating apt and installing base packages"
  apt-get update -y
  apt_install ca-certificates curl gnupg lsb-release build-essential git ufw nginx
}

# ---------- 2. Node.js 20.x ----------
install_node() {
  if command -v node >/dev/null 2>&1 && node -v | grep -qE '^v(20|22)\.'; then
    log "Node.js already installed: $(node -v)"
  else
    log "Installing Node.js 20.x from NodeSource"
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt_install nodejs
  fi
  log "Node: $(node -v),  npm: $(npm -v)"
}

# ---------- 3. PM2 ----------
install_pm2() {
  if command -v pm2 >/dev/null 2>&1; then
    log "PM2 already installed: $(pm2 -v)"
  else
    log "Installing PM2 globally"
    npm install -g pm2
  fi
  pm2 install pm2-logrotate >/dev/null 2>&1 || true
  pm2 set pm2-logrotate:max_size 10M >/dev/null 2>&1 || true
  pm2 set pm2-logrotate:retain 14   >/dev/null 2>&1 || true
}

# ---------- 4. certbot ----------
install_certbot() {
  if command -v certbot >/dev/null 2>&1; then
    log "certbot already installed"
  else
    log "Installing certbot + nginx plugin"
    apt_install certbot python3-certbot-nginx
  fi
}

# ---------- 5. dependencies ----------
install_app_deps() {
  log "Installing npm dependencies in $APP_DIR"
  cd "$APP_DIR"
  if [[ -f package-lock.json ]]; then
    npm ci --omit=dev || npm install --omit=dev
  else
    npm install --omit=dev
  fi
}

# ---------- 6. validate .env ----------
validate_env() {
  local envfile="$APP_DIR/.env"
  if [[ ! -f "$envfile" ]]; then
    err ".env not found at $envfile"
    err "Create it with required keys (see .env.example)."
    exit 1
  fi

  local required=(
    FLUTTERWAVE_SECRET_KEY
    FLUTTERWAVE_PUBLIC_KEY
    FLUTTERWAVE_SECRET_HASH
    SUPABASE_URL
    SUPABASE_SERVICE_ROLE_KEY
  )

  local bad=0
  for k in "${required[@]}"; do
    local v
    v=$(grep -E "^${k}=" "$envfile" | tail -n1 | cut -d= -f2- || true)
    if [[ -z "${v// /}" || "$v" == "..." || "$v" == *"your_"* || "$v" == *"_here"* ]]; then
      err "Missing/placeholder value for $k in $envfile"
      bad=1
    fi
  done

  if [[ $bad -ne 0 ]]; then
    err "Fix $envfile and re-run."
    exit 1
  fi
  log ".env looks valid"
}

# ---------- 7. PM2 start/reload ----------
start_app() {
  cd "$APP_DIR"
  if pm2 describe "$APP_NAME" >/dev/null 2>&1; then
    log "Reloading PM2 process: $APP_NAME"
    pm2 reload ecosystem.config.cjs --update-env
  else
    log "Starting PM2 process: $APP_NAME"
    pm2 start ecosystem.config.cjs
  fi
  pm2 save
  # Ensure PM2 starts on boot
  pm2 startup systemd -u root --hp /root | tail -n 1 | bash || true
}

# ---------- 8. firewall ----------
configure_firewall() {
  log "Configuring UFW firewall"
  ufw --force reset >/dev/null
  ufw default deny incoming
  ufw default allow outgoing
  ufw allow 22/tcp  comment 'SSH'
  ufw allow 80/tcp  comment 'HTTP'
  ufw allow 443/tcp comment 'HTTPS'
  # NOTE: we do NOT expose 3000 publicly; nginx proxies to it on localhost.
  yes | ufw enable >/dev/null
  ufw status verbose | sed 's/^/  /'
}

# ---------- 9. nginx ----------
configure_nginx() {
  log "Writing nginx site for $DOMAIN"
  cat >"$NGINX_SITE" <<NGINX
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};

    access_log /var/log/nginx/chaincola-api-access.log;
    error_log  /var/log/nginx/chaincola-api-error.log;

    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    client_max_body_size 10M;

    location / {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;

        proxy_connect_timeout 60s;
        proxy_send_timeout    60s;
        proxy_read_timeout    60s;
    }

    location /health {
        proxy_pass http://127.0.0.1:${APP_PORT}/health;
        access_log off;
    }
}
NGINX

  ln -sf "$NGINX_SITE" "$NGINX_LINK"
  rm -f /etc/nginx/sites-enabled/default
  nginx -t
  systemctl reload nginx
  systemctl enable nginx >/dev/null 2>&1 || true
}

# ---------- 10. SSL ----------
configure_ssl() {
  if [[ "${SKIP_SSL:-0}" == "1" ]]; then
    warn "SKIP_SSL=1 set, skipping certbot"
    return 0
  fi

  # Verify the domain points to *this* server before requesting a cert
  local server_ip resolved_ip
  server_ip=$(curl -fsS https://api.ipify.org || true)
  resolved_ip=$(getent hosts "$DOMAIN" | awk '{print $1}' | head -n1 || true)

  if [[ -z "$resolved_ip" ]]; then
    warn "Could not resolve $DOMAIN. Skipping SSL. Update DNS A record to $server_ip and re-run with: bash deploy.sh --ssl-only"
    return 0
  fi
  if [[ "$resolved_ip" != "$server_ip" ]]; then
    warn "$DOMAIN currently resolves to $resolved_ip but this server is $server_ip."
    warn "Update the A record to $server_ip, wait for DNS, then re-run: bash deploy.sh --ssl-only"
    return 0
  fi

  log "Obtaining SSL certificate via certbot for $DOMAIN"
  certbot --nginx \
    --non-interactive --agree-tos \
    -m "$EMAIL_FOR_CERTBOT" \
    --redirect \
    -d "$DOMAIN"
  systemctl reload nginx
}

# ---------- 11. health check ----------
verify_health() {
  log "Verifying /health endpoint locally"
  sleep 2
  if curl -fsS "http://127.0.0.1:${APP_PORT}/health" >/dev/null; then
    log "Local health OK"
  else
    err "Local health check failed; check 'pm2 logs $APP_NAME'"
    exit 1
  fi

  if curl -fsS "http://${DOMAIN}/health" >/dev/null 2>&1 || \
     curl -fsS "https://${DOMAIN}/health" >/dev/null 2>&1; then
    log "Public health OK at $DOMAIN"
  else
    warn "Public health check failed (DNS may not be pointing here yet)"
  fi
}

# ---------- entry ----------
main() {
  require_root

  case "${1:-}" in
    --reload)
      install_app_deps
      validate_env
      start_app
      verify_health
      ;;
    --ssl-only)
      configure_ssl
      verify_health
      ;;
    --no-ssl)
      install_base
      install_node
      install_pm2
      install_app_deps
      validate_env
      start_app
      configure_firewall
      configure_nginx
      verify_health
      ;;
    *)
      install_base
      install_node
      install_pm2
      install_certbot
      install_app_deps
      validate_env
      start_app
      configure_firewall
      configure_nginx
      configure_ssl
      verify_health
      ;;
  esac

  log "Done. Process status:"
  pm2 status || true
  log "View logs:  pm2 logs ${APP_NAME}"
  log "API URL:    https://${DOMAIN}/health"
}

main "$@"
