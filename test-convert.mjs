/**
 * TeXTREME 로컬 변환 테스트 스크립트
 * 
 * 폴더 구조:
 *   C:\Users\user\textreme\convert test\test PDF\   ← 테스트할 PDF
 *   C:\Users\user\textreme\convert test\result EPUB\ ← 결과 EPUB 저장
 * 
 * 사용법:
 *   cd C:\Users\user\textreme
 *   node test-convert.mjs                           (test PDF 폴더의 모든 PDF)
 *   node test-convert.mjs --pages 1-3               (특정 페이지만)
 *   node test-convert.mjs --raw                     (Gemini raw 응답 출력)
 *   node test-convert.mjs --pages 2-2 --raw         (2페이지만 + raw)
 * 
 * 필요 패키지: npm install canvas
 * .env.local에서 GEMINI_API_KEY 읽음
 */

import fs from 'fs'
import path from 'path'
import { createCanvas } from 'canvas'

// ━━━ 폴더 경로 ━━━
const PROJECT_DIR = 'C:\\Users\\user\\textreme'
const TEST_PDF_DIR = path.join(PROJECT_DIR, 'convert test', 'test PDF')
const RESULT_EPUB_DIR = path.join(PROJECT_DIR, 'convert test', 'result EPUB')

// ━━━ .env.local에서 API 키 읽기 ━━━
function loadEnv() {
  const envPath = path.join(PROJECT_DIR, '.env.local')
  if (!fs.existsSync(envPath)) {
    console.error('❌ .env.local 파일을 찾을 수 없습니다')
    process.exit(1)
  }
  const content = fs.readFileSync(envPath, 'utf-8')
  for (const line of content.split('\n')) {
    const [key, ...vals] = line.split('=')
    if (key?.trim() && vals.length) process.env[key.trim()] = vals.join('=').trim()
  }
}
loadEnv()

const GEMINI_API_KEY = process.env.GEMINI_API_KEY
if (!GEMINI_API_KEY) {
  console.error('❌ GEMINI_API_KEY가 없습니다')
  process.exit(1)
}

const GEMINI_MODEL = 'gemini-2.5-flash'
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`

// ━━━ 프롬프트 (route.ts와 동일) ━━━
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

// ━━━ Gemini API 호출 ━━━
async function extractPage(imageBase64, mimeType, pageNum, showRaw = false) {
  const body = {
    contents: [{
      parts: [
        { text: SYSTEM_PROMPT + '\n\n이 PDF 페이지의 모든 텍스트를 빠짐없이 추출해주세요.' },
        { inline_data: { mime_type: mimeType, data: imageBase64 } }
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
    if (res.status === 429) {
      console.log(`    ⏳ Rate limit, 3초 대기...`)
      await new Promise(r => setTimeout(r, 3000))
      return extractPage(imageBase64, mimeType, pageNum, showRaw)
    }
    throw new Error(`Gemini ${res.status}: ${err.slice(0, 200)}`)
  }

  const data = await res.json()
  const candidate = data.candidates?.[0]
  const finishReason = candidate?.finishReason || 'UNKNOWN'
  const text = candidate?.content?.parts?.[0]?.text || ''
  const usage = data.usageMetadata || {}

  if (showRaw) {
    console.log(`\n━━━ Page ${pageNum} RAW (${text.length} chars, finish: ${finishReason}) ━━━`)
    console.log(text.slice(0, 800))
    if (text.length > 800) console.log(`... (${text.length - 800} more chars)`)
  }

  if (finishReason === 'SAFETY' || finishReason === 'RECITATION') {
    return { elements: [], tokens: usage, finishReason, rawLen: text.length }
  }

  // JSON 파싱
  let parsed = null
  if (text.trim()) {
    let cleaned = text.trim().replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?\s*```$/i, '')
    try {
      const obj = JSON.parse(cleaned)
      if (Array.isArray(obj)) parsed = { elements: obj }
      else if (obj.elements && Array.isArray(obj.elements)) parsed = obj
      else parsed = { elements: [obj] }
    } catch {
      const m = cleaned.match(/\{[\s\S]*"elements"\s*:\s*\[[\s\S]*\]\s*\}/)
      if (m) try { parsed = JSON.parse(m[0]) } catch {}
    }
  }

  if (!parsed || !parsed.elements) parsed = { elements: [] }
  parsed.elements = parsed.elements.filter(el =>
    el.type === 'image_placeholder' ? !!el.description : !!el.text?.trim()
  )

  return { elements: parsed.elements, tokens: usage, finishReason, rawLen: text.length }
}

