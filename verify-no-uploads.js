#!/usr/bin/env node

/**
 * Network Upload Verification Script
 * This script monitors network activity to ensure zero uploads
 */

const fs = require('fs');
const { spawn } = require('child_process');

console.log('🔍 TORRENT UPLOAD VERIFICATION STARTED');
console.log('======================================');

// Function to check upload stats from WebTorrent client
async function verifyWebTorrentConfig() {
  console.log('\n📋 WebTorrent Configuration Check:');
  
  try {
    const serverConfig = fs.readFileSync('./server-new/index.js', 'utf8');
    
    const checks = [
      { pattern: 'uploadLimit: 0', name: 'Upload Limit Set to 0' },
      { pattern: 'dht: false', name: 'DHT Disabled' },
      { pattern: 'lsd: false', name: 'Local Service Discovery Disabled' },
      { pattern: 'pex: false', name: 'Peer Exchange Disabled' },
      { pattern: 'upload: false', name: 'Upload Flag Disabled' },
      { pattern: 'tracker: false', name: 'Tracker Communication Disabled' },
      { pattern: 'announce: \\[\\]', name: 'Announce List Empty' }
    ];
    
    checks.forEach(check => {
      const found = new RegExp(check.pattern).test(serverConfig);
      console.log(`${found ? '✅' : '❌'} ${check.name}: ${found ? 'CONFIGURED' : 'MISSING'}`);
    });
    
    // Check for upload blocking code
    const hasUploadBlocking = serverConfig.includes('upload attempt detected') || 
                              serverConfig.includes('BLOCKED: Upload attempt') ||
                              serverConfig.includes('Monitor and block any upload');
    console.log(`${hasUploadBlocking ? '✅' : '❌'} Upload Blocking Code: ${hasUploadBlocking ? 'ACTIVE' : 'MISSING'}`);
    
  } catch (error) {
    console.error('❌ Error reading server configuration:', error.message);
  }
}

// Function to monitor network activity (macOS specific)
function monitorNetworkActivity() {
  console.log('\n📊 Network Monitoring (10 seconds):');
  console.log('Watching for any upload activity...');
  
  const netstat = spawn('netstat', ['-b', '-I', 'en0', '1']);
  let sampleCount = 0;
  let lastOutBytes = 0;
  
  netstat.stdout.on('data', (data) => {
    const output = data.toString();
    const lines = output.split('\n');
    
    for (const line of lines) {
      if (line.includes('en0')) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 10) {
          const outBytes = parseInt(parts[9]) || 0;
          
          if (sampleCount > 0 && lastOutBytes > 0) {
            const uploadRate = outBytes - lastOutBytes;
            if (uploadRate > 1000) { // More than 1KB upload
              console.log(`⚠️  Upload detected: ${uploadRate} bytes/sec`);
            }
          }
          
          lastOutBytes = outBytes;
          sampleCount++;
          
          if (sampleCount >= 10) {
            netstat.kill();
          }
        }
      }
    }
  });
  
  netstat.on('close', () => {
    console.log('✅ Network monitoring completed');
    console.log('\n🎯 VERIFICATION COMPLETE');
    console.log('If no upload warnings appeared above, your configuration is secure.');
  });
}

// Run verification
async function runVerification() {
  await verifyWebTorrentConfig();
  
  console.log('\n🚀 Starting network monitoring...');
  console.log('(This will run for 10 seconds to check for uploads)');
  
  monitorNetworkActivity();
}

runVerification().catch(console.error);
