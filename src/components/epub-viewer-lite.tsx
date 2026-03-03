// components/epub-viewer-lite.tsx
// TeXTREME 경량 EPUB 뷰어
// 텍스트림 epub-viewer.tsx에서 Supabase/Auth/하이라이트DB 제거
// 핵심 기능만: EPUB 파싱, CSS column 페이지네이션, 설정, TOC, 스와이프

'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { ChevronLeft, ChevronRight, Minus, Plus, List, AlignLeft, AlignJustify, Settings2, X } from 'lucide-react'
import JSZip from 'jszip'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 타입 & 상수
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface EpubViewerLiteProps {
  /** EPUB 파일 URL 또는 Blob URL */
  epubUrl: string
  /** 페이지 변경 콜백 */
  onPageChange?: (page: number, total: number) => void
  /** 문서 로드 완료 콜백 */
  onDocumentLoad?: (numPages: number) => void
  /** 에러 콜백 */
  onError?: (error: string) => void
}

interface EpubChapter {
  id: string
  href: string
  title: string
  html: string
  order: number
}

interface TocItem {
  title: string
  href: string
  chapterIndex: number
  level: number
}

type ReflowFont = 'sans' | 'serif' | 'mono'
type ReflowTheme = 'light' | 'sepia' | 'dark'
type ReflowAlign = 'left' | 'justify'

const FONTS: Record<ReflowFont, { label: string; family: string }> = {
  sans: { label: '고딕', family: 'system-ui, -apple-system, "Noto Sans KR", sans-serif' },
  serif: { label: '명조', family: '"Noto Serif KR", "Batang", Georgia, serif' },
  mono: { label: '고정폭', family: '"Noto Sans Mono", "D2Coding", monospace' },
}

const THEMES: Record<ReflowTheme, {
  bg: string; text: string; muted: string; border: string
  pageBg: string; headingColor: string; linkColor: string
}> = {
  light: { bg: '#FFFFFF', text: '#2D2016', muted: '#9C8B7A', border: '#E7D8C9', pageBg: '#F7F2EF', headingColor: '#2D2016', linkColor: '#3b82f6' },
  sepia: { bg: '#f8f1e3', text: '#5b4636', muted: '#8b7355', border: '#d4c5a9', pageBg: '#ede4d3', headingColor: '#3d2b1f', linkColor: '#8b5e3c' },
  dark: { bg: '#241E18', text: '#EEE4E1', muted: '#9C8B7A', border: '#3A302A', pageBg: '#1A1410', headingColor: '#EEE4E1', linkColor: '#93c5fd' },
}

