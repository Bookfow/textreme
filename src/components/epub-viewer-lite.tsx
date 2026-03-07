// components/epub-viewer-lite.tsx
// TeXTREME 풀기능 EPUB 뷰어 — 서버 의존 제로
// IndexedDB 기반: 하이라이트, 메모, 북마크, 읽기 위치
// 집중 모드, 본문 검색, 남은 시간 표시

'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { ChevronLeft, ChevronRight, Minus, Plus, List, AlignLeft, AlignJustify, Settings2, Focus, Highlighter, Trash2, X, Bookmark, BookmarkCheck, Search, Maximize2, Minimize2, Home } from 'lucide-react'
import JSZip from 'jszip'
import { trackEvent, EVENTS } from '@/lib/event-tracker'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 타입 & 상수
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface EpubViewerLiteProps {
  epubUrl: string
  onBack?: () => void
  onPageChange?: (page: number, total: number) => void
  onDocumentLoad?: (numPages: number) => void
  onError?: (error: string) => void
}

interface EpubChapter {
  id: string
  href: string
  title: string
  html: string
  order: number
  textContent: string // 검색용 텍스트
}

interface TocItem {
  title: string
  href: string
  chapterIndex: number
  level: number
}

interface Highlight {
  id: string
  epub_key: string
  block_id: string
  start_offset: number
  end_offset: number
  selected_text: string
  color: string
  memo: string | null
  page_number: number
  created_at: number
}

interface BookmarkItem {
  id: string
  epub_key: string
  chapter_idx: number
  page_in_chapter: number
  virtual_page: number
  title: string
  created_at: number
}

interface SearchResult {
  chapterIdx: number
  chapterTitle: string
  snippet: string
  matchStart: number
}

type ReflowFont = 'sans' | 'pretendard' | 'serif' | 'nanum'
type ReflowTheme = 'light' | 'sepia' | 'dark'
type ReflowAlign = 'left' | 'justify'

const FONTS: Record<ReflowFont, { label: string; family: string }> = {
  sans: { label: '고딕', family: 'system-ui, -apple-system, "Noto Sans KR", sans-serif' },
  pretendard: { label: '프리텐', family: '"Pretendard", system-ui, -apple-system, sans-serif' },
  serif: { label: '명조', family: '"Noto Serif KR", "Batang", Georgia, serif' },
  nanum: { label: '나눔명조', family: '"Nanum Myeongjo", "Batang", Georgia, serif' },
}

const THEMES: Record<ReflowTheme, {
  bg: string; text: string; muted: string; border: string
  pageBg: string; headingColor: string; linkColor: string
}> = {
  light: { bg: '#FAFAF8', text: '#1A1510', muted: '#6E6358', border: '#E6DDD4', pageBg: '#F3EFEB', headingColor: '#1A1510', linkColor: '#4A8FE7' },
  sepia: { bg: '#F3EBDA', text: '#4A3626', muted: '#887256', border: '#D4C4A6', pageBg: '#E8DFCE', headingColor: '#2E1C0E', linkColor: '#9A6840' },
  dark: { bg: '#1A1612', text: '#E8E0D8', muted: '#A89A8E', border: '#2E2822', pageBg: '#141110', headingColor: '#F0E8E2', linkColor: '#7EB8F0' },
}

const HIGHLIGHT_COLORS: Record<string, string> = {
  yellow: 'rgba(250, 220, 50, 0.3)',
  green: 'rgba(100, 220, 100, 0.25)',
  blue: 'rgba(90, 180, 250, 0.25)',
  pink: 'rgba(245, 130, 180, 0.3)',
}

const MAX_WIDTH = '42rem'
const DB_NAME = 'textreme_reader'
const DB_VERSION = 1

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// IndexedDB 유틸
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('highlights')) {
        const hs = db.createObjectStore('highlights', { keyPath: 'id' })
        hs.createIndex('epub_key', 'epub_key', { unique: false })
      }
      if (!db.objectStoreNames.contains('bookmarks')) {
        const bs = db.createObjectStore('bookmarks', { keyPath: 'id' })
        bs.createIndex('epub_key', 'epub_key', { unique: false })
      }
      if (!db.objectStoreNames.contains('positions')) {
        db.createObjectStore('positions', { keyPath: 'epub_key' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function dbGetAllByIndex<T>(storeName: string, indexName: string, key: string): Promise<T[]> {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly')
      const store = tx.objectStore(storeName)
      const index = store.index(indexName)
      const req = index.getAll(key)
      req.onsuccess = () => resolve(req.result || [])
      req.onerror = () => reject(req.error)
    })
  } catch { return [] }
}

async function dbPut<T>(storeName: string, data: T): Promise<void> {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite')
      tx.objectStore(storeName).put(data)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {}
}

async function dbDelete(storeName: string, key: string): Promise<void> {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite')
      tx.objectStore(storeName).delete(key)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {}
}

async function dbGet<T>(storeName: string, key: string): Promise<T | null> {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly')
      const req = tx.objectStore(storeName).get(key)
      req.onsuccess = () => resolve(req.result || null)
      req.onerror = () => reject(req.error)
    })
  } catch { return null }
}

