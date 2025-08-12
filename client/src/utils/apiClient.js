// src/utils/apiClient.js
/**
 * Enhanced API client with timeout, retry, and error handling capabilities
 * Specifically designed to handle flaky connections and slow responses
 */

/**
 * Configuration for API client
 */
const defaultConfig = {
  baseTimeout: 8000,       // Base timeout for API calls in ms
  maxRetries: 2,           // Maximum number of retries
  retryDelay: 1000,        // Initial delay before retry
  exponentialFactor: 1.5,  // Factor for exponential backoff
  statusCodesToRetry: [408, 429, 500, 502, 503, 504]
};

/**
 * Creates an enhanced fetch function with timeout, retry, and error handling
 * @param {Object} userConfig - Custom configuration
 * @returns {Function} Enhanced fetch function
 */
export const createApiClient = (userConfig = {}) => {
  const config = { ...defaultConfig, ...userConfig };
  
  // Keep track of pending requests
  const pendingRequests = new Map();
  
  // Track consecutive failures for circuit breaking
  let consecutiveFailures = 0;
  
  /**
   * Enhanced fetch function
   * @param {string} url - URL to fetch
   * @param {Object} options - Fetch options
   * @returns {Promise} - Resolved with response data
   */
  const fetchWithRetry = async (url, options = {}) => {
    // Add base URL if relative
    const fullUrl = url.startsWith('http') ? url : 
      (config.baseUrl ? `${config.baseUrl}${url}` : url);
      
    // If we already have a pending identical request, return that promise
    const requestKey = `${options.method || 'GET'}:${fullUrl}`;
    if (pendingRequests.has(requestKey)) {
      console.log(`Reusing pending request for: ${requestKey}`);
      return pendingRequests.get(requestKey);
    }
    
    // Check if circuit breaker is activated
    if (consecutiveFailures >= 5) {
      const backoffTime = Math.min(1000 * Math.pow(1.5, consecutiveFailures - 5), 30000);
      console.log(`🔌 Circuit breaker active, backing off for ${backoffTime}ms`);
      await new Promise(resolve => setTimeout(resolve, backoffTime));
    }
    
    let attempt = 0;
    let lastError = null;
    
    // Create a new request promise
    const requestPromise = (async () => {
      while (attempt <= config.maxRetries) {
        // Calculate timeout with exponential backoff
        const timeout = config.baseTimeout * Math.pow(config.exponentialFactor, attempt);
        
        try {
          // Create abort controller for timeout
          const controller = new AbortController();
          const signal = controller.signal;
          const timeoutId = setTimeout(() => controller.abort(), timeout);
          
          const response = await fetch(fullUrl, { 
            ...options,
            signal,
            headers: {
              'Content-Type': 'application/json',
              ...options.headers
            }
          });
          clearTimeout(timeoutId);
          
          // Check if response needs retry
          if (config.statusCodesToRetry.includes(response.status)) {
            lastError = new Error(`Server responded with ${response.status}`);
            attempt++;
            
            // Wait before retry (exponential backoff)
            if (attempt <= config.maxRetries) {
              const delay = config.retryDelay * Math.pow(config.exponentialFactor, attempt - 1);
              console.log(`⏱️ Retrying in ${delay}ms (attempt ${attempt}/${config.maxRetries})`);
              await new Promise(resolve => setTimeout(resolve, delay));
              continue;
            }
          }
          
          // Success
          consecutiveFailures = 0;
          
          if (!response.ok) {
            // Non-retryable error with response
            const errorText = await response.text();
            throw new Error(`API error ${response.status}: ${errorText}`);
          }
          
          return response.json();
          
        } catch (error) {
          lastError = error;
          
          if (error.name === 'AbortError') {
            console.log(`⏱️ Request timed out after ${timeout}ms`);
          }
          
          // On last attempt, track failure for circuit breaker
          if (attempt >= config.maxRetries) {
            consecutiveFailures++;
            break;
          }
          
          attempt++;
          // Wait before retry (exponential backoff)
          const delay = config.retryDelay * Math.pow(config.exponentialFactor, attempt - 1);
          console.log(`⏱️ Retrying in ${delay}ms (attempt ${attempt}/${config.maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
      
      throw lastError || new Error('Request failed after multiple attempts');
    })();
    
    // Store the promise for deduplication
    pendingRequests.set(requestKey, requestPromise);
    
    // Remove from pending after completion
    requestPromise
      .catch(() => {})  // Ignore errors as they will be caught by the caller
      .finally(() => {
        pendingRequests.delete(requestKey);
      });
    
    return requestPromise;
  };
  
  // Methods for common HTTP verbs
  return {
    get: (url, options = {}) => fetchWithRetry(url, { ...options, method: 'GET' }),
    post: (url, data, options = {}) => fetchWithRetry(url, {
      ...options,
      method: 'POST',
      body: JSON.stringify(data),
    }),
    put: (url, data, options = {}) => fetchWithRetry(url, {
      ...options,
      method: 'PUT',
      body: JSON.stringify(data),
    }),
    delete: (url, options = {}) => fetchWithRetry(url, { ...options, method: 'DELETE' }),
    // Reset the circuit breaker
    resetCircuitBreaker: () => {
      consecutiveFailures = 0;
    }
  };
};

// Create a default instance
export const api = createApiClient();

// Removed React hook to keep file vanilla JS
// If you need the React hook, import React properly in your component and use:
/*
import { createApiClient } from '../utils/apiClient';
import { useMemo } from 'react';

function YourComponent() {
  const customConfig = { baseTimeout: 10000 };
  const apiClient = useMemo(() => createApiClient(customConfig), []);
  
  // Use apiClient here
}
*/
