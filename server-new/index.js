// Express backend with real WebTorrent functionality - On-demand loading approach
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const WebTorrent = require('webtorrent');
const multer = require('multer');

// Environment Configuration
const config = {
  server: {
    port: process.env.SERVER_PORT || 3000,
    host: process.env.SERVER_HOST || 'localhost',
    protocol: process.env.SERVER_PROTOCOL || 'http'
  },
  frontend: {
    url: process.env.FRONTEND_URL || 'http://localhost:5173'
  },
  isDevelopment: process.env.NODE_ENV === 'development'
};

const app = express();

// STRICT NO-UPLOAD WebTorrent configuration
const client = new WebTorrent({
  uploadLimit: 0,
  maxConns: 10,
  dht: false,
  lsd: false,
  pex: false,
  tracker: {
    announce: false,
    getAnnounceOpts: () => ({ 
      uploaded: 0,
      downloaded: 0,
      numwant: 5
    })
  }
});

// Store torrents by infoHash (memory only - no persistence needed)
const torrents = {};

// Helper function to get or load torrent by ID/hash
const getOrLoadTorrent = (torrentId) => {
  return new Promise((resolve, reject) => {
    // First check if torrent is already loaded in memory
    const existingTorrent = client.torrents.find(t => 
      t.magnetURI === torrentId || 
      t.infoHash === torrentId ||
      torrentId.includes(t.infoHash)
    );
    
    if (existingTorrent) {
      console.log('⚡ Torrent already loaded:', existingTorrent.name, 'InfoHash:', existingTorrent.infoHash);
      torrents[existingTorrent.infoHash] = existingTorrent;
      resolve(existingTorrent);
      return;
    }
    
    // If not found, load it fresh
    console.log('🔄 Loading torrent on-demand:', torrentId);
    
    const torrent = client.add(torrentId, { 
      upload: false,
      tracker: false,
      announce: [],
      maxConns: 5,
      maxWebConns: 3
    });
    
    torrent.on('ready', () => {
      console.log('✅ Torrent loaded:', torrent.name, 'InfoHash:', torrent.infoHash);
      torrents[torrent.infoHash] = torrent;
      torrent.addedAt = new Date().toISOString();
      resolve(torrent);
    });
    
    torrent.on('error', (error) => {
      console.error('❌ Error loading torrent:', error.message);
      reject(error);
    });
    
    // Timeout after 30 seconds
    setTimeout(() => {
      reject(new Error('Timeout loading torrent'));
    }, 30000);
  });
};

