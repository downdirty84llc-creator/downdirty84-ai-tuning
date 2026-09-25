#!/usr/bin/env python3
"""
Down Dirty 84 - Charger & Challenger unlocked-PCM ad, overlay/card generator.

Visual system is taken from DD84's own flyers, not invented: pure black ground,
brand green (#A8EB00, sampled off the DD84 logo), brushed-silver display type,
heavy condensed uppercase sheared into italic, red angular slashes, hex ground.

Copy is taken from the Charger/Challenger flyer. Prices, the VIN requirement,
the feature list, the CTA and "Jefferson, GA" are all read off that artwork.
Nothing is invented.
"""
import os
from PIL import Image, ImageDraw, ImageFont

FD = "/mnt/skills/examples/canvas-design/canvas-fonts"
ROOT = os.path.dirname(os.path.abspath(__file__))

BLACK = (0, 0, 0)
ACC = (168, 235, 0)        # #A8EB00, sampled from the DD84 logo
ACC_HOT = (196, 255, 51)   # #C4FF33
ACC_DK = (42, 61, 0)       # #2A3D00
WHITE = (255, 255, 255)
SILVER = (221, 221, 221)
GREY = (150, 155, 162)

DISP = "BigShoulders-Bold.ttf"
MONO = "GeistMono-Bold.ttf"
BODY = "InstrumentSans-Bold.ttf"
BODYR = "InstrumentSans-Regular.ttf"
SHEAR = 0.20          # italic lean, matches the flyer display face


def f(n, s):
    return ImageFont.truetype(os.path.join(FD, n), max(1, int(s)))


def vgrad(size, stops):
    """Vertical gradient from (pos, rgb) stops."""
    w, h = size
    g = Image.new("RGB", (1, h))
    px = g.load()
    for y in range(h):
        p = y / max(1, h - 1)
        for i in range(len(stops) - 1):
            p0, c0 = stops[i]
            p1, c1 = stops[i + 1]
            if p0 <= p <= p1:
                t = (p - p0) / max(1e-6, p1 - p0)
                px[0, y] = tuple(int(c0[j] + (c1[j] - c0[j]) * t) for j in range(3))
                break
        else:
            px[0, y] = stops[-1][1]
    return g.resize((w, h))


METAL = [(0.0, (255, 255, 255)), (0.30, (206, 209, 214)), (0.52, (120, 126, 134)),
         (0.58, (236, 238, 241)), (1.0, (138, 144, 152))]
ACC_GRAD = [(0.0, (206, 255, 72)), (0.45, (168, 235, 0)), (0.55, (216, 255, 96)),
           (1.0, (92, 134, 0))]


def styled(text, font, stops, shear=SHEAR, glow=None):
    """Render text filled with a gradient, sheared into italic. Returns RGBA."""
    tmp = Image.new("L", (8, 8))
    d = ImageDraw.Draw(tmp)
    box = d.textbbox((0, 0), text, font=font)
    tw, th = box[2] - box[0], box[3] - box[1]
    pad = int(th * 0.45) + 12
    W = tw + pad * 2 + int(th * shear) + 2
    H = th + pad * 2
    mask = Image.new("L", (W, H), 0)
    ImageDraw.Draw(mask).text((pad - box[0], pad - box[1]), text, font=font, fill=255)
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    layer.paste(vgrad((W, H), stops), (0, 0))
    layer.putalpha(mask)
    if shear:
        layer = layer.transform((W, H), Image.AFFINE, (1, shear, -shear * H, 0, 1, 0),
                                resample=Image.BICUBIC)
    if glow:
        from PIL import ImageFilter
        g = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        g.paste(glow + (255,), (0, 0), layer.split()[3])
        g = g.filter(ImageFilter.GaussianBlur(int(th * 0.16)))
        out = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        out.alpha_composite(Image.blend(Image.new("RGBA", (W, H), (0, 0, 0, 0)), g, 0.75))
        out.alpha_composite(layer)
        layer = out
    return layer, pad


def put(canvas, xy, layer, pad):
    """Paste a styled() layer so xy is the visual top-left of the glyphs."""
    canvas.alpha_composite(layer, (int(xy[0] - pad), int(xy[1] - pad)))


