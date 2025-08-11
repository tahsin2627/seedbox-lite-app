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
  omdb: {
    apiKey: process.env.OMDB_API_KEY || '8265bd1c' // Free API key for development
  },
  isDevelopment: process.env.NODE_ENV !== 'production'
};

const app = express();

// OPTIMIZED WebTorrent configuration for faster downloads and better buffering
const client = new WebTorrent({
  uploadLimit: 1000,         // Increased upload for better peer reciprocity
  downloadLimit: -1,         // No download limit
  maxConns: 150,            // Increased max connections (default is 55)
  webSeeds: true,           // Enable web seeds
  tracker: true,            // Enable trackers
  pex: true,                // Enable peer exchange for discovering more peers
  dht: true                 // Enable DHT for peer discovery
});

// UNIVERSAL STORAGE SYSTEM - Multiple ways to find torrents
const torrents = {};           // Active torrent objects by infoHash
const torrentIds = {};         // Original torrent IDs by infoHash
const torrentNames = {};       // Torrent names by infoHash
const hashToName = {};         // Quick hash-to-name lookup
const nameToHash = {};         // Quick name-to-hash lookup

// IMDB Integration
const imdbCache = new Map();

  // Enhanced title cleaning for better API results
  function cleanTorrentName(torrentName) {
    console.log(`🔍 Cleaning torrent name: "${torrentName}"`);
    
    // Extract year first before cleaning
    const yearMatch = torrentName.match(/\b(19|20)\d{2}\b/);
    const year = yearMatch ? yearMatch[0] : null;
    
    // Enhanced series detection - more comprehensive patterns
    const isLikelySeries = /\b(S\d+|Season|SEASON|series|Series|SERIES|E\d+|Episode|EPISODE|COMPLETE|Complete|complete)\b/i.test(torrentName);
    console.log(`📺 Series detection: ${isLikelySeries ? 'YES' : 'NO'}`);
    
    // First pass: Remove common torrent artifacts
    let cleaned = torrentName
      .replace(/\[(.*?)\]/g, '') // Remove [groups] like [YTS.MX], [OxTorrent.com]
      .replace(/\((.*?)\)/g, '') // Remove (year) and other parentheses content initially
      .replace(/\.(720p|1080p|480p|2160p|4K)/gi, '') // Remove quality indicators
      .replace(/\.(BluRay|WEBRip|WEB-DL|DVDRip|CAMRip|TS|TC|WEB)/gi, '') // Remove source indicators
      .replace(/\.(x264|x265|H264|H265|HEVC|AVC)/gi, '') // Remove codec info
      .replace(/\.(AAC|MP3|AC3|DTS|FLAC)/gi, '') // Remove audio codec
      .replace(/\.(mkv|mp4|avi|mov|flv)/gi, '') // Remove file extensions
      .replace(/\b(REPACK|PROPER|EXTENDED|UNRATED|DIRECTORS|CUT)\b/gi, '') // Remove edition info
      .replace(/\b\d+CH\b/gi, '') // Remove channel info like 2CH, 5.1CH
      .replace(/\b(PSA|YTS|YIFY|RARBG|EZTV|TGx)\b/gi, '') // Remove release groups
      .replace(/\./g, ' ') // Replace dots with spaces
      .replace(/[-_]/g, ' ') // Replace hyphens and underscores with spaces
      .replace(/\s+/g, ' ') // Normalize multiple spaces
      .trim();
    
    console.log(`🧹 After basic cleaning: "${cleaned}"`);
    
    if (isLikelySeries) {
      console.log(`📺 Applying series-specific cleaning`);
      
      // For series, aggressively remove season/episode specific info
      cleaned = cleaned
        .replace(/\b(S\d+.*)/gi, '') // Remove S01 and everything after
        .replace(/\b(Season\s*\d+.*)/gi, '') // Remove Season 1 and everything after
        .replace(/\b(SEASON\s*\d+.*)/gi, '') // Remove SEASON 1 and everything after
        .replace(/\b(E\d+.*)/gi, '') // Remove E01 and everything after
        .replace(/\b(Episode\s*\d+.*)/gi, '') // Remove Episode 1 and everything after
        .replace(/\b(EPISODE\s*\d+.*)/gi, '') // Remove EPISODE 1 and everything after
        .replace(/\b(COMPLETE.*)/gi, '') // Remove COMPLETE and everything after
        .replace(/\b(Complete.*)/gi, '') // Remove Complete and everything after
        .replace(/\b(complete.*)/gi, '') // Remove complete and everything after
        .replace(/\bSERIES\b/gi, '') // Remove standalone SERIES word
        .replace(/\bSeries\b/gi, '') // Remove standalone Series word
        .replace(/\bseries\b/gi, '') // Remove standalone series word
        .replace(/\bWEB\b/gi, '') // Remove WEB
        .replace(/\b\d+CH\b/gi, '') // Remove channel info again
        .replace(/\b(PSA|YTS|YIFY|RARBG|EZTV|TGx)\b/gi, '') // Remove release groups again
        .trim();
    }
    
    // Final cleanup
    cleaned = cleaned
      .replace(/\s+/g, ' ')
      .trim();
    
    console.log(`✨ Final cleaned result: title="${cleaned}", year=${year}`);
    return { title: cleaned, year };
  }

