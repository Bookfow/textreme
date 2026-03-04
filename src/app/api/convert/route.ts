// src/app/api/convert/route.ts
// TeXTREME — PDF → EPUB 변환 API (SSE 스트림)
//
// 흐름: 프론트엔드에서 PDF 페이지 이미지(base64) 전송 → Gemini API 추출 → EPUB 패키징
// Vercel Serverless 호환 (canvas 불필요)

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
  elapsedMs: number
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Gemini API 호출
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || ''
const GEMINI_MODEL = 'gemini-2.5-flash'
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`

// ★ 프롬프트 v3 — 본문 추출 최우선 + 이미지 판단 균형
const SYSTEM_PROMPT = `당신은 한국어 PDF 페이지 이미지를 분석하여 텍스트를 구조화된 JSON으로 추출하는 전문가입니다.

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

async function extractPageWithGemini(imageBase64: string, mimeType: string, retryCount = 0): Promise<{ elements: PageElement[], inputTokens: number, outputTokens: number }> {
  const body = {
    systemInstruction: {
      parts: [{ text: SYSTEM_PROMPT }]
    },
    contents: [{
      parts: [
        { text: '이 PDF 페이지의 모든 텍스트를 추출해주세요.' },
        { inline_data: { mime_type: mimeType, data: imageBase64 } }
      ]
    }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 8192,
      responseMimeType: 'application/json',
    }
  }

  const res = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.text()
    // Rate limit → 재시도
    if (res.status === 429 && retryCount < 3) {
      await new Promise(r => setTimeout(r, 2000 * (retryCount + 1)))
      return extractPageWithGemini(imageBase64, mimeType, retryCount + 1)
    }
    throw new Error(`Gemini API error ${res.status}: ${err}`)
  }

  const data = await res.json()
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
  const usage = data.usageMetadata || {}

  // JSON 파싱 (여러 래핑 패턴 대응)
  let parsed: { elements: PageElement[] } | null = null

  if (text.trim()) {
    let cleaned = text.trim()
    // ```json ... ``` 래핑 제거
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?\s*```$/i, '')

    try {
      const obj = JSON.parse(cleaned)
      // { elements: [...] } 또는 [...] 형태 모두 처리
      if (Array.isArray(obj)) {
        parsed = { elements: obj }
      } else if (obj.elements && Array.isArray(obj.elements)) {
        parsed = obj
      } else {
        parsed = { elements: [obj] }
      }
    } catch {
      // JSON 파싱 실패 → 텍스트에서 JSON 배열/객체 추출 시도
      const jsonMatch = cleaned.match(/\{[\s\S]*"elements"\s*:\s*\[[\s\S]*\]\s*\}/)
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[0])
        } catch {}
      }
    }
  }

  // 최종 fallback: 빈 텍스트가 아니면 paragraph로
  if (!parsed || !parsed.elements || parsed.elements.length === 0) {
    if (text.trim() && !text.trim().startsWith('{')) {
      parsed = { elements: [{ type: 'paragraph', text: text.trim() }] }
    } else {
      parsed = { elements: [] }
    }
  }

  // elements 유효성 검증 — text가 비어있는 항목 제거
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
// EPUB 빌더
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function buildEpub(results: PageResult[], title: string): Promise<Uint8Array> {
  const JSZip = (await import('jszip')).default
  const zip = new JSZip()

  // mimetype (비압축)
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' })

  // container.xml
  zip.file('META-INF/container.xml', `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`)

  // content.opf
  const manifestItems = results.map((_, i) =>
    `    <item id="page${i}" href="page${i}.xhtml" media-type="application/xhtml+xml"/>`
  ).join('\n')
  const spineItems = results.map((_, i) =>
    `    <itemref idref="page${i}"/>`
  ).join('\n')

  zip.file('OEBPS/content.opf', `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">textreme-${Date.now()}</dc:identifier>
    <dc:title>${escapeXml(title)}</dc:title>
    <dc:language>ko</dc:language>
    <dc:creator>TeXTREME Converter</dc:creator>
    <meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d+Z/, 'Z')}</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
${manifestItems}
    <item id="style" href="style.css" media-type="text/css"/>
  </manifest>
  <spine>
${spineItems}
  </spine>
</package>`)

  // nav.xhtml (TOC) — heading 있는 페이지만 목차 항목
  const tocEntries = results
    .map((p, i) => {
      const heading = p.elements.find(e => e.type === 'heading')
      return heading ? { label: heading.text || `페이지 ${p.pageNumber}`, idx: i } : null
    })
    .filter(Boolean) as { label: string; idx: number }[]

  // heading이 없으면 매 10페이지마다
  const tocItems = tocEntries.length > 0
    ? tocEntries.map(e => `      <li><a href="page${e.idx}.xhtml">${escapeXml(e.label)}</a></li>`).join('\n')
    : results.filter((_, i) => i % 10 === 0).map((p, i) =>
      `      <li><a href="page${i * 10}.xhtml">페이지 ${p.pageNumber}</a></li>`
    ).join('\n')

  zip.file('OEBPS/nav.xhtml', `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="ko">
<head><title>목차</title></head>
<body>
  <nav epub:type="toc">
    <h1>목차</h1>
    <ol>
${tocItems}
    </ol>
  </nav>
</body>
</html>`)

  // style.css
  zip.file('OEBPS/style.css', `
