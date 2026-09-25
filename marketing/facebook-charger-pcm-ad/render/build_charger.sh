#!/usr/bin/env bash
# Down Dirty 84 - Charger & Challenger unlocked-PCM ad.
# Source: 5.42s 4K clip of a Charger pulling away. The car is only large for
# the first ~1.2s, so that beat is slowed 0.55x with motion interpolation and
# the rest is a tracking push-in that counteracts the car receding.
set -euo pipefail

SP="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ffmpeg: set FFMPEG to override, otherwise whatever is on PATH.
FF="${FFMPEG:-$(command -v ffmpeg || true)}"
[ -x "$FF" ] || { echo "ffmpeg not found; set FFMPEG=/path/to/ffmpeg" >&2; exit 1; }

# The source clip is NOT committed (26MB of 4K phone footage). Drop it at
# render/source.mp4, or point SRC at it. Original: 20260916_191901_11_1.mp4,
# 3840x2160 HEVC, 5.42s, shot 2026-09-16.
V="${SRC:-$SP/source.mp4}"
[ -f "$V" ] || { echo "source clip not found at $V; set SRC=/path/to/clip.mp4" >&2; exit 1; }

OUT="${OUTDIR:-$SP/../video}"; mkdir -p "$OUT"
THUMBS="${THUMBDIR:-$SP/../thumbnails}"; mkdir -p "$THUMBS"

GRADE="eq=contrast=1.09:saturation=1.10:gamma=0.98,unsharp=5:5:0.45"
ENC=(-c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -movflags +faststart)

# $1 tag  $2 cards dir  $3 geometry  $4 output name
render() {
  local TAG="$1" C="$2" GEO="$3" NAME="$4"
  local SEG="$SP/cseg_$TAG"; mkdir -p "$SEG"

  # ONE footage beat. The Charger is only readable for src 0-1.65s; past
  # roughly src 2.0 it is a dot and the vehicle in frame is the oncoming
  # truck, not the car. So rather than cut to a second shot of empty road,
  # this slows that one good window to 0.45x and carries both text beats
  # over it. Push-in is applied at 4K (before the slow-down) so the crop
  # stays sharp.
  local P="min(on/50,1)"
  [ -s "$SEG/1.mp4" ] || "$FF" -y -hide_banner -loglevel error -t 1.65 -i "$V" \
    -loop 1 -i "$C/c_ov1.png" -loop 1 -i "$C/c_ov2.png" \
    -filter_complex "
      [0:v]zoompan=z='0.92+0.30*$P':\
x='max(0,min(iw*zoom-1080,(1440+60*$P)*zoom-540))':\
y='max(0,min(ih*zoom-1920,1040*zoom-960))':d=1:s=1080x1920:fps=30,
           ${GEO2:-null},${GRADE},setpts=PTS/0.45,
           minterpolate=fps=30:mi_mode=mci:mc_mode=aobmc:vsbmc=1,format=yuv420p[bg];
      [1:v]format=rgba,fade=in:st=0.40:d=0.35:alpha=1,fade=out:st=1.75:d=0.30:alpha=1[o1];
      [2:v]format=rgba,fade=in:st=2.15:d=0.35:alpha=1[o2];
      [bg][o1]overlay=0:0:enable='between(t,0.40,2.05)'[x];
      [x][o2]overlay=0:0:enable='gte(t,2.15)',format=yuv420p[v]" \
    -map "[v]" -an -t 3.66 "${ENC[@]}" "$SEG/1.mp4"

  local FILES=("$SEG/1.mp4")

  # Cards: A, B1-3 (progressive), C, D
  local i=3
  for spec in "c_cardA.png:3.0" "c_cardB1.png:1.5" "c_cardB2.png:1.5" "c_cardB3.png:1.6" \
              "c_cardC.png:4.5" "c_cardD.png:4.2"; do
    IFS=: read -r png dur <<< "$spec"
    "$FF" -y -hide_banner -loglevel error -loop 1 -t "$dur" -i "$C/$png" \
      -vf "fps=30,format=yuv420p" -an -t "$dur" "${ENC[@]}" "$SEG/$i.mp4"
    FILES+=("$SEG/$i.mp4"); i=$((i+1))
  done

  printf "file '%s'\n" "${FILES[@]}" > "$SEG/list.txt"
  "$FF" -y -hide_banner -loglevel error -f concat -safe 0 -i "$SEG/list.txt" \
    -c copy "$SEG/silent.mp4"

  # Exhaust bed from the source, faded out under the first card.
  # apad gets an explicit whole_dur and the output an explicit -t. A bare
  # `apad` is infinite, and -shortest does NOT terminate it against a stream
  # copy: that combination hangs the mux and leaves a half-written file with
  # no moov atom. Verified by running, not by reading.
  local DUR
  # `ffmpeg -i X` with no output file exits 1 by design. Under set -e with
  # pipefail a bare VAR=$(pipeline) propagates that status and kills the
  # script silently, so the failure has to be swallowed explicitly.
  DUR=$("$FF" -hide_banner -i "$SEG/silent.mp4" 2>&1 | sed -n 's/.*Duration: \([0-9:.]*\),.*/\1/p' \
        | awk -F: '{printf "%.2f", $1*3600+$2*60+$3}') || true
  [ -n "$DUR" ] || { echo "could not read duration of $SEG/silent.mp4" >&2; return 1; }
  "$FF" -y -hide_banner -loglevel error -i "$SEG/silent.mp4" -i "$V" \
    -filter_complex "[1:a]atrim=0:4.0,asetpts=PTS-STARTPTS,
                     afade=t=out:st=2.6:d=1.4,apad=whole_dur=${DUR}[a]" \
    -map 0:v -map "[a]" -t "$DUR" -c:v copy -c:a aac -b:a 192k -ar 48000 "$OUT/$NAME"
  printf "  %-46s %s\n" "$NAME" "$("$FF" -hide_banner -i "$OUT/$NAME" 2>&1 | grep Duration | sed 's/,.*//;s/ *Duration: //')"
}

echo "Rendering:"
render 916 "$SP/ccards"     "scale=1080:1920:flags=lanczos" "DD84_charger-pcm_FB_9x16.mp4"
GEO2="crop=1080:1350:0:210" \
render 45  "$SP/ccards_4x5" "scale=1080:1350:flags=lanczos,setsar=1" "DD84_charger-pcm_FB_4x5.mp4"

echo "Thumbnails:"
for r in "9x16" "4x5"; do
  "$FF" -y -hide_banner -loglevel error -ss 1.4 -i "$OUT/DD84_charger-pcm_FB_$r.mp4" \
    -frames:v 1 -q:v 2 "$THUMBS/DD84_charger-pcm_thumb_$r.jpg"
done
ls -la "$OUT" | grep charger
