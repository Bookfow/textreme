// app/api/convert/route.ts
// TeXTREME — PDF → EPUB 변환 API (SSE 스트림)
//
// 흐름: PDF 업로드 → 페이지별 이미지 렌더링 → Gemini API → EPUB 패키징
// 프론트엔드에서 EventSource로 진행률 실시간 수신

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

interface ConversionJob {
  id: string
  totalPages: number
  results: PageResult[]
  epubBuffer?: Buffer
  createdAt: number
}

// 임시 저장소 (프로덕션에서는 Redis/R2로 교체)
const jobs = new Map<string, ConversionJob>()

// 24시간 후 자동 삭제
setInterval(() => {
  const now = Date.now()
  for (const [id, job] of jobs) {
    if (now - job.createdAt > 24 * 60 * 60 * 1000) jobs.delete(id)
  }
}, 60 * 60 * 1000)

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Gemini API 호출
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const GEMINI_API_KEY = process.env.GEMINI_API_KEY!
const GEMINI_MODEL = 'gemini-2.5-flash'
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`

const SYSTEM_PROMPT = `당신은 한국어 PDF 페이지에서 텍스트를 추출하는 전문가입니다.

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
1. 페이지에 있는 모든 텍스트를 빠짐없이 추출하세요.
2. 삽입된 이미지, 스크린샷, 캡처, 사진은 image_placeholder로 표시하세요. 이미지 안에 있는 텍스트는 본문에 포함하지 마세요.
3. 제목은 크기와 굵기로 판단하여 heading level(1~3)을 부여하세요.
4. 원문의 줄바꿈과 문단 구분을 존중하세요.
5. JSON만 반환하세요. 마크다운 코드블록(\`\`\`json)으로 감싸지 마세요.`

async function extractPageWithGemini(imageBase64: string, mimeType: string): Promise<{ elements: PageElement[], inputTokens: number, outputTokens: number }> {
  const body = {
    contents: [{
      parts: [
        { text: SYSTEM_PROMPT },
        { inline_data: { mime_type: mimeType, data: imageBase64 } }
      ]
    }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 4096,
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
    throw new Error(`Gemini API error ${res.status}: ${err}`)
  }

  const data = await res.json()
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}'
  const usage = data.usageMetadata || {}

  // JSON 파싱 (코드블록 래핑 대응)
  let cleaned = text.trim()
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
  }

  let parsed: { elements: PageElement[] }
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    parsed = { elements: [{ type: 'paragraph', text: cleaned }] }
  }

  return {
    elements: parsed.elements || [],
    inputTokens: usage.promptTokenCount || 0,
    outputTokens: usage.candidatesTokenCount || 0,
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PDF → 이미지 변환 (서버사이드 pdf.js)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function pdfToImages(pdfBuffer: ArrayBuffer): Promise<{ images: { base64: string, mimeType: string }[], pageCount: number }> {
  // 서버에서 pdfjs-dist 사용 (canvas 기반)
  // 프로덕션에서는 @vercel/og 또는 puppeteer/canvas 사용
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs')
  
  const loadingTask = pdfjsLib.getDocument({ data: pdfBuffer })
  const pdfDoc = await loadingTask.promise
  const pageCount = pdfDoc.numPages
  const images: { base64: string, mimeType: string }[] = []

  // 동적 import canvas (서버 환경)
  const { createCanvas } = await import('canvas')

  for (let i = 1; i <= pageCount; i++) {
    const page = await pdfDoc.getPage(i)
    const viewport = page.getViewport({ scale: 2.0 }) // 2x for quality

    const canvas = createCanvas(viewport.width, viewport.height)
    const ctx = canvas.getContext('2d')

    await page.render({
      canvasContext: ctx as any,
      viewport,
    }).promise

    const pngBuffer = canvas.toBuffer('image/png')
    images.push({
      base64: pngBuffer.toString('base64'),
      mimeType: 'image/png',
    })
  }

  return { images, pageCount }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// EPUB 빌더
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function buildEpub(results: PageResult[], title: string, maxPages?: number): Buffer {
  const JSZip = require('jszip')
  const zip = new JSZip()

  const pages = maxPages ? results.slice(0, maxPages) : results

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
  const manifestItems = pages.map((_, i) =>
    `    <item id="page${i}" href="page${i}.xhtml" media-type="application/xhtml+xml"/>`
  ).join('\n')
  const spineItems = pages.map((_, i) =>
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

  // nav.xhtml (TOC)
  const tocItems = pages.map((p, i) => {
    const heading = p.elements.find(e => e.type === 'heading')
    const label = heading?.text || `페이지 ${p.pageNumber}`
    return `      <li><a href="page${i}.xhtml">${escapeXml(label)}</a></li>`
  }).join('\n')

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
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i]
    const bodyHtml = page.elements.map(el => {
      switch (el.type) {
        case 'heading':
          const tag = `h${Math.min(el.level || 1, 3)}`
          return `<${tag}>${escapeXml(el.text || '')}</${tag}>`
        case 'paragraph':
          return `<p>${escapeXml(el.text || '')}</p>`
        case 'quote':
          return `<blockquote><p>${escapeXml(el.text || '')}</p></blockquote>`
        case 'list_item':
          return `<p>• ${escapeXml(el.text || '')}</p>`
        case 'image_placeholder':
          return `<div class="image-placeholder">📷 ${escapeXml(el.description || '이미지')}</div>`
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

  return zip.generateAsync({ type: 'nodebuffer', mimeType: 'application/epub+zip' })
}

function escapeXml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// API Route Handler (SSE 스트림)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('pdf') as File | null
    if (!file) {
      return new Response(JSON.stringify({ error: 'PDF 파일이 필요합니다' }), { status: 400 })
    }

    const maxSize = 50 * 1024 * 1024 // 50MB
    if (file.size > maxSize) {
      return new Response(JSON.stringify({ error: '파일 크기는 50MB 이하여야 합니다' }), { status: 400 })
    }

    const pdfBuffer = await file.arrayBuffer()
    const jobId = crypto.randomUUID()
    const title = file.name.replace(/\.pdf$/i, '')

    // SSE 스트림 생성
    const stream = new ReadableStream({
      async start(controller) {
        const send = (data: any) => {
          controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`))
        }

        try {
          // 1단계: PDF → 이미지
          send({ type: 'status', message: 'PDF 페이지를 이미지로 변환 중...' })
          const { images, pageCount } = await pdfToImages(pdfBuffer)

          if (pageCount > 500) {
            send({ type: 'error', message: '500페이지 이하의 PDF만 지원합니다' })
            controller.close()
            return
          }

          send({ type: 'info', totalPages: pageCount, jobId })

          // 2단계: Gemini API로 추출 (5페이지씩 병렬)
          const results: PageResult[] = []
          const BATCH_SIZE = 5

          for (let batch = 0; batch < images.length; batch += BATCH_SIZE) {
            const batchImages = images.slice(batch, batch + BATCH_SIZE)
            const batchPromises = batchImages.map(async (img, idx) => {
              const pageNum = batch + idx + 1
              const startTime = Date.now()

              try {
                const { elements, inputTokens, outputTokens } = await extractPageWithGemini(img.base64, img.mimeType)
                const elapsedMs = Date.now() - startTime

                const result: PageResult = { pageNumber: pageNum, elements, inputTokens, outputTokens, elapsedMs }
                return result
              } catch (err: any) {
                // 실패한 페이지는 빈 결과
                return {
                  pageNumber: pageNum,
                  elements: [{ type: 'paragraph' as const, text: `(페이지 ${pageNum} 추출 실패)` }],
                  inputTokens: 0, outputTokens: 0, elapsedMs: 0,
                }
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

          // 3단계: EPUB 패키징
          send({ type: 'status', message: 'EPUB 패키징 중...' })

          // 미리보기용 (10페이지)
          const previewEpub = await buildEpub(results, title, 10)
          // 전체
          const fullEpub = await buildEpub(results, title)

          // 저장
          const job: ConversionJob = {
            id: jobId,
            totalPages: pageCount,
            results,
            epubBuffer: fullEpub,
            createdAt: Date.now(),
          }
          jobs.set(jobId, job)

          // 비용 계산
          const totalInputTokens = results.reduce((s, r) => s + r.inputTokens, 0)
          const totalOutputTokens = results.reduce((s, r) => s + r.outputTokens, 0)
          const costKRW = Math.round(
            (totalInputTokens / 1_000_000 * 0.15 + totalOutputTokens / 1_000_000 * 0.6) * 1300
          )

          send({
            type: 'complete',
            jobId,
            totalPages: pageCount,
            previewUrl: `/api/preview/${jobId}`,
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

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 미리보기 & 다운로드 (별도 route에서 구현)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// app/api/preview/[id]/route.ts
// export async function GET(req, { params }) {
//   const job = jobs.get(params.id)
//   if (!job) return new Response('Not found', { status: 404 })
//   const previewEpub = await buildEpub(job.results, 'preview', 10)
//   return new Response(previewEpub, {
//     headers: { 'Content-Type': 'application/epub+zip', 'Content-Disposition': 'inline' }
//   })
// }

// app/api/download/[id]/route.ts
// export async function GET(req, { params }) {
//   // 결제 확인 후
//   const job = jobs.get(params.id)
//   if (!job?.epubBuffer) return new Response('Not found', { status: 404 })
//   return new Response(job.epubBuffer, {
//     headers: {
//       'Content-Type': 'application/epub+zip',
//       'Content-Disposition': `attachment; filename="textreme-converted.epub"`,
//     }
//   })
// }