body { font-family: "Noto Sans KR", system-ui, sans-serif; line-height: 1.8; color: #2D2016; margin: 0; padding: 1em; word-break: keep-all; }
h1 { font-size: 1.6em; font-weight: bold; line-height: 1.35; margin: 1.5em 0 0.75em; }
h2 { font-size: 1.35em; font-weight: bold; line-height: 1.35; margin: 1.5em 0 0.75em; }
h3 { font-size: 1.15em; font-weight: 600; line-height: 1.35; margin: 1.2em 0 0.6em; }
p { margin-bottom: 0.8em; text-indent: 1em; }
blockquote { border-left: 3px solid #ddd; padding-left: 1em; margin: 1em 0; color: #666; font-style: italic; }
.image-placeholder { text-align: center; padding: 2em; margin: 1em 0; background: #f5f5f5; border-radius: 8px; color: #999; font-style: italic; }
`)

  // 페이지별 XHTML
  for (let i = 0; i < results.length; i++) {
    const page = results[i]
    const bodyHtml = page.elements.map(el => {
      switch (el.type) {
        case 'heading': {
          const tag = `h${Math.min(el.level || 1, 3)}`
          return `<${tag}>${escapeXml(el.text || '')}</${tag}>`
        }
        case 'paragraph':
          return `<p>${escapeXml(el.text || '')}</p>`
        case 'quote':
          return `<blockquote><p>${escapeXml(el.text || '')}</p></blockquote>`
        case 'list_item':
          return `<p>• ${escapeXml(el.text || '')}</p>`
        case 'image_placeholder':
          return `<div class="image-placeholder">[이미지: ${escapeXml(el.description || '이미지')}]</div>`
        case 'caption':
          return `<p><em>${escapeXml(el.text || '')}</em></p>`
        default:
          return `<p>${escapeXml(el.text || '')}</p>`
      }
    }).join('\n    ')

    zip.file(`OEBPS/page${i}.xhtml`, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" lang="ko">
<head>
  <title>페이지 ${page.pageNumber}</title>
  <link rel="stylesheet" href="style.css"/>
</head>
<body>
    ${bodyHtml}
</body>
</html>`)
  }

  return await zip.generateAsync({ type: 'uint8array', mimeType: 'application/epub+zip' })
}

function escapeXml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// API Route Handler
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// POST: 페이지 이미지 배열을 받아서 SSE로 변환 진행
export async function POST(req: NextRequest) {
  try {
    if (!GEMINI_API_KEY) {
      return new Response(JSON.stringify({ error: 'GEMINI_API_KEY가 설정되지 않았습니다' }), { status: 500 })
    }

    const body = await req.json()
    const { pages, title } = body as { pages: { base64: string; mimeType: string }[]; title: string }

    if (!pages || !Array.isArray(pages) || pages.length === 0) {
      return new Response(JSON.stringify({ error: '페이지 이미지가 필요합니다' }), { status: 400 })
    }

    if (pages.length > 500) {
      return new Response(JSON.stringify({ error: '500페이지 이하의 PDF만 지원합니다' }), { status: 400 })
    }

    const pageCount = pages.length

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

          // Gemini API로 추출 (3페이지씩 병렬 — rate limit 고려)
          const results: PageResult[] = []
          const BATCH_SIZE = 3

          for (let batch = 0; batch < pages.length; batch += BATCH_SIZE) {
            const batchPages = pages.slice(batch, batch + BATCH_SIZE)
            const batchPromises = batchPages.map(async (pg, idx) => {
              const pageNum = batch + idx + 1
              const startTime = Date.now()

              try {
                const { elements, inputTokens, outputTokens } = await extractPageWithGemini(pg.base64, pg.mimeType)
                const elapsedMs = Date.now() - startTime
                return { pageNumber: pageNum, elements, inputTokens, outputTokens, elapsedMs } as PageResult
              } catch (err: any) {
                return {
                  pageNumber: pageNum,
                  elements: [{ type: 'paragraph' as const, text: `(페이지 ${pageNum} 추출 실패: ${err.message?.slice(0, 50)})` }],
                  inputTokens: 0, outputTokens: 0, elapsedMs: 0,
                } as PageResult
              }
            })

            const batchResults = await Promise.all(batchPromises)
            results.push(...batchResults)

            // 진행률 전송
            for (const r of batchResults) {
              const preview = r.elements.find(e => e.text)?.text?.slice(0, 80) || ''
              send({
                type: 'progress',
                page: r.pageNumber,
                total: pageCount,
                percent: Math.round((r.pageNumber / pageCount) * 100),
                text: preview,
                tokens: { input: r.inputTokens, output: r.outputTokens },
              })
            }
          }

          // EPUB 패키징
          send({ type: 'status', message: 'EPUB 패키징 중...' })
          const epubData = await buildEpub(results, title || 'Converted')

          // base64로 전송 (클라이언트에서 다운로드)
          const epubBase64 = Buffer.from(epubData).toString('base64')

          // 비용 계산 (Gemini 2.5 Flash: $0.15/1M input, $0.60/1M output → 원화 환산)
          const totalInputTokens = results.reduce((s, r) => s + r.inputTokens, 0)
          const totalOutputTokens = results.reduce((s, r) => s + r.outputTokens, 0)
          const costUSD = totalInputTokens / 1_000_000 * 0.15 + totalOutputTokens / 1_000_000 * 0.60
          const costKRW = Math.round(costUSD * 1450)

          send({
            type: 'complete',
            totalPages: pageCount,
            epubBase64,
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
