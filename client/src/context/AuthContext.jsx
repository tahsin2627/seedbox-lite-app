import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const clearAuth = useCallback(() => {
    localStorage.removeItem('seedbox_authenticated');
    localStorage.removeItem('seedbox_auth_timestamp');
    setIsAuthenticated(false);
    console.log('🚪 Authentication cleared');
  }, []);

  const checkAuthStatus = useCallback(() => {
    try {
      const authStatus = localStorage.getItem('seedbox_authenticated');
      const authTimestamp = localStorage.getItem('seedbox_auth_timestamp');
      
      if (authStatus === 'true' && authTimestamp) {
        // Check if authentication is still valid (optional: add expiration logic here)
        const timestamp = parseInt(authTimestamp);
        const now = Date.now();
        
        // Authentication expires after 30 days (optional)
        const EXPIRY_TIME = 30 * 24 * 60 * 60 * 1000; // 30 days in milliseconds
        
        if (now - timestamp < EXPIRY_TIME) {
          setIsAuthenticated(true);
          console.log('✅ Found valid authentication in localStorage');
        } else {
          // Clear expired authentication
          clearAuth();
          console.log('⏰ Authentication expired, cleared localStorage');
        }
      } else {
        console.log('❌ No valid authentication found in localStorage');
      }
    } catch (error) {
      console.error('Error checking auth status:', error);
      clearAuth();
    } finally {
      setIsLoading(false);
    }
  }, [clearAuth]);

  useEffect(() => {
    checkAuthStatus();
  }, [checkAuthStatus]);

  const authenticate = () => {
    setIsAuthenticated(true);
    console.log('� User authenticated successfully');
  };

  const logout = () => {
    clearAuth();
    // Optionally redirect to login or refresh page
    window.location.reload();
  };

  const value = {
    isAuthenticated,
    isLoading,
    authenticate,
    logout,
    clearAuth
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
