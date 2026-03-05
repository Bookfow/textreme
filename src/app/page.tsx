'use client'

import * as PortOne from "@portone/browser-sdk/v2"

import Link from "next/link"

import { useState, useRef, useEffect, useCallback } from "react"
import dynamic from "next/dynamic"

const PDFViewer = dynamic(() => import("@/components/pdf-viewer"), { ssr: false })
import { FileText, Zap, Upload, BookOpen, Smartphone, Globe, ArrowRight, Type, CheckCircle2 } from "lucide-react"
import EpubViewerLite from "@/components/epub-viewer-lite"

import { convertTxtToEpub, convertDocxToEpub } from "@/lib/text-to-epub"


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TeXTREME — Landing + Convert + Complete
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const PRICE_PER_PAGE = 10

const PRICE_EXAMPLES = [
  { pages: 50, display: "50p 이하 소책자" },
  { pages: 142, display: "142p 자기계발서" },
  { pages: 308, display: "308p 전공서적" },
  { pages: 487, display: "487p 기술서적" },
]

type ViewType = "landing" | "pricing" | "converting" | "complete" | "viewer" | "pdf-viewer"

interface ExtractedText { page: number; text: string }

const fontLink = `@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700;900&family=Outfit:wght@600;700;800;900&display=swap');`

const globalStyles = `
${fontLink}
* { margin: 0; padding: 0; box-sizing: border-box; }
@keyframes float { 0%,100% { transform: translateY(0px); } 50% { transform: translateY(-12px); } }
@keyframes fadeUp { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }
@keyframes pulse-ring { 0% { transform: scale(0.9); opacity: 0.5; } 100% { transform: scale(1.4); opacity: 0; } }
@keyframes slideText { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
@keyframes checkPop { 0% { transform: scale(0); opacity: 0; } 50% { transform: scale(1.2); } 100% { transform: scale(1); opacity: 1; } }
.fade-up { animation: fadeUp 0.8s ease-out both; }
.fade-up-d1 { animation: fadeUp 0.8s ease-out 0.1s both; }
.fade-up-d2 { animation: fadeUp 0.8s ease-out 0.2s both; }
.fade-up-d3 { animation: fadeUp 0.8s ease-out 0.3s both; }
.fade-up-d4 { animation: fadeUp 0.8s ease-out 0.4s both; }
.fade-up-d5 { animation: fadeUp 0.8s ease-out 0.5s both; }
.slide-text { animation: slideText 0.4s ease-out both; }
.glow-amber { box-shadow: 0 0 40px rgba(245,158,11,0.15), 0 0 80px rgba(245,158,11,0.05); }
.check-pop { animation: checkPop 0.5s ease-out both; }
.card-hover { transition: transform 0.25s ease, border-color 0.25s ease, box-shadow 0.25s ease; cursor: default; }
.card-hover:hover { transform: translateY(-4px); border-color: rgba(245,158,11,0.25) !important; box-shadow: 0 8px 24px rgba(245,158,11,0.08); }
.icon-float { transition: transform 0.3s ease; display: inline-flex; }
.card-hover:hover .icon-float { transform: translateY(-2px) scale(1.1); }
.btn-glow { transition: all 0.25s ease; }
.btn-glow:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(245,158,11,0.2); border-color: rgba(245,158,11,0.5) !important; }
.step-card { transition: transform 0.25s ease, box-shadow 0.25s ease; }
.step-card:hover { transform: translateY(-6px); box-shadow: 0 12px 32px rgba(0,0,0,0.3); }
@keyframes shimmer { 0% { background-position: -200% center; } 100% { background-position: 200% center; } }
.shimmer-text { background: linear-gradient(90deg, #F59E0B 30%, #fde68a 50%, #F59E0B 70%); background-size: 200% auto; -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; animation: shimmer 3s linear infinite; }
.features-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
@media (max-width: 640px) { .features-grid { grid-template-columns: repeat(2, 1fr); } }
.upload-boxes { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; width: 100%; max-width: 560px; }
@media (max-width: 480px) { .upload-boxes { gap: 12px; } }
@keyframes boxGlow { 0%,100% { box-shadow: 0 0 20px rgba(245,158,11,0.08), 0 0 40px rgba(245,158,11,0.04); } 50% { box-shadow: 0 0 30px rgba(245,158,11,0.15), 0 0 60px rgba(245,158,11,0.08); } }
.converter-box-glow { animation: boxGlow 3s ease-in-out infinite; }
.converter-box-glow:hover { animation: none; box-shadow: 0 0 40px rgba(245,158,11,0.2), 0 0 80px rgba(245,158,11,0.1) !important; border-color: rgba(245,158,11,0.5) !important; }
`

function calcPrice(pages: number): number {
  return Math.max(500, Math.floor((pages * PRICE_PER_PAGE) / 100) * 100)
}

