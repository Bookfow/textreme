'use client'

import { useState, useRef, useCallback } from 'react'

export default function TestPage() {
  const [status, setStatus] = useState('')
  const [progress, setProgress] = useState(0)
  const [logs, setLogs] = useState<string[]>([])
  const [converting, setConverting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const addLog = (msg: string) => {
    setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`])
  }

  const handleFile = useCallback(async (f: File) => {
    if (!f || !f.name.toLowerCase().endsWith('.pdf')) {
      alert('PDF 파일만 가능합니다')
      return
    }

    setConverting(true)
    setProgress(0)
    setLogs([])
    setStatus('PDF → 이미지 변환 중...')
    addLog(`파일: ${f.name} (${(f.size / 1024 / 1024).toFixed(1)}MB)`)

    try {
      const pdfjsLib = await import('pdfjs-dist')
      pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
      const arrayBuffer = await f.arrayBuffer()
      const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer, cMapUrl: 'https://unpkg.com/pdfjs-dist/cmaps/', cMapPacked: true }).promise
      const totalPages = pdfDoc.numPages
      addLog(`총 ${totalPages}페이지 감지`)

      const pageImages: { base64: string; mimeType: string }[] = []

      for (let i = 1; i <= totalPages; i++) {
        const page = await pdfDoc.getPage(i)
        const viewport = page.getViewport({ scale: 1.5 })
        const canvas = document.createElement('canvas')
        canvas.width = viewport.width
        canvas.height = viewport.height
        const ctx = canvas.getContext('2d')!
        await page.render({ canvasContext: ctx, viewport, canvas } as any).promise
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
        pageImages.push({ base64: dataUrl.split(',')[1], mimeType: 'image/jpeg' })
        canvas.remove()
        setProgress(Math.round((i / totalPages) * 15))
        setStatus(`이미지 변환 ${i}/${totalPages}`)
      }

      addLog('Gemini API 호출 시작...')
      setStatus('AI 텍스트 추출 중...')

      const title = f.name.replace(/\.pdf$/i, '')
      const response = await fetch('/api/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pages: pageImages, title }),
      })

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: '서버 오류' }))
        throw new Error(err.error || `HTTP ${response.status}`)
      }

      const reader = response.body?.getReader()
      if (!reader) throw new Error('스트림 없음')

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
              const pct = 15 + Math.round((data.percent / 100) * 75)
              setProgress(pct)
              setStatus(`추출 중 ${data.page}/${totalPages}`)
              const preview = data.text?.slice(0, 60) || '(빈 텍스트)'
              addLog(`p${data.page}: els=${data.debug?.elementCount || '?'} | ${preview}`)
              if (data.debug?.info) addLog(`  debug: ${data.debug.info.slice(0, 200)}`)
            } else if (data.type === 'status') {
              setStatus(data.message)
              addLog(data.message)
            } else if (data.type === 'complete') {
              setProgress(100)
              setStatus('변환 완료!')
              addLog(`완료! 비용: ₩${data.costKRW} (in:${data.totalInputTokens} out:${data.totalOutputTokens})`)

              if (data.epubBase64) {
                const binaryStr = atob(data.epubBase64)
                const bytes = new Uint8Array(binaryStr.length)
                for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i)
                const blob = new Blob([bytes], { type: 'application/epub+zip' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = title + '.epub'
                a.click()
                URL.revokeObjectURL(url)
                addLog('EPUB 다운로드 완료')
              }
            } else if (data.type === 'error') {
              throw new Error(data.message)
            }
          } catch (parseErr: any) {
            if (parseErr.message && !parseErr.message.includes('JSON')) throw parseErr
          }
        }
      }
    } catch (err: any) {
      setStatus(`오류: ${err.message}`)
      addLog(`ERROR: ${err.message}`)
    } finally {
      setConverting(false)
    }
  }, [])

  return (
    <div style={{ fontFamily: 'monospace', background: '#1a1a2e', color: '#eee', minHeight: '100vh', padding: 24 }}>
      <h1 style={{ fontSize: 20, marginBottom: 8 }}>⚡ TeXTREME 변환 테스트</h1>
      <p style={{ color: '#888', fontSize: 13, marginBottom: 24 }}>결제 없이 바로 변환. 디버그 로그 포함.</p>

      <div
        onClick={() => !converting && fileRef.current?.click()}
        style={{
          padding: '32px 24px', borderRadius: 12, textAlign: 'center', cursor: converting ? 'not-allowed' : 'pointer',
          border: '2px dashed rgba(245,158,11,0.4)', background: 'rgba(245,158,11,0.05)', marginBottom: 20,
        }}
      >
        {converting ? status : 'PDF 파일을 클릭하여 선택'}
        <input ref={fileRef} type="file" accept=".pdf" style={{ display: 'none' }}
          onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); e.target.value = '' }} />
      </div>

      {progress > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
            <span>{status}</span><span>{progress}%</span>
          </div>
          <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.1)' }}>
            <div style={{ height: '100%', borderRadius: 3, background: '#F59E0B', width: `${progress}%`, transition: 'width 0.3s' }} />
          </div>
        </div>
      )}

      <div style={{ background: '#0d0d1a', borderRadius: 8, padding: 16, maxHeight: 500, overflow: 'auto', fontSize: 12, lineHeight: 1.6 }}>
        <div style={{ color: '#666', marginBottom: 8 }}>로그</div>
        {logs.length === 0 ? (
          <div style={{ color: '#444' }}>PDF를 선택하면 로그가 여기에 표시됩니다</div>
        ) : (
          logs.map((log, i) => (
            <div key={i} style={{ color: log.includes('ERROR') ? '#ef4444' : log.includes('debug:') ? '#888' : '#ccc', borderBottom: '1px solid rgba(255,255,255,0.03)', padding: '2px 0' }}>
              {log}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