const MAX_WIDTH = '42rem'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// EPUB 파싱 유틸 (텍스트림과 동일)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function parseXml(xmlStr: string): Document {
  return new DOMParser().parseFromString(xmlStr, 'application/xml')
}
function parseHtml(htmlStr: string): Document {
  return new DOMParser().parseFromString(htmlStr, 'text/html')
}
function resolveEpubPath(basePath: string, relativePath: string): string {
  if (relativePath.startsWith('/')) return relativePath.slice(1)
  const baseDir = basePath.substring(0, basePath.lastIndexOf('/') + 1)
  const parts = (baseDir + relativePath).split('/')
  const resolved: string[] = []
  for (const part of parts) {
    if (part === '..') resolved.pop()
    else if (part !== '.' && part !== '') resolved.push(part)
  }
  return resolved.join('/')
}
function getOpfPathFromContainer(containerXml: string): string {
  const doc = parseXml(containerXml)
  return doc.querySelector('rootfile')?.getAttribute('full-path') || 'OEBPS/content.opf'
}
function parseOpf(opfXml: string, opfDir: string) {
  const doc = parseXml(opfXml)
  const manifestItems = new Map<string, { href: string; mediaType: string }>()
  doc.querySelectorAll('manifest > item').forEach(el => {
    const id = el.getAttribute('id') || ''
    const href = el.getAttribute('href') || ''
    const mediaType = el.getAttribute('media-type') || ''
    if (id && href) manifestItems.set(id, { href: resolveEpubPath(opfDir + '/dummy', href), mediaType })
  })
  const spineItemRefs: string[] = []
  doc.querySelectorAll('spine > itemref').forEach(el => {
    const idref = el.getAttribute('idref') || ''
    if (idref) spineItemRefs.push(idref)
  })
  const spineItems = spineItemRefs
    .map(idref => { const item = manifestItems.get(idref); return item ? { id: idref, ...item } : null })
    .filter(Boolean) as { id: string; href: string; mediaType: string }[]
  let tocHref: string | null = null
  let tocType: 'ncx' | 'nav' | null = null
  const navEl = Array.from(doc.querySelectorAll('manifest > item')).find(el => (el.getAttribute('properties') || '').includes('nav'))
  if (navEl) { tocHref = resolveEpubPath(opfDir + '/dummy', navEl.getAttribute('href') || ''); tocType = 'nav' }
  if (!tocHref) {
    for (const [, item] of manifestItems) {
      if (item.mediaType === 'application/x-dtbncx+xml') { tocHref = item.href; tocType = 'ncx'; break }
    }
  }
  return { manifestItems, spineItems, tocHref, tocType }
}
function parseTocNcx(ncxXml: string, ncxDir: string): TocItem[] {
  const doc = parseXml(ncxXml)
  const items: TocItem[] = []
  function walk(parentEl: Element, level: number) {
    parentEl.querySelectorAll(':scope > navPoint').forEach(np => {
      const label = np.querySelector('navLabel > text')?.textContent?.trim() || ''
      const src = np.querySelector('content')?.getAttribute('src') || ''
      if (label && src) items.push({ title: label, href: resolveEpubPath(ncxDir + '/dummy', src), chapterIndex: -1, level })
      walk(np, level + 1)
    })
  }
  const navMap = doc.querySelector('navMap')
  if (navMap) walk(navMap, 0)
  return items
}
function parseTocNav(navHtml: string, navDir: string): TocItem[] {
  const doc = parseHtml(navHtml)
  const items: TocItem[] = []
  const navEl = doc.querySelector('nav[*|type="toc"]') || doc.querySelector('nav')
  if (!navEl) return items
  function walkOl(ol: Element, level: number) {
    ol.querySelectorAll(':scope > li').forEach(li => {
      const a = li.querySelector(':scope > a')
      if (a) {
        const title = a.textContent?.trim() || ''
        const href = a.getAttribute('href') || ''
        if (title && href) items.push({ title, href: resolveEpubPath(navDir + '/dummy', href), chapterIndex: -1, level })
      }
      const childOl = li.querySelector(':scope > ol')
      if (childOl) walkOl(childOl, level + 1)
    })
  }
  const rootOl = navEl.querySelector('ol')
  if (rootOl) walkOl(rootOl, 0)
  return items
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 메인 컴포넌트
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default function EpubViewerLite({ epubUrl, onPageChange, onDocumentLoad, onError }: EpubViewerLiteProps) {
  const [chapters, setChapters] = useState<EpubChapter[]>([])
  const [tocItems, setTocItems] = useState<TocItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadProgress, setLoadProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const [currentChapterIdx, setCurrentChapterIdx] = useState(0)
  const [pageInChapter, setPageInChapter] = useState(0)
  const [totalPagesInChapter, setTotalPagesInChapter] = useState(1)
  const [chapterPageCounts, setChapterPageCounts] = useState<number[]>([])
  const slideDirectionRef = useRef<'left' | 'right' | ''>('')

  const [fontSize, setFontSize] = useState(18)
  const [lineHeight, setLineHeight] = useState(1.8)
  const [font, setFont] = useState<ReflowFont>('sans')
  const [theme, setTheme] = useState<ReflowTheme>('dark')
  const [showSettings, setShowSettings] = useState(false)
  const [marginSize, setMarginSize] = useState(40)
  const [letterSpacing, setLetterSpacing] = useState(0)
  const [textAlign, setTextAlign] = useState<ReflowAlign>('left')
  const [showToc, setShowToc] = useState(false)

  const touchStartRef = useRef<{ x: number; y: number } | null>(null)
  const touchEndRef = useRef<{ x: number; y: number } | null>(null)
  const paginationContainerRef = useRef<HTMLDivElement>(null)
  const contentColumnRef = useRef<HTMLDivElement>(null)
  const mouseDownPosRef = useRef<{ x: number; y: number } | null>(null)
  const blobUrlsRef = useRef<string[]>([])
  const [columnWidthPx, setColumnWidthPx] = useState(0)

  const themeStyle = THEMES[theme]
  const fontStyle = FONTS[font]

  // ━━━ 가상 페이지 번호 ━━━
  const virtualPageNumber = useMemo(() => {
    let page = 1
    for (let i = 0; i < currentChapterIdx; i++) page += chapterPageCounts[i] || 1
    page += pageInChapter
    return page
  }, [currentChapterIdx, pageInChapter, chapterPageCounts])

  const virtualTotalPages = useMemo(() => {
    if (chapterPageCounts.length === 0) return chapters.length || 1
    return Math.max(chapterPageCounts.reduce((s, c) => s + (c || 1), 0), 1)
  }, [chapters, chapterPageCounts])

  // ━━━ 설정 localStorage ━━━
  useEffect(() => {
    try {
      const saved = localStorage.getItem('textreme_reader_settings')
      if (saved) {
        const s = JSON.parse(saved)
        if (s.fontSize) setFontSize(s.fontSize)
        if (s.lineHeight) setLineHeight(s.lineHeight)
        if (s.font) setFont(s.font)
        if (s.theme) setTheme(s.theme)
        if (s.marginSize) setMarginSize(s.marginSize)
        if (s.letterSpacing !== undefined) setLetterSpacing(s.letterSpacing)
        if (s.textAlign) setTextAlign(s.textAlign)
      }
    } catch {}
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem('textreme_reader_settings', JSON.stringify({
        fontSize, lineHeight, font, theme, marginSize, letterSpacing, textAlign,
      }))
    } catch {}
  }, [fontSize, lineHeight, font, theme, marginSize, letterSpacing, textAlign])

  useEffect(() => {
    if (chapters.length === 0) return
    if (onPageChange) onPageChange(virtualPageNumber, virtualTotalPages)
  }, [virtualPageNumber, virtualTotalPages, chapters.length])

  // ━━━ EPUB 로드 ━━━
  useEffect(() => {
    if (!epubUrl) return
    let cancelled = false
    const loadEpub = async () => {
      setLoading(true); setLoadProgress(0); setError(null)
      try {
        setLoadProgress(5)
        const response = await fetch(epubUrl)
        if (!response.ok) throw new Error(`EPUB 다운로드 실패: ${response.status}`)
        const arrayBuffer = await response.arrayBuffer()
        if (cancelled) return

        setLoadProgress(15)
        const zip = await JSZip.loadAsync(arrayBuffer)
        if (cancelled) return

        setLoadProgress(20)
        const containerFile = zip.file('META-INF/container.xml')
        if (!containerFile) throw new Error('container.xml을 찾을 수 없습니다')
        const containerXml = await containerFile.async('string')
        const opfPath = getOpfPathFromContainer(containerXml)
        const opfDir = opfPath.substring(0, opfPath.lastIndexOf('/'))

        setLoadProgress(25)
        const opfFile = zip.file(opfPath)
        if (!opfFile) throw new Error('OPF 파일을 찾을 수 없습니다')
        const opfXml = await opfFile.async('string')
        const { manifestItems, spineItems, tocHref, tocType } = parseOpf(opfXml, opfDir)
        if (cancelled) return

        // 이미지 → blob URL
        setLoadProgress(30)
        const blobUrlMap = new Map<string, string>()
        const imageItems = Array.from(manifestItems.values()).filter(item => item.mediaType.startsWith('image/'))
        for (let i = 0; i < imageItems.length; i++) {
          if (cancelled) return
          const item = imageItems[i]
          const file = zip.file(item.href)
          if (file) {
            try {
              const blob = await file.async('blob')
              const url = URL.createObjectURL(new Blob([blob], { type: item.mediaType }))
              blobUrlMap.set(item.href, url)
              blobUrlsRef.current.push(url)
            } catch {}
          }
          setLoadProgress(30 + Math.round((i / Math.max(imageItems.length, 1)) * 20))
        }

        // 챕터 추출
        setLoadProgress(60)
        const parsedChapters: EpubChapter[] = []
        for (let i = 0; i < spineItems.length; i++) {
          if (cancelled) return
          const spine = spineItems[i]
          const chapterFile = zip.file(spine.href)
          if (!chapterFile) continue
          try {
            const rawHtml = await chapterFile.async('string')
            const doc = parseHtml(rawHtml)
            const body = doc.querySelector('body')
            if (!body) continue
            const textContent = body.textContent?.trim() || ''
            if (textContent.length < 3 && !body.querySelector('img, svg, image')) continue
            const chapterDir = spine.href.substring(0, spine.href.lastIndexOf('/'))
            body.querySelectorAll('img, image, svg image').forEach(img => {
              const srcAttr = img.getAttribute('src') || img.getAttribute('xlink:href') || img.getAttribute('href') || ''
              if (srcAttr && !srcAttr.startsWith('blob:') && !srcAttr.startsWith('http')) {
                const resolved = resolveEpubPath(chapterDir + '/dummy', srcAttr)
                const blobUrl = blobUrlMap.get(resolved)
                if (blobUrl) {
                  if (img.tagName.toLowerCase() === 'img') img.setAttribute('src', blobUrl)
                  else { img.setAttribute('xlink:href', blobUrl); img.setAttribute('href', blobUrl) }
                }
              }
            })
            body.querySelectorAll('a[href]').forEach(a => {
              const href = a.getAttribute('href') || ''
              if (href && !href.startsWith('http') && !href.startsWith('mailto:')) {
                a.removeAttribute('href'); a.setAttribute('role', 'text')
                ;(a as HTMLElement).style.cursor = 'default'
              }
            })
            let title = ''
            const h = body.querySelector('h1, h2, h3')
            if (h) title = h.textContent?.trim().slice(0, 60) || ''
            if (!title) title = textContent.slice(0, 50) + (textContent.length > 50 ? '...' : '')
            body.querySelectorAll('style, link[rel="stylesheet"]').forEach(el => el.remove())
            body.querySelectorAll('[style]').forEach(el => {
              const s = (el as HTMLElement).style
              s.removeProperty('user-select'); s.removeProperty('-webkit-user-select')
              s.removeProperty('background'); s.removeProperty('background-color')
              s.removeProperty('color'); s.removeProperty('font-size'); s.removeProperty('font-family')
            })
            parsedChapters.push({ id: spine.id, href: spine.href, title, html: body.innerHTML, order: parsedChapters.length })
          } catch (err) { console.warn('챕터 파싱 실패:', spine.href, err) }
          setLoadProgress(60 + Math.round((i / spineItems.length) * 30))
        }
        if (cancelled) return
        if (parsedChapters.length === 0) throw new Error('읽을 수 있는 챕터가 없습니다')

        // TOC
        setLoadProgress(92)
        let parsedToc: TocItem[] = []
        if (tocHref && tocType) {
          const tocFile = zip.file(tocHref)
          if (tocFile) {
            try {
              const tocContent = await tocFile.async('string')
              const tocDir = tocHref.substring(0, tocHref.lastIndexOf('/'))
              parsedToc = tocType === 'ncx' ? parseTocNcx(tocContent, tocDir) : parseTocNav(tocContent, tocDir)
            } catch {}
          }
        }
        for (const item of parsedToc) {
          const tocBase = item.href.split('#')[0]
          const idx = parsedChapters.findIndex(ch => {
            const chBase = ch.href.split('#')[0]
            return chBase === tocBase || chBase.endsWith(tocBase) || tocBase.endsWith(chBase)
          })
          item.chapterIndex = idx >= 0 ? idx : -1
        }
        if (parsedToc.length === 0) {
          parsedToc = parsedChapters.map((ch, i) => ({ title: ch.title || `챕터 ${i + 1}`, href: ch.href, chapterIndex: i, level: 0 }))
        }

        setLoadProgress(100)
        setChapters(parsedChapters)
        setTocItems(parsedToc)
        setChapterPageCounts(new Array(parsedChapters.length).fill(1))
        setLoading(false)
        if (onDocumentLoad) onDocumentLoad(parsedChapters.length)
      } catch (err: any) {
        if (!cancelled) {
          const msg = err.message || 'EPUB을 불러올 수 없습니다'
          setError(msg); setLoading(false); if (onError) onError(msg)
        }
      }
    }
    loadEpub()
    return () => { cancelled = true; blobUrlsRef.current.forEach(url => { try { URL.revokeObjectURL(url) } catch {} }); blobUrlsRef.current = [] }
  }, [epubUrl])

  // ━━━ CSS column 페이지네이션 ━━━
  const recalcPages = useCallback(() => {
    const container = paginationContainerRef.current
    const colEl = contentColumnRef.current
    if (!container || !colEl) return
    const style = getComputedStyle(container)
    const contentWidth = container.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0)
    if (contentWidth <= 0) return
    const gap = 40
    colEl.style.columnWidth = `${contentWidth}px`
    colEl.style.columnGap = `${gap}px`
    setColumnWidthPx(contentWidth + gap)
    const pageWidth = contentWidth + gap
    const totalPages = Math.max(1, Math.round(colEl.scrollWidth / pageWidth))
    setTotalPagesInChapter(totalPages)
    setChapterPageCounts(prev => {
      const next = [...prev]; while (next.length <= currentChapterIdx) next.push(1)
      next[currentChapterIdx] = totalPages; return next
    })
    setPageInChapter(prev => Math.min(prev, totalPages - 1))
  }, [currentChapterIdx])

  useEffect(() => {
    if (chapters.length === 0) return
    const timer = setTimeout(recalcPages, 10)
    return () => clearTimeout(timer)
  }, [currentChapterIdx, chapters, recalcPages, fontSize, lineHeight, font, marginSize, letterSpacing, textAlign])

  useEffect(() => {
    const handleResize = () => recalcPages()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [recalcPages])

  // 페이지 슬라이드 애니메이션
  useEffect(() => {
    const colEl = contentColumnRef.current
    if (!colEl || columnWidthPx <= 0) return
    const direction = slideDirectionRef.current; slideDirectionRef.current = ''
    const targetX = pageInChapter * columnWidthPx
    if (direction) {
      const offset = direction === 'left' ? 40 : -40
      colEl.style.transition = 'none'; colEl.style.opacity = '0'
      colEl.style.transform = `translateX(-${targetX - offset}px)`
      requestAnimationFrame(() => {
        colEl.style.transition = 'transform 0.25s ease-out, opacity 0.25s ease-out'
        colEl.style.opacity = '1'; colEl.style.transform = `translateX(-${targetX}px)`
      })
    } else {
      colEl.style.transition = 'none'; colEl.style.transform = `translateX(-${targetX}px)`
    }
  }, [pageInChapter, columnWidthPx])

  // ━━━ 네비게이션 ━━━
  const goToNextPage = useCallback(() => {
    if (pageInChapter < totalPagesInChapter - 1) {
      slideDirectionRef.current = 'left'; setPageInChapter(prev => prev + 1)
    } else if (currentChapterIdx < chapters.length - 1) {
      slideDirectionRef.current = 'left'; setCurrentChapterIdx(prev => prev + 1); setPageInChapter(0)
    }
  }, [pageInChapter, totalPagesInChapter, currentChapterIdx, chapters.length])

  const goToPrevPage = useCallback(() => {
    if (pageInChapter > 0) {
      slideDirectionRef.current = 'right'; setPageInChapter(prev => prev - 1)
    } else if (currentChapterIdx > 0) {
      slideDirectionRef.current = 'right'
      const prevIdx = currentChapterIdx - 1
      setCurrentChapterIdx(prevIdx)
      setPageInChapter(Math.max(0, (chapterPageCounts[prevIdx] || 1) - 1))
    }
  }, [pageInChapter, currentChapterIdx, chapterPageCounts])

  // 키보드
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (showSettings || showToc) return
      switch (e.key) {
        case 'ArrowLeft': case 'ArrowUp': e.preventDefault(); goToPrevPage(); break
        case 'ArrowRight': case 'ArrowDown': case ' ': e.preventDefault(); goToNextPage(); break
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [goToNextPage, goToPrevPage, showSettings, showToc])

  const goToChapter = useCallback((chIdx: number) => {
    setCurrentChapterIdx(Math.max(0, Math.min(chIdx, chapters.length - 1))); setPageInChapter(0)
  }, [chapters.length])

  const goToVirtualPage = useCallback((vPage: number) => {
    let accumulated = 0
    for (let i = 0; i < chapters.length; i++) {
      const count = chapterPageCounts[i] || 1
      if (accumulated + count >= vPage) { setCurrentChapterIdx(i); setPageInChapter(vPage - accumulated - 1); return }
      accumulated += count
    }
  }, [chapters.length, chapterPageCounts])

  // 터치 스와이프
  const handleTouchStart = (e: React.TouchEvent) => { touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY } }
  const handleTouchMove = (e: React.TouchEvent) => { touchEndRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY } }
  const handleTouchEnd = () => {
    const ts = touchStartRef.current; const te = touchEndRef.current
    if (!ts || !te) return
    const dx = ts.x - te.x; const dy = Math.abs(ts.y - te.y)
    if (Math.abs(dx) > 50 && dy < Math.abs(dx)) { dx > 0 ? goToNextPage() : goToPrevPage() }
    touchStartRef.current = null; touchEndRef.current = null
  }

  // 클릭 좌/우
  const handleMouseDown = (e: React.MouseEvent) => { mouseDownPosRef.current = { x: e.clientX, y: e.clientY } }
  const handleClick = (e: React.MouseEvent) => {
    if (showSettings || showToc) return
    const mdp = mouseDownPosRef.current
    if (mdp && Math.sqrt((e.clientX - mdp.x) ** 2 + (e.clientY - mdp.y) ** 2) > 5) { mouseDownPosRef.current = null; return }
    mouseDownPosRef.current = null
    const clickX = e.clientX; const w = window.innerWidth
    if (clickX < w * 0.45) goToPrevPage()
    else if (clickX > w * 0.55) goToNextPage()
  }

  // ━━━ 챕터 HTML + 스타일 ━━━
  const currentChapterData = chapters[currentChapterIdx]
  const chapterStyledHtml = useMemo(() => {
    if (!currentChapterData) return ''
    return `<style>
.epub-content { display:block;margin:0;padding:0;border:0;font-family:${fontStyle.family};font-size:${fontSize}px;line-height:${lineHeight};color:${themeStyle.text};word-break:keep-all;overflow-wrap:break-word;letter-spacing:${letterSpacing*0.5}px;text-align:${textAlign}; }
.epub-content * { max-width:100%;box-sizing:border-box; }
.epub-content h1,.epub-content h2,.epub-content h3,.epub-content h4,.epub-content h5,.epub-content h6 { color:${themeStyle.headingColor};font-family:${fontStyle.family};line-height:1.35;margin-top:1.5em;margin-bottom:0.75em; }
.epub-content h1 { font-size:${Math.round(fontSize*1.6)}px;font-weight:bold; }
.epub-content h2 { font-size:${Math.round(fontSize*1.35)}px;font-weight:bold; }
.epub-content h3 { font-size:${Math.round(fontSize*1.15)}px;font-weight:600; }
.epub-content p { margin-bottom:0.8em;text-indent:1em; }
.epub-content a { color:${themeStyle.linkColor};text-decoration:none; }
.epub-content img,.epub-content svg { max-width:100%;max-height:calc(100vh - 10rem);height:auto;display:block;margin:1em auto;border-radius:4px;break-inside:avoid;object-fit:contain; }
.epub-content figure { text-align:center;margin:1.5em 0;break-inside:avoid; }
.epub-content figcaption { font-size:${Math.round(fontSize*0.85)}px;color:${themeStyle.muted};margin-top:0.5em; }
.epub-content blockquote { border-left:3px solid ${themeStyle.border};padding-left:1em;margin:1em 0;color:${themeStyle.muted};font-style:italic; }
.epub-content pre,.epub-content code { font-family:"Noto Sans Mono","D2Coding",monospace;font-size:${Math.round(fontSize*0.9)}px;background:${theme==='dark'?'rgba(255,255,255,0.05)':'rgba(0,0,0,0.04)'};padding:0.2em 0.4em;border-radius:3px; }
.epub-content table { border-collapse:collapse;width:100%;margin:1em 0; }
.epub-content th,.epub-content td { border:1px solid ${themeStyle.border};padding:0.5em; }
.epub-content hr { border:none;border-top:1px solid ${themeStyle.border};margin:2em 0; }
.epub-content ul,.epub-content ol { padding-left:1.5em;margin-bottom:1em; }
.epub-content li { margin-bottom:0.3em; }
.epub-content h1,.epub-content h2,.epub-content h3,.epub-content h4,.epub-content h5,.epub-content h6 { break-after:avoid; }
.epub-content img,.epub-content figure,.epub-content pre,.epub-content blockquote,.epub-content table { break-inside:avoid; }
</style>
<div class="epub-content">${currentChapterData.html}</div>`
  }, [currentChapterData, fontSize, lineHeight, fontStyle.family, themeStyle, letterSpacing, textAlign, theme])

  // innerHTML 직접 관리
  useEffect(() => {
    const colEl = contentColumnRef.current
    if (!colEl) return
    colEl.innerHTML = chapterStyledHtml
    colEl.style.transform = `translateX(-${pageInChapter * columnWidthPx}px)`
    recalcPages()
  }, [chapterStyledHtml])

  // 글로벌 스타일
  useEffect(() => {
    const id = 'epub-lite-styles'
    let el = document.getElementById(id) as HTMLStyleElement | null
    if (!el) { el = document.createElement('style'); el.id = id; document.head.appendChild(el) }
    el.textContent = `
      .epub-content [style*="color"]:not(mark) { color: ${themeStyle.text} !important; }
      .epub-content [style*="font-size"] { font-size: inherit !important; }
      .epub-content [style*="font-family"] { font-family: inherit !important; }
    `
    return () => { el?.remove() }
  }, [themeStyle.text])

  // ━━━ 렌더링 ━━━
  if (loading) {
    return (
      <div className="h-full flex items-center justify-center" style={{ backgroundColor: themeStyle.pageBg }}>
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p style={{ color: themeStyle.muted }} className="text-sm">EPUB 불러오는 중... {loadProgress > 0 ? `${loadProgress}%` : ''}</p>
          {loadProgress > 0 && (
            <div className="w-48 h-1.5 rounded-full mt-2 mx-auto overflow-hidden" style={{ backgroundColor: themeStyle.border }}>
              <div className="h-full bg-amber-500 rounded-full transition-all duration-300" style={{ width: `${loadProgress}%` }} />
            </div>
          )}
        </div>
      </div>
    )
  }
  if (error) {
    return (
      <div className="h-full flex items-center justify-center" style={{ backgroundColor: themeStyle.pageBg }}>
        <div className="text-center max-w-sm px-6">
          <div className="text-4xl mb-4">📚</div>
          <p className="font-semibold mb-2" style={{ color: themeStyle.headingColor }}>EPUB을 열 수 없습니다</p>
          <p className="text-sm" style={{ color: themeStyle.muted }}>{error}</p>
        </div>
      </div>
    )
  }

  const isFirstPage = currentChapterIdx === 0 && pageInChapter === 0
  const isLastPage = currentChapterIdx === chapters.length - 1 && pageInChapter >= totalPagesInChapter - 1

  return (
    <div className="h-full flex flex-col" style={{ backgroundColor: themeStyle.pageBg }}>
      {/* ━━━ TOC 패널 ━━━ */}
      {showToc && (
        <div className="fixed inset-0 z-[60] flex">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowToc(false)} />
          <div className="relative w-72 max-w-[80vw] h-full flex flex-col shadow-2xl" style={{ backgroundColor: themeStyle.bg }}>
            <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: themeStyle.border }}>
              <h3 className="font-semibold text-sm" style={{ color: themeStyle.headingColor }}>목차</h3>
              <button onClick={() => setShowToc(false)} className="p-1 rounded hover:opacity-70" style={{ color: themeStyle.muted }}>✕</button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {tocItems.map((item, i) => (
                <button key={i}
                  onClick={() => { if (item.chapterIndex >= 0) { goToChapter(item.chapterIndex); setShowToc(false) } }}
                  disabled={item.chapterIndex < 0}
                  className={`w-full text-left py-3 border-b text-sm transition-colors ${item.chapterIndex === currentChapterIdx ? 'font-semibold' : 'hover:opacity-80'}`}
                  style={{
                    paddingLeft: `${1 + item.level * 1.2}rem`, paddingRight: '1rem', borderColor: themeStyle.border,
                    color: item.chapterIndex === currentChapterIdx ? '#F59E0B' : themeStyle.text,
                    backgroundColor: item.chapterIndex === currentChapterIdx ? 'rgba(245,158,11,0.06)' : 'transparent',
                  }}>
                  {item.title}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ━━━ 상단 바 ━━━ */}
      <div className="grid grid-cols-4 px-2 py-2 border-b max-w-lg mx-auto w-full" style={{ borderColor: themeStyle.border }}>
        <button onClick={() => setShowToc(!showToc)} className="flex items-center justify-center gap-1.5 py-1.5 rounded-lg hover:opacity-70" style={{ color: showToc ? '#F59E0B' : themeStyle.muted }}>
          <List className="w-4 h-4" /><span className="text-xs">목차</span>
        </button>
        <div className="flex items-center justify-center col-span-2">
          <span className="text-xs font-medium" style={{ color: themeStyle.muted }}>{virtualPageNumber} / {virtualTotalPages}</span>
        </div>
        <button onClick={() => setShowSettings(!showSettings)} className="flex items-center justify-center gap-1.5 py-1.5 rounded-lg hover:opacity-70" style={{ color: showSettings ? '#F59E0B' : themeStyle.muted }}>
          <Settings2 className="w-4 h-4" /><span className="text-xs">설정</span>
        </button>
      </div>

      {/* ━━━ 설정 바텀시트 ━━━ */}
      {showSettings && (<>
        <div className="fixed inset-0 z-[55]" onClick={() => setShowSettings(false)} />
        <div className="fixed bottom-0 left-1/2 -translate-x-1/2 z-[56] rounded-t-2xl shadow-2xl max-h-[70vh] overflow-y-auto w-full max-w-lg"
          style={{ backgroundColor: themeStyle.bg, backdropFilter: 'blur(8px)', borderTop: `1px solid ${themeStyle.border}` }}>
          <div className="flex justify-center pt-3 pb-1"><div className="w-10 h-1 rounded-full" style={{ backgroundColor: themeStyle.border }} /></div>
          <div className="px-5 pb-6 space-y-5">
            {/* 테마 */}
            <div>
              <p className="text-xs font-medium mb-3" style={{ color: themeStyle.muted }}>배경 테마</p>
              <div className="flex gap-3 justify-center">
                {(Object.keys(THEMES) as ReflowTheme[]).map(t => (
                  <button key={t} onClick={() => setTheme(t)} className="flex flex-col items-center gap-1.5">
                    <div className={`w-12 h-12 rounded-xl border-2 ${theme === t ? 'ring-2 ring-amber-500 ring-offset-2' : ''}`}
                      style={{ backgroundColor: THEMES[t].bg, borderColor: THEMES[t].border }} />
                    <span className="text-[10px]" style={{ color: theme === t ? '#F59E0B' : themeStyle.muted }}>
                      {t === 'light' ? '밝은' : t === 'sepia' ? '세피아' : '어두운'}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            {/* 글꼴 */}
            <div>
              <p className="text-xs font-medium mb-3" style={{ color: themeStyle.muted }}>글꼴</p>
              <div className="flex gap-2">
                {(Object.keys(FONTS) as ReflowFont[]).map(f => (
                  <button key={f} onClick={() => setFont(f)}
                    className={`flex-1 py-2 rounded-xl text-sm border ${font === f ? 'border-amber-500' : ''}`}
                    style={{
                      backgroundColor: font === f ? 'rgba(245,158,11,0.1)' : 'transparent',
                      borderColor: font === f ? '#F59E0B' : themeStyle.border,
                      color: font === f ? '#F59E0B' : themeStyle.text,
                      fontFamily: FONTS[f].family,
                    }}>
                    {FONTS[f].label}
                  </button>
                ))}
              </div>
            </div>
            {/* 글자 크기 */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-medium" style={{ color: themeStyle.muted }}>글자 크기</p>
                <span className="text-xs font-mono" style={{ color: themeStyle.text }}>{fontSize}px</span>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => setFontSize(s => Math.max(12, s - 1))} className="w-9 h-9 rounded-xl flex items-center justify-center border" style={{ borderColor: themeStyle.border, color: themeStyle.muted }}><Minus className="w-4 h-4" /></button>
                <input type="range" min={12} max={32} value={fontSize} onChange={e => setFontSize(Number(e.target.value))} className="flex-1 h-1.5 rounded-full appearance-none cursor-pointer accent-amber-500" style={{ backgroundColor: themeStyle.border }} />
                <button onClick={() => setFontSize(s => Math.min(32, s + 1))} className="w-9 h-9 rounded-xl flex items-center justify-center border" style={{ borderColor: themeStyle.border, color: themeStyle.muted }}><Plus className="w-4 h-4" /></button>
              </div>
            </div>
            {/* 줄간격 */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium" style={{ color: themeStyle.muted }}>줄간격</p>
                <span className="text-xs font-mono" style={{ color: themeStyle.text }}>{lineHeight.toFixed(1)}</span>
              </div>
              <input type="range" min={1.2} max={2.4} step={0.1} value={lineHeight} onChange={e => setLineHeight(Number(e.target.value))} className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-amber-500" style={{ backgroundColor: themeStyle.border }} />
            </div>
            {/* 정렬 */}
            <div>
              <p className="text-xs font-medium mb-3" style={{ color: themeStyle.muted }}>정렬</p>
              <div className="flex gap-2">
                {(['left', 'justify'] as ReflowAlign[]).map(a => (
                  <button key={a} onClick={() => setTextAlign(a)}
                    className={`flex-1 py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 border ${textAlign === a ? 'border-amber-500' : ''}`}
                    style={{
                      backgroundColor: textAlign === a ? 'rgba(245,158,11,0.1)' : 'transparent',
                      borderColor: textAlign === a ? '#F59E0B' : themeStyle.border,
                      color: textAlign === a ? '#F59E0B' : themeStyle.text,
                    }}>
                    {a === 'left' ? <><AlignLeft className="w-4 h-4" /> 왼쪽</> : <><AlignJustify className="w-4 h-4" /> 양쪽</>}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </>)}

      {/* ━━━ 본문 (CSS column 페이지네이션) ━━━ */}
      <div className="flex-1 min-h-0 relative"
        style={{ backgroundColor: themeStyle.bg, overflow: 'clip' }}
        onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown} onClick={handleClick}>
        <div style={{ maxWidth: MAX_WIDTH, margin: '0 auto', padding: `2rem ${marginSize}px`, height: '100%' }}>
          <div ref={paginationContainerRef} className="relative" style={{ height: '100%', overflow: 'clip' }}>
            {currentChapterData ? (
              <div ref={contentColumnRef}
                style={{ columnWidth: columnWidthPx > 0 ? `${columnWidthPx - 40}px` : '100vw', columnGap: '40px', columnFill: 'auto', height: '100%' }} />
            ) : (
              <p className="text-center py-8" style={{ color: themeStyle.muted }}>(표시할 내용 없음)</p>
            )}
          </div>
        </div>
      </div>

      {/* ━━━ 하단 바 ━━━ */}
      {chapters.length > 0 && (
        <div className="border-t px-4 py-2 max-w-lg mx-auto w-full" style={{ borderColor: themeStyle.border }}>
          <div className="flex items-center gap-3">
            <button onClick={e => { e.stopPropagation(); goToPrevPage() }} disabled={isFirstPage} className="p-1 rounded disabled:opacity-30" style={{ color: themeStyle.muted }}>
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="flex-1 relative" onClick={e => {
              e.stopPropagation()
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
              const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
              goToVirtualPage(Math.max(1, Math.round(ratio * virtualTotalPages)))
            }}>
              <div className="h-1.5 rounded-full cursor-pointer" style={{ backgroundColor: themeStyle.border }}>
                <div className="h-full rounded-full transition-all duration-200"
                  style={{ width: `${virtualTotalPages > 1 ? ((virtualPageNumber - 1) / (virtualTotalPages - 1)) * 100 : 0}%`, backgroundColor: '#F59E0B' }} />
              </div>
              <input type="range" min={1} max={virtualTotalPages} value={virtualPageNumber}
                onChange={e => { e.stopPropagation(); goToVirtualPage(Number(e.target.value)) }}
                onClick={e => e.stopPropagation()}
                className="absolute inset-0 w-full opacity-0 cursor-pointer" style={{ height: '24px', top: '-6px' }} />
            </div>
            <button onClick={e => { e.stopPropagation(); goToNextPage() }} disabled={isLastPage} className="p-1 rounded disabled:opacity-30" style={{ color: themeStyle.muted }}>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-[10px]" style={{ color: themeStyle.muted }}>{currentChapterIdx + 1}/{chapters.length} 챕터</span>
            <span className="text-[10px]" style={{ color: themeStyle.muted }}>
              {virtualTotalPages > 1 ? Math.round(((virtualPageNumber - 1) / (virtualTotalPages - 1)) * 100) : 0}%
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