export default function TeXTREME() {

  // ━━━ 포트원 결제 처리 ━━━
  const handlePayment = async () => {
    const price = calcPrice(filePages)
    const paymentId = `textreme-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

    try {
      // 1단계: 포트원 결제창 열기
      const response = await PortOne.requestPayment({
        storeId: process.env.NEXT_PUBLIC_PORTONE_STORE_ID!,
        channelKey: process.env.NEXT_PUBLIC_PORTONE_CHANNEL_KEY!,
        paymentId: paymentId,
        orderName: `TeXTREME PDF→EPUB 변환 (${filePages}p)`,
        totalAmount: price,
        currency: "CURRENCY_KRW",
        payMethod: "CARD",
        productType: "PRODUCT_TYPE_DIGITAL",
      })

      // 사용자가 결제창을 닫았거나 에러 발생
      if (response?.code != null) {
        if (response.code === "FAILURE_TYPE_PG" || response.message?.includes("cancel")) {
          return // 사용자가 취소한 경우 조용히 종료
        }
        alert("결제 중 오류가 발생했습니다: " + response.message)
        return
      }

      // 2단계: 서버에서 결제 검증
      const verifyRes = await fetch("/api/payment/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentId: paymentId,
          expectedAmount: price,
        }),
      })

      const verifyData = await verifyRes.json()

      if (!verifyData.success) {
        alert("결제 검증에 실패했습니다: " + verifyData.error)
        return
      }

      // 3단계: 검증 통과! 변환 시작
      startConversion(filePages)

    } catch (error) {
      console.error("결제 처리 에러:", error)
      alert("결제 처리 중 오류가 발생했습니다.")
    }
  }


  const [view, setView] = useState<ViewType>("landing")
  const [file, setFile] = useState<File | null>(null)
  const [fileName, setFileName] = useState("")
  const [filePages, setFilePages] = useState(0)
  const [progress, setProgress] = useState(0)
  const [currentPage, setCurrentPage] = useState(0)
  const [extractedTexts, setExtractedTexts] = useState<ExtractedText[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const viewerInputRef = useRef<HTMLInputElement>(null)
  const progressInterval = useRef<ReturnType<typeof setInterval> | null>(null)
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null)
  const [isPwaInstalled, setIsPwaInstalled] = useState(false)
  const [epubUrl, setEpubUrl] = useState<string | null>(null)
  const [pdfViewerUrl, setPdfViewerUrl] = useState<string | null>(null)
  const [agreeNoRefund, setAgreeNoRefund] = useState(false)

  // ━━━ PWA install prompt ━━━
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsPwaInstalled(true)
    }
    const handler = (e: Event) => { e.preventDefault(); setDeferredPrompt(e) }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstallPwa = async () => {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    const result = await deferredPrompt.userChoice
    if (result.outcome === 'accepted') setIsPwaInstalled(true)
    setDeferredPrompt(null)
  }

  // ━━━ Real conversion via Gemini API ━━━
  const startConversion = useCallback(async (pages: number) => {
    if (!file) return
    setView("converting")
    setProgress(0)
    setCurrentPage(0)
    setExtractedTexts([])

    try {
      // ★ PDF를 base64로 변환 (이미지 변환 없음 — 서버에서 pdf-lib로 분할)
      setExtractedTexts([{ page: 0, text: 'PDF를 준비하고 있습니다...' }])

      const arrayBuffer = await file.arrayBuffer()
      const uint8Array = new Uint8Array(arrayBuffer)
      let binary = ''
      for (let i = 0; i < uint8Array.length; i++) {
        binary += String.fromCharCode(uint8Array[i])
      }
      const pdfBase64 = btoa(binary)

      setProgress(5) // PDF base64 변환 완료

      // SSE로 Gemini API 호출 (서버에서 PDF 분할 후 Gemini 전달)
      setExtractedTexts([{ page: 0, text: 'AI가 페이지를 분석하고 있습니다...' }])

      const title = file.name.replace(/\.pdf$/i, '')
      const response = await fetch('/api/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdfBase64, pageCount: pages, title }),
      })

      if (!response.ok) {
        const errData = await response.json().catch(() => ({ error: '서버 오류' }))
        throw new Error(errData.error || `서버 오류 ${response.status}`)
      }

      const reader = response.body?.getReader()
      if (!reader) throw new Error('스트림을 읽을 수 없습니다')

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const data = JSON.parse(line.slice(6))

            if (data.type === 'progress') {
              const pct = 5 + Math.round((data.percent / 100) * 90) // 5~95%: AI 추출
              setProgress(pct)
              setCurrentPage(data.page)
              if (data.text) {
                setExtractedTexts(prev => {
                  const next = [...prev, { page: data.page, text: data.text }]
                  return next.slice(-6)
                })
              }
            } else if (data.type === 'status') {
              setExtractedTexts(prev => [...prev.slice(-5), { page: 0, text: data.message }])
            } else if (data.type === 'complete') {
              setProgress(100)

              // EPUB base64 → Blob → 다운로드 + 뷰어 열기
              if (data.epubBase64) {
                const binaryStr = atob(data.epubBase64)
                const bytes = new Uint8Array(binaryStr.length)
                for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i)
                const blob = new Blob([bytes], { type: 'application/epub+zip' })

                // 자동 다운로드
                const downloadUrl = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = downloadUrl
                a.download = title + '.epub'
                a.click()
                URL.revokeObjectURL(downloadUrl)

                // 뷰어용 URL 설정
                const viewerUrl = URL.createObjectURL(blob)
                setEpubUrl(viewerUrl)
              }

              setTimeout(() => setView("complete"), 600)
            } else if (data.type === 'error') {
              throw new Error(data.message)
            }
          } catch (parseErr: any) {
            if (parseErr.message && !parseErr.message.includes('JSON')) throw parseErr
          }
        }
      }
    } catch (err: any) {
      console.error('변환 실패:', err)
      alert('변환 중 오류가 발생했습니다: ' + err.message)
      setView("landing")
    }
  }, [file])

  useEffect(() => {
    return () => { if (progressInterval.current) clearInterval(progressInterval.current) }
  }, [])

  const handleFile = async (f: File, mode: 'viewer' | 'convert' = 'convert') => {
    if (!f) return
    const ext = f.name.split('.').pop()?.toLowerCase() || ''
    setFileName(f.name)

    // EPUB → 바로 뷰어
    if (ext === 'epub') {
      const url = URL.createObjectURL(f)
      setEpubUrl(url)
      setView("viewer")
      return
    }

    // TXT → EPUB 변환 후 뷰어
    if (ext === 'txt') {
      try {
        const text = await f.text()
        if (!text.trim()) return
        const title = f.name.replace(/\.txt$/i, '')
        const blob = await convertTxtToEpub(text, title, '')
        const url = URL.createObjectURL(blob)
        setEpubUrl(url)
        setView("viewer")
      } catch {}
      return
    }

    // DOCX → EPUB 변환 후 뷰어
    if (ext === 'docx') {
      try {
        const arrayBuffer = await f.arrayBuffer()
        const title = f.name.replace(/\.docx$/i, '')
        const blob = await convertDocxToEpub(arrayBuffer, title, '')
        const url = URL.createObjectURL(blob)
        setEpubUrl(url)
        setView("viewer")
      } catch {}
      return
    }

    // PDF 처리
    if (ext === 'pdf') {
      if (mode === 'viewer') {
        // 왼쪽 박스: PDF 뷰어로 열기
        const url = URL.createObjectURL(f)
        setPdfViewerUrl(url)
        setFile(f)
        setView("pdf-viewer")
        return
      }
      // 오른쪽 박스: 실제 페이지 수 확인 후 변환
      setFile(f)
      try {
        const pdfjsLib = await import('pdfjs-dist')
        pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
        const arrayBuffer = await f.arrayBuffer()
        const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer, cMapUrl: 'https://unpkg.com/pdfjs-dist/cmaps/', cMapPacked: true }).promise
        setFilePages(pdfDoc.numPages)
      } catch {
        setFilePages(0)
      }
      setView("pricing")
      return
    }
  }

  const reset = () => {
    if (epubUrl) URL.revokeObjectURL(epubUrl)
    if (pdfViewerUrl) URL.revokeObjectURL(pdfViewerUrl)
    setView("landing"); setFile(null); setFileName(""); setFilePages(0); setProgress(0); setCurrentPage(0); setExtractedTexts([]); setEpubUrl(null); setPdfViewerUrl(null); setAgreeNoRefund(false)
    if (progressInterval.current) clearInterval(progressInterval.current)
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Viewer — EpubViewerLite (EPUB/TXT/DOCX)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━
  if (view === "viewer" && epubUrl) {
    return (
      <div style={{ width: "100vw", height: "100dvh", fontFamily: "'Noto Sans KR', system-ui, sans-serif" }}>
        <style>{`* { margin: 0; padding: 0; box-sizing: border-box; }`}</style>
        <EpubViewerLite
          epubUrl={epubUrl}
          onBack={reset}
        />
      </div>
    )
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━
  // PDF Viewer — PDF 뷰어 모드
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━
  if (view === "pdf-viewer" && pdfViewerUrl) {
    return (
      <div style={{ width: "100vw", height: "100dvh", fontFamily: "'Noto Sans KR', system-ui, sans-serif" }}>
        <style>{`* { margin: 0; padding: 0; box-sizing: border-box; }`}</style>
        <PDFViewer
          pdfUrl={pdfViewerUrl}
          fileName={fileName}
          onBack={reset}
          onConvert={() => {
            // PDF 뷰어에서 변환으로 전환
            if (file) {
              (async () => {
                try {
                  const pdfjsLib = await import('pdfjs-dist')
                  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
                  const ab = await file.arrayBuffer()
                  const doc = await pdfjsLib.getDocument({ data: ab, cMapUrl: 'https://unpkg.com/pdfjs-dist/cmaps/', cMapPacked: true }).promise
                  setFilePages(doc.numPages)
                } catch {
                  setFilePages(0)
                }
                if (pdfViewerUrl) URL.revokeObjectURL(pdfViewerUrl)
                setPdfViewerUrl(null)
                setView("pricing")
              })()
            }
          }}
        />
      </div>
    )
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Pricing View — PDF 분석 결과 + 결제
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━
  if (view === "pricing") {
    const price = calcPrice(filePages)
    return (
      <div style={{ fontFamily: "'Noto Sans KR', sans-serif", minHeight: "100vh", background: "#06060c", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <style>{globalStyles}</style>
        <div style={{ width: "100%", maxWidth: 480 }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 40, justifyContent: "center" }}>
            <Zap size={20} color="#F59E0B" />
            <span style={{ fontFamily: "'Outfit'", fontWeight: 800, fontSize: 18, color: "#fff" }}>TeXTREME</span>
          </div>

          {/* File info */}
          <div className="fade-up" style={{ padding: 24, borderRadius: 16, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", marginBottom: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
              <div style={{ width: 48, height: 48, borderRadius: 12, background: "rgba(245,158,11,0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <FileText size={22} color="#F59E0B" />
              </div>
              <div style={{ textAlign: "left" }}>
                <div style={{ color: "#fff", fontSize: 15, fontWeight: 600 }}>{fileName || "document.pdf"}</div>
                <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, marginTop: 2 }}>{filePages}페이지 감지됨</div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              {[
                { label: "페이지", value: `${filePages}p` },
                { label: "결제액", value: `₩${price.toLocaleString()}` },
                { label: "변환 형식", value: "EPUB 3.0" },
              ].map((item, i) => (
                <div key={i} style={{ padding: "14px 8px", borderRadius: 10, background: "rgba(255,255,255,0.03)", textAlign: "center" }}>
                  <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, marginBottom: 4 }}>{item.label}</div>
                  <div style={{ color: "#fff", fontSize: 15, fontWeight: 700 }}>{item.value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Price breakdown */}
          <div className="fade-up-d1" style={{ padding: "20px 24px", borderRadius: 14, background: "rgba(245,158,11,0.04)", border: "1px solid rgba(245,158,11,0.15)", marginBottom: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 13 }}>페이지당 단가</span>
              <span style={{ color: "rgba(255,255,255,0.7)", fontSize: 14, fontWeight: 600 }}>₩{PRICE_PER_PAGE}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 13 }}>{filePages}페이지 × ₩{PRICE_PER_PAGE}</span>
              <span style={{ color: "rgba(255,255,255,0.7)", fontSize: 14, fontWeight: 600 }}>₩{(filePages * PRICE_PER_PAGE).toLocaleString()}</span>
            </div>
            <div style={{ height: 1, background: "rgba(255,255,255,0.08)", margin: "12px 0" }} />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 13 }}>100원 단위 내림</span>
              <span style={{ color: "#F59E0B", fontSize: 13 }}>최소 ₩500</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ color: "#fff", fontSize: 16, fontWeight: 700 }}>최종 결제액</span>
              <span style={{ fontFamily: "'Outfit'", color: "#F59E0B", fontSize: 24, fontWeight: 800 }}>₩{price.toLocaleString()}</span>
            </div>
          </div>

          {/* 환불 불가 동의 */}
          <div className="fade-up-d2" style={{ marginBottom: 16 }}>
            <label
              onClick={() => setAgreeNoRefund(!agreeNoRefund)}
              style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "14px 16px", borderRadius: 12, background: agreeNoRefund ? "rgba(245,158,11,0.06)" : "rgba(255,255,255,0.02)", border: agreeNoRefund ? "1px solid rgba(245,158,11,0.25)" : "1px solid rgba(255,255,255,0.08)", cursor: "pointer", transition: "all 0.2s" }}>
              <div style={{ width: 20, height: 20, borderRadius: 4, border: agreeNoRefund ? "2px solid #F59E0B" : "2px solid rgba(255,255,255,0.25)", background: agreeNoRefund ? "#F59E0B" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1, transition: "all 0.2s" }}>
                {agreeNoRefund && <span style={{ color: "#000", fontSize: 13, fontWeight: 900, lineHeight: 1 }}>✓</span>}
              </div>
              <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 13, lineHeight: 1.6 }}>
                변환 완료 시 EPUB 파일이 자동 저장되며, 디지털 콘텐츠 특성상 <strong style={{ color: "rgba(255,255,255,0.85)" }}>환불이 불가</strong>함에 동의합니다. (<a href="/policies/terms" target="_blank" style={{ color: "#F59E0B", textDecoration: "underline" }}>이용약관</a>)
              </span>
            </label>
          </div>

          {/* Buttons */}
          <div className="fade-up-d3" style={{ display: "flex", gap: 12 }}>
            <button onClick={reset}
              style={{ flex: 1, padding: "16px 20px", borderRadius: 12, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "#fff", fontSize: 15, fontWeight: 600, cursor: "pointer" }}>
              취소
            </button>
            <button onClick={handlePayment}
              disabled={!agreeNoRefund}
              style={{ flex: 2, padding: "16px 20px", borderRadius: 12, background: agreeNoRefund ? "linear-gradient(135deg, #F59E0B, #D97706)" : "rgba(255,255,255,0.08)", border: "none", color: agreeNoRefund ? "#000" : "rgba(255,255,255,0.3)", fontSize: 16, fontWeight: 800, cursor: agreeNoRefund ? "pointer" : "not-allowed", boxShadow: agreeNoRefund ? "0 0 30px rgba(245,158,11,0.2)" : "none", transition: "all 0.3s" }}>
              ₩{price.toLocaleString()} 결제하고 변환
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Converting View
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━
  if (view === "converting") {
    return (
      <div style={{ fontFamily: "'Noto Sans KR', sans-serif", minHeight: "100vh", background: "#06060c", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <style>{globalStyles}</style>
        <div style={{ width: "100%", maxWidth: 480, textAlign: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 40, justifyContent: "center" }}>
            <Zap size={20} color="#F59E0B" />
            <span style={{ fontFamily: "'Outfit'", fontWeight: 800, fontSize: 18, color: "#fff" }}>TeXTREME</span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: 16, borderRadius: 12, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", marginBottom: 32 }}>
            <FileText size={20} color="#F59E0B" />
            <div style={{ textAlign: "left", flex: 1 }}>
              <div style={{ color: "#fff", fontSize: 14, fontWeight: 600 }}>{fileName || "document.pdf"}</div>
              <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 12 }}>{filePages}페이지 · 예상 가격 ₩{calcPrice(filePages).toLocaleString()}</div>
            </div>
          </div>

          {/* Progress ring */}
          <div style={{ position: "relative", width: 160, height: 160, margin: "0 auto 32px" }}>
            <svg width="160" height="160" viewBox="0 0 160 160">
              <circle cx="80" cy="80" r="70" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="6" />
              <circle cx="80" cy="80" r="70" fill="none" stroke="#F59E0B" strokeWidth="6" strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 70}`}
                strokeDashoffset={`${2 * Math.PI * 70 * (1 - progress / 100)}`}
                transform="rotate(-90 80 80)"
                style={{ transition: "stroke-dashoffset 0.3s ease" }} />
            </svg>
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontFamily: "'Outfit'", fontWeight: 800, fontSize: 40, color: "#fff" }}>{progress}</span>
              <span style={{ color: "rgba(255,255,255,0.55)", fontSize: 12, marginTop: -4 }}>%</span>
            </div>
          </div>

          <p style={{ color: "#F59E0B", fontSize: 15, fontWeight: 600, marginBottom: 4 }}>
            {progress < 100 ? "AI가 페이지를 분석하고 있습니다" : "변환 완료!"}
          </p>
          <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, marginBottom: 32 }}>
            {currentPage}/{filePages} 페이지 처리됨
          </p>

          <div style={{ height: 4, borderRadius: 4, background: "rgba(255,255,255,0.06)", overflow: "hidden", marginBottom: 32 }}>
            <div style={{ height: "100%", borderRadius: 4, background: "linear-gradient(90deg, #F59E0B, #FBBF24)", transition: "width 0.3s", width: `${progress}%` }} />
          </div>

          {/* Live extraction feed */}
          <div style={{ borderRadius: 12, border: "1px solid rgba(255,255,255,0.06)", overflow: "hidden" }}>
            <div style={{ padding: "10px 16px", background: "rgba(255,255,255,0.02)", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", animation: "pulse-ring 2s infinite" }} />
              <span style={{ color: "rgba(255,255,255,0.55)", fontSize: 11, fontWeight: 600 }}>실시간 추출</span>
            </div>
            <div style={{ padding: 12, maxHeight: 180, overflow: "hidden" }}>
              {extractedTexts.map((item, i) => (
                <div key={i} className={i === extractedTexts.length - 1 ? "slide-text" : ""}
                  style={{ padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.03)", display: "flex", gap: 10 }}>
                  <span style={{ color: "#F59E0B", fontSize: 11, fontWeight: 600, flexShrink: 0 }}>p.{item.page}</span>
                  <span style={{ color: "rgba(255,255,255,0.55)", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.text}</span>
                </div>
              ))}
              {extractedTexts.length === 0 && (
                <p style={{ color: "rgba(255,255,255,0.35)", fontSize: 12, textAlign: "center", padding: 20 }}>추출 대기 중...</p>
              )}
            </div>
          </div>

          <button onClick={reset} style={{ marginTop: 24, padding: "8px 20px", borderRadius: 8, background: "none", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.55)", fontSize: 13, cursor: "pointer" }}>
            취소
          </button>
        </div>
      </div>
    )
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Complete View — Conversion done, auto-saved
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━
  if (view === "complete") {
    return (
      <div style={{ fontFamily: "'Noto Sans KR', sans-serif", minHeight: "100vh", background: "#06060c", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <style>{globalStyles}</style>
        <div style={{ width: "100%", maxWidth: 480, textAlign: "center" }}>
          {/* Success icon */}
          <div className="check-pop" style={{ width: 96, height: 96, borderRadius: "50%", background: "rgba(34,197,94,0.1)", border: "2px solid rgba(34,197,94,0.3)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 32px" }}>
            <CheckCircle2 size={48} color="#22c55e" />
          </div>

          <h2 className="fade-up" style={{ fontFamily: "'Noto Sans KR'", fontWeight: 800, fontSize: 28, color: "#fff", marginBottom: 12, letterSpacing: "-0.02em" }}>
            변환 완료!
          </h2>
          <p className="fade-up-d1" style={{ color: "rgba(255,255,255,0.5)", fontSize: 15, lineHeight: 1.6, marginBottom: 40 }}>
            EPUB 파일이 기기에 자동 저장되었습니다
          </p>

          {/* File info card */}
          <div className="fade-up-d2" style={{ padding: 24, borderRadius: 16, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", marginBottom: 32 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
              <div style={{ width: 48, height: 48, borderRadius: 12, background: "rgba(34,197,94,0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <BookOpen size={22} color="#22c55e" />
              </div>
              <div style={{ textAlign: "left" }}>
                <div style={{ color: "#fff", fontSize: 15, fontWeight: 600 }}>{fileName?.replace('.pdf', '.epub') || "document.epub"}</div>
                <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, marginTop: 2 }}>{filePages}페이지 · ₩{calcPrice(filePages).toLocaleString()}</div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              {[
                { label: "페이지", value: `${filePages}p` },
                { label: "결제액", value: `₩${calcPrice(filePages).toLocaleString()}` },
                { label: "형식", value: "EPUB 3.0" },
              ].map((item, i) => (
                <div key={i} style={{ padding: "12px 8px", borderRadius: 10, background: "rgba(255,255,255,0.03)", textAlign: "center" }}>
                  <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, marginBottom: 4 }}>{item.label}</div>
                  <div style={{ color: "#fff", fontSize: 14, fontWeight: 700 }}>{item.value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Tip */}
          <div className="fade-up-d3" style={{ padding: "16px 20px", borderRadius: 12, background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.15)", marginBottom: 32, textAlign: "left" }}>
            <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 13, lineHeight: 1.6 }}>
              <span style={{ color: "#F59E0B", fontWeight: 700 }}>Tip</span> — 다운로드된 EPUB 파일을 원하는 EPUB 뷰어 앱에서 열어보세요.
            </p>
          </div>

          {/* Actions */}
          <div className="fade-up-d4" style={{ display: "flex", gap: 12 }}>
            <button onClick={reset}
              style={{ flex: 1, padding: "14px 20px", borderRadius: 12, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
              다른 PDF 변환
            </button>
            {epubUrl ? (
              <button onClick={() => setView("viewer")}
                style={{ flex: 1, padding: "14px 20px", borderRadius: 12, background: "linear-gradient(135deg, #F59E0B, #D97706)", border: "none", color: "#000", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                EPUB 바로 읽기
              </button>
            ) : (
              <button onClick={reset}
                style={{ flex: 1, padding: "14px 20px", borderRadius: 12, background: "linear-gradient(135deg, #F59E0B, #D97706)", border: "none", color: "#000", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                홈으로
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Landing View
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━
  return (
    <div style={{ fontFamily: "'Noto Sans KR', system-ui, sans-serif", background: "#06060c", minHeight: "100vh" }}>
      <style>{globalStyles}</style>

      {/* NAV */}
      <nav style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 100, padding: "16px 24px", background: "rgba(6,6,12,0.8)", backdropFilter: "blur(20px)", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <Zap size={22} color="#F59E0B" strokeWidth={2.5} />
            <span style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 800, fontSize: 20, color: "#fff", letterSpacing: "-0.02em" }}>
              TeXTREME
            </span>
            <span style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", fontWeight: 500, marginLeft: 6 }}>
              PDF to EPUB 변환기
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button onClick={() => fileInputRef.current?.click()}
              style={{ padding: "8px 20px", borderRadius: 10, background: "linear-gradient(135deg, #F59E0B, #D97706)", color: "#000", fontWeight: 700, fontSize: 14, border: "none", cursor: "pointer" }}>
              PDF → EPUB 변환하기
            </button>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "120px 24px 40px", background: "radial-gradient(ellipse 80% 60% at 50% 30%, rgba(245,158,11,0.06) 0%, transparent 60%), radial-gradient(ellipse 60% 40% at 50% 80%, rgba(59,130,246,0.04) 0%, transparent 60%), #06060c", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, opacity: 0.03, backgroundImage: "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)", backgroundSize: "60px 60px" }} />

        <div className="fade-up" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 16px", borderRadius: 40, border: "1px solid rgba(245,158,11,0.2)", background: "rgba(245,158,11,0.06)", marginBottom: 28 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 8px #22c55e" }} />
          <span style={{ color: "#F59E0B", fontSize: 13, fontWeight: 600 }}>AI 기반 변환 엔진</span>
        </div>

        <h1 className="fade-up-d1" style={{ fontFamily: "'Noto Sans KR', sans-serif", fontWeight: 900, fontSize: "clamp(36px, 6vw, 64px)", lineHeight: 1.15, textAlign: "center", color: "#fff", maxWidth: 700, letterSpacing: "-0.03em" }}>
          한글 PDF를<br />
          <span style={{ background: "linear-gradient(135deg, #F59E0B, #FBBF24, #F59E0B)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            완벽한 EPUB
          </span>으로
        </h1>

        <p className="fade-up-d2" style={{ fontSize: "clamp(16px, 2.5vw, 20px)", color: "rgba(255,255,255,0.5)", textAlign: "center", maxWidth: 520, lineHeight: 1.6, marginTop: 20, marginBottom: 48 }}>
          AI가 PDF 페이지를 분석하여 모바일에서도<br />편하게 읽을 수 있는 EPUB으로 변환합니다
        </p>

        {/* Two Boxes: Viewer + Converter */}
        <div className="fade-up-d3 upload-boxes">
          {/* Left: FREE 문서 뷰어 */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
              <BookOpen size={20} color="#22c55e" />
              <span style={{ color: "#22c55e", fontSize: 16, fontWeight: 800 }}>FREE 문서 뷰어</span>
            </div>
            <div
              onClick={() => viewerInputRef.current?.click()}
              style={{
                width: "100%", padding: "28px 16px", borderRadius: 20,
                border: "2px dashed rgba(34,197,94,0.2)",
                background: "rgba(34,197,94,0.03)",
                cursor: "pointer", textAlign: "center", transition: "all 0.3s",
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                aspectRatio: "1",
              }}>
              <div style={{ width: 48, height: 48, borderRadius: 14, background: "rgba(34,197,94,0.08)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
                <Upload size={22} color="#22c55e" />
              </div>
              <p style={{ color: "#22c55e", fontSize: 13, fontWeight: 600, marginBottom: 14 }}>
                클릭하여 파일 열기
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, justifyContent: "center", marginBottom: 14 }}>
                {["EPUB", "DOCX", "TXT", "PDF"].map(fmt => (
                  <span key={fmt} style={{ padding: "2px 8px", borderRadius: 5, background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.2)", color: "#22c55e", fontSize: 11, fontWeight: 600 }}>{fmt}</span>
                ))}
              </div>
              <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, lineHeight: 1.5 }}>
                단, PDF는 문서 구조 특성상<br />EPUB만의 활용도 높은 기능을<br />제대로 사용하지 못할 수 있습니다.
              </p>
              <input ref={viewerInputRef} type="file" accept=".epub,.txt,.docx,.pdf" style={{ display: "none" }}
                onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0], 'viewer') }} />
            </div>
          </div>

          {/* Right: PDF → EPUB 변환 (강조) */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
              <Zap size={20} color="#F59E0B" />
              <span style={{ color: "#F59E0B", fontSize: 16, fontWeight: 800 }}>PDF → EPUB 변환</span>
            </div>
            <div
              onClick={() => fileInputRef.current?.click()}
              className="converter-box-glow"
              style={{
                width: "100%", padding: "28px 16px", borderRadius: 20,
                border: "2px solid rgba(245,158,11,0.35)",
                background: "rgba(245,158,11,0.04)",
                cursor: "pointer", textAlign: "center", transition: "all 0.3s",
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                aspectRatio: "1",
                boxShadow: "0 0 30px rgba(245,158,11,0.1), 0 0 60px rgba(245,158,11,0.05)",
              }}>
              <div style={{ width: 48, height: 48, borderRadius: 14, background: "rgba(245,158,11,0.1)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
                <Upload size={22} color="#F59E0B" />
              </div>
              <p style={{ color: "#F59E0B", fontSize: 13, fontWeight: 600, marginBottom: 14 }}>
                클릭하여 PDF 열기
              </p>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 14 }}>
                <span style={{ padding: "2px 8px", borderRadius: 5, background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.25)", color: "#F59E0B", fontSize: 11, fontWeight: 600 }}>PDF</span>
                <span style={{ color: "rgba(255,255,255,0.55)", fontSize: 13 }}>→</span>
                <span style={{ padding: "2px 8px", borderRadius: 5, background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.25)", color: "#F59E0B", fontSize: 11, fontWeight: 600 }}>EPUB</span>
              </div>
              <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 12 }}>
                한글특화 · 정확도 99%+ · 모바일 최적화<br />모든 뷰어 호환 · 구조 보존
              </p>
              <input ref={fileInputRef} type="file" accept=".pdf" style={{ display: "none" }}
                onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]) }} />
            </div>
          </div>
        </div>
      </section>

      {/* ━━━ FEATURES ━━━ */}
      <section style={{ padding: "25px 24px", background: "linear-gradient(180deg, #06060c 0%, #0a0a14 50%, #06060c 100%)" }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <h2 style={{ textAlign: "center", color: "#fff", fontWeight: 800, fontSize: 36, letterSpacing: "-0.02em", marginBottom: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, flexWrap: "wrap" }}>
            왜 <span style={{ display: "inline-flex", alignItems: "center", gap: 2 }}><Zap size={36} color="#F59E0B" style={{ position: "relative", top: 2 }} />TeXTREME</span> PDF to EPUB 변환기인가?
          </h2>
          <p style={{ textAlign: "center", color: "rgba(255,255,255,0.65)", fontSize: 20, marginBottom: 40 }}>
            한글 PDF에 최적화된 AI 변환 엔진
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 32, maxWidth: 520, margin: "0 auto 56px" }}>
            {[
              { value: "₩10", label: "페이지당", sub: "사용한 만큼만" },
              { value: "~10초", label: "페이지당 변환", sub: "AI 비전 엔진" },
              { value: "99%+", label: "한글 인식률", sub: "한글 특화" },
            ].map((s, i) => (
              <div key={i} style={{ textAlign: "center" }}>
                <div style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 800, fontSize: 32, color: "#F59E0B", letterSpacing: "-0.02em" }}>{s.value}</div>
                <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 15, fontWeight: 500, marginTop: 6 }}>{s.label}</div>
                <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 13, marginTop: 3 }}>{s.sub}</div>
              </div>
            ))}
          </div>
          <div className="features-grid">
            {[
              { icon: <Type size={22} />, title: "한글 특화", desc: "한글 조사·어미·띄어쓰기를 정확히 인식하는 AI 엔진" },
              { icon: "🔤", title: "한글 정확도 99%+", desc: "조사·어미·띄어쓰기까지 정확한 텍스트 추출" },
              { icon: <Smartphone size={22} />, title: "모바일 최적화", desc: "화면 크기에 맞춰 자동 리플로우되는 EPUB 생성" },
              { icon: "📖", title: "모든 뷰어 호환", desc: "EPUB 3.0 표준 준수, 원하는 앱에서 바로 열기" },
              { icon: <Globe size={22} />, title: "어디서든 변환", desc: "PC·태블릿·스마트폰, 브라우저만 있으면 OK" },
              { icon: <BookOpen size={22} />, title: "구조 보존", desc: "제목·본문·인용·리스트를 자동 분석하여 구조 유지" },
            ].map((f, i) => (
              <div key={i} style={{ padding: "24px 20px", borderRadius: 14, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.12)" }} className="card-hover">
                <div style={{ color: "#F59E0B", marginBottom: 14, fontSize: typeof f.icon === "string" ? 22 : undefined }}>
                  {f.icon}
                </div>
                <h4 style={{ color: "#fff", fontWeight: 700, fontSize: 17, marginBottom: 8 }}>{f.title}</h4>
                <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 14, lineHeight: 1.6 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PRICING — Per-page */}
      <section style={{ padding: "100px 24px", background: "radial-gradient(ellipse 80% 50% at 50% 100%, rgba(245,158,11,0.04) 0%, transparent 60%), #06060c" }}>
        <div style={{ maxWidth: 600, margin: "0 auto" }}>
          <h2 style={{ textAlign: "center", color: "#fff", fontWeight: 800, fontSize: 36, letterSpacing: "-0.02em", marginBottom: 12 }}>
            심플한 가격
          </h2>
          <p style={{ textAlign: "center", color: "rgba(255,255,255,0.6)", fontSize: 18, marginBottom: 48 }}>
            구독 없이, 사용한 만큼만 결제하세요
          </p>

          {/* Main price card */}
          <div style={{ textAlign: "center", padding: "48px 32px", borderRadius: 20, background: "linear-gradient(135deg, rgba(245,158,11,0.08), rgba(245,158,11,0.02))", border: "1px solid rgba(245,158,11,0.25)", marginBottom: 32, position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: -30, right: -20, fontFamily: "'Outfit'", fontWeight: 900, fontSize: 140, color: "rgba(245,158,11,0.04)", lineHeight: 1 }}>₩</div>
            <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 14, fontWeight: 600, marginBottom: 8 }}>페이지당</p>
            <div style={{ fontFamily: "'Outfit'", fontWeight: 900, fontSize: 72, color: "#fff", lineHeight: 1 }}>
              <span style={{ background: "linear-gradient(135deg, #F59E0B, #FBBF24)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>₩10</span>
            </div>
            <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, marginTop: 12 }}>100원 단위 내림 · 단, 최소 ₩500</p>
          </div>

          {/* Price examples */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
            {PRICE_EXAMPLES.map((ex, i) => (
              <div key={i} style={{ padding: "16px 20px", borderRadius: 12, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.12)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ color: "rgba(255,255,255,0.65)", fontSize: 14 }}>{ex.display}</span>
                <span style={{ fontFamily: "'Outfit'", fontWeight: 700, fontSize: 16, color: "#fff" }}>₩{calcPrice(ex.pages).toLocaleString()}</span>
              </div>
            ))}
          </div>


        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: "80px 24px 48px", background: "#06060c", textAlign: "center" }}>
        <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
          <button onClick={() => fileInputRef.current?.click()}
            style={{ padding: "16px 28px", borderRadius: 14, background: "linear-gradient(135deg, #F59E0B, #D97706)", color: "#000", fontWeight: 800, fontSize: 18, border: "none", cursor: "pointer", boxShadow: "0 0 40px rgba(245,158,11,0.2)", display: "flex", alignItems: "center", gap: 10 }}>
            PDF → EPUB 변환하기
          </button>
        </div>
        <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, marginTop: 16 }}>
          회원가입 필요 없음 · 사용한 만큼만 결제
        </p>

        {/* App Download Buttons */}
        <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 32, flexWrap: "wrap" }}>
          <button onClick={handleInstallPwa}
            style={{
              display: "flex", alignItems: "center", gap: 10, padding: "12px 24px", borderRadius: 12,
              background: isPwaInstalled ? "rgba(34,197,94,0.1)" : "rgba(255,255,255,0.06)",
              border: isPwaInstalled ? "1px solid rgba(34,197,94,0.3)" : "1px solid rgba(255,255,255,0.1)",
              color: isPwaInstalled ? "#22c55e" : "#fff", cursor: isPwaInstalled ? "default" : "pointer",
              transition: "all 0.2s",
            }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
              <span style={{ fontSize: 12, color: isPwaInstalled ? "rgba(34,197,94,0.6)" : "rgba(255,255,255,0.4)", fontWeight: 500 }}>
                {isPwaInstalled ? "설치 완료" : <span style={{ paddingLeft: 18 }}>웹앱으로 설치</span>}
              </span>
              <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-0.01em" }}>
                {isPwaInstalled ? "TeXTREME ✓" : <><Zap size={14} style={{ display: "inline", verticalAlign: "middle", marginRight: 2 }} color="#F59E0B" />TeXTREME PDF to EPUB</>}
              </span>
            </div>
          </button>
          <div style={{
            display: "flex", alignItems: "center", gap: 10, padding: "12px 24px", borderRadius: 12,
            background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
            color: "rgba(255,255,255,0.5)", cursor: "default",
          }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", fontWeight: 500 }}>Google Play</span>
              <span style={{ fontSize: 15, fontWeight: 700 }}>곧 출시</span>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{ padding: "32px 24px", borderTop: "1px solid rgba(255,255,255,0.05)", background: "#06060c" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16, alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Zap size={16} color="#F59E0B" />
            <span style={{ fontFamily: "'Outfit'", fontWeight: 700, fontSize: 14, color: "rgba(255,255,255,0.55)" }}>TeXTREME</span>
          </div>
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap", justifyContent: "center" }}>
            <Link href="/policies/terms" style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, textDecoration: "none" }}>이용약관</Link>
            <Link href="/policies/privacy" style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, textDecoration: "none" }}>개인정보처리방침</Link>
            <Link href="/policies/copyright" style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, textDecoration: "none" }}>저작권 및 면책</Link>
          </div>
          <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 12 }}>
            © 2026 텍스트림 · 사업자등록번호 653-33-01529
          </div>
        </div>
      </footer>
    </div>
  )
}
