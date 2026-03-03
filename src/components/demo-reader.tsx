// components/demo-reader.tsx
// TeXTREME 데모 리더 — 풀기능 + 페이월 + 전환율 UX 전략

'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import {
  ChevronLeft, ChevronRight, Minus, Plus, List, AlignLeft, AlignJustify,
  Settings2, Focus, Highlighter, Trash2, X, Bookmark, BookmarkCheck, Search,
  Download, Clock, Zap, FileText, BookOpen,
} from 'lucide-react'

export interface DemoChapter { title: string; paragraphs: string[] }
interface DemoReaderProps {
  chapters: DemoChapter[]
  title?: string
  onBack?: () => void
  totalBookPages?: number
  freePreviewPages?: number
  pricePerPage?: number
  onPurchase?: () => void
}
interface Highlight { id: string; epub_key: string; block_id: string; start_offset: number; end_offset: number; selected_text: string; color: string; memo: string | null; page_number: number; created_at: number }
interface BookmarkItem { id: string; epub_key: string; chapter_idx: number; page_in_chapter: number; virtual_page: number; title: string; created_at: number }
interface SearchResult { chapterIdx: number; chapterTitle: string; snippet: string; matchStart: number }
interface TocItem { title: string; chapterIndex: number }
type ReflowFont = 'sans' | 'serif' | 'mono'
type ReflowTheme = 'light' | 'sepia' | 'dark'
type ReflowAlign = 'left' | 'justify'

const FONTS: Record<ReflowFont, { label: string; family: string }> = {
  sans: { label: '고딕', family: 'system-ui, -apple-system, "Noto Sans KR", sans-serif' },
  serif: { label: '명조', family: '"Noto Serif KR", "Batang", Georgia, serif' },
  mono: { label: '고정폭', family: '"Noto Sans Mono", "D2Coding", monospace' },
}
const THEMES: Record<ReflowTheme, { bg: string; text: string; muted: string; border: string; pageBg: string; headingColor: string; linkColor: string }> = {
  light: { bg: '#FFFFFF', text: '#2D2016', muted: '#9C8B7A', border: '#E7D8C9', pageBg: '#F7F2EF', headingColor: '#2D2016', linkColor: '#3b82f6' },
  sepia: { bg: '#f8f1e3', text: '#5b4636', muted: '#8b7355', border: '#d4c5a9', pageBg: '#ede4d3', headingColor: '#3d2b1f', linkColor: '#8b5e3c' },
  dark: { bg: '#241E18', text: '#EEE4E1', muted: '#9C8B7A', border: '#3A302A', pageBg: '#1A1410', headingColor: '#EEE4E1', linkColor: '#93c5fd' },
}
const HIGHLIGHT_COLORS: Record<string, string> = { yellow: 'rgba(250,220,50,0.3)', green: 'rgba(100,220,100,0.25)', blue: 'rgba(90,180,250,0.25)', pink: 'rgba(245,130,180,0.3)' }
const MAX_WIDTH = '42rem'; const DB_NAME = 'textreme_reader'; const DB_VERSION = 2; const ACCENT = '#F59E0B'; const DEMO_KEY = 'demo_preview'

function calcPrice(pages: number, perPage: number): number {
  return Math.max(500, Math.round((pages * perPage) / 100) * 100)
}

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
      // If version conflict, delete and retry
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

