// lib/text-to-epub.ts
// txt/docx → EPUB 3 자동변환 (클라이언트 사이드, JSZip 사용)

import JSZip from 'jszip'
import mammoth from 'mammoth'

// ━━━ EPUB 구조 헬퍼 ━━━

interface Chapter {
  id: string
  title: string
  html: string
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function buildChapterXhtml(title: string, bodyHtml: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="ko">
<head>
  <meta charset="UTF-8"/>
  <title>${escapeXml(title)}</title>
</head>
<body>
${bodyHtml}
</body>
</html>`
}

function buildContainerXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`
}

function buildContentOpf(title: string, author: string, chapters: Chapter[]): string {
  const manifestItems = chapters
    .map(ch => `    <item id="${ch.id}" href="${ch.id}.xhtml" media-type="application/xhtml+xml"/>`)
    .join('\n')

  const spineItems = chapters
    .map(ch => `    <itemref idref="${ch.id}"/>`)
    .join('\n')

  const uuid = crypto.randomUUID ? crypto.randomUUID() : `textry-${Date.now()}`

  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">urn:uuid:${uuid}</dc:identifier>
    <dc:title>${escapeXml(title)}</dc:title>
    <dc:creator>${escapeXml(author)}</dc:creator>
    <dc:language>ko</dc:language>
    <meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d{3}Z/, 'Z')}</meta>
  </metadata>
  <manifest>
    <item id="toc" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
${manifestItems}
  </manifest>
  <spine toc="toc">
${spineItems}
  </spine>
</package>`
}

function buildTocNcx(title: string, chapters: Chapter[]): string {
  const uuid = `textry-${Date.now()}`
  const navPoints = chapters
    .map((ch, i) => `    <navPoint id="navpoint-${i + 1}" playOrder="${i + 1}">
      <navLabel><text>${escapeXml(ch.title)}</text></navLabel>
      <content src="${ch.id}.xhtml"/>
    </navPoint>`)
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="urn:uuid:${uuid}"/>
  </head>
  <docTitle><text>${escapeXml(title)}</text></docTitle>
  <navMap>
${navPoints}
  </navMap>
</ncx>`
}

