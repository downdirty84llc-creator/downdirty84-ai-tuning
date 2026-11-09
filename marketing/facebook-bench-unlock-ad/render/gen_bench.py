#!/usr/bin/env python3
"""
Down Dirty 84 - Bench Unlock & Programming ad, frame/card generator.

Same visual system as the other two ads: pure black ground, brand green
(#A8EB00 from the logo), brushed-silver condensed italic display type, hex
texture. Helpers are lifted from gen_charger.py so all three ads match.

There is no bench footage, so the hero is drawn rather than filmed: a
stylised ECU under a bed-of-nails fixture with a scan sweeping down it,
which is what the Bench Unlock flyer actually pictures.

Copy is read off that flyer: the service name, "PCM / ECU / Diagnostics /
Calibration Support", "Mail-In & Mobile Service", "Jefferson, GA" and
"MESSAGE US TO BOOK". That flyer carries NO prices, so this ad quotes none.
"""
import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

FD = "/mnt/skills/examples/canvas-design/canvas-fonts"
ROOT = os.path.dirname(os.path.abspath(__file__))

BLACK = (0, 0, 0)
ACC = (168, 235, 0)
ACC_HOT = (196, 255, 51)
ACC_DK = (42, 61, 0)
WHITE = (255, 255, 255)
SILVER = (221, 221, 221)
GREY = (150, 155, 162)

DISP = "BigShoulders-Bold.ttf"
MONO = "GeistMono-Bold.ttf"
BODY = "InstrumentSans-Bold.ttf"
BODYR = "InstrumentSans-Regular.ttf"
SHEAR = 0.20


def f(n, s):
    return ImageFont.truetype(os.path.join(FD, n), max(1, int(s)))


def vgrad(size, stops):
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
        g = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        g.paste(glow + (255,), (0, 0), layer.split()[3])
        g = g.filter(ImageFilter.GaussianBlur(int(th * 0.16)))
        out = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        out.alpha_composite(Image.blend(Image.new("RGBA", (W, H), (0, 0, 0, 0)), g, 0.75))
        out.alpha_composite(layer)
        layer = out
    return layer, pad


def put(canvas, xy, layer, pad):
    canvas.alpha_composite(layer, (int(xy[0] - pad), int(xy[1] - pad)))


class C:
    def __init__(s, w, h, out):
        s.W, s.H, s.OUT = w, h, out
        s.M = int(w * 0.075)
        s.s = w / 1080.0
        os.makedirs(out, exist_ok=True)

    def save(s, img, n):
        img.convert("RGB").save(os.path.join(s.OUT, n), quality=95)

    def overlay(s):
        return Image.new("RGBA", (s.W, s.H), (0, 0, 0, 0))

    def ground(s):
        img = Image.new("RGBA", (s.W, s.H), BLACK + (255,))
        d = ImageDraw.Draw(img)
        S = s.s
        step = int(58 * S)
        for row, y in enumerate(range(-step, s.H + step, int(step * 0.87))):
            off = 0 if row % 2 == 0 else step // 2
            for x in range(-step + off, s.W + step, step):
                d.regular_polygon((x, y, int(step * 0.46)), 6, rotation=90,
                                  outline=(19, 19, 21), width=max(1, int(2 * S)))
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


# ─────────────────────────── the drawn hero ───────────────────────────