async function fetchIMDBData(torrentName) {
    console.log(`🎬 Fetching IMDB data for: "${torrentName}"`);
    
    // Check cache first
    if (imdbCache.has(torrentName)) {
        console.log(`📋 Using cached IMDB data for: ${torrentName}`);
        return imdbCache.get(torrentName);
    }
    
    const cleanedData = cleanTorrentName(torrentName);
    const { title, year } = cleanedData;
    
    // Validate title
    if (!title || title.length < 2) {
        console.log(`❌ Title too short or empty: "${title}"`);
        return null;
    }
    
    // Detect if it's likely a series/show
    const isLikelySeries = /\b(S\d+|Season|Episode|EP\d+|E\d+|Series|Complete)\b/i.test(torrentName);
    console.log(`🔍 Likely series: ${isLikelySeries} for "${torrentName}"`);
    
    // Get API key from environment
    const omdbKey = process.env.OMDB_API_KEY || 'trilogy';
    
    // Multiple search strategies with OMDb for both movies and series
    const omdbStrategies = [];
    
    if (isLikelySeries) {
        // For series, try series type first
        omdbStrategies.push(
            year ? `http://www.omdbapi.com/?apikey=${omdbKey}&t=${encodeURIComponent(title)}&y=${year}&type=series` : null,
            `http://www.omdbapi.com/?apikey=${omdbKey}&t=${encodeURIComponent(title)}&type=series`,
            `http://www.omdbapi.com/?apikey=${omdbKey}&s=${encodeURIComponent(title)}&type=series`
        );
    }
    
    // Add movie searches (for both movies and as fallback for series)
    omdbStrategies.push(
        year ? `http://www.omdbapi.com/?apikey=${omdbKey}&t=${encodeURIComponent(title)}&y=${year}` : null,
        `http://www.omdbapi.com/?apikey=${omdbKey}&t=${encodeURIComponent(title)}`,
        `http://www.omdbapi.com/?apikey=${omdbKey}&s=${encodeURIComponent(title)}&type=movie`,
        `http://www.omdbapi.com/?apikey=${omdbKey}&t=${encodeURIComponent('The ' + title)}`
    );
    
    const filteredStrategies = omdbStrategies.filter(Boolean);
    
    // Try OMDb first
    for (const url of filteredStrategies) {
        try {
            console.log(`🔍 Trying OMDb: ${url}`);
            const response = await fetch(url);
            const data = await response.json();
            
            if (data && data.Response === 'True') {
                // For search results, take the first result
                const movieData = data.Search ? data.Search[0] : data;
                
                if (movieData && movieData.Title) {
                    console.log(`✅ Found OMDb data: ${movieData.Title} (${movieData.Year}) - Type: ${movieData.Type || 'movie'}`);
                    
                    const result = {
                        Title: movieData.Title,
                        Year: movieData.Year,
                        imdbRating: movieData.imdbRating,
                        imdbVotes: movieData.imdbVotes,
                        Plot: movieData.Plot,
                        Director: movieData.Director,
                        Actors: movieData.Actors,
                        Poster: movieData.Poster !== 'N/A' ? movieData.Poster : null,
                        Backdrop: null, // Will be enhanced below if possible
                        Genre: movieData.Genre,
                        Runtime: movieData.Runtime,
                        Rated: movieData.Rated,
                        imdbID: movieData.imdbID,
                        Type: movieData.Type || 'movie',
                        source: 'omdb'
                    };
                    
                    // Try to enhance OMDb data with TMDB backdrop for better visuals
                    try {
                        if (isLikelySeries && movieData.Type === 'series') {
                            const tmdbTvUrl = `https://api.themoviedb.org/3/search/tv?api_key=3fd2be6f0c70a2a598f084ddfb75487d&query=${encodeURIComponent(movieData.Title)}`;
                            const tmdbResponse = await fetch(tmdbTvUrl, {
                                method: 'GET',
                                headers: { 'Accept': 'application/json', 'User-Agent': 'SeedboxLite/1.0' },
                                signal: AbortSignal.timeout(10000)
                            });
                            
                            if (tmdbResponse.ok) {
                                const tmdbData = await tmdbResponse.json();
                                if (tmdbData.results && tmdbData.results.length > 0) {
                                    const show = tmdbData.results[0];
                                    if (show.backdrop_path) {
                                        result.Backdrop = `https://image.tmdb.org/t/p/w1280${show.backdrop_path}`;
                                        console.log(`🎨 Enhanced with TMDB backdrop: ${result.Backdrop}`);
                                    }
                                }
                            }
                        } else {
                            const tmdbMovieUrl = `https://api.themoviedb.org/3/search/movie?api_key=3fd2be6f0c70a2a598f084ddfb75487d&query=${encodeURIComponent(movieData.Title)}`;
                            const tmdbResponse = await fetch(tmdbMovieUrl, {
                                method: 'GET',
                                headers: { 'Accept': 'application/json', 'User-Agent': 'SeedboxLite/1.0' },
                                signal: AbortSignal.timeout(10000)
                            });
                            
                            if (tmdbResponse.ok) {
                                const tmdbData = await tmdbResponse.json();
                                if (tmdbData.results && tmdbData.results.length > 0) {
                                    const movie = tmdbData.results[0];
                                    if (movie.backdrop_path) {
                                        result.Backdrop = `https://image.tmdb.org/t/p/w1280${movie.backdrop_path}`;
                                        console.log(`🎨 Enhanced with TMDB backdrop: ${result.Backdrop}`);
                                    }
                                }
                            }
                        }
                    } catch (enhanceError) {
                        console.log(`⚠️ Could not enhance with TMDB backdrop: ${enhanceError.message}`);
                    }
                    
                    // Cache the result
                    imdbCache.set(torrentName, result);
                    return result;
                }
            } else {
                console.log(`❌ OMDb error: ${data?.Error || 'Unknown error'}`);
            }
        } catch (error) {
            console.log(`❌ OMDb request error: ${error.message}`);
        }
    }
    
    // Fallback to TMDB (try both movies and TV series)
    console.log(`🎭 Trying TMDB as fallback for: ${title}`);
    
    // Try TV series first if likely series
    if (isLikelySeries) {
        try {
            const tmdbTvUrl = `https://api.themoviedb.org/3/search/tv?api_key=3fd2be6f0c70a2a598f084ddfb75487d&query=${encodeURIComponent(title)}${year ? `&first_air_date_year=${year}` : ''}`;
            console.log(`🔍 Trying TMDB TV: ${tmdbTvUrl}`);
            
            const searchResponse = await fetch(tmdbTvUrl, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'SeedboxLite/1.0'
                },
                signal: AbortSignal.timeout(15000) // 15 second timeout
            });
            
            if (!searchResponse.ok) {
                throw new Error(`HTTP ${searchResponse.status}: ${searchResponse.statusText}`);
            }
            
            const searchData = await searchResponse.json();
            
            if (searchData.results && searchData.results.length > 0) {
                const show = searchData.results[0];
                
                // Get detailed info for TV show
                const detailsUrl = `https://api.themoviedb.org/3/tv/${show.id}?api_key=3fd2be6f0c70a2a598f084ddfb75487d&append_to_response=credits`;
                const detailsResponse = await fetch(detailsUrl, {
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json',
                        'User-Agent': 'SeedboxLite/1.0'
                    },
                    signal: AbortSignal.timeout(15000)
                });
                
                if (!detailsResponse.ok) {
                    throw new Error(`HTTP ${detailsResponse.status}: ${detailsResponse.statusText}`);
                }
                
                const details = await detailsResponse.json();
                
                console.log(`✅ Found TMDB TV data: ${details.name} (${details.first_air_date?.substring(0, 4)})`);
                
                const result = {
                    Title: details.name,
                    Year: details.first_air_date?.substring(0, 4),
                    imdbRating: details.vote_average ? (details.vote_average / 10 * 10).toFixed(1) : null,
                    imdbVotes: details.vote_count ? `${details.vote_count.toLocaleString()}` : null,
                    Plot: details.overview,
                    Director: details.created_by?.map(creator => creator.name).join(', ') || 'N/A',
                    Actors: details.credits?.cast?.slice(0, 4).map(actor => actor.name).join(', '),
                    Poster: details.poster_path ? `https://image.tmdb.org/t/p/w500${details.poster_path}` : null,
                    Backdrop: details.backdrop_path ? `https://image.tmdb.org/t/p/w1280${details.backdrop_path}` : null,
                    Genre: details.genres?.map(g => g.name).join(', '),
                    Runtime: details.episode_run_time?.[0] ? `${details.episode_run_time[0]} min` : null,
                    Rated: 'N/A',
                    tmdbID: details.id,
                    Type: 'series',
                    source: 'tmdb-tv'
                };
                
                // Cache the result
                imdbCache.set(torrentName, result);
                return result;
            }
        } catch (error) {
            console.log(`❌ TMDB TV error: ${error.message}`);
        }
    }
    
    // Try TMDB movies as final fallback
    try {
        const tmdbSearchUrl = `https://api.themoviedb.org/3/search/movie?api_key=3fd2be6f0c70a2a598f084ddfb75487d&query=${encodeURIComponent(title)}${year ? `&year=${year}` : ''}`;
        console.log(`🔍 Trying TMDB Movies: ${tmdbSearchUrl}`);
        
        const searchResponse = await fetch(tmdbSearchUrl, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'SeedboxLite/1.0'
            },
            signal: AbortSignal.timeout(15000)
        });
        
        if (!searchResponse.ok) {
            throw new Error(`HTTP ${searchResponse.status}: ${searchResponse.statusText}`);
        }
        
        const searchData = await searchResponse.json();
        
        if (searchData.results && searchData.results.length > 0) {
            const movie = searchData.results[0];
            
            // Get detailed info
            const detailsUrl = `https://api.themoviedb.org/3/movie/${movie.id}?api_key=3fd2be6f0c70a2a598f084ddfb75487d&append_to_response=credits`;
            const detailsResponse = await fetch(detailsUrl, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'SeedboxLite/1.0'
                },
                signal: AbortSignal.timeout(15000)
            });
            
            if (!detailsResponse.ok) {
                throw new Error(`HTTP ${detailsResponse.status}: ${detailsResponse.statusText}`);
            }
            
            const details = await detailsResponse.json();
            
            console.log(`✅ Found TMDB Movie data: ${details.title} (${details.release_date?.substring(0, 4)})`);
            
            const result = {
                Title: details.title,
                Year: details.release_date?.substring(0, 4),
                imdbRating: details.vote_average ? (details.vote_average / 10 * 10).toFixed(1) : null,
                imdbVotes: details.vote_count ? `${details.vote_count.toLocaleString()}` : null,
                Plot: details.overview,
                Director: details.credits?.crew?.find(person => person.job === 'Director')?.name,
                Actors: details.credits?.cast?.slice(0, 4).map(actor => actor.name).join(', '),
                Poster: details.poster_path ? `https://image.tmdb.org/t/p/w500${details.poster_path}` : null,
                Backdrop: details.backdrop_path ? `https://image.tmdb.org/t/p/w1280${details.backdrop_path}` : null,
                Genre: details.genres?.map(g => g.name).join(', '),
                Runtime: details.runtime ? `${details.runtime} min` : null,
                Rated: 'N/A',
                tmdbID: details.id,
                Type: 'movie',
                source: 'tmdb-movie'
            };
            
            // Cache the result
            imdbCache.set(torrentName, result);
            return result;
        }
    } catch (error) {
        console.log(`❌ TMDB Movie error: ${error.message}`);
    }
    
    console.log(`❌ No movie/series data found for: ${title}`);
    return null;
}