// ━━━ 메인 컴포넌트 ━━━
export default function DemoReader({ chapters, title = '변환된 EPUB', onBack, totalBookPages, freePreviewPages, pricePerPage = 10, onPurchase }: DemoReaderProps) {
  const internalChapters = useMemo(() => chapters.map((ch, i) => ({ title: ch.title, html: ch.paragraphs.map(p => `<p>${p}</p>`).join(''), textContent: ch.paragraphs.join(' '), order: i })), [chapters])
  const tocItems: TocItem[] = useMemo(() => internalChapters.map((ch, i) => ({ title: ch.title, chapterIndex: i })), [internalChapters])

  const [currentChapterIdx, setCurrentChapterIdx] = useState(0)
  const [pageInChapter, setPageInChapter] = useState(0)
  const [totalPagesInChapter, setTotalPagesInChapter] = useState(1)
  const [chapterPageCounts, setChapterPageCounts] = useState<number[]>(new Array(chapters.length).fill(1))
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
  const [showHighlightPanel, setShowHighlightPanel] = useState(false)
  const [memoTooltip, setMemoTooltip] = useState<{ text: string; x: number; y: number } | null>(null)
  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>([])
  const [showBookmarkPanel, setShowBookmarkPanel] = useState(false)
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

  // ━━━ Paywall & UX states ━━━
  const [showPaywall, setShowPaywall] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [onboardingStep, setOnboardingStep] = useState(0)
  const [showPdfCompare, setShowPdfCompare] = useState(false)

  const virtualPageNumber = useMemo(() => { let p = 1; for (let i = 0; i < currentChapterIdx; i++) p += chapterPageCounts[i] || 1; p += pageInChapter; return p }, [currentChapterIdx, pageInChapter, chapterPageCounts])
  const virtualTotalPages = useMemo(() => chapterPageCounts.length === 0 ? internalChapters.length || 1 : Math.max(chapterPageCounts.reduce((s, c) => s + (c || 1), 0), 1), [internalChapters, chapterPageCounts])
  const isCurrentPageBookmarked = useMemo(() => bookmarks.some(b => b.chapter_idx === currentChapterIdx && b.page_in_chapter === pageInChapter), [bookmarks, currentChapterIdx, pageInChapter])

  const bookPrice = totalBookPages ? calcPrice(totalBookPages, pricePerPage) : 0
  const isPaywalled = freePreviewPages != null && virtualPageNumber > freePreviewPages
  const sunkCostCount = highlights.length + bookmarks.length

  // ━━━ Paywall trigger ━━━
  useEffect(() => {
    if (isPaywalled && !showPaywall) setShowPaywall(true)
  }, [isPaywalled])

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
    let html = currentChapterData.html
    const chHL = highlights.filter(h => h.block_id === chapterBlockId)
    if (chHL.length > 0 && typeof window !== 'undefined') {
      try {
        const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html'); const root = doc.body.firstElementChild as HTMLElement
        const getTextNodes = (el: Node): { node: Text; start: number }[] => { const ns: { node: Text; start: number }[] = []; let o = 0; const walk = (n: Node) => { if (n.nodeType === 3) { ns.push({ node: n as Text, start: o }); o += (n as Text).textContent?.length || 0 } else { for (let i = 0; i < n.childNodes.length; i++) walk(n.childNodes[i]) } }; walk(el); return ns }
        for (const hl of [...chHL].sort((a, b) => b.start_offset - a.start_offset)) {
          const tns = getTextNodes(root)
          for (let i = tns.length - 1; i >= 0; i--) {
            const tn = tns[i]; const len = tn.node.textContent?.length || 0; if (tn.start + len <= hl.start_offset || tn.start >= hl.end_offset) continue
            const ls = Math.max(0, hl.start_offset - tn.start); const le = Math.min(len, hl.end_offset - tn.start); if (ls >= le) continue
            try { const r = doc.createRange(); r.setStart(tn.node, ls); r.setEnd(tn.node, le); const m = doc.createElement('mark'); m.setAttribute('data-hl-id', hl.id); m.setAttribute('data-hl-color', hl.color || 'yellow'); if (hl.memo) m.setAttribute('data-memo', hl.memo); m.style.backgroundColor = HIGHLIGHT_COLORS[hl.color] || HIGHLIGHT_COLORS.yellow; r.surroundContents(m) } catch {}
          }
        }
        html = root.innerHTML
      } catch {}
    }
    return `<style>
.epub-content{display:block;margin:0;padding:0;font-family:${fontStyle.family};font-size:${fontSize}px;line-height:${lineHeight};color:${themeStyle.text};word-break:keep-all;overflow-wrap:break-word;letter-spacing:${letterSpacing*0.5}px;text-align:${textAlign};user-select:text;-webkit-user-select:text;cursor:text}
.epub-content *{max-width:100%;box-sizing:border-box;user-select:text!important;-webkit-user-select:text!important}
.epub-content h2{color:${themeStyle.headingColor};font-size:${Math.round(fontSize*1.35)}px;font-weight:bold;line-height:1.35;margin-bottom:0.75em}
.epub-content p{margin-bottom:0.8em;text-indent:1em}
.epub-content mark[data-hl-id]{color:inherit!important;border-radius:3px;padding:1px 2px;cursor:pointer;box-decoration-break:clone;-webkit-box-decoration-break:clone}
.epub-focus-active .epub-content p,.epub-focus-active .epub-content h2{opacity:0.12;transition:opacity 0.3s,transform 0.3s;cursor:pointer}
.epub-focus-active .epub-content [data-epub-focused="true"]{opacity:1!important;transform:scale(1.005)}
.epub-focus-active .epub-content [data-epub-adjacent="true"]{opacity:0.25!important}
</style><div class="epub-content" data-block-id="${chapterBlockId}"><h2 style="margin-top:0">${currentChapterData.title}</h2>${html}</div>`
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

  // 선택 오버레이 — 비활성화 (CSS ::selection만 사용)
  useEffect(() => {}, [])

  // 글로벌 스타일
  useEffect(() => { const id = 'epub-lite-styles'; let el = document.getElementById(id) as HTMLStyleElement | null; if (!el) { el = document.createElement('style'); el.id = id; document.head.appendChild(el) }; el.textContent = `.epub-content::selection,.epub-content *::selection{background-color:rgba(140,160,180,0.3)!important;color:inherit!important}.epub-content mark[data-hl-color="yellow"]{background-color:rgba(250,220,50,0.3)!important}.epub-content mark[data-hl-color="green"]{background-color:rgba(100,220,100,0.25)!important}.epub-content mark[data-hl-color="blue"]{background-color:rgba(90,180,250,0.25)!important}.epub-content mark[data-hl-color="pink"]{background-color:rgba(245,130,180,0.3)!important}`; return () => { el?.remove() } }, [themeStyle.text])

  // 네비게이션
  const goNext = useCallback(() => { if (pageInChapter < totalPagesInChapter - 1) { slideDirectionRef.current = 'left'; setPageInChapter(p => p + 1) } else if (currentChapterIdx < internalChapters.length - 1) { slideDirectionRef.current = 'left'; setCurrentChapterIdx(p => p + 1); setPageInChapter(0) } }, [pageInChapter, totalPagesInChapter, currentChapterIdx, internalChapters.length])
  const goPrev = useCallback(() => { if (pageInChapter > 0) { slideDirectionRef.current = 'right'; setPageInChapter(p => p - 1) } else if (currentChapterIdx > 0) { slideDirectionRef.current = 'right'; const pi = currentChapterIdx - 1; setCurrentChapterIdx(pi); setPageInChapter(Math.max(0, (chapterPageCounts[pi] || 1) - 1)) } }, [pageInChapter, currentChapterIdx, chapterPageCounts])
  const goToChapter = useCallback((i: number) => { setCurrentChapterIdx(Math.max(0, Math.min(i, internalChapters.length - 1))); setPageInChapter(0) }, [internalChapters.length])
  const goToVP = useCallback((vp: number) => { let acc = 0; for (let i = 0; i < internalChapters.length; i++) { const c = chapterPageCounts[i] || 1; if (acc + c >= vp) { setCurrentChapterIdx(i); setPageInChapter(vp - acc - 1); return }; acc += c }; if (internalChapters.length > 0) { setCurrentChapterIdx(internalChapters.length - 1); setPageInChapter(Math.max(0, (chapterPageCounts[internalChapters.length - 1] || 1) - 1)) } }, [internalChapters.length, chapterPageCounts])

  // 키보드
  useEffect(() => { const h = (e: KeyboardEvent) => { const t = (e.target as HTMLElement)?.tagName; if (t === 'INPUT' || t === 'TEXTAREA') return; if (showSettings || showToc || showHighlightPanel || showBookmarkPanel || showSearch || showPaywall) return; if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); goPrev() } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ') { e.preventDefault(); goNext() } else if ((e.key === 'f' || e.key === 'F') && (e.ctrlKey || e.metaKey)) { e.preventDefault(); setShowSearch(p => !p) } }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h) }, [goNext, goPrev, showSettings, showToc, showHighlightPanel, showBookmarkPanel, showSearch, showPaywall])

  // 터치
  const onTS = (e: React.TouchEvent) => { touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; touchEndRef.current = null }
  const onTM = (e: React.TouchEvent) => { touchEndRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY } }
  const onTE = () => { if (showPaywall) return; const s = touchStartRef.current; const e = touchEndRef.current; if (!s || !e) return; const dx = s.x - e.x; if (Math.abs(dx) > 50 && Math.abs(s.y - e.y) < Math.abs(dx)) { dx > 0 ? goNext() : goPrev() }; touchStartRef.current = null; touchEndRef.current = null }

  // 클릭
  const onMD = (e: React.MouseEvent) => { mouseDownPosRef.current = { x: e.clientX, y: e.clientY, t: Date.now() } }
  const onClick = (e: React.MouseEvent) => {
    if (showSettings || showToc || showHighlightPanel || showMemoModal || showBookmarkPanel || showSearch || showPaywall) return
    const md = mouseDownPosRef.current; const quick = md?.t && Date.now() - md.t < 300; if (md && Math.sqrt((e.clientX - md.x) ** 2 + (e.clientY - md.y) ** 2) > 5) { mouseDownPosRef.current = null; return }; mouseDownPosRef.current = null
    if (quick) { window.getSelection()?.removeAllRanges(); setShowHighlightMenu(false) }
    const sel = window.getSelection(); if (sel && !sel.isCollapsed && sel.toString().trim().length > 0) return
    if (focusMode) { contentColumnRef.current?.querySelectorAll('[data-epub-focused],[data-epub-adjacent]').forEach(el => { el.removeAttribute('data-epub-focused'); el.removeAttribute('data-epub-adjacent') }); return }
    const cx = e.clientX; const w = window.innerWidth; if (cx < w * 0.45) goPrev(); else if (cx > w * 0.55) goNext()
  }

  // 텍스트 선택 → 하이라이트
  const onSelEnd = () => {
    if (focusMode || showSettings || showPaywall) return; const md = mouseDownPosRef.current; if (md?.t && Date.now() - md.t < 300) return
    const sel = window.getSelection(); if (!sel || sel.isCollapsed || !sel.toString().trim()) { setShowHighlightMenu(false); return }; const text = sel.toString().trim(); if (text.length < 2) return
    const an = sel.anchorNode; if (!an) return; const bl = (an.nodeType === 3 ? an.parentElement : an as HTMLElement)?.closest('[data-block-id]'); if (!bl) return; const bid = bl.getAttribute('data-block-id'); if (!bid) return
    const range = sel.getRangeAt(0); const pre = document.createRange(); pre.setStart(bl, 0); pre.setEnd(range.startContainer, range.startOffset); const so = pre.toString().length
    const rect = range.getBoundingClientRect(); setHighlightMenuPos({ x: rect.left + rect.width / 2, y: rect.bottom + 8 }); setPendingSelection({ blockId: bid, start: so, end: so + text.length, text }); setShowHighlightMenu(true)
  }

  // 모바일 selectionchange
  useEffect(() => { let t: ReturnType<typeof setTimeout>; const h = () => { clearTimeout(t); t = setTimeout(() => { if (focusMode || showSettings || showPaywall) return; const sel = window.getSelection(); if (!sel || sel.isCollapsed || !sel.toString().trim()) return; const text = sel.toString().trim(); if (text.length < 2) return; const an = sel.anchorNode; if (!an) return; const bl = (an.nodeType === 3 ? an.parentElement : an as HTMLElement)?.closest('[data-block-id]'); if (!bl) return; const bid = bl.getAttribute('data-block-id'); if (!bid) return; const range = sel.getRangeAt(0); const pre = document.createRange(); pre.setStart(bl, 0); pre.setEnd(range.startContainer, range.startOffset); const so = pre.toString().length; const rect = range.getBoundingClientRect(); setHighlightMenuPos({ x: rect.left + rect.width / 2, y: rect.bottom + 8 }); setPendingSelection({ blockId: bid, start: so, end: so + text.length, text }); setShowHighlightMenu(true) }, 500) }; document.addEventListener('selectionchange', h); return () => { document.removeEventListener('selectionchange', h); clearTimeout(t) } }, [focusMode, showSettings, showPaywall, currentChapterIdx])

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
    <div className="h-full flex flex-col" style={{ backgroundColor: themeStyle.pageBg, fontFamily: "'Noto Sans KR', system-ui, sans-serif" }}>

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

      {/* ━━━ PAYWALL OVERLAY ━━━ */}
      {showPaywall && (
        <div className="fixed inset-0 z-[85] flex items-end sm:items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}>
          <div className="w-full max-w-md mx-4 mb-4 sm:mb-0 rounded-2xl overflow-hidden shadow-2xl" style={{ backgroundColor: themeStyle.bg, border: `1px solid ${themeStyle.border}`, maxHeight: '90vh', overflowY: 'auto' }}>
            {/* Header */}
            <div style={{ padding: '28px 24px 0', textAlign: 'center' }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>📖</div>
              <h3 style={{ color: themeStyle.text, fontWeight: 800, fontSize: 20, marginBottom: 4 }}>무료 미리보기는 여기까지</h3>
              <p style={{ color: themeStyle.muted, fontSize: 13 }}>
                {freePreviewPages}페이지 미리보기를 읽으셨습니다
              </p>
            </div>

            {/* Price + Anchoring */}
            {totalBookPages && totalBookPages > 0 && (
              <div style={{ margin: '20px 24px', padding: '20px', borderRadius: 16, background: `${ACCENT}08`, border: `1px solid ${ACCENT}30`, textAlign: 'center' }}>
                <p style={{ color: themeStyle.muted, fontSize: 12, marginBottom: 4 }}>전체 {totalBookPages}페이지</p>
                <div style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 800, fontSize: 36, color: ACCENT }}>₩{bookPrice.toLocaleString()}</div>
                <p style={{ color: themeStyle.muted, fontSize: 13, marginTop: 8 }}>
                  ☕ 커피 한 잔 가격으로 {totalBookPages}페이지를 편하게
                </p>
              </div>
            )}

            {/* Sunk cost — only if user made annotations */}
            {sunkCostCount > 0 && (
              <div style={{ margin: '0 24px 16px', padding: '14px 16px', borderRadius: 12, background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.15)' }}>
                <p style={{ color: '#22c55e', fontSize: 13, fontWeight: 600, textAlign: 'center' }}>
                  ✨ 지금까지 만든 {highlights.length > 0 ? `형광펜 ${highlights.length}개` : ''}{highlights.length > 0 && bookmarks.length > 0 ? ', ' : ''}{bookmarks.length > 0 ? `책갈피 ${bookmarks.length}개` : ''}가<br />전체 EPUB에서도 유지됩니다
                </p>
              </div>
            )}

            {/* 24hr urgency */}
            <div style={{ margin: '0 24px 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <Clock size={14} color={themeStyle.muted} />
              <p style={{ color: themeStyle.muted, fontSize: 12 }}>변환 결과는 24시간 보관됩니다</p>
            </div>

            {/* PDF vs EPUB toggle */}
            <div style={{ margin: '0 24px 20px' }}>
              <button onClick={() => setShowPdfCompare(!showPdfCompare)} style={{ width: '100%', padding: '10px', borderRadius: 10, border: `1px solid ${themeStyle.border}`, background: 'none', color: themeStyle.muted, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <FileText size={14} /> PDF vs EPUB 비교 보기 {showPdfCompare ? '▲' : '▼'}
              </button>
              {showPdfCompare && (
                <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div style={{ padding: 12, borderRadius: 10, border: '1px solid rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.04)', textAlign: 'center' }}>
                    <X size={16} color="#ef4444" style={{ margin: '0 auto 4px' }} />
                    <p style={{ color: '#ef4444', fontSize: 11, fontWeight: 600, marginBottom: 6 }}>PDF 모바일</p>
                    <p style={{ color: themeStyle.muted, fontSize: 10, lineHeight: 1.4 }}>확대/축소 필수<br />좌우 스크롤<br />글꼴 변경 불가<br />형광펜 불가</p>
                  </div>
                  <div style={{ padding: 12, borderRadius: 10, border: `1px solid ${ACCENT}40`, background: `${ACCENT}06`, textAlign: 'center' }}>
                    <Zap size={16} color={ACCENT} style={{ margin: '0 auto 4px' }} />
                    <p style={{ color: ACCENT, fontSize: 11, fontWeight: 600, marginBottom: 6 }}>EPUB 변환</p>
                    <p style={{ color: themeStyle.muted, fontSize: 10, lineHeight: 1.4 }}>자동 리플로우<br />스와이프 넘김<br />글꼴/크기 자유<br />형광펜·메모</p>
                  </div>
                </div>
              )}
            </div>

            {/* CTA */}
            <div style={{ padding: '0 24px 24px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button onClick={onPurchase} style={{ width: '100%', padding: '16px', borderRadius: 14, background: `linear-gradient(135deg, ${ACCENT}, #D97706)`, color: '#000', fontWeight: 800, fontSize: 16, border: 'none', cursor: 'pointer', boxShadow: `0 0 30px ${ACCENT}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <Download size={18} />
                EPUB 다운로드 · ₩{bookPrice.toLocaleString()}
              </button>
              <button onClick={() => { setShowPaywall(false); goPrev() }} style={{ width: '100%', padding: '10px', borderRadius: 10, background: 'none', border: `1px solid ${themeStyle.border}`, color: themeStyle.muted, fontSize: 13, cursor: 'pointer' }}>
                미리보기로 돌아가기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TOC 패널 */}
      {showToc && (<div className="fixed inset-0 z-[60] flex"><div className="absolute inset-0 bg-black/40" onClick={() => setShowToc(false)} /><div className="relative w-72 max-w-[80vw] h-full flex flex-col shadow-2xl" style={{ backgroundColor: themeStyle.bg }}><div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: themeStyle.border }}><h3 className="font-semibold text-sm" style={{ color: themeStyle.headingColor }}>목차</h3><button onClick={() => setShowToc(false)} className="p-1 rounded hover:opacity-70" style={{ color: themeStyle.muted }}>✕</button></div><div className="flex-1 overflow-y-auto">{tocItems.map((item, i) => (<button key={i} onClick={() => { goToChapter(item.chapterIndex); setShowToc(false) }} className={`w-full text-left py-3 px-4 border-b text-sm ${item.chapterIndex === currentChapterIdx ? 'font-semibold' : 'hover:opacity-80'}`} style={{ borderColor: themeStyle.border, color: item.chapterIndex === currentChapterIdx ? ACCENT : themeStyle.text, backgroundColor: item.chapterIndex === currentChapterIdx ? 'rgba(245,158,11,0.06)' : 'transparent' }}>{item.title}</button>))}</div></div></div>)}

      {/* 하이라이트 패널 */}
      {showHighlightPanel && (<div className="fixed inset-0 z-[60] flex justify-end"><div className="absolute inset-0 bg-black/40" onClick={() => setShowHighlightPanel(false)} /><div className="relative w-80 max-w-[85vw] h-full flex flex-col shadow-2xl" style={{ backgroundColor: themeStyle.bg }}><div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: themeStyle.border }}><h3 className="font-semibold text-sm" style={{ color: themeStyle.headingColor }}>형광펜 ({highlights.length})</h3><button onClick={() => setShowHighlightPanel(false)} className="p-1 rounded hover:opacity-70" style={{ color: themeStyle.muted }}>✕</button></div><div className="flex-1 overflow-y-auto">{highlights.length > 0 ? [...highlights].sort((a, b) => a.page_number - b.page_number).map(hl => (<div key={hl.id} className="px-4 py-3 border-b cursor-pointer hover:opacity-80" style={{ borderColor: themeStyle.border }} onClick={() => { goToVP(hl.page_number); setShowHighlightPanel(false) }}><div className="flex items-center justify-between mb-1.5"><span className="text-[10px] font-medium px-1.5 py-0.5 rounded" style={{ backgroundColor: HIGHLIGHT_COLORS[hl.color], color: themeStyle.text }}>p.{hl.page_number}</span><button onClick={e => { e.stopPropagation(); delHL(hl.id) }} className="p-1 rounded hover:bg-red-500/10" style={{ color: '#ef4444' }}><Trash2 className="w-3 h-3" /></button></div><p className="text-xs leading-relaxed" style={{ color: themeStyle.text }}>{hl.selected_text.length > 80 ? hl.selected_text.slice(0, 80) + '...' : hl.selected_text}</p>{hl.memo && <p className="text-[10px] mt-1.5" style={{ color: themeStyle.muted }}>💬 {hl.memo.slice(0, 50)}</p>}</div>)) : (<div className="px-4 py-12 text-center"><Highlighter className="w-8 h-8 mx-auto mb-3" style={{ color: themeStyle.border }} /><p className="text-sm mb-1" style={{ color: themeStyle.muted }}>형광펜이 없습니다</p><p className="text-xs" style={{ color: themeStyle.muted }}>텍스트를 길게 선택하면<br/>형광펜을 추가할 수 있어요</p></div>)}</div></div></div>)}

      {/* 북마크 패널 */}
      {showBookmarkPanel && (<div className="fixed inset-0 z-[60] flex justify-end"><div className="absolute inset-0 bg-black/40" onClick={() => setShowBookmarkPanel(false)} /><div className="relative w-80 max-w-[85vw] h-full flex flex-col shadow-2xl" style={{ backgroundColor: themeStyle.bg }}><div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: themeStyle.border }}><h3 className="font-semibold text-sm" style={{ color: themeStyle.headingColor }}>책갈피 ({bookmarks.length})</h3><button onClick={() => setShowBookmarkPanel(false)} className="p-1 rounded hover:opacity-70" style={{ color: themeStyle.muted }}>✕</button></div><div className="flex-1 overflow-y-auto">{bookmarks.length > 0 ? [...bookmarks].sort((a, b) => a.virtual_page - b.virtual_page).map(bm => (<div key={bm.id} className="px-4 py-3 border-b cursor-pointer hover:opacity-80" style={{ borderColor: themeStyle.border }} onClick={() => { setCurrentChapterIdx(bm.chapter_idx); setPageInChapter(bm.page_in_chapter); setShowBookmarkPanel(false) }}><div className="flex items-center justify-between"><div><span className="text-[10px] font-medium px-1.5 py-0.5 rounded mr-2" style={{ backgroundColor: `${ACCENT}22`, color: ACCENT }}>p.{bm.virtual_page}</span><span className="text-xs" style={{ color: themeStyle.text }}>{bm.title}</span></div><button onClick={e => { e.stopPropagation(); delBM(bm.id) }} className="p-1 rounded hover:bg-red-500/10" style={{ color: '#ef4444' }}><Trash2 className="w-3 h-3" /></button></div></div>)) : (<div className="px-4 py-12 text-center"><Bookmark className="w-8 h-8 mx-auto mb-3" style={{ color: themeStyle.border }} /><p className="text-sm mb-1" style={{ color: themeStyle.muted }}>책갈피가 없습니다</p><p className="text-xs" style={{ color: themeStyle.muted }}>상단 바에서 🔖 버튼으로<br/>현재 페이지를 저장하세요</p></div>)}</div></div></div>)}

      {/* 상단 바 */}
      <div className="flex justify-center border-b flex-shrink-0" style={{ borderColor: themeStyle.border }}>
      <div className="grid grid-cols-7 gap-2 px-3 py-3 w-full" style={{ maxWidth: 480 }}>
        <button onClick={e => { e.stopPropagation(); setShowToc(!showToc) }} className="flex flex-col items-center justify-center py-2 rounded-lg hover:opacity-70" style={{ color: showToc ? ACCENT : themeStyle.muted }}><List className="w-4 h-4" /><span className="text-[9px] mt-1">목차</span></button>
        <button onClick={e => { e.stopPropagation(); setShowSearch(!showSearch) }} className="flex flex-col items-center justify-center py-2 rounded-lg hover:opacity-70" style={{ color: showSearch ? ACCENT : themeStyle.muted }}><Search className="w-4 h-4" /><span className="text-[9px] mt-1">검색</span></button>
        <button onClick={e => { e.stopPropagation(); setFocusMode(!focusMode) }} className="flex flex-col items-center justify-center py-2 rounded-lg" style={{ color: focusMode ? ACCENT : themeStyle.muted, backgroundColor: focusMode ? `${ACCENT}15` : 'transparent' }}><Focus className="w-4 h-4" /><span className="text-[9px] mt-1">집중</span></button>
        <div className="flex items-center justify-center"><span className="text-[10px] font-medium" style={{ color: themeStyle.muted }}>{virtualPageNumber}/{virtualTotalPages}</span></div>
        <button onClick={e => { e.stopPropagation(); setShowHighlightPanel(!showHighlightPanel) }} className="flex flex-col items-center justify-center py-2 rounded-lg" style={{ color: showHighlightPanel ? ACCENT : highlights.length > 0 ? ACCENT : themeStyle.muted }}><Highlighter className="w-4 h-4" /><span className="text-[9px] mt-1">형광펜</span></button>
        <button onClick={e => { e.stopPropagation(); toggleBM() }} onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setShowBookmarkPanel(!showBookmarkPanel) }} className="flex flex-col items-center justify-center py-2 rounded-lg hover:opacity-70" style={{ color: isCurrentPageBookmarked ? ACCENT : themeStyle.muted }}>{isCurrentPageBookmarked ? <BookmarkCheck className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}<span className="text-[9px] mt-1">책갈피</span></button>
        <button onClick={e => { e.stopPropagation(); setShowSettings(!showSettings) }} className="flex flex-col items-center justify-center py-2 rounded-lg hover:opacity-70" style={{ color: showSettings ? ACCENT : themeStyle.muted }}><Settings2 className="w-4 h-4" /><span className="text-[9px] mt-1">설정</span></button>
      </div>
      </div>

      {/* 검색 패널 — 상단 바 아래 인라인 */}
      {showSearch && (<div className="border-b flex-shrink-0" style={{ borderColor: themeStyle.border, backgroundColor: themeStyle.bg }}><div className="mx-auto w-full px-4 py-2" style={{ maxWidth: 520 }}><div className="flex items-center gap-2 px-3 py-2 rounded-xl border" style={{ borderColor: themeStyle.border, backgroundColor: themeStyle.pageBg }}><Search className="w-4 h-4 flex-shrink-0" style={{ color: themeStyle.muted }} /><input ref={searchInputRef} type="text" value={searchQuery} onChange={e => { setSearchQuery(e.target.value); doSearch(e.target.value) }} onKeyDown={e => { if (e.key === 'Escape') setShowSearch(false) }} placeholder="본문 검색..." className="flex-1 bg-transparent outline-none text-sm" style={{ color: themeStyle.text }} />{searchQuery && <span className="text-[10px] flex-shrink-0" style={{ color: themeStyle.muted }}>{searchResults.length}건</span>}<button onClick={() => { setShowSearch(false); setSearchQuery(''); setSearchResults([]) }} className="p-1 rounded hover:opacity-70 flex-shrink-0" style={{ color: themeStyle.muted }}><X className="w-3.5 h-3.5" /></button></div>{searchResults.length > 0 && (<div className="mt-2 rounded-xl border overflow-y-auto" style={{ borderColor: themeStyle.border, maxHeight: '40vh' }}>{searchResults.map((r, i) => (<button key={i} className="w-full text-left px-3 py-2.5 border-b hover:opacity-80" style={{ borderColor: themeStyle.border }} onClick={() => { goToChapter(r.chapterIdx); setShowSearch(false) }}><span className="text-[10px] font-medium block mb-0.5" style={{ color: ACCENT }}>{r.chapterTitle}</span><p className="text-xs leading-relaxed" style={{ color: themeStyle.text }} dangerouslySetInnerHTML={{ __html: r.snippet.replace(new RegExp(`(${searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'), `<span style="background:${ACCENT}44;border-radius:2px;padding:0 2px">$1</span>`) }} /></button>))}</div>)}{searchQuery && searchResults.length === 0 && <p className="text-center text-xs py-3" style={{ color: themeStyle.muted }}>검색 결과가 없습니다</p>}</div></div>)}

      {/* 설정 바텀시트 */}
      {showSettings && (<><div className="fixed inset-0 z-[55]" onClick={() => setShowSettings(false)} /><div className="fixed bottom-0 left-1/2 -translate-x-1/2 z-[56] rounded-t-2xl shadow-2xl max-h-[70vh] overflow-y-auto w-full max-w-lg" style={{ backgroundColor: theme === 'dark' ? 'rgba(36,30,24,0.85)' : theme === 'sepia' ? 'rgba(248,241,227,0.85)' : 'rgba(255,255,255,0.85)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', borderTop: `1px solid ${themeStyle.border}` }}><div className="flex justify-center pt-3 pb-1"><div className="w-10 h-1 rounded-full" style={{ backgroundColor: themeStyle.border }} /></div><div className="px-5 pb-6 space-y-5">
        <div><p className="text-xs font-medium mb-3" style={{ color: themeStyle.muted }}>배경 테마</p><div className="flex gap-3 justify-center">{(Object.keys(THEMES) as ReflowTheme[]).map(t => (<button key={t} onClick={() => setTheme(t)} className="flex flex-col items-center gap-1.5"><div className={`w-12 h-12 rounded-xl border-2 ${theme === t ? 'ring-2 ring-amber-500 ring-offset-2' : ''}`} style={{ backgroundColor: THEMES[t].bg, borderColor: THEMES[t].border }} /><span className="text-[10px]" style={{ color: theme === t ? ACCENT : themeStyle.muted }}>{t === 'light' ? '밝은' : t === 'sepia' ? '세피아' : '어두운'}</span></button>))}</div></div>
        <div><p className="text-xs font-medium mb-3" style={{ color: themeStyle.muted }}>글꼴</p><div className="flex gap-2">{(Object.keys(FONTS) as ReflowFont[]).map(f => (<button key={f} onClick={() => setFont(f)} className={`flex-1 py-2 rounded-xl text-sm border ${font === f ? 'border-amber-500' : ''}`} style={{ backgroundColor: font === f ? `${ACCENT}15` : 'transparent', borderColor: font === f ? ACCENT : themeStyle.border, color: font === f ? ACCENT : themeStyle.text, fontFamily: FONTS[f].family }}>{FONTS[f].label}</button>))}</div></div>
        <div><div className="flex items-center justify-between mb-3"><p className="text-xs font-medium" style={{ color: themeStyle.muted }}>글자 크기</p><span className="text-xs font-mono" style={{ color: themeStyle.text }}>{fontSize}px</span></div><div className="flex items-center gap-3"><button onClick={() => setFontSize(s => Math.max(12, s - 1))} className="w-9 h-9 rounded-xl flex items-center justify-center border" style={{ borderColor: themeStyle.border, color: themeStyle.muted }}><Minus className="w-4 h-4" /></button><input type="range" min={12} max={32} value={fontSize} onChange={e => setFontSize(Number(e.target.value))} className="flex-1 h-1.5 rounded-full appearance-none cursor-pointer accent-amber-500" style={{ backgroundColor: themeStyle.border }} /><button onClick={() => setFontSize(s => Math.min(32, s + 1))} className="w-9 h-9 rounded-xl flex items-center justify-center border" style={{ borderColor: themeStyle.border, color: themeStyle.muted }}><Plus className="w-4 h-4" /></button></div></div>
        <div><div className="flex items-center justify-between mb-2"><p className="text-xs font-medium" style={{ color: themeStyle.muted }}>줄간격</p><span className="text-xs font-mono" style={{ color: themeStyle.text }}>{lineHeight.toFixed(1)}</span></div><div className="flex items-center gap-3"><button onClick={() => setLineHeight(h => Math.max(1.2, Math.round((h - 0.1) * 10) / 10))} className="w-9 h-9 rounded-xl flex items-center justify-center border" style={{ borderColor: themeStyle.border, color: themeStyle.muted }}><Minus className="w-4 h-4" /></button><input type="range" min={1.2} max={2.4} step={0.1} value={lineHeight} onChange={e => setLineHeight(Number(e.target.value))} className="flex-1 h-1.5 rounded-full appearance-none cursor-pointer accent-amber-500" style={{ backgroundColor: themeStyle.border }} /><button onClick={() => setLineHeight(h => Math.min(2.4, Math.round((h + 0.1) * 10) / 10))} className="w-9 h-9 rounded-xl flex items-center justify-center border" style={{ borderColor: themeStyle.border, color: themeStyle.muted }}><Plus className="w-4 h-4" /></button></div></div>
        <div className="grid grid-cols-2 gap-4"><div><div className="flex items-center justify-between mb-2"><p className="text-[10px] font-medium" style={{ color: themeStyle.muted }}>여백</p><span className="text-[10px] font-mono" style={{ color: themeStyle.text }}>{marginSize}px</span></div><input type="range" min={8} max={80} step={4} value={marginSize} onChange={e => setMarginSize(Number(e.target.value))} className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-amber-500" style={{ backgroundColor: themeStyle.border }} /></div><div><div className="flex items-center justify-between mb-2"><p className="text-[10px] font-medium" style={{ color: themeStyle.muted }}>자간</p><span className="text-[10px] font-mono" style={{ color: themeStyle.text }}>{(letterSpacing * 0.5).toFixed(1)}px</span></div><input type="range" min={-2} max={4} step={0.5} value={letterSpacing} onChange={e => setLetterSpacing(Number(e.target.value))} className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-amber-500" style={{ backgroundColor: themeStyle.border }} /></div></div>
        <div><p className="text-xs font-medium mb-3" style={{ color: themeStyle.muted }}>정렬</p><div className="flex gap-2">{(['left', 'justify'] as ReflowAlign[]).map(a => (<button key={a} onClick={() => setTextAlign(a)} className={`flex-1 py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 border ${textAlign === a ? 'border-amber-500' : ''}`} style={{ backgroundColor: textAlign === a ? `${ACCENT}15` : 'transparent', borderColor: textAlign === a ? ACCENT : themeStyle.border, color: textAlign === a ? ACCENT : themeStyle.text }}>{a === 'left' ? <><AlignLeft className="w-4 h-4" /> 왼쪽</> : <><AlignJustify className="w-4 h-4" /> 양쪽</>}</button>))}</div></div>
        <button onClick={() => { setShowSettings(false); setShowBookmarkPanel(true) }} className="w-full py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 border" style={{ borderColor: themeStyle.border, color: themeStyle.text }}><Bookmark className="w-4 h-4" /> 책갈피 목록 ({bookmarks.length})</button>
      </div></div></>)}

      {/* 페이지네이션 본문 */}
      <div className={`flex-1 min-h-0 relative ${focusMode ? 'epub-focus-active' : ''}`} style={{ backgroundColor: themeStyle.bg, userSelect: isPaywalled ? 'none' : 'text', WebkitUserSelect: (isPaywalled ? 'none' : 'text') as any, overflow: 'clip', filter: isPaywalled ? 'blur(4px)' : 'none', transition: 'filter 0.3s' }} onTouchStart={onTS} onTouchMove={onTM} onTouchEnd={onTE} onMouseDown={onMD} onClick={onClick} onMouseUp={onSelEnd}>
        <div style={{ maxWidth: MAX_WIDTH, margin: '0 auto', padding: `2rem ${marginSize}px`, height: '100%' }}>
          <div ref={paginationContainerRef} className="relative" style={{ height: '100%', overflow: 'clip' }}>
            {currentChapterData ? <div ref={contentColumnRef} style={{ columnWidth: columnWidthPx > 0 ? `${columnWidthPx - 40}px` : '100vw', columnGap: '40px', columnFill: 'auto', height: '100%' }} /> : <p className="text-center py-8" style={{ color: themeStyle.muted }}>(표시할 내용 없음)</p>}
          </div>
        </div>
      </div>

      {/* 하이라이트 팝업 */}
      {showHighlightMenu && pendingSelection && !isPaywalled && (<div className="fixed z-[70] flex items-center gap-1 px-2 py-1.5 rounded-xl shadow-lg border" style={{ left: Math.min(highlightMenuPos.x - 60, (typeof window !== 'undefined' ? window.innerWidth : 400) - 140), top: Math.min(highlightMenuPos.y, (typeof window !== 'undefined' ? window.innerHeight : 800) - 50), backgroundColor: themeStyle.bg, borderColor: themeStyle.border }}>{Object.entries(HIGHLIGHT_COLORS).map(([c, bg]) => (<button key={c} onClick={() => saveHL(c)} className="w-7 h-7 rounded-full border-2 hover:scale-110 transition-transform" style={{ backgroundColor: bg, borderColor: c === 'yellow' ? '#fbbf24' : c === 'green' ? '#86efac' : c === 'blue' ? '#93c5fd' : '#f9a8d4' }} />))}<button onClick={() => { setShowHighlightMenu(false); setPendingSelection(null); window.getSelection()?.removeAllRanges() }} className="w-7 h-7 rounded-full flex items-center justify-center" style={{ color: themeStyle.muted }}><X className="w-3.5 h-3.5" /></button></div>)}

      {/* 메모 툴팁 */}
      {memoTooltip && (<div className="fixed z-[80] pointer-events-none" style={{ left: Math.max(8, Math.min(memoTooltip.x, (typeof window !== 'undefined' ? window.innerWidth : 400) - 260)), top: Math.max(8, memoTooltip.y - 8), transform: 'translateY(-100%)' }}><div style={{ maxWidth: 250, padding: '8px 12px', borderRadius: 10, fontSize: Math.round(fontSize * 0.75), lineHeight: 1.5, color: themeStyle.text, background: theme === 'dark' ? '#2E2620' : theme === 'sepia' ? '#e8dcc8' : '#f5f0eb', border: `1px solid ${themeStyle.border}`, boxShadow: '0 4px 16px rgba(0,0,0,0.25)', wordBreak: 'keep-all', whiteSpace: 'pre-wrap' }}><span style={{ opacity: 0.5, marginRight: 4 }}>✎</span>{memoTooltip.text}</div></div>)}

      {/* 메모 모달 */}
      {showMemoModal && editingHighlight && (<div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} onClick={() => { setShowMemoModal(false); setEditingHighlight(null) }}><div className="w-full max-w-sm rounded-2xl p-5 shadow-xl" style={{ backgroundColor: themeStyle.bg }} onClick={e => e.stopPropagation()}><div className="flex items-center justify-between mb-3"><span className="text-sm font-medium" style={{ color: themeStyle.text }}>메모</span><div className="flex items-center gap-2"><button onClick={() => delHL(editingHighlight.id)} className="p-1.5 rounded-lg hover:bg-red-500/10" style={{ color: '#ef4444' }}><Trash2 className="w-4 h-4" /></button><button onClick={() => { setShowMemoModal(false); setEditingHighlight(null) }} className="p-1.5 rounded-lg" style={{ color: themeStyle.muted }}><X className="w-4 h-4" /></button></div></div><p className="text-xs mb-3 px-2 py-1.5 rounded-lg" style={{ backgroundColor: HIGHLIGHT_COLORS[editingHighlight.color], color: themeStyle.text }}>&ldquo;{editingHighlight.selected_text.slice(0, 100)}{editingHighlight.selected_text.length > 100 ? '...' : ''}&rdquo;</p><textarea value={memoText} onChange={e => setMemoText(e.target.value)} placeholder="메모를 입력하세요..." className="w-full rounded-xl border px-3 py-2 text-sm resize-none" rows={3} style={{ backgroundColor: themeStyle.bg, color: themeStyle.text, borderColor: themeStyle.border }} autoFocus /><button onClick={saveMemo} className="w-full mt-3 py-2 rounded-xl text-sm font-medium text-white" style={{ backgroundColor: ACCENT }}>저장</button></div></div>)}

      {/* 하단 프로그레스 바 */}
      {internalChapters.length > 0 && (<div className="border-t flex-shrink-0 w-full" style={{ borderColor: themeStyle.border, backgroundColor: themeStyle.bg }}>
        <div className="px-5 py-2.5 mx-auto" style={{ maxWidth: 480 }}><div className="flex items-center gap-3"><button onClick={e => { e.stopPropagation(); goPrev() }} disabled={isFirst} className="p-1 rounded disabled:opacity-30" style={{ color: themeStyle.muted }}><ChevronLeft className="w-4 h-4" /></button><div className="flex-1 relative" onClick={e => { e.stopPropagation(); const rect = (e.currentTarget as HTMLElement).getBoundingClientRect(); goToVP(Math.max(1, Math.round(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * virtualTotalPages))) }}><div className="h-1.5 rounded-full cursor-pointer" style={{ backgroundColor: themeStyle.border }}><div className="h-full rounded-full transition-all duration-200" style={{ width: `${virtualTotalPages > 1 ? ((virtualPageNumber - 1) / (virtualTotalPages - 1)) * 100 : 0}%`, backgroundColor: ACCENT }} /></div><input type="range" min={1} max={virtualTotalPages} value={virtualPageNumber} onChange={e => { e.stopPropagation(); goToVP(Number(e.target.value)) }} onClick={e => e.stopPropagation()} className="absolute inset-0 w-full opacity-0 cursor-pointer" style={{ height: '24px', top: '-6px' }} /></div><button onClick={e => { e.stopPropagation(); goNext() }} disabled={isLast} className="p-1 rounded disabled:opacity-30" style={{ color: themeStyle.muted }}><ChevronRight className="w-4 h-4" /></button></div><div className="flex justify-between mt-1"><span className="text-[10px]" style={{ color: themeStyle.muted }}>{currentChapterIdx + 1}/{internalChapters.length} 챕터</span><span className="text-[10px]" style={{ color: themeStyle.muted }}>{(() => { const pct = virtualTotalPages > 1 ? Math.round(((virtualPageNumber - 1) / (virtualTotalPages - 1)) * 100) : 0; if (virtualTotalPages <= 1 || virtualPageNumber <= 1 || elapsedSec < 10) return `${pct}%`; const pr = virtualPageNumber - 1; const spp = elapsedSec / pr; const pl = virtualTotalPages - virtualPageNumber; const sl = Math.round(spp * pl); if (sl < 60) return `${pct}% · 1분 미만`; const ml = Math.round(sl / 60); if (ml < 60) return `${pct}% · 약 ${ml}분 남음`; const h = Math.floor(ml / 60); const m = ml % 60; return m === 0 ? `${pct}% · 약 ${h}시간 남음` : `${pct}% · 약 ${h}시간 ${m}분 남음` })()}</span></div></div>
      </div>)}
    </div>
  )
}
