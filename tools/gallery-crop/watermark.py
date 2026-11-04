"""갤러리 사진 워터마크 — 원본 로고 파일(public/assets/logo.png, logo-white.png)만 사용, 투명도만 조절.

- 오른쪽 아래: 가로형 로고 (밝은 배경 = 컬러, 어두운 배경 = 화이트)
- 가운데: 같은 로고를 크게, 아주 옅게 — 잘라내기로 지우기 어렵게
"""
import os
from PIL import Image, ImageStat

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
LOGO = {k: Image.open(os.path.join(ROOT, "public", "assets", f)).convert("RGBA")
        for k, f in (("color", "logo.png"), ("white", "logo-white.png"))}

CORNER = {"width": 0.22, "margin": 0.03, "opacity": {"color": 0.55, "white": 0.62}}
CENTER = {"width": 0.46, "opacity": {"color": 0.16, "white": 0.20}}


def _logo(kind, width, opacity):
    src = LOGO[kind]
    lg = src.resize((width, round(src.height * width / src.width)), Image.LANCZOS)
    a = lg.getchannel("A").point(lambda v: round(v * opacity))
    lg.putalpha(a)
    return lg


def _kind(img, box):
    lum = ImageStat.Stat(img.crop(box).convert("L")).mean[0]
    return "color" if lum > 150 else "white"


def watermark(img):
    img = img.convert("RGB")
    W, H = img.size
    out = img.convert("RGBA")
    # center
    cw = round(W * CENTER["width"])
    probe = (W // 2 - cw // 2, H // 2 - cw // 5, W // 2 + cw // 2, H // 2 + cw // 5)
    k = _kind(img, probe)
    lg = _logo(k, cw, CENTER["opacity"][k])
    out.alpha_composite(lg, ((W - lg.width) // 2, (H - lg.height) // 2))
    # bottom-right corner
    m = round(W * CORNER["margin"])
    w = round(W * CORNER["width"])
    k = _kind(img, (W - m - w, H - m - w // 2, W - m, H - m))
    lg = _logo(k, w, CORNER["opacity"][k])
    out.alpha_composite(lg, (W - m - lg.width, H - m - lg.height))
    return out.convert("RGB")
