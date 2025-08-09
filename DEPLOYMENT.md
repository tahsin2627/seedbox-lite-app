# Deployment Guide for CORS Fix

## Problem
CORS error: "Access to fetch at 'https://seedbox-api.isalman.dev/api/auth/login' from origin 'https://seedbox.isalman.dev' has been blocked"

## Solution Steps

### 1. Backend Deployment (Server)

**Stop existing server:**
```bash
# Kill any existing processes
pkill -f "node index.js"
pm2 stop seedbox-backend 2>/dev/null || true
pm2 delete seedbox-backend 2>/dev/null || true
```

**Deploy with PM2 (Recommended):**
```bash
cd /home/toor/seedbox-lite/server-new
mkdir -p logs
pm2 start ecosystem.config.js
```

**Or deploy manually:**
```bash
cd /home/toor/seedbox-lite/server-new
NODE_ENV=production \
SERVER_PORT=3001 \
SERVER_HOST=0.0.0.0 \
FRONTEND_URL=https://seedbox.isalman.dev \
ACCESS_PASSWORD=seedbox123 \
node index.js
```

### 2. Frontend Deployment

**Rebuild with production API URL:**
```bash
cd /home/toor/seedbox-lite/client
VITE_API_BASE_URL=https://seedbox-api.isalman.dev npm run build
```

**Deploy with PM2:**
```bash
pm2 start ecosystem.config.js
```

### 3. Verify CORS Configuration

**Test CORS manually:**
```bash
cd /home/toor/seedbox-lite/server-new
chmod +x test-cors.sh
./test-cors.sh
```

**Check PM2 status:**
```bash
pm2 status
pm2 logs seedbox-backend --lines 20
```

### 4. Important Notes

- Backend runs on port **3001** (as per your .env.production)
- Make sure your reverse proxy/Cloudflare points to port 3001
- CORS is now configured to allow both domains:
  - `https://seedbox.isalman.dev` (frontend)
  - `https://seedbox-api.isalman.dev` (backend)

### 5. Debugging

If still having issues, check:
```bash
# Check server logs
pm2 logs seedbox-backend

# Test backend health
curl https://seedbox-api.isalman.dev/api/health

# Test CORS manually
curl -H "Origin: https://seedbox.isalman.dev" https://seedbox-api.isalman.dev/api/health
```
