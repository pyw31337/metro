# Agent & Codex Architecture & Design System Rules

> **[MANDATORY DESIGN SYSTEM COMPLIANCE - LDS v2.5.0]**  
> 모든 프론트엔드 UI/시안/컴포넌트 작성 시 반드시 `docs/LETS_DESIGN_SYSTEM.md`를 100% 최우선 참조하여 작성하십시오. 구닥다리 템플릿이나 획일적인 좁은 박스형 시안을 작성하는 행위는 엄격히 금지됩니다.

## 1. 렛츠 패밀리 핵심 디자인 원칙 (LDS v2.5.0)

1. **와이드 풀위드(Full-Width) & 히어로존 필수**:
   - 상단 헤더와 내비게이션, 주요 대시보드는 좌우 가로폭을 시원하게 꽉 채우는 풀위드(Width: 100%, Max-Width: 1600px+) 레이아웃으로 설계합니다.
   - 상단에는 서비스의 정체성을 웅장하게 드러내는 **와이드 히어로존 (Wide Hero Section)**을 반드시 배치하십시오.
2. **타이포그래피 극명한 강약 대비 (900 Black vs 300 Light)**:
   - 핵심 헤드라인과 수치는 초대형 font-weight `900` (Black / Heavy)으로 압도적인 스케일감을 부여합니다.
   - 보조 설명과 단위는 font-weight `300` (Light)으로 섬세하게 대비시켜, 오밀조밀하게 균일한 크기로 채우지 마십시오.
3. **여백(Whitespace) 기반 공간 구획**:
   - 불필요한 구분선(border)이나 칙칙한 회색 배경 상자를 남발하지 마십시오.
   - 섹션 간 넉넉한 여백(`56px ~ 80px`)을 주어 시원한 호흡감과 여백으로 내용이 자연스럽게 구분되도록 설계하십시오.
4. **100% 정밀 인라인 SVG 아이콘**:
   - 이모지(Emoji)를 일체 사용하지 말고, 모던한 인라인 벡터 SVG 스트로크 아이콘을 적용하십시오.
5. **서피스 플러시(Flush Surface)**:
   - 평상시 카드는 `box-shadow: none; border: 1px solid rgba(0,0,0,0.06);`로 서피스에 단정하게 안착시키고, 마우스 호버 시에만 리프트 반응을 부여하십시오.

---

## 2. Agent Handoff & Automation Rules

Before changing automation, read `WORKFLOW_HANDOFF.md` and the canonical private handoff repository: https://github.com/pyw31337/macmini-workflow-handoff

When changing `.github/workflows/`, schedules, deployment triggers, secret names, or local scheduler replacements:
1. Preserve the existing trigger and rollback behavior unless the task explicitly changes it.
2. Update `WORKFLOW_HANDOFF.md` in this repository.
3. Update the canonical handoff inventory via its scheduled/manual sync workflow.
4. Never commit secret values, `.env` files, tokens, cookies, or machine-specific paths.
