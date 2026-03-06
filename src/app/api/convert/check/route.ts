export const runtime = 'nodejs';

import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ available: false, reason: 'api_error', message: '서버 점검 중입니다. 잠시 후 다시 시도해주세요.' });
    }

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'hi' }] }],
          generationConfig: { maxOutputTokens: 1 },
        }),
      }
    );

    if (res.status === 429) {
      const body = await res.json().catch(() => ({}));
      const errorMsg = body?.error?.message || '';
      const isDaily = errorMsg.toLowerCase().includes('per day') || errorMsg.toLowerCase().includes('daily');

      if (isDaily) {
        // 일일 한도: 자정 PT = 한국시간 오후 5시 (서머타임 시 오후 4시)
        // 다음 리셋 시각 계산 (KST 기준)
        const now = new Date();
        const kstHour = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Seoul' })).getHours();
        
        let resetTimeKST: string;
        if (kstHour < 17) {
          resetTimeKST = '오늘 오후 5시';
        } else {
          resetTimeKST = '내일 오후 5시';
        }

        return NextResponse.json({
          available: false,
          reason: 'daily_limit',
          resetTime: resetTimeKST,
        });
      } else {
        // 분당 한도: retry-after 확인
        const retryAfter = res.headers.get('retry-after');
        let waitMinutes = 2;
        if (retryAfter) {
          waitMinutes = Math.max(1, Math.ceil(parseInt(retryAfter) / 60));
        }

        return NextResponse.json({
          available: false,
          reason: 'rate_limit',
          waitMinutes: waitMinutes,
        });
      }
    }

    if (!res.ok) {
      return NextResponse.json({
        available: false,
        reason: 'api_error',
        message: '서버 점검 중입니다. 잠시 후 다시 시도해주세요.',
      });
    }

    return NextResponse.json({ available: true });
  } catch (err: any) {
    console.error('Gemini check error:', err);
    return NextResponse.json({
      available: false,
      reason: 'network_error',
      message: '서버 연결에 실패했습니다. 잠시 후 다시 시도해주세요.',
    });
  }
}
