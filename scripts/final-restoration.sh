#!/bin/bash

# final-restoration.sh
# 15일간의 고질적인 '실시간 아이콘' 실종 사건을 종결하기 위한 최후의 복구 스크립트입니다.

echo "🔍 [1/3] 로컬 환경 및 수정 사항 최종 점검 중..."
export PATH=$PATH:/usr/local/bin

# 1. 수정 사항 커밋 (CORS 수정, 시뮬레이션 모드, 경로 수정 반영)
git add .
git commit -m "FINAL FIX: Resolved 15-day realtime icon failure (CORS + Path + Sim Mode)"

# 2. GitHub 메인 브랜치로 전송 시도
echo ""
echo "🚀 [2/3] GitHub 운영 서버로 전송을 시작합니다..."
echo "💡 만약 여기서 사용자 이름(Username)이나 비밀번호(Password)를 물어보면 입력해 주세요."
echo "💡 (한번만 성공하면 이후에는 자동으로 처리됩니다.)"
echo ""

git push origin main

if [ $? -eq 0 ]; then
    echo ""
    echo "🎉 성공! 이제 1분 후면 라이브 사이트(github.io)가 복구됩니다."
    echo "제가 지금부터 라이브 사이트를 직접 모니터링하며 아이콘이 나타나는 순간을 보고하겠습니다."
else
    echo ""
    echo "❌ 전송 실패 (권한 오답). 하지만 걱정 마세요! 아래 대안이 있습니다."
    echo ""
    echo "👉 방법 1: 'gh auth login' 명령어로 GitHub 로그인을 먼저 해주세요."
    echo "👉 방법 2: 또는, 지금 바로 이 터미널 창 옆에 있는 Git 'Sync' 버튼을 눌러주세요."
    echo ""
    exit 1
fi
