// src/components/TorrentListWithSmartPolling.jsx
import React, { useCallback } from 'react';
import useSmartPolling from '../hooks/useSmartPolling';
import { api } from '../utils/apiClient';

/**
 * TorrentList component that uses smart polling to fetch data
 * This is an example of how to implement the optimized polling solution
 */
const TorrentListWithSmartPolling = () => {
  // Define the fetch function
  const fetchTorrents = useCallback(async (signal) => {
    const response = await api.get('/api/torrents', { signal });
    return response;
  }, []);
  
  // Use our smart polling hook
  const { 
    data: torrents, 
    error, 
    isLoading, 
    lastUpdated, 
    refresh 
  } = useSmartPolling(fetchTorrents, {
    initialInterval: 3000,   // Poll every 3 seconds initially
    minInterval: 2000,       // Never poll faster than every 2 seconds
    maxInterval: 20000,      // Never poll slower than every 20 seconds
    adaptiveSpeed: true      // Adjust polling speed based on response time
  });
  
  // Show loading state
  if (isLoading && !torrents) {
    return <div>Loading torrents...</div>;
  }
  
  // Show error state
  if (error) {
    return (
      <div className="error-container">
        <h3>Error loading torrents</h3>
        <p>{error}</p>
        <button onClick={refresh}>Try Again</button>
      </div>
    );
  }
  
  // Render the torrent list
  return (
    <div className="torrent-list">
      <div className="header">
        <h2>Torrents</h2>
        <div className="actions">
          <button onClick={refresh}>Refresh</button>
          {lastUpdated && (
            <span className="last-updated">
              Last updated: {lastUpdated.toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>
      
      {torrents && torrents.length > 0 ? (
        <ul>
          {torrents.map(torrent => (
            <li key={torrent.infoHash} className="torrent-item">
              <div className="torrent-name">{torrent.name}</div>
              <div className="torrent-progress">
                <div className="progress-bar">
                  <div 
                    className="progress-fill" 
                    style={{ width: `${torrent.progress * 100}%` }}
                  />
                </div>
                <span>{Math.round(torrent.progress * 100)}%</span>
              </div>
              <div className="torrent-stats">
                <span>↓ {formatBytes(torrent.downloadSpeed)}/s</span>
                <span>↑ {formatBytes(torrent.uploadSpeed)}/s</span>
                <span>{torrent.numPeers} peers</span>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="empty-state">No torrents found</div>
      )}
    </div>
  );
};

// Helper function to format bytes
const formatBytes = (bytes) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

export default TorrentListWithSmartPolling;
