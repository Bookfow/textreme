import { NextRequest, NextResponse } from "next/server"

export async function POST(req: NextRequest) {
  try {
    const { paymentId, reason } = await req.json()

    if (!paymentId) {
      return NextResponse.json(
        { error: "결제 ID가 필요합니다" },
        { status: 400 }
      )
    }

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

    // 2. 결제 상태 확인 (이미 취소된 건인지 체크)
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

    if (payment.status === "CANCELLED") {
      return NextResponse.json(
        { error: "이미 취소된 결제입니다" },
        { status: 400 }
      )
    }

    if (payment.status !== "PAID") {
      return NextResponse.json(
        { error: "취소할 수 없는 결제 상태입니다", status: payment.status },
        { status: 400 }
      )
    }

    // 3. 포트원 결제 취소 요청
    const cancelRes = await fetch(
      `https://api.portone.io/payments/${encodeURIComponent(paymentId)}/cancel`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          reason: reason || "변환 실패로 인한 환불",
        }),
      }
    )

    if (!cancelRes.ok) {
      const errorData = await cancelRes.json().catch(() => ({}))
      console.error("포트원 취소 응답:", errorData)
      return NextResponse.json(
        { error: "환불 처리에 실패했습니다: " + (errorData.message || cancelRes.status) },
        { status: 500 }
      )
    }

    const cancelData = await cancelRes.json()

    // 4. 환불 성공
    return NextResponse.json({
      success: true,
      paymentId: paymentId,
      cancelledAmount: payment.amount?.total || 0,
      cancellation: cancelData.cancellation || null,
    })

  } catch (error) {
    console.error("환불 처리 에러:", error)
    return NextResponse.json(
      { error: "서버 에러가 발생했습니다" },
      { status: 500 }
    )
  }
}
