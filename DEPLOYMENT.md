# Denploy Deployment Guide

## Prerequisites

1. **Deno 2.x** installed
2. **Nginx** installed (for reverse proxy)
3. **Linux/Unix system** (tested on Ubuntu/Debian)
4. **Domain or subdomain** pointing to your server

## Installation

### 1. Clone the Repository

```bash
git clone <repository-url>
cd Denploy
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your configuration
nano .env
```

Important settings:
- `PLATFORM_DOMAIN`: Your domain (e.g., denploy.yourdomain.com)
- `JWT_SECRET`: Generate a secure random string
- `SESSION_SECRET`: Generate another secure random string

### 3. Configure Nginx

Create the main Nginx configuration:

```bash
sudo nano /etc/nginx/sites-available/denploy
```

Add:

```nginx
# Include Denploy configurations
include /home/user/Denploy/nginx/sites-enabled/*.conf;
```

Enable the site:

```bash
sudo ln -s /etc/nginx/sites-available/denploy /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 4. Set Up DNS

Configure your DNS to point to your server:

```
A Record:    denploy.yourdomain.com    →    YOUR_SERVER_IP
A Record:    *.denploy.yourdomain.com  →    YOUR_SERVER_IP
```

### 5. Start Denploy

Development mode:
```bash
deno task dev
```

Production mode:
```bash
deno task start
```

## Running as a Service

### SystemD Service

Create a service file:

```bash
sudo nano /etc/systemd/system/denploy.service
```

Add:

```ini
[Unit]
Description=Denploy - Deno Deployment Platform
After=network.target

[Service]
Type=simple
User=denploy
WorkingDirectory=/home/denploy/Denploy
ExecStart=/usr/bin/deno run --allow-all /home/denploy/Denploy/main.ts
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable denploy
sudo systemctl start denploy
sudo systemctl status denploy
```

## SSL/TLS with Let's Encrypt

Install Certbot:

```bash
sudo apt install certbot python3-certbot-nginx
```

Get certificates:

```bash
sudo certbot --nginx -d denploy.yourdomain.com -d "*.denploy.yourdomain.com"
```

Certbot will automatically configure Nginx for HTTPS.

## Monitoring

### Check Logs

```bash
# Platform logs
tail -f logs/platform-$(date +%Y-%m-%d).log

# SystemD logs
sudo journalctl -u denploy -f

# Nginx logs
sudo tail -f /var/log/nginx/error.log
sudo tail -f /var/log/nginx/access.log
```

### Health Check

```bash
curl http://localhost:3000/health
```

## Firewall Configuration

```bash
# Allow HTTP and HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Allow SSH
sudo ufw allow 22/tcp

# Enable firewall
sudo ufw enable
```

## Backup

### Database Backup

Deno KV data is stored in:
- Default: `~/.local/share/deno/kv/`
- Custom: Check `KV_PATH` in `.env`

```bash
# Backup script
#!/bin/bash
BACKUP_DIR="/backups/denploy"
KV_PATH="$HOME/.local/share/deno/kv"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR
cp -r $KV_PATH "$BACKUP_DIR/kv_$DATE"
```

### App Files Backup

```bash
# Backup all deployed apps
tar -czf /backups/denploy_apps_$(date +%Y%m%d).tar.gz /home/user/Denploy/apps/
```

## Updating

```bash
# Pull latest changes
git pull origin main

# Restart service
sudo systemctl restart denploy

# Or if running manually
# Ctrl+C to stop, then:
deno task start
```

## Troubleshooting

### Apps Not Starting

1. Check app logs in database
2. Verify port availability
3. Check file permissions
4. Review deployment logs

### Nginx Not Routing

1. Test nginx config: `sudo nginx -t`
2. Check generated configs in `nginx/sites-enabled/`
3. Reload nginx: `sudo systemctl reload nginx`
4. Check DNS resolution

### Database Issues

1. Check Deno KV path permissions
2. Verify disk space
3. Check for corrupt KV database

### Port Conflicts

If ports 8001+ are in use:
- Change `APPS_START_PORT` in `.env`
- Restart platform

## Security Considerations

1. **Change default secrets** in `.env`
2. **Use HTTPS** in production (Let's Encrypt)
3. **Regular backups** of database and app files
4. **Firewall rules** to restrict access
5. **Monitor logs** for suspicious activity
6. **Update regularly** to get security patches
7. **Isolate apps** using proper permissions

## Performance Tuning

### Nginx

```nginx
# Increase worker connections
events {
    worker_connections 2048;
}

# Enable gzip compression
gzip on;
gzip_types text/plain text/css application/json application/javascript;
```

### Deno KV

- Keep database size reasonable
- Implement log rotation
- Monitor disk usage

### Resource Limits

Adjust in `.env`:
```
MAX_MEMORY_MB=512
MAX_CPU_CORES=1
```

## Support

- GitHub Issues: [Repository URL]
- Documentation: `/README.md`
- Examples: `/examples/`