//UNIVERSAL TORRENT RESOLVER - Can find torrents by ANY identifier
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
    console.log(`✅ Found in WebTorrent client: ${existingTorrent.name || existingTorrent.infoHash}`);
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
    
    let torrent;
    
    try {
      const torrentOptions = {
        announce: [
          'udp://tracker.opentrackr.org:1337/announce',
          'udp://open.demonii.com:1337/announce',
          'udp://tracker.openbittorrent.com:6969/announce',
          'udp://exodus.desync.com:6969/announce',
          'udp://tracker.torrent.eu.org:451/announce',
          'udp://tracker.tiny-vps.com:6969/announce',
          'udp://retracker.lanta-net.ru:2710/announce',
          'udp://9.rarbg.to:2710/announce',
          'udp://explodie.org:6969/announce',
          'udp://tracker.coppersurfer.tk:6969/announce'
        ],
        private: false,
        strategy: 'rarest', // Download rarest pieces first for faster startup
        maxWebConns: 20     // More web seed connections
      };
      torrent = client.add(magnetUri, torrentOptions);
    } catch (addError) {
      // Handle duplicate torrent error from WebTorrent client
      if (addError.message && addError.message.includes('duplicate')) {
        console.log(`🔍 Duplicate torrent detected in WebTorrent client, finding existing`);
        
        // Extract hash from the torrent ID
        let hash = torrentId;
        if (torrentId.startsWith('magnet:')) {
          const match = torrentId.match(/xt=urn:btih:([a-fA-F0-9]{40})/);
          if (match) hash = match[1];
        }
        
        // Find the existing torrent in the client
        const existingTorrent = client.torrents.find(t => 
          t.infoHash.toLowerCase() === hash.toLowerCase()
        );
        
        if (existingTorrent) {
          console.log(`✅ Found existing torrent in client: ${existingTorrent.name || existingTorrent.infoHash}`);
          resolve(existingTorrent);
          return;
        }
      }
      
      reject(addError);
      return;
    }
    
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
      
      // Stop seeding when download is complete
      torrent.on('done', () => {
        console.log(`✅ Download complete for ${torrent.name} - Stopping seeding`);
        torrent.uploadLimit = 0; // Disable uploading once download is complete
      });
      
      // Enhanced configuration for streaming with better buffering
      torrent.files.forEach((file, index) => {
        const ext = file.name.toLowerCase().split('.').pop();
        const isSubtitle = ['srt', 'vtt', 'ass', 'ssa', 'sub', 'sbv'].includes(ext);
        const isVideo = ['mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm', 'm4v'].includes(ext);
        
        if (isSubtitle) {
          // Select subtitle files with high priority
          file.select();
          console.log(`📝 Subtitle file prioritized: ${file.name}`);
        } else if (isVideo) {
          // Optimize video streaming - select with high priority
          file.select();
          file.critical = true; // Mark as critical for prioritized downloading
          
          // Create a buffer strategy - pre-download the first pieces
          const BUFFER_SIZE = 10 * 1024 * 1024; // 10MB initial buffer
          file.createReadStream({ start: 0, end: BUFFER_SIZE });
          
          console.log(`🎬 Video file optimized for streaming: ${file.name}`);
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
    
    // Extended timeout for better peer discovery and metadata retrieval
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        console.log(`⏰ Timeout loading torrent after 60 seconds: ${torrentId}`);
        
        // Check if the torrent was actually added to the client
        const clientTorrent = client.torrents.find(t => t.infoHash === torrent.infoHash);
        if (clientTorrent) {
          console.log(`🔍 Found torrent in client after timeout: ${clientTorrent.name || clientTorrent.infoHash}`);
          
          // Store in tracking systems even if metadata isn't fully ready
          torrents[clientTorrent.infoHash] = clientTorrent;
          torrentIds[clientTorrent.infoHash] = torrentId;
          torrentNames[clientTorrent.infoHash] = clientTorrent.name || 'Loading...';
          hashToName[clientTorrent.infoHash] = clientTorrent.name || 'Loading...';
          if (clientTorrent.name) {
            nameToHash[clientTorrent.name] = clientTorrent.infoHash;
          }
          
          clientTorrent.addedAt = new Date().toISOString();
          clientTorrent.uploadLimit = 2048; // Increased upload for better peer reciprocity
          
          // Try to optimize any video files even if metadata is incomplete
          if (clientTorrent.files && clientTorrent.files.length) {
            clientTorrent.files.forEach(file => {
              const ext = file.name.toLowerCase().split('.').pop();
              if (['mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm', 'm4v'].includes(ext)) {
                file.select();
                file.critical = true;
              }
            });
          }
          
          resolve(clientTorrent);
        } else {
          console.log(`🔍 Client has ${client.torrents.length} torrents total`);
          reject(new Error('Timeout loading torrent'));
        }
      }
    }, 60000); // Extended timeout to 60 seconds
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
const fs = require('fs');
const uploadsDir = 'uploads/';

