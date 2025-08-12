// optimizedStreamingHandler.js
/**
 * Optimized streaming handler for low-resource environments
 * Provides efficient, chunked streaming with proper memory management
 */

/**
 * Creates an optimized streaming handler
 * @param {Object} options - Configuration options
 * @returns {Function} Express request handler
 */
const createOptimizedStreamingHandler = (options = {}) => {
  // Default options
  const config = {
    chunkSize: 256 * 1024,     // Default 256KB chunks
    streamTimeout: 20000,      // 20 seconds timeout
    prioritizePieces: true,    // Whether to prioritize pieces at seek position
    logLevel: 1,               // 0=none, 1=basic, 2=verbose
    universalTorrentResolver: null, // Required function to resolve torrents
    ...options
  };
  
  if (!config.universalTorrentResolver) {
    throw new Error('universalTorrentResolver is required');
  }
  
  return async (req, res) => {
    const identifier = req.params.identifier;
    const fileIdx = parseInt(req.params.fileIdx, 10);
    
    if (config.logLevel > 0) {
      console.log(`🎬 Streaming request: ${identifier}/${fileIdx}`);
    }
    
    // Set important headers immediately
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Cache-Control', 'no-cache, no-store');
    
    // Timeout handling
    let streamTimeout;
    
    try {
      // Get the torrent with a timeout
      const torrentPromise = config.universalTorrentResolver(identifier);
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Resolver timeout')), 5000)
      );
      
      const torrent = await Promise.race([torrentPromise, timeoutPromise]);
      
      if (!torrent) {
        return res.status(404).send('Torrent not found for streaming');
      }
      
      const file = torrent.files[fileIdx];
      if (!file) {
        return res.status(404).send('File not found');
      }
      
      // Ensure torrent is active and file is selected
      torrent.resume();
      file.select();
      
      if (config.logLevel > 0) {
        console.log(`🎬 Streaming: ${file.name} (${(file.length / 1024 / 1024).toFixed(1)} MB)`);
      }
      
      // Determine MIME type
      const ext = file.name.split('.').pop().toLowerCase();
      const mimeTypes = {
        'mp4': 'video/mp4',
        'mkv': 'video/x-matroska',
        'avi': 'video/x-msvideo',
        'mov': 'video/quicktime',
        'wmv': 'video/x-ms-wmv',
        'flv': 'video/x-flv',
        'webm': 'video/webm',
        'm4v': 'video/mp4',
        'mp3': 'audio/mpeg',
        'm4a': 'audio/mp4',
        'wav': 'audio/wav',
        'ogg': 'audio/ogg',
        'flac': 'audio/flac',
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'gif': 'image/gif',
        'webp': 'image/webp'
      };
      const contentType = mimeTypes[ext] || 'application/octet-stream';
      
      // Handle range request with small chunks
      const range = req.headers.range;
      if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        
        // Calculate end with a reasonable chunk size
        const end = parts[1] ? parseInt(parts[1], 10) : Math.min(start + config.chunkSize - 1, file.length - 1);
        
        // Safety check for valid ranges
        if (isNaN(start) || isNaN(end) || start < 0 || end >= file.length || start > end) {
          return res.status(416).send('Range Not Satisfiable');
        }
        
        const chunkSize = (end - start) + 1;
        
        // Log seeking behavior for debugging
        if (start > 0 && config.logLevel > 1) {
          console.log(`⏩ Seek to position ${(start / file.length * 100).toFixed(1)}% of the file`);
        }
        
        // Prioritize pieces at the seek position
        if (config.prioritizePieces && start > 0 && file._torrent) {
          try {
            const pieceLength = torrent.pieceLength;
            const startPiece = Math.floor(start / pieceLength);
            
            // Prioritize just a few pieces for better seeking
            for (let i = 0; i < 3; i++) {
              if (startPiece + i < file._endPiece) {
                file._torrent.select(startPiece + i, startPiece + i + 1, 1);
              }
            }
          } catch (err) {
            if (config.logLevel > 0) {
              console.log(`⚠️ Error prioritizing pieces: ${err.message}`);
            }
          }
        }
        
        // Set response headers
        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${file.length}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunkSize,
          'Content-Type': contentType,
          'Cache-Control': 'no-cache',
        });
        
        // Create stream with timeout handling
        const stream = file.createReadStream({ start, end });
        let bytesStreamed = 0;
        
        // Set initial timeout
        streamTimeout = setTimeout(() => {
          if (config.logLevel > 0) {
            console.log(`⚠️ Stream timeout after ${config.streamTimeout}ms`);
          }
          stream.destroy();
          res.end();
        }, config.streamTimeout);
        
        // Handle stream events
        stream.on('data', (chunk) => {
          bytesStreamed += chunk.length;
          
          // Reset timeout on data
          clearTimeout(streamTimeout);
          streamTimeout = setTimeout(() => {
            if (config.logLevel > 0) {
              console.log(`⚠️ Stream timeout after inactivity`);
            }
            stream.destroy();
            res.end();
          }, config.streamTimeout);
          
          // Flow control: pause stream if response can't keep up
          if (!res.write(chunk)) {
            stream.pause();
          }
        });
        
        // Resume stream when response drains
        res.on('drain', () => {
          stream.resume();
        });
        
        stream.on('end', () => {
          clearTimeout(streamTimeout);
          res.end();
          if (config.logLevel > 0) {
            console.log(`✅ Stream chunk completed: ${bytesStreamed} bytes streamed`);
          }
        });
        
        stream.on('error', (error) => {
          clearTimeout(streamTimeout);
          if (config.logLevel > 0) {
            console.log(`❌ Stream error: ${error.message}`);
          }
          if (!res.headersSent) {
            res.status(500).send('Stream error');
          } else {
            res.end();
          }
        });
        
        // Clean up on client disconnect
        req.on('close', () => {
          clearTimeout(streamTimeout);
          stream.destroy();
          if (config.logLevel > 1) {
            console.log(`🔌 Client disconnected from stream`);
          }
        });
        
      } else {
        // Non-range request - still use chunked approach for large files
        if (file.length > 10 * 1024 * 1024) { // Files larger than 10MB
          // For large files without range, respond with a 206 and the first chunk
          const end = Math.min(1024 * 1024 - 1, file.length - 1); // First 1MB
          
          res.writeHead(206, {
            'Content-Range': `bytes 0-${end}/${file.length}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': end + 1,
            'Content-Type': contentType,
            'Cache-Control': 'no-cache',
          });
          
          const stream = file.createReadStream({ start: 0, end });
          
          // Set timeout
          streamTimeout = setTimeout(() => {
            if (config.logLevel > 0) {
              console.log(`⚠️ Stream timeout after ${config.streamTimeout}ms`);
            }
            stream.destroy();
            res.end();
          }, config.streamTimeout);
          
          stream.pipe(res);
          
          stream.on('end', () => {
            clearTimeout(streamTimeout);
          });
          
          stream.on('error', (error) => {
            clearTimeout(streamTimeout);
            if (config.logLevel > 0) {
              console.log(`❌ Stream error: ${error.message}`);
            }
            if (!res.headersSent) {
              res.status(500).send('Stream error');
            } else {
              res.end();
            }
          });
          
          // Clean up on client disconnect
          req.on('close', () => {
            clearTimeout(streamTimeout);
            stream.destroy();
          });
        } else {
          // Small files - normal response
          res.writeHead(200, {
            'Content-Length': file.length,
            'Content-Type': contentType,
            'Accept-Ranges': 'bytes',
            'Cache-Control': 'no-cache',
          });
          
          const stream = file.createReadStream();
          
          // Set timeout
          streamTimeout = setTimeout(() => {
            if (config.logLevel > 0) {
              console.log(`⚠️ Stream timeout after ${config.streamTimeout}ms`);
            }
            stream.destroy();
            res.end();
          }, config.streamTimeout);
          
          stream.pipe(res);
          
          stream.on('end', () => {
            clearTimeout(streamTimeout);
          });
          
          stream.on('error', (error) => {
            clearTimeout(streamTimeout);
            if (config.logLevel > 0) {
              console.log(`❌ Stream error: ${error.message}`);
            }
            if (!res.headersSent) {
              res.status(500).send('Stream error');
            } else {
              res.end();
            }
          });
          
          // Clean up on client disconnect
          req.on('close', () => {
            clearTimeout(streamTimeout);
            stream.destroy();
          });
        }
      }
    } catch (error) {
      clearTimeout(streamTimeout);
      if (config.logLevel > 0) {
        console.error(`❌ Streaming error:`, error.message);
      }
      if (!res.headersSent) {
        res.status(500).send('Error streaming file: ' + error.message);
      } else {
        res.end();
      }
    }
  };
};

module.exports = createOptimizedStreamingHandler;
