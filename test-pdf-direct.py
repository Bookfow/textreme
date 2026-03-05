# TeXTREME - Gemini PDF direct test
# python test-pdf-direct.py

import os, sys, json, time, base64, requests
from pathlib import Path

PROJECT_DIR = Path("C:/Users/user/textreme")
TEST_PDF = PROJECT_DIR / "convert test" / "test PDF" / "금융보안 프로세스 A to Z(10p).pdf"

env_content = (PROJECT_DIR / ".env.local").read_text(encoding="utf-8")
for line in env_content.splitlines():
    if "=" in line and not line.strip().startswith("#"):
        k, v = line.split("=", 1)
        os.environ[k.strip()] = v.strip()

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
GEMINI_MODEL = "gemini-2.5-flash"
GEMINI_URL = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent?key={GEMINI_API_KEY}"

PROMPT = (
    "당신은 한국어 PDF 페이지 이미지를 분석하여 텍스트를 구조화된 JSON으로 추출하는 전문가입니다.\n\n"
    '출력 JSON 형식:\n{"elements": [\n'
    '  {"type": "heading", "level": 1, "text": "..."},\n'
    '  {"type": "paragraph", "text": "..."},\n'
    '  {"type": "quote", "text": "..."},\n'
    '  {"type": "list_item", "text": "..."},\n'
    '  {"type": "image_placeholder", "description": "..."},\n'
    '  {"type": "caption", "text": "..."}\n]}\n\n'
    "핵심 원칙: 페이지에 보이는 읽을 수 있는 모든 텍스트를 빠짐없이 추출하는 것이 최우선입니다.\n\n"
    "텍스트 추출 규칙:\n"
    "- 배경색이 있는 박스, 색상 카드, 말풍선 안의 텍스트 -> paragraph 또는 quote로 추출\n"
    "- 표(table) 안의 텍스트 -> paragraph로 추출 (행 단위로)\n"
    "- 글머리 기호, 번호 목록 -> list_item으로 추출\n"
    "- 강조 박스, 팁 박스, 인용 영역 -> quote로 추출\n"
    "- 슬라이드형 PDF의 모든 텍스트 -> 빠짐없이 추출\n"
    "- 제목은 크기/굵기로 heading level(1~3) 부여\n\n"
    "image_placeholder 사용 (아래 경우만 해당):\n"
    "- 실제 사진 (인물, 풍경, 제품 등)\n"
    "- 다른 앱/웹사이트의 스크린샷이 통째로 캡처된 이미지\n"
    "- 차트, 그래프, 플로우차트 등 데이터 시각화 도표\n"
    "- 아이콘, 로고, 일러스트레이션\n\n"
    "제외 항목: 페이지 번호, 머리글, 꼬리글\n"
    "출력: JSON만 반환. 마크다운 코드블록 사용 금지."
)


def test_page(pdf_base64, page_num):
    body = {
        "contents": [{
            "parts": [
                {"text": PROMPT + f"\n\n이 PDF의 {page_num}페이지만 분석하여 텍스트를 추출해주세요. 다른 페이지는 무시하세요."},
                {"inline_data": {"mime_type": "application/pdf", "data": pdf_base64}}
            ]
        }],
        "generationConfig": {"temperature": 0.1, "maxOutputTokens": 8192}
    }

    start = time.time()
    resp = requests.post(GEMINI_URL, json=body, timeout=120)
    elapsed = int((time.time() - start) * 1000)

    if not resp.ok:
        print(f"  X p{page_num}: HTTP {resp.status_code} - {resp.text[:200]}")
        return

    data = resp.json()
    candidate = data.get("candidates", [{}])[0]
    finish = candidate.get("finishReason", "?")
    text = candidate.get("content", {}).get("parts", [{}])[0].get("text", "")
    usage = data.get("usageMetadata", {})

    print(f"\n=== Page {page_num} ({len(text)} chars, {elapsed}ms, finish: {finish}) ===")
    print(text[:600])
    if len(text) > 600:
        print(f"... ({len(text) - 600} more)")
    print(f"  tokens: in={usage.get('promptTokenCount', '?')} out={usage.get('candidatesTokenCount', '?')}")


def main():
    if not TEST_PDF.exists():
        print(f"X PDF not found: {TEST_PDF}")
        sys.exit(1)

    pdf_bytes = TEST_PDF.read_bytes()
    pdf_base64 = base64.b64encode(pdf_bytes).decode("ascii")
    print(f"PDF direct test")
    print(f"  file: {TEST_PDF.name} ({len(pdf_bytes) // 1024} KB)")
    print(f"  base64: {len(pdf_base64) // 1024} KB")

    for page in [1, 2, 3]:
        test_page(pdf_base64, page)

    print(f"\nDone")


if __name__ == "__main__":
    main()
