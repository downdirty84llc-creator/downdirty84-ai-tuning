# Facebook ad — Bench Unlock & Programming

An ad for the bench unlock service, built from the Bench Unlock flyer. Unlike
the other two ads in `marketing/`, **this one has no footage** — see below.

| File | Ratio | Length | Placement |
| --- | --- | --- | --- |
| `video/DD84_bench-unlock_FB_9x16.mp4` | 9:16 | 17.9s | Reels, Stories |
| `video/DD84_bench-unlock_FB_4x5.mp4` | 4:5 | 17.9s | Feed |

Do not let Meta auto-crop between ratios. The hero is laid out relative to
frame height, so a 9:16 asset cropped to 4:5 puts the headline through the
board.

## Beat sheet

| Time | Beat |
| --- | --- |
| 0.0–4.6 | ECU under the fixture, scan sweeping down — "BENCH UNLOCK & PROGRAMMING" |
| 4.6–9.8 | "OFF THE CAR, ON THE BENCH" + PCM / ECU / Diagnostics / Calibration Support |
| 9.8–13.2 | "MAIL IT IN, OR WE COME TO YOU" — mail-in, mobile, Jefferson GA |
| 13.2–17.9 | Wordmark, MESSAGE US TO BOOK, site |

## The hero is drawn, not filmed

There is no bench footage, and the two clips that exist (a G8 at a traffic
light, a Charger on a road) have nothing to do with bench work — putting a car
on screen to sell module work would misrepresent the service.

So `gen_bench.py` draws what the flyer actually pictures: a stylised ECU under
a bed-of-nails fixture with probe wires, and a scan line sweeping down it. The
board is drawn twice, dark and energised; the frame loop composites the
energised copy above the scan line, so the board wakes up as the sweep passes.

**A photograph of the real bench would be better.** If one is available, the
hero is the part to replace; the cards and the timing can stay.

## No prices, deliberately

The Charger flyer has a price table and that ad quotes it. **The Bench Unlock
flyer has no prices at all**, so this ad quotes none. Do not add one without
the owner confirming the number — there is no source for it in this repo or on
the artwork.

Everything on screen comes off that flyer: the service name, the four
capabilities, "Mail-In & Mobile Service", "Jefferson, GA" and "MESSAGE US TO
BOOK". The one-line subtitles under each capability ("Powertrain control
modules", "Fault finding on the bench") are plain expansions of the flyer's own
four terms, not new claims; if any of them misstates the service, cut it back
to the bare term.

The end card carries the off-road / no-guarantee disclaimer from
`backend/src/services/brand/brand_profile.ts`, as the other two ads do.

## It is silent

The other two ads carry real exhaust audio from their source clips. There is no
audio source for this service, so the file has a silent track of the exact
video length — well-formed for players and Meta's uploader, and fine for muted
autoplay, but flat with sound on.

## Colours and type

Accent `#A8EB00`, the logo green, now also set as `accentColor` in
`brand_profile.ts`. Helpers (`styled`, `vgrad`, `C.ground`, the metal and
accent gradients) are lifted from `facebook-charger-pcm-ad/render/gen_charger.py`
so all three ads match. The CTA button is near-black on lime; white on
`#A8EB00` fails contrast and should not be put back.

## Rebuilding

```bash
cd marketing/facebook-bench-unlock-ad/render
python3 -m venv .venv && .venv/bin/pip install Pillow
.venv/bin/python gen_bench.py     # writes frames916/ and frames45/
./build_bench.sh                  # renders into ../video and ../thumbnails
```

`gen_bench.py` needs Pillow and the fonts at the path set at its top.
`build_bench.sh` honours `FFMPEG`, `OUTDIR` and `THUMBDIR` and needs ffmpeg
with libx264. The frame directories are gitignored; only the finished videos
are committed.

Two things that cost time here and are worth knowing:

- The container's **system Pillow was broken** — it reported a version but its
  compiled core would not import, and a plain `pip install` did not fix it
  because the broken copy in `dist-packages` shadowed the new one. A venv was
  the way out, which is why the rebuild steps above start with one.
- `ffmpeg -i X` with no output file **exits 1 by design**. Under `set -e` with
  `pipefail` a bare `VAR=$(pipeline)` propagates that and kills the script
  silently. The duration probe in `build_bench.sh` swallows it explicitly, the
  same as the other two build scripts.
