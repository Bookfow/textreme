// components/demo-reader.tsx
// TeXTREME 데모 리더 — 풀기능 EPUB 뷰어

'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import {
  ChevronLeft, ChevronRight, Minus, Plus, List, AlignLeft, AlignJustify,
  Settings2, Focus, Highlighter, Trash2, X, Bookmark, BookmarkCheck, Search,
  Maximize2, Minimize2, Home,
} from 'lucide-react'

export interface DemoChapter { title: string; paragraphs: string[] }
interface DemoReaderProps {
  chapters: DemoChapter[]
  title?: string
  onBack?: () => void
}
interface Highlight { id: string; epub_key: string; block_id: string; start_offset: number; end_offset: number; selected_text: string; color: string; memo: string | null; page_number: number; created_at: number }
interface BookmarkItem { id: string; epub_key: string; chapter_idx: number; page_in_chapter: number; virtual_page: number; title: string; created_at: number }
interface SearchResult { chapterIdx: number; chapterTitle: string; snippet: string; matchStart: number }
interface TocItem { title: string; chapterIndex: number }
type ReflowFont = 'sans' | 'serif' | 'mono' | 'pretendard' | 'nanum'
type ReflowTheme = 'light' | 'sepia' | 'dark'
type ReflowAlign = 'left' | 'justify'

const FONTS: Record<ReflowFont, { label: string; family: string }> = {
  sans: { label: '고딕', family: 'system-ui, -apple-system, "Noto Sans KR", sans-serif' },
  pretendard: { label: '프리텐', family: '"Pretendard", system-ui, -apple-system, sans-serif' },
  serif: { label: '명조', family: '"Noto Serif KR", "Batang", Georgia, serif' },
  nanum: { label: '나눔명조', family: '"Nanum Myeongjo", "Batang", Georgia, serif' },
  mono: { label: '고정폭', family: '"Noto Sans Mono", "D2Coding", monospace' },
}
const THEMES: Record<ReflowTheme, { bg: string; text: string; muted: string; border: string; pageBg: string; headingColor: string; linkColor: string }> = {
  light: { bg: '#FAFAF8', text: '#1A1510', muted: '#6E6358', border: '#E6DDD4', pageBg: '#F3EFEB', headingColor: '#1A1510', linkColor: '#4A8FE7' },
  sepia: { bg: '#F3EBDA', text: '#4A3626', muted: '#887256', border: '#D4C4A6', pageBg: '#E8DFCE', headingColor: '#2E1C0E', linkColor: '#9A6840' },
  dark: { bg: '#1A1612', text: '#E8E0D8', muted: '#A89A8E', border: '#2E2822', pageBg: '#141110', headingColor: '#F0E8E2', linkColor: '#7EB8F0' },
}
const HIGHLIGHT_COLORS: Record<string, string> = { yellow: 'rgba(250,220,50,0.3)', green: 'rgba(100,220,100,0.25)', blue: 'rgba(90,180,250,0.25)', pink: 'rgba(245,130,180,0.3)' }
const MAX_WIDTH = '42rem'; const DB_NAME = 'textreme_reader'; const DB_VERSION = 2; const ACCENT = '#F59E0B'; const DEMO_KEY = 'demo_preview'


// ━━━ IndexedDB ━━━
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = (event) => {
      const db = req.result
      try { if (!db.objectStoreNames.contains('highlights')) { const hs = db.createObjectStore('highlights', { keyPath: 'id' }); hs.createIndex('epub_key', 'epub_key', { unique: false }) } } catch (e) { console.warn('highlights store:', e) }
      try { if (!db.objectStoreNames.contains('bookmarks')) { const bs = db.createObjectStore('bookmarks', { keyPath: 'id' }); bs.createIndex('epub_key', 'epub_key', { unique: false }) } } catch (e) { console.warn('bookmarks store:', e) }
      try { if (!db.objectStoreNames.contains('positions')) { db.createObjectStore('positions', { keyPath: 'epub_key' }) } } catch (e) { console.warn('positions store:', e) }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => {
      indexedDB.deleteDatabase(DB_NAME)
      const retry = indexedDB.open(DB_NAME, DB_VERSION)
      retry.onupgradeneeded = () => {
        const db = retry.result
        if (!db.objectStoreNames.contains('highlights')) { const hs = db.createObjectStore('highlights', { keyPath: 'id' }); hs.createIndex('epub_key', 'epub_key', { unique: false }) }
        if (!db.objectStoreNames.contains('bookmarks')) { const bs = db.createObjectStore('bookmarks', { keyPath: 'id' }); bs.createIndex('epub_key', 'epub_key', { unique: false }) }
        if (!db.objectStoreNames.contains('positions')) { db.createObjectStore('positions', { keyPath: 'epub_key' }) }
      }
      retry.onsuccess = () => resolve(retry.result)
      retry.onerror = () => reject(retry.error)
    }
  })
}
async function dbGetAll<T>(store: string, idx: string, key: string): Promise<T[]> { try { const db = await openDB(); return new Promise((r, j) => { const req = db.transaction(store, 'readonly').objectStore(store).index(idx).getAll(key); req.onsuccess = () => r(req.result || []); req.onerror = () => j(req.error) }) } catch { return [] } }
async function dbPut<T>(store: string, data: T): Promise<void> { try { const db = await openDB(); return new Promise((r, j) => { const tx = db.transaction(store, 'readwrite'); tx.objectStore(store).put(data); tx.oncomplete = () => r(); tx.onerror = () => j(tx.error) }) } catch {} }
async function dbDel(store: string, key: string): Promise<void> { try { const db = await openDB(); return new Promise((r, j) => { const tx = db.transaction(store, 'readwrite'); tx.objectStore(store).delete(key); tx.oncomplete = () => r(); tx.onerror = () => j(tx.error) }) } catch {} }
async function dbGet<T>(store: string, key: string): Promise<T | null> { try { const db = await openDB(); return new Promise((r, j) => { const req = db.transaction(store, 'readonly').objectStore(store).get(key); req.onsuccess = () => r(req.result || null); req.onerror = () => j(req.error) }) } catch { return null } }
function genId(): string { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8) }

/** 블록 내 텍스트 노드 추출 (공백 전용 직속 노드 제외) */
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
  if (targetNode.nodeType === Node.TEXT_NODE) {
    for (const tn of textNodes) {
      if (tn.node === targetNode) return tn.start + Math.min(targetOffset, (tn.node.textContent?.length || 0))
    }
  }
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