def draw_board(img, c, lit):
    """A stylised ECU under a bed-of-nails fixture, as the flyer pictures it.

    `lit` draws the same geometry energised; the frame loop composites the
    lit copy above the scan line so the board wakes up as the sweep passes.
    """
    S = c.s
    d = ImageDraw.Draw(img)
    L = int(120 * S); R = int(960 * S)
    # Height-relative: the lower third has to stay clear for the headline,
    # and 4:5 is a much shorter frame than 9:16 at the same width.
    T = int(c.H * 0.24); B = int(c.H * 0.62)

    pcb      = (16, 26, 10) if not lit else (26, 44, 12)
    trace    = (46, 70, 6)  if not lit else ACC
    pad_col  = (58, 84, 10) if not lit else ACC_HOT
    edge     = (52, 76, 8)  if not lit else ACC
    chip     = (10, 12, 10) if not lit else (18, 24, 12)
    pin_col  = (96, 102, 96) if not lit else ACC_HOT

    # board
    d.rounded_rectangle([L, T, R, B], int(18 * S), fill=pcb,
                        outline=edge, width=max(2, int(3 * S)))

    # traces: a few long runs with right-angle turns
    for i, y in enumerate(range(T + int(70 * S), B - int(60 * S), int(62 * S))):
        d.line([L + int(40 * S), y, R - int(150 * S), y], fill=trace, width=max(2, int(4 * S)))
        if i % 2 == 0:
            d.line([R - int(150 * S), y, R - int(150 * S), y + int(44 * S)],
                   fill=trace, width=max(2, int(4 * S)))
    for x in range(L + int(80 * S), R - int(80 * S), int(104 * S)):
        d.line([x, T + int(40 * S), x, T + int(150 * S)], fill=trace, width=max(2, int(3 * S)))

    # vias / pads
    for y in range(T + int(70 * S), B - int(60 * S), int(62 * S)):
        for x in range(L + int(58 * S), R - int(140 * S), int(104 * S)):
            r = int(6 * S)
            d.ellipse([x - r, y - r, x + r, y + r], fill=pad_col)

    # the main IC, with pin teeth down each side
    cx0, cy0 = L + int(210 * S), T + int(300 * S)
    cx1, cy1 = R - int(240 * S), T + int(520 * S)
    d.rounded_rectangle([cx0, cy0, cx1, cy1], int(10 * S), fill=chip,
                        outline=edge, width=max(2, int(3 * S)))
    for y in range(cy0 + int(22 * S), cy1 - int(10 * S), int(26 * S)):
        d.rectangle([cx0 - int(16 * S), y, cx0, y + int(10 * S)], fill=pin_col)
        d.rectangle([cx1, y, cx1 + int(16 * S), y + int(10 * S)], fill=pin_col)
    d.text((cx0 + int(26 * S), cy0 + int(26 * S)), "ECU",
           font=f(MONO, 52 * S), fill=(70, 80, 70) if not lit else ACC)

    # the vehicle-side connector block along the bottom edge
    k0, k1 = L + int(90 * S), R - int(90 * S)
    d.rounded_rectangle([k0, B - int(96 * S), k1, B - int(16 * S)], int(8 * S),
                        fill=(8, 10, 8), outline=edge, width=max(2, int(3 * S)))
    for x in range(k0 + int(18 * S), k1 - int(14 * S), int(24 * S)):
        d.rectangle([x, B - int(80 * S), x + int(10 * S), B - int(34 * S)], fill=pin_col)

    # bed-of-nails fixture: probe tips pressing the upper board, wires off-frame
    for i, x in enumerate(range(L + int(60 * S), R - int(40 * S), int(46 * S))):
        for j, y in enumerate(range(T + int(46 * S), T + int(250 * S), int(46 * S))):
            r = int(7 * S)
            d.ellipse([x - r, y - r, x + r, y + r], fill=pin_col)
        if i % 3 == 0:
            d.line([x, 0, x, T + int(46 * S)], fill=(40, 44, 40) if not lit else (70, 96, 20),
                   width=max(1, int(3 * S)))
    return img


def hero_frames(c, n_frames, out_dir):
    """Scan sweeps down the board; everything it passes is energised."""
    os.makedirs(out_dir, exist_ok=True)
    S, W, H = c.s, c.W, c.H

    base, _ = c.ground(); draw_board(base, c, lit=False)
    lit, _ = c.ground();  draw_board(lit, c, lit=True)

    # text overlays, faded in over the animation
    ov1 = c.overlay()
    d1 = ImageDraw.Draw(ov1)
    c.scrim(ov1, 0.56, 0.86)
    y = H - int(H * 0.15) - int(300 * S)
    c.rule(d1, c.M, int(y + 13 * S), int(52 * S))
    d1.text((c.M + int(74 * S), y), "PCM  ECU  DIAGNOSTICS", font=f(MONO, 34 * S), fill=ACC_HOT)
    y += int(60 * S)
    lay, pad = styled("BENCH UNLOCK", f(DISP, 104 * S), METAL)
    put(ov1, (c.M, y), lay, pad); y += int(104 * S)
    lay, pad = styled("& PROGRAMMING", f(DISP, 104 * S), ACC_GRAD, glow=ACC_DK)
    put(ov1, (c.M, y), lay, pad)

    T = int(H * 0.24); B = int(H * 0.62)
    for i in range(n_frames):
        p = i / max(1, n_frames - 1)
        scan_y = int(T - 120 * S + (B - T + 260 * S) * min(1.0, p / 0.78))

        frame = base.copy()
        mask = Image.new("L", (W, H), 0)
        ImageDraw.Draw(mask).rectangle([0, 0, W, scan_y], fill=255)
        frame.paste(lit, (0, 0), mask)

        if p < 0.82:
            glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
            gd = ImageDraw.Draw(glow)
            gd.rectangle([0, scan_y - int(5 * S), W, scan_y + int(5 * S)], fill=ACC + (235,))
            glow = glow.filter(ImageFilter.GaussianBlur(int(16 * S)))
            frame.alpha_composite(glow)
            gd2 = ImageDraw.Draw(frame)
            gd2.rectangle([0, scan_y - int(2 * S), W, scan_y + int(2 * S)], fill=ACC_HOT)

        a = max(0.0, min(1.0, (p - 0.22) / 0.18))
        if a > 0:
            o = ov1.copy()
            o.putalpha(o.split()[3].point(lambda v: int(v * a)))
            frame.alpha_composite(o)

        c.save(frame, os.path.join(out_dir, "h_%04d.jpg" % i))
    return n_frames


# ─────────────────────────────── cards ───────────────────────────────

CAPS = [
    ("PCM", "Powertrain control modules"),
    ("ECU", "Engine control units"),
    ("DIAGNOSTICS", "Fault finding on the bench"),
    ("CALIBRATION SUPPORT", "Help with the tune itself"),
]


