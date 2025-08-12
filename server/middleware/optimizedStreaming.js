// This file contains optimized streaming middleware for low-resource environments

/**
 * Creates optimized streaming middleware
 * @param {Object} options - Configuration options
 * @returns {Function} Express middleware
 */
const createOptimizedStreamingMiddleware = (options = {}) => {
  // Default options
  const config = {
    maxChunkSize: options.maxChunkSize || 1024 * 1024, // 1MB default chunk size
    streamTimeout: options.streamTimeout || 15000, // 15s timeout
    globalTimeout: options.globalTimeout || 60000, // 60s global timeout
    logRequests: options.logRequests !== undefined ? options.logRequests : true,
    ...options
  };
  
  return async (req, res, next) => {
    // Skip non-streaming routes
    if (!req.path.includes('/stream')) {
      return next();
    }
    
    const startTime = Date.now();
    const requestId = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    
    // Set up response headers early
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Cache-Control', 'no-cache, no-store');
    res.setHeader('Accept-Ranges', 'bytes');
    
    // Set up timeout handling
    let streamTimeout;
    
    const clearStreamTimeout = () => {
      if (streamTimeout) {
        clearTimeout(streamTimeout);
        streamTimeout = null;
      }
    };
    
    const setStreamTimeout = (ms, callback) => {
      clearStreamTimeout();
      streamTimeout = setTimeout(callback, ms);
    };
    
    // Set global timeout to prevent hanging requests
    const globalTimeout = setTimeout(() => {
      console.log(`⏱️ Global timeout reached for stream request ${requestId}`);
      clearStreamTimeout();
      
      if (!res.headersSent) {
        res.status(504).json({ error: 'Global timeout reached' });
      } else if (!res.writableEnded) {
        res.end();
      }
    }, config.globalTimeout);
    
    // Clean up function
    const cleanUp = () => {
      clearTimeout(globalTimeout);
      clearStreamTimeout();
    };
    
    // Handle request completion
    res.on('finish', () => {
      cleanUp();
      if (config.logRequests) {
        const duration = Date.now() - startTime;
        console.log(`✅ Stream request ${requestId} completed in ${duration}ms`);
      }
    });
    
    // Handle client disconnection
    res.on('close', () => {
      cleanUp();
      if (!res.writableEnded) {
        console.log(`🔌 Client disconnected from stream request ${requestId}`);
      }
    });
    
    try {
      // Log request start
      if (config.logRequests) {
        console.log(`🎬 Stream request ${requestId} started: ${req.originalUrl}`);
      }
      
      // Set initial timeout
      setStreamTimeout(config.streamTimeout, () => {
        console.log(`⏱️ Stream timeout for request ${requestId}`);
        if (!res.headersSent) {
          res.status(504).json({ error: 'Stream timeout' });
        } else if (!res.writableEnded) {
          res.end();
        }
      });
      
      // Continue to actual streaming handler
      next();
      
    } catch (error) {
      cleanUp();
      console.error(`❌ Stream middleware error: ${error.message}`);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Stream processing error' });
      } else if (!res.writableEnded) {
        res.end();
      }
    }
  };
};

module.exports = createOptimizedStreamingMiddleware;
