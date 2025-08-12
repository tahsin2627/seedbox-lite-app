# SeedBox-Lite Deployment Guide for Low-Resource Environments

This guide will help you deploy SeedBox-Lite on low-resource environments such as your 2GB RAM/1 core cloud instance.

## Requirements

- Node.js v14+ (v16 recommended)
- 2GB RAM minimum
- 1 CPU core minimum
- Linux-based OS (Ubuntu/Debian recommended)

## 1. Prepare Your Server

Connect to your server and install dependencies:

```bash
# Update package manager
apt-get update

# Install Node.js v16
curl -fsSL https://deb.nodesource.com/setup_16.x | sudo -E bash -
apt-get install -y nodejs

# Install PM2 for process management
npm install -g pm2

# Install required packages for WebTorrent
apt-get install -y build-essential libtool automake
```

## 2. Deploy the Application

Clone the repository or upload your files:

```bash
# Using Git
git clone https://github.com/your-username/seedbox-lite.git
cd seedbox-lite

# OR upload via SCP from your local machine
# scp -r /path/to/local/seedbox-lite root@your-server-ip:/path/on/server
```

## 3. Install Dependencies

Install optimized dependencies:

```bash
cd seedbox-lite

# Install backend dependencies
cd server
npm install --only=production
cd ..

# Install frontend dependencies and build
cd client
npm install --only=production
npm run build
cd ..
```

## 4. Configure the Optimized Version

Create environment file:

```bash
cd server
cat > .env << EOL
NODE_ENV=production
SERVER_PORT=3001
DOWNLOAD_PATH=/root/downloads
EOL

# Create downloads directory
mkdir -p /root/downloads
chmod 755 /root/downloads
```

## 5. Start with PM2

Configure PM2 for optimal performance:

```bash
# Start the optimized version
cd /root/seedbox-lite/server
pm2 start index-optimized.js --name "seedbox-lite" \
  --max-memory-restart 1G \
  --node-args="--max-old-space-size=768" \
  --log /root/logs/seedbox.log

# Set to start on system boot
pm2 startup
pm2 save
```

## 6. Configure Nginx (Optional but Recommended)

Install and configure Nginx as a reverse proxy:

```bash
# Install Nginx
apt-get install -y nginx

# Configure Nginx
cat > /etc/nginx/sites-available/seedbox-lite << EOL
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 120s;
    }
}
EOL

# Enable site and restart Nginx
ln -s /etc/nginx/sites-available/seedbox-lite /etc/nginx/sites-enabled/
nginx -t
systemctl restart nginx
```

## Monitoring and Management

Monitor your application:

```bash
# Check status
pm2 status

# View logs
pm2 logs seedbox-lite

# Monitor resources
pm2 monit

# Restart the application
pm2 restart seedbox-lite
```

## Troubleshooting

### High Memory Usage
If you encounter high memory usage:
- Reduce the number of active torrents
- In index-optimized.js, lower the `maxConnections` value (e.g., from 20 to 10)
- Restart the application: `pm2 restart seedbox-lite`

### API Timeouts
If you encounter API timeouts:
- Check server logs: `pm2 logs seedbox-lite`
- Increase the request timeout in the API client or server config
- Ensure you're using the optimized streaming endpoint

### Pending Requests
If you see many pending API requests:
- The client-side smart polling hooks should handle this automatically
- If issues persist, increase the `maxInterval` in useSmartPolling.js
- Make sure the request limiter is properly configured in the server

## Security Recommendations

- Set up a firewall (UFW)
- Enable HTTPS with Let's Encrypt
- Run the application as a non-root user
- Use authentication for the API endpoints
