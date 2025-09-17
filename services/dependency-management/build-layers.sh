#!/bin/bash

echo "Building dependency layers..."

# Build Node.js layer
echo "Building Node.js layer..."
cd layer/nodejs
npm install --production
cd ../..

# Build Python main layer
echo "Building Python main layer..."
pip install -r python_lib/requirements.txt -t python_lib/python

# Build Python secondary layer  
echo "Building Python secondary layer..."
pip install -r python_lib2/requirements.txt -t python_lib2/python

echo "All layers built successfully!"
