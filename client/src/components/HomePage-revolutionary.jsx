import React, { useState, useEffect } from 'react';
import { Upload, Plus, Link, Download, Leaf, Clock, Search, Trash2, Zap } from 'lucide-react';
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
  const [syncStatus, setSyncStatus] = useState(null);
  const [revolutionaryMode, setRevolutionaryMode] = useState(true);

  useEffect(() => {
    loadRecentTorrents();
    checkServerMode();
  }, []);

  const checkServerMode = async () => {
    try {
      const response = await fetch(config.api.health);
      const data = await response.json();
      if (data.status?.includes('REVOLUTIONARY')) {
        setRevolutionaryMode(true);
        console.log('🔥 REVOLUTIONARY SYNC BRIDGE DETECTED');
      }
    } catch (error) {
      console.log('Using standard mode');
    }
  };

  const loadRecentTorrents = () => {
    const recent = torrentHistoryService.getRecentTorrents(8);
    setRecentTorrents(recent);
  };

  // Revolutionary Sync Bridge Integration
  const waitForSyncCompletion = async (syncId, maxWait = 10000) => {
    if (!syncId || !revolutionaryMode) return true;
    
    console.log(`⏳ SYNC BRIDGE: Waiting for completion of ${syncId}`);
    
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWait) {
      try {
        const response = await fetch(`${config.api.base}/sync/${syncId}`);
        if (response.ok) {
          const syncData = await response.json();
          
          setSyncStatus({
            id: syncId,
            status: syncData.status,
            name: syncData.name
          });
          
          if (syncData.status === 'synced') {
            console.log(`✅ SYNC COMPLETE: ${syncData.name}`);
            setSyncStatus(null);
            return true;
          }
          
          if (syncData.status === 'backend_ready') {
            // Wait a bit more for frontend sync
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        }
        
        // Wait before next check
        await new Promise(resolve => setTimeout(resolve, 200));
        
      } catch (error) {
        console.error('Sync check error:', error);
        break;
      }
    }
    
    console.log('⚠️ SYNC TIMEOUT: Proceeding anyway');
    setSyncStatus(null);
    return false;
  };

  const addTorrent = async (torrentData) => {
    setLoading(true);
    setSyncStatus({ status: 'initializing', name: torrentData.name });
    
    try {
      console.log('🚀 REVOLUTIONARY ADD: Starting torrent addition');
      
      const response = await fetch(config.api.torrents, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(torrentData)
      });
      
      const data = await response.json();
      
      if (response.ok) {
        console.log('🎯 TORRENT RESPONSE:', data);
        
        // If revolutionary mode and we got a sync ID, wait for sync
        if (revolutionaryMode && data.syncId) {
          setSyncStatus({ 
            id: data.syncId, 
            status: 'syncing', 
            name: data.name 
          });
          
          console.log(`🌉 SYNC BRIDGE: ${data.syncId} for ${data.name}`);
          
          // Wait for sync completion before navigation
          await waitForSyncCompletion(data.syncId);
          
          // Extra safety: Verify torrent exists before navigation
          const verifyResponse = await fetch(`${config.api.torrents}/${data.hash}`);
          if (!verifyResponse.ok) {
            console.log('⚠️ VERIFICATION FAILED: Waiting extra time');
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
        
        // Check if this torrent already exists in our history
        const existingInHistory = torrentHistoryService.getTorrentByInfoHash(data.hash);
        
        if (existingInHistory) {
          console.log('📋 Torrent already exists in history, updating access time');
          torrentHistoryService.updateLastAccessed(data.hash);
        } else {
          console.log('➕ Adding new torrent to history');
          // Add to history
          torrentHistoryService.addTorrent({
            infoHash: data.hash,
            name: data.name || 'Unknown Torrent',
            source: torrentData.magnetLink ? 'magnet' : 'url',
            originalInput: torrentData.magnetLink || torrentData.name,
            size: data.size || 0
          });
        }
        
        // Reload history
        loadRecentTorrents();
        
        // Navigate with sync-safe timing
        if (revolutionaryMode) {
          console.log(`🚀 REVOLUTIONARY NAVIGATION: ${data.hash}`);
          // Small delay to ensure sync bridge is fully complete
          setTimeout(() => {
            navigate(`/torrent/${data.hash}`);
          }, 100);
        } else {
          navigate(`/torrent/${data.hash}`);
        }
        
      } else {
        console.error('Failed to add torrent:', data);
        alert('Failed to add torrent: ' + (data.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error adding torrent:', error);
      alert('Error adding torrent: ' + error.message);
    } finally {
      setLoading(false);
      setSyncStatus(null);
    }
  };

  const addTorrentFile = async (file) => {
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
        const existingInHistory = torrentHistoryService.getTorrentByInfoHash(data.hash);
        
        if (existingInHistory) {
          console.log('📋 Torrent already exists in history, updating access time');
          torrentHistoryService.updateLastAccessed(data.hash);
        } else {
          console.log('➕ Adding new torrent to history');
          // Add to history
          torrentHistoryService.addTorrent({
            infoHash: data.hash,
            name: data.name || file.name || 'Unknown Torrent',
            source: 'file',
            originalInput: file.name,
            size: data.size || 0
          });
        }
        
        // Reload history
        loadRecentTorrents();
        
        // Navigate to torrent page
        navigate(`/torrent/${data.hash}`);
      } else {
        console.error('Failed to add torrent file:', data);
        alert('Failed to add torrent file: ' + (data.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error adding torrent file:', error);
      alert('Error adding torrent file: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!torrentUrl.trim()) {
      alert('Please enter a torrent URL or magnet link');
      return;
    }

    const torrentName = torrentUrl.includes('magnet:') 
      ? extractNameFromMagnet(torrentUrl) 
      : torrentUrl.split('/').pop() || 'Unknown';

    await addTorrent({
      magnetLink: torrentUrl,
      name: torrentName
    });
    
    setTorrentUrl('');
  };

  const extractNameFromMagnet = (magnetUri) => {
    const match = magnetUri.match(/dn=([^&]+)/);
    if (match) {
      return decodeURIComponent(match[1]);
    }
    return 'Unknown Torrent';
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (file && file.name.endsWith('.torrent')) {
      addTorrentFile(file);
    } else {
      alert('Please select a valid .torrent file');
    }
    e.target.value = '';
  };

  const clearHistory = () => {
    if (confirm('Are you sure you want to clear all torrent history?')) {
      torrentHistoryService.clearHistory();
      loadRecentTorrents();
    }
  };

  const navigateToTorrent = (hash) => {
    navigate(`/torrent/${hash}`);
  };

  const filteredRecentTorrents = recentTorrents.filter(torrent =>
    torrent.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    torrent.infoHash.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatSize = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (timestamp) => {
    return new Date(timestamp).toLocaleDateString();
  };

  return (
    <div className="container">
      {/* Revolutionary Mode Indicator */}
      {revolutionaryMode && (
        <div className="revolutionary-indicator">
          <Zap className="revolutionary-icon" />
          <span>Revolutionary Sync Bridge Active</span>
        </div>
      )}

      {/* Sync Status Display */}
      {syncStatus && (
        <div className="sync-status">
          <div className="sync-spinner"></div>
          <span>
            {syncStatus.status === 'initializing' && 'Initializing...'}
            {syncStatus.status === 'syncing' && `Syncing ${syncStatus.name}...`}
            {syncStatus.status === 'backend_ready' && 'Backend Ready...'}
            {syncStatus.status === 'synced' && 'Sync Complete!'}
          </span>
        </div>
      )}

      <header className="header">
        <div className="header-content">
          <div className="logo">
            <Leaf className="logo-icon" />
            <h1>Seedbox Lite</h1>
          </div>
          <div className="tagline">
            <p>Stream torrents instantly without uploading</p>
            {revolutionaryMode && <span className="revolutionary-tag">⚡ Revolutionary Mode</span>}
          </div>
        </div>
      </header>

      <main className="main-content">
        <div className="add-torrent-section">
          <h2>Add New Torrent</h2>
          
          <form onSubmit={handleSubmit} className="torrent-form">
            <div className="input-group">
              <input
                type="text"
                value={torrentUrl}
                onChange={(e) => setTorrentUrl(e.target.value)}
                placeholder="Enter magnet link or torrent URL..."
                className="torrent-input"
                disabled={loading}
              />
              <button 
                type="submit" 
                className="add-button"
                disabled={loading || !torrentUrl.trim()}
              >
                {loading ? (
                  <div className="loading-spinner"></div>
                ) : (
                  <Plus size={20} />
                )}
                {loading ? 'Adding...' : 'Add'}
              </button>
            </div>
          </form>

          <div className="divider">
            <span>or</span>
          </div>

          <div className="file-upload">
            <label htmlFor="torrent-file" className="file-upload-label">
              <Upload size={20} />
              Upload .torrent file
              <input
                id="torrent-file"
                type="file"
                accept=".torrent"
                onChange={handleFileUpload}
                className="file-input"
                disabled={loading}
              />
            </label>
          </div>
        </div>

        <div className="recent-section">
          <div className="section-header">
            <h2>
              <Clock size={20} />
              Recent Torrents
            </h2>
            <div className="section-actions">
              {recentTorrents.length > 0 && (
                <div className="search-box">
                  <Search size={16} />
                  <input
                    type="text"
                    placeholder="Search torrents..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="search-input"
                  />
                </div>
              )}
              <button 
                onClick={() => setShowHistory(!showHistory)}
                className="toggle-history-btn"
              >
                {showHistory ? 'Hide' : 'Show'} History
              </button>
              {recentTorrents.length > 0 && (
                <button 
                  onClick={clearHistory}
                  className="clear-history-btn"
                  title="Clear all history"
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          </div>

          {showHistory && (
            <div className="recent-torrents">
              {filteredRecentTorrents.length === 0 ? (
                <div className="empty-state">
                  <Download size={48} />
                  <p>No recent torrents found</p>
                  <small>Add a torrent to get started</small>
                </div>
              ) : (
                <div className="torrent-grid">
                  {filteredRecentTorrents.map((torrent) => (
                    <div 
                      key={torrent.infoHash} 
                      className="torrent-card"
                      onClick={() => navigateToTorrent(torrent.infoHash)}
                    >
                      <div className="torrent-info">
                        <h3 className="torrent-name">{torrent.name}</h3>
                        <div className="torrent-meta">
                          <span className="torrent-size">{formatSize(torrent.size)}</span>
                          <span className="torrent-date">{formatDate(torrent.lastAccessed)}</span>
                        </div>
                        <div className="torrent-source">
                          <Link size={14} />
                          <span>{torrent.source}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default HomePage;
