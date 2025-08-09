#!/bin/bash

# Production build script
echo "🔨 Building frontend for production..."

# Set production environment
export NODE_ENV=production
export VITE_API_BASE_URL=https://seedbox-api.isalman.dev

# Build the project
npm run build

echo "✅ Production build complete!"
echo "📦 Built files are in the 'dist' directory"
echo "🌐 API Base URL: ${VITE_API_BASE_URL}"
