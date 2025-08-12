# SeedBox-Lite Optimization Summary

This document outlines the optimizations made to address API polling issues on low-resource environments (2GB RAM, 1 CPU).

## Problem Diagnosis

The original application had several issues when running on low-resource hardware:

1. **API Timeouts**: Long-running requests (up to 56s) blocked the Node.js event loop
2. **Memory Pressure**: Inefficient streaming caused memory spikes and GC pauses
3. **Connection Pileup**: Frontend kept polling while previous requests were pending
4. **No Request Limits**: The server accepted unlimited concurrent requests
5. **No Timeouts**: Requests could hang indefinitely without resolution

## Key Optimizations

### 1. Server-side Request Management

- **Request Limiter Middleware**: Prevents server overload by limiting concurrent requests
  - Implements per-IP request tracking
  - Sets appropriate timeouts for all API requests
  - Applies different limits based on resource availability
  - See: `/server/middleware/requestLimiter.js`

### 2. Optimized Streaming Implementation

- **Chunked Streaming**: Serves content in small chunks (256KB) to prevent memory issues
  - Implements proper flow control with stream pause/resume
  - Handles range requests efficiently
  - Automatically cleans up resources on client disconnect
  - See: `/server/handlers/optimizedStreamingHandler.js`

### 3. Resilient Client-side Fetching

- **Enhanced API Client**: Prevents API pileup with smart request handling
  - Implements timeouts, retries, and exponential backoff
  - Deduplicates identical pending requests
  - Features circuit breaker to prevent request floods
  - See: `/client/src/utils/apiClient.js`

### 4. Adaptive Polling

- **Smart Polling Hook**: React hook that adapts to server conditions
  - Dynamically adjusts polling interval based on response times
  - Backs off exponentially when errors occur
  - Implements circuit breaking on consecutive failures
  - See: `/client/src/hooks/useSmartPolling.js`

### 5. Resource-Aware Configuration

- **Environmental Detection**: Server auto-configures based on available resources
  - Adjusts connection limits for low-resource environments
  - Sets appropriate timeouts based on system capabilities
  - See: `/server/index-optimized.js`

## Implementation Guide

To implement these optimizations:

1. Replace the existing stream handler with the optimized one
   ```javascript
   // In server/index.js
   const streamHandler = require('./handlers/optimizedStreamingHandler');
   app.get('/api/torrents/:identifier/files/:fileIdx/stream', streamHandler);
   ```

2. Add the request limiter middleware
   ```javascript
   // In server/index.js
   const createRequestLimiter = require('./middleware/requestLimiter');
   app.use(createRequestLimiter({
     maxConcurrentRequests: 15,
     requestTimeout: 30000,
     logLevel: 1
   }));
   ```

3. Use the enhanced API client in frontend components
   ```javascript
   // In your React components
   import { api } from '../utils/apiClient';
   
   // Use it for API calls
   api.get('/api/torrents')
     .then(data => console.log(data))
     .catch(err => console.error(err));
   ```

4. Implement the smart polling hook for data fetching
   ```javascript
   // In your React components
   import useSmartPolling from '../hooks/useSmartPolling';
   
   function TorrentList() {
     const fetchTorrents = async (signal) => {
       const response = await fetch('/api/torrents', { signal });
       return response.json();
     };
     
     const { data, error, isLoading, refresh } = useSmartPolling(fetchTorrents);
     
     // Use data, handle loading/error states
   }
   ```

5. For full optimization, consider using the completely optimized server:
   ```bash
   # Run the optimized version
   node server/index-optimized.js
   ```

## Results

These optimizations should significantly improve your application's performance on low-resource environments:

- **Reduced Memory Usage**: Smaller chunks and better resource cleanup
- **More Responsive API**: Limited concurrent requests prevents overload
- **Fewer Pending Requests**: Smart polling prevents request pileup
- **Graceful Degradation**: System adapts to resource constraints
- **Improved Stability**: Proper error handling and recovery mechanisms

If you encounter any issues, refer to the detailed comments in each file for troubleshooting guidance.
