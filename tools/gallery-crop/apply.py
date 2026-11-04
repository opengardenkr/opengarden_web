#!/usr/bin/env python3
"""갤러리 사진 자르기 적용.

python3 tools/gallery-crop/apply.py <원본폴더> [<자르기값폴더>] [--all]

- 원본폴더: 드라이브 원본을 '<drive id>.<확장자>'로 저장한 폴더 (HEIC는 pillow-heif 필요)
- 자르기값폴더: 자르기 도구 DB(crops 컬렉션)를 JSON으로 내려받은 폴더(<id>.json, {x,y,w})
  주면 photos.json의 crop 값을 갱신하고, 값이 바뀐 사진만 다시 자른다. --all 이면 원본이 있는 사진 전부.
- 결과: public/assets/gallery/<file> (1600×1200 WebP, 워터마크) + thumb/<file> (720×540)
"""
import glob, json, os, sys
from PIL import Image, ImageOps

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from watermark import watermark  # noqa: E402

try:
    import pillow_heif
    pillow_heif.register_heif_opener()
except ImportError:
    pass

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
OUT = os.path.join(ROOT, "public", "assets", "gallery")
LIST = os.path.join(HERE, "photos.json")

args = [a for a in sys.argv[1:] if not a.startswith("--")]
if not args:
    sys.exit(__doc__)
src_dir, rows_dir = args[0], (args[1] if len(args) > 1 else None)
photos = json.load(open(LIST, encoding="utf8"))
todo = set(p["id"] for p in photos) if "--all" in sys.argv else set()

if rows_dir:
    for p in photos:
        f = os.path.join(rows_dir, p["id"] + ".json")
        if not os.path.exists(f):
            continue
        v = json.load(open(f))
        v = v.get("data", v) if isinstance(v.get("data"), dict) else v
        if not all(isinstance(v.get(k), (int, float)) for k in "xyw"):
            print("skip (bad value)", p["id"]); continue
        c = {k: round(min(1.0, max(0.0, float(v[k]))), 5) for k in "xyw"}
        if c != p["crop"]:
            p["crop"], p["edited"] = c, True
            todo.add(p["id"])

done = []
for p in photos:
    if p["id"] not in todo:
        continue
    found = glob.glob(os.path.join(src_dir, p["drive"] + ".*"))
    if not found:
        print("missing original", p["id"], p["title"], p["drive"]); continue
    im = ImageOps.exif_transpose(Image.open(found[0])).convert("RGB")
    i = p["inset"]
    base = im.crop((i, i, im.width - i, im.height - i)) if i else im
    bw, bh = base.size
    w = max(0.05, min(1.0, p["crop"]["w"])) * bw
    w = min(w, bh * 4 / 3)
    h = w * 3 / 4
    x = min(max(0, p["crop"]["x"] * bw), bw - w)
    y = min(max(0, p["crop"]["y"] * bh), bh - h)
    c = base.crop((round(x), round(y), round(x + w), round(y + h)))
    full = watermark(c.resize((1600, 1200), Image.LANCZOS))
    full.save(os.path.join(OUT, p["file"]), "WEBP", quality=82, method=6)
    full.resize((720, 540), Image.LANCZOS).save(os.path.join(OUT, "thumb", p["file"]), "WEBP", quality=72, method=6)
    done.append(p["id"])

json.dump(photos, open(LIST, "w", encoding="utf8"), ensure_ascii=False, indent=1)
print("applied", len(done), done)
