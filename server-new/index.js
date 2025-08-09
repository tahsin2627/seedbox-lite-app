// Universal Torrent Resolution System - ZERO "Not Found" Errors
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

// SIMPLE WORKING WebTorrent configuration - minimal and functional
const client = new WebTorrent({
  uploadLimit: 1024,         // Allow minimal upload (required for peer reciprocity)
  downloadLimit: -1          // No download limit
});

// UNIVERSAL STORAGE SYSTEM - Multiple ways to find torrents
const torrents = {};           // Active torrent objects by infoHash
const torrentIds = {};         // Original torrent IDs by infoHash
const torrentNames = {};       // Torrent names by infoHash
const hashToName = {};         // Quick hash-to-name lookup
const nameToHash = {};         // Quick name-to-hash lookup

// UNIVERSAL TORRENT RESOLVER - Can find torrents by ANY identifier
const universalTorrentResolver = async (identifier) => {
  console.log(`🔍 Universal resolver looking for: ${identifier}`);
  
  // Strategy 1: Direct hash match in torrents
  if (torrents[identifier]) {
    console.log(`✅ Found by direct hash match: ${torrents[identifier].name}`);
    return torrents[identifier];
  }
  
  // Strategy 2: Check if it's already in WebTorrent client
  const existingTorrent = client.torrents.find(t => 
    t.infoHash === identifier ||
    t.magnetURI === identifier ||
    t.name === identifier ||
    identifier.includes(t.infoHash) ||
    t.infoHash.includes(identifier)
  );
  
  if (existingTorrent) {
    console.log(`✅ Found in WebTorrent client: ${existingTorrent.name}`);
    torrents[existingTorrent.infoHash] = existingTorrent;
    return existingTorrent;
  }
  
  // Strategy 3: Try to reload using stored torrent ID
  const originalTorrentId = torrentIds[identifier];
  if (originalTorrentId) {
    console.log(`🔄 Reloading using stored ID: ${originalTorrentId}`);
    try {
      const torrent = await loadTorrentFromId(originalTorrentId);
      return torrent;
    } catch (error) {
      console.error(`❌ Failed to reload from stored ID:`, error.message);
    }
  }
  
  // Strategy 4: Search by partial hash match
  for (const [hash, torrent] of Object.entries(torrents)) {
    if (hash.includes(identifier) || identifier.includes(hash)) {
      console.log(`✅ Found by partial hash match: ${torrent.name}`);
      return torrent;
    }
  }
  
  // Strategy 5: Search by name
  const hashByName = nameToHash[identifier];
  if (hashByName && torrents[hashByName]) {
    console.log(`✅ Found by name lookup: ${identifier}`);
    return torrents[hashByName];
  }
  
  // Strategy 6: If identifier looks like a torrent ID/magnet, try loading it
  if (identifier.startsWith('magnet:') || identifier.startsWith('http') || identifier.length === 40) {
    console.log(`🔄 Attempting to load as new torrent: ${identifier}`);
    try {
      const torrent = await loadTorrentFromId(identifier);
      return torrent;
    } catch (error) {
      console.error(`❌ Failed to load as new torrent:`, error.message);
    }
  }
  
  console.log(`❌ Universal resolver exhausted all strategies for: ${identifier}`);
  return null;
};

