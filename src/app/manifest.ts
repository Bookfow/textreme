import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'TeXTREME - PDF to EPUB',
    short_name: 'TeXTREME',
    description: 'AI PDF to EPUB converter and EPUB/TXT/DOCX viewer',
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
    file_handlers: [
      {
        action: '/viewer',
        accept: {
          'application/epub+zip': ['.epub'],
          'text/plain': ['.txt'],
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
        },
      },
    ],
  }
}