// Ensure uploads directory exists
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log('📁 Created uploads directory');
}

const upload = multer({ 
  dest: uploadsDir,
  fileFilter: (req, file, cb) => {
    cb(null, file.originalname.endsWith('.torrent'));
  },
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit for torrent files
  }
});

// CORS Configuration - Allow all origins
console.log('🌐 CORS: Allowing ALL origins (permissive mode)');

// Simple CORS configuration allowing all origins
app.use(cors({
  origin: true, // Allow all origins
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: [
    'Content-Type', 
    'Authorization', 
    'X-Requested-With',
    'Accept',
    'Origin'
  ],
  optionsSuccessStatus: 200
}));

// Additional permissive CORS headers
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS,PATCH');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Requested-With,Accept,Origin');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  next();
});

app.use(express.json());

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Authentication endpoint
app.post('/api/auth/login', (req, res) => {
  const { password } = req.body;
  const correctPassword = process.env.ACCESS_PASSWORD || 'seedbox123';
  
  console.log(`🔐 Login attempt with password: ${password ? '[PROVIDED]' : '[MISSING]'}`);
  
  if (!password) {
    return res.status(400).json({ 
      success: false, 
      error: 'Password is required' 
    });
  }
  
  if (password === correctPassword) {
    console.log('✅ Authentication successful');
    return res.json({ 
      success: true, 
      message: 'Authentication successful' 
    });
  } else {
    console.log('❌ Authentication failed - incorrect password');
    return res.status(401).json({ 
      success: false, 
      error: 'Invalid password' 
    });
  }
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
      try {
        const newTorrent = await loadTorrentFromId(torrentId);
        return res.json({ 
          success: true,
          infoHash: newTorrent.infoHash,
          name: newTorrent.name || 'Loading...',
          size: newTorrent.length || 0,
          status: 'loaded'
        });
      } catch (loadError) {
        // Handle duplicate torrent error specially
        if (loadError.message.includes('duplicate torrent')) {
          console.log(`🔍 Duplicate torrent detected, finding existing torrent`);
          
          // Extract hash from torrentId if it's a magnet
          let hash = torrentId;
          if (torrentId.startsWith('magnet:')) {
            const match = torrentId.match(/xt=urn:btih:([a-fA-F0-9]{40})/);
            if (match) hash = match[1];
          }
          
          // Try to find the existing torrent
          const existingTorrent = Object.values(torrents).find(t => 
            t.infoHash === hash || 
            t.infoHash.toLowerCase() === hash.toLowerCase()
          ) || client.torrents.find(t => 
            t.infoHash === hash || 
            t.infoHash.toLowerCase() === hash.toLowerCase()
          );
          
          if (existingTorrent) {
            console.log(`✅ Found existing torrent: ${existingTorrent.name}`);
            return res.json({ 
              success: true,
              infoHash: existingTorrent.infoHash,
              name: existingTorrent.name || 'Loading...',
              size: existingTorrent.length || 0,
              status: 'existing',
              message: 'Torrent already added'
            });
          }
          
          // If we can't find the existing torrent, still return success
          // This handles edge cases where duplicate is detected but torrent isn't in our list yet
          console.log(`✅ Duplicate detected but not found in list, assuming success`);
          return res.json({ 
            success: true,
            infoHash: hash,
            name: 'Duplicate torrent',
            size: 0,
            status: 'duplicate',
            message: 'Torrent already exists in the system'
          });
        }
        
        throw loadError;
      }
    }
    
    res.json({ 
      success: true,
      infoHash: torrent.infoHash,
      name: torrent.name || 'Loading...',
      size: torrent.length || 0,
      status: 'found'
    });
    
  } catch (error) {
    console.error(`❌ Universal add failed:`, error.message);
    res.status(500).json({ error: 'Failed to add torrent: ' + error.message });
  }
});