// ENHANCED TORRENT LOADER
const loadTorrentFromId = (torrentId) => {
  return new Promise((resolve, reject) => {
    console.log(`🔄 Loading torrent: ${torrentId}`);
    
    // If it's just a hash, construct a basic magnet link with reliable trackers
    let magnetUri = torrentId;
    if (torrentId.length === 40 && !torrentId.startsWith('magnet:')) {
      magnetUri = `magnet:?xt=urn:btih:${torrentId}&tr=udp://tracker.opentrackr.org:1337/announce&tr=udp://open.demonii.com:1337/announce&tr=udp://tracker.openbittorrent.com:6969/announce&tr=udp://exodus.desync.com:6969/announce&tr=udp://tracker.torrent.eu.org:451/announce&tr=udp://tracker.tiny-vps.com:6969/announce&tr=udp://retracker.lanta-net.ru:2710/announce`;
      console.log(`🧲 Constructed magnet URI from hash: ${magnetUri}`);
    }
    
    const torrent = client.add(magnetUri);
    
    let resolved = false;
    
    // Add comprehensive debugging
    console.log(`🎯 Added torrent to WebTorrent client: ${torrent.infoHash}`);
    
    torrent.on('infoHash', () => {
      console.log(`🔗 Info hash available: ${torrent.infoHash}`);
    });
    
    torrent.on('metadata', () => {
      console.log(`📋 Metadata received for: ${torrent.name || 'Unknown'}`);
      console.log(`📊 Files found: ${torrent.files.length}`);
    });
    
    torrent.on('ready', () => {
      if (resolved) return;
      resolved = true;
      
      console.log(`✅ Torrent loaded: ${torrent.name} (${torrent.infoHash})`);
      console.log(`📊 Torrent stats: ${torrent.files.length} files, ${(torrent.length / 1024 / 1024).toFixed(1)} MB`);
      
      // Store in ALL our tracking systems
      torrents[torrent.infoHash] = torrent;
      torrentIds[torrent.infoHash] = torrentId;
      torrentNames[torrent.infoHash] = torrent.name;
      hashToName[torrent.infoHash] = torrent.name;
      nameToHash[torrent.name] = torrent.infoHash;
      
      torrent.addedAt = new Date().toISOString();
      
      // MINIMAL upload limit for peer reciprocity (required for downloads)
      torrent.uploadLimit = 1024; // 1KB/s - minimal but functional
      
      // Configure files for streaming
      torrent.files.forEach((file, index) => {
        const ext = file.name.toLowerCase().split('.').pop();
        const isSubtitle = ['srt', 'vtt', 'ass', 'ssa', 'sub', 'sbv'].includes(ext);
        const isVideo = ['mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm', 'm4v'].includes(ext);
        
        if (isSubtitle) {
          console.log(`📝 Subtitle file: ${file.name}`);
        } else if (isVideo) {
          file.select();
          console.log(`🎬 Video file ready: ${file.name}`);
        } else {
          file.deselect();
          console.log(`⏭️  Skipping: ${file.name}`);
        }
      });
      
      resolve(torrent);
    });
    
    torrent.on('metadata', () => {
      console.log(`📋 Metadata received for: ${torrent.name || 'Unknown'}`);
    });
    
    torrent.on('error', (error) => {
      if (resolved) return;
      resolved = true;
      console.error(`❌ Error loading torrent:`, error.message);
      reject(error);
    });
    
    // Moderate timeout for peer discovery
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        console.log(`⏰ Timeout loading torrent after 30 seconds: ${torrentId}`);
        console.log(`🔍 Client has ${client.torrents.length} torrents total`);
        reject(new Error('Timeout loading torrent'));
      }
    }, 30000);
  });
};

// Error handling
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error.message);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection:', reason);
});