// ━━━ 메인 컴포넌트 ━━━
export default function DemoReader({ chapters, title = '변환된 EPUB', onBack }: DemoReaderProps) {
  const internalChapters = useMemo(() => chapters.map((ch, i) => ({ title: ch.title, html: ch.paragraphs.map(p => `<p>${p}</p>`).join(''), textContent: ch.title + ' ' + ch.paragraphs.join(' '), order: i })), [chapters])
  const tocItems: TocItem[] = useMemo(() => internalChapters.map((ch, i) => ({ title: ch.title, chapterIndex: i })), [internalChapters])

  const [currentChapterIdx, setCurrentChapterIdx] = useState(0)
  const [pageInChapter, setPageInChapter] = useState(0)
  const [totalPagesInChapter, setTotalPagesInChapter] = useState(1)
  const [chapterPageCounts, setChapterPageCounts] = useState<number[]>(new Array(chapters.length).fill(1))
  const slideDirectionRef = useRef<'left' | 'right' | ''>('')
  const [fontSize, setFontSize] = useState(13)
  const [lineHeight, setLineHeight] = useState(1.7)
  const [font, setFont] = useState<ReflowFont>('pretendard')
  const [theme, setTheme] = useState<ReflowTheme>('dark')
  const [showSettings, setShowSettings] = useState(false)
  const [marginSize, setMarginSize] = useState(28)
  const [letterSpacing, setLetterSpacing] = useState(0)
  const [textAlign, setTextAlign] = useState<ReflowAlign>('left')
  const [showToc, setShowToc] = useState(false)
  const [focusMode, setFocusMode] = useState(false)
  const [elapsedSec, setElapsedSec] = useState(0)
  const elapsedRef = useRef(0)
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
  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>([])
  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const searchInputRef = useRef<HTMLInputElement>(null)
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)
  const touchEndRef = useRef<{ x: number; y: number } | null>(null)
  const paginationContainerRef = useRef<HTMLDivElement>(null)
  const contentColumnRef = useRef<HTMLDivElement>(null)
  const mouseDownPosRef = useRef<{ x: number; y: number; t: number } | null>(null)
  const [columnWidthPx, setColumnWidthPx] = useState(0)
  const themeStyle = THEMES[theme]; const fontStyle = FONTS[font]

  // ━━━ Fullscreen ━━━
  const readerContainerRef = useRef<HTMLDivElement>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)

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
    const handler = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [])

  // ━━━ Paywall & UX states ━━━
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [onboardingStep, setOnboardingStep] = useState(0)

  const virtualPageNumber = useMemo(() => { let p = 1; for (let i = 0; i < currentChapterIdx; i++) p += chapterPageCounts[i] || 1; p += pageInChapter; return p }, [currentChapterIdx, pageInChapter, chapterPageCounts])
  const virtualTotalPages = useMemo(() => chapterPageCounts.length === 0 ? internalChapters.length || 1 : Math.max(chapterPageCounts.reduce((s, c) => s + (c || 1), 0), 1), [internalChapters, chapterPageCounts])
  const isCurrentPageBookmarked = useMemo(() => bookmarks.some(b => b.chapter_idx === currentChapterIdx && b.page_in_chapter === pageInChapter), [bookmarks, currentChapterIdx, pageInChapter])

  // ━━━ Onboarding (first visit) ━━━
  useEffect(() => {
    try {
      const key = 'textreme_onboarding_v1'
      if (!localStorage.getItem(key)) {
        const timer = setTimeout(() => setShowOnboarding(true), 1200)
        localStorage.setItem(key, '1')
        return () => clearTimeout(timer)
      }
    } catch {}
  }, [])

  const ONBOARDING_TIPS = [
    { icon: '🎨', text: '테마와 글꼴을 자유롭게 바꿔보세요', sub: '상단 바의 설정 버튼을 눌러보세요' },
    { icon: '🖍️', text: '텍스트를 길게 선택하면 형광펜을 쓸 수 있어요', sub: '하이라이트와 메모를 남겨보세요' },
    { icon: '👆', text: '화면 좌우를 탭하거나 스와이프하면 페이지가 넘어갑니다', sub: '' },
  ]

  // 설정 복원/저장
  useEffect(() => { try { const s = JSON.parse(localStorage.getItem('textreme_reader_settings') || '{}'); if (s.fontSize) setFontSize(s.fontSize); if (s.lineHeight) setLineHeight(s.lineHeight); if (s.font) setFont(s.font); if (s.theme) setTheme(s.theme); if (s.marginSize) setMarginSize(s.marginSize); if (s.letterSpacing !== undefined) setLetterSpacing(s.letterSpacing); if (s.textAlign) setTextAlign(s.textAlign); if (s.focusMode !== undefined) setFocusMode(s.focusMode) } catch {} }, [])
  useEffect(() => { try { localStorage.setItem('textreme_reader_settings', JSON.stringify({ fontSize, lineHeight, font, theme, marginSize, letterSpacing, textAlign, focusMode })) } catch {} }, [fontSize, lineHeight, font, theme, marginSize, letterSpacing, textAlign, focusMode])

  // 읽기 위치
  useEffect(() => { if (internalChapters.length === 0) return; dbGet<{ epub_key: string; ch: number; pg: number }>('positions', DEMO_KEY).then(pos => { if (pos && typeof pos.ch === 'number' && pos.ch >= 0 && pos.ch < internalChapters.length) { setCurrentChapterIdx(pos.ch); if (typeof pos.pg === 'number' && pos.pg >= 0) setPageInChapter(pos.pg) } }) }, [internalChapters.length])
  useEffect(() => { if (internalChapters.length > 0) dbPut('positions', { epub_key: DEMO_KEY, ch: currentChapterIdx, pg: pageInChapter }) }, [currentChapterIdx, pageInChapter, internalChapters.length])

  // 타이머
  useEffect(() => { const t = setInterval(() => { elapsedRef.current += 10; setElapsedSec(elapsedRef.current) }, 10000); return () => clearInterval(t) }, [])

  // DB 로드
  useEffect(() => { dbGetAll<Highlight>('highlights', 'epub_key', DEMO_KEY).then(setHighlights); dbGetAll<BookmarkItem>('bookmarks', 'epub_key', DEMO_KEY).then(setBookmarks) }, [])

  // CSS 컬럼 페이지네이션
  const recalcPages = useCallback(() => {
    const container = paginationContainerRef.current; const colEl = contentColumnRef.current; if (!container || !colEl) return
    const style = getComputedStyle(container); const cw = container.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0); if (cw <= 0) return
    const gap = 40; colEl.style.columnWidth = `${cw}px`; colEl.style.columnGap = `${gap}px`; setColumnWidthPx(cw + gap)
    const tp = Math.max(1, Math.round(colEl.scrollWidth / (cw + gap))); setTotalPagesInChapter(tp)
    setChapterPageCounts(prev => { const next = [...prev]; while (next.length <= currentChapterIdx) next.push(1); next[currentChapterIdx] = tp; return next })
    setPageInChapter(prev => Math.min(prev, tp - 1))
  }, [currentChapterIdx])

  useEffect(() => { if (internalChapters.length === 0) return; const t = setTimeout(recalcPages, 10); return () => clearTimeout(t) }, [currentChapterIdx, internalChapters, recalcPages, fontSize, lineHeight, font, marginSize, letterSpacing, textAlign])
  useEffect(() => { const h = () => recalcPages(); window.addEventListener('resize', h); return () => window.removeEventListener('resize', h) }, [recalcPages])

  // 챕터 HTML
  const currentChapterData = internalChapters[currentChapterIdx]
  const chapterBlockId = `ch${String(currentChapterIdx).padStart(3, '0')}`
  const chapterStyledHtml = useMemo(() => {
    if (!currentChapterData) return ''
    let html = `<h2 style="margin-top:0">${currentChapterData.title}</h2>${currentChapterData.html}`
    const chHL = highlights.filter(h => h.block_id === chapterBlockId)
    if (chHL.length > 0 && typeof window !== 'undefined') {
      try {
        const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html'); const root = doc.body.firstElementChild as HTMLElement
        const sorted = [...chHL].sort((a, b) => b.start_offset - a.start_offset)
        for (const hl of sorted) {
          const tns = getTextNodesOf(root)
          for (let i = tns.length - 1; i >= 0; i--) {
            const tn = tns[i]; const len = tn.node.textContent?.length || 0; if (tn.start + len <= hl.start_offset || tn.start >= hl.end_offset) continue
            const ls = Math.max(0, hl.start_offset - tn.start); const le = Math.min(len, hl.end_offset - tn.start); if (ls >= le) continue
            try { const r = doc.createRange(); r.setStart(tn.node, ls); r.setEnd(tn.node, le); const m = doc.createElement('mark'); m.setAttribute('data-hl-id', hl.id); m.setAttribute('data-hl-color', hl.color || 'yellow'); if (hl.memo) m.setAttribute('data-memo', hl.memo); m.style.backgroundColor = HIGHLIGHT_COLORS[hl.color] || HIGHLIGHT_COLORS.yellow; const frag = r.extractContents(); m.appendChild(frag); r.insertNode(m) } catch {}
          }
        }
        html = root.innerHTML
      } catch {}
    }
    return `<style>
.epub-content{display:block;margin:0;padding:0;font-family:${fontStyle.family};font-size:${fontSize}px;line-height:${lineHeight};color:${themeStyle.text};word-break:keep-all;overflow-wrap:break-word;letter-spacing:${letterSpacing*0.5}px;text-align:${textAlign};user-select:text;-webkit-user-select:text;cursor:text}
.epub-content *{max-width:100%;box-sizing:border-box;user-select:text!important;-webkit-user-select:text!important}
.epub-content h2{color:${themeStyle.headingColor};font-size:${Math.round(fontSize*1.35)}px;font-weight:bold;line-height:1.35;margin-bottom:0.75em;padding-bottom:0.4em;border-bottom:1px solid ${themeStyle.border}}
.epub-content p{margin-bottom:0.8em;text-indent:1em}
.epub-content mark[data-hl-id]{color:inherit!important;border-radius:3px;padding:1px 2px;cursor:pointer;box-decoration-break:clone;-webkit-box-decoration-break:clone}
.epub-focus-active .epub-content p,.epub-focus-active .epub-content h2{opacity:0.12;transition:opacity 0.3s,transform 0.3s;cursor:pointer}
.epub-focus-active .epub-content [data-epub-focused="true"]{opacity:1!important;transform:scale(1.005)}
.epub-focus-active .epub-content [data-epub-adjacent="true"]{opacity:0.25!important}
</style><div class="epub-content" data-block-id="${chapterBlockId}">${html}</div>`
  }, [currentChapterData, fontSize, lineHeight, fontStyle.family, themeStyle, letterSpacing, textAlign, currentChapterIdx, highlights, chapterBlockId])

  useEffect(() => { const c = contentColumnRef.current; if (!c) return; c.innerHTML = chapterStyledHtml; c.style.transform = `translateX(-${pageInChapter * columnWidthPx}px)`; recalcPages() }, [chapterStyledHtml])

  useEffect(() => { const c = contentColumnRef.current; if (!c || columnWidthPx <= 0) return; const d = slideDirectionRef.current; slideDirectionRef.current = ''; const tx = pageInChapter * columnWidthPx; if (d) { const o = d === 'left' ? 40 : -40; c.style.transition = 'none'; c.style.opacity = '0'; c.style.transform = `translateX(-${tx - o}px)`; requestAnimationFrame(() => { c.style.transition = 'transform 0.25s ease-out, opacity 0.25s ease-out'; c.style.opacity = '1'; c.style.transform = `translateX(-${tx}px)` }) } else { c.style.transition = 'none'; c.style.transform = `translateX(-${tx}px)` } }, [pageInChapter, columnWidthPx])

  // 집중 모드
  useEffect(() => {
    const c = contentColumnRef.current; if (!c || !focusMode) { if (c) c.querySelectorAll('[data-epub-focused],[data-epub-adjacent]').forEach(el => { el.removeAttribute('data-epub-focused'); el.removeAttribute('data-epub-adjacent') }); return }
    const sel = 'p, h2'; const handler = (e: Event) => { const t = (e.target as HTMLElement).closest(sel); if (!t) return; e.stopPropagation(); const ce = c.querySelector('.epub-content'); if (!ce) return; const blocks = Array.from(ce.querySelectorAll(sel)); const focused = t.getAttribute('data-epub-focused') === 'true'; blocks.forEach(b => { b.removeAttribute('data-epub-focused'); b.removeAttribute('data-epub-adjacent') }); if (focused) return; t.setAttribute('data-epub-focused', 'true'); const idx = blocks.indexOf(t); if (idx > 0) blocks[idx-1].setAttribute('data-epub-adjacent', 'true'); if (idx < blocks.length-1) blocks[idx+1].setAttribute('data-epub-adjacent', 'true') }
    c.addEventListener('click', handler, true); return () => { c.removeEventListener('click', handler, true) }
  }, [focusMode, currentChapterIdx, chapterStyledHtml])

  // 하이라이트 mark 클릭+호버
  useEffect(() => {
    const c = contentColumnRef.current; if (!c) return
    const onClick = (e: Event) => { const m = (e.target as HTMLElement).closest('mark[data-hl-id]'); if (!m) return; e.stopPropagation(); const hl = highlights.find(h => h.id === m.getAttribute('data-hl-id')); if (hl) { setMemoTooltip(null); setEditingHighlight(hl); setMemoText(hl.memo || ''); setShowMemoModal(true) } }
    const onOver = (e: Event) => { const m = (e.target as HTMLElement).closest('mark[data-memo]'); if (!m) return; const memo = m.getAttribute('data-memo'); if (!memo) return; const r = m.getBoundingClientRect(); setMemoTooltip({ text: memo, x: r.left, y: r.top }) }
    const onOut = (e: Event) => { const rel = (e as MouseEvent).relatedTarget as HTMLElement | null; if (rel?.closest?.('mark[data-memo]')) return; setMemoTooltip(null) }
    c.addEventListener('click', onClick); c.addEventListener('mouseover', onOver); c.addEventListener('mouseout', onOut)
    return () => { c.removeEventListener('click', onClick); c.removeEventListener('mouseover', onOver); c.removeEventListener('mouseout', onOut) }
  }, [highlights])

  useEffect(() => {}, [])

  // 웹폰트 로드
  useEffect(() => {
    const fonts = [
      { id: 'font-pretendard', href: 'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css' },
      { id: 'font-nanum', href: 'https://fonts.googleapis.com/css2?family=Nanum+Myeongjo:wght@400;700&display=swap' },
    ]
    fonts.forEach(f => { if (!document.getElementById(f.id)) { const l = document.createElement('link'); l.id = f.id; l.rel = 'stylesheet'; l.href = f.href; document.head.appendChild(l) } })
  }, [])

  // 글로벌 스타일
  useEffect(() => { const id = 'epub-lite-styles'; let el = document.getElementById(id) as HTMLStyleElement | null; if (!el) { el = document.createElement('style'); el.id = id; document.head.appendChild(el) }; el.textContent = `.epub-content::selection,.epub-content *::selection{background-color:rgba(245,158,11,0.18)!important;color:inherit!important}.epub-content mark[data-hl-color="yellow"]{background-color:rgba(250,220,50,0.3)!important}.epub-content mark[data-hl-color="green"]{background-color:rgba(100,220,100,0.25)!important}.epub-content mark[data-hl-color="blue"]{background-color:rgba(90,180,250,0.25)!important}.epub-content mark[data-hl-color="pink"]{background-color:rgba(245,130,180,0.3)!important}`; return () => { el?.remove() } }, [themeStyle.text])

  // 네비게이션
  const goNext = useCallback(() => { if (pageInChapter < totalPagesInChapter - 1) { slideDirectionRef.current = 'left'; setPageInChapter(p => p + 1) } else if (currentChapterIdx < internalChapters.length - 1) { slideDirectionRef.current = 'left'; setCurrentChapterIdx(p => p + 1); setPageInChapter(0) } }, [pageInChapter, totalPagesInChapter, currentChapterIdx, internalChapters.length])
  const goPrev = useCallback(() => { if (pageInChapter > 0) { slideDirectionRef.current = 'right'; setPageInChapter(p => p - 1) } else if (currentChapterIdx > 0) { slideDirectionRef.current = 'right'; const pi = currentChapterIdx - 1; setCurrentChapterIdx(pi); setPageInChapter(Math.max(0, (chapterPageCounts[pi] || 1) - 1)) } }, [pageInChapter, currentChapterIdx, chapterPageCounts])
  const goToChapter = useCallback((i: number) => { setCurrentChapterIdx(Math.max(0, Math.min(i, internalChapters.length - 1))); setPageInChapter(0) }, [internalChapters.length])
  const goToVP = useCallback((vp: number) => { let acc = 0; for (let i = 0; i < internalChapters.length; i++) { const c = chapterPageCounts[i] || 1; if (acc + c >= vp) { setCurrentChapterIdx(i); setPageInChapter(vp - acc - 1); return }; acc += c }; if (internalChapters.length > 0) { setCurrentChapterIdx(internalChapters.length - 1); setPageInChapter(Math.max(0, (chapterPageCounts[internalChapters.length - 1] || 1) - 1)) } }, [internalChapters.length, chapterPageCounts])

  // 키보드
  useEffect(() => { const h = (e: KeyboardEvent) => { const t = (e.target as HTMLElement)?.tagName; if (t === 'INPUT' || t === 'TEXTAREA') return; if (showSettings || showToc || showNotesPanel || showNotesPanel || showSearch) return; if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); goPrev() } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ') { e.preventDefault(); goNext() } else if ((e.key === 'f' || e.key === 'F') && (e.ctrlKey || e.metaKey)) { e.preventDefault(); setShowSearch(p => !p) } else if (e.key === 'F11') { e.preventDefault(); toggleFullscreen() } }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h) }, [goNext, goPrev, showSettings, showToc, showNotesPanel, showSearch, toggleFullscreen])

  // 터치
  const onTS = (e: React.TouchEvent) => { touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; touchEndRef.current = null }
  const onTM = (e: React.TouchEvent) => { touchEndRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY } }
  const onTE = () => { const s = touchStartRef.current; const e = touchEndRef.current; if (!s || !e) return; const dx = s.x - e.x; if (Math.abs(dx) > 50 && Math.abs(s.y - e.y) < Math.abs(dx)) { dx > 0 ? goNext() : goPrev() }; touchStartRef.current = null; touchEndRef.current = null }

  // 클릭
  const onMD = (e: React.MouseEvent) => {
    mouseDownPosRef.current = { x: e.clientX, y: e.clientY, t: Date.now() }
    if (!focusMode && !showSettings && !showToc && !showNotesPanel && !showSearch ) {
      const cx = e.clientX; const w = window.innerWidth
      if (cx < w * 0.45 || cx > w * 0.55) { e.preventDefault(); window.getSelection()?.removeAllRanges() }
    }
  }
  const onClick = (e: React.MouseEvent) => {
    if (showSettings || showToc || showNotesPanel || showMemoModal || showNotesPanel || showSearch) return
    const md = mouseDownPosRef.current; const quick = md?.t && Date.now() - md.t < 300; if (md && Math.sqrt((e.clientX - md.x) ** 2 + (e.clientY - md.y) ** 2) > 5) { mouseDownPosRef.current = null; return }; mouseDownPosRef.current = null
    if (quick) { window.getSelection()?.removeAllRanges(); setShowHighlightMenu(false) }
    const sel = window.getSelection(); if (sel && !sel.isCollapsed && sel.toString().trim().length > 0) return
    if (focusMode) { contentColumnRef.current?.querySelectorAll('[data-epub-focused],[data-epub-adjacent]').forEach(el => { el.removeAttribute('data-epub-focused'); el.removeAttribute('data-epub-adjacent') }); return }
    const cx = e.clientX; const w = window.innerWidth; if (cx < w * 0.45) { window.getSelection()?.removeAllRanges(); goPrev() } else if (cx > w * 0.55) { window.getSelection()?.removeAllRanges(); goNext() }
  }

  // 텍스트 선택 → 하이라이트
  const onSelEnd = () => {
    if (focusMode || showSettings) return; const md = mouseDownPosRef.current; if (md?.t && Date.now() - md.t < 300) return
    const sel = window.getSelection(); if (!sel || sel.isCollapsed || !sel.toString().trim()) { setShowHighlightMenu(false); return }; const text = sel.toString().trim(); if (text.length < 2) return
    const an = sel.anchorNode; if (!an) return; const bl = (an.nodeType === 3 ? an.parentElement : an as HTMLElement)?.closest('[data-block-id]'); if (!bl) return; const bid = bl.getAttribute('data-block-id'); if (!bid) return
    const range = sel.getRangeAt(0); const so = calcOffsetInBlock(bl, range.startContainer, range.startOffset); const eo = calcOffsetInBlock(bl, range.endContainer, range.endOffset)
    const rect = range.getBoundingClientRect(); setHighlightMenuPos({ x: rect.left + rect.width / 2, y: rect.bottom + 8 }); setPendingSelection({ blockId: bid, start: so, end: eo, text }); setShowHighlightMenu(true)
  }

  // 모바일 selectionchange
  useEffect(() => { let t: ReturnType<typeof setTimeout>; const h = () => { clearTimeout(t); t = setTimeout(() => { if (focusMode || showSettings) return; const sel = window.getSelection(); if (!sel || sel.isCollapsed || !sel.toString().trim()) return; const text = sel.toString().trim(); if (text.length < 2) return; const an = sel.anchorNode; if (!an) return; const bl = (an.nodeType === 3 ? an.parentElement : an as HTMLElement)?.closest('[data-block-id]'); if (!bl) return; const bid = bl.getAttribute('data-block-id'); if (!bid) return; const range = sel.getRangeAt(0); const so = calcOffsetInBlock(bl, range.startContainer, range.startOffset); const eo = calcOffsetInBlock(bl, range.endContainer, range.endOffset); const rect = range.getBoundingClientRect(); setHighlightMenuPos({ x: rect.left + rect.width / 2, y: rect.bottom + 8 }); setPendingSelection({ blockId: bid, start: so, end: eo, text }); setShowHighlightMenu(true) }, 500) }; document.addEventListener('selectionchange', h); return () => { document.removeEventListener('selectionchange', h); clearTimeout(t) } }, [focusMode, showSettings, currentChapterIdx])

  // 하이라이트 CRUD
  const saveHL = async (color: string) => { if (!pendingSelection) return; const hl: Highlight = { id: genId(), epub_key: DEMO_KEY, block_id: pendingSelection.blockId, start_offset: pendingSelection.start, end_offset: pendingSelection.end, selected_text: pendingSelection.text, color, memo: null, page_number: virtualPageNumber, created_at: Date.now() }; await dbPut('highlights', hl); setHighlights(p => [...p, hl]); setShowHighlightMenu(false); setPendingSelection(null); window.getSelection()?.removeAllRanges() }
  const delHL = async (id: string) => { await dbDel('highlights', id); setHighlights(p => p.filter(h => h.id !== id)); setEditingHighlight(null); setShowMemoModal(false) }
  const saveMemo = async () => { if (!editingHighlight) return; const u = { ...editingHighlight, memo: memoText || null }; await dbPut('highlights', u); setHighlights(p => p.map(h => h.id === editingHighlight.id ? u : h)); setShowMemoModal(false); setEditingHighlight(null) }

  // 북마크 CRUD
  const toggleBM = async () => { const ex = bookmarks.find(b => b.chapter_idx === currentChapterIdx && b.page_in_chapter === pageInChapter); if (ex) { await dbDel('bookmarks', ex.id); setBookmarks(p => p.filter(b => b.id !== ex.id)) } else { const bm: BookmarkItem = { id: genId(), epub_key: DEMO_KEY, chapter_idx: currentChapterIdx, page_in_chapter: pageInChapter, virtual_page: virtualPageNumber, title: internalChapters[currentChapterIdx]?.title || `챕터 ${currentChapterIdx + 1}`, created_at: Date.now() }; await dbPut('bookmarks', bm); setBookmarks(p => [...p, bm]) } }
  const delBM = async (id: string) => { await dbDel('bookmarks', id); setBookmarks(p => p.filter(b => b.id !== id)) }

  // 검색
  const doSearch = useCallback((q: string) => { if (!q.trim() || internalChapters.length === 0) { setSearchResults([]); return }; const ql = q.toLowerCase(); const res: SearchResult[] = []; for (let i = 0; i < internalChapters.length; i++) { const t = internalChapters[i].textContent.toLowerCase(); let p = 0; while ((p = t.indexOf(ql, p)) !== -1) { const s = Math.max(0, p - 30); const e = Math.min(t.length, p + ql.length + 30); res.push({ chapterIdx: i, chapterTitle: internalChapters[i].title, snippet: (s > 0 ? '...' : '') + internalChapters[i].textContent.slice(s, e) + (e < t.length ? '...' : ''), matchStart: p }); p += ql.length; if (res.length >= 100) break }; if (res.length >= 100) break }; setSearchResults(res) }, [internalChapters])
  useEffect(() => { if (showSearch && searchInputRef.current) searchInputRef.current.focus() }, [showSearch])

  const isFirst = currentChapterIdx === 0 && pageInChapter === 0
  const isLast = currentChapterIdx === internalChapters.length - 1 && pageInChapter >= totalPagesInChapter - 1

  return (
    <div ref={readerContainerRef} className="h-full flex flex-col" style={{ backgroundColor: themeStyle.pageBg, fontFamily: "'Noto Sans KR', system-ui, sans-serif" }}>

      {/* ━━━ ONBOARDING OVERLAY ━━━ */}
      {showOnboarding && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)' }} onClick={() => setShowOnboarding(false)}>
          <div className="w-full max-w-sm mx-4 rounded-2xl overflow-hidden shadow-2xl" style={{ backgroundColor: themeStyle.bg, border: `1px solid ${themeStyle.border}` }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '28px 24px 20px', textAlign: 'center' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>{ONBOARDING_TIPS[onboardingStep].icon}</div>
              <p style={{ color: themeStyle.text, fontWeight: 700, fontSize: 16, marginBottom: 6, lineHeight: 1.4 }}>{ONBOARDING_TIPS[onboardingStep].text}</p>
              {ONBOARDING_TIPS[onboardingStep].sub && <p style={{ color: themeStyle.muted, fontSize: 13 }}>{ONBOARDING_TIPS[onboardingStep].sub}</p>}
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 6, padding: '0 24px 16px' }}>
              {ONBOARDING_TIPS.map((_, i) => (
                <div key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: i === onboardingStep ? ACCENT : themeStyle.border, transition: 'background 0.2s' }} />
              ))}
            </div>
            <div style={{ display: 'flex', borderTop: `1px solid ${themeStyle.border}` }}>
              <button onClick={() => setShowOnboarding(false)} style={{ flex: 1, padding: '14px', border: 'none', background: 'none', color: themeStyle.muted, fontSize: 14, cursor: 'pointer' }}>건너뛰기</button>
              <button onClick={() => { if (onboardingStep < ONBOARDING_TIPS.length - 1) setOnboardingStep(s => s + 1); else setShowOnboarding(false) }} style={{ flex: 1, padding: '14px', border: 'none', borderLeft: `1px solid ${themeStyle.border}`, background: `${ACCENT}10`, color: ACCENT, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                {onboardingStep < ONBOARDING_TIPS.length - 1 ? '다음' : '시작하기'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TOC 패널 */}
      {showToc && (<div className="fixed inset-0 z-[60] flex"><div className="absolute inset-0 bg-black/40" onClick={() => setShowToc(false)} /><div className="relative w-72 max-w-[80vw] h-full flex flex-col shadow-2xl" style={{ backgroundColor: themeStyle.bg }}><div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: themeStyle.border }}><h3 className="font-semibold text-sm" style={{ color: themeStyle.headingColor }}>목차</h3><button onClick={() => setShowToc(false)} className="p-1 rounded hover:opacity-70" style={{ color: themeStyle.muted }}>✕</button></div><div className="flex-1 overflow-y-auto">{tocItems.map((item, i) => (<button key={i} onClick={() => { goToChapter(item.chapterIndex); setShowToc(false) }} className={`w-full text-left py-3 px-4 border-b text-sm ${item.chapterIndex === currentChapterIdx ? 'font-semibold' : 'hover:opacity-80'}`} style={{ borderColor: themeStyle.border, color: item.chapterIndex === currentChapterIdx ? ACCENT : themeStyle.text, backgroundColor: item.chapterIndex === currentChapterIdx ? 'rgba(245,158,11,0.06)' : 'transparent' }}>{item.title}</button>))}</div></div></div>)}

      {/* 노트 패널 */}
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
                  <div key={hl.id} style={{ padding: '12px 16px', borderBottom: `1px solid ${themeStyle.border}`, cursor: 'pointer' }} onClick={() => { goToVP(hl.page_number); setShowNotesPanel(false) }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontSize: 10, fontWeight: 500, padding: '2px 6px', borderRadius: 4, backgroundColor: HIGHLIGHT_COLORS[hl.color], color: themeStyle.text }}>p.{hl.page_number}</span>
                      <button onClick={e => { e.stopPropagation(); delHL(hl.id) }} style={{ padding: 4, borderRadius: 6, border: 'none', background: 'none', color: '#ef4444', cursor: 'pointer' }}><Trash2 style={{ width: 12, height: 12 }} /></button>
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
                      <button onClick={e => { e.stopPropagation(); delBM(bm.id) }} style={{ padding: 4, borderRadius: 6, border: 'none', background: 'none', color: '#ef4444', cursor: 'pointer' }}><Trash2 style={{ width: 12, height: 12 }} /></button>
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
                <button onClick={e => { e.stopPropagation(); toggleBM() }} style={{ width: '100%', padding: '10px', borderRadius: 10, border: `1px solid ${isCurrentPageBookmarked ? 'rgba(239,68,68,0.3)' : ACCENT + '40'}`, background: isCurrentPageBookmarked ? 'rgba(239,68,68,0.06)' : `${ACCENT}08`, color: isCurrentPageBookmarked ? '#ef4444' : ACCENT, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  {isCurrentPageBookmarked ? <><BookmarkCheck style={{ width: 16, height: 16 }} /> p.{virtualPageNumber} 책갈피 제거</> : <><Bookmark style={{ width: 16, height: 16 }} /> p.{virtualPageNumber} 책갈피 추가</>}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 상단 바 — 8칸 그리드 (풀스크린 추가) */}
      <div style={{ borderColor: themeStyle.border, display: "flex", justifyContent: "center", borderBottom: `1px solid ${themeStyle.border}`, flexShrink: 0, boxShadow: `0 1px 8px ${themeStyle.border}40` }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(9, 1fr)", gap: 8, padding: "14px 20px", width: "100%", maxWidth: 560 }}>
        <button onClick={e => { e.stopPropagation(); if (onBack) onBack() }} className="flex flex-col items-center justify-center py-2.5 rounded-lg hover:opacity-70" style={{ color: themeStyle.muted }}><Home className="w-4 h-4" /><span style={{ fontSize: 10, marginTop: 5 }}>나가기</span></button>
        <button onClick={e => { e.stopPropagation(); setShowToc(!showToc) }} className="flex flex-col items-center justify-center py-2.5 rounded-lg hover:opacity-70" style={{ color: showToc ? ACCENT : themeStyle.muted }}><List className="w-4 h-4" /><span style={{ fontSize: 10, marginTop: 5 }}>목차</span></button>
        <button onClick={e => { e.stopPropagation(); setShowSearch(!showSearch) }} className="flex flex-col items-center justify-center py-2.5 rounded-lg hover:opacity-70" style={{ color: showSearch ? ACCENT : themeStyle.muted }}><Search className="w-4 h-4" /><span style={{ fontSize: 10, marginTop: 5 }}>검색</span></button>
        <button onClick={e => { e.stopPropagation(); setFocusMode(!focusMode) }} className="flex flex-col items-center justify-center py-2.5 rounded-lg" style={{ color: focusMode ? ACCENT : themeStyle.muted, backgroundColor: focusMode ? `${ACCENT}15` : 'transparent' }}><Focus className="w-4 h-4" /><span style={{ fontSize: 10, marginTop: 5 }}>집중</span></button>
        <div className="flex items-center justify-center"><span className="text-[10px] font-medium" style={{ color: themeStyle.muted }}>{virtualPageNumber}/{virtualTotalPages}</span></div>
        <button onClick={e => { e.stopPropagation(); setNotesTab('highlights'); setShowNotesPanel(!showNotesPanel) }} className="flex flex-col items-center justify-center py-2.5 rounded-lg" style={{ color: showNotesPanel && notesTab === 'highlights' ? ACCENT : highlights.length > 0 ? ACCENT : themeStyle.muted }}><Highlighter className="w-4 h-4" /><span style={{ fontSize: 10, marginTop: 5 }}>형광펜</span></button>
        <button onClick={e => { e.stopPropagation(); setNotesTab('bookmarks'); setShowNotesPanel(!showNotesPanel) }} className="flex flex-col items-center justify-center py-2.5 rounded-lg hover:opacity-70" style={{ color: showNotesPanel && notesTab === 'bookmarks' ? ACCENT : isCurrentPageBookmarked ? ACCENT : themeStyle.muted }}>{isCurrentPageBookmarked ? <BookmarkCheck className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}<span style={{ fontSize: 10, marginTop: 5 }}>책갈피</span></button>
        <button onClick={e => { e.stopPropagation(); toggleFullscreen() }} className="flex flex-col items-center justify-center py-2.5 rounded-lg hover:opacity-70" style={{ color: isFullscreen ? ACCENT : themeStyle.muted, backgroundColor: isFullscreen ? `${ACCENT}15` : 'transparent' }}>{isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}<span style={{ fontSize: 10, marginTop: 5 }}>{isFullscreen ? '축소' : '전체'}</span></button>
        <button onClick={e => { e.stopPropagation(); setShowSettings(!showSettings) }} className="flex flex-col items-center justify-center py-2.5 rounded-lg hover:opacity-70" style={{ color: showSettings ? ACCENT : themeStyle.muted }}><Settings2 className="w-4 h-4" /><span style={{ fontSize: 10, marginTop: 5 }}>설정</span></button>
      </div>
      </div>

      {/* 검색 패널 */}
      {showSearch && (<div style={{ borderBottom: `1px solid ${themeStyle.border}`, backgroundColor: themeStyle.bg, flexShrink: 0, display: 'flex', justifyContent: 'center' }}><div style={{ width: '100%', maxWidth: 520, padding: '14px 28px' }}><div className="flex items-center gap-4 px-6 py-3.5 rounded-2xl border" style={{ borderColor: themeStyle.border, backgroundColor: themeStyle.pageBg }}><Search className="w-4 h-4 flex-shrink-0" style={{ color: themeStyle.muted }} /><input ref={searchInputRef} type="text" value={searchQuery} onChange={e => { setSearchQuery(e.target.value); doSearch(e.target.value) }} onKeyDown={e => { if (e.key === 'Escape') setShowSearch(false) }} placeholder="본문 검색..." className="flex-1 bg-transparent outline-none text-sm" style={{ color: themeStyle.text }} />{searchQuery && <span className="text-[10px] flex-shrink-0" style={{ color: themeStyle.muted }}>{searchResults.length}건</span>}<button onClick={() => { setShowSearch(false); setSearchQuery(''); setSearchResults([]) }} className="p-1.5 rounded-lg hover:opacity-70 flex-shrink-0" style={{ color: themeStyle.muted }}><X className="w-4 h-4" /></button></div>{searchResults.length > 0 && (<div className="mt-2 rounded-xl border overflow-y-auto" style={{ borderColor: themeStyle.border, maxHeight: '40vh' }}>{searchResults.map((r, i) => (<button key={i} className="w-full text-left px-3 py-2.5 border-b hover:opacity-80" style={{ borderColor: themeStyle.border }} onClick={() => { goToChapter(r.chapterIdx); setShowSearch(false) }}><span className="text-[10px] font-medium block mb-0.5" style={{ color: ACCENT }}>{r.chapterTitle}</span><p className="text-xs leading-relaxed" style={{ color: themeStyle.text }} dangerouslySetInnerHTML={{ __html: r.snippet.replace(new RegExp(`(${searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'), `<span style="background:${ACCENT}44;border-radius:2px;padding:0 2px">$1</span>`) }} /></button>))}</div>)}{searchQuery && searchResults.length === 0 && <p className="text-center text-xs py-3" style={{ color: themeStyle.muted }}>검색 결과가 없습니다</p>}</div></div>)}

      {/* 설정 바텀시트 */}
      {showSettings && (<><div className="fixed inset-0 z-[55]" onClick={() => setShowSettings(false)} /><div className="fixed z-[56] overflow-y-auto" style={{ bottom: 12, left: '50%', transform: 'translateX(-50%)', width: 'calc(100% - 32px)', maxWidth: 420, maxHeight: '75vh', borderRadius: 20, backgroundColor: theme === 'dark' ? 'rgba(26,22,18,0.52)' : theme === 'sepia' ? 'rgba(243,235,218,0.52)' : 'rgba(250,250,248,0.52)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', border: `1px solid ${themeStyle.border}`, boxShadow: '0 8px 40px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06)' }}>
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 14, paddingBottom: 6 }}><div style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: themeStyle.border }} /></div>
        <div style={{ padding: '8px 28px 36px', display: 'flex', flexDirection: 'column', gap: 28 }}>
          <div><p style={{ fontSize: 12, fontWeight: 500, color: themeStyle.muted, marginBottom: 16 }}>배경 테마</p><div style={{ display: 'flex', gap: 20, justifyContent: 'center' }}>{(Object.keys(THEMES) as ReflowTheme[]).map(t => (<button key={t} onClick={() => setTheme(t)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}><div style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: THEMES[t].bg, border: theme === t ? `2.5px solid ${ACCENT}` : `2px solid ${THEMES[t].border}`, boxShadow: theme === t ? `0 0 0 3px ${ACCENT}30` : 'none' }} /><span style={{ fontSize: 11, color: theme === t ? ACCENT : themeStyle.muted }}>{t === 'light' ? '밝은' : t === 'sepia' ? '세피아' : '어두운'}</span></button>))}</div></div>
          <div><p style={{ fontSize: 12, fontWeight: 500, color: themeStyle.muted, marginBottom: 14 }}>글꼴</p><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{(Object.keys(FONTS) as ReflowFont[]).map(f => (<button key={f} onClick={() => setFont(f)} style={{ flex: '1 1 auto', minWidth: 60, padding: '10px 4px', borderRadius: 12, fontSize: 13, fontFamily: FONTS[f].family, border: `1.5px solid ${font === f ? ACCENT : themeStyle.border}`, backgroundColor: font === f ? `${ACCENT}12` : 'transparent', color: font === f ? ACCENT : themeStyle.text, cursor: 'pointer', fontWeight: font === f ? 600 : 400 }}>{FONTS[f].label}</button>))}</div></div>
          <div><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}><p style={{ fontSize: 12, fontWeight: 500, color: themeStyle.muted }}>글자 크기</p><span style={{ fontSize: 12, fontFamily: 'monospace', color: themeStyle.text }}>{fontSize}px</span></div><div style={{ display: 'flex', alignItems: 'center', gap: 14 }}><button onClick={() => setFontSize(s => Math.max(12, s - 1))} style={{ width: 38, height: 38, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${themeStyle.border}`, background: 'none', color: themeStyle.muted, cursor: 'pointer', flexShrink: 0 }}><Minus style={{ width: 16, height: 16 }} /></button><input type="range" min={12} max={32} value={fontSize} onChange={e => setFontSize(Number(e.target.value))} className="flex-1 accent-amber-500" style={{ height: 4 }} /><button onClick={() => setFontSize(s => Math.min(32, s + 1))} style={{ width: 38, height: 38, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${themeStyle.border}`, background: 'none', color: themeStyle.muted, cursor: 'pointer', flexShrink: 0 }}><Plus style={{ width: 16, height: 16 }} /></button></div></div>
          <div><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}><p style={{ fontSize: 12, fontWeight: 500, color: themeStyle.muted }}>줄간격</p><span style={{ fontSize: 12, fontFamily: 'monospace', color: themeStyle.text }}>{lineHeight.toFixed(1)}</span></div><div style={{ display: 'flex', alignItems: 'center', gap: 14 }}><button onClick={() => setLineHeight(h => Math.max(1.2, Math.round((h - 0.1) * 10) / 10))} style={{ width: 38, height: 38, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${themeStyle.border}`, background: 'none', color: themeStyle.muted, cursor: 'pointer', flexShrink: 0 }}><Minus style={{ width: 16, height: 16 }} /></button><input type="range" min={1.2} max={2.4} step={0.1} value={lineHeight} onChange={e => setLineHeight(Number(e.target.value))} className="flex-1 accent-amber-500" style={{ height: 4 }} /><button onClick={() => setLineHeight(h => Math.min(2.4, Math.round((h + 0.1) * 10) / 10))} style={{ width: 38, height: 38, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${themeStyle.border}`, background: 'none', color: themeStyle.muted, cursor: 'pointer', flexShrink: 0 }}><Plus style={{ width: 16, height: 16 }} /></button></div></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}><div><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}><p style={{ fontSize: 11, fontWeight: 500, color: themeStyle.muted }}>여백</p><span style={{ fontSize: 11, fontFamily: 'monospace', color: themeStyle.text }}>{marginSize}px</span></div><input type="range" min={8} max={80} step={4} value={marginSize} onChange={e => setMarginSize(Number(e.target.value))} className="w-full accent-amber-500" style={{ height: 4 }} /></div><div><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}><p style={{ fontSize: 11, fontWeight: 500, color: themeStyle.muted }}>자간</p><span style={{ fontSize: 11, fontFamily: 'monospace', color: themeStyle.text }}>{(letterSpacing * 0.5).toFixed(1)}px</span></div><input type="range" min={-2} max={4} step={0.5} value={letterSpacing} onChange={e => setLetterSpacing(Number(e.target.value))} className="w-full accent-amber-500" style={{ height: 4 }} /></div></div>
          <div><p style={{ fontSize: 12, fontWeight: 500, color: themeStyle.muted, marginBottom: 14 }}>정렬</p><div style={{ display: 'flex', gap: 10 }}>{(['left', 'justify'] as ReflowAlign[]).map(a => (<button key={a} onClick={() => setTextAlign(a)} style={{ flex: 1, padding: '11px 0', borderRadius: 12, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, border: `1.5px solid ${textAlign === a ? ACCENT : themeStyle.border}`, backgroundColor: textAlign === a ? `${ACCENT}12` : 'transparent', color: textAlign === a ? ACCENT : themeStyle.text, cursor: 'pointer', fontWeight: textAlign === a ? 600 : 400 }}>{a === 'left' ? <><AlignLeft style={{ width: 16, height: 16 }} /> 왼쪽</> : <><AlignJustify style={{ width: 16, height: 16 }} /> 양쪽</>}</button>))}</div></div>
        </div>
      </div></>)}

      {/* 페이지네이션 본문 */}
      <div className={`flex-1 min-h-0 relative ${focusMode ? 'epub-focus-active' : ''}`} style={{ backgroundColor: themeStyle.bg, userSelect: 'text', WebkitUserSelect: 'text' as any, overflow: 'clip' }} onTouchStart={onTS} onTouchMove={onTM} onTouchEnd={onTE} onMouseDown={onMD} onClick={onClick} onMouseUp={onSelEnd} onDoubleClick={e => { const cx = e.clientX; const w = window.innerWidth; if (cx < w * 0.45 || cx > w * 0.55) { e.preventDefault(); window.getSelection()?.removeAllRanges() } }}>
        <div style={{ maxWidth: MAX_WIDTH, margin: '0 auto', padding: `2rem ${marginSize}px`, height: '100%' }}>
          <div ref={paginationContainerRef} className="relative" style={{ height: '100%', overflow: 'clip' }}>
            {currentChapterData ? <div ref={contentColumnRef} style={{ columnWidth: columnWidthPx > 0 ? `${columnWidthPx - 40}px` : '100vw', columnGap: '40px', columnFill: 'auto', height: '100%' }} /> : <p className="text-center py-8" style={{ color: themeStyle.muted }}>(표시할 내용 없음)</p>}
          </div>
        </div>
      </div>

      {/* 하이라이트 팝업 */}
      {showHighlightMenu && pendingSelection && (<div className="fixed z-[70] flex items-center gap-1 px-2 py-1.5 rounded-xl shadow-lg border" style={{ left: Math.min(highlightMenuPos.x - 60, (typeof window !== 'undefined' ? window.innerWidth : 400) - 140), top: Math.min(highlightMenuPos.y, (typeof window !== 'undefined' ? window.innerHeight : 800) - 50), backgroundColor: themeStyle.bg, borderColor: themeStyle.border }}>{Object.entries(HIGHLIGHT_COLORS).map(([c, bg]) => (<button key={c} onClick={() => saveHL(c)} className="w-7 h-7 rounded-full border-2 hover:scale-110 transition-transform" style={{ backgroundColor: bg, borderColor: c === 'yellow' ? '#fbbf24' : c === 'green' ? '#86efac' : c === 'blue' ? '#93c5fd' : '#f9a8d4' }} />))}<button onClick={() => { setShowHighlightMenu(false); setPendingSelection(null); window.getSelection()?.removeAllRanges() }} className="w-7 h-7 rounded-full flex items-center justify-center" style={{ color: themeStyle.muted }}><X className="w-3.5 h-3.5" /></button></div>)}

      {/* 메모 툴팁 */}
      {memoTooltip && (<div className="fixed z-[80] pointer-events-none" style={{ left: Math.max(8, Math.min(memoTooltip.x, (typeof window !== 'undefined' ? window.innerWidth : 400) - 260)), top: Math.max(8, memoTooltip.y - 8), transform: 'translateY(-100%)' }}><div style={{ maxWidth: 250, padding: '8px 12px', borderRadius: 10, fontSize: Math.round(fontSize * 0.75), lineHeight: 1.5, color: themeStyle.text, background: theme === 'dark' ? '#2E2620' : theme === 'sepia' ? '#e8dcc8' : '#f5f0eb', border: `1px solid ${themeStyle.border}`, boxShadow: '0 4px 16px rgba(0,0,0,0.25)', wordBreak: 'keep-all', whiteSpace: 'pre-wrap' }}><span style={{ opacity: 0.5, marginRight: 4 }}>✎</span>{memoTooltip.text}</div></div>)}

      {/* 메모 모달 */}
      {showMemoModal && editingHighlight && (<div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} onClick={() => { setShowMemoModal(false); setEditingHighlight(null) }}><div className="w-full max-w-sm rounded-2xl p-5 shadow-xl" style={{ backgroundColor: themeStyle.bg }} onClick={e => e.stopPropagation()}><div className="flex items-center justify-between mb-3"><span className="text-sm font-medium" style={{ color: themeStyle.text }}>메모</span><div className="flex items-center gap-2"><button onClick={() => delHL(editingHighlight.id)} className="p-1.5 rounded-lg hover:bg-red-500/10" style={{ color: '#ef4444' }}><Trash2 className="w-4 h-4" /></button><button onClick={() => { setShowMemoModal(false); setEditingHighlight(null) }} className="p-1.5 rounded-lg" style={{ color: themeStyle.muted }}><X className="w-4 h-4" /></button></div></div><p className="text-xs mb-3 px-2 py-1.5 rounded-lg" style={{ backgroundColor: HIGHLIGHT_COLORS[editingHighlight.color], color: themeStyle.text }}>&ldquo;{editingHighlight.selected_text.slice(0, 100)}{editingHighlight.selected_text.length > 100 ? '...' : ''}&rdquo;</p><textarea value={memoText} onChange={e => setMemoText(e.target.value)} placeholder="메모를 입력하세요..." className="w-full rounded-xl border px-3 py-2 text-sm resize-none" rows={3} style={{ backgroundColor: themeStyle.bg, color: themeStyle.text, borderColor: themeStyle.border }} autoFocus /><button onClick={saveMemo} className="w-full mt-3 py-2 rounded-xl text-sm font-medium text-white" style={{ backgroundColor: ACCENT }}>저장</button></div></div>)}

      {/* 하단 프로그레스 바 */}
      {internalChapters.length > 0 && (<div style={{ borderTop: `1px solid ${themeStyle.border}`, backgroundColor: themeStyle.bg, flexShrink: 0, width: "100%", display: "flex", justifyContent: "center", boxShadow: `0 -1px 8px ${themeStyle.border}40` }}>
        <div style={{ padding: "10px 24px", width: "100%", maxWidth: 520 }}><div className="flex items-center gap-3"><button onClick={e => { e.stopPropagation(); goPrev() }} disabled={isFirst} className="p-1 rounded disabled:opacity-30" style={{ color: themeStyle.muted }}><ChevronLeft className="w-4 h-4" /></button><div className="flex-1 relative" onClick={e => { e.stopPropagation(); const rect = (e.currentTarget as HTMLElement).getBoundingClientRect(); goToVP(Math.max(1, Math.round(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * virtualTotalPages))) }}><div className="h-1.5 rounded-full cursor-pointer" style={{ backgroundColor: themeStyle.border }}><div className="h-full rounded-full transition-all duration-200" style={{ width: `${virtualTotalPages > 1 ? ((virtualPageNumber - 1) / (virtualTotalPages - 1)) * 100 : 0}%`, background: `linear-gradient(90deg, ${ACCENT}, #E8860A)`, boxShadow: `0 0 8px ${ACCENT}50` }} /></div><input type="range" min={1} max={virtualTotalPages} value={virtualPageNumber} onChange={e => { e.stopPropagation(); goToVP(Number(e.target.value)) }} onClick={e => e.stopPropagation()} className="absolute inset-0 w-full opacity-0 cursor-pointer" style={{ height: '24px', top: '-6px' }} /></div><button onClick={e => { e.stopPropagation(); goNext() }} disabled={isLast} className="p-1 rounded disabled:opacity-30" style={{ color: themeStyle.muted }}><ChevronRight className="w-4 h-4" /></button></div><div className="flex justify-between mt-1"><span className="text-[10px]" style={{ color: themeStyle.muted }}>{currentChapterIdx + 1}/{internalChapters.length} 챕터</span><span className="text-[10px]" style={{ color: themeStyle.muted }}>{(() => { const pct = virtualTotalPages > 1 ? Math.round(((virtualPageNumber - 1) / (virtualTotalPages - 1)) * 100) : 0; if (virtualTotalPages <= 1 || virtualPageNumber <= 1 || elapsedSec < 10) return `${pct}%`; const pr = virtualPageNumber - 1; const spp = elapsedSec / pr; const pl = virtualTotalPages - virtualPageNumber; const sl = Math.round(spp * pl); if (sl < 60) return `${pct}% · 1분 미만`; const ml = Math.round(sl / 60); if (ml < 60) return `${pct}% · 약 ${ml}분 남음`; const h = Math.floor(ml / 60); const m = ml % 60; return m === 0 ? `${pct}% · 약 ${h}시간 남음` : `${pct}% · 약 ${h}시간 ${m}분 남음` })()}</span></div></div>
      </div>)}
    </div>
  )
}
