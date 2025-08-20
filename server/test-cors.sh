#!/bin/bash

echo "🧪 Testing CORS configuration..."
echo ""

# Test OPTIONS request (preflight)
echo "1. Testing OPTIONS preflight request:"
curl -X OPTIONS \
  -H "Origin: https://seedbox.<domain>" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type" \
  -v \
  https://seedbox-api.<domain>/api/auth/login

echo ""
echo "2. Testing actual POST request:"
curl -X POST \
  -H "Origin: https://seedbox.<domain>" \
  -H "Content-Type: application/json" \
  -d '{"password":"test"}' \
  -v \
  https://seedbox-api.<domain>/api/auth/login

echo ""
echo "3. Testing health endpoint:"
curl -H "Origin: https://seedbox.<domain>" \
  -v \
  https://seedbox-api.<domain>/api/health
