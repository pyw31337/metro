#!/bin/bash

# deploy-all.sh
# Nationwide Data Ingestion -> Build -> Firebase Deployment Automation

# Set current directory
cd /Users/pyw31337/Developer/subway

echo "🚀 [1/3] Starting Nationwide Data Ingestion..."
npm run process-data

if [ $? -eq 0 ]; then
    echo "✅ Data Ingestion Complete."
else
    echo "❌ Data Ingestion Failed. Aborting."
    exit 1
fi

echo "🏗️ [2/3] Building Optimized Production Assets..."
npm run build

if [ $? -eq 0 ]; then
    echo "✅ Build Complete."
else
    echo "❌ Build Failed. Aborting."
    exit 1
fi

echo "🌐 [3/3] Deploying to Firebase Hosting..."
npm run deploy

if [ $? -eq 0 ]; then
    echo "🎉 ALL DONE! Your nationwide transit database is LIVE."
else
    echo "❌ Deployment Failed. Please check if you have run 'npx -y firebase-tools login' and 'npx -y firebase-tools use --add'."
    exit 1
fi