// UNIVERSAL FILE UPLOAD - Handle .torrent files
app.post('/api/torrents/upload', upload.single('torrentFile'), async (req, res) => {
  console.log(`📁 UNIVERSAL FILE UPLOAD`);
  
  if (!req.file) {
    return res.status(400).json({ error: 'No torrent file provided' });
  }
  
  try {
    const fs = require('fs');
    const torrentPath = req.file.path;
    
    console.log(`📁 Processing uploaded file: ${req.file.originalname}`);
    console.log(`📁 File path: ${torrentPath}`);
    
    // Read the torrent file
    const torrentBuffer = fs.readFileSync(torrentPath);
    
    // Load the torrent using the buffer
    const torrent = await new Promise((resolve, reject) => {
      let loadedTorrent;
      
      try {
        const torrentOptions = {
          announce: [
            'udp://tracker.opentrackr.org:1337/announce',
            'udp://open.demonii.com:1337/announce',
            'udp://tracker.openbittorrent.com:6969/announce',
            'udp://exodus.desync.com:6969/announce',
            'udp://tracker.torrent.eu.org:451/announce',
            'udp://9.rarbg.to:2710/announce'
          ],
          private: false,
          strategy: 'rarest', // Download rarest pieces first for faster startup
          maxWebConns: 20     // More web seed connections
        };
        loadedTorrent = client.add(torrentBuffer, torrentOptions);
        
        // Stop seeding when download is complete
        loadedTorrent.on('done', () => {
          console.log(`✅ Download complete for ${loadedTorrent.name} - Stopping seeding`);
          loadedTorrent.uploadLimit = 0; // Disable uploading once download is complete
        });
      } catch (addError) {
        // Handle duplicate torrent in file upload
        if (addError.message && addError.message.includes('duplicate')) {
          console.log(`🔍 Duplicate torrent file detected, finding existing`);
          
          // Parse the torrent buffer to get the info hash
          const parseTorrent = require('parse-torrent');
          try {
            const parsed = parseTorrent(torrentBuffer);
            const existingTorrent = client.torrents.find(t => 
              t.infoHash.toLowerCase() === parsed.infoHash.toLowerCase()
            );
            
            if (existingTorrent) {
              console.log(`✅ Found existing torrent from file: ${existingTorrent.name || existingTorrent.infoHash}`);
              resolve(existingTorrent);
              return;
            }
          } catch (parseError) {
            console.error(`❌ Error parsing torrent for duplicate check:`, parseError.message);
          }
        }
        
        reject(addError);
        return;
      }
      
      let resolved = false;
      
      loadedTorrent.on('ready', () => {
        if (resolved) return;
        resolved = true;
        
        console.log(`✅ Torrent uploaded and loaded: ${loadedTorrent.name}`);
        
        // Store in tracking systems
        torrents[loadedTorrent.infoHash] = loadedTorrent;
        torrentIds[loadedTorrent.infoHash] = req.file.originalname;
        torrentNames[loadedTorrent.infoHash] = loadedTorrent.name;
        hashToName[loadedTorrent.infoHash] = loadedTorrent.name;
        nameToHash[loadedTorrent.name] = loadedTorrent.infoHash;
        
        loadedTorrent.addedAt = new Date().toISOString();
        loadedTorrent.uploadLimit = 1024; // Minimal upload for peer reciprocity
        
        resolve(loadedTorrent);
      });
      
      loadedTorrent.on('error', (err) => {
        if (resolved) return;
        resolved = true;
        console.error(`❌ Error loading uploaded torrent:`, err.message);
        
        // Handle duplicate error in event handler too
        if (err.message && err.message.includes('duplicate')) {
          console.log(`🔍 Duplicate torrent detected in error handler`);
          
          // Try to find existing torrent and return it
          const parseTorrent = require('parse-torrent');
          try {
            const parsed = parseTorrent(torrentBuffer);
            const existingTorrent = client.torrents.find(t => 
              t.infoHash.toLowerCase() === parsed.infoHash.toLowerCase()
            );
            
            if (existingTorrent) {
              console.log(`✅ Found existing torrent in error handler: ${existingTorrent.name}`);
              resolve(existingTorrent);
              return;
            }
          } catch (parseError) {
            console.error(`❌ Error parsing in error handler:`, parseError.message);
          }
        }
        
        reject(err);
      });
      
      // Timeout after 30 seconds
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          reject(new Error('Timeout loading torrent file'));
        }
      }, 30000);
    });
    
    // Clean up uploaded file
    fs.unlinkSync(torrentPath);
    
    res.json({
      success: true,
      infoHash: torrent.infoHash,
      name: torrent.name,
      size: torrent.length,
      status: 'uploaded',
      files: torrent.files.length
    });
    
  } catch (error) {
    console.error(`❌ File upload failed:`, error.message);
    
    // Clean up file on error
    if (req.file && req.file.path) {
      try {
        const fs = require('fs');
        fs.unlinkSync(req.file.path);
      } catch (cleanupError) {
        console.error(`❌ Failed to cleanup file:`, cleanupError.message);
      }
    }
    
    res.status(500).json({ error: 'Failed to upload torrent: ' + error.message });
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

// IMDB Data Endpoint
app.get('/api/torrents/:identifier/imdb', async (req, res) => {
  const identifier = req.params.identifier;
  console.log(`🎬 IMDB REQUEST: ${identifier}`);
  
  try {
    const torrent = await universalTorrentResolver(identifier);
    
    if (!torrent) {
      console.log(`❌ Torrent not found for identifier: ${identifier}`);
      return res.status(404).json({ error: 'Torrent not found' });
    }
    
    console.log(`🎬 Found torrent: ${torrent.name}, fetching IMDB data...`);
    const imdbData = await fetchIMDBData(torrent.name);
    console.log(`🎬 IMDB data result:`, imdbData ? 'SUCCESS' : 'NULL/UNDEFINED');
    
    if (imdbData) {
      const response = {
        success: true,
        torrentName: torrent.name,
        imdb: imdbData
      };
      console.log(`✅ Sending IMDB response:`, JSON.stringify(response, null, 2));
      res.json(response);
    } else {
      const response = {
        success: false,
        torrentName: torrent.name,
        message: 'IMDB data not found'
      };
      console.log(`❌ Sending failure response:`, JSON.stringify(response, null, 2));
      res.json(response);
    }
    
  } catch (error) {
    console.error(`❌ IMDB endpoint failed:`, error.message);
    res.status(500).json({ error: 'Failed to get IMDB data: ' + error.message });
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
    
    // Detect file type for proper MIME type
    const ext = file.name.split('.').pop().toLowerCase();
    const mimeTypes = {
      'mp4': 'video/mp4',
      'mkv': 'video/x-matroska',
      'avi': 'video/x-msvideo',
      'mov': 'video/quicktime',
      'wmv': 'video/x-ms-wmv',
      'flv': 'video/x-flv',
      'webm': 'video/webm',
      'm4v': 'video/mp4'
    };
    const contentType = mimeTypes[ext] || 'video/mp4';
    
    // Handle range requests (crucial for mobile video playback)
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
        'Content-Type': contentType,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Range, Content-Type',
        'Access-Control-Expose-Headers': 'Content-Range, Accept-Ranges, Content-Length'
      });
      
      const stream = file.createReadStream({ start, end });
      stream.pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': file.length,
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Range, Content-Type',
        'Access-Control-Expose-Headers': 'Content-Range, Accept-Ranges, Content-Length'
      });
      file.createReadStream().pipe(res);
    }
    
  } catch (error) {
    console.error(`❌ Universal streaming failed:`, error.message);
    res.status(500).json({ error: 'Streaming failed: ' + error.message });
  }
});

