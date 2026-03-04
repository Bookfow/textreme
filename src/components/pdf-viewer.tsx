// components/pdf-viewer.tsx
// TeXTREME PDF 뷰어 — 페이지 모드 전용, inline style, 다크 테마
// 기능: 페이지 넘기기, 줌, 핀치줌, 자동여백잘라내기(autoCrop)

'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Document as PDFDocument, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'
import { ArrowLeft, Minus, Plus, Crop, Zap } from 'lucide-react'

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
    const sh = (contentAreaRef.current?.clientHeight) || (window.innerHeight - 52)
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

  // ━━━ 페이지 이동 (ref 기반) ━━━
  const goToPage = useCallback((p: number) => {
    setPageNumber(Math.max(1, Math.min(p, numPagesRef.current)))
  }, [])

  // ━━━ 줌 ━━━
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

  // ━━━ 터치 이벤트 (스와이프 + 핀치줌 + 팬) ━━━
  useEffect(() => {
    const overlay = touchOverlayRef.current
    if (!overlay) return

    const minSwipeDistance = 50

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault()
        isPanningRef.current = false
        panStartRef.current = null
        const dist = getTouchDistance(e.touches)
        pinchStartDistRef.current = dist
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
      touchEndRef.current = null
      touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
    }

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault()
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
          const ratio = getTouchDistance(e.touches) / pinchStartDistRef.current
          pinchRatioRef.current = ratio
          applyPinchTransform(ratio)
        }
        return
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
      if (isPinchingRef.current) {
        clearPinchTransform()
        const finalScale = Math.min(Math.max(pinchStartScaleRef.current * pinchRatioRef.current, 0.5), 3.0)
        setScale(finalScale)
        pinchStartDistRef.current = null
        isPinchingRef.current = false
        pinchRatioRef.current = 1
        panTranslateRef.current = { x: 0, y: 0 }
        return
      }
      if (isPanningRef.current) {
        isPanningRef.current = false
        panStartRef.current = null
        return
      }
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
      setSwipeOffset(0)
      touchStartRef.current = null
      touchEndRef.current = null
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

  // ━━━ PC 마우스 이벤트 (확대 시 휠 + 드래그) ━━━
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
      if (scaleRef.current > 1.05 && e.button === 0) {
        e.preventDefault()
        mouseDragRef.current = true
        panStartRef.current = {
          x: e.clientX, y: e.clientY,
          tx: panTranslateRef.current.x, ty: panTranslateRef.current.y,
        }
        overlay.style.cursor = 'grabbing'
      }
    }

    const handleMouseMove = (e: MouseEvent) => {
      if (!mouseDragRef.current || !panStartRef.current) return
      e.preventDefault()
      panTranslateRef.current = {
        x: panStartRef.current.tx + (e.clientX - panStartRef.current.x),
        y: panStartRef.current.ty + (e.clientY - panStartRef.current.y),
      }
      applyPanTransform(panTranslateRef.current.x, panTranslateRef.current.y)
    }

    const handleMouseUp = () => {
      if (!mouseDragRef.current) return
      mouseDragRef.current = false
      panStartRef.current = null
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

  return (
    <div ref={containerRef} style={{ width: '100vw', height: '100dvh', background: '#0a0a14', position: 'relative', overflow: 'hidden', fontFamily: "'Noto Sans KR', system-ui, sans-serif" }}>
      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>

      {/* ━━━ 상단 바 ━━━ */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 52, zIndex: 50,
        background: 'rgba(6,6,12,0.95)', backdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 12px',
      }}>
        {/* 왼쪽: 뒤로 + 파일명 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
          <button onClick={onBack} style={{
            width: 36, height: 36, borderRadius: 8, background: 'rgba(255,255,255,0.06)',
            border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <ArrowLeft size={18} />
          </button>
          <span style={{
            color: '#fff', fontSize: 14, fontWeight: 600,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{fileName}</span>
        </div>

        {/* 오른쪽: 페이지 + 줌 + 여백자르기 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, fontWeight: 500 }}>
            {pageNumber} / {numPages || '...'}
          </span>

          <div style={{
            display: 'flex', alignItems: 'center', gap: 2,
            background: 'rgba(255,255,255,0.06)', borderRadius: 8, padding: '2px 4px',
          }}>
            <button onClick={zoomOut} style={{
              width: 28, height: 28, borderRadius: 6, background: 'none', border: 'none',
              color: 'rgba(255,255,255,0.6)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}><Minus size={14} /></button>
            <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: 600, width: 36, textAlign: 'center' }}>
              {Math.round(scale * 100)}%
            </span>
            <button onClick={zoomIn} style={{
              width: 28, height: 28, borderRadius: 6, background: 'none', border: 'none',
              color: 'rgba(255,255,255,0.6)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}><Plus size={14} /></button>
          </div>

          <button onClick={() => setAutoCropOn(prev => !prev)} style={{
            width: 36, height: 36, borderRadius: 8,
            background: autoCropOn ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.06)',
            border: autoCropOn ? '1px solid rgba(245,158,11,0.3)' : '1px solid transparent',
            color: autoCropOn ? '#F59E0B' : 'rgba(255,255,255,0.5)',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}><Crop size={16} /></button>
        </div>
      </div>

      {/* ━━━ 콘텐츠 영역 ━━━ */}
      <div ref={contentAreaRef} style={{
        position: 'absolute', top: 52, left: 0, right: 0, bottom: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
      }}>
        {/* 터치 오버레이 */}
        <div ref={touchOverlayRef} onClick={handlePageAreaClick} style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 20,
          touchAction: 'none',
          cursor: scale > 1.05 ? 'grab' : 'default',
          WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none',
        } as React.CSSProperties} />

        {/* PDF 렌더링 */}
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
          <PDFDocument
            file={pdfUrl}
            onLoadSuccess={onDocumentLoadSuccess}
            loading=""
            options={pdfOptions}
          >
            <div style={isCropping
              ? { ...frameStyle, width: cropVisibleW, height: cropVisibleH, overflow: 'hidden' }
              : frameStyle
            }>
              <div style={isCropping
                ? { transform: `translate(${cropOffX}px, ${cropOffY}px)` }
                : undefined
              }>
                <Page
                  pageNumber={pageNumber}
                  width={isCropping ? cropPageWidth : renderWidth}
                  renderTextLayer={false}
                  renderAnnotationLayer={true}
                  loading=""
                />
              </div>
            </div>
          </PDFDocument>
        </div>
      </div>

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
            <Zap size={16} />
            EPUB으로 변환하면 더 편하게 읽을 수 있어요
          </button>
        </div>
      )}
    </div>
  )
}
