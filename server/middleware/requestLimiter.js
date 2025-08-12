// Request limiter middleware for preventing API overload

/**
 * Creates a request limiter middleware for protecting against API overload
 * @param {Object} options - Configuration options
 * @returns {Function} Express middleware
 */
const createRequestLimiter = (options = {}) => {
  // Default options
  const config = {
    maxConcurrentRequests: options.maxConcurrentRequests || 15,
    maxRequestsPerIP: options.maxRequestsPerIP || 5,
    logLevel: options.logLevel || 1, // 0=none, 1=errors only, 2=all
    requestTimeout: options.requestTimeout || 30000, // 30s default timeout
    ...options
  };
  
  // Track active requests
  const activeRequests = {
    count: 0,
    byIP: {}
  };
  
  return (req, res, next) => {
    // Skip for static assets
    if (req.path.includes('.') || req.path.startsWith('/assets/')) {
      return next();
    }
    
    const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
    
    // Track this request
    activeRequests.byIP[clientIP] = (activeRequests.byIP[clientIP] || 0) + 1;
    activeRequests.count++;
    
    // Log excessive connections from same IP
    if (config.logLevel > 1 && activeRequests.byIP[clientIP] > config.maxRequestsPerIP) {
      console.log(`⚠️ High number of concurrent requests (${activeRequests.byIP[clientIP]}) from ${clientIP}`);
    }
    
    // Set up a global timeout for this request
    const requestTimeout = setTimeout(() => {
      console.log(`⏱️ Request timeout for ${req.originalUrl} from ${clientIP}`);
      if (!res.headersSent) {
        res.status(504).json({ 
          error: 'Request timeout',
          message: 'Your request took too long to process'
        });
      }
    }, config.requestTimeout);
    
    // If too many concurrent requests, limit based on strategy
    if (activeRequests.count > config.maxConcurrentRequests) {
      // If way too many requests, reject outright
      if (activeRequests.count > config.maxConcurrentRequests * 1.5) {
        // Clean up
        activeRequests.count--;
        activeRequests.byIP[clientIP]--;
        clearTimeout(requestTimeout);
        
        if (config.logLevel > 0) {
          console.log(`🛑 Request limit exceeded: ${activeRequests.count}/${config.maxConcurrentRequests} active requests`);
        }
        
        return res.status(429).json({
          error: 'Too many requests',
          message: 'Server is currently busy. Please try again later.'
        });
      }
      
      // If this IP already has many requests, reject
      if (activeRequests.byIP[clientIP] > config.maxRequestsPerIP) {
        // Clean up
        activeRequests.count--;
        activeRequests.byIP[clientIP]--;
        clearTimeout(requestTimeout);
        
        return res.status(429).json({
          error: 'Too many requests',
          message: 'You have too many pending requests. Please try again later.'
        });
      }
    }
    
    // Clean up when the response is finished
    const cleanup = () => {
      clearTimeout(requestTimeout);
      activeRequests.count = Math.max(0, activeRequests.count - 1);
      activeRequests.byIP[clientIP] = Math.max(0, (activeRequests.byIP[clientIP] || 0) - 1);
    };
    
    // Register cleanup on both finish and close events
    res.on('finish', cleanup);
    res.on('close', cleanup);
    
    // Continue to the next middleware
    next();
  };
};

module.exports = createRequestLimiter;
