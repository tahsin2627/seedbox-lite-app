import React, { useState, useEffect } from 'react';
import { Upload, Plus, Link, Download, Leaf, Clock, Search, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { config } from '../config/environment';
import torrentHistoryService from '../services/torrentHistoryService';
import './HomePage.css';

const HomePage = () => {
  const navigate = useNavigate();
  const [torrentUrl, setTorrentUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [recentTorrents, setRecentTorrents] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadRecentTorrents();
  }, []);

  const loadRecentTorrents = () => {
    const recent = torrentHistoryService.getRecentTorrents(8);
    setRecentTorrents(recent);
  };

  const addTorrent = async (torrentData) => {
    setLoading(true);
    try {
      const response = await fetch(config.api.torrents, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(torrentData)
      });
      
      const data = await response.json();
      
      if (response.ok) {
        console.log('Torrent handled successfully:', data);
        
        // Check if this torrent already exists in our history
        const existingInHistory = torrentHistoryService.getTorrentByInfoHash(data.infoHash);
        
        if (existingInHistory) {
          console.log('📋 Torrent already exists in history, updating access time');
          torrentHistoryService.updateLastAccessed(data.infoHash);
        } else {
          console.log('➕ Adding new torrent to history');
          // Add to history
          torrentHistoryService.addTorrent({
            infoHash: data.infoHash,
            name: data.name || 'Unknown Torrent',
            source: torrentData.torrentId.startsWith('magnet:') ? 'magnet' : 'url',
            originalInput: torrentData.torrentId,
            size: data.size || 0
          });
        }
        
        // Reload history
        loadRecentTorrents();
        
        // Navigate to torrent page
        navigate(`/torrent/${data.infoHash}`);
      } else {
        console.error('Failed to add torrent:', data);
        alert('Failed to add torrent: ' + (data.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error adding torrent:', error);
      alert('Error adding torrent: ' + error.message);
    } finally {
      setLoading(false);
    }
  };  const addTorrentFile = async (file) => {
    const formData = new FormData();
    formData.append('torrentFile', file);
    
    setLoading(true);
    try {
      const response = await fetch(config.getApiUrl('/api/torrents/upload'), {
        method: 'POST',
        body: formData
      });
      
      const data = await response.json();
      
      if (response.ok) {
        console.log('Torrent handled successfully:', data);
        
        // Check if this torrent already exists in our history
        const existingInHistory = torrentHistoryService.getTorrentByInfoHash(data.infoHash);
        
        if (existingInHistory) {
          console.log('📋 Torrent already exists in history, updating access time');
          torrentHistoryService.updateLastAccessed(data.infoHash);
        } else {
          console.log('➕ Adding new torrent to history');
          // Add to history
          torrentHistoryService.addTorrent({
            infoHash: data.infoHash,
            name: data.name || file.name.replace('.torrent', ''),
            source: 'file',
            originalInput: file.name,
            size: data.size || 0
          });
        }
        
        // Reload history
        loadRecentTorrents();
        
        // Navigate to torrent page
        navigate(`/torrent/${data.infoHash}`);
      } else {
        console.error('Failed to upload torrent:', data);
        alert('Failed to upload torrent: ' + (data.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error uploading torrent:', error);
      alert('Error uploading torrent: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUrlSubmit = (e) => {
    e.preventDefault();
    if (torrentUrl.trim()) {
      addTorrent({ torrentId: torrentUrl.trim() });
      setTorrentUrl('');
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file && file.name.endsWith('.torrent')) {
      addTorrentFile(file);
    }
  };

  const goToTorrent = (infoHash) => {
    torrentHistoryService.updateLastAccessed(infoHash);
    navigate(`/torrent/${infoHash}`);
  };

  const removeTorrentFromHistory = (infoHash, e) => {
    e.stopPropagation();
    if (window.confirm('Remove this torrent from history? (This won\'t delete the actual torrent data)')) {
      torrentHistoryService.removeTorrent(infoHash);
      loadRecentTorrents();
    }
  };

  const clearAllHistory = () => {
    if (window.confirm('Clear all torrent history? (This won\'t delete actual torrent data)')) {
      torrentHistoryService.clearHistory();
      loadRecentTorrents();
    }
  };

  const filteredTorrents = searchQuery 
    ? torrentHistoryService.searchTorrents(searchQuery)
    : recentTorrents;

  return (
    <div className="home-page">
      <div className="hero-section">
        <div className="hero-content">
          <div className="brand">
            <Leaf size={48} className="brand-icon" />
            <div className="brand-text">
              <h1>SeedBox Lite</h1>
              <p>Stream torrents instantly • No seeding required</p>
            </div>
          </div>
        </div>
      </div>

      <div className="main-actions">
        {/* URL Input Section */}
        {/* URL Input Section */}
        <div className="url-input-section">
          <h2>Add Torrent or Magnet Link</h2>
          <form onSubmit={handleUrlSubmit} className="url-form">
            <div className="input-group">
              <Link size={20} className="input-icon" />
              <input
                type="text"
                value={torrentUrl}
                onChange={(e) => setTorrentUrl(e.target.value)}
                placeholder="Paste your torrent URL or magnet link here..."
                className="url-input"
                disabled={loading}
              />
              <button 
                type="submit" 
                className="add-button"
                disabled={loading || !torrentUrl.trim()}
              >
                {loading ? (
                  <div className="loading-spinner" />
                ) : (
                  <>
                    <Download size={20} />
                    Add Torrent
                  </>
                )}
              </button>
              
              {/* Compact File Upload Button */}
              <input
                type="file"
                accept=".torrent"
                onChange={handleFileSelect}
                style={{ display: 'none' }}
                id="torrent-upload"
                disabled={loading}
              />
              <label 
                htmlFor="torrent-upload" 
                className={`file-upload-button ${loading ? 'disabled' : ''}`}
                title="Upload .torrent file"
              >
                {loading ? (
                  <div className="loading-spinner" />
                ) : (
                  <>
                    <Upload size={20} />
                    Choose File
                  </>
                )}
              </label>
            </div>
          </form>
        </div>
      </div>

      {/* Recent Torrents Section */}
      {recentTorrents.length > 0 && (
        <div className="history-section">
          <div className="section-header">
            <h2>
              <Clock size={24} />
              Recent Torrents
            </h2>
            <div className="section-actions">
              <button 
                onClick={() => setShowHistory(!showHistory)} 
                className="toggle-button"
              >
                {showHistory ? 'Show Less' : `Show All (${recentTorrents.length})`}
              </button>
              {showHistory && (
                <button onClick={clearAllHistory} className="clear-button">
                  <Trash2 size={16} />
                  Clear History
                </button>
              )}
            </div>
          </div>

          {showHistory && (
            <div className="search-section">
              <div className="search-input">
                <Search size={16} />
                <input
                  type="text"
                  placeholder="Search your torrents..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>
          )}

          <div className="torrent-grid">
            {(showHistory ? filteredTorrents : recentTorrents.slice(0, 4)).map((torrent) => (
              <div 
                key={torrent.infoHash} 
                className="torrent-card"
                onClick={() => goToTorrent(torrent.infoHash)}
              >
                <div className="torrent-info">
                  <h3>{torrent.name}</h3>
                  <div className="torrent-meta">
                    <span className="source-tag">{torrent.source}</span>
                    <span className="date">
                      {new Date(torrent.addedAt).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="torrent-source">{torrent.originalInput}</p>
                </div>
                <button
                  className="remove-button"
                  onClick={(e) => removeTorrentFromHistory(torrent.infoHash, e)}
                  title="Remove from history"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>

          {!showHistory && recentTorrents.length > 4 && (
            <div className="view-all">
              <button 
                onClick={() => setShowHistory(true)} 
                className="view-all-button"
              >
                View All {recentTorrents.length} Torrents
              </button>
            </div>
          )}
        </div>
      )}

      <div className="features-summary">
        <div className="feature-item">
          <span className="feature-icon">🚀</span>
          <span>Instant streaming while downloading</span>
        </div>
        <div className="feature-item">
          <span className="feature-icon">💾</span>
          <span>Progress tracking & resume</span>
        </div>
        <div className="feature-item">
          <span className="feature-icon">🎬</span>
          <span>Built-in video player</span>
        </div>
      </div>
    </div>
  );
};

export default HomePage;
