from manim import *
import numpy as np
import os, wave

SR = 44100
ASSET_DIR = "assets"
os.makedirs(ASSET_DIR, exist_ok=True)

# ── Audio ──────────────────────────────────────────────────────
def write_wav(path, samples):
    samples = np.nan_to_num(samples)
    peak = np.max(np.abs(samples))
    if peak > 0: samples = samples / peak * 0.98
    with wave.open(path, 'w') as wf:
        wf.setnchannels(1); wf.setsampwidth(2); wf.setframerate(SR)
        wf.writeframes((samples * 32767).astype(np.int16).tobytes())

def gen_audio():
    dur = 11.0
    t = np.linspace(0, dur, int(SR * dur), False)
    d1 = np.sin(2 * np.pi * 65 * t) * 0.22
    d2 = np.sin(2 * np.pi * 98 * t) * 0.16
    d3 = np.sin(2 * np.pi * 131 * t) * 0.12
    d4 = np.sin(2 * np.pi * 165 * t) * 0.08
    lfo = 0.7 + 0.3 * np.sin(2 * np.pi * 0.15 * t)
    drone = (d1 + d2 + d3 + d4) * lfo
    pad = np.sin(2 * np.pi * 220 * t) * 0.03 + np.sin(2 * np.pi * 330 * t) * 0.02
    pad *= 0.5 + 0.5 * np.sin(2 * np.pi * 0.08 * t)
    noise = np.random.normal(0, 0.015, len(t)) * (0.3 + 0.7 * np.sin(2 * np.pi * 0.05 * t + 1) ** 2)

    idx = lambda s: int(SR * s)
    whoosh = np.zeros(len(t))
    w = whoosh[:idx(1.2)]
    wn = np.random.normal(0, 1, len(w))
    we = np.exp(-((np.linspace(0,1.2,len(w)) - 0.2)**2) / (2*0.25**2))
    ww = np.sin(2 * np.pi * (100 + 800 * np.linspace(0,1,len(w))) * np.linspace(0,1.2,len(w)))
    whoosh[:len(w)] = wn * ww * we * 0.5

    impact = np.zeros(len(t))
    ii = idx(1.0)
    iw = min(len(t) - ii, idx(0.8))
    ir = np.linspace(0, 0.8, iw)
    impact[ii:ii+iw] = (np.sin(2*np.pi*50*ir)*np.exp(-ir*20)*0.5 + np.sin(2*np.pi*100*ir)*np.exp(-ir*18)*0.3 + np.sin(2*np.pi*2000*ir)*np.exp(-ir*300)*0.08)

    shimmer = np.zeros(len(t))
    si = idx(1.8)
    sw2 = min(len(t) - si, idx(0.8))
    sr2 = np.linspace(0, 0.8, sw2)
    sn = np.random.normal(0, 1, sw2)
    se = np.exp(-((sr2 - 0.15)**2) / (2*0.1**2))
    shimmer[si:si+sw2] = sn * np.sin(2 * np.pi * (800 + 2000 * sr2/0.8) * sr2) * se * 0.25

    swell = np.zeros(len(t))
    sl = idx(6.0)
    sw3 = min(len(t) - sl, idx(1.5))
    sr3 = np.linspace(0, 1.5, sw3)
    se2 = np.sin(np.pi * sr3 / 1.5) ** 2
    swell[sl:sl+sw3] = (np.sin(2*np.pi*65*sr3)*0.25 + np.sin(2*np.pi*130*sr3)*0.15 + np.sin(2*np.pi*260*sr3)*0.08 + np.random.normal(0,0.04,sw3)) * se2

    mix = (drone + pad + noise + whoosh + impact + shimmer + swell) * 5.0
    fade = np.ones_like(t)
    fade[:idx(0.2)] = np.linspace(0,1,idx(0.2))
    fade[-idx(0.4):] = np.linspace(1,0,idx(0.4))
    write_wav(os.path.join(ASSET_DIR, "audio.wav"), mix * fade)

ap = os.path.join(ASSET_DIR, "audio.wav")
if not os.path.exists(ap): gen_audio()

