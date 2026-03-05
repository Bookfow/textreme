// src/app/api/convert/route.ts
// TeXTREME — PDF 페이지 배치 처리 API
//
// 클라이언트가 pdf-lib로 분할한 1페이지 PDF들을 배치(최대 10개)로 전송
// 서버는 Gemini에 전달 후 JSON 결과 반환 (SSE 아님)
//
// ★ body 크기: 1페이지 PDF ~50-200KB × 10 = ~2MB 이하 (Vercel 4.5MB 제한 안전)
export const maxDuration = 60
import { NextRequest } from 'next/server'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 타입 정의
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface PageElement {
  type: 'heading' | 'paragraph' | 'quote' | 'list_item' | 'image_placeholder' | 'caption'
  text?: string
  level?: number
  description?: string
  position?: string
}

interface PageResult {
  pageNumber: number
  elements: PageElement[]
  inputTokens: number
  outputTokens: number
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Gemini API 호출
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || ''
const GEMINI_MODEL = 'gemini-2.5-flash'
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`

const SYSTEM_PROMPT = `당신은 한국어 PDF 페이지를 분석하여 텍스트를 구조화된 JSON으로 추출하는 전문가입니다.

출력 JSON 형식:
{"elements": [
  {"type": "heading", "level": 1, "text": "..."},
  {"type": "paragraph", "text": "..."},
  {"type": "quote", "text": "..."},
  {"type": "list_item", "text": "..."},
  {"type": "image_placeholder", "description": "..."},
  {"type": "caption", "text": "..."}
]}

★ 핵심 원칙: 페이지에 보이는 읽을 수 있는 모든 텍스트를 빠짐없이 추출하는 것이 최우선입니다.

텍스트 추출 규칙:
- 배경색이 있는 박스, 색상 카드, 말풍선 안의 텍스트 → paragraph 또는 quote로 추출
- 표(table) 안의 텍스트 → paragraph로 추출 (행 단위로)
- 글머리 기호, 번호 목록 → list_item으로 추출
- 강조 박스, 팁 박스, 인용 영역 → quote로 추출
- 슬라이드형 PDF의 모든 텍스트 → 빠짐없이 추출
- 제목은 크기/굵기로 heading level(1~3) 부여

image_placeholder 사용 (아래 경우만 해당):
- 실제 사진 (인물, 풍경, 제품 등)
- 다른 앱/웹사이트의 스크린샷이 통째로 캡처된 이미지
- 차트, 그래프, 플로우차트 등 데이터 시각화 도표
- 아이콘, 로고, 일러스트레이션
→ 단, 스크린샷/도표 바깥의 본문 텍스트는 반드시 추출하세요.
→ 스크린샷 안의 텍스트는 추출하지 마세요.

제외 항목: 페이지 번호, 머리글, 꼬리글
출력: JSON만 반환. 마크다운 코드블록 사용 금지.`

async function extractPageWithGemini(singlePagePdfBase64: string, retryCount = 0): Promise<{ elements: PageElement[], inputTokens: number, outputTokens: number }> {
  const body = {
    contents: [{
      parts: [
        { text: SYSTEM_PROMPT + '\n\n이 PDF 페이지의 모든 텍스트를 빠짐없이 추출해주세요.' },
        { inline_data: { mime_type: 'application/pdf', data: singlePagePdfBase64 } }
      ]
    }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 8192,
    }
  }

  const res = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.text()
    if (res.status === 429 && retryCount < 3) {
      await new Promise(r => setTimeout(r, 2000 * (retryCount + 1)))
      return extractPageWithGemini(singlePagePdfBase64, retryCount + 1)
    }
    throw new Error(`Gemini API error ${res.status}: ${err}`)
  }

  const data = await res.json()

  const candidate = data.candidates?.[0]
  const finishReason = candidate?.finishReason || 'UNKNOWN'
  const text = candidate?.content?.parts?.[0]?.text || ''
  const usage = data.usageMetadata || {}

  if (finishReason === 'SAFETY' || finishReason === 'RECITATION') {
    return {
      elements: [{ type: 'paragraph', text: `(페이지 안전 필터 차단: ${finishReason})` }],
      inputTokens: usage.promptTokenCount || 0,
      outputTokens: usage.candidatesTokenCount || 0,
    }
  }

  let parsed: { elements: PageElement[] } | null = null

  if (text.trim()) {
    let cleaned = text.trim()
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?\s*```$/i, '')

    try {
      const obj = JSON.parse(cleaned)
      if (Array.isArray(obj)) {
        parsed = { elements: obj }
      } else if (obj.elements && Array.isArray(obj.elements)) {
        parsed = obj
      } else {
        parsed = { elements: [obj] }
      }
    } catch {
      const jsonMatch = cleaned.match(/\{[\s\S]*"elements"\s*:\s*\[[\s\S]*\]\s*\}/)
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[0])
        } catch {}
      }
    }
  }

  if (!parsed || !parsed.elements || parsed.elements.length === 0) {
    if (text.trim() && !text.trim().startsWith('{')) {
      parsed = { elements: [{ type: 'paragraph', text: text.trim() }] }
    } else {
      parsed = { elements: [] }
    }
  }

  parsed.elements = parsed.elements.filter(el =>
    el.type === 'image_placeholder' ? !!el.description : !!el.text?.trim()
  )

  return {
    elements: parsed.elements,
    inputTokens: usage.promptTokenCount || 0,
    outputTokens: usage.candidatesTokenCount || 0,
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// API Route Handler
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// POST: 1~10개 페이지 PDF base64를 받아서 Gemini 처리 후 JSON 반환
export async function POST(req: NextRequest) {
  try {
    if (!GEMINI_API_KEY) {
      return Response.json({ error: 'GEMINI_API_KEY가 설정되지 않았습니다' }, { status: 500 })
    }

    const body = await req.json()
    const { pages } = body as { pages: { base64: string; pageNumber: number }[] }

    if (!pages || !Array.isArray(pages) || pages.length === 0) {
      return Response.json({ error: '페이지 데이터가 필요합니다' }, { status: 400 })
    }

    if (pages.length > 10) {
      return Response.json({ error: '한 번에 최대 10페이지만 처리 가능합니다' }, { status: 400 })
    }

    // 병렬로 Gemini 호출
    const results: PageResult[] = await Promise.all(
      pages.map(async (pg) => {
        try {
          const { elements, inputTokens, outputTokens } = await extractPageWithGemini(pg.base64)
          return { pageNumber: pg.pageNumber, elements, inputTokens, outputTokens }
        } catch (err: any) {
          return {
            pageNumber: pg.pageNumber,
            elements: [{ type: 'paragraph' as const, text: `(페이지 ${pg.pageNumber} 추출 실패: ${err.message?.slice(0, 50)})` }],
            inputTokens: 0,
            outputTokens: 0,
          }
        }
      })
    )

    return Response.json({ results })

  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}
