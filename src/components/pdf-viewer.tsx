// components/pdf-viewer.tsx
// TeXTREME PDF 뷰어 v3
// 8버튼 메뉴 (나가기, 여백, 🔒책갈피, 페이지, 🔒테마, 🔒형광펜, 🔒집중, 🔒설정)
// 롱프레스 돋보기 항상 작동 (버튼 없이)
// EPUB 잠금 모달 + 변환 유도

'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Document as PDFDocument, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'
import { Home, Minus, Plus, Crop, Bookmark, Palette, Highlighter, Focus, Settings2, Zap, Lock, X } from 'lucide-react'

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`

const pdfOptions = {
  cMapUrl: `//unpkg.com/pdfjs-dist@${pdfjs.version}/cmaps/`,
  cMapPacked: true,
  standardFontDataUrl: `//unpkg.com/pdfjs-dist@${pdfjs.version}/standard_fonts/`,
}

interface PDFViewerProps {
  pdfUrl: string
  fileName: string
  onBack: () => void
  onConvert?: () => void
}

export default function PDFViewer({ pdfUrl, fileName, onBack, onConvert }: PDFViewerProps) {
  const [numPages, setNumPages] = useState(0)
  const [pageNumber, setPageNumber] = useState(1)
  const [scale, setScale] = useState(1)
  const [pdfLoading, setPdfLoading] = useState(true)
  const [fitWidth, setFitWidth] = useState(0)
  const [pageAspect, setPageAspect] = useState(1.414)
  const [autoCropOn, setAutoCropOn] = useState(false)
  const [cropBounds, setCropBounds] = useState<{ top: number; left: number; bottom: number; right: number } | null>(null)
  const [cropDetecting, setCropDetecting] = useState(false)
  const [pdfDoc, setPdfDoc] = useState<any>(null)
  const [swipeOffset, setSwipeOffset] = useState(0)
  const [showLockModal, setShowLockModal] = useState(false)
  const [lockFeatureName, setLockFeatureName] = useState('')

  // 롱프레스 돋보기 (항상 작동)
  const MAGNIFIER_ZOOM = 2.5
  const magnifierElRef = useRef<HTMLDivElement>(null)
  const magnifierActiveRef = useRef(false)
  const magnifierWasActiveRef = useRef(false)
  const magnifierCanvasRef = useRef<{ imgSrc: string; rect: DOMRect; displayW: number; displayH: number } | null>(null)
  const magnifierSizeRef = useRef({ w: 300, h: 250 })
  const LONG_PRESS_MS = 500
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressPosRef = useRef<{ x: number; y: number } | null>(null)

  const containerRef = useRef<HTMLDivElement>(null)
  const contentAreaRef = useRef<HTMLDivElement>(null)
  const pdfContentRef = useRef<HTMLDivElement>(null)
  const touchOverlayRef = useRef<HTMLDivElement>(null)

  const touchStartRef = useRef<{ x: number; y: number } | null>(null)
  const touchEndRef = useRef<{ x: number; y: number } | null>(null)
  const pinchStartDistRef = useRef<number | null>(null)
  const pinchStartScaleRef = useRef(1)
  const isPinchingRef = useRef(false)
  const pinchRatioRef = useRef(1)
  const isPanningRef = useRef(false)
  const panStartRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null)
  const panTranslateRef = useRef({ x: 0, y: 0 })
  const mouseDragRef = useRef(false)

  const scaleRef = useRef(scale)
  const pageNumberRef = useRef(pageNumber)
  const numPagesRef = useRef(numPages)

  useEffect(() => { scaleRef.current = scale }, [scale])
  useEffect(() => { pageNumberRef.current = pageNumber }, [pageNumber])
  useEffect(() => { numPagesRef.current = numPages }, [numPages])

  const openLockModal = (featureName: string) => {
    setLockFeatureName(featureName)
    setShowLockModal(true)
  }

  // ━━━ 줌 리셋 ━━━
  useEffect(() => {
    if (scale <= 1.05) {
      panTranslateRef.current = { x: 0, y: 0 }
      if (pdfContentRef.current) pdfContentRef.current.style.transform = ''
    }
  }, [scale])

  useEffect(() => {
    panTranslateRef.current = { x: 0, y: 0 }
    if (pdfContentRef.current) pdfContentRef.current.style.transform = ''
  }, [pageNumber])

  // ━━━ fitWidth 계산 ━━━
  const calculateFitWidth = useCallback(() => {
    const sw = window.innerWidth
    const sh = (contentAreaRef.current?.clientHeight) || (window.innerHeight - 100)
    const effectiveAspect = (autoCropOn && cropBounds)
      ? pageAspect * ((cropBounds.bottom - cropBounds.top) / (cropBounds.right - cropBounds.left))
      : pageAspect
    const cw = sw - 16
    const ch = sh - 16
    const fromH = ch / effectiveAspect
    const optimal = Math.min(cw, fromH)
    setFitWidth(Math.max(optimal, 200))
  }, [pageAspect, autoCropOn, cropBounds])

  useEffect(() => {
    calculateFitWidth()
    window.addEventListener('resize', calculateFitWidth)
    return () => window.removeEventListener('resize', calculateFitWidth)
  }, [calculateFitWidth])

  const goToPage = useCallback((p: number) => {
    setPageNumber(Math.max(1, Math.min(p, numPagesRef.current)))
  }, [])

  const zoomIn = () => setScale(s => Math.min(s + 0.25, 3))
  const zoomOut = () => setScale(s => Math.max(s - 0.25, 0.5))

  // ━━━ PDF 로드 ━━━
  const onDocumentLoadSuccess = async (pdfProxy: any) => {
    setNumPages(pdfProxy.numPages)
    setPdfLoading(false)
    setPdfDoc(pdfProxy)
    try {
      const page = await pdfProxy.getPage(1)
      const vp = page.getViewport({ scale: 1 })
      setPageAspect(vp.height / vp.width)
    } catch {}
  }

  // ━━━ 자동 여백 감지 ━━━
  const detectCropBounds = useCallback(async () => {
    if (!pdfDoc || numPages === 0 || cropDetecting) return
    setCropDetecting(true)
    try {
      const sampleCount = Math.min(20, numPages)
      const sampleNums: number[] = []
      for (let i = 0; i < sampleCount; i++) {
        sampleNums.push(Math.max(1, Math.round((i / (sampleCount - 1 || 1)) * (numPages - 1)) + 1))
      }
      const unique = [...new Set(sampleNums)].filter(n => n >= 1 && n <= numPages)

      const allLefts: number[] = []
      const allTops: number[] = []
      const allRights: number[] = []
      const allBottoms: number[] = []

      for (const pn of unique) {
        try {
          const pg = await pdfDoc.getPage(pn)
          const vp = pg.getViewport({ scale: 0.25 })
          const canvas = window.document.createElement('canvas')
          canvas.width = vp.width
          canvas.height = vp.height
          const ctx = canvas.getContext('2d')!
          await pg.render({ canvasContext: ctx, viewport: vp } as any).promise

          const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height)
          const { data, width, height } = imgData
          const threshold = 245
          let top = height, left = width, bottom = 0, right = 0

          const rowHasContent: boolean[] = []
          for (let y = 0; y < height; y++) {
            let found = false
            for (let x = 0; x < width; x++) {
              const i = (y * width + x) * 4
              if (data[i] < threshold || data[i + 1] < threshold || data[i + 2] < threshold) {
                found = true; break
              }
            }
            rowHasContent.push(found)
          }

          let rawTop = 0, rawBottom = height - 1
          for (let y = 0; y < height; y++) { if (rowHasContent[y]) { rawTop = y; break } }
          for (let y = height - 1; y >= 0; y--) { if (rowHasContent[y]) { rawBottom = y; break } }

          const gapMin = Math.floor(height * 0.03)
          bottom = rawBottom
          for (let y = rawBottom; y >= rawTop; y--) {
            if (!rowHasContent[y]) {
              let gapSize = 0
              let gy = y
              while (gy >= rawTop && !rowHasContent[gy]) { gapSize++; gy-- }
              if (gapSize >= gapMin) { bottom = gy; break }
              y = gy
            }
          }
          top = rawTop
          for (let y = rawTop; y <= bottom; y++) {
            if (!rowHasContent[y]) {
              let gapSize = 0
              let gy = y
              while (gy <= bottom && !rowHasContent[gy]) { gapSize++; gy++ }
              if (gapSize >= gapMin) { top = gy; break }
              y = gy
            } else { top = y; break }
          }

          const yStart = Math.floor(height * 0.10)
          const yEnd = Math.floor(height * 0.80)
          for (let y = yStart; y < yEnd; y++) {
            for (let x = 0; x < width; x++) {
              const i = (y * width + x) * 4
              if (data[i] < threshold || data[i + 1] < threshold || data[i + 2] < threshold) {
                if (x < left) left = x
                if (x > right) right = x
              }
            }
          }

          if (bottom > top && right > left) {
            allLefts.push(left / width)
            allTops.push(top / height)
            allRights.push(right / width)
            allBottoms.push(bottom / height)
          }
        } catch {}
      }

      if (allLefts.length > 0) {
        const median = (arr: number[]) => {
          const sorted = [...arr].sort((a, b) => a - b)
          const mid = Math.floor(sorted.length / 2)
          return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
        }
        const bounds = {
          top: Math.max(0, median(allTops) - 0.015),
          left: Math.max(0, median(allLefts) - 0.05),
          bottom: Math.min(1, median(allBottoms) + 0.035),
          right: Math.min(1, median(allRights) + 0.03),
        }
        const cw = bounds.right - bounds.left
        const ch = bounds.bottom - bounds.top
        if (cw < 0.92 || ch < 0.92) {
          setCropBounds(bounds)
        } else {
          setCropBounds(null)
        }
      }
    } catch (err) {
      console.error('Crop detection error:', err)
    } finally {
      setCropDetecting(false)
    }
  }, [pdfDoc, numPages, cropDetecting])

  useEffect(() => {
    if (autoCropOn && !cropBounds && !cropDetecting && numPages > 0 && pdfDoc) {
      detectCropBounds()
    }
    if (!autoCropOn) setCropBounds(null)
  }, [autoCropOn, numPages, pdfDoc])

  // ━━━ 돋보기 헬퍼 (롱프레스용, 항상 작동) ━━━
  const clearLongPressTimer = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
    longPressPosRef.current = null
  }

  const startMagnifier = (clientX: number, clientY: number): boolean => {
    const el = magnifierElRef.current
    const container = containerRef.current
    if (!el || !container) return false
    const canvases = container.querySelectorAll('canvas')
    let targetCanvas: HTMLCanvasElement | null = null
    let targetRect: DOMRect | null = null
    for (const c of canvases) {
      const rect = c.getBoundingClientRect()
      if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
        targetCanvas = c as HTMLCanvasElement
        targetRect = rect
        break
      }
    }
    if (!targetCanvas || !targetRect) return false
    try {
      const imgSrc = targetCanvas.toDataURL()
      const magW = 280
      const magH = 280
      magnifierSizeRef.current = { w: magW, h: magH }
      magnifierCanvasRef.current = { imgSrc, rect: targetRect, displayW: targetRect.width, displayH: targetRect.height }
      magnifierActiveRef.current = true
      el.style.width = `${magW}px`
      el.style.height = `${magH}px`
      el.style.backgroundImage = `url(${imgSrc})`
      el.style.backgroundSize = `${targetRect.width * MAGNIFIER_ZOOM}px ${targetRect.height * MAGNIFIER_ZOOM}px`
      updateMagnifier(clientX, clientY)
      el.style.display = 'block'
      return true
    } catch { return false }
  }

  const updateMagnifier = (clientX: number, clientY: number) => {
    const el = magnifierElRef.current
    const data = magnifierCanvasRef.current
    if (!el || !data) return
    const { w: magW, h: magH } = magnifierSizeRef.current
    const magX = Math.max(4, Math.min(clientX - magW / 2, window.innerWidth - magW - 4))
    const magY = Math.max(4, clientY - magH - 20)
    el.style.left = `${magX}px`
    el.style.top = `${magY}px`
    const magCenterX = magX + magW / 2
    const magCenterY = magY + magH / 2
    const relX = (magCenterX - data.rect.left) / data.displayW
    const relY = (magCenterY - data.rect.top) / data.displayH
    const bgX = relX * data.displayW * MAGNIFIER_ZOOM - magW / 2
    const bgY = relY * data.displayH * MAGNIFIER_ZOOM - magH / 2
    el.style.backgroundPosition = `-${bgX}px -${bgY}px`
  }

  const hideMagnifier = () => {
    const el = magnifierElRef.current
    if (el) { el.style.display = 'none'; el.style.backgroundImage = '' }
    magnifierCanvasRef.current = null
    if (magnifierActiveRef.current) {
      magnifierActiveRef.current = false
      magnifierWasActiveRef.current = true
      setTimeout(() => { magnifierWasActiveRef.current = false }, 200)
    }
  }

  // ━━━ 핀치/팬 헬퍼 ━━━
  const getTouchDistance = (touches: TouchList) => {
    if (touches.length < 2) return 0
    const dx = touches[0].clientX - touches[1].clientX
    const dy = touches[0].clientY - touches[1].clientY
    return Math.sqrt(dx * dx + dy * dy)
  }

  const applyPinchTransform = (ratio: number) => {
    if (pdfContentRef.current) {
      pdfContentRef.current.style.transform = `scale(${ratio})`
      pdfContentRef.current.style.transformOrigin = 'center center'
      pdfContentRef.current.style.transition = 'none'
    }
  }

  const clearPinchTransform = () => {
    if (pdfContentRef.current) {
      pdfContentRef.current.style.transform = ''
      pdfContentRef.current.style.transformOrigin = ''
      pdfContentRef.current.style.transition = ''
    }
  }

  const applyPanTransform = (x: number, y: number) => {
    if (pdfContentRef.current) {
      pdfContentRef.current.style.transform = `translate(${x}px, ${y}px)`
      pdfContentRef.current.style.transition = 'none'
    }
  }

  // ━━━ 터치 이벤트 (스와이프 + 핀치줌 + 팬 + 롱프레스 돋보기) ━━━
  useEffect(() => {
    const overlay = touchOverlayRef.current
    if (!overlay) return
    const minSwipeDistance = 50

    const handleTouchStart = (e: TouchEvent) => {
      clearLongPressTimer()
      hideMagnifier()

      if (e.touches.length === 2) {
        e.preventDefault()
        isPanningRef.current = false
        panStartRef.current = null
        pinchStartDistRef.current = getTouchDistance(e.touches)
        pinchStartScaleRef.current = scaleRef.current
        isPinchingRef.current = true
        pinchRatioRef.current = 1
        return
      }
      if (scaleRef.current > 1.05) {
        e.preventDefault()
        isPanningRef.current = true
        panStartRef.current = {
          x: e.touches[0].clientX, y: e.touches[0].clientY,
          tx: panTranslateRef.current.x, ty: panTranslateRef.current.y,
        }
        return
      }
      // 일반 터치: 스와이프 + 롱프레스 돋보기 동시 시작
      const tx = e.touches[0].clientX
      const ty = e.touches[0].clientY
      touchEndRef.current = null
      touchStartRef.current = { x: tx, y: ty }
      // 롱프레스 타이머 시작
      longPressPosRef.current = { x: tx, y: ty }
      longPressTimerRef.current = setTimeout(() => {
        if (longPressPosRef.current) startMagnifier(longPressPosRef.current.x, longPressPosRef.current.y)
      }, LONG_PRESS_MS)
    }

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault()
        clearLongPressTimer()
        if (!isPinchingRef.current) {
          pinchStartDistRef.current = getTouchDistance(e.touches)
          pinchStartScaleRef.current = scaleRef.current
          isPinchingRef.current = true
          pinchRatioRef.current = 1
          setSwipeOffset(0)
          touchStartRef.current = null
          return
        }
        if (pinchStartDistRef.current !== null) {
          pinchRatioRef.current = getTouchDistance(e.touches) / pinchStartDistRef.current
          applyPinchTransform(pinchRatioRef.current)
        }
        return
      }
      // 돋보기 활성 → 위치 업데이트
      if (magnifierActiveRef.current && e.touches.length === 1) {
        e.preventDefault()
        updateMagnifier(e.touches[0].clientX, e.touches[0].clientY)
        return
      }
      // 롱프레스 타이머: 움직이면 취소
      if (longPressPosRef.current && e.touches.length === 1) {
        const dx = e.touches[0].clientX - longPressPosRef.current.x
        const dy = e.touches[0].clientY - longPressPosRef.current.y
        if (Math.abs(dx) > 10 || Math.abs(dy) > 10) clearLongPressTimer()
      }
      if (isPanningRef.current && panStartRef.current) {
        e.preventDefault()
        const dx = e.touches[0].clientX - panStartRef.current.x
        const dy = e.touches[0].clientY - panStartRef.current.y
        panTranslateRef.current = { x: panStartRef.current.tx + dx, y: panStartRef.current.ty + dy }
        applyPanTransform(panTranslateRef.current.x, panTranslateRef.current.y)
        return
      }
      const ts = touchStartRef.current
      if (!ts) return
      setSwipeOffset((e.touches[0].clientX - ts.x) * 0.3)
      touchEndRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
    }

    const handleTouchEnd = () => {
      clearLongPressTimer()
      // 돋보기 활성이었으면 숨기고 종료
      if (magnifierActiveRef.current) {
        hideMagnifier()
        setSwipeOffset(0)
        touchStartRef.current = null
        touchEndRef.current = null
        return
      }
      if (isPinchingRef.current) {
        clearPinchTransform()
        setScale(Math.min(Math.max(pinchStartScaleRef.current * pinchRatioRef.current, 0.5), 3.0))
        pinchStartDistRef.current = null; isPinchingRef.current = false; pinchRatioRef.current = 1
        panTranslateRef.current = { x: 0, y: 0 }
        return
      }
      if (isPanningRef.current) { isPanningRef.current = false; panStartRef.current = null; return }
      const ts = touchStartRef.current
      const te = touchEndRef.current
      if (ts && te) {
        const distX = ts.x - te.x
        const distY = Math.abs(ts.y - te.y)
        if (Math.abs(distX) > minSwipeDistance && distY < Math.abs(distX)) {
          if (distX > 0) goToPage(pageNumberRef.current + 1)
          else goToPage(pageNumberRef.current - 1)
        }
      }
      setSwipeOffset(0); touchStartRef.current = null; touchEndRef.current = null
    }

    const preventContext = (e: Event) => e.preventDefault()
    overlay.addEventListener('contextmenu', preventContext)
    overlay.addEventListener('touchstart', handleTouchStart, { passive: false })
    overlay.addEventListener('touchmove', handleTouchMove, { passive: false })
    overlay.addEventListener('touchend', handleTouchEnd)
    return () => {
      overlay.removeEventListener('contextmenu', preventContext)
      overlay.removeEventListener('touchstart', handleTouchStart)
      overlay.removeEventListener('touchmove', handleTouchMove)
      overlay.removeEventListener('touchend', handleTouchEnd)
    }
  }, [goToPage])

  // ━━━ PC 마우스 이벤트 (확대 팬 + 롱프레스 돋보기) ━━━
  useEffect(() => {
    const overlay = touchOverlayRef.current
    if (!overlay) return

    const handleWheel = (e: WheelEvent) => {
      if (scaleRef.current <= 1.05) return
      e.preventDefault()
      panTranslateRef.current = {
        x: panTranslateRef.current.x - e.deltaX * 1.5,
        y: panTranslateRef.current.y - e.deltaY * 1.5,
      }
      applyPanTransform(panTranslateRef.current.x, panTranslateRef.current.y)
    }

    const handleMouseDown = (e: MouseEvent) => {
      clearLongPressTimer()
      hideMagnifier()
      if (scaleRef.current > 1.05 && e.button === 0) {
        e.preventDefault()
        mouseDragRef.current = true
        panStartRef.current = { x: e.clientX, y: e.clientY, tx: panTranslateRef.current.x, ty: panTranslateRef.current.y }
        overlay.style.cursor = 'grabbing'
        return
      }
      // 롱프레스 돋보기 타이머 (PC)
      if (e.button === 0) {
        longPressPosRef.current = { x: e.clientX, y: e.clientY }
        longPressTimerRef.current = setTimeout(() => {
          if (longPressPosRef.current) startMagnifier(longPressPosRef.current.x, longPressPosRef.current.y)
        }, LONG_PRESS_MS)
      }
    }

    const handleMouseMove = (e: MouseEvent) => {
      // 돋보기 활성 → 위치 업데이트
      if (magnifierActiveRef.current) { e.preventDefault(); updateMagnifier(e.clientX, e.clientY); return }
      // 롱프레스 타이머: 움직이면 취소
      if (longPressPosRef.current) {
        const dx = e.clientX - longPressPosRef.current.x
        const dy = e.clientY - longPressPosRef.current.y
        if (Math.abs(dx) > 5 || Math.abs(dy) > 5) clearLongPressTimer()
      }
      if (!mouseDragRef.current || !panStartRef.current) return
      e.preventDefault()
      panTranslateRef.current = { x: panStartRef.current.tx + (e.clientX - panStartRef.current.x), y: panStartRef.current.ty + (e.clientY - panStartRef.current.y) }
      applyPanTransform(panTranslateRef.current.x, panTranslateRef.current.y)
    }

    const handleMouseUp = () => {
      clearLongPressTimer()
      if (magnifierActiveRef.current) { hideMagnifier(); return }
      if (!mouseDragRef.current) return
      mouseDragRef.current = false; panStartRef.current = null
      if (overlay) overlay.style.cursor = ''
    }

    overlay.addEventListener('wheel', handleWheel, { passive: false })
    overlay.addEventListener('mousedown', handleMouseDown)
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      overlay.removeEventListener('wheel', handleWheel)
      overlay.removeEventListener('mousedown', handleMouseDown)
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [])

  // ━━━ 클릭 페이지 이동 ━━━
  const handlePageAreaClick = (e: React.MouseEvent) => {
    if (magnifierWasActiveRef.current) return
    if (scale > 1.05) return
    const el = pdfContentRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const ratio = (e.clientX - rect.left) / rect.width
    if (ratio < 0.3) goToPage(pageNumber - 1)
    else if (ratio > 0.7) goToPage(pageNumber + 1)
  }

  // ━━━ 렌더링 계산 ━━━
  const renderWidth = fitWidth * scale
  const pageHeight = renderWidth * pageAspect

  const isCropping = autoCropOn && cropBounds != null
  const cropContentW = cropBounds ? (cropBounds.right - cropBounds.left) : 1
  const cropContentH = cropBounds ? (cropBounds.bottom - cropBounds.top) : 1
  const cropPageWidth = isCropping ? renderWidth / cropContentW : renderWidth
  const cropPageH = cropPageWidth * pageAspect
  const cropVisibleW = renderWidth
  const cropVisibleH = isCropping ? cropPageH * cropContentH : pageHeight
  const cropOffX = isCropping ? -(cropBounds!.left * cropPageWidth) : 0
  const cropOffY = isCropping ? -(cropBounds!.top * cropPageH) : 0

  const frameStyle: React.CSSProperties = {
    boxShadow: '0 2px 16px rgba(0,0,0,0.5)',
    borderRadius: 4,
    overflow: 'hidden',
  }

  const ACCENT = '#F59E0B'

  const menuButtons = [
    { icon: <Home style={{ width: 16, height: 16, color: 'rgba(255,255,255,0.85)' }} />, label: '나가기', active: false, locked: false, onClick: onBack },
    { icon: <Crop style={{ width: 16, height: 16 }} />, label: '여백', active: autoCropOn, locked: false, onClick: () => setAutoCropOn(p => !p) },
    { icon: <Bookmark style={{ width: 16, height: 16 }} />, label: '책갈피', active: false, locked: true, onClick: () => openLockModal('책갈피') },
    { icon: <span style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.5)' }}>{pageNumber}/{numPages || '...'}</span>, label: '', active: false, locked: false, isPageDisplay: true, onClick: () => {} },
    { icon: <Palette style={{ width: 16, height: 16 }} />, label: '테마', active: false, locked: true, onClick: () => openLockModal('테마 변경') },
    { icon: <Highlighter style={{ width: 16, height: 16 }} />, label: '형광펜', active: false, locked: true, onClick: () => openLockModal('형광펜 / 메모') },
    { icon: <Focus style={{ width: 16, height: 16 }} />, label: '집중', active: false, locked: true, onClick: () => openLockModal('집중 모드') },
    { icon: <Settings2 style={{ width: 16, height: 16 }} />, label: '설정', active: false, locked: true, onClick: () => openLockModal('글꼴·크기·줄간격 설정') },
  ]

  return (
    <div ref={containerRef} style={{ width: '100vw', height: '100dvh', background: '#0a0a14', position: 'relative', overflow: 'hidden', fontFamily: "'Noto Sans KR', system-ui, sans-serif" }}>
      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>

      {/* ━━━ 상단: 파일명 + 줌 ━━━ */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 44, zIndex: 50,
        background: 'rgba(6,6,12,0.95)', backdropFilter: 'blur(20px)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 14px',
      }}>
        <span style={{
          color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: 600,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0,
        }}>{fileName}</span>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          <button onClick={zoomOut} style={{
            width: 26, height: 26, borderRadius: 6, background: 'rgba(255,255,255,0.06)', border: 'none',
            color: 'rgba(255,255,255,0.6)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}><Minus style={{ width: 12, height: 12 }} /></button>
          <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: 600, width: 34, textAlign: 'center' }}>
            {Math.round(scale * 100)}%
          </span>
          <button onClick={zoomIn} style={{
            width: 26, height: 26, borderRadius: 6, background: 'rgba(255,255,255,0.06)', border: 'none',
            color: 'rgba(255,255,255,0.6)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}><Plus style={{ width: 12, height: 12 }} /></button>
        </div>
      </div>

      {/* ━━━ 메뉴 버튼 그리드 ━━━ */}
      <div style={{
        position: 'absolute', top: 44, left: 0, right: 0, zIndex: 50,
        background: 'rgba(6,6,12,0.95)', backdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 4,
          padding: '8px 12px', width: '100%', maxWidth: 520, margin: '0 auto',
        }}>
          {menuButtons.map((btn, i) => (
            <button key={i} onClick={e => { e.stopPropagation(); btn.onClick?.() }} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              padding: '8px 0', borderRadius: 8, border: 'none', cursor: 'pointer',
              background: btn.active ? `${ACCENT}15` : 'transparent',
              color: btn.locked ? 'rgba(255,255,255,0.3)' : btn.active ? ACCENT : 'rgba(255,255,255,0.55)',
              position: 'relative',
            }}>
              {btn.isPageDisplay ? btn.icon : (
                <div style={{ position: 'relative' }}>
                  {btn.icon}
                  {btn.locked && (
                    <Lock style={{
                      width: 7, height: 7, position: 'absolute', bottom: -2, right: -4,
                      color: 'rgba(255,255,255,0.4)',
                    }} />
                  )}
                </div>
              )}
              {btn.label && (
                <span style={{ fontSize: 9, marginTop: 4, fontWeight: 500 }}>{btn.label}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ━━━ 콘텐츠 영역 ━━━ */}
      <div ref={contentAreaRef} style={{
        position: 'absolute', top: 100, left: 0, right: 0, bottom: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
      }}>
        <div ref={touchOverlayRef} onClick={handlePageAreaClick} style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 20,
          touchAction: 'none',
          cursor: scale > 1.05 ? 'grab' : 'default',
          WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none',
        } as React.CSSProperties} />

        <div ref={pdfContentRef}>
          {pdfLoading && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 48 }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{
                  width: 40, height: 40,
                  border: '4px solid #F59E0B', borderTopColor: 'transparent',
                  borderRadius: '50%', animation: 'spin 1s linear infinite',
                  margin: '0 auto 12px',
                }} />
                <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>PDF 로딩 중...</p>
              </div>
            </div>
          )}
          <PDFDocument file={pdfUrl} onLoadSuccess={onDocumentLoadSuccess} loading="" options={pdfOptions}>
            <div style={isCropping
              ? { ...frameStyle, width: cropVisibleW, height: cropVisibleH, overflow: 'hidden' }
              : frameStyle
            }>
              <div style={isCropping
                ? { transform: `translate(${cropOffX}px, ${cropOffY}px)` }
                : undefined
              }>
                <Page pageNumber={pageNumber} width={isCropping ? cropPageWidth : renderWidth} renderTextLayer={false} renderAnnotationLayer={true} loading="" />
              </div>
            </div>
          </PDFDocument>
        </div>
      </div>

      {/* ━━━ 롱프레스 돋보기 (떠다니는, 항상 작동) ━━━ */}
      <div ref={magnifierElRef} style={{
        display: 'none', position: 'fixed', zIndex: 100,
        width: 280, height: 280,
        border: '3px solid rgba(245,158,11,0.9)', borderRadius: '50%',
        boxShadow: '0 6px 32px rgba(0,0,0,0.5)', pointerEvents: 'none',
        backgroundRepeat: 'no-repeat',
      }} />

      {/* ━━━ EPUB 변환 유도 하단 배너 ━━━ */}
      {onConvert && numPages > 0 && (
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 40,
          padding: '12px 16px',
          background: 'linear-gradient(0deg, rgba(6,6,12,0.98) 0%, rgba(6,6,12,0.9) 70%, transparent 100%)',
        }}>
          <button onClick={onConvert} style={{
            width: '100%', maxWidth: 400, margin: '0 auto', display: 'flex',
            alignItems: 'center', justifyContent: 'center', gap: 8,
            padding: '12px 24px', borderRadius: 12,
            background: 'linear-gradient(135deg, #F59E0B, #D97706)',
            border: 'none', color: '#000', fontSize: 14, fontWeight: 700,
            cursor: 'pointer', boxShadow: '0 0 24px rgba(245,158,11,0.2)',
          }}>
            <Zap style={{ width: 16, height: 16 }} />
            EPUB으로 변환하면 더 편하게 읽을 수 있어요
          </button>
        </div>
      )}

      {/* ━━━ 잠금 기능 모달 ━━━ */}
      {showLockModal && (
        <div onClick={() => setShowLockModal(false)} style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 200,
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            width: '100%', maxWidth: 360, borderRadius: 20,
            background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)',
            padding: '36px 28px 28px', textAlign: 'center', position: 'relative',
          }}>
            <button onClick={() => setShowLockModal(false)} style={{
              position: 'absolute', top: 14, right: 14,
              width: 32, height: 32, borderRadius: 8,
              background: 'rgba(255,255,255,0.06)', border: 'none',
              color: 'rgba(255,255,255,0.5)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}><X style={{ width: 16, height: 16 }} /></button>

            <div style={{
              width: 64, height: 64, borderRadius: '50%',
              background: 'rgba(245,158,11,0.1)', border: '2px solid rgba(245,158,11,0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 20px',
            }}>
              <Lock style={{ width: 28, height: 28, color: '#F59E0B' }} />
            </div>

            <h3 style={{ color: '#fff', fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
              {lockFeatureName}
            </h3>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, lineHeight: 1.6, marginBottom: 28 }}>
              EPUB으로 변환하면 이 기능을 사용할 수 있어요.
              <br />PDF를 EPUB으로 변환해보세요!
            </p>

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowLockModal(false)} style={{
                flex: 1, padding: '13px 16px', borderRadius: 12,
                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                color: 'rgba(255,255,255,0.7)', fontSize: 14, fontWeight: 600, cursor: 'pointer',
              }}>닫기</button>
              <button onClick={() => { setShowLockModal(false); if (onConvert) onConvert() }} style={{
                flex: 1.5, padding: '13px 16px', borderRadius: 12,
                background: 'linear-gradient(135deg, #F59E0B, #D97706)',
                border: 'none', color: '#000', fontSize: 14, fontWeight: 700, cursor: 'pointer',
                boxShadow: '0 0 20px rgba(245,158,11,0.15)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}>
                <Zap style={{ width: 14, height: 14 }} />
                EPUB 변환하기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