# ── Scene ──────────────────────────────────────────────────────
class LoadingAnimation(Scene):
    def construct(self):
        self.camera.background_color = "#020105"
        self.add_sound(ap)

        # Stars at different depths (size = depth cue)
        stars = VGroup()
        for _ in range(350):
            z = np.random.uniform(-5, 2)
            r = np.interp(z, [-5, 2], [0.002, 0.018])
            op = np.interp(z, [-5, 2], [0.06, 0.5])
            c = ["#604080", "#8060a0", "#9070c0", "#b090d0"][np.random.randint(0, 4)]
            dot = Dot(radius=r, color=c, fill_opacity=op)
            dot.move_to([np.random.uniform(-8, 8), np.random.uniform(-5, 5), 0])
            stars.add(dot)
        self.add(stars)

        # Glow haze
        haze = VGroup()
        for _ in range(60):
            g = Dot(radius=np.random.uniform(0.02, 0.06), color="#b090d0", fill_opacity=0.04)
            g.move_to([np.random.uniform(-9, 9), np.random.uniform(-5, 5), 0])
            haze.add(g)
        self.add(haze)

        # Black holes
        def bh(x, y, sc, hue):
            g = VGroup()
            for r,w,o in [(1.2*sc,0.8,0.04),(0.9*sc,1.2,0.07),(0.6*sc,1.5,0.12)]:
                g.add(Circle(radius=r, stroke_width=w, color=hue, stroke_opacity=o))
            g.add(Circle(radius=0.35*sc, stroke_width=2.5, color="#d080ff", stroke_opacity=0.25))
            g.add(Dot(radius=0.25*sc, color="#000000", fill_opacity=1))
            g.add(Dot(radius=0.15*sc, color=hue, fill_opacity=0.15))
            g.move_to([x, y, 0]); return g
        b1 = bh(-4.5, 2.5, 0.7, "#6b30a0")
        b2 = bh(5, -2.8, 0.5, "#4a2070")
        b3 = bh(-2, -3.5, 0.35, "#8030b0")
        self.add(b1, b2, b3)

        # Infinity symbol (16 offset layers for 3D depth)
        layers = VGroup()
        for i in range(16):
            d = i / 16
            b = 0.15 + 0.85 * (1 - d)
            h = "#1a0033" if d > 0.7 else "#6b30a0" if d > 0.4 else "#c090ff"
            t = Text("\u221E", font_size=180, color=h, weight=BOLD)
            t.set_stroke(width=1, color="#c090ff", opacity=0.05 * (1 - d))
            t.shift([-i*0.025, i*0.008, 0])
            t.set_opacity(b * 0.6)
            layers.add(t)

        front = Text("\u221E", font_size=180, color="#e0c0ff", weight=BOLD)
        front.set_stroke(width=1.5, color="#d080ff", opacity=0.5)

        glow1 = Circle(radius=1.2, stroke_width=3, color="#8030b0", stroke_opacity=0.08)
        glow2 = Circle(radius=0.8, stroke_width=2, color="#d080ff", stroke_opacity=0.05)

        sp = [9, 5, 0]
        ep = [0, 0.3, 0]
        for m in [*layers, front, glow1, glow2]:
            m.move_to(sp); m.scale(0.2)

        trail = Circle(radius=0.8, color="#8030b0", fill_opacity=0.06, stroke_opacity=0).move_to(sp)
        self.add(trail, *layers, front, glow1, glow2)

        all_inf = VGroup(*layers, front, glow1, glow2)
        self.play(all_inf.animate.move_to(ep).scale(5.2), trail.animate.move_to(ep).scale(0.2).set_opacity(0.01), rate_func=rate_functions.ease_out_cubic, run_time=0.9)
        self.remove(trail)

        glow = front.copy()
        glow.set_stroke(width=60, opacity=0.04, color="#8030b0")
        self.add(glow)
        self.play(glow.animate.set_stroke(width=70, opacity=0.03), all_inf.animate.scale(0.96), rate_func=there_and_back, run_time=0.5)

        # 360° rotation of the infinity symbol (3D depth visible through layer parallax)
        self.play(Rotate(layers, angle=2*PI, axis=UP, run_time=2.0, rate_func=rate_functions.ease_in_out_sine))
        self.play(Rotate(layers, angle=PI/2, axis=UP, run_time=0.5, rate_func=smooth))

        # Accretion rings
        r1 = Circle(radius=1.9, stroke_width=1.5, color="#8030b0", stroke_opacity=0.12)
        r2 = Circle(radius=2.05, stroke_width=0.8, color="#d080ff", stroke_opacity=0.06)
        self.add(r1, r2)
        self.play(r1.animate.scale(1.3).set_stroke(opacity=0.03), r2.animate.scale(1.4).set_stroke(opacity=0.015), glow.animate.set_stroke(width=65, opacity=0.03), run_time=0.6, rate_func=smooth)

        # Orbit
        o_ring = Circle(radius=2.3, stroke_width=2, color="#8030b0", stroke_opacity=0.15)
        o_dot = Dot(radius=0.05, color="#d080ff", fill_opacity=0.7).move_to(o_ring.point_from_proportion(0))
        self.add(o_ring, o_dot)
        self.play(glow.animate.set_stroke(width=70, opacity=0.03), all_inf.animate.scale(1.04), rate_func=there_and_back, run_time=0.6)

        for i in range(8):
            t = i / 8
            self.play(o_dot.animate.move_to(o_ring.point_from_proportion(t)).set_color("#e0c0ff" if i%2==0 else "#8030b0"), o_ring.animate.set_stroke(opacity=0.08+0.07*abs(np.sin(t*PI))), glow.animate.set_stroke(width=50+15*abs(np.sin(t*PI)), opacity=0.02+0.02*abs(np.sin(t*PI))), run_time=0.14, rate_func=smooth)

        # Star rotation
        self.play(stars.animate.rotate(0.04), b1.animate.rotate(-0.06), b2.animate.rotate(0.05), b3.animate.rotate(-0.04), run_time=0.5, rate_func=smooth)

        # Title
        title = Text("Infinite Code", font_size=46, color="#e8d0ff", weight=BOLD).next_to(all_inf, DOWN, buff=0.45)
        sub = Text("Loading", font_size=20, color="#8060a0").next_to(title, DOWN, buff=0.2)
        ul = Line(title.get_left()+DOWN*0.15, title.get_right()+DOWN*0.15, stroke_width=1.5, color="#8030b0", stroke_opacity=0.3)
        self.play(Write(title, run_time=0.4), FadeIn(sub, shift=UP*0.1, run_time=0.25), GrowFromCenter(ul, run_time=0.25))

        # Loading dots
        dots = VGroup()
        for i in range(3):
            d = Dot(radius=0.04, color="#8060a0", fill_opacity=0.8)
            d.shift(RIGHT * i * 0.25); dots.add(d)
        dots.next_to(sub, DOWN, buff=0.3)
        self.play(LaggedStart(*[FadeIn(d, scale=0.5) for d in dots], lag_ratio=0.2))

        on_c = "#d080ff"; off_c = "#8060a0"
        for _ in range(2):
            self.play(dots[0].animate.shift(UP*0.08).set_color(on_c), run_time=0.07)
            self.play(dots[0].animate.shift(DOWN*0.08).set_color(off_c), dots[1].animate.shift(UP*0.08).set_color(on_c), run_time=0.09)
            self.play(dots[1].animate.shift(DOWN*0.08).set_color(off_c), dots[2].animate.shift(UP*0.08).set_color(on_c), run_time=0.09)
            self.play(dots[2].animate.shift(DOWN*0.08).set_color(off_c), run_time=0.07)

        self.play(all_inf.animate.scale(1.06).set_opacity(0.85), glow.animate.set_stroke(width=80, opacity=0.025), o_ring.animate.set_stroke(opacity=0.25), o_dot.animate.set_opacity(0.8), ul.animate.set_stroke(opacity=0.5), glow1.animate.set_stroke(opacity=0.12), glow2.animate.set_stroke(opacity=0.08), rate_func=there_and_back, run_time=0.5)

        self.wait(0.15)
        self.play(*[FadeOut(m, shift=UP*0.2) for m in self.mobjects], run_time=0.35)
        self.wait(0.1)
