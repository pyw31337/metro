#!/bin/bash

# final-restoration-v2.sh
# GitHub Pages와 Firebase 양쪽의 문제를 모두 해결하고 배포하는 최종 스크립트입니다.

echo "🔍 [1/3] 최종 코드 수정 사항 반영 및 빌드 중..."
export PATH=$PATH:/usr/local/bin

# 1. GitHub용 빌드 (basePath: /metro)
echo "🏗️ GitHub용 빌드 시작..."
export NEXT_PUBLIC_DEPLOY_TARGET=github
npm run build
cp -r out out_github

# 2. Firebase용 빌드 (basePath: '')
echo "🏗️ Firebase용 빌드 시작..."
export NEXT_PUBLIC_DEPLOY_TARGET=firebase
npm run build
cp -r out out_firebase

# 3. 소스 코드 커밋 및 전송
echo "🚀 [2/3] GitHub 메인 브랜치로 전송 시도..."
git add .
git commit -m "FIX: Production Proxy & White Screen (Multi-Target Build)"
echo "💡 여기서 멈춘다면 GitHub 비밀번호나 토큰을 입력해야 할 수도 있습니다."
git push origin main

if [ $? -eq 0 ]; then
    echo "✅ GitHub 전송 성공! (Action 빌드 후 1분 내 반영)"
else
    echo "⚠️ GitHub 전송 실패. IDE(Cursor)의 'Sync Changes' 버튼이나 'Push' 메뉴를 이용해 수동으로 올려주세요!"
fi

# 4. Firebase 배포 시도 (환경이 허락할 경우)
echo "🌐 [3/3] Firebase Hosting 배포 시도..."
rm -rf out && cp -r out_firebase out
npx firebase deploy --only hosting

if [ $? -eq 0 ]; then
    echo "✅ Firebase 배포 성공! (https://metro-live-2918e.web.app/)"
else
    echo "⚠️ Firebase 배포 실패. 수동으로 'npx firebase deploy'를 실행해 주세요."
fi

echo ""
echo "✨ 작업 완료! 제가 1분 후 라이브 사이트를 다시 점검하겠습니다."
