# 갤러리 사진 자르기

갤러리(`/gallery.html`) 사진은 모두 4:3으로 잘려 있습니다. 어느 부분을 보여줄지는 사진마다 정할 수 있습니다.

## 대표가 할 일

1. claude.ai에서 **갤러리 사진 자르기** 도구를 엽니다 (아티팩트 목록 claude.ai/code/artifacts →
   "갤러리 사진 자르기", 주소 https://claude.ai/artifact/U7xapE1LehG9CMZFYQKbLb · 본인만 열림).
2. 사진을 누르고 흰 틀을 끌어 맞춥니다. 손을 떼면 바로 저장됩니다(오른쪽 미리보기 = 홈페이지에 보일 모습).
3. 오픈가든 프로젝트 채팅에 **"갤러리 자르기 적용"** 이라고 보냅니다.

## Claude가 할 일 ("갤러리 자르기 적용"을 받으면)

1. `ArtifactData` `list` — url 위 주소, collection `crops`, `out_dir` 지정 → `<out_dir>/crops/<id>.json` ({x,y,w}).
2. `photos.json`의 `crop`과 비교해 **바뀐 사진만** 골라, 그 사진의 `drive` ID로 원본을 Google Drive에서 받습니다
   (`download_file_content` → 결과 JSON의 `content`를 base64 디코드 → `<원본폴더>/<drive id>.<확장자>`).
   6MB가 넘는 파일은 커넥터가 끊기니 한 번에 한 장씩.
3. `python3 tools/gallery-crop/apply.py <원본폴더> <out_dir>/crops` — 바뀐 사진만 다시 잘라
   `public/assets/gallery/`(1600×1200)와 `thumb/`(720×540)를 덮어쓰고 `photos.json`을 갱신합니다.
   워터마크(`watermark.py`: 가운데 옅은 로고 + 오른쪽 아래 로고, 원본 로고 파일 그대로)는 자동으로 들어갑니다.
   이미 워터마크가 들어간 `public/assets/gallery/` 파일을 다시 원본으로 쓰지 마세요(이중 워터마크).
   HEIC 원본은 `pip install pillow-heif --break-system-packages` 필요.
4. `npm test` → 브랜치·PR → validate 통과 후 merge → open-garden.co.kr/gallery.html 확인.

## 값의 뜻

- `crop` {x, y, w}: 원본(아래 `inset`을 뺀 뒤) 가로·세로를 1로 본 비율. x·y는 틀의 왼쪽 위, w는 틀 너비. 높이 = 너비×3/4.
- `inset`: 시공사례 캡처(PNG)의 흰 둥근 모서리를 지우려고 네 변에서 먼저 잘라낸 픽셀 수.
- `edited`: 도구에서 한 번이라도 조정한 사진.

## 사진을 새로 넣을 때

갤러리에 사진을 추가하면 `photos.json`에 항목(id·file·drive·title·inset 0·crop)을 넣고,
자르기 도구 페이지의 사진 목록(페이지 안 `ITEMS`)과 미리보기 이미지(`img/<id>.webp`, 긴 변 1400px)도 같이
다시 게시해야 도구에 나타납니다. 이때 아티팩트를 먼저 `read`해서 최신 버전에 덧붙입니다.