// ━━━ PDF → 이미지 (pdfjs-dist + node-canvas) ━━━
async function pdfToImages(pdfPath, pageRange) {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs')

  const data = new Uint8Array(fs.readFileSync(pdfPath))
  const doc = await pdfjsLib.getDocument({ data, useSystemFonts: true }).promise
  const totalPages = doc.numPages

  let pagesToProcess = []
  if (pageRange) {
    const [start, end] = pageRange.split('-').map(Number)
    for (let i = start; i <= (end || start); i++) {
      if (i >= 1 && i <= totalPages) pagesToProcess.push(i)
    }
  } else {
    for (let i = 1; i <= totalPages; i++) pagesToProcess.push(i)
  }

  console.log(`📄 ${path.basename(pdfPath)}: ${totalPages}페이지 (처리: ${pagesToProcess.length}페이지)`)

  const images = []
  for (const pageNum of pagesToProcess) {
    const page = await doc.getPage(pageNum)
    const viewport = page.getViewport({ scale: 1.5 })
    const canvas = createCanvas(viewport.width, viewport.height)
    const ctx = canvas.getContext('2d')

    await page.render({
      canvasContext: ctx,
      viewport: viewport,
    }).promise

    const buffer = canvas.toBuffer('image/jpeg', { quality: 0.85 })
    const base64 = buffer.toString('base64')
    images.push({ pageNum, base64, mimeType: 'image/jpeg', sizeKB: Math.round(buffer.length / 1024) })
    process.stdout.write(`  이미지 변환: ${pageNum}/${pagesToProcess[pagesToProcess.length - 1]}\r`)
  }
  console.log('')

  return images
}

