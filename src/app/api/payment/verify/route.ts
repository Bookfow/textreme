import { NextRequest, NextResponse } from "next/server"

export async function POST(req: NextRequest) {
  try {
    const { paymentId, expectedAmount } = await req.json()

    // 1. 포트원 API로 Access Token 발급
    const tokenRes = await fetch("https://api.portone.io/login/api-secret", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiSecret: process.env.PORTONE_API_SECRET }),
    })

    if (!tokenRes.ok) {
      return NextResponse.json(
        { error: "포트원 인증 실패" },
        { status: 500 }
      )
    }

    const { accessToken } = await tokenRes.json()

    // 2. 포트원에서 결제 정보 조회
    const paymentRes = await fetch(
      `https://api.portone.io/payments/${encodeURIComponent(paymentId)}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    )

    if (!paymentRes.ok) {
      return NextResponse.json(
        { error: "결제 정보 조회 실패" },
        { status: 500 }
      )
    }

    const payment = await paymentRes.json()

    // 3. 결제 상태 확인
    if (payment.status !== "PAID") {
      return NextResponse.json(
        { error: "결제가 완료되지 않았습니다", status: payment.status },
        { status: 400 }
      )
    }

    // 4. 금액 검증 (우리가 계산한 금액과 실제 결제 금액이 같은지)
    if (payment.amount.total !== expectedAmount) {
      return NextResponse.json(
        { error: "결제 금액이 일치하지 않습니다" },
        { status: 400 }
      )
    }

    // 5. 검증 통과!
    return NextResponse.json({
      success: true,
      paymentId: payment.id,
      amount: payment.amount.total,
      method: payment.method?.type || "unknown",
    })

  } catch (error) {
    console.error("결제 검증 에러:", error)
    return NextResponse.json(
      { error: "서버 에러가 발생했습니다" },
      { status: 500 }
    )
  }
}
