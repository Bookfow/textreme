"""
TeXTREME 로컬 변환 테스트 스크립트 (Python)

폴더 구조:
  C:\\Users\\user\\textreme\\convert test\\test PDF\\   ← 테스트할 PDF
  C:\\Users\\user\\textreme\\convert test\\result EPUB\\ ← 결과 EPUB 저장

사용법:
  cd C:\\Users\\user\\textreme
  python test-convert.py                          (전체 페이지)
  python test-convert.py --pages 1-3              (특정 페이지만)
  python test-convert.py --raw                    (Gemini raw 응답 출력)
  python test-convert.py --pages 2-2 --raw        (2페이지만 + raw)

필요: pip install pymupdf requests
"""

import os, sys, json, time, base64, argparse, zipfile, io
from pathlib import Path

try:
    import fitz  # pymupdf
except ImportError:
    print("❌ pymupdf 설치 필요: pip install pymupdf")
    sys.exit(1)

try:
    import requests
except ImportError:
    print("❌ requests 설치 필요: pip install requests")
    sys.exit(1)

# ━━━ 경로 ━━━
PROJECT_DIR = Path(r"C:\Users\user\textreme")
TEST_PDF_DIR = PROJECT_DIR / "convert test" / "test PDF"
RESULT_EPUB_DIR = PROJECT_DIR / "convert test" / "result EPUB"
ENV_PATH = PROJECT_DIR / ".env.local"

# ━━━ .env.local에서 API 키 ━━━
def load_env():
    if not ENV_PATH.exists():
        print(f"❌ .env.local 없음: {ENV_PATH}")
        sys.exit(1)
    env = {}
    for line in ENV_PATH.read_text(encoding="utf-8").splitlines():
        if "=" in line and not line.strip().startswith("#"):
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()
    return env

env = load_env()
GEMINI_API_KEY = env.get("GEMINI_API_KEY", "")
if not GEMINI_API_KEY:
    print("❌ GEMINI_API_KEY가 없습니다")
    sys.exit(1)

GEMINI_MODEL = "gemini-2.5-flash"
GEMINI_URL = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent?key={GEMINI_API_KEY}"

# ━━━ 프롬프트 (route.ts와 동일) ━━━
SYSTEM_PROMPT = """당신은 한국어 PDF 페이지 이미지를 분석하여 텍스트를 구조화된 JSON으로 추출하는 전문가입니다.

출력 JSON 형식:
{"elements": [
  {"type": "heading", "level": 1, "text": "..."},
  {"type": "paragraph", "text": "..."},
  {"type": "quote", "text": "..."},
  {"type": "list_item", "text": "..."},
  {"type": "image_placeholder", "description": "..."},
  {"type": "caption", "text": "..."}
]}

★ 핵심 원칙: 페이지에 보이는 읽을 수 있는 모든 텍스트를 빠짐없이 추출하는 것이 최우선입니다.

텍스트 추출 규칙:
- 배경색이 있는 박스, 색상 카드, 말풍선 안의 텍스트 → paragraph 또는 quote로 추출
- 표(table) 안의 텍스트 → paragraph로 추출 (행 단위로)
- 글머리 기호, 번호 목록 → list_item으로 추출
- 강조 박스, 팁 박스, 인용 영역 → quote로 추출
- 슬라이드형 PDF의 모든 텍스트 → 빠짐없이 추출
- 제목은 크기/굵기로 heading level(1~3) 부여

image_placeholder 사용 (아래 경우만 해당):
- 실제 사진 (인물, 풍경, 제품 등)
- 다른 앱/웹사이트의 스크린샷이 통째로 캡처된 이미지
- 차트, 그래프, 플로우차트 등 데이터 시각화 도표
- 아이콘, 로고, 일러스트레이션
→ 단, 스크린샷/도표 바깥의 본문 텍스트는 반드시 추출하세요.
→ 스크린샷 안의 텍스트는 추출하지 마세요.

제외 항목: 페이지 번호, 머리글, 꼬리글
출력: JSON만 반환. 마크다운 코드블록 사용 금지."""


