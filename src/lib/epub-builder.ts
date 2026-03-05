// src/lib/epub-builder.ts
// 클라이언트에서 EPUB을 빌드하는 유틸리티
// page.tsx와 test/page.tsx에서 공통으로 사용

export interface PageDataForEpub {
  pageNumber: number
  elements: {
    type: 'heading' | 'paragraph' | 'quote' | 'list_item' | 'image_placeholder' | 'caption'
    text?: string
    level?: number
    description?: string
  }[]
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export async function buildEpubOnClient(
  pageResults: PageDataForEpub[],
  title: string,
  pageImages: Map<number, string> // pageNumber → data:image/jpeg;base64,... (data URL)
): Promise<Blob> {
  const JSZip = (await import('jszip')).default
  const zip = new JSZip()

  // mimetype (비압축)
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' })

  // container.xml
  zip.file('META-INF/container.xml',
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">\n' +
    '  <rootfiles>\n' +
    '    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>\n' +
    '  </rootfiles>\n' +
    '</container>'
  )

  // 이미지 파일 추가 + manifest 항목 수집
  const imageManifestItems: string[] = []
  pageImages.forEach((dataUrl, pageNum) => {
    const base64 = dataUrl.split(',')[1]
    if (base64) {
      const binaryStr = atob(base64)
      const bytes = new Uint8Array(binaryStr.length)
      for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i)
      zip.file(`OEBPS/images/page${pageNum}.jpg`, bytes)
      imageManifestItems.push(
        `    <item id="img${pageNum}" href="images/page${pageNum}.jpg" media-type="image/jpeg"/>`
      )
    }
  })

  // content.opf
  const manifestItems = pageResults.map((_, i) =>
    `    <item id="page${i}" href="page${i}.xhtml" media-type="application/xhtml+xml"/>`
  ).join('\n')
  const spineItems = pageResults.map((_, i) =>
    `    <itemref idref="page${i}"/>`
  ).join('\n')
  const allImageManifest = imageManifestItems.length > 0
    ? '\n' + imageManifestItems.join('\n')
    : ''

  zip.file('OEBPS/content.opf',
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">\n' +
    '  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">\n' +
    `    <dc:identifier id="uid">textreme-${Date.now()}</dc:identifier>\n` +
    `    <dc:title>${escapeXml(title)}</dc:title>\n` +
    '    <dc:language>ko</dc:language>\n' +
    '    <dc:creator>TeXTREME Converter</dc:creator>\n' +
    `    <meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d+Z/, 'Z')}</meta>\n` +
    '  </metadata>\n' +
    '  <manifest>\n' +
    '    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>\n' +
    manifestItems + '\n' +
    allImageManifest +
    '\n    <item id="style" href="style.css" media-type="text/css"/>\n' +
    '  </manifest>\n' +
    '  <spine>\n' +
    spineItems + '\n' +
    '  </spine>\n' +
    '</package>'
  )

  // nav.xhtml
  const tocEntries = pageResults
    .map((p, i) => {
      const heading = p.elements.find(e => e.type === 'heading')
      return heading ? { label: heading.text || `페이지 ${p.pageNumber}`, idx: i } : null
    })
    .filter(Boolean) as { label: string; idx: number }[]

  const tocItems = tocEntries.length > 0
    ? tocEntries.map(e =>
      `      <li><a href="page${e.idx}.xhtml">${escapeXml(e.label)}</a></li>`
    ).join('\n')
    : pageResults.filter((_, i) => i % 10 === 0).map((p, i) =>
      `      <li><a href="page${i * 10}.xhtml">페이지 ${p.pageNumber}</a></li>`
    ).join('\n')

  zip.file('OEBPS/nav.xhtml',
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<!DOCTYPE html>\n' +
    '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="ko">\n' +
    '<head><title>목차</title></head>\n' +
    '<body>\n' +
    '  <nav epub:type="toc">\n' +
    '    <h1>목차</h1>\n' +
    '    <ol>\n' +
    tocItems + '\n' +
    '    </ol>\n' +
    '  </nav>\n' +
    '</body>\n' +
    '</html>'
  )

