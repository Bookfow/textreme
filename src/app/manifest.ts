import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'TeXTREME ???œê? PDFë¥??„ìì±…ìœ¼ë¡?,
    short_name: 'TeXTREME',
    description: 'AIê°€ ?œê? PDFë¥??„ë²½??EPUB ?„ìì±…ìœ¼ë¡?ë³€?˜í•©?ˆë‹¤',
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
