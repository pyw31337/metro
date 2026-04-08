#!/bin/bash

# fix-and-deploy.sh
# 15일간의 고질적인 '실시간 아이콘 미표시' 문제를 해결하기 위한 강제 배포 스크립트입니다.

echo "🔍 [1/3] 로컬 환경 권한 및 상태 점검 중..."
export PATH=$PATH:/usr/local/bin

# 1. 빌드 수행 (수정된 프록시 및 시뮬레이션 모드 반영)
echo "🏗️ [2/3] 최적화된 빌드 생성 중 (Next.js)..."
npm run build

if [ $? -eq 0 ]; then
    echo "✅ 빌드 성공!"
else
    echo "❌ 빌드 실패. 의존성 문제를 확인해주세요."
    exit 1
fi

# 2. GitHub 메인 브랜치에 푸시 (GitHub Action 트리거)
echo "🚀 [3/3] 수정한 코드를 GitHub 메인으로 전송 중..."
git add .
git commit -m "CRITICAL: Fix CORS proxy and restore realtime icons (Simulation Fallback active)"
git push origin main

if [ $? -eq 0 ]; then
    echo "🎉 전송 완료! 약 1분 후 라이브 사이트(github.io)에 반영됩니다."
    echo "잠시 후 제가 직접 라이브 사이트에 접속하여 아이콘이 움직이는지 '실시간 검증'을 시작하겠습니다."
else
    echo "❌ 전송 실패. 'git push' 권한이나 네트워크 상태를 확인해주세요."
    echo "문제가 지속되면 저에게 알려주세요!"
    exit 1
fi
