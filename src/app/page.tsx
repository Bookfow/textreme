'use client'

import { useState, useRef, useEffect, useCallback } from "react"
import { Upload, FileText, Zap, Download, ChevronRight, Check, BookOpen, Smartphone, Globe, ArrowRight, X, ChevronLeft, Minus, Plus, Settings2, Moon, Sun as SunIcon, Type } from "lucide-react"

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TeXTREME Converter — Landing + Conversion + Preview
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const PRICING = [
  { pages: "~50p 구간", price: "₩990", per: "20원/p", popular: false },
  { pages: "~100p 구간", price: "₩1,900", per: "19원/p", popular: false },
  { pages: "~200p 구간", price: "₩2,900", per: "15원/p", popular: true },
  { pages: "~300p 구간", price: "₩4,900", per: "16원/p", popular: false },
  { pages: "~500p 구간", price: "₩7,900", per: "16원/p", popular: false },
]

const SAMPLE_PAGES = [
  {
    title: "1장 디자이너의 날갯짓이 불러일으킨 태풍",
    paragraphs: [
      "영국의 식민지였던 인도에는 코브라가 너무 많아서 실행된 정책이 하나 있다. 코브라를 잡아 오면 보상금을 주는 정책이다. 이 정책을 실행한 초반에는 코브라가 줄어드는 듯했지만, 나중에는 돈을 벌기 위해 일부러 코브라를 번식시키는 사람들이 생겨났다.",
      "이 사실을 알게 된 영국 정부는 보상 정책을 중단했다. 그러자 코브라 사육자들은 가치가 없어진 코브라를 몽땅 풀어버렸다. 결과적으로 정책을 시행하기 전보다 더 많은 야생 코브라가 사람들의 생명을 위협하는 상황이 벌어졌다.",
      "20세기 초, 프랑스의 식민지였던 베트남 하노이에서도 비슷한 일이 있었다. 여기서는 '쥐 없애기' 정책을 시행했는데, 코브라 정책과 마찬가지로 쥐를 잡아서 죽이고 그 꼬리를 가져오면 보상금을 주는 제도였다.",
    ]
  },
  {
    title: "2장 들어올 때는 마음대로였겠지만 나갈 때는 아니다",
    paragraphs: [
      "오후 6시 반, 문자 알림음이 울린다. 'OO카드 8*4* 승인 23,100원 일시불'. 무언가 이상하다. 카드 주인인 나는 지금 집에서 저녁 메뉴를 고민하고 있는데, 결제 알림이라니?",
      "급하게 가방을 뒤적거려보니 다행히 카드를 잃어버리진 않았다. 설마 해킹당한 건가? 결제된 곳은 '엔에이치엔 케이씨피(NHN KCP)'. 네이버에 검색해 보니 지식인에 비슷한 상황의 사람들이 많이 보였다.",
    ]
  }
]

type ViewType = "landing" | "converting" | "preview"
type ReaderTheme = "dark" | "light" | "sepia"

interface ThemeColors {
  bg: string; text: string; muted: string; card: string; border: string
}

interface ExtractedText {
  page: number
  text: string
}

const THEMES: Record<ReaderTheme, ThemeColors> = {
  dark: { bg: "#1a1410", text: "#EEE4E1", muted: "#9C8B7A", card: "#241E18", border: "#3A302A" },
  light: { bg: "#F7F2EF", text: "#2D2016", muted: "#9C8B7A", card: "#FFFFFF", border: "#E7D8C9" },
  sepia: { bg: "#f8f1e3", text: "#5b4636", muted: "#8b7355", card: "#ede4d3", border: "#d4c5a9" },
}

const fontLink = `@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700;900&family=Outfit:wght@600;700;800;900&display=swap');`

const globalStyles = `
${fontLink}
* { margin: 0; padding: 0; box-sizing: border-box; }
@keyframes float { 0%,100% { transform: translateY(0px); } 50% { transform: translateY(-12px); } }
@keyframes fadeUp { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }
@keyframes pulse-ring { 0% { transform: scale(0.9); opacity: 0.5; } 100% { transform: scale(1.4); opacity: 0; } }
@keyframes slideText { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
.fade-up { animation: fadeUp 0.8s ease-out both; }
.fade-up-d1 { animation: fadeUp 0.8s ease-out 0.1s both; }
.fade-up-d2 { animation: fadeUp 0.8s ease-out 0.2s both; }
.fade-up-d3 { animation: fadeUp 0.8s ease-out 0.3s both; }
.fade-up-d4 { animation: fadeUp 0.8s ease-out 0.4s both; }
.slide-text { animation: slideText 0.4s ease-out both; }
.glow-amber { box-shadow: 0 0 40px rgba(245,158,11,0.15), 0 0 80px rgba(245,158,11,0.05); }
`

