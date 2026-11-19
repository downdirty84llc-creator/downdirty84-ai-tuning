#!/usr/bin/env bash
# Down Dirty 84 - Bench Unlock & Programming ad.
# No footage exists for this service, so the hero is a rendered frame sequence
# (see gen_bench.py). Run gen_bench.py first; it writes frames916/ and frames45/.
set -euo pipefail

SP="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FF="${FFMPEG:-$(command -v ffmpeg || true)}"
[ -x "$FF" ] || { echo "ffmpeg not found; set FFMPEG=/path/to/ffmpeg" >&2; exit 1; }
OUT="${OUTDIR:-$SP/../video}"; mkdir -p "$OUT"
THUMBS="${THUMBDIR:-$SP/../thumbnails}"; mkdir -p "$THUMBS"

ENC=(-c:v libx264 -preset slow -crf 19 -pix_fmt yuv420p -movflags +faststart)
SIL="anullsrc=channel_layout=stereo:sample_rate=48000"

# $1 frames dir  $2 output name  $3 thumb name
render() {
  local F="$SP/$1" NAME="$2" THUMB="$3"
  local SEG="$F/seg"; mkdir -p "$SEG"
  [ -d "$F/hero" ] || { echo "missing $F/hero — run gen_bench.py first" >&2; exit 1; }

  # hero: rendered scan sweep
  "$FF" -y -hide_banner -loglevel error -framerate 30 -i "$F/hero/h_%04d.jpg" \
    -vf "format=yuv420p" -an "${ENC[@]}" "$SEG/0.mp4"

  local FILES=("$SEG/0.mp4") i=1
  for spec in "b_cap1.jpg:1.3" "b_cap2.jpg:1.3" "b_cap3.jpg:1.3" "b_cap4.jpg:1.6" \
              "b_reach.jpg:3.4" "b_cta.jpg:4.4"; do
    IFS=: read -r img dur <<< "$spec"
    "$FF" -y -hide_banner -loglevel error -loop 1 -t "$dur" -i "$F/$img" \
      -vf "fps=30,format=yuv420p" -an -t "$dur" "${ENC[@]}" "$SEG/$i.mp4"
    FILES+=("$SEG/$i.mp4"); i=$((i+1))
  done

  printf "file '%s'\n" "${FILES[@]}" > "$SEG/list.txt"
  "$FF" -y -hide_banner -loglevel error -f concat -safe 0 -i "$SEG/list.txt" \
    -c copy "$SEG/silent.mp4"

  # No source audio exists for this ad; give it a silent track of the exact
  # video length so players and Meta's uploader get a well-formed stream.
  local DUR
  DUR=$("$FF" -hide_banner -i "$SEG/silent.mp4" 2>&1 \
        | sed -n 's/.*Duration: \([0-9:.]*\),.*/\1/p' \
        | awk -F: '{printf "%.2f", $1*3600+$2*60+$3}') || true
  [ -n "$DUR" ] || { echo "could not read duration" >&2; return 1; }

  "$FF" -y -hide_banner -loglevel error -i "$SEG/silent.mp4" \
    -f lavfi -t "$DUR" -i "$SIL" \
    -map 0:v -map 1:a -t "$DUR" -c:v copy -c:a aac -b:a 128k -ar 48000 "$OUT/$NAME"

  "$FF" -y -hide_banner -loglevel error -ss 3.8 -i "$OUT/$NAME" \
    -frames:v 1 -q:v 2 "$THUMBS/$THUMB"
  printf "  %-44s %s\n" "$NAME" "$DUR s"
}

echo "Rendering:"
render frames916 "DD84_bench-unlock_FB_9x16.mp4" "DD84_bench-unlock_thumb_9x16.jpg"
render frames45  "DD84_bench-unlock_FB_4x5.mp4"  "DD84_bench-unlock_thumb_4x5.jpg"
