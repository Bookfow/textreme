# TeXTREME Converter — 프로젝트 아키텍처

## 1. 개요

**한글 PDF → EPUB 변환 서비스**
- AI 비전(Gemini 2.5 Flash)으로 PDF 페이지를 분석하여 리플로우 가능한 EPUB 생성
- 웹앱 우선 출시 (앱스토어 수수료 30% 회피)
- 건당 과금 모델 (구독 X)

## 2. 기술 스택

| 레이어 | 기술 | 이유 |
|--------|------|------|
| 프론트엔드 | Next.js 15 + TypeScript + Tailwind | 텍스트림과 동일 스택, SSR 지원 |
| AI 엔진 | Gemini 2.5 Flash API | 페이지당 2.1원, 한글 인식 우수 |
| EPUB 뷰어 | epub-viewer-lite.tsx (자체) | 텍스트림 뷰어에서 경량화 |
| 결제 | 토스페이먼츠 | 국내 PG, 수수료 3.5% |
| 호스팅 | Vercel | 자동 배포, Edge Functions |
| 스토리지 | Vercel Blob 또는 R2 | 임시 PDF/EPUB 저장 (24시간 후 삭제) |
| DB | 불필요 (초기) | Stateless 변환, 결제 로그만 Supabase |

## 3. 핵심 흐름

```
[사용자]
  │
  ├─ 1. PDF 업로드 (브라우저 → API Route)
  │     └─ 최대 50MB, 500페이지 제한
  │
  ├─ 2. 서버 처리 (API Route)
  │     ├─ pdf.js로 페이지별 이미지 렌더링 (PNG)
  │     ├─ Gemini API로 텍스트+구조 추출 (병렬 5페이지씩)
  │     ├─ 이미지 위치 감지 → PDF에서 이미지 직접 추출
  │     └─ EPUB 패키징 (text-to-epub)
  │
  ├─ 3. 미리보기 (10페이지 무료)
  │     └─ epub-viewer-lite로 브라우저 내 렌더링
  │
  └─ 4. 결제 → EPUB 다운로드
        └─ 토스페이먼츠 결제 완료 → 전체 EPUB 다운로드 링크
```

## 4. API 설계

### POST /api/convert
- 입력: FormData (PDF file)
- 응답: SSE (Server-Sent Events) 스트림
  ```
  data: {"type":"progress","page":1,"total":100,"text":"추출된 텍스트..."}
  data: {"type":"progress","page":2,"total":100,"text":"다음 텍스트..."}
  ...
  data: {"type":"complete","previewUrl":"/api/preview/abc123","fullUrl":"/api/download/abc123"}
  ```

### GET /api/preview/:id
- 10페이지 미리보기 EPUB 반환

### POST /api/payment/confirm
- 토스페이먼츠 결제 확인
- 성공 시 전체 EPUB 다운로드 URL 반환

### GET /api/download/:id
- 결제 완료된 전체 EPUB 다운로드

## 5. Gemini API 프롬프트

```
당신은 한국어 PDF 페이지에서 텍스트를 추출하는 전문가입니다.

이 PDF 페이지 이미지를 분석하여 다음 JSON 형식으로 콘텐츠를 추출하세요:

{
  "elements": [
    {"type": "heading", "level": 1, "text": "제목 텍스트"},
    {"type": "paragraph", "text": "본문 텍스트"},
    {"type": "quote", "text": "인용문"},
    {"type": "list_item", "text": "목록 항목"},
    {"type": "image_placeholder", "description": "이미지 설명", "position": "center"},
    {"type": "caption", "text": "이미지 캡션"}
  ]
}

규칙:
1. 페이지에 있는 모든 텍스트를 빠짐없이 추출
2. 삽입된 이미지/스크린샷/캡처는 image_placeholder로 표시 (이미지 안의 텍스트는 본문에 포함하지 말 것)
3. 제목은 크기와 굵기로 판단하여 heading level 부여
4. 원문의 줄바꿈/문단 구분을 존중
5. JSON만 반환 (마크다운 코드블록 없이)
```

## 6. 비용 구조 (페이지당)

| 항목 | 비용 |
|------|------|
| Gemini 2.5 Flash | 2.1원 |
| Vercel Compute | ~0.5원 |
| 스토리지 (임시) | ~0.1원 |
| **원가 합계** | **~2.7원** |

## 7. 가격표

| 페이지 수 | 판매가 | 원가 | PG 수수료 | 순이익 | 마진 |
|-----------|--------|------|-----------|--------|------|
| ~50p | ₩1,900 | 135원 | 67원 | 1,698원 | 89% |
| ~100p | ₩3,900 | 270원 | 137원 | 3,494원 | 90% |
| ~200p | ₩6,900 | 540원 | 242원| 6,119원 | 89% |
| ~300p | ₩9,900 | 810원 | 347원 | 8,744원 | 88% |

## 8. 디렉토리 구조

```
textreme/
├── app/
│   ├── page.tsx              # 랜딩 페이지
│   ├── convert/
│   │   └── page.tsx          # 변환 + 미리보기 페이지
│   └── api/
│       ├── convert/
│       │   └── route.ts      # PDF → Gemini → EPUB 변환
│       ├── preview/
│       │   └── [id]/route.ts # 미리보기 EPUB
│       ├── download/
│       │   └── [id]/route.ts # 전체 EPUB 다운로드
│       └── payment/
│           └── confirm/route.ts
├── components/
│   ├── epub-viewer-lite.tsx  # 경량 EPUB 뷰어
│   ├── upload-zone.tsx       # PDF 업로드 UI
│   └── conversion-progress.tsx
├── lib/
│   ├── gemini.ts             # Gemini API 래퍼
│   ├── epub-builder.ts       # EPUB 패키징
│   └── pdf-to-images.ts      # PDF → 이미지 변환
├── public/
├── package.json
└── .env.local
    ├── GEMINI_API_KEY=...
    └── TOSS_SECRET_KEY=...
```

## 9. 멀티 API 전략 (향후)

```typescript
// lib/ai-provider.ts
interface AIProvider {
  extractPage(imageBase64: string): Promise<PageElements>
}

class GeminiProvider implements AIProvider { ... }
class ClaudeProvider implements AIProvider { ... }
class OpenAIProvider implements AIProvider { ... }

// 환경 변수로 전환 가능
const provider = process.env.AI_PROVIDER === 'claude'
  ? new ClaudeProvider()
  : new GeminiProvider()
```

## 10. 런칭 체크리스트

- [ ] 랜딩 페이지 완성
- [ ] Gemini 변환 API 구현
- [ ] 경량 EPUB 뷰어 통합
- [ ] 10페이지 무료 미리보기
- [ ] 토스페이먼츠 결제 연동
- [ ] 도메인 구매 (textreme.kr 또는 textreme.io)
- [ ] Vercel 배포
- [ ] 한글 PDF 100개 테스트
- [ ] 에러 핸들링 (이미지만 있는 페이지, 스캔 PDF 등)
- [ ] 개인정보 처리방침, 이용약관
