// src/lib/conversion-logger.ts
// 변환 완료 후 호출하여 로그를 서버에 전송

export interface ConversionResult {
  fileName: string;
  fileSizeBytes: number;
  totalPages: number;
  successfulPages: number;
  failedPages: number;
  batchCount: number;
  durationSeconds: number;
  costWon: number;
  status: 'success' | 'partial' | 'failed';
  imagesExtracted: number;
  masksDetected: number;
  jpegCompressedPages: number;
  failedPageNumbers: number[];
  errorMessages: string[];
}

export async function logConversion(result: ConversionResult): Promise<boolean> {
  try {
    const res = await fetch('/api/admin/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(result),
    });
    return res.ok;
  } catch (err) {
    console.error('Failed to log conversion:', err);
    return false;
  }
}
