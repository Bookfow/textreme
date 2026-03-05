// src/lib/epub-builder.ts
// 클라이언트에서 EPUB을 빌드하는 유틸리티
// page.tsx와 test/page.tsx에서 공통으로 사용
//
// ★ 방법 B: PDF에서 개별 이미지 객체를 직접 추출 (전체 페이지 이미지 X)

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

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PDF에서 개별 이미지 객체 추출
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// 한 페이지에서 이미지 객체들을 추출하여 dataURL 배열로 반환
async function extractImagesFromPage(
  pdfDoc: any, // PDFDocumentProxy
  pdfjsLib: any,
  pageNum: number,
  onDebug?: (msg: string) => void,
): Promise<string[]> {
  const page = await pdfDoc.getPage(pageNum)
  const viewport = page.getViewport({ scale: 1.5 })

  // render를 호출해야 이미지 객체가 로드됨
  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height
  const ctx = canvas.getContext('2d')!
  await page.render({ canvasContext: ctx, viewport, canvas } as any).promise

  // operator list에서 이미지 찾기
  const ops = await page.getOperatorList()
  const OPS = pdfjsLib.OPS
  const images: string[] = []
  const processedNames = new Set<string>()

  // ★ 디버그: 어떤 operator가 있는지 로그
  const opNames: Record<number, string> = {}
  for (const [name, code] of Object.entries(OPS)) {
    opNames[code as number] = name as string
  }
  const imageFns = ops.fnArray
    .map((fn: number, i: number) => ({ fn, name: opNames[fn] || 'unknown', args: ops.argsArray[i] }))
    .filter((o: any) => o.name.toLowerCase().includes('image') || o.name.toLowerCase().includes('paint'))
  if (onDebug) {
    onDebug(`  [debug] p${pageNum}: ${ops.fnArray.length} operators, ${imageFns.length} image-related`)
    imageFns.forEach((o: any) => onDebug(`  [debug]   ${o.name}(${o.fn}): args=${JSON.stringify(o.args).slice(0, 100)}`))
  }

  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i]
    if (fn !== OPS.paintImageXObject && fn !== OPS.paintJpegXObject) continue

    const imgName = ops.argsArray[i][0]
    if (processedNames.has(imgName)) continue
    processedNames.add(imgName)

    try {
      let imgObj: any = null
      try { imgObj = page.objs.get(imgName) } catch {}
      if (onDebug) onDebug(`  [debug]   obj ${imgName}: type=${imgObj ? typeof imgObj : "null"}, constructor=${imgObj?.constructor?.name || "N/A"}, keys=${imgObj ? Object.keys(imgObj).slice(0, 5).join(",") : "N/A"}`)
      if (!imgObj) continue

      // JPEG 이미지 (HTMLImageElement 또는 ImageBitmap)
      if (typeof HTMLImageElement !== 'undefined' && imgObj instanceof HTMLImageElement) {
        const w = imgObj.naturalWidth
        const h = imgObj.naturalHeight
        if (w < 50 || h < 50) continue // 작은 아이콘 제외
        const imgCanvas = document.createElement('canvas')
        imgCanvas.width = w
        imgCanvas.height = h
        const imgCtx = imgCanvas.getContext('2d')!
        imgCtx.drawImage(imgObj, 0, 0)
        images.push(imgCanvas.toDataURL('image/jpeg', 0.85))
        imgCanvas.remove()
        continue
      }

      if (typeof ImageBitmap !== 'undefined' && imgObj instanceof ImageBitmap) {
        if (imgObj.width < 50 || imgObj.height < 50) continue
        const imgCanvas = document.createElement('canvas')
        imgCanvas.width = imgObj.width
        imgCanvas.height = imgObj.height
        const imgCtx = imgCanvas.getContext('2d')!
        imgCtx.drawImage(imgObj, 0, 0)
        images.push(imgCanvas.toDataURL('image/jpeg', 0.85))
        imgCanvas.remove()
        continue
      }

      // Raw 이미지 데이터 {width, height, data, kind}
      if (imgObj.width && imgObj.height && imgObj.data) {
        if (imgObj.width < 50 || imgObj.height < 50) continue

        const imgCanvas = document.createElement('canvas')
        imgCanvas.width = imgObj.width
        imgCanvas.height = imgObj.height
        const imgCtx = imgCanvas.getContext('2d')!

        let rgba: Uint8ClampedArray
        const pixelCount = imgObj.width * imgObj.height

        if (imgObj.kind === 3) {
          // RGBA_32BPP
          rgba = new Uint8ClampedArray(imgObj.data.buffer || imgObj.data)
        } else if (imgObj.kind === 2) {
          // RGB_24BPP → RGBA 변환
          const rgb = imgObj.data
          rgba = new Uint8ClampedArray(pixelCount * 4)
          for (let j = 0, k = 0; j < pixelCount * 3; j += 3, k += 4) {
            rgba[k] = rgb[j]
            rgba[k + 1] = rgb[j + 1]
            rgba[k + 2] = rgb[j + 2]
            rgba[k + 3] = 255
          }
        } else if (imgObj.kind === 1) {
          // GRAYSCALE_1BPP → RGBA 변환
          const gray = imgObj.data
          rgba = new Uint8ClampedArray(pixelCount * 4)
          for (let j = 0; j < pixelCount; j++) {
            const idx = j * 4
            rgba[idx] = gray[j]
            rgba[idx + 1] = gray[j]
            rgba[idx + 2] = gray[j]
            rgba[idx + 3] = 255
          }
        } else {
          // 알 수 없는 kind → RGBA로 가정
          rgba = new Uint8ClampedArray(imgObj.data.buffer || imgObj.data)
        }

        const imageData = new ImageData(new Uint8ClampedArray(rgba.buffer as ArrayBuffer), imgObj.width, imgObj.height)
        imgCtx.putImageData(imageData, 0, 0)
        images.push(imgCanvas.toDataURL('image/jpeg', 0.85))
        imgCanvas.remove()
      }
    } catch {
      // 개별 이미지 추출 실패 → 건너뛰기
    }
  }

  canvas.remove()
  return images
}