# ━━━ Gemini API 호출 ━━━
def extract_page(image_base64: str, page_num: int, show_raw: bool = False) -> dict:
    body = {
        "contents": [{
            "parts": [
                {"text": SYSTEM_PROMPT + "\n\n이 PDF 페이지의 모든 텍스트를 빠짐없이 추출해주세요."},
                {"inline_data": {"mime_type": "image/jpeg", "data": image_base64}}
            ]
        }],
        "generationConfig": {
            "temperature": 0.1,
            "maxOutputTokens": 8192,
        }
    }

    for attempt in range(4):
        resp = requests.post(GEMINI_URL, json=body, timeout=120)
        if resp.status_code == 429:
            wait = 3 * (attempt + 1)
            print(f"    ⏳ Rate limit, {wait}초 대기...")
            time.sleep(wait)
            continue
        if not resp.ok:
            raise Exception(f"Gemini {resp.status_code}: {resp.text[:200]}")
        break
    else:
        raise Exception("Rate limit 초과, 재시도 실패")

    data = resp.json()
    candidate = data.get("candidates", [{}])[0]
    finish_reason = candidate.get("finishReason", "UNKNOWN")
    text = ""
    if candidate.get("content", {}).get("parts"):
        text = candidate["content"]["parts"][0].get("text", "")
    usage = data.get("usageMetadata", {})

    if show_raw:
        print(f"\n━━━ Page {page_num} RAW ({len(text)} chars, finish: {finish_reason}) ━━━")
        print(text[:800])
        if len(text) > 800:
            print(f"... ({len(text) - 800} more chars)")

    if finish_reason in ("SAFETY", "RECITATION"):
        return {"elements": [], "tokens": usage, "finish": finish_reason, "raw_len": len(text)}

    # JSON 파싱
    parsed = None
    if text.strip():
        cleaned = text.strip()
        # ```json ... ``` 제거
        if cleaned.startswith("```"):
            lines = cleaned.split("\n")
            if lines[0].strip().startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].strip() == "```":
                lines = lines[:-1]
            cleaned = "\n".join(lines)

        try:
            obj = json.loads(cleaned)
            if isinstance(obj, list):
                parsed = {"elements": obj}
            elif isinstance(obj, dict) and "elements" in obj:
                parsed = obj
            else:
                parsed = {"elements": [obj]}
        except json.JSONDecodeError:
            # JSON 추출 시도
            import re
            m = re.search(r'\{[\s\S]*"elements"\s*:\s*\[[\s\S]*\]\s*\}', cleaned)
            if m:
                try:
                    parsed = json.loads(m.group(0))
                except:
                    pass

    if not parsed or not parsed.get("elements"):
        parsed = {"elements": []}

    # 빈 텍스트 제거
    parsed["elements"] = [
        el for el in parsed["elements"]
        if (el.get("type") == "image_placeholder" and el.get("description"))
        or (el.get("text", "").strip())
    ]

    return {"elements": parsed["elements"], "tokens": usage, "finish": finish_reason, "raw_len": len(text)}


# ━━━ PDF → 이미지 (pymupdf) ━━━
def pdf_to_images(pdf_path: str, page_range: str = None) -> list:
    doc = fitz.open(pdf_path)
    total = len(doc)

    if page_range:
        parts = page_range.split("-")
        start = int(parts[0])
        end = int(parts[1]) if len(parts) > 1 else start
        pages = [i for i in range(start, end + 1) if 1 <= i <= total]
    else:
        pages = list(range(1, total + 1))

    print(f"📄 {os.path.basename(pdf_path)}: {total}페이지 (처리: {len(pages)}페이지)")

    images = []
    for page_num in pages:
        page = doc[page_num - 1]  # 0-indexed
        # 1.5배 스케일 (해상도 높임)
        mat = fitz.Matrix(1.5, 1.5)
        pix = page.get_pixmap(matrix=mat)
        img_bytes = pix.tobytes("jpeg", jpg_quality=85)
        b64 = base64.b64encode(img_bytes).decode("ascii")
        images.append({
            "page_num": page_num,
            "base64": b64,
            "size_kb": len(img_bytes) // 1024,
        })
        print(f"  이미지 변환: {page_num}/{pages[-1]}", end="\r")

    print()
    doc.close()
    return images