class C:
    def __init__(s, w, h, out):
        s.W, s.H, s.OUT = w, h, out
        s.M = int(w * 0.075)
        s.s = w / 1080.0
        os.makedirs(out, exist_ok=True)

    def save(s, img, n):
        img.save(os.path.join(s.OUT, n))

    def overlay(s):
        return Image.new("RGBA", (s.W, s.H), (0, 0, 0, 0))

    def ground(s):
        """Black card with hex texture, red corner slashes and a top rule."""
        img = Image.new("RGBA", (s.W, s.H), BLACK + (255,))
        d = ImageDraw.Draw(img)
        S = s.s
        # hex-ish grid, very low contrast
        step = int(58 * S)
        for row, y in enumerate(range(-step, s.H + step, int(step * 0.87))):
            off = 0 if row % 2 == 0 else step // 2
            for x in range(-step + off, s.W + step, step):
                d.regular_polygon((x, y, int(step * 0.46)), 6, rotation=90,
                                  outline=(19, 19, 21), width=max(1, int(2 * S)))
        # red top rule + angular slashes
        d.rectangle([0, 0, s.W, int(7 * S)], fill=ACC)
        for i in range(3):
            x = s.W - int((150 - i * 52) * S)
            d.polygon([(x, int(40 * S)), (x + int(34 * S), int(40 * S)),
                       (x - int(18 * S), int(128 * S)), (x - int(52 * S), int(128 * S))],
                      fill=(20, 30, 0))
        return img, d

    def scrim(s, img, top, bot, strength=252):
        g = Image.new("L", (1, s.H), 0)
        px = g.load()
        y0, y1 = int(s.H * top), int(s.H * bot)
        for y in range(s.H):
            px[0, y] = 0 if y < y0 else max(0, min(255, int(strength * (y - y0) / max(1, y1 - y0))))
        img.alpha_composite(Image.merge("RGBA", (Image.new("L", (s.W, s.H), 0),
                                                 Image.new("L", (s.W, s.H), 0),
                                                 Image.new("L", (s.W, s.H), 0),
                                                 g.resize((s.W, s.H)))))

    def rule(s, d, x, y, w, h=None):
        h = h or max(2, int(5 * s.s))
        d.rectangle([x, y, x + w, y + h], fill=ACC)

    def wrap(s, d, text, font, maxw):
        out = []
        for para in text.split("\n"):
            line = ""
            for w in para.split(" "):
                t = (line + " " + w).strip()
                if d.textlength(t, font=font) <= maxw or not line:
                    line = t
                else:
                    out.append(line); line = w
            out.append(line)
        return out


