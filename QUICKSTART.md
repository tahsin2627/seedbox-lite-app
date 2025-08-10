# 🚀 Quick Start Guide

## Docker Deployment (Recommended)

### Prerequisites
- Docker 20+ installed
- Docker Compose installed

### Steps
1. **Clone and setup**:
   ```bash
   git clone https://github.com/hotheadhacker/seedbox-lite.git
   cd seedbox-lite
   ```

2. **Configure environment** (optional):
   ```bash
   # Edit .env file to change default password
   nano .env
   ```

3. **Deploy**:
   ```bash
   ./deploy.sh docker
   ```

4. **Access**:
   - Frontend: http://localhost:5174
   - Backend: http://localhost:3001
   - Default password: `seedbox123`

## PM2 Deployment

### Prerequisites
- Node.js 18+ installed
- PM2 installed globally (`npm install -g pm2`)

### Steps
1. **Clone and setup**:
   ```bash
   git clone https://github.com/hotheadhacker/seedbox-lite.git
   cd seedbox-lite
   ```

2. **Deploy**:
   ```bash
   ./deploy.sh pm2
   ```

3. **Access**:
   - Frontend: http://localhost:5174
   - Backend: http://localhost:3001

## Testing
```bash
# Test if everything is working
./deploy.sh test
```

## Troubleshooting
- **Port conflicts**: Edit `.env` file to change `FRONTEND_PORT` and `BACKEND_PORT`
- **Docker issues**: Run `docker-compose down && docker-compose up --build`
- **PM2 issues**: Run `pm2 kill && ./deploy.sh pm2`

## Security
- Change `ACCESS_PASSWORD` in `.env` file immediately
- Use HTTPS in production
- Keep dependencies updated