// Global error handling
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error.message);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Graceful shutdown handlers
process.on('SIGTERM', () => {
  console.log('📤 SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('📤 SIGINT received, shutting down gracefully...');
  process.exit(0);
});

// Configure multer for file uploads
const upload = multer({ 
  dest: 'uploads/',
  fileFilter: (req, file, cb) => {
    if (file.originalname.endsWith('.torrent')) {
      cb(null, true);
    } else {
      cb(new Error('Only .torrent files are allowed'));
    }
  }
});

// CORS Configuration
app.use(cors({
  origin: [
    config.frontend.url,
    'http://localhost:5173',
    'http://localhost:3000',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:3000'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Add torrent with on-demand loading
app.post('/api/torrents', async (req, res) => {
  const { torrentId } = req.body;
  if (!torrentId) return res.status(400).json({ error: 'No torrentId provided' });
  
  console.log('🔄 Adding/Loading torrent for streaming:', torrentId);
  
  try {
    // Use the on-demand loading function
    const torrent = await getOrLoadTorrent(torrentId);
    
    // ENFORCE NO-UPLOAD POLICY
    torrent.uploadSpeed = 0;
    torrent._uploadLimit = 0;
    
    // Configure files for streaming
    torrent.files.forEach((file, index) => {
      const ext = file.name.toLowerCase().split('.').pop();
      const isSubtitle = ['srt', 'vtt', 'ass', 'ssa', 'sub', 'sbv'].includes(ext);
      const isVideo = ['mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm', 'm4v'].includes(ext);
      
      if (isSubtitle) {
        console.log(`📝 Keeping subtitle file selected: ${file.name}`);
      } else if (isVideo) {
        file.select();
        console.log(`🎬 Video file ready for streaming: ${file.name}`);
      } else {
        file.deselect();
        console.log(`⏭️  Skipping non-essential file: ${file.name}`);
      }
    });
    
    res.json({ 
      infoHash: torrent.infoHash,
      name: torrent.name,
      size: torrent.length
    });
    
  } catch (error) {
    console.error('❌ Error adding/loading torrent:', error.message);
    res.status(500).json({ error: 'Failed to add torrent: ' + error.message });
  }
});

// Get all active torrents
app.get('/api/torrents', (req, res) => {
  const activeTorrents = Object.values(torrents).map(torrent => ({
    infoHash: torrent.infoHash,
    name: torrent.name,
    size: torrent.length,
    downloaded: torrent.downloaded,
    uploaded: 0, // Always 0 for security
    progress: torrent.progress,
    downloadSpeed: torrent.downloadSpeed,
    uploadSpeed: 0, // Always 0 for security
    peers: torrent.numPeers,
    addedAt: torrent.addedAt || new Date().toISOString()
  }));
  
  res.json({ torrents: activeTorrents });
});

// Get torrent details by hash (with on-demand loading)
app.get('/api/torrents/:infoHash', async (req, res) => {
  try {
    let torrent = torrents[req.params.infoHash];
    
    // If not found in memory, this endpoint can't help (we need the actual torrent ID to load)
    if (!torrent) {
      return res.status(404).json({ error: 'Torrent not found in active session' });
    }

    const files = torrent.files.map((file, index) => ({
      index,
      name: file.name,
      size: file.length,
      downloaded: file.downloaded,
      progress: file.progress
    }));

    res.json({ 
      torrent: {
        infoHash: torrent.infoHash,
        name: torrent.name,
        size: torrent.length,
        downloaded: torrent.downloaded,
        uploaded: 0, // Always 0 for security
        progress: torrent.progress,
        downloadSpeed: torrent.downloadSpeed,
        uploadSpeed: 0, // Always 0 for security
        peers: torrent.numPeers
      }, 
      files 
    });
    
  } catch (error) {
    console.error('Error getting torrent details:', error);
    res.status(500).json({ error: 'Failed to get torrent details' });
  }
});

// Stream torrent file
app.get('/api/torrents/:infoHash/files/:fileIdx/stream', async (req, res) => {
  try {
    let torrent = torrents[req.params.infoHash];
    
    if (!torrent) {
      return res.status(404).json({ error: 'Torrent not found' });
    }
    
    const file = torrent.files[req.params.fileIdx];
    if (!file) return res.status(404).json({ error: 'File not found' });
    
    // Resume torrent and select file for streaming
    torrent.resume();
    file.select();
    
    console.log(`🎬 Streaming: ${file.name} (${(file.length / 1024 / 1024).toFixed(1)} MB)`);
    
    // Set streaming headers
    const range = req.headers.range;
    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : file.length - 1;
      const chunkSize = (end - start) + 1;
      
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${file.length}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': 'video/mp4'
      });
      
      const stream = file.createReadStream({ start, end });
      stream.pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': file.length,
        'Content-Type': 'video/mp4'
      });
      file.createReadStream().pipe(res);
    }
    
  } catch (error) {
    console.error('Streaming error:', error);
    res.status(500).json({ error: 'Streaming failed' });
  }
});

