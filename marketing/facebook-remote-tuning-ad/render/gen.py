#!/usr/bin/env python3
"""
Down Dirty 84 - Facebook ad overlay/card generator.

Renders RGBA overlays that composite onto the footage, plus opaque cards,
at any frame size. Overlay text is bottom-anchored and card text is
anchored to a fraction of the height, so 9:16 and 4:5 both lay out
correctly from one set of definitions.

Every factual claim is sourced from the DD84 codebase:
  brand_profile.ts ... name, site, email
  stripe_catalog.ts .. service names and prices
  README.md ......... pipeline, HP Tuners / Holley, same-day priority
  ANALYSIS-ENGINE.md  canonical channels
Nothing here is invented.
"""
import os
from PIL import Image, ImageDraw, ImageFont

FD = "/mnt/skills/examples/canvas-design/canvas-fonts"
ROOT = os.path.dirname(os.path.abspath(__file__))

INK = (11, 15, 20)          # #0B0F14  from the product's styles.css
PANEL = (17, 24, 39)        # #111827  "
WHITE = (255, 255, 255)
TEXT = (229, 231, 235)      # #E5E7EB  "
MUTED = (156, 163, 175)     # #9CA3AF  "
ACCENT = (255, 122, 24)     # #FF7A18  chosen here; brand defines no accent
GO = (53, 212, 97)

DISP = "BigShoulders-Bold.ttf"
MONO = "GeistMono-Bold.ttf"
BODYR = "InstrumentSans-Regular.ttf"


def f(name, size):
    return ImageFont.truetype(os.path.join(FD, name), int(size))


class Canvas:
    def __init__(self, w, h, out):
        self.W, self.H, self.OUT = w, h, out
        self.M = int(w * 0.078)
        self.s = w / 1080.0
        os.makedirs(out, exist_ok=True)

    def save(self, img, name):
        img.save(os.path.join(self.OUT, name))

    def overlay(self):
        return Image.new("RGBA", (self.W, self.H), (0, 0, 0, 0))

    def card(self):
        img = Image.new("RGBA", (self.W, self.H), INK + (255,))
        ImageDraw.Draw(img).rectangle([0, 0, self.W, 8], fill=ACCENT)
        return img, ImageDraw.Draw(img)

    def scrim(self, img, top_frac, bot_frac, strength=250):
        g = Image.new("L", (1, self.H), 0)
        px = g.load()
        y0, y1 = int(self.H * top_frac), int(self.H * bot_frac)
        for y in range(self.H):
            v = 0 if y < y0 else int(strength * ((y - y0) / max(1, y1 - y0)))
            px[0, y] = max(0, min(255, v))
        g = g.resize((self.W, self.H))
        img.alpha_composite(Image.merge("RGBA", (
            Image.new("L", (self.W, self.H), INK[0]),
            Image.new("L", (self.W, self.H), INK[1]),
            Image.new("L", (self.W, self.H), INK[2]), g)))

    def wrap(self, d, text, font, maxw):
        out = []
        for para in text.split("\n"):
            line = ""
            for w in para.split(" "):
                t = (line + " " + w).strip()
                if d.textlength(t, font=font) <= maxw or not line:
                    line = t
                else:
                    out.append(line)
                    line = w
            out.append(line)
        return out