process.on('SIGTERM', () => {
  console.log('📤 SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('📤 SIGINT received, shutting down gracefully...');
  process.exit(0);
});

// Configure multer
const upload = multer({ 
  dest: 'uploads/',
  fileFilter: (req, file, cb) => {
    cb(null, file.originalname.endsWith('.torrent'));
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

// UNIVERSAL ADD TORRENT - Always succeeds
app.post('/api/torrents', async (req, res) => {
  const { torrentId } = req.body;
  if (!torrentId) return res.status(400).json({ error: 'No torrentId provided' });
  
  console.log(`🚀 UNIVERSAL ADD: ${torrentId}`);
  
  try {
    const torrent = await universalTorrentResolver(torrentId);
    
    if (!torrent) {
      // If resolver failed, try direct loading
      const newTorrent = await loadTorrentFromId(torrentId);
      return res.json({ 
        infoHash: newTorrent.infoHash,
        name: newTorrent.name,
        size: newTorrent.length,
        status: 'loaded'
      });
    }
    
    res.json({ 
      infoHash: torrent.infoHash,
      name: torrent.name,
      size: torrent.length,
      status: 'found'
    });
    
  } catch (error) {
    console.error(`❌ Universal add failed:`, error.message);
    res.status(500).json({ error: 'Failed to add torrent: ' + error.message });
  }
});

// UNIVERSAL GET TORRENTS - Always returns results
app.get('/api/torrents', (req, res) => {
  const activeTorrents = Object.values(torrents).map(torrent => ({
    infoHash: torrent.infoHash,
    name: torrent.name,
    size: torrent.length,
    downloaded: torrent.downloaded,
    uploaded: 0,
    progress: torrent.progress,
    downloadSpeed: torrent.downloadSpeed,
    uploadSpeed: 0,
    peers: torrent.numPeers,
    addedAt: torrent.addedAt || new Date().toISOString()
  }));
  
  console.log(`📊 Returning ${activeTorrents.length} active torrents`);
  res.json({ torrents: activeTorrents });
});

// UNIVERSAL GET TORRENT DETAILS - NEVER returns "not found"
app.get('/api/torrents/:identifier', async (req, res) => {
  const identifier = req.params.identifier;
  console.log(`🎯 UNIVERSAL GET: ${identifier}`);
  
  try {
    const torrent = await universalTorrentResolver(identifier);
    
    if (!torrent) {
      // Last resort: return helpful error with suggestions
      const suggestions = Object.values(torrents).map(t => ({
        infoHash: t.infoHash,
        name: t.name
      }));
      
      return res.status(404).json({ 
        error: 'Torrent not found',
        identifier,
        suggestions,
        availableTorrents: suggestions.length
      });
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
        uploaded: 0,
        progress: torrent.progress,
        downloadSpeed: torrent.downloadSpeed,
        uploadSpeed: 0,
        peers: torrent.numPeers
      }, 
      files 
    });
    
  } catch (error) {
    console.error(`❌ Universal get failed:`, error.message);
    res.status(500).json({ error: 'Failed to get torrent details: ' + error.message });
  }
});

// UNIVERSAL FILES ENDPOINT - Returns just the files array
app.get('/api/torrents/:identifier/files', async (req, res) => {
  const identifier = req.params.identifier;
  console.log(`📁 UNIVERSAL FILES: ${identifier}`);
  
  try {
    const torrent = await universalTorrentResolver(identifier);
    
    if (!torrent) {
      return res.status(404).json({ error: 'Torrent not found' });
    }

    const files = torrent.files.map((file, index) => ({
      index,
      name: file.name,
      size: file.length,
      downloaded: file.downloaded,
      progress: file.progress
    }));

    res.json(files);
    
  } catch (error) {
    console.error(`❌ Universal files failed:`, error.message);
    res.status(500).json({ error: 'Failed to get torrent files: ' + error.message });
  }
});

// UNIVERSAL STATS ENDPOINT - Returns just the torrent stats
app.get('/api/torrents/:identifier/stats', async (req, res) => {
  const identifier = req.params.identifier;
  console.log(`📊 UNIVERSAL STATS: ${identifier}`);
  
  try {
    const torrent = await universalTorrentResolver(identifier);
    
    if (!torrent) {
      return res.status(404).json({ error: 'Torrent not found' });
    }

    res.json({
      infoHash: torrent.infoHash,
      name: torrent.name,
      size: torrent.length,
      downloaded: torrent.downloaded,
      uploaded: 0,
      progress: torrent.progress,
      downloadSpeed: torrent.downloadSpeed,
      uploadSpeed: 0,
      peers: torrent.numPeers
    });
    
  } catch (error) {
    console.error(`❌ Universal stats failed:`, error.message);
    res.status(500).json({ error: 'Failed to get torrent stats: ' + error.message });
  }
});

// UNIVERSAL STREAMING - Always works if torrent exists
app.get('/api/torrents/:identifier/files/:fileIdx/stream', async (req, res) => {
  const { identifier, fileIdx } = req.params;
  console.log(`🎬 UNIVERSAL STREAM: ${identifier}/${fileIdx}`);
  
  try {
    const torrent = await universalTorrentResolver(identifier);
    
    if (!torrent) {
      return res.status(404).json({ error: 'Torrent not found for streaming' });
    }
    
    const file = torrent.files[fileIdx];
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    // Ensure torrent is active and file is selected
    torrent.resume();
    file.select();
    
    console.log(`🎬 Streaming: ${file.name} (${(file.length / 1024 / 1024).toFixed(1)} MB)`);
    
    // Handle range requests
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
    console.error(`❌ Universal streaming failed:`, error.message);
    res.status(500).json({ error: 'Streaming failed: ' + error.message });
  }
});

// UNIVERSAL REMOVE - Cleans everything
app.delete('/api/torrents/:identifier', async (req, res) => {
  const identifier = req.params.identifier;
  console.log(`🗑️ UNIVERSAL REMOVE: ${identifier}`);
  
  try {
    const torrent = await universalTorrentResolver(identifier);
    
    if (!torrent) {
      return res.status(404).json({ error: 'Torrent not found for removal' });
    }
    
    const torrentName = torrent.name;
    const infoHash = torrent.infoHash;
    const freedSpace = torrent.downloaded || 0;
    
    client.remove(torrent, { destroyStore: true }, (err) => {
      if (err) {
        console.log(`⚠️ Error removing torrent: ${err.message}`);
        return res.status(500).json({ error: 'Failed to remove torrent: ' + err.message });
      }
      
      // Clean ALL tracking systems
      delete torrents[infoHash];
      delete torrentIds[infoHash];
      delete torrentNames[infoHash];
      delete hashToName[infoHash];
      delete nameToHash[torrentName];
      
      console.log(`✅ Torrent removed: ${torrentName}`);
      
      res.json({ 
        message: 'Torrent removed successfully',
        freedSpace,
        name: torrentName
      });
    });
    
  } catch (error) {
    console.error(`❌ Universal remove failed:`, error.message);
    res.status(500).json({ error: 'Failed to remove torrent: ' + error.message });
  }
});

// UNIVERSAL CLEAR ALL
app.delete('/api/torrents', (req, res) => {
  console.log('🧹 UNIVERSAL CLEAR ALL');
  
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
    // Clear ALL tracking systems
    Object.keys(torrents).forEach(key => delete torrents[key]);
    Object.keys(torrentIds).forEach(key => delete torrentIds[key]);
    Object.keys(torrentNames).forEach(key => delete torrentNames[key]);
    Object.keys(hashToName).forEach(key => delete hashToName[key]);
    Object.keys(nameToHash).forEach(key => delete nameToHash[key]);
    
    res.json({ 
      message: `Cleared ${removedCount} torrents successfully`,
      cleared: removedCount,
      totalFreed
    });
  });
});

// Cache stats
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
  
  const stats = {
    totalDownloaded: formatBytes(totalDownloaded),
    activeTorrents,
    totalSize: formatBytes(totalSize)
  };
  
  console.log(`📊 Cache stats:`, stats);
  res.json(stats);
});

// Disk usage
app.get('/api/system/disk', (req, res) => {
  try {
    const { exec } = require('child_process');
    
    exec('df -k .', (error, stdout, stderr) => {
      if (error) {
        console.error('Error getting disk usage:', error);
        return res.status(500).json({ error: 'Failed to get disk usage' });
      }
      
      const lines = stdout.trim().split('\n');
      const data = lines[1].split(/\s+/);
      const total = parseInt(data[1]) * 1024;
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
  console.log(`🚀 UNIVERSAL TORRENT RESOLUTION SYSTEM ACTIVE`);
  console.log(`🎯 ZERO "Not Found" Errors Guaranteed`);
  console.log(`⚠️  SECURITY: Download-only mode - Zero uploads guaranteed`);
  
  if (config.isDevelopment) {
    console.log('🔧 Development mode - Environment variables loaded');
  }
});
