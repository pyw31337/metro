#!/bin/bash

# deploy-all.sh
# Nationwide Data Ingestion -> Build -> Deploy (npm run deploy: gh-pages)
# 참고: 운영 배포는 main push 시 .github/workflows/pages.yml 이 자동으로 수행한다.

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

echo "🌐 [3/3] Deploying (npm run deploy)..."
npm run deploy

if [ $? -eq 0 ]; then
    echo "🎉 ALL DONE! Your nationwide transit database is LIVE."
else
    echo "❌ Deployment Failed."
    exit 1
fi