export default function TeXTREME() {
  const [view, setView] = useState<ViewType>("landing")
  const [file, setFile] = useState<File | null>(null)
  const [fileName, setFileName] = useState("")
  const [filePages, setFilePages] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [progress, setProgress] = useState(0)
  const [currentPage, setCurrentPage] = useState(0)
  const [extractedTexts, setExtractedTexts] = useState<ExtractedText[]>([])
  const [previewPage, setPreviewPage] = useState(0)
  const [readerFontSize, setReaderFontSize] = useState(18)
  const [readerTheme, setReaderTheme] = useState<ReaderTheme>("dark")
  const [showReaderSettings, setShowReaderSettings] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const progressInterval = useRef<ReturnType<typeof setInterval> | null>(null)
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null)
  const [isPwaInstalled, setIsPwaInstalled] = useState(false)

  // ━━━ PWA install prompt ━━━
  useEffect(() => {
    // Service worker registration
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }
    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsPwaInstalled(true)
    }
    // Capture install prompt
    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstallPwa = async () => {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    const result = await deferredPrompt.userChoice
    if (result.outcome === 'accepted') {
      setIsPwaInstalled(true)
    }
    setDeferredPrompt(null)
  }

  const rt = THEMES[readerTheme]

  // ━━━ Conversion simulation ━━━
  const startConversion = useCallback(() => {
    const pages = 50 + Math.floor(Math.random() * 250)
    setFilePages(pages)
    setView("converting")
    setProgress(0)
    setCurrentPage(0)
    setExtractedTexts([])

    let p = 0
    let page = 0
    const totalSteps = 60
    const pageInterval = Math.max(1, Math.floor(totalSteps / Math.min(pages, 30)))

    progressInterval.current = setInterval(() => {
      p += 1 + Math.random() * 2
      page += 1
      if (p >= 100) {
        p = 100
        if (progressInterval.current) clearInterval(progressInterval.current)
        setTimeout(() => setView("preview"), 600)
      }
      setProgress(Math.min(100, Math.round(p)))
      setCurrentPage(Math.min(Math.round((p / 100) * pages), pages))

      if (page % pageInterval === 0) {
        const sampleIdx = Math.floor(Math.random() * SAMPLE_PAGES.length)
        const sample = SAMPLE_PAGES[sampleIdx]
        const paraIdx = Math.floor(Math.random() * sample.paragraphs.length)
        setExtractedTexts(prev => {
          const next: ExtractedText[] = [...prev, { page: Math.round((p / 100) * pages), text: sample.paragraphs[paraIdx].slice(0, 80) + "..." }]
          return next.slice(-6)
        })
      }
    }, 80)
  }, [])

  useEffect(() => {
    return () => { if (progressInterval.current) clearInterval(progressInterval.current) }
  }, [])

  const handleFile = (f: File) => {
    if (!f || !f.name.toLowerCase().endsWith(".pdf")) return
    setFile(f)
    setFileName(f.name)
    startConversion()
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const f = e.dataTransfer?.files?.[0]
    if (f) handleFile(f)
  }

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true) }
  const handleDragLeave = () => setIsDragging(false)

  const reset = () => {
    setView("landing"); setFile(null); setFileName(""); setProgress(0); setCurrentPage(0); setExtractedTexts([]); setPreviewPage(0)
    if (progressInterval.current) clearInterval(progressInterval.current)
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Landing View
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━
  if (view === "landing") {
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
            </div>
            <button onClick={() => fileInputRef.current?.click()}
              style={{ padding: "8px 20px", borderRadius: 10, background: "linear-gradient(135deg, #F59E0B, #D97706)", color: "#000", fontWeight: 700, fontSize: 14, border: "none", cursor: "pointer" }}>
              변환하기
            </button>
          </div>
        </nav>

        {/* HERO */}
        <section style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "120px 24px 80px", background: "radial-gradient(ellipse 80% 60% at 50% 30%, rgba(245,158,11,0.06) 0%, transparent 60%), radial-gradient(ellipse 60% 40% at 50% 80%, rgba(59,130,246,0.04) 0%, transparent 60%), #06060c", position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", inset: 0, opacity: 0.03, backgroundImage: "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)", backgroundSize: "60px 60px" }} />

          <div className="fade-up" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 16px", borderRadius: 40, border: "1px solid rgba(245,158,11,0.2)", background: "rgba(245,158,11,0.06)", marginBottom: 28 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 8px #22c55e" }} />
            <span style={{ color: "#F59E0B", fontSize: 13, fontWeight: 600 }}>AI 기반 변환 엔진</span>
          </div>

          <h1 className="fade-up-d1" style={{ fontFamily: "'Noto Sans KR', sans-serif", fontWeight: 900, fontSize: "clamp(36px, 6vw, 64px)", lineHeight: 1.15, textAlign: "center", color: "#fff", maxWidth: 700, letterSpacing: "-0.03em" }}>
            한글 PDF를<br />
            <span style={{ background: "linear-gradient(135deg, #F59E0B, #FBBF24, #F59E0B)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              완벽한 전자책
            </span>으로
          </h1>

          <p className="fade-up-d2" style={{ fontSize: "clamp(16px, 2.5vw, 20px)", color: "rgba(255,255,255,0.5)", textAlign: "center", maxWidth: 520, lineHeight: 1.6, marginTop: 20, marginBottom: 48 }}>
            AI가 PDF 페이지를 분석하여 모바일에서도<br />편하게 읽을 수 있는 EPUB으로 변환합니다
          </p>

          {/* Upload Zone */}
          <div className="fade-up-d3"
            onDrop={handleDrop} onDragOver={handleDragOver} onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
            style={{
              width: "100%", maxWidth: 500, padding: "48px 32px", borderRadius: 20,
              border: isDragging ? "2px solid #F59E0B" : "2px dashed rgba(255,255,255,0.12)",
              background: isDragging ? "rgba(245,158,11,0.06)" : "rgba(255,255,255,0.02)",
              cursor: "pointer", textAlign: "center", transition: "all 0.3s",
            }}>
            <div style={{ width: 64, height: 64, borderRadius: 16, background: "rgba(245,158,11,0.1)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", animation: "float 4s ease-in-out infinite" }}>
              <Upload size={28} color="#F59E0B" />
            </div>
            <p style={{ color: "#fff", fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
              PDF 파일을 웹/앱 아이콘으로 드래그하거나 클릭하여 업로드
            </p>
            <p style={{ color: "rgba(255,255,255,0.35)", fontSize: 13 }}>
              최대 500페이지 · PDF 형식만 지원
            </p>
            <input ref={fileInputRef} type="file" accept=".pdf" style={{ display: "none" }}
              onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]) }} />
          </div>

          {/* Stats */}
          <div className="fade-up-d4" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 32, marginTop: 60, maxWidth: 520, width: "100%" }}>
            {[
              { value: "₩990~", label: "50페이지부터", sub: "건당 과금" },
              { value: "~10초", label: "페이지당 변환", sub: "AI 비전 엔진" },
              { value: "99%+", label: "한글 인식률", sub: "한글 특화" },
            ].map((s, i) => (
              <div key={i} style={{ textAlign: "center" }}>
                <div style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 800, fontSize: 28, color: "#F59E0B", letterSpacing: "-0.02em" }}>{s.value}</div>
                <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 13, fontWeight: 500, marginTop: 4 }}>{s.label}</div>
                <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 11, marginTop: 2 }}>{s.sub}</div>
              </div>
            ))}
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section style={{ padding: "100px 24px", background: "#06060c" }}>
          <div style={{ maxWidth: 900, margin: "0 auto" }}>
            <h2 style={{ textAlign: "center", color: "#fff", fontWeight: 800, fontSize: 32, letterSpacing: "-0.02em", marginBottom: 12 }}>
              3단계로 끝
            </h2>
            <p style={{ textAlign: "center", color: "rgba(255,255,255,0.4)", fontSize: 16, marginBottom: 64 }}>
              복잡한 설정 없이, 파일만 올리면 됩니다
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 24 }}>
              {[
                { icon: <Upload size={24} />, num: "01", title: "PDF 업로드", desc: "변환할 PDF 파일을 드래그 앤 드롭으로 올려주세요", color: "#3b82f6" },
                { icon: <Zap size={24} />, num: "02", title: "AI가 분석·변환", desc: "AI가 페이지별로 텍스트 구조를 분석합니다", color: "#F59E0B" },
                { icon: <Download size={24} />, num: "03", title: "EPUB 다운로드", desc: "변환된 전자책을 미리보기 후 다운로드하세요", color: "#22c55e" },
              ].map((step, i) => (
                <div key={i} style={{ padding: 32, borderRadius: 16, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", position: "relative", overflow: "hidden" }}>
                  <div style={{ position: "absolute", top: -20, right: -10, fontFamily: "'Outfit'", fontWeight: 900, fontSize: 100, color: "rgba(255,255,255,0.02)", lineHeight: 1 }}>{step.num}</div>
                  <div style={{ width: 48, height: 48, borderRadius: 12, background: `${step.color}15`, display: "flex", alignItems: "center", justifyContent: "center", color: step.color, marginBottom: 20 }}>
                    {step.icon}
                  </div>
                  <h3 style={{ color: "#fff", fontWeight: 700, fontSize: 18, marginBottom: 8 }}>{step.title}</h3>
                  <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 14, lineHeight: 1.6 }}>{step.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* BEFORE / AFTER */}
        <section style={{ padding: "100px 24px", background: "linear-gradient(180deg, #06060c 0%, #0a0a14 100%)" }}>
          <div style={{ maxWidth: 800, margin: "0 auto" }}>
            <h2 style={{ textAlign: "center", color: "#fff", fontWeight: 800, fontSize: 32, letterSpacing: "-0.02em", marginBottom: 12 }}>
              이런 차이가 납니다
            </h2>
            <p style={{ textAlign: "center", color: "rgba(255,255,255,0.4)", fontSize: 16, marginBottom: 56 }}>
              모바일에서 PDF를 읽어본 적 있다면, 이 고통을 아실 겁니다
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
              {/* Before */}
              <div style={{ borderRadius: 16, overflow: "hidden", border: "1px solid rgba(255,255,255,0.08)" }}>
                <div style={{ padding: "12px 16px", background: "rgba(239,68,68,0.1)", borderBottom: "1px solid rgba(239,68,68,0.15)", display: "flex", alignItems: "center", gap: 8 }}>
                  <X size={16} color="#ef4444" />
                  <span style={{ color: "#ef4444", fontSize: 13, fontWeight: 600 }}>PDF (모바일)</span>
                </div>
                <div style={{ padding: 16, background: "rgba(255,255,255,0.02)" }}>
                  <div style={{ background: "#fff", borderRadius: 4, padding: "10px 12px" }}>
                    <div style={{ fontSize: 8, color: "#111", fontWeight: 700, marginBottom: 4 }}>제1장 어른들의 세계</div>
                    <div style={{ fontSize: 5.8, color: "#444", lineHeight: 1.55, wordBreak: "keep-all" }}>
                      내가 여섯 살 때의 일이다. 한번은 원시림에 관한 책에서 놀라운 그림을 본 적이 있다. 그 그림은 보아뱀이 맹수를 삼키고 있는 모습이었다. 나는 이 모험담에 큰 감명을 받아 색연필로 내 최초의 그림을 그렸다. 나의 그림 제1호였다. 나는 이 걸작을 어른들에게 보여주며 무섭지 않으냐고 물었다. 어른들의 대답은 이랬다. &quot;모자가 왜 무섭니?&quot; 내 그림은 모자를 그린 것이 아니었다. 보아뱀이 코끼리를 소화시키고 있는 그림이었다. 어른들이 알아볼 수 있도록 보아뱀의 속을 그려 보여주었다. 어른들은 늘 설명을 요구했다. 나의 그림 제2호를 보고서 어른들은 나에게 보아뱀 그림 같은 건 집어치우고 차라리 지리, 역사, 산수, 문법에 관심을 쏟으라고 충고했다. 그래서 나는 여섯 살에 화가라는 훌륭한 직업을 포기하고 말았다. 나는 비행기 조종하는 법을 배워서 세계 곳곳을 비행했다. 지리학은 실제로 큰 도움이 되었다. 한눈에 중국과 아리조나를 구별할 수 있었으니까. 밤에 길을 잃었을 때 그런 지식은 아주 유용한 것이다. 나는 살아오면서 수많은 중요한 사람들과 만났다. 어른들 속에서 오랫동안 살아왔다. 나는 그들을 아주 가까이서 보았다. 그래도 내 생각은 별로 달라지지 않았다. 이해력이 좀 있어 보이는 어른을 만나면 언제나 소중히 간직해 오던 나의 그림 제1호를 꺼내 보여주어 시험해 보았다. 진정한 이해력이 있는 사람인지를 알고 싶었기 때문이다. 그러나 돌아오는 대답은 언제나 한결같았다. &quot;그건 모자잖아.&quot; 그러면 나는 그 사람에게 보아뱀 이야기도, 원시림 이야기도, 별 이야기도 하지 않았다. 그 사람이 알아들을 수 있는 수준에 맞추어 브리지, 골프, 정치, 넥타이 이야기를 했다. 그러면 그 어른은 아주 분별력 있는 사람을 만났다고 매우 흐뭇해하는 것이었다.
                    </div>
                  </div>
                  <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, textAlign: "center", marginTop: 12 }}>
                    확대하고 좌우로 스크롤하고...<br />읽다가 포기 😤
                  </p>
                </div>
              </div>
              {/* After */}
              <div style={{ borderRadius: 16, overflow: "hidden", border: "1px solid rgba(34,197,94,0.2)" }} className="glow-amber">
                <div style={{ padding: "12px 16px", background: "rgba(34,197,94,0.08)", borderBottom: "1px solid rgba(34,197,94,0.15)", display: "flex", alignItems: "center", gap: 8 }}>
                  <Check size={16} color="#22c55e" />
                  <span style={{ color: "#22c55e", fontSize: 13, fontWeight: 600 }}>EPUB (TeXTREME)</span>
                </div>
                <div style={{ padding: 20, background: "rgba(255,255,255,0.02)", minHeight: 280 }}>
                  <div style={{ background: "#1a1410", borderRadius: 8, padding: 16 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "#EEE4E1", marginBottom: 12, lineHeight: 1.3 }}>
                      제1장 어른들의 세계
                    </div>
                    <div style={{ fontSize: 12, color: "#C4A882", lineHeight: 1.8 }}>
                      내가 여섯 살 때의 일이다. 한번은 원시림에 관한 책에서 놀라운 그림을 본 적이 있다. 그 그림은 보아뱀이 맹수를 삼키고 있는 모습이었다...
                    </div>
                  </div>
                  <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, textAlign: "center", marginTop: 16 }}>
                    글자 크기 자유 조절 · 편하게 읽기 ✨
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* FEATURES */}
        <section style={{ padding: "100px 24px", background: "#06060c" }}>
          <div style={{ maxWidth: 900, margin: "0 auto" }}>
            <h2 style={{ textAlign: "center", color: "#fff", fontWeight: 800, fontSize: 32, letterSpacing: "-0.02em", marginBottom: 56 }}>
              왜 텍스트림 PDF 변환기인가
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 20 }}>
              {[
                { icon: <Type size={22} />, title: "한글 특화", desc: "한글 조사·어미·띄어쓰기를 정확히 인식하는 AI 엔진" },
                { icon: <BookOpen size={22} />, title: "구조 보존", desc: "제목·본문·인용·리스트 구분까지 자동 분석" },
                { icon: <Smartphone size={22} />, title: "모바일 최적화", desc: "화면 크기에 맞춰 글이 자동으로 리플로우" },
                { icon: <Globe size={22} />, title: "어디서든 변환", desc: "PC·태블릿·스마트폰, 어디서든 PDF를 EPUB으로" },
              ].map((f, i) => (
                <div key={i} style={{ padding: 24, borderRadius: 14, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                  <div style={{ color: "#F59E0B", marginBottom: 14 }}>{f.icon}</div>
                  <h4 style={{ color: "#fff", fontWeight: 700, fontSize: 15, marginBottom: 6 }}>{f.title}</h4>
                  <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, lineHeight: 1.6 }}>{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* PRICING */}
        <section style={{ padding: "100px 24px", background: "radial-gradient(ellipse 80% 50% at 50% 100%, rgba(245,158,11,0.04) 0%, transparent 60%), #06060c" }}>
          <div style={{ maxWidth: 900, margin: "0 auto" }}>
            <h2 style={{ textAlign: "center", color: "#fff", fontWeight: 800, fontSize: 32, letterSpacing: "-0.02em", marginBottom: 12 }}>
              심플한 가격
            </h2>
            <p style={{ textAlign: "center", color: "rgba(255,255,255,0.4)", fontSize: 16, marginBottom: 48 }}>
              구독 없이, 변환할 때만 결제하세요
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 16 }}>
              {PRICING.map((p, i) => (
                <div key={i} style={{
                  padding: 28, borderRadius: 16, textAlign: "center", position: "relative", overflow: "hidden",
                  background: p.popular ? "linear-gradient(135deg, rgba(245,158,11,0.1), rgba(245,158,11,0.03))" : "rgba(255,255,255,0.02)",
                  border: p.popular ? "1px solid rgba(245,158,11,0.3)" : "1px solid rgba(255,255,255,0.06)",
                }}>
                  {p.popular && (
                    <div style={{ position: "absolute", top: 12, right: -28, background: "#F59E0B", color: "#000", fontSize: 10, fontWeight: 700, padding: "3px 32px", transform: "rotate(45deg)" }}>인기</div>
                  )}
                  <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 14, fontWeight: 600, marginBottom: 8 }}>{p.pages}</div>
                  <div style={{ fontFamily: "'Outfit'", fontWeight: 800, fontSize: 28, color: "#fff", marginBottom: 4 }}>{p.price}</div>
                  <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 12 }}>{p.per}</div>
                </div>
              ))}
            </div>
            <p style={{ textAlign: "center", color: "rgba(255,255,255,0.25)", fontSize: 12, marginTop: 24 }}>
              * 10페이지 무료 미리보기 제공 · 만족하신 후 결제
            </p>
          </div>
        </section>

        {/* CTA */}
        <section style={{ padding: "80px 24px 48px", background: "#06060c", textAlign: "center" }}>
          <button onClick={() => fileInputRef.current?.click()}
            style={{ padding: "16px 40px", borderRadius: 14, background: "linear-gradient(135deg, #F59E0B, #D97706)", color: "#000", fontWeight: 800, fontSize: 18, border: "none", cursor: "pointer", boxShadow: "0 0 40px rgba(245,158,11,0.2)" }}>
            지금 변환하기 <ArrowRight size={20} style={{ display: "inline", verticalAlign: "middle", marginLeft: 8 }} />
          </button>
          <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 13, marginTop: 16 }}>
            회원가입 필요 없음 · 10페이지 무료
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
                <span style={{ fontSize: 10, color: isPwaInstalled ? "rgba(34,197,94,0.6)" : "rgba(255,255,255,0.4)", fontWeight: 500 }}>
                  {isPwaInstalled ? "설치 완료" : "웹앱으로 설치"}
                </span>
                <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-0.01em" }}>
                  {isPwaInstalled ? "TeXTREME ✓" : "TeXTREME Web App"}
                </span>
              </div>
            </button>

            <div style={{
              display: "flex", alignItems: "center", gap: 10, padding: "12px 24px", borderRadius: 12,
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.06)",
              color: "rgba(255,255,255,0.3)", cursor: "default",
            }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", fontWeight: 500 }}>Google Play</span>
                <span style={{ fontSize: 15, fontWeight: 700 }}>곧 출시</span>
              </div>
            </div>
          </div>
        </section>

        {/* FOOTER */}
        <footer style={{ padding: "32px 24px", borderTop: "1px solid rgba(255,255,255,0.05)", background: "#06060c" }}>
          <div style={{ maxWidth: 900, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Zap size={16} color="#F59E0B" />
              <span style={{ fontFamily: "'Outfit'", fontWeight: 700, fontSize: 14, color: "rgba(255,255,255,0.4)" }}>TeXTREME</span>
            </div>
            <div style={{ color: "rgba(255,255,255,0.2)", fontSize: 12 }}>
              © 2026 텍스트림 · 사업자등록번호 653-33-01529
            </div>
          </div>
        </footer>
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
              <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 12 }}>{filePages}페이지 추정</div>
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
              <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, marginTop: -4 }}>%</span>
            </div>
          </div>

          <p style={{ color: "#F59E0B", fontSize: 15, fontWeight: 600, marginBottom: 4 }}>
            {progress < 100 ? "AI가 페이지를 분석하고 있습니다" : "변환 완료!"}
          </p>
          <p style={{ color: "rgba(255,255,255,0.35)", fontSize: 13, marginBottom: 32 }}>
            {currentPage}/{filePages} 페이지 처리됨
          </p>

          <div style={{ height: 4, borderRadius: 4, background: "rgba(255,255,255,0.06)", overflow: "hidden", marginBottom: 32 }}>
            <div style={{ height: "100%", borderRadius: 4, background: "linear-gradient(90deg, #F59E0B, #FBBF24)", transition: "width 0.3s", width: `${progress}%` }} />
          </div>

          {/* Live extraction feed */}
          <div style={{ borderRadius: 12, border: "1px solid rgba(255,255,255,0.06)", overflow: "hidden" }}>
            <div style={{ padding: "10px 16px", background: "rgba(255,255,255,0.02)", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", animation: "pulse-ring 2s infinite" }} />
              <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, fontWeight: 600 }}>실시간 추출</span>
            </div>
            <div style={{ padding: 12, maxHeight: 180, overflow: "hidden" }}>
              {extractedTexts.map((item, i) => (
                <div key={i} className={i === extractedTexts.length - 1 ? "slide-text" : ""}
                  style={{ padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.03)", display: "flex", gap: 10 }}>
                  <span style={{ color: "#F59E0B", fontSize: 11, fontWeight: 600, flexShrink: 0 }}>p.{item.page}</span>
                  <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.text}</span>
                </div>
              ))}
              {extractedTexts.length === 0 && (
                <p style={{ color: "rgba(255,255,255,0.2)", fontSize: 12, textAlign: "center", padding: 20 }}>추출 대기 중...</p>
              )}
            </div>
          </div>

          <button onClick={reset} style={{ marginTop: 24, padding: "8px 20px", borderRadius: 8, background: "none", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.4)", fontSize: 13, cursor: "pointer" }}>
            취소
          </button>
        </div>
      </div>
    )
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Preview View
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━
  return (
    <div style={{ fontFamily: "'Noto Sans KR', sans-serif", height: "100vh", display: "flex", flexDirection: "column", background: rt.bg }}>
      <style>{globalStyles}</style>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", borderBottom: `1px solid ${rt.border}`, background: rt.card, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={reset} style={{ background: "none", border: "none", cursor: "pointer", color: rt.muted, display: "flex", alignItems: "center", gap: 4 }}>
            <ChevronLeft size={18} />
            <span style={{ fontSize: 13 }}>뒤로</span>
          </button>
          <span style={{ fontSize: 13, fontWeight: 600, color: rt.text }}>{fileName || "변환된 EPUB"}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, color: rt.muted }}>{previewPage + 1}/{SAMPLE_PAGES.length}</span>
          <button onClick={() => setShowReaderSettings(!showReaderSettings)}
            style={{ background: showReaderSettings ? "rgba(245,158,11,0.15)" : "none", border: "none", cursor: "pointer", padding: 6, borderRadius: 8, color: showReaderSettings ? "#F59E0B" : rt.muted }}>
            <Settings2 size={18} />
          </button>
        </div>
      </div>

      {showReaderSettings && (
        <div style={{ padding: 16, borderBottom: `1px solid ${rt.border}`, background: rt.card, flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16, marginBottom: 16 }}>
            {([
              { key: "dark" as ReaderTheme, icon: <Moon size={16} />, label: "어두운" },
              { key: "light" as ReaderTheme, icon: <SunIcon size={16} />, label: "밝은" },
              { key: "sepia" as ReaderTheme, icon: <BookOpen size={16} />, label: "세피아" },
            ]).map(t => (
              <button key={t.key} onClick={() => setReaderTheme(t.key)}
                style={{
                  display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 10,
                  border: readerTheme === t.key ? "1px solid #F59E0B" : `1px solid ${rt.border}`,
                  background: readerTheme === t.key ? "rgba(245,158,11,0.08)" : "transparent",
                  color: readerTheme === t.key ? "#F59E0B" : rt.muted, fontSize: 13, cursor: "pointer",
                }}>
                {t.icon} {t.label}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16 }}>
            <span style={{ fontSize: 12, color: rt.muted }}>글자 크기</span>
            <button onClick={() => setReaderFontSize(s => Math.max(14, s - 2))}
              style={{ width: 32, height: 32, borderRadius: 8, border: `1px solid ${rt.border}`, background: "none", color: rt.muted, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Minus size={14} />
            </button>
            <span style={{ fontSize: 13, color: rt.text, fontFamily: "monospace", width: 40, textAlign: "center" }}>{readerFontSize}px</span>
            <button onClick={() => setReaderFontSize(s => Math.min(28, s + 2))}
              style={{ width: 32, height: 32, borderRadius: 8, border: `1px solid ${rt.border}`, background: "none", color: rt.muted, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Plus size={14} />
            </button>
          </div>
        </div>
      )}

      <div style={{ flex: 1, overflow: "auto", padding: "32px 24px" }}>
        <div style={{ maxWidth: 600, margin: "0 auto" }}>
          {SAMPLE_PAGES[previewPage] && (
            <>
              <h2 style={{ fontSize: readerFontSize * 1.4, fontWeight: 800, color: rt.text, lineHeight: 1.35, marginBottom: 24, letterSpacing: "-0.01em" }}>
                {SAMPLE_PAGES[previewPage].title}
              </h2>
              {SAMPLE_PAGES[previewPage].paragraphs.map((p, i) => (
                <p key={i} style={{ fontSize: readerFontSize, lineHeight: 1.85, color: rt.text, marginBottom: "1em", textIndent: "1em", wordBreak: "keep-all" }}>
                  {p}
                </p>
              ))}
            </>
          )}

          <div style={{ margin: "48px 0", padding: 32, borderRadius: 16, border: `1px dashed ${rt.border}`, textAlign: "center" }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>📖</div>
            <p style={{ color: rt.text, fontWeight: 700, fontSize: 16, marginBottom: 8 }}>무료 미리보기는 여기까지</p>
            <p style={{ color: rt.muted, fontSize: 13, marginBottom: 24, lineHeight: 1.6 }}>
              전체 {filePages}페이지를 EPUB으로 다운로드하려면<br />결제가 필요합니다
            </p>
            <button style={{
              padding: "14px 32px", borderRadius: 12,
              background: "linear-gradient(135deg, #F59E0B, #D97706)",
              color: "#000", fontWeight: 700, fontSize: 15, border: "none", cursor: "pointer",
              boxShadow: "0 0 30px rgba(245,158,11,0.15)",
            }}>
              <Download size={16} style={{ display: "inline", verticalAlign: "middle", marginRight: 8 }} />
              EPUB 다운로드
            </button>
            <p style={{ color: rt.muted, fontSize: 11, marginTop: 12 }}>결제 즉시 .epub 파일 다운로드</p>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16, padding: "12px 24px", borderTop: `1px solid ${rt.border}`, background: rt.card, flexShrink: 0 }}>
        <button onClick={() => setPreviewPage(p => Math.max(0, p - 1))} disabled={previewPage === 0}
          style={{ padding: "8px 16px", borderRadius: 8, border: `1px solid ${rt.border}`, background: "none", color: previewPage === 0 ? rt.border : rt.muted, cursor: previewPage === 0 ? "default" : "pointer", fontSize: 13 }}>
          <ChevronLeft size={16} style={{ display: "inline", verticalAlign: "middle" }} /> 이전
        </button>
        <button onClick={() => setPreviewPage(p => Math.min(SAMPLE_PAGES.length - 1, p + 1))} disabled={previewPage === SAMPLE_PAGES.length - 1}
          style={{ padding: "8px 16px", borderRadius: 8, border: `1px solid ${rt.border}`, background: "none", color: previewPage === SAMPLE_PAGES.length - 1 ? rt.border : rt.muted, cursor: previewPage === SAMPLE_PAGES.length - 1 ? "default" : "pointer", fontSize: 13 }}>
          다음 <ChevronRight size={16} style={{ display: "inline", verticalAlign: "middle" }} />
        </button>
      </div>
    </div>
  )
}