// Remove torrent
app.delete('/api/torrents/:infoHash', (req, res) => {
  const torrent = torrents[req.params.infoHash];
  if (!torrent) {
    return res.status(404).json({ error: 'Torrent not found' });
  }
  
  const torrentName = torrent.name;
  const freedSpace = torrent.downloaded || 0;
  
  client.remove(torrent, { destroyStore: true }, (err) => {
    if (err) {
      console.log(`⚠️ Error removing torrent: ${err.message}`);
      return res.status(500).json({ error: 'Failed to remove torrent: ' + err.message });
    }
    
    console.log(`✅ Torrent ${torrentName} removed successfully`);
    delete torrents[req.params.infoHash];
    
    res.json({ 
      message: 'Torrent removed successfully',
      freedSpace,
      name: torrentName
    });
  });
});

// Clear all torrents
app.delete('/api/torrents', (req, res) => {
  console.log('🧹 Clearing all torrents...');
  
  const torrentCount = Object.keys(torrents).length;
  let removedCount = 0;
  let totalFreed = 0;
  
  if (torrentCount === 0) {
    return res.json({ 
      message: 'No torrents to clear',
      cleared: 0,
      totalFreed: 0
    });
  }
  
  Object.values(torrents).forEach(torrent => {
    totalFreed += torrent.downloaded || 0;
  });
  
  const removePromises = Object.values(torrents).map(torrent => {
    return new Promise((resolve) => {
      client.remove(torrent, { destroyStore: true }, (err) => {
        if (!err) removedCount++;
        resolve();
      });
    });
  });
  
  Promise.all(removePromises).then(() => {
    Object.keys(torrents).forEach(key => delete torrents[key]);
    
    res.json({ 
      message: `Cleared ${removedCount} torrents successfully`,
      cleared: removedCount,
      totalFreed
    });
  });
});

// Cache stats endpoint
app.get('/api/cache/stats', (req, res) => {
  const activeTorrents = Object.keys(torrents).length;
  let totalDownloaded = 0;
  let totalSize = 0;
  
  Object.values(torrents).forEach(torrent => {
    totalDownloaded += torrent.downloaded || 0;
    totalSize += torrent.length || 0;
  });
  
  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };
  
  console.log(`📊 Cache stats request - Active torrents: ${activeTorrents}`);
  console.log(`📊 Total downloaded from torrents: ${formatBytes(totalDownloaded)}`);
  
  const stats = {
    totalDownloaded: formatBytes(totalDownloaded),
    activeTorrents,
    totalSize: formatBytes(totalSize)
  };
  
  console.log(`📊 Sending cache stats:`, stats);
  res.json(stats);
});

// Disk usage endpoint
app.get('/api/system/disk', (req, res) => {
  try {
    const fs = require('fs');
    const stats = fs.statSync('.');
    const { exec } = require('child_process');
    
    exec('df -k .', (error, stdout, stderr) => {
      if (error) {
        console.error('Error getting disk usage:', error);
        return res.status(500).json({ error: 'Failed to get disk usage' });
      }
      
      const lines = stdout.trim().split('\n');
      const data = lines[1].split(/\s+/);
      const total = parseInt(data[1]) * 1024; // Convert from KB to bytes
      const used = parseInt(data[2]) * 1024;
      const available = parseInt(data[3]) * 1024;
      const percentage = Math.round((used / total) * 100);
      
      const diskInfo = { total, used, available, percentage };
      console.log('📊 Disk usage:', diskInfo);
      res.json(diskInfo);
    });
  } catch (error) {
    console.error('Error getting disk stats:', error);
    res.status(500).json({ error: 'Failed to get disk stats' });
  }
});

// Start server
const PORT = config.server.port;
const HOST = config.server.host;

app.listen(PORT, HOST, () => {
  const serverUrl = `${config.server.protocol}://${HOST}:${PORT}`;
  console.log(`🌱 Seedbox Lite server running on ${serverUrl}`);
  console.log(`📱 Frontend URL: ${config.frontend.url}`);
  console.log('🌪️ Real torrent functionality active - WebTorrent');
  console.log('⚠️  SECURITY: Download-only mode - Zero uploads guaranteed');
  console.log('💡 On-demand torrent loading enabled - No persistence needed');
  
  if (config.isDevelopment) {
    console.log('🔧 Development mode - Environment variables loaded');
  }
});
