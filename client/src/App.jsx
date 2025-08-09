import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import HomePage from './components/HomePage';
import TorrentPage from './components/TorrentPage';
import RecentPage from './components/RecentPage';
import SettingsPage from './components/SettingsPage';
import CacheManagementPage from './components/CacheManagementPage';
import './App.css';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<HomePage />} />
          <Route path="torrent/:torrentHash" element={<TorrentPage />} />
          <Route path="recent" element={<RecentPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="cache" element={<CacheManagementPage />} />
        </Route>
      </Routes>
    </Router>
  );
}

export default App;