def build(W, H, out):
    c = C(W, H, out)
    M, S = c.M, c.s
    BOT = int(H * (0.15 if H / W > 1.5 else 0.09))

    def kick(img, d, y, text, size=36):
        c.rule(d, M, int(y + size * S * 0.36), int(52 * S))
        d.text((M + int(74 * S), y), text, font=f(MONO, size * S), fill=ACC_HOT)
        return y + size * S + 24 * S

    def head(img, y, text, size, stops=METAL, lead=0.96, glow=None):
        fo = f(DISP, size * S)
        for ln in text.split("\n"):
            lay, pad = styled(ln, fo, stops, glow=glow)
            put(img, (M, y), lay, pad)
            y += size * S * lead
        return y

    def body(d, y, text, size=38, col=SILVER, lead=1.34, maxw=None):
        fo = f(BODYR, size * S)
        for ln in c.wrap(d, text, fo, maxw or (W - 2 * M)):
            d.text((M, y), ln, font=fo, fill=col)
            y += size * S * lead
        return y

    # ───────── overlays over footage ─────────

    # 1 HERO — what the car is
    o = c.overlay(); c.scrim(o, 0.34, 0.88); d = ImageDraw.Draw(o)
    y = H - BOT - 300 * S
    y = kick(o, d, y, "2015 & NEWER")
    head(o, y, "CHARGER &\nCHALLENGER", 118, glow=ACC_DK)
    c.save(o, "c_ov1.png")

    # 2 PROBLEM
    o = c.overlay(); c.scrim(o, 0.34, 0.90); d = ImageDraw.Draw(o)
    y = H - BOT - 330 * S
    y = kick(o, d, y, "V6 & V8")
    y = head(o, y, "YOUR PCM", 124)
    head(o, y, "IS LOCKED.", 124, stops=ACC_GRAD, glow=ACC_DK)
    c.save(o, "c_ov2.png")

    # ───────── cards ─────────

    # A — the answer
    img, d = c.ground()
    # 60 kick + 2 heads at 128*.96 + 54 gap + 3 rows of 82
    y = max(H * 0.07, (H - 606 * S) / 2)
    y = kick(img, d, y, "NOT ANY MORE")
    y = head(img, y, "WE SHIP IT", 128)
    y = head(img, y, "UNLOCKED.", 128, stops=ACC_GRAD, glow=ACC_DK)
    y += 54 * S
    for t in ["UNLOCKED PCM", "PRE-TUNED", "PLUG & PLAY"]:
        c.rule(d, M, int(y + 22 * S), int(30 * S))
        d.text((M + int(56 * S), y), t, font=f(BODY, 52 * S), fill=WHITE)
        y += 82 * S
    c.save(img, "c_cardA.png")

    # B — features, progressive
    FEATS = [
        "PCM already unlocked and tuned",
        "Built for CAI + exhaust",
        "Street performance calibration",
        "Pops & bangs available",
        "Plug-and-play setup",
        "V6 & V8 applications",
    ]

    def feat_card(n):
        img, d = c.ground()
        # 60 kick + 2 heads at 104*.96 + 46 gap + 6 rows of 74
        y = max(H * 0.07, (H - 750 * S) / 2)
        y = kick(img, d, y, "WHAT YOU GET")
        y = head(img, y, "BUILT TO", 104)
        y = head(img, y, "BOLT IN.", 104, stops=ACC_GRAD)
        y += 46 * S
        for i, t in enumerate(FEATS):
            on = i < n
            c.rule(d, M, int(y + 20 * S), int(26 * S)) if on else d.rectangle(
                [M, y + 20 * S, M + 26 * S, y + 20 * S + 5 * S], fill=(38, 52, 0))
            d.text((M + int(52 * S), y), t, font=f(BODYR, 42 * S),
                   fill=SILVER if on else (52, 54, 58))
            y += 74 * S
        return img

    for i, n in enumerate([2, 4, 6], 1):
        c.save(feat_card(n), "c_cardB%d.png" % i)

    # C — pricing
    img, d = c.ground()
    # 60 kick + 2 heads at 100*.96 + 50 gap + 3 rows of 238 + footnote
    y = max(H * 0.06, (H - 1070 * S) / 2)
    y = kick(img, d, y, "SETUP PRICING")
    y = head(img, y, "THREE WAYS", 100)
    y = head(img, y, "TO ORDER.", 100, stops=ACC_GRAD)
    y += 50 * S
    ROWS = [("CUSTOMER PCM", "Street tune", "$650"),
            ("CUSTOMER PCM", "Street tune + pops & bangs", "$700"),
            ("PCM INCLUDED", "Tune + VIN programming", "$1000")]
    for title, sub, price in ROWS:
        d.rounded_rectangle([M, y, W - M, y + 208 * S], int(14 * S),
                            fill=(13, 13, 15), outline=(52, 74, 0), width=max(2, int(3 * S)))
        c.rule(d, M, int(y), int(120 * S), int(5 * S))
        d.text((M + int(36 * S), y + 34 * S), title, font=f(BODY, 46 * S), fill=WHITE)
        d.text((M + int(36 * S), y + 96 * S), sub, font=f(BODYR, 36 * S), fill=GREY)
        pf = f(DISP, 104 * S)
        lay, pad = styled(price, pf, ACC_GRAD, glow=ACC_DK)
        put(img, (W - M - int(36 * S) - (lay.width - 2 * pad), y + 46 * S), lay, pad)
        y += 238 * S
    y += 8 * S
    d.text((M, y), "VIN required to complete purchase.", font=f(BODYR, 36 * S), fill=GREY)
    c.save(img, "c_cardC.png")

    # D — CTA
    img, d = c.ground()
    # wordmark through the location line is ~884S; disclaimer pinned at H-132S
    y = max(H * 0.06, (H - 132 * S - 884 * S) / 2)
    lay, pad = styled("DOWN DIRTY", f(DISP, 116 * S), METAL)
    put(img, (M, y), lay, pad); y += 124 * S
    lay, pad = styled("84", f(DISP, 168 * S), ACC_GRAD, glow=ACC_DK)
    put(img, (M, y), lay, pad); y += 196 * S
    c.rule(d, M, int(y), int(190 * S), int(7 * S)); y += 46 * S
    d.text((M, y), "PERFORMANCE CALIBRATION", font=f(MONO, 38 * S), fill=WHITE); y += 52 * S
    d.text((M, y), "PCM UNLOCKING  ·  STREET-TUNED POWER", font=f(MONO, 34 * S), fill=GREY)
    y += 96 * S
    # CTA button
    d.rounded_rectangle([M, y, W - M, y + 172 * S], int(12 * S), fill=ACC)
    d.rounded_rectangle([M + int(9 * S), y + int(9 * S), W - M - int(9 * S), y + 163 * S],
                        int(9 * S), outline=(36, 50, 0), width=max(1, int(2 * S)))
    # Near-black on lime: white on #A8EB00 fails contrast badly.
    lay, pad = styled("MESSAGE TO ORDER", f(DISP, 76 * S),
                      [(0, (8, 12, 0)), (1, (26, 34, 4))])
    put(img, (M + int(46 * S), y + int(44 * S)), lay, pad)
    y += 224 * S
    lay, pad = styled("downdirty84llc.com", f(DISP, 78 * S), METAL, shear=0)
    put(img, (M, y), lay, pad); y += 100 * S
    d.text((M, y), "Jefferson, GA  ·  Mail-in & mobile service", font=f(BODYR, 38 * S), fill=GREY)
    fo = f(BODYR, 28 * S)
    d.text((M, H - 132 * S), "Off-road / motorsports use only where permitted.", font=fo, fill=(96, 98, 104))
    d.text((M, H - 94 * S), "No performance, reliability or emissions-compliance guarantee.", font=fo, fill=(96, 98, 104))
    c.save(img, "c_cardD.png")

    print("built %dx%d -> %s" % (W, H, out))


if __name__ == "__main__":
    build(1080, 1920, os.path.join(ROOT, "ccards"))
    build(1080, 1350, os.path.join(ROOT, "ccards_4x5"))