def build(W, H, out):
    c = Canvas(W, H, out)
    M, S = c.M, c.s
    # Bottom safe margin: Reels/Stories UI overlaps the lowest ~15%.
    BOT = int(H * (0.155 if H / W > 1.5 else 0.10))

    def kicker(d, y, text, size=34, color=ACCENT):
        fo = f(MONO, size * S)
        d.rectangle([M, y + size * S * .30, M + 56 * S, y + size * S * .30 + 6 * S], fill=color)
        d.text((M + 76 * S, y), text, font=fo, fill=color)
        return y + size * S + 26 * S

    def disp_block(d, y, text, size, color=WHITE, lead=1.02):
        fo = f(DISP, size * S)
        for ln in c.wrap(d, text, fo, W - 2 * M):
            d.text((M, y), ln, font=fo, fill=color)
            y += int(size * S * lead)
        return y

    def measure(text, size, lead=1.02):
        return len(text.split("\n")) * size * S * lead

    # ---------- overlays (bottom-anchored) ----------

    o = c.overlay(); c.scrim(o, 0.30, 0.86); d = ImageDraw.Draw(o)
    y = H - BOT - measure("A\nB\nC", 132) - 60 * S
    y = kicker(d, y, "REMOTE ECM CALIBRATION")
    disp_block(d, y, "STILL WAITING\nON YOUR\nTUNER?", 132)
    c.save(o, "ov1_hook.png")

    o = c.overlay(); c.scrim(o, 0.30, 0.86); d = ImageDraw.Draw(o)
    lines = ["NO SHOP APPOINTMENT.", "NO DYNO DAY.", "NO SHIPPING YOUR ECU."]
    y = H - BOT - len(lines) * 116 * S
    for ln in lines:
        d.rectangle([M, y + 26 * S, M + 40 * S, y + 34 * S], fill=ACCENT)
        d.text((M + 68 * S, y - 6 * S), ln, font=f(DISP, 82 * S), fill=WHITE)
        y += 116 * S
    c.save(o, "ov2_setup.png")

    o = c.overlay(); d = ImageDraw.Draw(o)
    fo = f(MONO, 44 * S); t = "GREEN LIGHT"
    tw = d.textlength(t, font=fo)
    bx, by = M, H - BOT - 160 * S
    d.rounded_rectangle([bx, by, bx + tw + 108 * S, by + 92 * S], 12,
                        fill=(0, 0, 0, 205), outline=GO, width=3)
    d.ellipse([bx + 30 * S, by + 32 * S, bx + 58 * S, by + 60 * S], fill=GO)
    d.text((bx + 76 * S, by + 22 * S), t, font=fo, fill=GO)
    c.save(o, "ov3_green.png")

    o = c.overlay(); c.scrim(o, 0.30, 0.88); d = ImageDraw.Draw(o)
    y = H - BOT - measure("A\nB", 142) - 60 * S
    y = kicker(d, y, "INSTEAD OF WAITING")
    disp_block(d, y, "SEND A\nDATALOG.", 142)
    c.save(o, "ov4_payoff.png")

    o = c.overlay(); c.scrim(o, 0.34, 0.90); d = ImageDraw.Draw(o)
    y = H - BOT - 250 * S
    d.text((M, y), "DOWN DIRTY 84", font=f(DISP, 128 * S), fill=WHITE)
    y += 148 * S
    d.text((M, y), "PERFORMANCE ECM TUNING  " + chr(183) + "  ATLANTA, GA",
           font=f(MONO, 34 * S), fill=ACCENT)
    y += 54 * S
    d.text((M, y), "REMOTE & IN-PERSON", font=f(MONO, 34 * S), fill=MUTED)
    c.save(o, "ov5_brand.png")

    # ---------- cards ----------

    STEPS = [
        ("01", "UPLOAD YOUR LOG", "HP Tuners or Holley CSV. Tell us the fuel and induction."),
        ("02", "WE READ IT", "Knock retard, wideband AFR, fuel trims, MAF, temps, fuel pressure."),
        ("03", "YOU GET A CHANGE LIST", "Written findings plus a CSV of proposed changes. Reviewed before release."),
    ]

    def process_card(n):
        img, d = c.card()
        # 60 kicker + 114 headline + 70 gap + 3 rows of 262
        y = max(H * 0.06, (H - 1030 * S) / 2)
        y = kicker(d, y, "HOW IT WORKS", 38)
        y = disp_block(d, y, "THREE STEPS.", 112)
        y += 70 * S
        for i, (num, title, txt) in enumerate(STEPS):
            on = i < n
            d.text((M, y), num, font=f(MONO, 64 * S), fill=ACCENT if on else (38, 46, 58))
            d.text((M + 130 * S, y - 8 * S), title, font=f(DISP, 76 * S),
                   fill=WHITE if on else (52, 60, 72))
            fo = f(BODYR, 36 * S)
            yy = y + 82 * S
            for ln in c.wrap(d, txt, fo, W - M - 190 * S):
                d.text((M + 130 * S, yy), ln, font=fo, fill=MUTED if on else (44, 52, 64))
                yy += 36 * S * 1.34
            y += 262 * S
        return img

    for i in range(1, 4):
        c.save(process_card(i), "card_process_%d.png" % i)

    img, d = c.card()
    # 60 kicker + 114 headline + 46 gap + 2 rows of 292 + 56 footnote
    y = max(H * 0.06, (H - 860 * S) / 2)
    y = kicker(d, y, "START HERE", 38)
    y = disp_block(d, y, "WHAT IT COSTS.", 112)
    y += 46 * S
    for title, price, txt in [
        ("LOG REVIEW", "$39", "Written review: findings, evidence, change list."),
        ("PRIORITY LOG REVIEW", "$99", "Front of the queue. Same-day turnaround."),
    ]:
        d.rounded_rectangle([M, y, W - M, y + 250 * S], 16, fill=PANEL,
                            outline=(32, 41, 56), width=2)
        d.text((M + 44 * S, y + 40 * S), title, font=f(DISP, 66 * S), fill=WHITE)
        pf = f(DISP, 96 * S)
        d.text((W - M - 44 * S - d.textlength(price, font=pf), y + 26 * S),
               price, font=pf, fill=ACCENT)
        d.text((M + 44 * S, y + 132 * S), txt, font=f(BODYR, 36 * S), fill=MUTED)
        y += 292 * S
    y += 10 * S
    d.text((M, y), "Stage 1 NA and Stage 1 Boosted also available.",
           font=f(BODYR, 36 * S), fill=MUTED)
    c.save(img, "card_offer.png")

    img, d = c.card()
    # Wordmark through email is ~1012S tall; the disclaimer is pinned at
    # H-152S, so centre the block in what is left of the frame.
    y = max(H * 0.06, (H - 152 * S - 1012 * S) / 2)
    d.text((M, y), "DOWN", font=f(DISP, 186 * S), fill=WHITE)
    y += 168 * S
    d.text((M, y), "DIRTY 84", font=f(DISP, 186 * S), fill=ACCENT)
    y += 224 * S
    d.rectangle([M, y, M + 180 * S, y + 8 * S], fill=ACCENT)
    y += 58 * S
    d.text((M, y), "PERFORMANCE ECM TUNING", font=f(MONO, 44 * S), fill=WHITE)
    y += 62 * S
    d.text((M, y), "ATLANTA, GA  " + chr(183) + "  REMOTE & IN-PERSON",
           font=f(MONO, 40 * S), fill=MUTED)
    y += 132 * S
    d.rounded_rectangle([M, y, W - M, y + 168 * S], 14, fill=ACCENT)
    d.text((M + 48 * S, y + 44 * S), "GET YOUR LOG REVIEWED", font=f(DISP, 82 * S), fill=INK)
    y += 216 * S
    d.text((M, y), "downdirty84llc.com", font=f(DISP, 92 * S), fill=WHITE)
    y += 106 * S
    d.text((M, y), "Downdirty84llc@gmail.com", font=f(BODYR, 38 * S), fill=MUTED)
    fo = f(BODYR, 30 * S)
    d.text((M, H - 152 * S), "Off-road / motorsports use only where permitted.",
           font=fo, fill=(110, 118, 130))
    d.text((M, H - 110 * S), "No performance, reliability or emissions-compliance guarantee.",
           font=fo, fill=(110, 118, 130))
    c.save(img, "card_cta.png")

    print("built %dx%d -> %s" % (W, H, out))


if __name__ == "__main__":
    build(1080, 1920, os.path.join(ROOT, "cards"))       # 9:16 Reels / Stories
    build(1080, 1350, os.path.join(ROOT, "cards_4x5"))   # 4:5 feed
