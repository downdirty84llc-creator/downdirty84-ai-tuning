# Facebook ad — Charger & Challenger unlocked PCM

An ad for the 2015-and-newer Charger / Challenger unlocked-PCM product, built
from owner-supplied footage of a Charger pulling away on a rural road. The car
on screen and the product being sold are the same platform, which is the whole
reason this cut exists rather than a generic remote-tuning one.

| File | Ratio | Length | Placement |
| --- | --- | --- | --- |
| `video/DD84_charger-pcm_FB_9x16.mp4` | 9:16 | 20.0s | Reels, Stories |
| `video/DD84_charger-pcm_FB_4x5.mp4` | 4:5 | 20.0s | Feed |

`thumbnails/` holds a cover frame per ratio. Do not let Meta auto-crop between
ratios — overlay text is bottom-anchored per frame size, so a 9:16 asset
cropped to 4:5 clips the headline.

## Beat sheet

| Time | Beat |
| --- | --- |
| 0.0–2.0 | Charger in slow motion — "2015 & NEWER / CHARGER & CHALLENGER" |
| 2.2–3.7 | "YOUR PCM IS LOCKED." |
| 3.7–6.7 | "WE SHIP IT UNLOCKED" + unlocked PCM / pre-tuned / plug & play |
| 6.7–11.3 | Six features, revealed in three steps |
| 11.3–15.8 | $650 / $700 / $1000 + VIN note |
| 15.8–20.0 | Wordmark, MESSAGE TO ORDER, site, Jefferson GA |

Audio is the clip's own exhaust, faded out under the first card. Every claim is
also on screen as text — Facebook autoplays muted.

## The footage constraint, which drove the whole edit

The source clip is 5.42s of 4K, shot static and wide, with the Charger small
and receding throughout. **Only about the first 1.65 seconds are usable**: past
roughly src 2.0s the car is too small to identify as a Charger, and the vehicle
still visible in frame is an oncoming truck, not the subject.

What makes it work at all is the 4K. The ad crops roughly 3x into a 1215x2160
window at native resolution, slows that one good window to 0.45x with motion
interpolation so it can carry a real beat, and pushes in as the car recedes so
it holds a roughly constant size across the full 3.7s.

An earlier cut used two shots. The second played over empty road, because the
subject had left. There is no tracking fix for footage that does not contain
the subject — the fix was to stop pretending there was a second angle. If a
longer ad is wanted from this location, shoot the car approaching camera or pan
with it as it passes.

## Where the copy comes from

Every line is read off the Charger/Challenger flyer: the prices, the VIN
requirement, the six features, "UNLOCKED PCM / PRE-TUNED / PLUG & PLAY", the
MESSAGE TO ORDER call to action, and Jefferson, GA.

The one addition is the disclaimer on the end card, taken from
`backend/src/services/brand/brand_profile.ts`. The flyer carries none, and the
ad advertises PCM unlocking and pops & bangs at a fixed price.

No horsepower figures, customer counts or testimonials appear, because there is
no source for any of them.

## Colours and type

Accent is `#A8EB00`, sampled from the DD84 logo and confirmed by the owner as
canonical. Ground is pure black with a low-contrast hex texture; display type is
Big Shoulders Bold sheared into italic with a brushed-silver gradient fill.

Note that DD84's print flyers use crimson (`#B8120E`), not green. This ad follows
the logo. If the flyers are ever the reference instead, swap `RED`, `RED_HOT`,
`RED_DK` and `CRIMSON` in `render/gen_charger.py` — the layout does not change.

The CTA button uses near-black text on the lime fill. White on `#A8EB00` fails
contrast badly; do not "fix" it back to white.

## Rebuilding

The raw clip is **not committed**. Put it at `render/source.mp4` or point `SRC`
at it.

```bash
cd marketing/facebook-charger-pcm-ad/render
python3 -m pip install Pillow
python3 gen_charger.py               # overlays + cards, both ratios
SRC=/path/to/clip.mp4 ./build_charger.sh
```

`build_charger.sh` honours `FFMPEG`, `SRC` and `OUTDIR`, and needs ffmpeg with
libx264. Fonts are read from the path at the top of `gen_charger.py`.

A rebuild reproduces the same ad but not necessarily the same bytes.
`minterpolate`'s motion estimation is threaded, so successive runs can differ by
a handful of macroblocks — the 9:16 came out byte-identical across two runs and
the 4:5 differed by 715 bytes in 4.4MB. Both are visually identical. Do not
treat a checksum mismatch here as a defect.

Two ffmpeg behaviours this script had to work around, both of which only showed
up when run:

- A bare `apad` is infinite, and `-shortest` does **not** terminate it against a
  stream copy. That combination hangs the mux and leaves a file with no moov
  atom. The script pads to an explicit `whole_dur` and sets `-t`.
- `ffmpeg -i X` with no output file exits 1 by design. Under `set -e` with
  `pipefail`, a bare `VAR=$(pipeline)` propagates that and kills the script
  silently, printing nothing. The duration probe swallows it explicitly.
