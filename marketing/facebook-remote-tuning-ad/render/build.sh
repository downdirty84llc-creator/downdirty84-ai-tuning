#!/usr/bin/env bash
# Down Dirty 84 - Facebook ad assembly.
# Source: owner-supplied clip (Pontiac G8 GT, red light -> pull).
# Usable footage runs to src 32.4s; the camera pans off the road after that.
set -euo pipefail

SP="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ffmpeg: set FFMPEG to override, otherwise whatever is on PATH.
FF="${FFMPEG:-$(command -v ffmpeg || true)}"
[ -x "$FF" ] || { echo "ffmpeg not found; set FFMPEG=/path/to/ffmpeg" >&2; exit 1; }

# The source clip is NOT committed (10MB of raw phone footage). Drop it at
# render/source.mp4, or point SRC at it. Original: VID_20260916_111949.mp4,
# 1280x720 rotated -90 (portrait), 35.3s, shot 2026-09-16.
V="${SRC:-$SP/source.mp4}"
[ -f "$V" ] || { echo "source clip not found at $V; set SRC=/path/to/clip.mp4" >&2; exit 1; }

OUT="${OUTDIR:-$SP/../video}"; mkdir -p "$OUT"

GRADE="eq=contrast=1.10:saturation=1.14:gamma=0.97,unsharp=5:5:0.5"
ENC=(-c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -movflags +faststart -c:a aac -b:a 192k)
SIL="anullsrc=channel_layout=stereo:sample_rate=48000"