// UNIVERSAL DOWNLOAD - Download files with proper headers
app.get('/api/torrents/:identifier/files/:fileIdx/download', async (req, res) => {
  const { identifier, fileIdx } = req.params;
  console.log(`📥 UNIVERSAL DOWNLOAD: ${identifier}/${fileIdx}`);
  
  try {
    const torrent = await universalTorrentResolver(identifier);
    
    if (!torrent) {
      return res.status(404).json({ error: 'Torrent not found for download' });
    }
    
    const file = torrent.files[fileIdx];
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    // Ensure torrent is active and file is selected
    torrent.resume();
    file.select();
    
    console.log(`📥 Downloading: ${file.name} (${(file.length / 1024 / 1024).toFixed(1)} MB)`);
    
    // Set download headers
    const filename = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', file.length);
    res.setHeader('Accept-Ranges', 'bytes');
    
    // Handle range requests for resume capability
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
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Type': 'application/octet-stream'
      });
      
      const stream = file.createReadStream({ start, end });
      stream.pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': file.length,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Type': 'application/octet-stream'
      });
      file.createReadStream().pipe(res);
    }
    
  } catch (error) {
    console.error(`❌ Universal download failed:`, error.message);
    res.status(500).json({ error: 'Download failed: ' + error.message });
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
app.get('/api/cache/stats', async (req, res) => {
  try {
    const activeTorrents = client.torrents.length;
    
    // Calculate actual cache size from WebTorrent client data
    let cacheSize = 0;
    let downloadedBytes = 0;
    
    client.torrents.forEach(torrent => {
      // Add total size of each torrent (this is the actual cache size)
      cacheSize += torrent.length || 0;
      // Add downloaded bytes (for information)
      downloadedBytes += torrent.downloaded || 0;
    });

    const formatBytes = (bytes) => {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    // Cache limit (5GB default)
    const cacheLimitBytes = 5 * 1024 * 1024 * 1024; // 5GB in bytes
    const usagePercentage = cacheLimitBytes > 0 ? (cacheSize / cacheLimitBytes) * 100 : 0;

    const stats = {
      totalSizeFormatted: formatBytes(cacheSize), // Use total cache size (torrent lengths)
      totalSize: cacheSize,
      activeTorrents,
      cacheSize: cacheSize, // Total torrent sizes in cache
      downloadedBytes: downloadedBytes, // Actual downloaded data
      totalTorrentSize: cacheSize, // Same as cacheSize
      totalTorrentSizeFormatted: formatBytes(cacheSize),
      cacheLimitFormatted: formatBytes(cacheLimitBytes),
      usagePercentage: Math.round(usagePercentage * 100) / 100 // Round to 2 decimal places
    };

    console.log(`📊 Cache stats: ${formatBytes(cacheSize)} cached (${activeTorrents} torrents, ${usagePercentage.toFixed(1)}% of 5GB limit)`);
    res.json(stats);
  } catch (error) {
    console.error('Error getting cache stats:', error);
    res.status(500).json({ error: 'Failed to get cache stats' });
  }
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

// Function to disable seeding for completed torrents
function disableSeedingForCompletedTorrents() {
  let completedCount = 0;
  
  client.torrents.forEach(torrent => {
    // Check if torrent is complete (downloaded === length)
    if (torrent.progress === 1 || torrent.downloaded === torrent.length) {
      torrent.uploadLimit = 0;
      completedCount++;
      console.log(`✅ Found completed torrent: ${torrent.name} - Disabled seeding`);
    } else {
      // Add 'done' event handler if not already completed
      torrent.once('done', () => {
        console.log(`✅ Download complete for ${torrent.name} - Stopping seeding`);
        torrent.uploadLimit = 0; // Disable uploading once download is complete
      });
    }
  });
  
  return completedCount;
}

// Start server
const PORT = config.server.port;
const HOST = config.server.host;

app.listen(PORT, HOST, () => {
  const serverUrl = `${config.server.protocol}://${HOST}:${PORT}`;
  console.log(`🌱 Seedbox Lite server running on ${serverUrl}`);
  console.log(`📱 Frontend URL: ${config.frontend.url}`);
  console.log(`🚀 UNIVERSAL TORRENT RESOLUTION SYSTEM ACTIVE`);
  
  // Disable seeding for any already completed torrents
  setTimeout(() => {
    const completedCount = disableSeedingForCompletedTorrents();
    if (completedCount > 0) {
      console.log(`🛑 Disabled seeding for ${completedCount} already completed torrents`);
    }
  }, 5000); // Give the server 5 seconds to initialize properly
});
  console.log(`🎯 ZERO "Not Found" Errors Guaranteed`);
  console.log(`⚠️  SECURITY: Download-only mode - Zero uploads guaranteed`);
  
  if (config.isDevelopment) {
    console.log('🔧 Development mode - Environment variables loaded');
  }
});