def build(W, H, out):
    c = C(W, H, out)
    M, S = c.M, c.s

    def kick(d, y, text, size=38):
        c.rule(d, M, int(y + size * S * 0.36), int(52 * S))
        d.text((M + int(74 * S), y), text, font=f(MONO, size * S), fill=ACC_HOT)
        return y + size * S + 24 * S

    def head(img, y, text, size, stops=METAL, glow=None, lead=0.96):
        for ln in text.split("\n"):
            lay, pad = styled(ln, f(DISP, size * S), stops, glow=glow)
            put(img, (M, y), lay, pad)
            y += size * S * lead
        return y

    # A — what comes across the bench, revealed one at a time
    def cap_card(n):
        img, d = c.ground()
        y = max(H * 0.07, (H - 920 * S) / 2)
        y = kick(d, y, "WHAT WE WORK ON")
        y = head(img, y, "OFF THE CAR,", 100)
        y = head(img, y, "ON THE BENCH.", 100, stops=ACC_GRAD, glow=ACC_DK)
        y += 56 * S
        for i, (title, sub) in enumerate(CAPS):
            on = i < n
            c.rule(d, M, int(y + 24 * S), int(30 * S)) if on else d.rectangle(
                [M, y + 24 * S, M + 30 * S, y + 24 * S + 5 * S], fill=(38, 52, 0))
            d.text((M + int(58 * S), y), title, font=f(BODY, 52 * S),
                   fill=WHITE if on else (52, 60, 44))
            d.text((M + int(58 * S), y + 62 * S), sub, font=f(BODYR, 34 * S),
                   fill=GREY if on else (44, 52, 38))
            y += 124 * S
        return img

    for i, n in enumerate([1, 2, 3, 4], 1):
        c.save(cap_card(n), "b_cap%d.jpg" % i)

    # B — how the work reaches you
    img, d = c.ground()
    y = max(H * 0.07, (H - 700 * S) / 2)
    y = kick(d, y, "HOW IT REACHES US")
    y = head(img, y, "MAIL IT IN,", 104)
    y = head(img, y, "OR WE COME", 104)
    y = head(img, y, "TO YOU.", 104, stops=ACC_GRAD, glow=ACC_DK)
    y += 58 * S
    for t in ["MAIL-IN SERVICE", "MOBILE SERVICE", "JEFFERSON, GA"]:
        c.rule(d, M, int(y + 22 * S), int(30 * S))
        d.text((M + int(58 * S), y), t, font=f(BODY, 50 * S), fill=WHITE)
        y += 82 * S
    c.save(img, "b_reach.jpg")

    # C — call to action
    img, d = c.ground()
    y = max(H * 0.06, (H - 132 * S - 884 * S) / 2)
    lay, pad = styled("DOWN DIRTY", f(DISP, 116 * S), METAL)
    put(img, (M, y), lay, pad); y += 124 * S
    lay, pad = styled("84", f(DISP, 168 * S), ACC_GRAD, glow=ACC_DK)
    put(img, (M, y), lay, pad); y += 196 * S
    c.rule(d, M, int(y), int(190 * S), int(7 * S)); y += 46 * S
    d.text((M, y), "BENCH UNLOCK & PROGRAMMING", font=f(MONO, 38 * S), fill=WHITE); y += 52 * S
    d.text((M, y), "PCM  ECU  DIAGNOSTICS  CALIBRATION", font=f(MONO, 32 * S), fill=GREY)
    y += 96 * S
    d.rounded_rectangle([M, y, W - M, y + 172 * S], int(12 * S), fill=ACC)
    d.rounded_rectangle([M + int(9 * S), y + int(9 * S), W - M - int(9 * S), y + 163 * S],
                        int(9 * S), outline=(36, 50, 0), width=max(1, int(2 * S)))
    lay, pad = styled("MESSAGE US TO BOOK", f(DISP, 72 * S),
                      [(0, (8, 12, 0)), (1, (26, 34, 4))])
    put(img, (M + int(46 * S), y + int(46 * S)), lay, pad)
    y += 224 * S
    lay, pad = styled("downdirty84llc.com", f(DISP, 78 * S), METAL, shear=0)
    put(img, (M, y), lay, pad); y += 100 * S
    d.text((M, y), "Jefferson, GA  -  Mail-in & mobile service",
           font=f(BODYR, 38 * S), fill=GREY)
    fo = f(BODYR, 28 * S)
    d.text((M, H - 132 * S), "Off-road / motorsports use only where permitted.",
           font=fo, fill=(96, 98, 104))
    d.text((M, H - 94 * S), "No performance, reliability or emissions-compliance guarantee.",
           font=fo, fill=(96, 98, 104))
    c.save(img, "b_cta.jpg")

    print("cards %dx%d -> %s" % (W, H, out))
    return c


if __name__ == "__main__":
    for w, h, sub in [(1080, 1920, "frames916"), (1080, 1350, "frames45")]:
        c = build(w, h, os.path.join(ROOT, sub))
        n = hero_frames(c, 138, os.path.join(ROOT, sub, "hero"))
        print("  hero frames:", n)
