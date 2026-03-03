'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { FileText, Upload, Loader2 } from 'lucide-react'
import EpubViewerLite from '@/components/epub-viewer-lite'
import { convertTxtToEpub, convertDocxToEpub } from '@/lib/text-to-epub'

type ViewerState = 'idle' | 'converting' | 'viewing'

export default function ViewerPage() {
  const [state, setState] = useState<ViewerState>('idle')
  const [epubUrl, setEpubUrl] = useState<string | null>(null)
  const [fileName, setFileName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const launchHandled = useRef(false)

  const cleanup = useCallback(() => {
    if (epubUrl) URL.revokeObjectURL(epubUrl)
  }, [epubUrl])

  const handleFile = useCallback(async (file: File) => {
    setError(null)
    cleanup()

    const name = file.name
    const ext = name.split('.').pop()?.toLowerCase() || ''
    setFileName(name)

    // EPUB → 바로 뷰어
    if (ext === 'epub') {
      const url = URL.createObjectURL(file)
      setEpubUrl(url)
      setState('viewing')
      return
    }

    // TXT → 변환 후 뷰어
    if (ext === 'txt') {
      setState('converting')
      try {
        const text = await file.text()
        if (!text.trim()) throw new Error('빈 파일입니다.')
        const title = name.replace(/\.txt$/i, '')
        const blob = await convertTxtToEpub(text, title, '')
        const url = URL.createObjectURL(blob)
        setEpubUrl(url)
        setState('viewing')
      } catch (err) {
        setError(err instanceof Error ? err.message : '변환 실패')
        setState('idle')
      }
      return
    }

    // DOCX → 변환 후 뷰어
    if (ext === 'docx') {
      setState('converting')
      try {
        const arrayBuffer = await file.arrayBuffer()
        const title = name.replace(/\.docx$/i, '')
        const blob = await convertDocxToEpub(arrayBuffer, title, '')
        const url = URL.createObjectURL(blob)
        setEpubUrl(url)
        setState('viewing')
      } catch (err) {
        setError(err instanceof Error ? err.message : '변환 실패')
        setState('idle')
      }
      return
    }

    setError(`지원하지 않는 형식입니다: .${ext}\nEPUB, TXT, DOCX 파일만 열 수 있습니다.`)
  }, [cleanup])

  // PWA File Handling: OS에서 파일을 열면 launchQueue로 전달됨
  useEffect(() => {
    if (launchHandled.current) return
    if ('launchQueue' in window) {
      (window as any).launchQueue.setConsumer(async (launchParams: any) => {
        if (launchParams.files?.length > 0 && !launchHandled.current) {
          launchHandled.current = true
          const fileHandle = launchParams.files[0]
          const file = await fileHandle.getFile()
          handleFile(file)
        }
      })
    }
  }, [handleFile])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [handleFile])

  const handleBack = useCallback(() => {
    cleanup()
    setEpubUrl(null)
    setFileName('')
    setError(null)
    setState('idle')
  }, [cleanup])

  // ━━━ 뷰어 모드 ━━━
  if (state === 'viewing' && epubUrl) {
    return (
      <div style={{ width: '100vw', height: '100dvh', fontFamily: "'Noto Sans KR', system-ui, sans-serif" }}>
        <style>{`* { margin: 0; padding: 0; box-sizing: border-box; }`}</style>
        <EpubViewerLite
          epubUrl={epubUrl}
          onBack={handleBack}
        />
      </div>
    )
  }

  // ━━━ 파일 선택 / 변환 중 ━━━
  return (
    <div style={{
      minHeight: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      backgroundColor: '#1A1612',
      color: '#E8E0D8',
      fontFamily: '"Pretendard", system-ui, -apple-system, sans-serif',
    }}>
      {/* 로고 */}
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8, color: '#F59E0B' }}>
        TeXTREME
      </h1>
      <p style={{ fontSize: 14, color: '#A89A8E', marginBottom: 40 }}>
        EPUB · TXT · DOCX 뷰어
      </p>

      {/* 드래그앤드롭 영역 */}
      {state === 'idle' && (
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          style={{
            width: '100%',
            maxWidth: 420,
            padding: '48px 32px',
            borderRadius: 16,
            border: `2px dashed ${dragOver ? '#F59E0B' : '#2E2822'}`,
            backgroundColor: dragOver ? 'rgba(245,158,11,0.06)' : '#141110',
            cursor: 'pointer',
            textAlign: 'center',
            transition: 'all 0.2s',
          }}
        >
          <Upload style={{ width: 40, height: 40, margin: '0 auto 16px', display: 'block', color: dragOver ? '#F59E0B' : '#A89A8E' }} />
          <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
            파일을 드래그하거나 클릭하세요
          </p>
          <p style={{ fontSize: 13, color: '#A89A8E' }}>
            EPUB · TXT · DOCX 지원
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".epub,.txt,.docx"
            style={{ display: 'none' }}
            onChange={e => {
              const file = e.target.files?.[0]
              if (file) handleFile(file)
              e.target.value = ''
            }}
          />
        </div>
      )}

      {/* 변환 중 */}
      {state === 'converting' && (
        <div style={{ textAlign: 'center' }}>
          <Loader2 style={{ width: 40, height: 40, margin: '0 auto 16px', display: 'block', color: '#F59E0B', animation: 'spin 1s linear infinite' }} />
          <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>변환 중...</p>
          <p style={{ fontSize: 13, color: '#A89A8E' }}>{fileName}</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </div>
      )}

      {/* 에러 */}
      {error && (
        <div style={{
          marginTop: 20,
          padding: '12px 20px',
          borderRadius: 10,
          backgroundColor: 'rgba(239,68,68,0.08)',
          border: '1px solid rgba(239,68,68,0.2)',
          color: '#ef4444',
          fontSize: 13,
          textAlign: 'center',
          maxWidth: 420,
          whiteSpace: 'pre-line',
        }}>
          {error}
        </div>
      )}
    </div>
  )
}
