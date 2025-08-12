import { fetchWithTimeout, createBackoffFetcher } from '../utils/fetchWithTimeout';

// Get the API base URL from environment variables
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

/**
 * Get the list of all torrents
 */
export const getTorrents = async () => {
  try {
    const response = await fetchWithTimeout(`${API_BASE_URL}/api/torrents`, {}, 5000);
    return await response.json();
  } catch (error) {
    console.error('Error fetching torrents:', error);
    throw error;
  }
};

/**
 * Get detailed information about a specific torrent
 * @param {string} id - Torrent ID or info hash
 */
export const getTorrentDetails = async (id) => {
  try {
    const response = await fetchWithTimeout(`${API_BASE_URL}/api/torrents/${id}`, {}, 10000);
    return await response.json();
  } catch (error) {
    console.error(`Error fetching details for torrent ${id}:`, error);
    throw error;
  }
};

/**
 * Get statistics for a specific torrent
 * @param {string} id - Torrent ID or info hash
 */
export const getTorrentStats = async (id) => {
  try {
    const response = await fetchWithTimeout(`${API_BASE_URL}/api/torrents/${id}/stats`, {}, 5000);
    return await response.json();
  } catch (error) {
    console.error(`Error fetching stats for torrent ${id}:`, error);
    throw error;
  }
};

/**
 * Get files for a specific torrent
 * @param {string} id - Torrent ID or info hash
 */
export const getTorrentFiles = async (id) => {
  try {
    const response = await fetchWithTimeout(`${API_BASE_URL}/api/torrents/${id}/files`, {}, 8000);
    return await response.json();
  } catch (error) {
    console.error(`Error fetching files for torrent ${id}:`, error);
    throw error;
  }
};

/**
 * Add a new torrent
 * @param {string} torrentId - Magnet URI or torrent info hash
 */
export const addTorrent = async (torrentId) => {
  try {
    const response = await fetchWithTimeout(`${API_BASE_URL}/api/torrents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ torrentId }),
    }, 15000);
    
    return await response.json();
  } catch (error) {
    console.error('Error adding torrent:', error);
    throw error;
  }
};

/**
 * Delete a torrent
 * @param {string} id - Torrent ID or info hash
 */
export const deleteTorrent = async (id) => {
  try {
    const response = await fetchWithTimeout(`${API_BASE_URL}/api/torrents/${id}`, {
      method: 'DELETE',
    }, 10000);
    
    return await response.json();
  } catch (error) {
    console.error(`Error deleting torrent ${id}:`, error);
    throw error;
  }
};

/**
 * Get the URL for streaming a file from a torrent
 * @param {string} torrentId - Torrent ID or info hash
 * @param {number} fileIndex - File index
 */
export const getStreamUrl = (torrentId, fileIndex) => {
  return `${API_BASE_URL}/api/torrents/${torrentId}/files/${fileIndex}/stream`;
};

/**
 * Get IMDB data for a torrent
 * @param {string} id - Torrent ID or info hash
 */
export const getImdbData = async (id) => {
  try {
    const response = await fetchWithTimeout(`${API_BASE_URL}/api/torrents/${id}/imdb`, {}, 10000);
    return await response.json();
  } catch (error) {
    console.error(`Error fetching IMDB data for torrent ${id}:`, error);
    throw error;
  }
};

/**
 * Check server health
 */
export const checkServerHealth = async () => {
  try {
    const response = await fetchWithTimeout(`${API_BASE_URL}/api/system/health`, {}, 5000);
    return await response.json();
  } catch (error) {
    console.error('Error checking server health:', error);
    throw error;
  }
};

// Create enhanced fetchers with retry logic
export const getTorrentsWithRetry = createBackoffFetcher(getTorrents);
export const getTorrentDetailsWithRetry = (id) => createBackoffFetcher(() => getTorrentDetails(id))();
export const getTorrentStatsWithRetry = (id) => createBackoffFetcher(() => getTorrentStats(id))();
