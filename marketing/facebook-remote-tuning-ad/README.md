# Facebook ad — remote calibration

Three cuts of one ad for Down Dirty 84's remote ECM calibration service, built
from owner-supplied footage: a white Pontiac G8 GT sitting at a red light, the
light turning green, and the G8 walking away from the camera car.

The green light is the whole structure. The problem is stated while the car is
stopped, the offer lands the moment it moves.

| File | Ratio | Length | Placement |
| --- | --- | --- | --- |
| `video/DD84_remote-tuning_FB_9x16.mp4` | 9:16 | 23.8s | Reels, Stories — the master |
| `video/DD84_remote-tuning_FB_4x5.mp4` | 4:5 | 23.8s | Feed |
| `video/DD84_remote-tuning_FB_9x16_15s.mp4` | 9:16 | 15.0s | Short-form test against the master |

`thumbnails/` holds a cover frame per ratio, pulled from the hook at t=1.6s.

Do not let Meta auto-crop between ratios. Overlay text is bottom-anchored per
frame size, so a 9:16 asset cropped to 4:5 clips the headline. Upload the
matching file per placement.

## Beat sheet (9:16 master)

| Time | Beat |
| --- | --- |
| 0.0–2.8 | Red light, G8 in frame — "STILL WAITING ON YOUR TUNER?" |
| 2.9–5.5 | No shop appointment. No dyno day. No shipping your ECU. |
| 5.5–6.8 | Light turns green; "GREEN LIGHT" chip |
| 7.0–9.5 | The pull — "SEND A DATALOG." |
| 9.8–11.5 | Brand, road empty ahead |
| 11.5–16.3 | Three steps, revealed one at a time |
| 16.3–19.8 | $39 / $99 |
| 19.8–23.8 | Wordmark, CTA button, URL, disclaimer |

Audio is the clip's own exhaust note through the pull, faded out under the
brand hit so the cards are deliberately silent. Every claim is also on screen
as text — Facebook autoplays muted, so the ad has to work with no sound at all.

## Where the copy comes from

Nothing in the ad is invented. No horsepower figures, no customer counts, no
testimonials, no turnaround claim beyond what is actually sold.

| Claim on screen | Source in this repo |
| --- | --- |
| Name, `downdirty84llc.com`, support email | `backend/src/services/brand/brand_profile.ts` |
| "Log Review $39", "Priority Log Review $99", Stage 1 NA / Boosted | `backend/src/config/stripe_catalog.ts` |
| Same-day turnaround, front of the queue | `src/Buy.tsx` (`SERVICE_BLURB`) |
| HP Tuners / Holley, CSV, reviewed before release | `README.md`, `docs/ANALYSIS-ENGINE.md` |
| Knock retard, wideband AFR, fuel trims, MAF, temps, fuel pressure | `docs/ANALYSIS-ENGINE.md` (canonical channels) |
| "Off-road / motorsports use only", no-guarantee line | `brand_profile.ts` (`disclaimer`) |

Prices are duplicated here from `stripe_catalog.ts`, which is itself a mirror of
the live Stripe account. **If a price changes in Stripe, this video is stale**
and has to be re-rendered — the same drift problem `catalog_drift.ts` exists to
catch for the app, except a video cannot check itself at runtime.

## Colours and type

Base palette is lifted from `src/styles.css`, so the ad matches the product:

- `#0B0F14` ink, `#111827` panel, `#E5E7EB` text, `#9CA3AF` muted
- `#A8EB00` accent (from the logo, not from `styles.css`)

The accent is `#A8EB00`, sampled from the DD84 logo and confirmed by the
owner as the canonical brand colour. Note that DD84's print flyers use crimson
(`#B8120E`) rather than green — the green logo is the one to follow.

`brand_profile.ts` still has `accentColor: null`. Setting it to `#A8EB00` would
stop the app and the ads disagreeing; that change is not made here because it
touches product code, not marketing assets.

Type is Big Shoulders Bold (display), Geist Mono Bold (labels), Instrument Sans
(body) — all OFL, redistributable.

## Rebuilding

The raw clip is **not committed** (10MB of phone footage). Put it at
`render/source.mp4` or point `SRC` at it.

```bash
cd marketing/facebook-remote-tuning-ad/render
python3 -m pip install Pillow
python3 gen.py                       # overlays + cards, both ratios
SRC=/path/to/clip.mp4 ./build.sh     # renders into ../video
```

`build.sh` honours `FFMPEG`, `SRC` and `OUTDIR`. It needs ffmpeg with libx264;
the fonts it references live in this container at
`/mnt/skills/examples/canvas-design/canvas-fonts` and the path is set at the top
of `gen.py`.

Two things about the source clip worth knowing before re-cutting it:

- It is 1280x720 **rotated -90** in metadata. ffmpeg auto-rotates; other tools
  may not, and will hand you a sideways frame.
- Usable footage ends at **32.4s**. After that the camera pans off the road
  onto a house. An earlier cut of this ad used 32–35s and had to be dropped.
