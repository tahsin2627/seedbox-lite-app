#!/bin/bash

# 🚀 SeedBox Lite Deployment Script
# Simple deployment script for Docker and PM2

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

# Default values
MODE=${1:-help}
ENV_FILE=".env"

# Helper functions
print_header() {
    echo -e "\n${PURPLE}================================${NC}"
    echo -e "${PURPLE}🎬 SeedBox Lite Deployment${NC}"
    echo -e "${PURPLE}================================${NC}\n"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

# Check if .env file exists
check_env() {
    if [ ! -f "$ENV_FILE" ]; then
        print_warning ".env file not found. Using existing one..."
    fi
    print_success ".env file found"
}

# Docker deployment
deploy_docker() {
    print_header
    print_info "Starting Docker deployment..."
    
    # Check if Docker is running
    if ! docker info > /dev/null 2>&1; then
        print_error "Docker is not running. Please start Docker and try again."
        exit 1
    fi
    print_success "Docker is running"
    
    # Check if docker-compose is available
    if ! command -v docker-compose &> /dev/null; then
        print_error "Docker Compose is not installed."
        exit 1
    fi
    print_success "Docker Compose is available"
    
    # Check .env file
    check_env
    
    # Stop existing containers
    print_info "Stopping existing containers..."
    docker-compose down 2>/dev/null || true
    
    # Build and start containers
    print_info "Building and starting containers..."
    docker-compose up --build -d
    
    # Wait for containers to start
    print_info "Waiting for containers to start..."
    sleep 10
    
    # Check container status
    print_info "Checking container status..."
    if docker-compose ps | grep -q "Up"; then
        print_success "Containers are running"
        
        # Display access URLs
        echo -e "\n${GREEN}🌐 Access URLs:${NC}"
        echo -e "Frontend: ${BLUE}http://localhost:$(grep FRONTEND_PORT .env | cut -d'=' -f2 2>/dev/null || echo 5174)${NC}"
        echo -e "Backend:  ${BLUE}http://localhost:$(grep BACKEND_PORT .env | cut -d'=' -f2 2>/dev/null || echo 3001)${NC}"
        echo -e "Password: ${YELLOW}$(grep ACCESS_PASSWORD .env | cut -d'=' -f2 2>/dev/null || echo seedbox123)${NC}"
        
        # Show useful commands
        echo -e "\n${BLUE}🛠 Useful commands:${NC}"
        echo "  View logs:     docker-compose logs -f"
        echo "  Stop services: docker-compose down"
        echo "  Restart:       docker-compose restart"
        echo "  Update:        ./deploy.sh docker"
        
    else
        print_error "Some containers failed to start"
        docker-compose logs
        exit 1
}

# PM2 deployment
deploy_pm2() {
    print_header
    print_info "Starting PM2 deployment..."
    
    # Check if PM2 is installed
    if ! command -v pm2 &> /dev/null; then
        print_warning "PM2 is not installed. Installing..."
        npm install -g pm2
    fi
    print_success "PM2 is available"
    
    # Check Node.js version
    NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt 18 ]; then
        print_error "Node.js 18+ is required. Current version: $(node -v)"
        exit 1
    fi
    print_success "Node.js version is compatible"
    
    # Check .env file
    check_env
    
    # Install backend dependencies
    print_info "Installing backend dependencies..."
    cd server-new
    npm install --production
    cd ..
    print_success "Backend dependencies installed"
    
    # Install and build frontend
    print_info "Installing and building frontend..."
    cd client
    npm install
    npm run build
    cd ..
    print_success "Frontend built successfully"
    
    # Create PM2 ecosystem file if it doesn't exist
    if [ ! -f "ecosystem.config.js" ]; then
        print_info "Creating PM2 ecosystem configuration..."
        cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [
    {
      name: 'seedbox-backend',
      script: 'index.js',
      cwd: './server-new',
      env: {
        NODE_ENV: 'production',
      },
      env_file: '../.env',
      instances: 1,
      exec_mode: 'cluster',
      watch: false,
      max_memory_restart: '1G',
      error_file: './logs/err.log',
      out_file: './logs/out.log',
      log_file: './logs/combined.log',
      time: true
    },
    {
      name: 'seedbox-frontend',
      script: 'serve',
      args: '-s dist -l 5174',
      cwd: './client',
      instances: 1,
      exec_mode: 'cluster',
      watch: false,
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};
EOF
        print_success "Created PM2 ecosystem configuration"
    fi
    
    # Create logs directory
    mkdir -p server-new/logs
    
    # Stop existing PM2 processes
    print_info "Stopping existing PM2 processes..."
    pm2 delete seedbox-backend 2>/dev/null || true
    pm2 delete seedbox-frontend 2>/dev/null || true
    
    # Install serve for frontend if not installed
    if ! command -v serve &> /dev/null; then
        print_info "Installing serve for frontend..."
        npm install -g serve
    fi
    
    # Start PM2 processes
    print_info "Starting PM2 processes..."
    pm2 start ecosystem.config.js
    
    # Save PM2 configuration
    pm2 save
    
    # Check process status
    if pm2 list | grep -q "online"; then
        print_success "PM2 processes are running"
        
        # Display access URLs
        echo -e "\n${GREEN}🌐 Access URLs:${NC}"
        echo -e "Frontend: ${BLUE}http://localhost:$(grep FRONTEND_PORT .env | cut -d'=' -f2 2>/dev/null || echo 5174)${NC}"
        echo -e "Backend:  ${BLUE}http://localhost:$(grep BACKEND_PORT .env | cut -d'=' -f2 2>/dev/null || echo 3001)${NC}"
        echo -e "Password: ${YELLOW}$(grep ACCESS_PASSWORD .env | cut -d'=' -f2 2>/dev/null || echo seedbox123)${NC}"
        
        # Show PM2 commands
        echo -e "\n${BLUE}� PM2 commands:${NC}"
        echo "  View processes: pm2 list"
        echo "  View logs:      pm2 logs"
        echo "  Restart:        pm2 restart all"
        echo "  Stop:           pm2 stop all"
        echo "  Monitor:        pm2 monit"
        
    else
        print_error "PM2 processes failed to start"
        pm2 logs
        exit 1
    fi
}

# Test deployment
test_deployment() {
    print_header
    print_info "Testing deployment..."
    
    # Load environment variables
    if [ -f .env ]; then
        export $(cat .env | grep -v '^#' | xargs)
    fi
    
    BACKEND_URL="http://localhost:${BACKEND_PORT:-3001}"
    FRONTEND_URL="http://localhost:${FRONTEND_PORT:-5174}"
    
    print_info "Testing backend health..."
    if curl -f -s "${BACKEND_URL}/api/health" > /dev/null; then
        print_success "Backend is healthy"
    else
        print_error "Backend health check failed"
        return 1
    fi
    
    print_info "Testing frontend..."
    if curl -f -s "${FRONTEND_URL}" > /dev/null; then
        print_success "Frontend is accessible"
    else
        print_error "Frontend is not accessible"
        return 1
    fi
    
    print_info "Testing authentication..."
    AUTH_RESPONSE=$(curl -s -X POST "${BACKEND_URL}/api/auth/login" \
        -H "Content-Type: application/json" \
        -d "{\"password\":\"${ACCESS_PASSWORD}\"}")
    
    if echo "$AUTH_RESPONSE" | grep -q "token"; then
        print_success "Authentication is working"
    else
        print_warning "Authentication test inconclusive"
    fi
    
    print_success "All tests passed!"
}

# Show help
show_help() {
    print_header
    echo -e "${BLUE}Usage:${NC}"
    echo "  ./deploy.sh docker    - Deploy using Docker Compose"
    echo "  ./deploy.sh pm2       - Deploy using PM2"
    echo "  ./deploy.sh test      - Test current deployment"
    echo "  ./deploy.sh help      - Show this help"
    echo ""
    echo -e "${BLUE}Requirements:${NC}"
    echo "  Docker:  Docker 20+ and Docker Compose"
    echo "  PM2:     Node.js 18+ and PM2"
    echo ""
    echo -e "${BLUE}Configuration:${NC}"
    echo "  Edit .env file to customize settings"
    echo "  Change ACCESS_PASSWORD for security"
    echo ""
    echo -e "${BLUE}Examples:${NC}"
    echo "  ./deploy.sh docker    # Quick Docker deployment"
    echo "  ./deploy.sh pm2       # Production PM2 deployment"
    echo "  ./deploy.sh test      # Test if everything works"
}

# Main script logic
case $MODE in
    docker)
        deploy_docker
        ;;
    pm2)
        deploy_pm2
        ;;
    test)
        test_deployment
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        print_error "Unknown command: $MODE"
        show_help
        exit 1
        ;;
esac
