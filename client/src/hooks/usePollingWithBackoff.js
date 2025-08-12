import { useState, useEffect, useRef } from 'react';

/**
 * Custom hook for polling data with built-in error handling and exponential backoff
 * 
 * @param {Function} fetchFunction - Function that returns a promise with the data
 * @param {number} interval - Polling interval in milliseconds (default: 3000ms)
 * @param {boolean} enabled - Whether polling is enabled (default: true)
 * @param {number} maxBackoff - Maximum backoff time in milliseconds (default: 30000ms)
 * @param {boolean} immediate - Whether to fetch immediately (default: true)
 * 
 * @returns {Object} - { data, isLoading, error, refetch }
 */
export function usePollingWithBackoff(
  fetchFunction,
  interval = 3000,
  enabled = true,
  maxBackoff = 30000,
  immediate = true
) {
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(immediate);
  const [error, setError] = useState(null);
  const [currentInterval, setCurrentInterval] = useState(interval);
  
  // Use refs for values that we don't want to trigger re-renders
  const timeoutRef = useRef(null);
  const failedAttemptsRef = useRef(0);
  const activeRequestRef = useRef(false);
  const mountedRef = useRef(true);
  
  // Function to fetch data with error handling
  const fetchData = async () => {
    // Don't start a new request if one is already in progress
    if (activeRequestRef.current) return;
    
    activeRequestRef.current = true;
    setIsLoading(true);
    
    try {
      const result = await fetchFunction();
      
      if (mountedRef.current) {
        setData(result);
        setError(null);
        setIsLoading(false);
        
        // Reset backoff on success
        failedAttemptsRef.current = 0;
        setCurrentInterval(interval);
      }
    } catch (error) {
      if (mountedRef.current) {
        setError(error);
        setIsLoading(false);
        
        // Increase backoff on failure
        failedAttemptsRef.current += 1;
        const newInterval = Math.min(
          interval * Math.pow(1.5, failedAttemptsRef.current),
          maxBackoff
        );
        setCurrentInterval(newInterval);
        
        console.warn(`Polling error, backing off to ${newInterval}ms:`, error.message);
      }
    } finally {
      activeRequestRef.current = false;
    }
  };
  
  // Schedule the next fetch
  const scheduleNextFetch = () => {
    if (!mountedRef.current || !enabled) return;
    
    // Clear any existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    
    // Schedule next fetch
    timeoutRef.current = setTimeout(() => {
      if (mountedRef.current && enabled) {
        fetchData().finally(() => {
          scheduleNextFetch();
        });
      }
    }, currentInterval);
  };
  
  // Fetch immediately function for manual refetching
  const refetch = async () => {
    // Clear any scheduled fetch
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    
    // Fetch and then reschedule
    await fetchData();
    scheduleNextFetch();
  };
  
  // Set up polling when the component mounts
  useEffect(() => {
    mountedRef.current = true;
    
    // Fetch immediately if requested
    if (immediate && enabled) {
      fetchData().finally(() => {
        scheduleNextFetch();
      });
    } else if (enabled) {
      scheduleNextFetch();
    }
    
    // Clean up on unmount
    return () => {
      mountedRef.current = false;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [enabled]); // Only re-run if enabled changes
  
  // Handle changes to the interval
  useEffect(() => {
    if (enabled && !activeRequestRef.current) {
      // If we're not in backoff mode, update the interval
      if (failedAttemptsRef.current === 0) {
        setCurrentInterval(interval);
      }
      
      // Reschedule with the new interval
      scheduleNextFetch();
    }
  }, [interval, enabled]);
  
  return { data, isLoading, error, refetch };
}
