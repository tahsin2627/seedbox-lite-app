import React from 'react';
import { usePollingWithBackoff } from '../hooks/usePollingWithBackoff';
import { getTorrentStatsWithRetry } from '../services/api';
import ErrorBoundary from './ErrorBoundary';

/**
 * TorrentStatus component with resilient polling
 * 
 * @param {Object} props
 * @param {string} props.torrentId - Torrent ID to fetch stats for
 * @param {number} props.pollingInterval - How often to poll (default: 3000ms)
 */
const TorrentStatus = ({ torrentId, pollingInterval = 3000 }) => {
  const { 
    data: stats, 
    isLoading, 
    error,
    refetch
  } = usePollingWithBackoff(
    () => getTorrentStatsWithRetry(torrentId),
    pollingInterval,
    true, // enabled
    30000, // max backoff
    true // immediate
  );

  if (isLoading && !stats) {
    return <div className="loading-indicator">Loading torrent stats...</div>;
  }

  if (error) {
    return (
      <div className="error-message">
        <p>Failed to load torrent stats: {error.message}</p>
        <button onClick={refetch}>Retry</button>
      </div>
    );
  }

  if (!stats) {
    return <div className="no-data">No stats available</div>;
  }

  // Format progress as percentage
  const progressPercent = (stats.progress * 100).toFixed(2);
  
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

  return (
    <div className="torrent-status">
      <h3>{stats.name}</h3>
      <div className="progress-bar">
        <div 
          className="progress-fill" 
          style={{ width: `${progressPercent}%` }}
        />
        <span className="progress-text">{progressPercent}%</span>
      </div>
      
      <div className="stats-grid">
        <div className="stat">
          <span className="stat-label">Size</span>
          <span className="stat-value">{formatSize(stats.size)}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Downloaded</span>
          <span className="stat-value">{formatSize(stats.downloaded)}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Download Speed</span>
          <span className="stat-value">{formatSpeed(stats.downloadSpeed)}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Peers</span>
          <span className="stat-value">{stats.peers}</span>
        </div>
      </div>
    </div>
  );
};

// Wrap component with ErrorBoundary
const TorrentStatusWithErrorBoundary = (props) => (
  <ErrorBoundary onRetry={() => window.location.reload()}>
    <TorrentStatus {...props} />
  </ErrorBoundary>
);

export default TorrentStatusWithErrorBoundary;
