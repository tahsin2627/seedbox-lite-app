#!/bin/bash
# Startup script with automatic restart for seedbox-lite server
# Usage: bash start.sh

# Configuration
MAX_RESTARTS=10           # Maximum number of restarts allowed
RESTART_DELAY=5           # Seconds to wait between restarts
HEALTH_CHECK_INTERVAL=60  # Seconds between health checks
HEALTH_CHECK_URL="http://localhost:3000/api/health"
LOG_FILE="seedbox-server.log"

# Init variables
restart_count=0
start_time=$(date +%s)

# Set environment variables for production
export NODE_ENV=production
export CLOUD_DEPLOYMENT=true
export DEBUG=false
export LOG_LEVEL=1

# Function to check server health
check_health() {
  # Try to fetch health status
  status_code=$(curl -s -o /dev/null -w "%{http_code}" $HEALTH_CHECK_URL)
  
  if [ "$status_code" == "200" ]; then
    return 0  # Health check passed
  else
    return 1  # Health check failed
  fi
}

# Function to start the server
start_server() {
  echo "$(date) - Starting seedbox-lite server..." | tee -a $LOG_FILE
  
  # Run the server in background and capture PID
  node index.js >> $LOG_FILE 2>&1 &
  server_pid=$!
  
  echo "$(date) - Server started with PID: $server_pid" | tee -a $LOG_FILE
  
  # Give the server time to initialize
  sleep 10
  
  # Main monitoring loop
  while true; do
    # If process is gone, break the loop to trigger restart
    if ! ps -p $server_pid > /dev/null; then
      echo "$(date) - Server process died, restarting..." | tee -a $LOG_FILE
      break
    fi
    
    # Check server health periodically
    if ! check_health; then
      echo "$(date) - Health check failed, attempting restart..." | tee -a $LOG_FILE
      kill -15 $server_pid 2>/dev/null  # Try graceful shutdown
      sleep 2
      kill -9 $server_pid 2>/dev/null   # Force kill if still running
      break
    fi
    
    sleep $HEALTH_CHECK_INTERVAL
  done
  
  # Server exited or health check failed
  return 1
}

echo "===== SEEDBOX-LITE SERVER STARTUP - $(date) =====" | tee -a $LOG_FILE
echo "Using automatic restart with health monitoring" | tee -a $LOG_FILE

# Main restart loop
while true; do
  # Check if we've restarted too many times
  if [ $restart_count -ge $MAX_RESTARTS ]; then
    echo "$(date) - Too many restarts ($restart_count), giving up." | tee -a $LOG_FILE
    exit 1
  fi
  
  # Start the server
  start_server
  
  # If we get here, the server died and needs a restart
  restart_count=$((restart_count + 1))
  
  echo "$(date) - Restart attempt $restart_count of $MAX_RESTARTS" | tee -a $LOG_FILE
  
  # Reset restart count if server has been running for more than 1 hour
  current_time=$(date +%s)
  elapsed_time=$((current_time - start_time))
  if [ $elapsed_time -gt 3600 ]; then
    echo "$(date) - Server ran for over an hour, resetting restart counter" | tee -a $LOG_FILE
    restart_count=0
    start_time=$(date +%s)
  fi
  
  # Wait before restarting
  sleep $RESTART_DELAY
done
