// src/hooks/useSmartPolling.js
import { useState, useEffect, useRef } from 'react';

/**
 * Smart polling hook that adapts to server conditions
 * - Uses exponential backoff when errors occur
 * - Adapts polling frequency based on response time
 * - Implements circuit breaking when server is overloaded
 * - Handles cleanup and cancellation properly
 * 
 * @param {Function} fetchFn - Async function that fetches data
 * @param {Object} options - Configuration options
 * @returns {Object} - { data, error, isLoading, lastUpdated, refresh, cancel }
 */
export const useSmartPolling = (fetchFn, options = {}) => {
  // Default options
  const config = {
    initialInterval: 3000,          // Start polling every 3s
    minInterval: 1000,              // Fastest polling: 1s
    maxInterval: 30000,             // Slowest polling: 30s
    adaptiveSpeed: true,            // Adapt to response times
    backoffFactor: 1.5,             // Exponential backoff multiplier
    recoveryFactor: 0.8,            // How quickly to recover from backoff
    maxConsecutiveErrors: 3,        // After this many errors, circuit breaks
    circuitResetTime: 10000,        // Time to wait before trying again when circuit breaks
    enablePolling: true,            // Whether polling is enabled
    ...options
  };

  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  
  // Refs to avoid re-renders and for cleanup
  const intervalRef = useRef(config.initialInterval);
  const timeoutIdRef = useRef(null);
  const consecutiveErrorsRef = useRef(0);
  const circuitBrokenRef = useRef(false);
  const isMountedRef = useRef(true);
  const abortControllerRef = useRef(new AbortController());
  const lastFetchTimeRef = useRef(0);
  
  // Calculate next interval based on success/failure and response time
  const calculateNextInterval = (responseTime, hadError) => {
    // Start with current interval
    let nextInterval = intervalRef.current;
    
    if (hadError) {
      // On error, back off exponentially
      nextInterval = Math.min(nextInterval * config.backoffFactor, config.maxInterval);
    } else {
      // On success, recover gradually
      nextInterval = Math.max(
        config.minInterval,
        nextInterval * config.recoveryFactor
      );
      
      // If adaptive speed is enabled, adjust based on response time
      if (config.adaptiveSpeed && responseTime > 0) {
        // If response was slow (>1s), increase interval
        if (responseTime > 1000) {
          nextInterval = Math.min(nextInterval * 1.2, config.maxInterval);
        } 
        // If response was fast (<200ms), decrease interval slightly
        else if (responseTime < 200) {
          nextInterval = Math.max(nextInterval * 0.9, config.minInterval);
        }
      }
    }
    
    return nextInterval;
  };
  
  // Function to fetch data
  const fetchData = async (isRefresh = false) => {
    if (!isMountedRef.current || (!isRefresh && !config.enablePolling)) return;
    
    // If circuit is broken, don't fetch unless manual refresh
    if (circuitBrokenRef.current && !isRefresh) {
      // Schedule circuit reset
      timeoutIdRef.current = setTimeout(() => {
        if (isMountedRef.current) {
          console.log('🔌 Circuit reset, retrying fetch');
          circuitBrokenRef.current = false;
          fetchData();
        }
      }, config.circuitResetTime);
      return;
    }
    
    // Create a new AbortController for this fetch
    abortControllerRef.current = new AbortController();
    const { signal } = abortControllerRef.current;
    
    // Track fetch time for adaptive polling
    const fetchStartTime = Date.now();
    lastFetchTimeRef.current = fetchStartTime;
    
    try {
      setIsLoading(true);
      
      // Call the fetch function with the abort signal
      const result = await fetchFn(signal);
      
      // Only update state if component is still mounted and this is the latest fetch
      if (isMountedRef.current && lastFetchTimeRef.current === fetchStartTime) {
        setData(result);
        setError(null);
        setLastUpdated(new Date());
        
        // Reset error counter on success
        consecutiveErrorsRef.current = 0;
        
        // Calculate response time and adjust interval
        const responseTime = Date.now() - fetchStartTime;
        intervalRef.current = calculateNextInterval(responseTime, false);
        
        // Schedule next fetch if polling is enabled
        if (config.enablePolling) {
          timeoutIdRef.current = setTimeout(fetchData, intervalRef.current);
        }
      }
    } catch (err) {
      // Only update state if component is still mounted and this is the latest fetch
      if (isMountedRef.current && lastFetchTimeRef.current === fetchStartTime) {
        // Don't update error state if it was just an abort
        if (err.name !== 'AbortError') {
          setError(err.message || 'Error fetching data');
          
          // Increase consecutive error count
          consecutiveErrorsRef.current++;
          
          // Calculate response time and adjust interval
          const responseTime = Date.now() - fetchStartTime;
          intervalRef.current = calculateNextInterval(responseTime, true);
          
          // Check if circuit should break
          if (consecutiveErrorsRef.current >= config.maxConsecutiveErrors) {
            console.log('🔌 Circuit breaker activated due to consecutive errors');
            circuitBrokenRef.current = true;
          }
          
          // Schedule next fetch if polling is enabled
          if (config.enablePolling) {
            timeoutIdRef.current = setTimeout(fetchData, intervalRef.current);
          }
        }
      }
    } finally {
      if (isMountedRef.current && lastFetchTimeRef.current === fetchStartTime) {
        setIsLoading(false);
      }
    }
  };
  
  // Manual refresh function
  const refresh = () => {
    // Cancel any pending fetch
    cancel();
    // Do a fresh fetch
    fetchData(true);
  };
  
  // Cancel function
  const cancel = () => {
    if (timeoutIdRef.current) {
      clearTimeout(timeoutIdRef.current);
    }
    abortControllerRef.current.abort();
  };
  
  // Effect for initial fetch and cleanup
  useEffect(() => {
    isMountedRef.current = true;
    
    // Define a wrapper function to avoid dependency cycle
    const initialFetch = () => fetchData();
    initialFetch();
    
    return () => {
      isMountedRef.current = false;
      cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchFn, config.enablePolling]);
  
  return {
    data,
    error,
    isLoading,
    lastUpdated,
    refresh,
    cancel
  };
};

export default useSmartPolling;