function buildNavXhtml(chapters: Chapter[]): string {
  const items = chapters
    .map(ch => `      <li><a href="${ch.id}.xhtml">${escapeXml(ch.title)}</a></li>`)
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="ko">
<head><meta charset="UTF-8"/><title>목차</title></head>
<body>
  <nav epub:type="toc">
    <h1>목차</h1>
    <ol>
${items}
    </ol>
  </nav>
</body>
</html>`
}

function packEpub(title: string, author: string, chapters: Chapter[]): Promise<Blob> {
  const zip = new JSZip()

  // mimetype은 압축 없이 첫 번째로
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' })

  // META-INF
  zip.file('META-INF/container.xml', buildContainerXml())

  // OEBPS
  zip.file('OEBPS/content.opf', buildContentOpf(title, author, chapters))
  zip.file('OEBPS/toc.ncx', buildTocNcx(title, chapters))
  zip.file('OEBPS/nav.xhtml', buildNavXhtml(chapters))

  // 챕터 파일
  for (const ch of chapters) {
    zip.file(`OEBPS/${ch.id}.xhtml`, buildChapterXhtml(ch.title, ch.html))
  }

  return zip.generateAsync({
    type: 'blob',
    mimeType: 'application/epub+zip',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
  })
}

// ━━━ TXT → EPUB ━━━

function splitTxtIntoChapters(text: string): Chapter[] {
  // 1차: "Chapter N", "제N장", "제N화", "N장", "N화", "--- 구분선" 등으로 분리 시도
  const chapterPattern = /^(?:chapter\s+\d+|제\s*\d+\s*[장화편부]|제\s*[일이삼사오육칠팔구십백]+\s*[장화편부]|\d+\s*[장화편부]|#{1,3}\s+.+|={3,}|-{3,}|★{3,}|◆{3,})/im

  const lines = text.split('\n')
  const sections: { title: string; lines: string[] }[] = []
  let currentTitle = ''
  let currentLines: string[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed && chapterPattern.test(trimmed)) {
      // 이전 섹션 저장
      if (currentLines.some(l => l.trim().length > 0)) {
        sections.push({
          title: currentTitle || `챕터 ${sections.length + 1}`,
          lines: [...currentLines],
        })
      }
      // 구분선이면 제목 없음, 아니면 해당 줄이 제목
      if (/^[-=★◆]{3,}$/.test(trimmed)) {
        currentTitle = ''
      } else {
        currentTitle = trimmed.replace(/^#{1,3}\s+/, '')
      }
      currentLines = []
    } else {
      currentLines.push(line)
    }
  }

  // 마지막 섹션
  if (currentLines.some(l => l.trim().length > 0)) {
    sections.push({
      title: currentTitle || `챕터 ${sections.length + 1}`,
      lines: [...currentLines],
    })
  }

  // 챕터 패턴으로 분리되지 않았거나 1개뿐이면 → 빈 줄 2개 이상 기준으로 재분리
  if (sections.length <= 1) {
    const chunks = text.split(/\n\s*\n\s*\n/).filter(c => c.trim().length > 0)
    if (chunks.length > 1 && chunks.length <= 100) {
      return chunks.map((chunk, i) => {
        const chunkLines = chunk.trim().split('\n')
        // 첫 줄이 짧으면 제목으로
        const firstLine = chunkLines[0]?.trim() || ''
        const isTitle = firstLine.length > 0 && firstLine.length <= 50 && chunkLines.length > 1

        const title = isTitle ? firstLine : `챕터 ${i + 1}`
        const bodyLines = isTitle ? chunkLines.slice(1) : chunkLines
        const bodyHtml = bodyLines
          .map(l => l.trim())
          .filter(l => l.length > 0)
          .map(l => `<p>${escapeXml(l)}</p>`)
          .join('\n')

        return { id: `chapter-${i + 1}`, title, html: isTitle ? `<h1>${escapeXml(title)}</h1>\n${bodyHtml}` : bodyHtml }
      })
    }

    // 분리 불가 → 단일 챕터
    const bodyHtml = text
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0)
      .map(l => `<p>${escapeXml(l)}</p>`)
      .join('\n')

    return [{ id: 'chapter-1', title: sections[0]?.title || '본문', html: bodyHtml }]
  }

  // 정상 챕터 분리
  return sections.map((sec, i) => {
    const bodyHtml = sec.lines
      .map(l => l.trim())
      .filter(l => l.length > 0)
      .map(l => `<p>${escapeXml(l)}</p>`)
      .join('\n')

    const title = sec.title || `챕터 ${i + 1}`
    return {
      id: `chapter-${i + 1}`,
      title,
      html: `<h1>${escapeXml(title)}</h1>\n${bodyHtml}`,
    }
  })
}

export async function convertTxtToEpub(
  text: string,
  title: string,
  author: string
): Promise<Blob> {
  const chapters = splitTxtIntoChapters(text)
  return packEpub(title, author, chapters)
}

// ━━━ DOCX → EPUB ━━━

function splitHtmlIntoChapters(html: string): Chapter[] {
  // h1/h2 기준으로 챕터 분리
  // <h1>...</h1> 또는 <h2>...</h2>를 만나면 새 챕터 시작
  const headingRegex = /<(h[12])[^>]*>(.*?)<\/\1>/gi
  const matches: { index: number; tag: string; text: string }[] = []

  let match: RegExpExecArray | null
  while ((match = headingRegex.exec(html)) !== null) {
    matches.push({ index: match.index, tag: match[1], text: match[2].replace(/<[^>]*>/g, '').trim() })
  }

  if (matches.length === 0) {
    // 제목 태그 없음 → 단일 챕터
    return [{ id: 'chapter-1', title: '본문', html: html }]
  }

  const chapters: Chapter[] = []

  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index
    const end = i + 1 < matches.length ? matches[i + 1].index : html.length
    const chapterHtml = html.slice(start, end).trim()

    if (chapterHtml.replace(/<[^>]*>/g, '').trim().length < 5) continue

    chapters.push({
      id: `chapter-${i + 1}`,
      title: matches[i].text || `챕터 ${i + 1}`,
      html: chapterHtml,
    })
  }

  // h1/h2 전에 내용이 있으면 첫 챕터 앞에 추가
  if (matches.length > 0 && matches[0].index > 0) {
    const preamble = html.slice(0, matches[0].index).trim()
    if (preamble.replace(/<[^>]*>/g, '').trim().length >= 5) {
      chapters.unshift({
        id: 'chapter-0',
        title: '서문',
        html: preamble,
      })
    }
  }

  if (chapters.length === 0) {
    return [{ id: 'chapter-1', title: '본문', html: html }]
  }

  return chapters
}

export async function convertDocxToEpub(
  arrayBuffer: ArrayBuffer,
  title: string,
  author: string
): Promise<Blob> {
  const result = await mammoth.convertToHtml({ arrayBuffer })
  const html = result.value

  if (!html || html.replace(/<[^>]*>/g, '').trim().length < 5) {
    throw new Error('DOCX 파일에서 텍스트를 추출할 수 없습니다.')
  }

  const chapters = splitHtmlIntoChapters(html)
  return packEpub(title, author, chapters)
}