// 여러 페이지에서 이미지 추출
export async function extractPageImages(
  file: File,
  pageNumbers: number[],
  onProgress?: (msg: string) => void,
): Promise<Map<number, string[]>> {
  const result = new Map<number, string[]>()
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
      const images = await extractImagesFromPage(pdfDoc, pdfjsLib, pageNum, onProgress)
      if (images.length > 0) {
        result.set(pageNum, images)
        onProgress?.(`p${pageNum}: ${images.length}개 이미지 추출`)
      } else {
        onProgress?.(`p${pageNum}: 추출 가능한 이미지 없음`)
      }
    } catch {
      onProgress?.(`p${pageNum}: 이미지 추출 실패`)
    }
  }

  return result
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 클라이언트 EPUB 빌더
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export async function buildEpubOnClient(
  pageResults: PageDataForEpub[],
  title: string,
  pageImages: Map<number, string[]> // pageNumber → dataURL 배열
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
  pageImages.forEach((imageUrls, pageNum) => {
    imageUrls.forEach((dataUrl, idx) => {
      const base64 = dataUrl.split(',')[1]
      if (base64) {
        const binaryStr = atob(base64)
        const bytes = new Uint8Array(binaryStr.length)
        for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i)
        zip.file(`OEBPS/images/p${pageNum}_${idx}.jpg`, bytes)
        imageManifestItems.push(
          `    <item id="img_p${pageNum}_${idx}" href="images/p${pageNum}_${idx}.jpg" media-type="image/jpeg"/>`
        )
      }
    })
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
      return heading ? { label: heading.text || `\uD398\uC774\uC9C0 ${p.pageNumber}`, idx: i } : null
    })
    .filter(Boolean) as { label: string; idx: number }[]

  const tocItems = tocEntries.length > 0
    ? tocEntries.map(e =>
      `      <li><a href="page${e.idx}.xhtml">${escapeXml(e.label)}</a></li>`
    ).join('\n')
    : pageResults.filter((_, i) => i % 10 === 0).map((p, i) =>
      `      <li><a href="page${i * 10}.xhtml">\uD398\uC774\uC9C0 ${p.pageNumber}</a></li>`
    ).join('\n')

  zip.file('OEBPS/nav.xhtml',
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<!DOCTYPE html>\n' +
    '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="ko">\n' +
    '<head><title>\uBAA9\uCC28</title></head>\n' +
    '<body>\n' +
    '  <nav epub:type="toc">\n' +
    '    <h1>\uBAA9\uCC28</h1>\n' +
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
    const images = pageImages.get(page.pageNumber) || []
    let imgIdx = 0 // image_placeholder 순서 카운터

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
        case 'image_placeholder': {
          // ★ 추출된 이미지가 있으면 순서대로 매칭
          if (imgIdx < images.length) {
            const currentIdx = imgIdx
            imgIdx++
            return `<div class="page-image"><img src="images/p${page.pageNumber}_${currentIdx}.jpg" alt="${escapeXml(el.description || '\uC774\uBBF8\uC9C0')}"/></div>`
          }
          return `<div class="image-placeholder">[\uC774\uBBF8\uC9C0: ${escapeXml(el.description || '\uC774\uBBF8\uC9C0')}]</div>`
        }
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