/** EPUB URL에서 고유 키 생성 */
function makeEpubKey(url: string): string {
  // URL에서 파일명 추출 → 간단한 해시
  const name = url.split('/').pop()?.split('?')[0] || url
  let hash = 0
  for (let i = 0; i < url.length; i++) { hash = ((hash << 5) - hash + url.charCodeAt(i)) | 0 }
  return `epub_${name}_${Math.abs(hash).toString(36)}`
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

/** 블록 내 텍스트 노드 추출 (공백 전용 직속 노드 제외) — 저장/렌더링 공통 */
function getTextNodesOf(root: Node): { node: Text; start: number }[] {
  const nodes: { node: Text; start: number }[] = []; let offset = 0
  const walk = (n: Node) => {
    if (n.nodeType === Node.TEXT_NODE) {
      const t = (n as Text).textContent || ''
      if (t.trim().length === 0 && n.parentNode === root) return
      nodes.push({ node: n as Text, start: offset }); offset += t.length
    } else { for (let i = 0; i < n.childNodes.length; i++) walk(n.childNodes[i]) }
  }; walk(root); return nodes
}

/** 블록 내 특정 위치까지의 텍스트 offset 계산 */
function calcOffsetInBlock(blockEl: Node, targetNode: Node, targetOffset: number): number {
  const textNodes = getTextNodesOf(blockEl)
  // targetNode가 텍스트 노드인 경우
  if (targetNode.nodeType === Node.TEXT_NODE) {
    for (const tn of textNodes) {
      if (tn.node === targetNode) return tn.start + Math.min(targetOffset, (tn.node.textContent?.length || 0))
    }
  }
  // targetNode가 요소 노드인 경우 — childNodes[targetOffset] 앞의 텍스트 계산
  const childBefore = targetOffset < targetNode.childNodes.length ? targetNode.childNodes[targetOffset] : null
  let total = 0
  for (const tn of textNodes) {
    if (childBefore && tn.node.compareDocumentPosition(childBefore) & Node.DOCUMENT_POSITION_PRECEDING) break
    if (!childBefore) { total = tn.start + (tn.node.textContent?.length || 0); continue }
    if (childBefore.contains(tn.node) || tn.node.compareDocumentPosition(childBefore) & Node.DOCUMENT_POSITION_FOLLOWING) {
      total = tn.start + (tn.node.textContent?.length || 0)
    }
  }
  return total
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// EPUB 파싱 유틸
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

export default function EpubViewerLite({ epubUrl, onBack, onPageChange, onDocumentLoad, onError }: EpubViewerLiteProps) {
  // ─── EPUB 데이터 ───
  const [chapters, setChapters] = useState<EpubChapter[]>([])
  const [tocItems, setTocItems] = useState<TocItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadProgress, setLoadProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [epubKey, setEpubKey] = useState('')

  // ─── 페이지네이션 ───
  const [currentChapterIdx, setCurrentChapterIdx] = useState(0)
  const [pageInChapter, setPageInChapter] = useState(0)
  const [totalPagesInChapter, setTotalPagesInChapter] = useState(1)
  const [chapterPageCounts, setChapterPageCounts] = useState<number[]>([])
  const slideDirectionRef = useRef<'left' | 'right' | ''>('')

  // ─── 뷰어 설정 ───
  const [fontSize, setFontSize] = useState(13)
  const [lineHeight, setLineHeight] = useState(1.7)
  const [font, setFont] = useState<ReflowFont>('pretendard')
  const [theme, setTheme] = useState<ReflowTheme>('dark')
  const [showSettings, setShowSettings] = useState(false)
  const [marginSize, setMarginSize] = useState(28)
  const [letterSpacing, setLetterSpacing] = useState(0)
  const [textAlign, setTextAlign] = useState<ReflowAlign>('left')
  const [showToc, setShowToc] = useState(false)

  // ─── 집중 모드 ───
  const [focusMode, setFocusMode] = useState(false)

  // ─── 남은 시간 ───
  const [elapsedSec, setElapsedSec] = useState(0)
  const elapsedRef = useRef(0)

  // ─── 하이라이트/메모 ───
  const [highlights, setHighlights] = useState<Highlight[]>([])
  const [showHighlightMenu, setShowHighlightMenu] = useState(false)
  const [highlightMenuPos, setHighlightMenuPos] = useState({ x: 0, y: 0 })
  const [pendingSelection, setPendingSelection] = useState<{ blockId: string; start: number; end: number; text: string } | null>(null)
  const [editingHighlight, setEditingHighlight] = useState<Highlight | null>(null)
  const [memoText, setMemoText] = useState('')
  const [showMemoModal, setShowMemoModal] = useState(false)
  const [showNotesPanel, setShowNotesPanel] = useState(false)
  const [notesTab, setNotesTab] = useState<'highlights' | 'bookmarks'>('highlights')
  const [memoTooltip, setMemoTooltip] = useState<{ text: string; x: number; y: number } | null>(null)

  // ─── 북마크 ───
  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>([])

  // ─── 본문 검색 ───
  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const searchInputRef = useRef<HTMLInputElement>(null)

  // ─── refs ───
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)
  const touchEndRef = useRef<{ x: number; y: number } | null>(null)
  const paginationContainerRef = useRef<HTMLDivElement>(null)
  const contentColumnRef = useRef<HTMLDivElement>(null)
  const selectionOverlayRef = useRef<HTMLDivElement>(null)
  const mouseDownPosRef = useRef<{ x: number; y: number; t: number } | null>(null)
  const blobUrlsRef = useRef<string[]>([])
  const viewerOpenTimeRef = useRef<number>(Date.now())
  const [columnWidthPx, setColumnWidthPx] = useState(0)
  const themeStyle = THEMES[theme]
  const fontStyle = FONTS[font]

  // ━━━ Fullscreen ━━━
  const readerContainerRef = useRef<HTMLDivElement>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [barsVisible, setBarsVisible] = useState(true)
  const barsTimerRef = useRef<NodeJS.Timeout | null>(null)

  const toggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        const el = readerContainerRef.current || document.documentElement
        await el.requestFullscreen()
      } else {
        await document.exitFullscreen()
      }
    } catch (err) {
      console.warn('Fullscreen not supported:', err)
    }
  }, [])

  useEffect(() => {
    const handler = () => {
      const fs = !!document.fullscreenElement
      setIsFullscreen(fs)
      if (fs) {
        // 전체화면 진입: 2초 후 바 숨김
        setBarsVisible(true)
        if (barsTimerRef.current) clearTimeout(barsTimerRef.current)
        barsTimerRef.current = setTimeout(() => setBarsVisible(false), 2000)
      } else {
        // 전체화면 해제: 바 항상 표시
        if (barsTimerRef.current) clearTimeout(barsTimerRef.current)
        setBarsVisible(true)
      }
    }
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [])

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

  // 현재 페이지 북마크 여부
  const isCurrentPageBookmarked = useMemo(() => {
    return bookmarks.some(b => b.chapter_idx === currentChapterIdx && b.page_in_chapter === pageInChapter)
  }, [bookmarks, currentChapterIdx, pageInChapter])

  // ━━━ 설정 복원 & 저장 ━━━
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
        if (s.focusMode !== undefined) setFocusMode(s.focusMode)
      }
    } catch {}
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem('textreme_reader_settings', JSON.stringify({
        fontSize, lineHeight, font, theme, marginSize, letterSpacing, textAlign, focusMode,
      }))
    } catch {}
  }, [fontSize, lineHeight, font, theme, marginSize, letterSpacing, textAlign, focusMode])

  // ━━━ 읽기 위치 복원 (IndexedDB) ━━━
  useEffect(() => {
    if (!epubKey || chapters.length === 0) return
    const restore = async () => {
      const pos = await dbGet<{ epub_key: string; ch: number; pg: number }>('positions', epubKey)
      if (pos && typeof pos.ch === 'number' && pos.ch >= 0 && pos.ch < chapters.length) {
        setCurrentChapterIdx(pos.ch)
        if (typeof pos.pg === 'number' && pos.pg >= 0) setPageInChapter(pos.pg)
      }
    }
    restore()
  }, [epubKey, chapters.length])

  // 위치 저장
  useEffect(() => {
    if (!epubKey || chapters.length === 0) return
    dbPut('positions', { epub_key: epubKey, ch: currentChapterIdx, pg: pageInChapter })
  }, [epubKey, currentChapterIdx, pageInChapter, chapters.length])

  // 타이머
  useEffect(() => {
    const timer = setInterval(() => { elapsedRef.current += 10; setElapsedSec(elapsedRef.current) }, 10000)
    return () => clearInterval(timer)
  }, [])

  // parent 보고
  useEffect(() => {
    if (chapters.length === 0) return
    if (onPageChange) onPageChange(virtualPageNumber, virtualTotalPages)
  }, [virtualPageNumber, virtualTotalPages, chapters.length])

  // ━━━ EPUB 로드 ━━━
  useEffect(() => {
    if (!epubUrl) return
    let cancelled = false
    const key = makeEpubKey(epubUrl)
    setEpubKey(key)

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

            parsedChapters.push({ id: spine.id, href: spine.href, title, html: body.innerHTML, order: parsedChapters.length, textContent })
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
        trackEvent(EVENTS.VIEWER_OPEN, { chapters: parsedChapters.length, source: epubUrl?.slice(-60) || '' })
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

  // ━━━ IndexedDB 데이터 로드 ━━━
  useEffect(() => {
    if (!epubKey) return
    const load = async () => {
      const hl = await dbGetAllByIndex<Highlight>('highlights', 'epub_key', epubKey)
      setHighlights(hl)
      const bm = await dbGetAllByIndex<BookmarkItem>('bookmarks', 'epub_key', epubKey)
      setBookmarks(bm)
    }
    load()
  }, [epubKey])

  // ━━━ CSS 컬럼 기반 페이지네이션 계산 ━━━
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
      if (showSettings || showToc || showNotesPanel || showSearch) return
      switch (e.key) {
        case 'ArrowLeft': case 'ArrowUp': e.preventDefault(); goToPrevPage(); break
        case 'ArrowRight': case 'ArrowDown': case ' ': e.preventDefault(); goToNextPage(); break
        case 'f': case 'F':
          if (e.ctrlKey || e.metaKey) { e.preventDefault(); setShowSearch(prev => !prev) }
          break
        case 'F11': e.preventDefault(); toggleFullscreen(); break
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [goToNextPage, goToPrevPage, showSettings, showToc, showNotesPanel, showSearch, toggleFullscreen])

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
    if (chapters.length > 0) {
      setCurrentChapterIdx(chapters.length - 1)
      setPageInChapter(Math.max(0, (chapterPageCounts[chapters.length - 1] || 1) - 1))
    }
  }, [chapters.length, chapterPageCounts])

  // 터치 스와이프
  const handleTouchStart = (e: React.TouchEvent) => { touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; touchEndRef.current = null }
  const handleTouchMove = (e: React.TouchEvent) => { touchEndRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY } }
  const handleTouchEnd = () => {
    const ts = touchStartRef.current; const te = touchEndRef.current
    if (!ts || !te) return
    const dx = ts.x - te.x; const dy = Math.abs(ts.y - te.y)
    if (Math.abs(dx) > 50 && dy < Math.abs(dx)) { dx > 0 ? goToNextPage() : goToPrevPage() }
    touchStartRef.current = null; touchEndRef.current = null
  }

  // 클릭 좌/우
  const contentAreaRef = useRef<HTMLDivElement>(null)
  const handleMouseDown = (e: React.MouseEvent) => {
    mouseDownPosRef.current = { x: e.clientX, y: e.clientY, t: Date.now() }
  }
  const handleClick = (e: React.MouseEvent) => {
    if (showSettings || showToc || showNotesPanel || showMemoModal || showSearch) return
    const mdp = mouseDownPosRef.current
    const isQuickClick = mdp?.t && Date.now() - mdp.t < 300
    if (mdp && Math.sqrt((e.clientX - mdp.x) ** 2 + (e.clientY - mdp.y) ** 2) > 5) { mouseDownPosRef.current = null; return }
    mouseDownPosRef.current = null
    // 빠른 클릭이면 selection 제거
    if (isQuickClick) { window.getSelection()?.removeAllRanges(); setShowHighlightMenu(false) }
    const sel = window.getSelection()
    if (sel && !sel.isCollapsed && sel.toString().trim().length > 0) return
    if (focusMode) {
      const colEl = contentColumnRef.current
      if (colEl) {
        colEl.querySelectorAll('[data-epub-focused], [data-epub-adjacent]').forEach(el => {
          el.removeAttribute('data-epub-focused'); el.removeAttribute('data-epub-adjacent')
        })
      }
      return
    }
    const rect = e.currentTarget.getBoundingClientRect()
    const relativeX = (e.clientX - rect.left) / rect.width
    if (relativeX < 0.44) goToPrevPage()
    else if (relativeX > 0.56) goToNextPage()
    else if (isFullscreen) {
      // 전체화면 데드존 탭: 바 토글
      setBarsVisible(v => {
        const next = !v
        if (barsTimerRef.current) clearTimeout(barsTimerRef.current)
        if (next) barsTimerRef.current = setTimeout(() => setBarsVisible(false), 3000)
        return next
      })
    }
  }

  // 텍스트 선택 → 하이라이트 메뉴
  const handleTextSelection = () => {
    if (focusMode || showSettings) return
    const mdp = mouseDownPosRef.current
    if (mdp?.t && Date.now() - mdp.t < 300) return
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed || !sel.toString().trim()) { setShowHighlightMenu(false); return }
    const text = sel.toString().trim(); if (text.length < 2) return
    const anchorNode = sel.anchorNode; if (!anchorNode) return
    const blockEl = (anchorNode.nodeType === 3 ? anchorNode.parentElement : anchorNode as HTMLElement)?.closest('[data-block-id]')
    if (!blockEl) return
    const blockId = blockEl.getAttribute('data-block-id'); if (!blockId) return
    const range = sel.getRangeAt(0)
    const startOffset = calcOffsetInBlock(blockEl, range.startContainer, range.startOffset)
    const endOffset = calcOffsetInBlock(blockEl, range.endContainer, range.endOffset)
    const rect = range.getBoundingClientRect()
    setHighlightMenuPos({ x: rect.left + rect.width / 2, y: rect.bottom + 8 })
    setPendingSelection({ blockId, start: startOffset, end: endOffset, text })
    setShowHighlightMenu(true)
  }

  // 모바일 selectionchange
  useEffect(() => {
    let timeout: NodeJS.Timeout
    const onSelChange = () => {
      clearTimeout(timeout)
      timeout = setTimeout(() => {
        if (focusMode || showSettings) return
        const sel = window.getSelection()
        if (!sel || sel.isCollapsed || !sel.toString().trim()) return
        const text = sel.toString().trim(); if (text.length < 2) return
        const anchorNode = sel.anchorNode; if (!anchorNode) return
        const blockEl = (anchorNode.nodeType === 3 ? anchorNode.parentElement : anchorNode as HTMLElement)?.closest('[data-block-id]')
        if (!blockEl) return
        const blockId = blockEl.getAttribute('data-block-id'); if (!blockId) return
        const range = sel.getRangeAt(0)
        const startOffset = calcOffsetInBlock(blockEl, range.startContainer, range.startOffset)
        const endOffset = calcOffsetInBlock(blockEl, range.endContainer, range.endOffset)
        const rect = range.getBoundingClientRect()
        setHighlightMenuPos({ x: rect.left + rect.width / 2, y: rect.bottom + 8 })
        setPendingSelection({ blockId, start: startOffset, end: endOffset, text })
        setShowHighlightMenu(true)
      }, 500)
    }
    document.addEventListener('selectionchange', onSelChange)
    return () => { document.removeEventListener('selectionchange', onSelChange); clearTimeout(timeout) }
  }, [focusMode, showSettings, currentChapterIdx])

  // ━━━ 하이라이트 CRUD (IndexedDB) ━━━
  const saveHighlight = async (color: string) => {
    if (!pendingSelection || !epubKey) return
    const hl: Highlight = {
      id: generateId(), epub_key: epubKey,
      block_id: pendingSelection.blockId, start_offset: pendingSelection.start, end_offset: pendingSelection.end,
      selected_text: pendingSelection.text, color, memo: null, page_number: virtualPageNumber, created_at: Date.now(),
    }
    await dbPut('highlights', hl)
    setHighlights(prev => [...prev, hl])
    setShowHighlightMenu(false); setPendingSelection(null); window.getSelection()?.removeAllRanges()
    if (selectionOverlayRef.current) selectionOverlayRef.current.innerHTML = ''
  }

  const deleteHighlight = async (id: string) => {
    await dbDelete('highlights', id)
    setHighlights(prev => prev.filter(h => h.id !== id))
    setEditingHighlight(null); setShowMemoModal(false)
  }

  const saveMemo = async () => {
    if (!editingHighlight) return
    const updated = { ...editingHighlight, memo: memoText || null }
    await dbPut('highlights', updated)
    setHighlights(prev => prev.map(h => h.id === editingHighlight.id ? updated : h))
    setShowMemoModal(false); setEditingHighlight(null)
  }

  // ━━━ 북마크 CRUD (IndexedDB) ━━━
  const toggleBookmark = async () => {
    if (!epubKey) return
    const existing = bookmarks.find(b => b.chapter_idx === currentChapterIdx && b.page_in_chapter === pageInChapter)
    if (existing) {
      await dbDelete('bookmarks', existing.id)
      setBookmarks(prev => prev.filter(b => b.id !== existing.id))
    } else {
      const chTitle = chapters[currentChapterIdx]?.title || `챕터 ${currentChapterIdx + 1}`
      const bm: BookmarkItem = {
        id: generateId(), epub_key: epubKey,
        chapter_idx: currentChapterIdx, page_in_chapter: pageInChapter,
        virtual_page: virtualPageNumber, title: chTitle, created_at: Date.now(),
      }
      await dbPut('bookmarks', bm)
      setBookmarks(prev => [...prev, bm])
    }
  }

  const deleteBookmark = async (id: string) => {
    await dbDelete('bookmarks', id)
    setBookmarks(prev => prev.filter(b => b.id !== id))
  }

  // ━━━ 본문 검색 ━━━
  const doSearch = useCallback((query: string) => {
    if (!query.trim() || chapters.length === 0) { setSearchResults([]); return }
    const q = query.toLowerCase()
    const results: SearchResult[] = []
    for (let i = 0; i < chapters.length; i++) {
      const text = chapters[i].textContent.toLowerCase()
      let pos = 0
      while ((pos = text.indexOf(q, pos)) !== -1) {
        const start = Math.max(0, pos - 30)
        const end = Math.min(text.length, pos + q.length + 30)
        const snippet = (start > 0 ? '...' : '') + chapters[i].textContent.slice(start, end) + (end < text.length ? '...' : '')
        results.push({ chapterIdx: i, chapterTitle: chapters[i].title, snippet, matchStart: pos })
        pos += q.length
        if (results.length >= 100) break
      }
      if (results.length >= 100) break
    }
    setSearchResults(results)
  }, [chapters])

  useEffect(() => {
    if (showSearch && searchInputRef.current) searchInputRef.current.focus()
  }, [showSearch])

  // ━━━ 챕터 스타일 HTML ━━━
  const currentChapterData = chapters[currentChapterIdx]
  const chapterBlockId = `ch${String(currentChapterIdx).padStart(3, '0')}`
  const chapterStyledHtml = useMemo(() => {
    if (!currentChapterData) return ''
    let contentHtml = currentChapterData.html

    // 하이라이트를 HTML에 삽입
    const chapterHighlights = highlights.filter(h => h.block_id === chapterBlockId)
    if (chapterHighlights.length > 0 && typeof window !== 'undefined') {
      try {
        const parser = new DOMParser()
        const doc = parser.parseFromString(`<div>${contentHtml}</div>`, 'text/html')
        const root = doc.body.firstElementChild as HTMLElement
        const sorted = [...chapterHighlights].sort((a, b) => b.start_offset - a.start_offset)
        for (const hl of sorted) {
          const textNodes = getTextNodesOf(root)
          for (let i = textNodes.length - 1; i >= 0; i--) {
            const tn = textNodes[i]; const tnLen = tn.node.textContent?.length || 0; const tnEnd = tn.start + tnLen
            if (tnEnd <= hl.start_offset || tn.start >= hl.end_offset) continue
            const localStart = Math.max(0, hl.start_offset - tn.start)
            const localEnd = Math.min(tnLen, hl.end_offset - tn.start)
            if (localStart >= localEnd) continue
            try {
              const range = doc.createRange(); range.setStart(tn.node, localStart); range.setEnd(tn.node, localEnd)
              const mark = doc.createElement('mark')
              mark.setAttribute('data-hl-id', hl.id); mark.setAttribute('data-hl-color', hl.color || 'yellow')
              if (hl.memo) mark.setAttribute('data-memo', hl.memo)
              mark.style.backgroundColor = HIGHLIGHT_COLORS[hl.color] || HIGHLIGHT_COLORS.yellow
              const frag = range.extractContents(); mark.appendChild(frag); range.insertNode(mark)
            } catch {}
          }
        }
        contentHtml = root.innerHTML
      } catch {}
    }

    return `<style>
.epub-content {
  display:block;margin:0;padding:0;border:0;
  font-family:${fontStyle.family};font-size:${fontSize}px;line-height:${lineHeight};
  color:${themeStyle.text};word-break:keep-all;overflow-wrap:break-word;
  letter-spacing:${letterSpacing*0.5}px;text-align:${textAlign};
  user-select:inherit;-webkit-user-select:inherit;cursor:text;
}
.epub-content * { max-width:100%;box-sizing:border-box;user-select:inherit;-webkit-user-select:inherit; }
.epub-content h1,.epub-content h2,.epub-content h3,.epub-content h4,.epub-content h5,.epub-content h6 {
  color:${themeStyle.headingColor};font-family:${fontStyle.family};line-height:1.35;margin-top:1.5em;margin-bottom:0.75em;
}
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
.epub-content pre { padding:1em;overflow-x:auto; }
.epub-content table { border-collapse:collapse;width:100%;margin:1em 0; }
.epub-content th,.epub-content td { border:1px solid ${themeStyle.border};padding:0.5em; }
.epub-content hr { border:none;border-top:1px solid ${themeStyle.border};margin:2em 0; }
.epub-content ul,.epub-content ol { padding-left:1.5em;margin-bottom:1em; }
.epub-content li { margin-bottom:0.3em; }
.epub-content h1,.epub-content h2,.epub-content h3,.epub-content h4,.epub-content h5,.epub-content h6 { break-after:avoid; }
.epub-content img,.epub-content figure,.epub-content pre,.epub-content blockquote,.epub-content table { break-inside:avoid; }
/* 집중 모드 */
.epub-focus-active .epub-content p,.epub-focus-active .epub-content h1,.epub-focus-active .epub-content h2,
.epub-focus-active .epub-content h3,.epub-focus-active .epub-content h4,.epub-focus-active .epub-content h5,
.epub-focus-active .epub-content h6,.epub-focus-active .epub-content blockquote,.epub-focus-active .epub-content figure,
.epub-focus-active .epub-content pre,.epub-focus-active .epub-content li {
  opacity:0.12;transition:opacity 0.3s ease,transform 0.3s ease;cursor:pointer;
}
.epub-focus-active .epub-content [data-epub-focused="true"] { opacity:1 !important;transform:scale(1.005); }
.epub-focus-active .epub-content [data-epub-adjacent="true"] { opacity:0.25 !important; }
.epub-content mark[data-hl-id] {
  color:inherit !important;border-radius:3px;padding:1px 2px;cursor:pointer;
  box-decoration-break:clone;-webkit-box-decoration-break:clone;position:relative;
}
</style>
<div class="epub-content" data-block-id="${chapterBlockId}">${contentHtml}</div>`
  }, [currentChapterData, fontSize, lineHeight, fontStyle.family, themeStyle, letterSpacing, textAlign, theme, currentChapterIdx, highlights])

  // innerHTML 직접 관리
  useEffect(() => {
    const colEl = contentColumnRef.current
    if (!colEl) return
    colEl.innerHTML = chapterStyledHtml
    colEl.style.transform = `translateX(-${pageInChapter * columnWidthPx}px)`
    recalcPages()
  }, [chapterStyledHtml])

  // ━━━ 집중 모드 DOM 이벤트 ━━━
  useEffect(() => {
    const colEl = contentColumnRef.current
    if (!colEl || !focusMode) {
      if (colEl) colEl.querySelectorAll('[data-epub-focused], [data-epub-adjacent]').forEach(el => { el.removeAttribute('data-epub-focused'); el.removeAttribute('data-epub-adjacent') })
      return
    }
    const blockSelector = 'p, h1, h2, h3, h4, h5, h6, blockquote, figure, pre, li'
    const handleFocusClick = (e: Event) => {
      const target = (e.target as HTMLElement).closest(blockSelector); if (!target) return; e.stopPropagation()
      const contentEl = colEl.querySelector('.epub-content'); if (!contentEl) return
      const blocks = Array.from(contentEl.querySelectorAll(blockSelector))
      const alreadyFocused = target.getAttribute('data-epub-focused') === 'true'
      blocks.forEach(b => { b.removeAttribute('data-epub-focused'); b.removeAttribute('data-epub-adjacent') })
      if (alreadyFocused) return
      target.setAttribute('data-epub-focused', 'true')
      const idx = blocks.indexOf(target)
      if (idx > 0) blocks[idx - 1].setAttribute('data-epub-adjacent', 'true')
      if (idx < blocks.length - 1) blocks[idx + 1].setAttribute('data-epub-adjacent', 'true')
    }
    colEl.addEventListener('click', handleFocusClick, true)
    return () => { colEl.removeEventListener('click', handleFocusClick, true) }
  }, [focusMode, currentChapterIdx, chapterStyledHtml])

  // ━━━ 하이라이트 mark 클릭 + 호버 ━━━
  useEffect(() => {
    const colEl = contentColumnRef.current; if (!colEl) return
    const handleMarkClick = (e: Event) => {
      const mark = (e.target as HTMLElement).closest('mark[data-hl-id]'); if (!mark) return; e.stopPropagation()
      const hlId = mark.getAttribute('data-hl-id'); const hl = highlights.find(h => h.id === hlId)
      if (hl) { setMemoTooltip(null); setEditingHighlight(hl); setMemoText(hl.memo || ''); setShowMemoModal(true) }
    }
    const handleMarkEnter = (e: Event) => {
      const mark = (e.target as HTMLElement).closest('mark[data-memo]'); if (!mark) return
      const memo = mark.getAttribute('data-memo'); if (!memo) return
      const rect = mark.getBoundingClientRect()
      setMemoTooltip({ text: memo, x: rect.left, y: rect.top })
    }
    const handleMarkLeave = (e: Event) => {
      const related = (e as MouseEvent).relatedTarget as HTMLElement | null
      if (related?.closest?.('mark[data-memo]')) return; setMemoTooltip(null)
    }
    colEl.addEventListener('click', handleMarkClick)
    colEl.addEventListener('mouseover', handleMarkEnter)
    colEl.addEventListener('mouseout', handleMarkLeave)
    return () => { colEl.removeEventListener('click', handleMarkClick); colEl.removeEventListener('mouseover', handleMarkEnter); colEl.removeEventListener('mouseout', handleMarkLeave) }
  }, [highlights])

  // ━━━ 선택 오버레이 ━━━
  useEffect(() => {
    const overlay = selectionOverlayRef.current; const container = paginationContainerRef.current
    if (!overlay || !container) return
    const updateOverlay = () => {
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed || !sel.toString().trim()) { overlay.innerHTML = ''; return }
      try {
        const range = sel.getRangeAt(0); const rects = range.getClientRects(); const containerRect = container.getBoundingClientRect()
        let html = ''
        for (let i = 0; i < rects.length; i++) {
          const r = rects[i]; if (r.width < 1 || r.height < 1) continue
          if (r.right < containerRect.left || r.left > containerRect.right) continue
          if (r.bottom < containerRect.top || r.top > containerRect.bottom) continue
          const left = Math.max(0, r.left - containerRect.left); const top = r.top - containerRect.top
          const width = Math.min(r.right, containerRect.right) - Math.max(r.left, containerRect.left)
          html += `<div style="position:absolute;left:${left}px;top:${top}px;width:${width}px;height:${r.height}px;background:rgba(160,160,160,0.3);pointer-events:none;border-radius:2px;"></div>`
        }
        overlay.innerHTML = html
      } catch { overlay.innerHTML = '' }
    }
    const onSelChange = () => requestAnimationFrame(updateOverlay)
    const onMouseUp = () => { setTimeout(() => { const sel = window.getSelection(); if (!sel || sel.isCollapsed) overlay.innerHTML = '' }, 100) }
    document.addEventListener('selectionchange', onSelChange)
    document.addEventListener('mouseup', onMouseUp)
    return () => { document.removeEventListener('selectionchange', onSelChange); document.removeEventListener('mouseup', onMouseUp) }
  }, [])


  // ━━━ 웹폰트 로드 ━━━
  useEffect(() => {
    const fonts = [
      { id: 'font-pretendard', href: 'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css' },
      { id: 'font-nanum', href: 'https://fonts.googleapis.com/css2?family=Nanum+Myeongjo:wght@400;700&display=swap' },
    ]
    fonts.forEach(f => { if (!document.getElementById(f.id)) { const l = document.createElement('link'); l.id = f.id; l.rel = 'stylesheet'; l.href = f.href; document.head.appendChild(l) } })
  }, [])

  // ━━━ 글로벌 스타일 ━━━
  useEffect(() => {
    const id = 'epub-lite-styles'; let el = document.getElementById(id) as HTMLStyleElement | null
    if (!el) { el = document.createElement('style'); el.id = id; document.head.appendChild(el) }
    el.textContent = `
      .epub-content::selection,.epub-content *::selection { background-color:rgba(160,160,160,0.25) !important;color:inherit !important; }
      .epub-content mark[data-hl-color="yellow"] { background-color:rgba(250,220,50,0.3) !important; }
      .epub-content mark[data-hl-color="green"] { background-color:rgba(100,220,100,0.25) !important; }
      .epub-content mark[data-hl-color="blue"] { background-color:rgba(90,180,250,0.25) !important; }
      .epub-content mark[data-hl-color="pink"] { background-color:rgba(245,130,180,0.3) !important; }
      .epub-content [style*="color"]:not(mark) { color:${themeStyle.text} !important; }
      .epub-content [style*="font-size"] { font-size:inherit !important; }
      .epub-content [style*="font-family"] { font-family:inherit !important; }
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
  const ACCENT = '#F59E0B'

  return (
    <div ref={readerContainerRef} className="h-full flex flex-col" style={{ backgroundColor: themeStyle.pageBg }}>

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
                    color: item.chapterIndex === currentChapterIdx ? ACCENT : themeStyle.text,
                    backgroundColor: item.chapterIndex === currentChapterIdx ? 'rgba(245,158,11,0.06)' : 'transparent',
                  }}>
                  {item.title}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ━━━ ​통합 노트 패널 ━━━ */}
      {showNotesPanel && (
        <div className="fixed inset-0 z-[60] flex justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowNotesPanel(false)} />
          <div className="relative w-80 max-w-[85vw] h-full flex flex-col shadow-2xl" style={{ backgroundColor: themeStyle.bg }}>
            <div style={{ borderBottom: `1px solid ${themeStyle.border}` }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px 0' }}>
                <h3 style={{ color: themeStyle.headingColor, fontWeight: 600, fontSize: 14 }}>노트</h3>
                <button onClick={() => setShowNotesPanel(false)} style={{ padding: 4, borderRadius: 6, border: 'none', background: 'none', color: themeStyle.muted, cursor: 'pointer' }}>✕</button>
              </div>
              <div style={{ display: 'flex', padding: '8px 16px 0' }}>
                {(['highlights', 'bookmarks'] as const).map(tab => (
                  <button key={tab} onClick={() => setNotesTab(tab)} style={{ flex: 1, padding: '8px 0 10px', fontSize: 13, fontWeight: notesTab === tab ? 600 : 400, color: notesTab === tab ? ACCENT : themeStyle.muted, background: 'none', border: 'none', borderBottom: `2px solid ${notesTab === tab ? ACCENT : 'transparent'}`, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                    {tab === 'highlights' ? <><Highlighter style={{ width: 14, height: 14 }} /> 형광펜 ({highlights.length})</> : <><Bookmark style={{ width: 14, height: 14 }} /> 책갈피 ({bookmarks.length})</>}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {notesTab === 'highlights' ? (
                highlights.length > 0 ? [...highlights].sort((a, b) => a.page_number - b.page_number).map(hl => (
                  <div key={hl.id} style={{ padding: '12px 16px', borderBottom: `1px solid ${themeStyle.border}`, cursor: 'pointer' }} onClick={() => { goToVirtualPage(hl.page_number); setShowNotesPanel(false) }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontSize: 10, fontWeight: 500, padding: '2px 6px', borderRadius: 4, backgroundColor: HIGHLIGHT_COLORS[hl.color], color: themeStyle.text }}>p.{hl.page_number}</span>
                      <button onClick={e => { e.stopPropagation(); deleteHighlight(hl.id) }} style={{ padding: 4, borderRadius: 6, border: 'none', background: 'none', color: '#ef4444', cursor: 'pointer' }}><Trash2 style={{ width: 12, height: 12 }} /></button>
                    </div>
                    <p style={{ fontSize: 12, lineHeight: 1.5, color: themeStyle.text }}>{hl.selected_text.length > 80 ? hl.selected_text.slice(0, 80) + '...' : hl.selected_text}</p>
                    {hl.memo && <p style={{ fontSize: 10, marginTop: 6, color: themeStyle.muted }}>💬 {hl.memo.slice(0, 50)}</p>}
                  </div>
                )) : (
                  <div style={{ padding: '48px 16px', textAlign: 'center' }}>
                    <Highlighter style={{ width: 32, height: 32, margin: '0 auto 12px', display: 'block', color: themeStyle.border }} />
                    <p style={{ fontSize: 14, color: themeStyle.muted, marginBottom: 4 }}>형광펜이 없습니다</p>
                    <p style={{ fontSize: 12, color: themeStyle.muted }}>텍스트를 길게 선택하면<br/>형광펜을 추가할 수 있어요</p>
                  </div>
                )
              ) : (
                bookmarks.length > 0 ? [...bookmarks].sort((a, b) => a.virtual_page - b.virtual_page).map(bm => (
                  <div key={bm.id} style={{ padding: '12px 16px', borderBottom: `1px solid ${themeStyle.border}`, cursor: 'pointer' }} onClick={() => { setCurrentChapterIdx(bm.chapter_idx); setPageInChapter(bm.page_in_chapter); setShowNotesPanel(false) }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 10, fontWeight: 500, padding: '2px 6px', borderRadius: 4, backgroundColor: `${ACCENT}22`, color: ACCENT }}>p.{bm.virtual_page}</span>
                        <span style={{ fontSize: 12, color: themeStyle.text }}>{bm.title}</span>
                      </div>
                      <button onClick={e => { e.stopPropagation(); deleteBookmark(bm.id) }} style={{ padding: 4, borderRadius: 6, border: 'none', background: 'none', color: '#ef4444', cursor: 'pointer' }}><Trash2 style={{ width: 12, height: 12 }} /></button>
                    </div>
                  </div>
                )) : (
                  <div style={{ padding: '48px 16px', textAlign: 'center' }}>
                    <Bookmark style={{ width: 32, height: 32, margin: '0 auto 12px', display: 'block', color: themeStyle.border }} />
                    <p style={{ fontSize: 14, color: themeStyle.muted, marginBottom: 4 }}>책갈피가 없습니다</p>
                    <p style={{ fontSize: 12, color: themeStyle.muted }}>아래 버튼으로 현재 페이지를<br/>책갈피에 추가하세요</p>
                  </div>
                )
              )}
            </div>
            {notesTab === 'bookmarks' && (
              <div style={{ padding: '12px 16px', borderTop: `1px solid ${themeStyle.border}` }}>
                <button onClick={e => { e.stopPropagation(); toggleBookmark() }} style={{ width: '100%', padding: '10px', borderRadius: 10, border: `1px solid ${isCurrentPageBookmarked ? 'rgba(239,68,68,0.3)' : ACCENT + '40'}`, background: isCurrentPageBookmarked ? 'rgba(239,68,68,0.06)' : `${ACCENT}08`, color: isCurrentPageBookmarked ? '#ef4444' : ACCENT, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  {isCurrentPageBookmarked ? <><BookmarkCheck style={{ width: 16, height: 16 }} /> p.{virtualPageNumber} 책갈피 제거</> : <><Bookmark style={{ width: 16, height: 16 }} /> p.{virtualPageNumber} 책갈피 추가</>}
                </button>
              </div>
            )}
          </div>
        </div>
      )}


      {/* ━━━ 상단 바 (9버튼) ━━━ */}
      <div style={{ borderColor: themeStyle.border, display: "flex", justifyContent: "center", borderBottom: showSearch ? 'none' : `1px solid ${themeStyle.border}`, flexShrink: 0, boxShadow: showSearch ? 'none' : `0 1px 8px ${themeStyle.border}40`, transition: 'transform 0.3s ease, opacity 0.3s ease', ...( isFullscreen && !barsVisible ? { transform: 'translateY(-100%)', opacity: 0, pointerEvents: 'none' as const } : {}) }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(9, 1fr)", gap: 8, padding: "14px 20px", width: "100%", maxWidth: 560 }}>
        <button onClick={e => { e.stopPropagation(); trackEvent(EVENTS.VIEWER_CLOSE, { durationSec: Math.round((Date.now() - viewerOpenTimeRef.current) / 1000), lastPage: virtualPageNumber, totalPages: virtualTotalPages }); if (onBack) onBack() }} className="flex flex-col items-center justify-center py-2.5 rounded-lg hover:opacity-70" style={{ color: themeStyle.muted }}><Home className="w-4 h-4" /><span style={{ fontSize: 10, marginTop: 5 }}>나가기</span></button>
        <button onClick={e => { e.stopPropagation(); setShowToc(!showToc) }} className="flex flex-col items-center justify-center py-2.5 rounded-lg hover:opacity-70" style={{ color: showToc ? ACCENT : themeStyle.muted }}><List className="w-4 h-4" /><span style={{ fontSize: 10, marginTop: 5 }}>목차</span></button>
        <button onClick={e => { e.stopPropagation(); setShowSearch(!showSearch) }} className="flex flex-col items-center justify-center py-2.5 rounded-lg hover:opacity-70" style={{ color: showSearch ? ACCENT : themeStyle.muted }}><Search className="w-4 h-4" /><span style={{ fontSize: 10, marginTop: 5 }}>검색</span></button>
        <button onClick={e => { e.stopPropagation(); setFocusMode(!focusMode) }} className="flex flex-col items-center justify-center py-2.5 rounded-lg" style={{ color: focusMode ? ACCENT : themeStyle.muted, backgroundColor: focusMode ? `${ACCENT}15` : 'transparent' }}><Focus className="w-4 h-4" /><span style={{ fontSize: 10, marginTop: 5 }}>집중</span></button>
        <div className="flex items-center justify-center"><span className="text-[10px] font-medium" style={{ color: themeStyle.muted }}>{virtualPageNumber}/{virtualTotalPages}</span></div>
        <button onClick={e => { e.stopPropagation(); setNotesTab('highlights'); setShowNotesPanel(!showNotesPanel) }} className="flex flex-col items-center justify-center py-2.5 rounded-lg" style={{ color: showNotesPanel && notesTab === 'highlights' ? ACCENT : highlights.length > 0 ? ACCENT : themeStyle.muted }}><Highlighter className="w-4 h-4" /><span style={{ fontSize: 10, marginTop: 5 }}>형광펜</span></button>
        <button onClick={e => { e.stopPropagation(); setNotesTab('bookmarks'); setShowNotesPanel(!showNotesPanel) }} className="flex flex-col items-center justify-center py-2.5 rounded-lg hover:opacity-70" style={{ color: showNotesPanel && notesTab === 'bookmarks' ? ACCENT : isCurrentPageBookmarked ? ACCENT : themeStyle.muted }}>{isCurrentPageBookmarked ? <BookmarkCheck className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}<span style={{ fontSize: 10, marginTop: 5 }}>책갈피</span></button>
        <button onClick={e => { e.stopPropagation(); toggleFullscreen() }} className="flex flex-col items-center justify-center py-2.5 rounded-lg hover:opacity-70" style={{ color: isFullscreen ? ACCENT : themeStyle.muted, backgroundColor: isFullscreen ? `${ACCENT}15` : 'transparent' }}>{isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}<span style={{ fontSize: 10, marginTop: 5 }}>{isFullscreen ? '축소' : '전체'}</span></button>
        <button onClick={e => { e.stopPropagation(); setShowSettings(!showSettings); if (barsTimerRef.current) clearTimeout(barsTimerRef.current) }} className="flex flex-col items-center justify-center py-2.5 rounded-lg hover:opacity-70" style={{ color: showSettings ? ACCENT : themeStyle.muted }}><Settings2 className="w-4 h-4" /><span style={{ fontSize: 10, marginTop: 5 }}>설정</span></button>
      </div>
      </div>

      {/* ━━━ 검색 팝업 (상단 바 아래, 문서 위에 떠있음) ━━━ */}
      {showSearch && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 60 }} onClick={() => { setShowSearch(false); setSearchQuery(''); setSearchResults([]) }}>
          <div onClick={e => e.stopPropagation()} style={{ position: 'absolute', top: 60, left: '50%', transform: 'translateX(-50%)', width: 'calc(100% - 32px)', maxWidth: 480, backgroundColor: themeStyle.bg, border: `1px solid ${themeStyle.border}`, borderRadius: 16, boxShadow: '0 8px 32px rgba(0,0,0,0.4)', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px' }}>
              <Search className="w-4 h-4" style={{ flexShrink: 0, color: themeStyle.muted }} />
              <input ref={searchInputRef} type="text" value={searchQuery}
                onChange={e => { setSearchQuery(e.target.value); doSearch(e.target.value) }}
                onKeyDown={e => { if (e.key === 'Escape') { setShowSearch(false); setSearchQuery(''); setSearchResults([]) } }}
                placeholder="본문에서 검색..."
                style={{ flex: 1, background: 'transparent', outline: 'none', fontSize: 14, color: themeStyle.text, border: 'none', padding: '4px 0' }} />
              {searchQuery && (
                <span style={{ fontSize: 11, color: themeStyle.muted, flexShrink: 0 }}>{searchResults.length}건</span>
              )}
              <button onClick={() => { setShowSearch(false); setSearchQuery(''); setSearchResults([]) }} style={{ padding: 4, color: themeStyle.muted, background: 'none', border: 'none', cursor: 'pointer' }}><X className="w-4 h-4" /></button>
            </div>
            <div style={{ padding: '0 14px 8px' }}>
              <p style={{ fontSize: 10, color: themeStyle.muted, lineHeight: 1.4 }}>
                2글자 이상 입력 · Enter 다음 결과 · Shift+Enter 이전 결과 · Esc 닫기
              </p>
            </div>
            {searchQuery && searchResults.length > 0 && (
              <div style={{ maxHeight: '45vh', overflowY: 'auto', borderTop: `1px solid ${themeStyle.border}` }}>
                {searchResults.map((r, i) => (
                  <button key={i} style={{ width: '100%', textAlign: 'left', padding: '10px 14px', borderBottom: `1px solid ${themeStyle.border}`, background: 'none', cursor: 'pointer', display: 'block' }}
                    onClick={() => { goToChapter(r.chapterIdx); setShowSearch(false); setSearchQuery(''); setSearchResults([]) }}>
                    <span style={{ fontSize: 10, fontWeight: 600, display: 'block', marginBottom: 3, color: ACCENT }}>{r.chapterTitle}</span>
                    <p style={{ fontSize: 12, lineHeight: 1.6, color: themeStyle.text }}
                      dangerouslySetInnerHTML={{
                        __html: r.snippet.replace(new RegExp(`(${searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'),
                          `<span style="background:${ACCENT}44;color:${themeStyle.text};border-radius:2px;padding:0 2px;">$1</span>`)
                      }} />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ━━━ 설정 바텀시트 (컴팩트) ━━━ */}
      {showSettings && (<>
        <div className="fixed inset-0 z-[55]" onClick={() => setShowSettings(false)} />
        <div className="fixed z-[56] overflow-y-auto" style={{ bottom: 12, left: '50%', transform: 'translateX(-50%)', width: 'calc(100% - 32px)', maxWidth: 380, maxHeight: '60vh', borderRadius: 20, backgroundColor: theme === 'dark' ? 'rgba(26,22,18,0.55)' : theme === 'sepia' ? 'rgba(243,235,218,0.55)' : 'rgba(250,250,248,0.55)', backdropFilter: 'blur(28px)', WebkitBackdropFilter: 'blur(28px)', border: `1px solid ${themeStyle.border}`, boxShadow: '0 8px 40px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06)' }}>
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 10, paddingBottom: 2 }}><div style={{ width: 36, height: 3.5, borderRadius: 9999, backgroundColor: themeStyle.border }} /></div>
          <div style={{ padding: '0 20px 20px' }}>

            {/* 테마 + 정렬 (한 줄) */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
              <div style={{ display: 'flex', gap: 10 }}>
                {(Object.keys(THEMES) as ReflowTheme[]).map(t => (
                  <button key={t} onClick={() => setTheme(t)} style={{ width: 40, height: 40, borderRadius: 10, border: `2px solid ${theme === t ? ACCENT : THEMES[t].border}`, backgroundColor: THEMES[t].bg, cursor: 'pointer', outline: 'none' }} />
                ))}
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                {(['left', 'justify'] as ReflowAlign[]).map(a => (
                  <button key={a} onClick={() => setTextAlign(a)}
                    style={{ width: 38, height: 38, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', border: `1px solid ${textAlign === a ? ACCENT : themeStyle.border}`, backgroundColor: textAlign === a ? `${ACCENT}15` : 'transparent', color: textAlign === a ? ACCENT : themeStyle.muted }}>
                    {a === 'left' ? <AlignLeft className="w-4 h-4" /> : <AlignJustify className="w-4 h-4" />}
                  </button>
                ))}
              </div>
            </div>

            {/* 글꼴 */}
            <div style={{ marginBottom: 18 }}>
              <div style={{ display: 'flex', gap: 6 }}>
                {(Object.keys(FONTS) as ReflowFont[]).map(f => (
                  <button key={f} onClick={() => setFont(f)}
                    style={{ flex: 1, padding: '7px 0', borderRadius: 8, fontSize: 13, cursor: 'pointer', border: `1px solid ${font === f ? ACCENT : themeStyle.border}`, backgroundColor: font === f ? `${ACCENT}15` : 'transparent', color: font === f ? ACCENT : themeStyle.text, fontFamily: FONTS[f].family }}>
                    {FONTS[f].label}
                  </button>
                ))}
              </div>
            </div>

            {/* 글자 크기 */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 11, color: themeStyle.muted, minWidth: 44 }}>크기</span>
                <button onClick={() => setFontSize(s => Math.max(12, s - 1))} style={{ width: 30, height: 30, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${themeStyle.border}`, color: themeStyle.muted, background: 'none', cursor: 'pointer', flexShrink: 0 }}><Minus className="w-3.5 h-3.5" /></button>
                <input type="range" min={12} max={32} value={fontSize} onChange={e => setFontSize(Number(e.target.value))} className="flex-1 accent-amber-500" style={{ height: 4 }} />
                <button onClick={() => setFontSize(s => Math.min(32, s + 1))} style={{ width: 30, height: 30, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${themeStyle.border}`, color: themeStyle.muted, background: 'none', cursor: 'pointer', flexShrink: 0 }}><Plus className="w-3.5 h-3.5" /></button>
                <span style={{ fontSize: 11, fontFamily: 'monospace', color: themeStyle.text, minWidth: 32, textAlign: 'right' }}>{fontSize}px</span>
              </div>
            </div>

            {/* 줄간격 */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 11, color: themeStyle.muted, minWidth: 44 }}>줄간격</span>
                <button onClick={() => setLineHeight(h => Math.max(1.2, Math.round((h - 0.1) * 10) / 10))} style={{ width: 30, height: 30, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${themeStyle.border}`, color: themeStyle.muted, background: 'none', cursor: 'pointer', flexShrink: 0 }}><Minus className="w-3.5 h-3.5" /></button>
                <input type="range" min={1.2} max={2.4} step={0.1} value={lineHeight} onChange={e => setLineHeight(Number(e.target.value))} className="flex-1 accent-amber-500" style={{ height: 4 }} />
                <button onClick={() => setLineHeight(h => Math.min(2.4, Math.round((h + 0.1) * 10) / 10))} style={{ width: 30, height: 30, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${themeStyle.border}`, color: themeStyle.muted, background: 'none', cursor: 'pointer', flexShrink: 0 }}><Plus className="w-3.5 h-3.5" /></button>
                <span style={{ fontSize: 11, fontFamily: 'monospace', color: themeStyle.text, minWidth: 32, textAlign: 'right' }}>{lineHeight.toFixed(1)}</span>
              </div>
            </div>

            {/* 여백 */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 11, color: themeStyle.muted, minWidth: 44 }}>여백</span>
                <input type="range" min={8} max={80} step={4} value={marginSize} onChange={e => setMarginSize(Number(e.target.value))} className="flex-1 accent-amber-500" style={{ height: 4 }} />
                <span style={{ fontSize: 11, fontFamily: 'monospace', color: themeStyle.text, minWidth: 32, textAlign: 'right' }}>{marginSize}px</span>
              </div>
            </div>

            {/* 자간 */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 11, color: themeStyle.muted, minWidth: 44 }}>자간</span>
                <input type="range" min={-2} max={4} step={0.5} value={letterSpacing} onChange={e => setLetterSpacing(Number(e.target.value))} className="flex-1 accent-amber-500" style={{ height: 4 }} />
                <span style={{ fontSize: 11, fontFamily: 'monospace', color: themeStyle.text, minWidth: 32, textAlign: 'right' }}>{(letterSpacing * 0.5).toFixed(1)}px</span>
              </div>
            </div>

          </div>
        </div>
      </>)}

      {/* ━━━ 페이지네이션 본문 (CSS column) ━━━ */}
      <div
        ref={contentAreaRef}
        className={`flex-1 min-h-0 relative ${focusMode ? 'epub-focus-active' : ''}`}
        style={{ backgroundColor: themeStyle.bg, userSelect: 'text', WebkitUserSelect: 'text' as any, overflow: 'clip' }}
        onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown} onClick={handleClick} onMouseUp={handleTextSelection}
      >
        <div style={{ maxWidth: MAX_WIDTH, margin: '0 auto', padding: `2rem ${marginSize}px`, height: '100%' }}>
          <div ref={paginationContainerRef} className="relative" style={{ height: '100%', overflow: 'clip' }}>
            {currentChapterData ? (
              <div ref={contentColumnRef}
                style={{ columnWidth: columnWidthPx > 0 ? `${columnWidthPx - 40}px` : '100vw', columnGap: '40px', columnFill: 'auto', height: '100%' }} />
            ) : (
              <p className="text-center py-8" style={{ color: themeStyle.muted }}>(표시할 내용 없음)</p>
            )}
            <div ref={selectionOverlayRef} className="absolute inset-0 pointer-events-none" style={{ zIndex: 5 }} />
          </div>
        </div>
      </div>

      {/* ━━━ 하이라이트 색상 팝업 ━━━ */}
      {showHighlightMenu && pendingSelection && (
        <div className="fixed z-[70] flex items-center gap-1 px-2 py-1.5 rounded-xl shadow-lg border"
          style={{ left: Math.min(highlightMenuPos.x - 60, (typeof window !== 'undefined' ? window.innerWidth : 400) - 140), top: Math.min(highlightMenuPos.y, (typeof window !== 'undefined' ? window.innerHeight : 800) - 50), backgroundColor: themeStyle.bg, borderColor: themeStyle.border }}>
          {Object.entries(HIGHLIGHT_COLORS).map(([color, bg]) => (
            <button key={color} onClick={() => saveHighlight(color)} className="w-7 h-7 rounded-full border-2 hover:scale-110 transition-transform"
              style={{ backgroundColor: bg, borderColor: color === 'yellow' ? '#fbbf24' : color === 'green' ? '#86efac' : color === 'blue' ? '#93c5fd' : '#f9a8d4' }} />
          ))}
          <button onClick={() => { setShowHighlightMenu(false); setPendingSelection(null); window.getSelection()?.removeAllRanges(); if (selectionOverlayRef.current) selectionOverlayRef.current.innerHTML = '' }}
            className="w-7 h-7 rounded-full flex items-center justify-center" style={{ color: themeStyle.muted }}><X className="w-3.5 h-3.5" /></button>
        </div>
      )}

      {/* ━━━ 메모 툴팁 ━━━ */}
      {memoTooltip && (
        <div style={{
          position: 'fixed', zIndex: 80, pointerEvents: 'none',
          left: Math.max(12, Math.min(memoTooltip.x - 20, (typeof window !== 'undefined' ? window.innerWidth : 400) - 280)),
          top: Math.max(12, memoTooltip.y - 12), transform: 'translateY(-100%)',
        }}>
          <div style={{
            maxWidth: 260, borderRadius: 14, overflow: 'hidden',
            background: theme === 'dark' ? 'rgba(36,30,24,0.95)' : theme === 'sepia' ? 'rgba(240,232,216,0.97)' : 'rgba(252,250,248,0.97)',
            border: `1px solid ${themeStyle.border}`,
            boxShadow: '0 8px 32px rgba(0,0,0,0.35), 0 2px 8px rgba(0,0,0,0.15)',
            backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
          }}>
            <div style={{ padding: '6px 12px', fontSize: 10, fontWeight: 600, letterSpacing: 0.5, color: ACCENT, borderBottom: `1px solid ${themeStyle.border}`, background: theme === 'dark' ? 'rgba(245,158,11,0.06)' : 'rgba(245,158,11,0.08)' }}>
              메모
            </div>
            <div style={{
              padding: '10px 14px', fontSize: Math.max(11, Math.round(fontSize * 0.78)), lineHeight: 1.65,
              color: themeStyle.text, wordBreak: 'keep-all', whiteSpace: 'pre-wrap',
            }}>
              {memoTooltip.text}
            </div>
          </div>
          <div style={{
            width: 10, height: 10, position: 'absolute', bottom: -5, left: 28,
            background: theme === 'dark' ? 'rgba(36,30,24,0.95)' : theme === 'sepia' ? 'rgba(240,232,216,0.97)' : 'rgba(252,250,248,0.97)',
            border: `1px solid ${themeStyle.border}`, borderTop: 'none', borderLeft: 'none',
            transform: 'rotate(45deg)',
          }} />
        </div>
      )}

      {/* ━━━ 메모 모달 ━━━ */}
      {showMemoModal && editingHighlight && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 20px', backgroundColor: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}
          onClick={() => { setShowMemoModal(false); setEditingHighlight(null) }}>
          <div style={{ width: '100%', maxWidth: 360, borderRadius: 20, padding: '20px 22px 22px', boxShadow: '0 12px 48px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)', backgroundColor: theme === 'dark' ? 'rgba(26,22,18,0.92)' : theme === 'sepia' ? 'rgba(243,235,218,0.96)' : 'rgba(250,250,248,0.96)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', border: `1px solid ${themeStyle.border}` }} onClick={e => e.stopPropagation()}>
            {/* 헤더 */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <span style={{ fontSize: 15, fontWeight: 600, color: themeStyle.text }}>메모</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button onClick={() => deleteHighlight(editingHighlight.id)} style={{ padding: 6, borderRadius: 8, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><Trash2 className="w-4 h-4" /></button>
                <button onClick={() => { setShowMemoModal(false); setEditingHighlight(null) }} style={{ padding: 6, borderRadius: 8, color: themeStyle.muted, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><X className="w-4 h-4" /></button>
              </div>
            </div>
            {/* 선택된 텍스트 */}
            <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 12, backgroundColor: HIGHLIGHT_COLORS[editingHighlight.color], fontSize: 12, lineHeight: 1.7, color: themeStyle.text, borderLeft: `3px solid ${ACCENT}` }}>
              &ldquo;{editingHighlight.selected_text.slice(0, 100)}{editingHighlight.selected_text.length > 100 ? '...' : ''}&rdquo;
            </div>
            {/* 메모 입력 */}
            <textarea value={memoText} onChange={e => setMemoText(e.target.value)} placeholder="메모를 입력하세요..."
              rows={4} autoFocus
              style={{ width: '100%', borderRadius: 14, border: `1px solid ${themeStyle.border}`, padding: '12px 14px', fontSize: 13, lineHeight: 1.6, resize: 'none', backgroundColor: 'transparent', color: themeStyle.text, outline: 'none', boxSizing: 'border-box' }} />
            {/* 저장 버튼 */}
            <button onClick={saveMemo} style={{ width: '100%', marginTop: 14, padding: '12px 0', borderRadius: 14, border: 'none', fontSize: 14, fontWeight: 600, color: '#000', background: `linear-gradient(135deg, ${ACCENT}, #D97706)`, cursor: 'pointer', boxShadow: `0 4px 16px ${ACCENT}30` }}>저장</button>
          </div>
        </div>
      )}

      {/* ━━━ 하단 바 ━━━ */}
      {chapters.length > 0 && (
        <div style={{ padding: "10px 24px", width: "100%", maxWidth: 520, margin: '0 auto', transition: 'transform 0.3s ease, opacity 0.3s ease', ...( isFullscreen && !barsVisible ? { transform: 'translateY(100%)', opacity: 0, pointerEvents: 'none' as const } : {}) }}>
          <div className="flex items-center gap-3">
            <button onClick={e => { e.stopPropagation(); goToPrevPage() }} disabled={isFirstPage} className="p-1 rounded disabled:opacity-30" style={{ color: themeStyle.muted }}><ChevronLeft className="w-4 h-4" /></button>
            <div className="flex-1 relative" onClick={e => {
              e.stopPropagation()
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
              const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
              goToVirtualPage(Math.max(1, Math.round(ratio * virtualTotalPages)))
            }}>
              <div className="h-1.5 rounded-full cursor-pointer" style={{ backgroundColor: themeStyle.border }}>
                <div className="h-full rounded-full transition-all duration-200" style={{ width: `${virtualTotalPages > 1 ? ((virtualPageNumber - 1) / (virtualTotalPages - 1)) * 100 : 0}%`, background: `linear-gradient(90deg, ${ACCENT}, #E8860A)`, boxShadow: `0 0 8px ${ACCENT}50` }} />
              </div>
              <input type="range" min={1} max={virtualTotalPages} value={virtualPageNumber}
                onChange={e => { e.stopPropagation(); goToVirtualPage(Number(e.target.value)) }} onClick={e => e.stopPropagation()}
                className="absolute inset-0 w-full opacity-0 cursor-pointer" style={{ height: '24px', top: '-6px' }} />
            </div>
            <button onClick={e => { e.stopPropagation(); goToNextPage() }} disabled={isLastPage} className="p-1 rounded disabled:opacity-30" style={{ color: themeStyle.muted }}><ChevronRight className="w-4 h-4" /></button>
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-[10px]" style={{ color: themeStyle.muted }}>{currentChapterIdx + 1}/{chapters.length} 챕터</span>
            <span className="text-[10px]" style={{ color: themeStyle.muted }}>
              {(() => {
                const pct = virtualTotalPages > 1 ? Math.round(((virtualPageNumber - 1) / (virtualTotalPages - 1)) * 100) : 0
                if (virtualTotalPages <= 1 || virtualPageNumber <= 1 || elapsedSec < 10) return `${pct}%`
                const pagesRead = virtualPageNumber - 1
                const secPerPage = elapsedSec / pagesRead
                const pagesLeft = virtualTotalPages - virtualPageNumber
                const secLeft = Math.round(secPerPage * pagesLeft)
                if (secLeft < 60) return `${pct}% · 1분 미만`
                const minLeft = Math.round(secLeft / 60)
                if (minLeft < 60) return `${pct}% · 약 ${minLeft}분 남음`
                const hours = Math.floor(minLeft / 60); const mins = minLeft % 60
                return mins === 0 ? `${pct}% · 약 ${hours}시간 남음` : `${pct}% · 약 ${hours}시간 ${mins}분 남음`
              })()}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
