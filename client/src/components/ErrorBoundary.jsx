import React from 'react';

/**
 * Error boundary component to catch and handle React errors
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { 
      hasError: false, 
      error: null,
      errorInfo: null
    };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI
    return { 
      hasError: true, 
      error 
    };
  }

  componentDidCatch(error, errorInfo) {
    // You can also log the error to an error reporting service
    console.error('Error caught by boundary:', error, errorInfo);
    this.setState({
      errorInfo: errorInfo
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <div className="error-container">
            <h2>Something went wrong</h2>
            <p>{this.state.error?.message || 'An unknown error occurred'}</p>
            <div className="error-actions">
              <button 
                className="retry-button"
                onClick={() => {
                  // Reset the error state
                  this.setState({ 
                    hasError: false, 
                    error: null, 
                    errorInfo: null 
                  });
                  
                  // If there's a retry callback, call it
                  if (this.props.onRetry && typeof this.props.onRetry === 'function') {
                    this.props.onRetry();
                  }
                }}
              >
                Try Again
              </button>
              
              {this.props.showReload && (
                <button 
                  className="reload-button"
                  onClick={() => window.location.reload()}
                >
                  Reload Page
                </button>
              )}
            </div>
            
            {this.props.debug && this.state.errorInfo && (
              <details className="error-details">
                <summary>Error Details</summary>
                <pre>{this.state.error?.toString()}</pre>
                <pre>{this.state.errorInfo.componentStack}</pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    // If there's no error, render children normally
    return this.props.children;
  }
}

export default ErrorBoundary;
