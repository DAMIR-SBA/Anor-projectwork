#!/usr/bin/env bash
# Renders the demo short videos and the live-stream loop in public/demo/videos from the demo
# product art (needs a running dev server for /media/demo, Playwright's Chromium to rasterize the
# SVG art, and ffmpeg with libx264).
# The rendered files are committed, so this only needs re-running when the demo set changes.
set -euo pipefail
BASE="${BASE:-http://localhost:3000}"
OUT="public/demo/videos"
FONT="assets/fonts/DejaVuSans-Bold.ttf"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$OUT"

# slug | demo art | background | caption
CLIPS=(
  "redmi-buds|earbuds-2A2A33-22|#E9E7F5|Shovqinsiz 8 soat"
  "bolalar-futbolkasi|tshirt-F5B301-97|#FFF4D6|100% organik paxta"
  "krossovka-runner|sneaker-1FA463-61|#E3F4EA|Har kuni yugurish uchun"
  "chust-pichogi|knife-B5651D-145|#F6E9DF|Usta qo‘lida tayyorlangan"
  "kuk-choy|tea-1FA463-100|#E6F2E4|Choyni to‘g‘ri damlash"
  "redmi-note-13|phone-6B4FBB-7|#ECE6F7|200 MP kamera sinovi"
  "live-studio|tshirt-C8102E-98|#FBE3E6|JONLI EFIR"
)

for row in "${CLIPS[@]}"; do
  IFS="|" read -r slug art bg caption <<<"$row"
  node -e '
    const { chromium } = require("playwright");
    (async () => {
      const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
      const p = await b.newPage({ viewport: { width: 720, height: 720 } });
      await p.setContent(`<body style="margin:0"><img src="${process.argv[1]}" style="display:block;width:720px;height:720px"></body>`);
      await p.waitForLoadState("networkidle");
      await p.screenshot({ path: process.argv[2], omitBackground: true });
      await b.close();
    })();
  ' "$BASE/media/demo/$art.svg" "$TMP/$slug.png"
  printf "%s" "$caption" >"$TMP/$slug.txt"
  printf "ANOR" >"$TMP/brand.txt"
  dur=8
  [ "$slug" = "live-studio" ] && dur=12
  # Frame colour = the art's own backdrop, so the picture blends into the frame.
  px="$(convert "$TMP/$slug.png" -format "%[hex:p{360,24}]" info: 2>/dev/null | cut -c1-6)"
  [ -n "$px" ] && [ "$px" != "000000" ] && bg="#$px"
  frames=$((dur * 25))
  ffmpeg -loglevel error -y \
    -f lavfi -i "color=c=${bg}:s=540x960:d=${dur}:r=25" \
    -loop 1 -framerate 25 -t "$dur" -i "$TMP/$slug.png" \
    -filter_complex "[1:v]scale=1080:1080,zoompan=z='1+0.12*on/${frames}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=540x540:fps=25[p];\
[0:v][p]overlay=x=0:y=150:shortest=1,\
drawtext=fontfile=${FONT}:textfile=$TMP/brand.txt:fontsize=34:fontcolor=0xC8102E:x=32:y=40,\
drawtext=fontfile=${FONT}:textfile=$TMP/$slug.txt:expansion=none:fontsize=40:fontcolor=0x1A1A1F:x=(w-text_w)/2:y=h-220:alpha='min(1,t/0.8)',\
format=yuv420p" \
    -c:v libx264 -preset slow -crf 30 -movflags +faststart -an "$OUT/$slug.mp4"
  # WebM (VP8) twin for browsers without H.264 (open-source Chromium builds).
  ffmpeg -loglevel error -y -i "$OUT/$slug.mp4" -c:v libvpx -b:v 450k -crf 12 -an "$OUT/$slug.webm"
  ffmpeg -loglevel error -y -ss 1.5 -i "$OUT/$slug.mp4" -frames:v 1 -q:v 5 "$OUT/$slug.jpg"
  echo "rendered $slug ($(du -h "$OUT/$slug.mp4" | cut -f1))"
done
