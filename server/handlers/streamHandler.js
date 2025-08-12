// Enhanced streaming handler optimized for low-resource environments
const mime = require('mime-types');
const path = require('path');

/**
 * Stream handler factory - creates a handler optimized for low-resource environments
 * @param {Object} options - Configuration options
 * @returns {Function} Express route handler
 */
const createOptimizedStreamHandler = (options = {}) => {
  // Default options with sensible values for low-resource servers
  const config = {
    maxChunkSize: options.maxChunkSize || 1024 * 1024, // 1MB default chunk size
    defaultMimeType: options.defaultMimeType || 'video/mp4',
    prioritizeSeeks: options.prioritizeSeeks !== undefined ? options.prioritizeSeeks : true,
    priorityPieces: options.priorityPieces || 3,
    ...options
  };
  
  // MIME type mapping with more video types
  const mimeTypes = {
    'mp4': 'video/mp4',
    'webm': 'video/webm',
    'mkv': 'video/x-matroska',
    'avi': 'video/x-msvideo',
    'mov': 'video/quicktime',
    'wmv': 'video/x-ms-wmv',
    'flv': 'video/x-flv',
    'm4v': 'video/mp4',
    'ts': 'video/mp2t',
    'mts': 'video/mp2t',
    'mpg': 'video/mpeg',
    'mpeg': 'video/mpeg',
    'ogv': 'video/ogg',
    '3gp': 'video/3gpp',
    'mp3': 'audio/mpeg',
    'wav': 'audio/wav',
    'ogg': 'audio/ogg',
    'm4a': 'audio/mp4',
    'aac': 'audio/aac',
    'srt': 'application/x-subrip',
    'vtt': 'text/vtt',
    'ass': 'text/plain',
  };
  
  // Express route handler
  return async (req, res) => {
    const requestId = req.requestId || `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    
    try {
      const { identifier, index } = req.params;
      
      // Get torrent from your resolver
      const torrent = await req.app.locals.universalTorrentResolver(identifier);
      
      if (!torrent) {
        return res.status(404).json({ error: 'Torrent not found for streaming' });
      }
      
      const fileIndex = parseInt(index, 10);
      const file = torrent.files[fileIndex];
      
      if (!file) {
        return res.status(404).json({ error: 'File not found' });
      }
      
      // Ensure torrent is active and file is selected
      torrent.resume();
      file.select();
      
      // Set file priority high for streaming
      if (typeof file.prioritize === 'function') {
        file.prioritize();
      }
      
      // Determine content type from file extension
      const ext = path.extname(file.name).toLowerCase().slice(1);
      const contentType = mimeTypes[ext] || mime.lookup(file.name) || config.defaultMimeType;
      
      // Parse range header with better error handling
      let start = 0;
      let end = Math.min(file.length - 1, start + config.maxChunkSize - 1);
      let isRangeRequest = false;
      
      if (req.headers.range) {
        try {
          isRangeRequest = true;
          const parts = req.headers.range.replace(/bytes=/, "").split("-");
          start = parseInt(parts[0], 10);
          
          // End is either specified or limited by max chunk size
          if (parts[1] && parts[1].trim() !== '') {
            end = Math.min(parseInt(parts[1], 10), file.length - 1);
          } else {
            end = Math.min(file.length - 1, start + config.maxChunkSize - 1);
          }
          
          // Validate range values
          if (isNaN(start) || isNaN(end) || start < 0 || end >= file.length || start > end) {
            throw new Error('Invalid range');
          }
        } catch (error) {
          console.log(`⚠️ [${requestId}] Invalid range header: ${req.headers.range}`);
          // Fall back to default range
          start = 0;
          end = Math.min(file.length - 1, config.maxChunkSize - 1);
          isRangeRequest = false;
        }
      }
      
      // Calculate chunk size for response
      const chunkSize = (end - start) + 1;
      
      // Set appropriate headers
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Length', chunkSize);
      res.setHeader('Accept-Ranges', 'bytes');
      
      if (isRangeRequest) {
        res.setHeader('Content-Range', `bytes ${start}-${end}/${file.length}`);
        res.status(206); // Partial content
      } else {
        res.status(200);
      }
      
      // Handle seeking by prioritizing pieces
      if (config.prioritizeSeeks && start > 0) {
        const pieceLength = torrent.pieceLength;
        const startPiece = Math.floor(start / pieceLength);
        
        try {
          // Prioritize pieces at the seek position
          for (let i = 0; i < config.priorityPieces; i++) {
            const pieceIndex = startPiece + i;
            if (pieceIndex < file._endPiece) {
              // Use different prioritization methods depending on what's available
              if (file._torrent && typeof file._torrent.select === 'function') {
                file._torrent.select(pieceIndex, pieceIndex + 1, 1);
              }
              
              if (file._torrent && typeof file._torrent.critical === 'function') {
                file._torrent.critical(pieceIndex);
              }
            }
          }
        } catch (error) {
          console.log(`⚠️ [${requestId}] Error prioritizing pieces: ${error.message}`);
        }
      }
      
      // Create read stream with appropriate range
      const stream = file.createReadStream({ start, end });
      
      // Handle stream events
      stream.on('error', (err) => {
        console.log(`❌ [${requestId}] Stream error: ${err.message}`);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Stream error: ' + err.message });
        } else if (!res.writableEnded) {
          res.end();
        }
      });
      
      // Handle client disconnect
      req.on('close', () => {
        stream.destroy();
      });
      
      // Pipe the stream to the response
      stream.pipe(res);
      
    } catch (error) {
      console.log(`❌ [${requestId}] Streaming handler error: ${error.message}`);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Streaming error: ' + error.message });
      } else if (!res.writableEnded) {
        res.end();
      }
    }
  };
};

module.exports = createOptimizedStreamHandler;
