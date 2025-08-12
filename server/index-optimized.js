// server/index-optimized.js
/**
 * SeedBox-Lite - Optimized for low-resource environments
 * This version includes memory-aware behavior and performance optimizations
 */

// Core modules
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');

// Import optimized handlers
const createRequestLimiter = require('./middleware/requestLimiter');
const createOptimizedStreamingHandler = require('./handlers/optimizedStreamingHandler');

// Environment detection
const isLowResourceEnv = os.totalmem() < 4 * 1024 * 1024 * 1024; // Less than 4GB
const cpuCount = os.cpus().length;

console.log(`🖥️ System info: ${os.totalmem() / 1024 / 1024 / 1024}GB RAM, ${cpuCount} CPUs`);
console.log(`⚙️ Running in ${isLowResourceEnv ? 'low-resource' : 'normal'} mode`);

// Environment Configuration
const config = {
  server: {
    port: process.env.SERVER_PORT || 3001,
    host: process.env.SERVER_HOST || 'localhost'
  },
  torrent: {
    downloadPath: process.env.DOWNLOAD_PATH || path.join(__dirname, '../downloads'),
    maxConnections: isLowResourceEnv ? Math.max(20, 100 / cpuCount) : 100,
    maxDownloadSpeed: isLowResourceEnv ? 1 * 1024 * 1024 : undefined, // 1MB/s in low resource mode
    maxUploadSpeed: isLowResourceEnv ? 256 * 1024 : undefined, // 256KB/s in low resource mode
  },
  api: {
    maxConcurrentRequests: isLowResourceEnv ? 15 : 50,
    requestTimeout: isLowResourceEnv ? 30000 : 60000, // 30s in low resource mode
  }
};

// Create Express app
const app = express();
app.use(express.json());
app.use(cors());

// Apply request limiter middleware
app.use(createRequestLimiter({
  maxConcurrentRequests: config.api.maxConcurrentRequests,
  requestTimeout: config.api.requestTimeout,
  logLevel: 1
}));

// Create WebTorrent client with optimized settings
const WebTorrent = require('webtorrent');
const client = new WebTorrent({
  maxConns: config.torrent.maxConnections,
  downloadLimit: config.torrent.maxDownloadSpeed,
  uploadLimit: config.torrent.maxUploadSpeed
});

// Universal torrent resolver - finds a torrent by any identifier
const universalTorrentResolver = (identifier) => {
  // First try to find by infoHash
  let torrent = client.torrents.find(t => t.infoHash === identifier);
  if (torrent) return torrent;
  
  // Then by magnet URI
  torrent = client.torrents.find(t => t.magnetURI.includes(identifier));
  if (torrent) return torrent;
  
  // Then by name
  torrent = client.torrents.find(t => t.name === identifier);
  if (torrent) return torrent;
  
  // Not found
  return null;
};

// Create optimized streaming handler
const streamHandler = createOptimizedStreamingHandler({
  chunkSize: isLowResourceEnv ? 256 * 1024 : 1024 * 1024, // 256KB chunks in low resource mode
  streamTimeout: isLowResourceEnv ? 20000 : 30000, // 20s timeout in low resource mode
  universalTorrentResolver,
  logLevel: 1
});

// Serve static client files
app.use(express.static(path.join(__dirname, '../client/build')));

// UNIVERSAL GET TORRENTS - Optimized for performance and memory usage
app.get('/api/torrents', (req, res) => {
  try {
    // Get torrents with basic info only
    const torrents = client.torrents.map(torrent => ({
      infoHash: torrent.infoHash,
      magnetURI: torrent.magnetURI,
      name: torrent.name,
      progress: Math.min(torrent.progress, 1), // Ensure progress is never > 1
      downloaded: torrent.downloaded,
      uploaded: torrent.uploaded,
      downloadSpeed: torrent.downloadSpeed,
      uploadSpeed: torrent.uploadSpeed,
      timeRemaining: torrent.timeRemaining,
      numPeers: torrent.numPeers,
      ratio: torrent.uploaded / (torrent.downloaded || 1),
      active: !torrent.paused,
      done: torrent.done
    }));
    
    res.json(torrents);
  } catch (err) {
    console.error(`❌ Error getting torrents list:`, err.message);
    res.status(500).json({ error: 'Error getting torrents list' });
  }
});

// UNIVERSAL GET TORRENT DETAILS - Optimized
app.get('/api/torrents/:identifier', async (req, res) => {
  const identifier = req.params.identifier;
  
  try {
    const torrent = universalTorrentResolver(identifier);
    
    if (!torrent) {
      return res.status(404).json({ error: 'Torrent not found' });
    }
    
    // Return basic torrent info without heavy file details
    const basicInfo = {
      infoHash: torrent.infoHash,
      magnetURI: torrent.magnetURI,
      name: torrent.name,
      announce: torrent.announce,
      created: torrent.created,
      createdBy: torrent.createdBy,
      comment: torrent.comment,
      
      // Status info
      progress: Math.min(torrent.progress, 1),
      downloaded: torrent.downloaded,
      uploaded: torrent.uploaded,
      downloadSpeed: torrent.downloadSpeed,
      uploadSpeed: torrent.uploadSpeed,
      timeRemaining: torrent.timeRemaining,
      numPeers: torrent.numPeers,
      ratio: torrent.uploaded / (torrent.downloaded || 1),
      active: !torrent.paused,
      done: torrent.done,
      
      // File summary (lightweight)
      fileCount: torrent.files.length,
      totalSize: torrent.length,
      
      // Add just lightweight file info
      files: torrent.files.map((file, i) => ({
        name: file.name,
        path: file.path,
        length: file.length,
        progress: Math.min(file.progress, 1),
        index: i
      }))
    };
    
    res.json(basicInfo);
  } catch (err) {
    console.error(`❌ Error getting torrent ${identifier}:`, err.message);
    res.status(500).json({ error: `Error getting torrent: ${err.message}` });
  }
});

