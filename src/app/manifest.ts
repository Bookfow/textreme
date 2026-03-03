import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'TeXTREME — 한글 PDF를 전자책으로',
    short_name: 'TeXTREME',
    description: 'AI가 한글 PDF를 완벽한 EPUB 전자책으로 변환합니다',
    start_url: '/',
    display: 'standalone',
    background_color: '#06060c',
    theme_color: '#F59E0B',
    orientation: 'portrait-primary',
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