// ━━━ EPUB 빌드 ━━━
async function buildEpub(results, title) {
  const JSZip = (await import('jszip')).default
  const zip = new JSZip()

  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' })
  zip.file('META-INF/container.xml', `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`)

  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

  const manifest = results.map((_, i) => `    <item id="page${i}" href="page${i}.xhtml" media-type="application/xhtml+xml"/>`).join('\n')
  const spine = results.map((_, i) => `    <itemref idref="page${i}"/>`).join('\n')

  zip.file('OEBPS/content.opf', `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">test-${Date.now()}</dc:identifier>
    <dc:title>${esc(title)}</dc:title>
    <dc:language>ko</dc:language>
    <meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d+Z/, 'Z')}</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
${manifest}
    <item id="style" href="style.css" media-type="text/css"/>
  </manifest>
  <spine>
${spine}
  </spine>
</package>`)

  zip.file('OEBPS/nav.xhtml', `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="ko">
<head><title>목차</title></head>
<body>
  <nav epub:type="toc"><h1>목차</h1>
    <ol><li><a href="page0.xhtml">${esc(title)}</a></li></ol>
  </nav>
</body>
</html>`)

  zip.file('OEBPS/style.css', `body { font-family: system-ui, sans-serif; line-height: 1.8; color: #222; padding: 1em; word-break: keep-all; }
h1 { font-size: 1.6em; font-weight: bold; margin: 1.5em 0 0.75em; }
h2 { font-size: 1.35em; font-weight: bold; margin: 1.5em 0 0.75em; }
h3 { font-size: 1.15em; font-weight: 600; margin: 1.2em 0 0.6em; }
p { margin-bottom: 0.8em; }
blockquote { border-left: 3px solid #ddd; padding-left: 1em; margin: 1em 0; color: #666; }
.img-ph { text-align: center; padding: 1.5em; margin: 1em 0; background: #f5f5f5; border-radius: 8px; color: #999; }`)

  for (let i = 0; i < results.length; i++) {
    const r = results[i]
    const html = r.elements.map(el => {
      switch (el.type) {
        case 'heading': return `<h${Math.min(el.level || 1, 3)}>${esc(el.text || '')}</h${Math.min(el.level || 1, 3)}>`
        case 'paragraph': return `<p>${esc(el.text || '')}</p>`
        case 'quote': return `<blockquote><p>${esc(el.text || '')}</p></blockquote>`
        case 'list_item': return `<p>• ${esc(el.text || '')}</p>`
        case 'image_placeholder': return `<div class="img-ph">[이미지: ${esc(el.description || '')}]</div>`
        case 'caption': return `<p><em>${esc(el.text || '')}</em></p>`
        default: return `<p>${esc(el.text || '')}</p>`
      }
    }).join('\n    ')

    zip.file(`OEBPS/page${i}.xhtml`, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" lang="ko">
<head><title>p${r.pageNum}</title><link rel="stylesheet" href="style.css"/></head>
<body>
    ${html || '<p>(빈 페이지)</p>'}
</body>
</html>`)
  }

  return await zip.generateAsync({ type: 'nodebuffer' })
}

// ━━━ 메인 ━━━
async function main() {
  const args = process.argv.slice(2)
  const showRaw = args.includes('--raw')
  const pagesIdx = args.indexOf('--pages')
  const pageRange = pagesIdx !== -1 ? args[pagesIdx + 1] : null

  // test PDF 폴더에서 PDF 파일 찾기
  if (!fs.existsSync(TEST_PDF_DIR)) {
    console.error(`❌ 폴더 없음: ${TEST_PDF_DIR}`)
    process.exit(1)
  }

  const pdfFiles = fs.readdirSync(TEST_PDF_DIR).filter(f => f.toLowerCase().endsWith('.pdf'))
  if (pdfFiles.length === 0) {
    console.error(`❌ test PDF 폴더에 PDF 파일이 없습니다: ${TEST_PDF_DIR}`)
    process.exit(1)
  }

  // result EPUB 폴더 확인
  if (!fs.existsSync(RESULT_EPUB_DIR)) {
    fs.mkdirSync(RESULT_EPUB_DIR, { recursive: true })
  }

  console.log(`\n⚡ TeXTREME 변환 테스트`)
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
  console.log(`  PDF 폴더:  ${TEST_PDF_DIR}`)
  console.log(`  EPUB 폴더: ${RESULT_EPUB_DIR}`)
  console.log(`  PDF 파일:  ${pdfFiles.length}개`)
  if (pageRange) console.log(`  페이지:    ${pageRange}`)
  if (showRaw) console.log(`  모드:      RAW 출력`)
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`)

  for (const pdfFile of pdfFiles) {
    const pdfPath = path.join(TEST_PDF_DIR, pdfFile)
    const title = path.basename(pdfFile, '.pdf')

    // 1. PDF → 이미지
    const images = await pdfToImages(pdfPath, pageRange)

    // 2. Gemini API로 추출
    console.log(`\n🤖 Gemini API 추출 (${GEMINI_MODEL})...\n`)
    const results = []
    let totalInput = 0, totalOutput = 0

    for (const img of images) {
      const startTime = Date.now()
      try {
        const result = await extractPage(img.base64, img.mimeType, img.pageNum, showRaw)
        const elapsed = Date.now() - startTime
        const textLen = result.elements.reduce((s, e) => s + (e.text?.length || 0), 0)

        console.log(`  ✅ p${img.pageNum}: ${result.elements.length} elements, ${textLen} chars, ${elapsed}ms, finish=${result.finishReason}, raw=${result.rawLen}`)

        for (const el of result.elements.slice(0, 3)) {
          const preview = (el.text || el.description || '').slice(0, 70)
          console.log(`     ${el.type}: ${preview}`)
        }
        if (result.elements.length > 3) console.log(`     ... +${result.elements.length - 3} more`)

        totalInput += result.tokens.promptTokenCount || 0
        totalOutput += result.tokens.candidatesTokenCount || 0
        results.push({ pageNum: img.pageNum, elements: result.elements })
      } catch (err) {
        console.log(`  ❌ p${img.pageNum}: ${err.message}`)
        results.push({ pageNum: img.pageNum, elements: [] })
      }
    }

    // 3. 통계
    const costUSD = totalInput / 1e6 * 0.15 + totalOutput / 1e6 * 0.60
    const costKRW = Math.round(costUSD * 1450)
    const totalChars = results.reduce((s, r) => s + r.elements.reduce((s2, e) => s2 + (e.text?.length || 0), 0), 0)
    const emptyPages = results.filter(r => r.elements.length === 0).length

    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
    console.log(`📊 결과: ${title}`)
    console.log(`  페이지: ${results.length}`)
    console.log(`  추출 문자: ${totalChars.toLocaleString()}`)
    console.log(`  빈 페이지: ${emptyPages}`)
    console.log(`  토큰: input ${totalInput.toLocaleString()} / output ${totalOutput.toLocaleString()}`)
    console.log(`  비용: ₩${costKRW} ($${costUSD.toFixed(4)})`)

    // 4. EPUB 저장 → result EPUB 폴더
    const epubBuf = await buildEpub(results, title)
    const outPath = path.join(RESULT_EPUB_DIR, title + '.epub')
    fs.writeFileSync(outPath, epubBuf)
    console.log(`\n📦 EPUB 저장: ${outPath}`)
    console.log(`   크기: ${(epubBuf.length / 1024).toFixed(1)} KB\n`)
  }
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
