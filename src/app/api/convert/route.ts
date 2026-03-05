// src/app/api/convert/route.ts
// TeXTREME — PDF → EPUB 변환 API (SSE 스트림)
//
// 방법 2 아키텍처:
//   서버: PDF 분할 → Gemini 추출 → 페이지별 JSON 결과 반환
//   클라이언트: JSON 수신 → 이미지 렌더링 → EPUB 빌드 + 다운로드
//
// ★ 서버는 EPUB을 만들지 않음 → 전송량 감소 + 이미지 처리는 클라이언트 담당

import { NextRequest } from 'next/server'
import { PDFDocument } from 'pdf-lib'

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
  elapsedMs: number
  debugInfo?: string
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PDF 분할 — pdf-lib로 1페이지 PDF 생성
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function splitPdfToSinglePages(pdfBytes: Uint8Array): Promise<Uint8Array[]> {
  const srcDoc = await PDFDocument.load(pdfBytes)
  const pageCount = srcDoc.getPageCount()
  const singlePages: Uint8Array[] = []

  for (let i = 0; i < pageCount; i++) {
    const newDoc = await PDFDocument.create()
    const [copiedPage] = await newDoc.copyPages(srcDoc, [i])
    newDoc.addPage(copiedPage)
    const bytes = await newDoc.save()
    singlePages.push(bytes)
  }

  return singlePages
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Gemini API 호출 — 1페이지 PDF 전달
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

async function extractPageWithGemini(singlePagePdfBase64: string, retryCount = 0): Promise<{ elements: PageElement[], inputTokens: number, outputTokens: number, debugInfo: string }> {
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
      debugInfo: `BLOCKED:${finishReason}`,
    }
  }
  
  const debugSnippet = text.slice(0, 200)

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
    debugInfo: `finish:${finishReason}|len:${text.length}|els:${parsed.elements.length}|raw:${debugSnippet}`,
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// API Route Handler
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// POST: PDF base64를 받아서 SSE로 추출 결과 JSON 반환 (EPUB은 클라이언트에서 빌드)
export async function POST(req: NextRequest) {
  try {
    if (!GEMINI_API_KEY) {
      return new Response(JSON.stringify({ error: 'GEMINI_API_KEY가 설정되지 않았습니다' }), { status: 500 })
    }

    const body = await req.json()
    const { pdfBase64, pageCount, title } = body as { pdfBase64: string; pageCount: number; title: string }

    if (!pdfBase64 || !pageCount) {
      return new Response(JSON.stringify({ error: 'PDF 데이터와 페이지 수가 필요합니다' }), { status: 400 })
    }

    if (pageCount > 500) {
      return new Response(JSON.stringify({ error: '500페이지 이하의 PDF만 지원합니다' }), { status: 400 })
    }

    // SSE 스트림 생성
    const stream = new ReadableStream({
      async start(controller) {
        const send = (data: any) => {
          try {
            controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`))
          } catch {}
        }

        try {
          send({ type: 'info', totalPages: pageCount })

          // ★ 1단계: PDF를 1페이지씩 분할
          send({ type: 'status', message: 'PDF 페이지 분할 중...' })
          const pdfBytes = Buffer.from(pdfBase64, 'base64')
          const singlePages = await splitPdfToSinglePages(pdfBytes)
          const actualPageCount = singlePages.length

          // ★ 2단계: 각 1페이지 PDF를 Gemini에 전달 (10페이지씩 병렬)
          const results: PageResult[] = []
          const BATCH_SIZE = 10

          for (let batch = 0; batch < actualPageCount; batch += BATCH_SIZE) {
            const batchEnd = Math.min(batch + BATCH_SIZE, actualPageCount)
            const batchPromises: Promise<PageResult>[] = []

            for (let idx = batch; idx < batchEnd; idx++) {
              const pageNum = idx + 1
              batchPromises.push(
                (async () => {
                  const startTime = Date.now()
                  try {
                    const pageBase64 = Buffer.from(singlePages[idx]).toString('base64')
                    const { elements, inputTokens, outputTokens, debugInfo } = await extractPageWithGemini(pageBase64)
                    const elapsedMs = Date.now() - startTime
                    return { pageNumber: pageNum, elements, inputTokens, outputTokens, elapsedMs, debugInfo } as PageResult
                  } catch (err: any) {
                    return {
                      pageNumber: pageNum,
                      elements: [{ type: 'paragraph' as const, text: `(페이지 ${pageNum} 추출 실패: ${err.message?.slice(0, 50)})` }],
                      inputTokens: 0, outputTokens: 0, elapsedMs: 0,
                    } as PageResult
                  }
                })()
              )
            }

            const batchResults = await Promise.all(batchPromises)
            results.push(...batchResults)

            // 진행률 전송
            for (const r of batchResults) {
              const preview = r.elements.find(e => e.text)?.text?.slice(0, 80) || ''
              send({
                type: 'progress',
                page: r.pageNumber,
                total: actualPageCount,
                percent: Math.round((r.pageNumber / actualPageCount) * 100),
                text: preview,
                tokens: { input: r.inputTokens, output: r.outputTokens },
                debug: { elementCount: r.elements.length, types: r.elements.map(e => e.type), info: (r as any).debugInfo || '' },
              })
            }
          }

          // ★ 3단계: 결과 JSON 반환 (EPUB 빌드는 클라이언트에서!)
          const totalInputTokens = results.reduce((s, r) => s + r.inputTokens, 0)
          const totalOutputTokens = results.reduce((s, r) => s + r.outputTokens, 0)
          const costUSD = totalInputTokens / 1_000_000 * 0.15 + totalOutputTokens / 1_000_000 * 0.60
          const costKRW = Math.round(costUSD * 1450)

          // 이미지가 필요한 페이지 목록 (image_placeholder가 있는 페이지)
          const imagePagesNeeded = results
            .filter(r => r.elements.some(e => e.type === 'image_placeholder'))
            .map(r => r.pageNumber)

          send({
            type: 'complete',
            totalPages: actualPageCount,
            // ★ EPUB 대신 페이지별 추출 결과 JSON 전송
            pageResults: results.map(r => ({
              pageNumber: r.pageNumber,
              elements: r.elements,
            })),
            imagePagesNeeded,
            costKRW,
            totalInputTokens,
            totalOutputTokens,
          })

        } catch (err: any) {
          send({ type: 'error', message: err.message || '변환 중 오류가 발생했습니다' })
        } finally {
          controller.close()
        }
      }
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    })

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
}