# $1 ratio tag  $2 cards dir  $3 geometry filter  $4 output name  $5 cut (full|short)
render() {
  local TAG="$1" C="$2" GEO="$3" NAME="$4" CUT="$5"
  local SEG="$SP/seg_$TAG"; mkdir -p "$SEG"
  local BASE="${GEO},setsar=1,${GRADE},fps=30,format=yuv420p"

  if [ "$CUT" = "full" ]; then
    local A_SS=20.5 A_D=5.5  B_D=6.0  P_D=4.8 E_D=3.5 F_D=4.0
    local A1_OUT=2.45 A1_END=2.80 A2_IN=2.95
    local B_PAY_IN=1.55 B_PAY_OUT=3.75 B_PAY_END=4.05 B_BR_IN=4.30
  else
    local A_SS=22.0 A_D=4.0  B_D=5.0  P_D=0   E_D=2.5 F_D=3.5
    local A1_OUT=1.85 A1_END=2.20 A2_IN=2.35
    local B_PAY_IN=1.40 B_PAY_OUT=3.10 B_PAY_END=3.40 B_BR_IN=3.60
  fi

  # A - hook + setup
  "$FF" -y -hide_banner -loglevel error -ss $A_SS -t $A_D -i "$V" \
    -loop 1 -i "$C/ov1_hook.png" -loop 1 -i "$C/ov2_setup.png" \
    -filter_complex "
      [0:v]${BASE}[bg];
      [1:v]format=rgba,fade=in:st=0.15:d=0.35:alpha=1,fade=out:st=${A1_OUT}:d=0.30:alpha=1[o1];
      [2:v]format=rgba,fade=in:st=${A2_IN}:d=0.35:alpha=1[o2];
      [bg][o1]overlay=0:0:enable='between(t,0.15,${A1_END})'[x];
      [x][o2]overlay=0:0:enable='between(t,${A2_IN},${A_D})',format=yuv420p[v]" \
    -map "[v]" -map 0:a -t $A_D "${ENC[@]}" "$SEG/a.mp4"

  # B - the pull; audio fades out under the brand hit
  "$FF" -y -hide_banner -loglevel error -ss 26.0 -t $B_D -i "$V" \
    -loop 1 -i "$C/ov3_green.png" -loop 1 -i "$C/ov4_payoff.png" -loop 1 -i "$C/ov5_brand.png" \
    -filter_complex "
      [0:v]${BASE}[bg];
      [1:v]format=rgba,fade=in:st=0.05:d=0.20:alpha=1,fade=out:st=1.05:d=0.25:alpha=1[o1];
      [2:v]format=rgba,fade=in:st=${B_PAY_IN}:d=0.30:alpha=1,fade=out:st=${B_PAY_OUT}:d=0.30:alpha=1[o2];
      [3:v]format=rgba,fade=in:st=${B_BR_IN}:d=0.35:alpha=1[o3];
      [bg][o1]overlay=0:0:enable='between(t,0.05,1.30)'[x1];
      [x1][o2]overlay=0:0:enable='between(t,${B_PAY_IN},${B_PAY_END})'[x2];
      [x2][o3]overlay=0:0:enable='between(t,${B_BR_IN},${B_D})',format=yuv420p[v];
      [0:a]afade=t=out:st=$(echo "$B_D - 1.6" | bc):d=1.6[a]" \
    -map "[v]" -map "[a]" -t $B_D "${ENC[@]}" "$SEG/b.mp4"

  local FILES=("$SEG/a.mp4" "$SEG/b.mp4")

  # D - process card, three progressive reveals (full cut only)
  if [ "$P_D" != "0" ]; then
    "$FF" -y -hide_banner -loglevel error \
      -loop 1 -t 1.5 -i "$C/card_process_1.png" \
      -loop 1 -t 1.5 -i "$C/card_process_2.png" \
      -loop 1 -t 1.8 -i "$C/card_process_3.png" \
      -f lavfi -t $P_D -i "$SIL" \
      -filter_complex "[0:v]fps=30,format=yuv420p[v0];[1:v]fps=30,format=yuv420p[v1];
                       [2:v]fps=30,format=yuv420p[v2];[v0][v1][v2]concat=n=3:v=1:a=0[v]" \
      -map "[v]" -map 3:a -t $P_D "${ENC[@]}" "$SEG/d.mp4"
    FILES+=("$SEG/d.mp4")
  fi

  # E - offer,  F - CTA
  for pair in "card_offer.png:e:$E_D" "card_cta.png:f:$F_D"; do
    IFS=: read -r png key dur <<< "$pair"
    "$FF" -y -hide_banner -loglevel error -loop 1 -t "$dur" -i "$C/$png" \
      -f lavfi -t "$dur" -i "$SIL" -vf "fps=30,format=yuv420p" \
      -map 0:v -map 1:a -t "$dur" "${ENC[@]}" "$SEG/$key.mp4"
    FILES+=("$SEG/$key.mp4")
  done

  printf "file '%s'\n" "${FILES[@]}" > "$SEG/list.txt"
  "$FF" -y -hide_banner -loglevel error -f concat -safe 0 -i "$SEG/list.txt" \
    -c:v libx264 -preset slow -crf 19 -pix_fmt yuv420p -movflags +faststart \
    -c:a aac -b:a 192k -ar 48000 "$OUT/$NAME"
  printf "  %-42s %s\n" "$NAME" "$("$FF" -hide_banner -i "$OUT/$NAME" 2>&1 | grep Duration | sed 's/,.*//;s/ *Duration: //')"
}

V916="scale=1080:1920:flags=lanczos"
V45="scale=1080:1920:flags=lanczos,crop=1080:1350:0:190"

echo "Rendering:"
render 916      "$SP/cards"         "$V916" "DD84_remote-tuning_FB_9x16.mp4"     full
render 916s     "$SP/cards"     "$V916" "DD84_remote-tuning_FB_9x16_15s.mp4" short
render 45       "$SP/cards_4x5" "$V45"  "DD84_remote-tuning_FB_4x5.mp4"      full

echo "Thumbnails:"
"$FF" -y -hide_banner -loglevel error -ss 1.6 -i "$OUT/DD84_remote-tuning_FB_9x16.mp4" \
  -frames:v 1 -q:v 2 "$OUT/DD84_thumbnail_9x16.jpg"
"$FF" -y -hide_banner -loglevel error -ss 1.6 -i "$OUT/DD84_remote-tuning_FB_4x5.mp4" \
  -frames:v 1 -q:v 2 "$OUT/DD84_thumbnail_4x5.jpg"
ls -la "$OUT"