// UNIVERSAL FILES ENDPOINT - Returns just the files array
app.get('/api/torrents/:identifier/files', async (req, res) => {
  const identifier = req.params.identifier;
  
  try {
    const torrent = universalTorrentResolver(identifier);
    
    if (!torrent) {
      return res.status(404).json({ error: 'Torrent not found' });
    }
    
    // Return lightweight file info
    const files = torrent.files.map((file, i) => ({
      name: file.name,
      path: file.path,
      length: file.length,
      progress: Math.min(file.progress, 1),
      index: i
    }));
    
    res.json(files);
  } catch (err) {
    console.error(`❌ Error getting files for ${identifier}:`, err.message);
    res.status(500).json({ error: 'Error getting files' });
  }
});

// UNIVERSAL STREAMING - Use the optimized handler
app.get('/api/torrents/:identifier/files/:fileIdx/stream', streamHandler);

// ADD TORRENT ENDPOINT
app.post('/api/torrents/add', async (req, res) => {
  try {
    const { magnetUri, torrentUrl, torrentFile } = req.body;
    
    if (!magnetUri && !torrentUrl && !torrentFile) {
      return res.status(400).json({ error: 'No torrent source provided' });
    }
    
    // Check if we're already at capacity in low-resource mode
    if (isLowResourceEnv && client.torrents.length >= 10) {
      return res.status(429).json({ 
        error: 'Too many torrents', 
        message: 'The server is in low-resource mode and cannot handle more torrents. Please remove some first.'
      });
    }
    
    let torrentId = magnetUri || torrentUrl || torrentFile;
    
    client.add(torrentId, { path: config.torrent.downloadPath }, (torrent) => {
      res.json({
        infoHash: torrent.infoHash,
        magnetURI: torrent.magnetURI,
        name: torrent.name
      });
    });
  } catch (err) {
    console.error('Error adding torrent:', err);
    res.status(500).json({ error: 'Error adding torrent' });
  }
});

// REMOVE TORRENT ENDPOINT
app.delete('/api/torrents/:identifier', (req, res) => {
  const identifier = req.params.identifier;
  
  try {
    const torrent = universalTorrentResolver(identifier);
    
    if (!torrent) {
      return res.status(404).json({ error: 'Torrent not found' });
    }
    
    client.remove(torrent.infoHash, (err) => {
      if (err) {
        console.error(`❌ Error removing torrent ${identifier}:`, err.message);
        return res.status(500).json({ error: 'Error removing torrent' });
      }
      
      res.json({ success: true, message: 'Torrent removed' });
    });
  } catch (err) {
    console.error(`❌ Error in remove endpoint:`, err.message);
    res.status(500).json({ error: 'Error processing remove request' });
  }
});

// PAUSE/RESUME TORRENT ENDPOINTS
app.post('/api/torrents/:identifier/pause', (req, res) => {
  const identifier = req.params.identifier;
  
  try {
    const torrent = universalTorrentResolver(identifier);
    
    if (!torrent) {
      return res.status(404).json({ error: 'Torrent not found' });
    }
    
    torrent.pause();
    res.json({ success: true, status: 'paused' });
  } catch (err) {
    console.error(`❌ Error pausing torrent ${identifier}:`, err.message);
    res.status(500).json({ error: 'Error pausing torrent' });
  }
});

app.post('/api/torrents/:identifier/resume', (req, res) => {
  const identifier = req.params.identifier;
  
  try {
    const torrent = universalTorrentResolver(identifier);
    
    if (!torrent) {
      return res.status(404).json({ error: 'Torrent not found' });
    }
    
    torrent.resume();
    res.json({ success: true, status: 'resumed' });
  } catch (err) {
    console.error(`❌ Error resuming torrent ${identifier}:`, err.message);
    res.status(500).json({ error: 'Error resuming torrent' });
  }
});

// SERVER INFO ENDPOINT
app.get('/api/server/info', (req, res) => {
  try {
    const memoryUsage = process.memoryUsage();
    const systemInfo = {
      platform: os.platform(),
      arch: os.arch(),
      cpus: os.cpus().length,
      totalMemory: os.totalmem(),
      freeMemory: os.freemem(),
      uptime: os.uptime(),
      nodeVersion: process.version,
      processMemory: {
        rss: memoryUsage.rss,
        heapTotal: memoryUsage.heapTotal,
        heapUsed: memoryUsage.heapUsed,
        external: memoryUsage.external
      },
      torrents: client.torrents.length,
      isLowResourceMode: isLowResourceEnv
    };
    
    res.json(systemInfo);
  } catch (err) {
    console.error('Error getting server info:', err);
    res.status(500).json({ error: 'Error getting server info' });
  }
});

// Catch-all for React router
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/build/index.html'));
});

// Start server
app.listen(config.server.port, () => {
  console.log(`🚀 Server running on http://${config.server.host}:${config.server.port}`);
  console.log(`📂 Downloads folder: ${config.torrent.downloadPath}`);
});

// Handle process termination
process.on('SIGINT', () => {
  console.log('Shutting down...');
  client.destroy((err) => {
    if (err) console.error('Error destroying WebTorrent client:', err);
    process.exit(0);
  });
});