# ━━━ EPUB 빌드 ━━━
def build_epub(results: list, title: str) -> bytes:
    def esc(s):
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        # mimetype (비압축)
        zf.writestr("mimetype", "application/epub+zip", compress_type=zipfile.ZIP_STORED)

        zf.writestr("META-INF/container.xml", """<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>""")

        manifest = "\n".join(f'    <item id="page{i}" href="page{i}.xhtml" media-type="application/xhtml+xml"/>' for i in range(len(results)))
        spine = "\n".join(f'    <itemref idref="page{i}"/>' for i in range(len(results)))

        zf.writestr("OEBPS/content.opf", f"""<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">test-{int(time.time())}</dc:identifier>
    <dc:title>{esc(title)}</dc:title>
    <dc:language>ko</dc:language>
    <meta property="dcterms:modified">{time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
{manifest}
    <item id="style" href="style.css" media-type="text/css"/>
  </manifest>
  <spine>
{spine}
  </spine>
</package>""")

        zf.writestr("OEBPS/nav.xhtml", f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="ko">
<head><title>목차</title></head>
<body>
  <nav epub:type="toc"><h1>목차</h1>
    <ol><li><a href="page0.xhtml">{esc(title)}</a></li></ol>
  </nav>
</body>
</html>""")

        zf.writestr("OEBPS/style.css", """body { font-family: system-ui, sans-serif; line-height: 1.8; color: #222; padding: 1em; word-break: keep-all; }
h1 { font-size: 1.6em; font-weight: bold; margin: 1.5em 0 0.75em; }
h2 { font-size: 1.35em; font-weight: bold; margin: 1.5em 0 0.75em; }
h3 { font-size: 1.15em; font-weight: 600; margin: 1.2em 0 0.6em; }
p { margin-bottom: 0.8em; }
blockquote { border-left: 3px solid #ddd; padding-left: 1em; margin: 1em 0; color: #666; }
.img-ph { text-align: center; padding: 1.5em; margin: 1em 0; background: #f5f5f5; border-radius: 8px; color: #999; }""")

        for i, r in enumerate(results):
            parts = []
            for el in r["elements"]:
                t = el.get("type", "paragraph")
                if t == "heading":
                    lvl = min(el.get("level", 1), 3)
                    parts.append(f"<h{lvl}>{esc(el.get('text', ''))}</h{lvl}>")
                elif t == "paragraph":
                    parts.append(f"<p>{esc(el.get('text', ''))}</p>")
                elif t == "quote":
                    parts.append(f"<blockquote><p>{esc(el.get('text', ''))}</p></blockquote>")
                elif t == "list_item":
                    parts.append(f"<p>• {esc(el.get('text', ''))}</p>")
                elif t == "image_placeholder":
                    parts.append(f'<div class="img-ph">[이미지: {esc(el.get("description", ""))}]</div>')
                elif t == "caption":
                    parts.append(f"<p><em>{esc(el.get('text', ''))}</em></p>")
                else:
                    parts.append(f"<p>{esc(el.get('text', ''))}</p>")

            html = "\n    ".join(parts) if parts else "<p>(빈 페이지)</p>"
            zf.writestr(f"OEBPS/page{i}.xhtml", f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" lang="ko">
<head><title>p{r['page_num']}</title><link rel="stylesheet" href="style.css"/></head>
<body>
    {html}
</body>
</html>""")

    return buf.getvalue()


# ━━━ 메인 ━━━
def main():
    parser = argparse.ArgumentParser(description="TeXTREME 변환 테스트")
    parser.add_argument("--pages", type=str, help="페이지 범위 (예: 1-3, 2-2)")
    parser.add_argument("--raw", action="store_true", help="Gemini raw 응답 출력")
    args = parser.parse_args()

    if not TEST_PDF_DIR.exists():
        print(f"❌ 폴더 없음: {TEST_PDF_DIR}")
        sys.exit(1)

    pdf_files = [f for f in os.listdir(TEST_PDF_DIR) if f.lower().endswith(".pdf")]
    if not pdf_files:
        print(f"❌ test PDF 폴더에 PDF 파일이 없습니다")
        sys.exit(1)

    RESULT_EPUB_DIR.mkdir(parents=True, exist_ok=True)

    print(f"\n⚡ TeXTREME 변환 테스트")
    print(f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    print(f"  PDF 폴더:  {TEST_PDF_DIR}")
    print(f"  EPUB 폴더: {RESULT_EPUB_DIR}")
    print(f"  PDF 파일:  {len(pdf_files)}개")
    if args.pages:
        print(f"  페이지:    {args.pages}")
    if args.raw:
        print(f"  모드:      RAW 출력")
    print(f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n")

    for pdf_file in pdf_files:
        pdf_path = str(TEST_PDF_DIR / pdf_file)
        title = os.path.splitext(pdf_file)[0]

        # 1. PDF → 이미지
        images = pdf_to_images(pdf_path, args.pages)

        # 2. Gemini API
        print(f"\n🤖 Gemini API 추출 ({GEMINI_MODEL})...\n")
        results = []
        total_input = 0
        total_output = 0

        for img in images:
            start = time.time()
            try:
                result = extract_page(img["base64"], img["page_num"], args.raw)
                elapsed = int((time.time() - start) * 1000)
                text_len = sum(len(e.get("text", "")) for e in result["elements"])

                print(f"  ✅ p{img['page_num']}: {len(result['elements'])} elements, {text_len} chars, {elapsed}ms, finish={result['finish']}, raw={result['raw_len']}")

                for el in result["elements"][:3]:
                    preview = (el.get("text") or el.get("description") or "")[:70]
                    print(f"     {el['type']}: {preview}")
                if len(result["elements"]) > 3:
                    print(f"     ... +{len(result['elements']) - 3} more")

                total_input += result["tokens"].get("promptTokenCount", 0)
                total_output += result["tokens"].get("candidatesTokenCount", 0)
                results.append({"page_num": img["page_num"], "elements": result["elements"]})

            except Exception as e:
                print(f"  ❌ p{img['page_num']}: {e}")
                results.append({"page_num": img["page_num"], "elements": []})

        # 3. 통계
        cost_usd = total_input / 1e6 * 0.15 + total_output / 1e6 * 0.60
        cost_krw = round(cost_usd * 1450)
        total_chars = sum(sum(len(e.get("text", "")) for e in r["elements"]) for r in results)
        empty_pages = sum(1 for r in results if not r["elements"])

        print(f"\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        print(f"📊 결과: {title}")
        print(f"  페이지: {len(results)}")
        print(f"  추출 문자: {total_chars:,}")
        print(f"  빈 페이지: {empty_pages}")
        print(f"  토큰: input {total_input:,} / output {total_output:,}")
        print(f"  비용: ₩{cost_krw} (${cost_usd:.4f})")

        # 4. EPUB 저장
        epub_data = build_epub(results, title)
        out_path = RESULT_EPUB_DIR / f"{title}.epub"
        out_path.write_bytes(epub_data)
        print(f"\n📦 EPUB 저장: {out_path}")
        print(f"   크기: {len(epub_data) / 1024:.1f} KB\n")


if __name__ == "__main__":
    main()
