import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { usePollingWithBackoff } from '../hooks/usePollingWithBackoff';
import { getTorrentsWithRetry } from '../services/api';
import ErrorBoundary from './ErrorBoundary';

/**
 * TorrentList component with resilient polling
 */
const TorrentList = () => {
  // Start with a longer polling interval to reduce load
  const [pollingInterval, setPollingInterval] = useState(5000);
  
  const { 
    data, 
    isLoading, 
    error, 
    refetch 
  } = usePollingWithBackoff(
    getTorrentsWithRetry,
    pollingInterval,
    true, // enabled
    30000, // max backoff
    true // immediate
  );

  // Format sizes for better readability
  const formatSize = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };
  
  // Format speed
  const formatSpeed = (bytesPerSec) => {
    return `${formatSize(bytesPerSec)}/s`;
  };

  // Handle the loading state
  if (isLoading && !data) {
    return <div className="loading-indicator">Loading torrents...</div>;
  }

  // Handle errors
  if (error) {
    return (
      <div className="error-message">
        <h3>Error loading torrents</h3>
        <p>{error.message}</p>
        <button onClick={refetch}>Retry</button>
      </div>
    );
  }

  // Handle empty state
  if (!data || !data.torrents || data.torrents.length === 0) {
    return <div className="empty-state">No torrents found. Add a new torrent to get started.</div>;
  }

  return (
    <div className="torrent-list">
      <div className="list-controls">
        <button onClick={refetch}>Refresh</button>
        <select 
          value={pollingInterval} 
          onChange={(e) => setPollingInterval(parseInt(e.target.value))}
        >
          <option value="2000">Fast (2s)</option>
          <option value="5000">Normal (5s)</option>
          <option value="10000">Slow (10s)</option>
          <option value="30000">Very Slow (30s)</option>
        </select>
      </div>
      
      <div className="torrent-table">
        <div className="table-header">
          <div className="name-column">Name</div>
          <div className="size-column">Size</div>
          <div className="progress-column">Progress</div>
          <div className="speed-column">Speed</div>
          <div className="peers-column">Peers</div>
        </div>
        
        {data.torrents.map(torrent => (
          <Link
            to={`/torrent/${torrent.infoHash}`}
            key={torrent.infoHash}
            className="torrent-row"
          >
            <div className="name-column">{torrent.name}</div>
            <div className="size-column">{formatSize(torrent.size)}</div>
            <div className="progress-column">
              <div className="progress-bar">
                <div 
                  className="progress-fill" 
                  style={{ width: `${(torrent.progress * 100).toFixed(0)}%` }}
                />
                <span className="progress-text">
                  {(torrent.progress * 100).toFixed(1)}%
                </span>
              </div>
            </div>
            <div className="speed-column">{formatSpeed(torrent.downloadSpeed)}</div>
            <div className="peers-column">{torrent.peers}</div>
          </Link>
        ))}
      </div>
    </div>
  );
};

// Wrap with error boundary
const TorrentListWithErrorBoundary = () => (
  <ErrorBoundary onRetry={() => window.location.reload()}>
    <TorrentList />
  </ErrorBoundary>
);

export default TorrentListWithErrorBoundary;