  // style.css
  zip.file('OEBPS/style.css',
    'body { font-family: "Noto Sans KR", system-ui, sans-serif; line-height: 1.8; color: #2D2016; margin: 0; padding: 1em; word-break: keep-all; }\n' +
    'h1 { font-size: 1.6em; font-weight: bold; line-height: 1.35; margin: 1.5em 0 0.75em; }\n' +
    'h2 { font-size: 1.35em; font-weight: bold; line-height: 1.35; margin: 1.5em 0 0.75em; }\n' +
    'h3 { font-size: 1.15em; font-weight: 600; line-height: 1.35; margin: 1.2em 0 0.6em; }\n' +
    'p { margin-bottom: 0.8em; text-indent: 1em; }\n' +
    'blockquote { border-left: 3px solid #ddd; padding-left: 1em; margin: 1em 0; color: #666; font-style: italic; }\n' +
    '.image-placeholder { text-align: center; padding: 2em; margin: 1em 0; background: #f5f5f5; border-radius: 8px; color: #999; font-style: italic; }\n' +
    '.page-image { text-align: center; margin: 1em 0; }\n' +
    '.page-image img { max-width: 100%; height: auto; }\n'
  )

  // 페이지별 XHTML
  for (let i = 0; i < pageResults.length; i++) {
    const page = pageResults[i]
    const hasImage = pageImages.has(page.pageNumber)

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
          return `<p>\u2022 ${escapeXml(el.text || '')}</p>`
        case 'image_placeholder':
          if (hasImage) {
            return `<div class="page-image"><img src="images/page${page.pageNumber}.jpg" alt="${escapeXml(el.description || '이미지')}"/></div>`
          }
          return `<div class="image-placeholder">[\uC774\uBBF8\uC9C0: ${escapeXml(el.description || '이미지')}]</div>`
        case 'caption':
          return `<p><em>${escapeXml(el.text || '')}</em></p>`
        default:
          return `<p>${escapeXml(el.text || '')}</p>`
      }
    }).join('\n    ')

    zip.file(`OEBPS/page${i}.xhtml`,
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<!DOCTYPE html>\n' +
      '<html xmlns="http://www.w3.org/1999/xhtml" lang="ko">\n' +
      '<head>\n' +
      `  <title>\uD398\uC774\uC9C0 ${page.pageNumber}</title>\n` +
      '  <link rel="stylesheet" href="style.css"/>\n' +
      '</head>\n' +
      '<body>\n' +
      '    ' + bodyHtml + '\n' +
      '</body>\n' +
      '</html>'
    )
  }

  return await zip.generateAsync({ type: 'blob', mimeType: 'application/epub+zip' })
}

// 필요한 페이지만 이미지로 렌더링
export async function renderPageImages(
  file: File,
  pageNumbers: number[],
  onProgress?: (msg: string) => void,
): Promise<Map<number, string>> {
  const result = new Map<number, string>()
  if (pageNumbers.length === 0) return result

  const pdfjsLib = await import('pdfjs-dist')
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

  const arrayBuffer = await file.arrayBuffer()
  const pdfDoc = await pdfjsLib.getDocument({
    data: arrayBuffer,
    cMapUrl: 'https://unpkg.com/pdfjs-dist/cmaps/',
    cMapPacked: true,
  }).promise

  for (const pageNum of pageNumbers) {
    try {
      const page = await pdfDoc.getPage(pageNum)
      const viewport = page.getViewport({ scale: 1.5 })
      const canvas = document.createElement('canvas')
      canvas.width = viewport.width
      canvas.height = viewport.height
      const ctx = canvas.getContext('2d')!
      await page.render({ canvasContext: ctx, viewport, canvas } as any).promise
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
      result.set(pageNum, dataUrl)
      canvas.remove()
      onProgress?.(`이미지 렌더링: p${pageNum}`)
    } catch {
      onProgress?.(`이미지 렌더링 실패: p${pageNum}`)
    }
  }

  return result
}
