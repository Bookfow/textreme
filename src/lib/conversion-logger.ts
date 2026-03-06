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
  paymentId: string;
  paymentAmount: number;
  referrer: string;
  deviceType: string;
  inputTokens: number;
  outputTokens: number;
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
