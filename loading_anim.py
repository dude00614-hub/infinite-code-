from manim import *
import numpy as np
import os, struct, wave, math
from PIL import Image, ImageFilter

SR = 44100
ASSET_DIR = "assets"
os.makedirs(ASSET_DIR, exist_ok=True)

# ── Procedural Galaxy Texture ──────────────────────────────────
def generate_galaxy(w, h, num_arms=3, winding=3.5, scale=0.32, core_radius=0.06, tilt_deg=30, arm_power=4):
    xs, ys = np.meshgrid(np.linspace(-1, 1, w), np.linspace(-1, 1, h))
    tilt = math.radians(tilt_deg)
    ct, st = math.cos(tilt), math.sin(tilt)
    xr = xs * ct - ys * st
    yr = xs * st + ys * ct
    squash = 1.0 / (1.0 + abs(yr) * 0.6)
    xr = xr * squash

    r = np.sqrt(xr**2 + yr**2)
    theta = np.arctan2(yr, xr)

    arm_angle = theta - num_arms * np.log(1 + r * winding)
    arm_strength = np.abs(np.cos(arm_angle * num_arms * 0.5)) ** arm_power

    radial = np.exp(-(r**2) / (2 * scale**2))
    core = np.exp(-(r**2) / (2 * core_radius**2))

    noise = np.random.random((h, w)) * 0.35
    arm_noise = noise * arm_strength * radial
    intensity = arm_strength * radial * 1.2 + core * 3.0 + arm_noise * 0.5

    bg_noise = np.random.random((h, w)) * 0.015
    intensity += bg_noise * (1 - radial)
    intensity = np.clip(intensity, 0, None)
    if intensity.max() > 0:
        intensity = intensity / intensity.max()

    h_map = 0.10 + 0.50 * (1 - np.exp(-r / 0.20))
    s_map = 0.60 + 0.30 * (1 - core)
    v_map = intensity

    h6 = h_map * 6
    hi = np.floor(h6).astype(np.int32) % 6
    f = h6 - np.floor(h6)
    p = v_map * (1 - s_map)
    q = v_map * (1 - f * s_map)
    t_val = v_map * (1 - (1 - f) * s_map)

    r_ch = np.select([hi == 0, hi == 1, hi == 2, hi == 3, hi == 4, hi == 5],
                     [v_map, q, p, p, t_val, v_map])
    g_ch = np.select([hi == 0, hi == 1, hi == 2, hi == 3, hi == 4, hi == 5],
                     [t_val, v_map, v_map, q, p, p])
    b_ch = np.select([hi == 0, hi == 1, hi == 2, hi == 3, hi == 4, hi == 5],
                     [p, p, t_val, v_map, v_map, q])

    rgb = np.stack([r_ch, g_ch, b_ch], axis=-1)
    rgb = np.clip(rgb, 0, 1) ** 0.7
    img = Image.fromarray((rgb * 255).astype(np.uint8), 'RGB')
    img = img.filter(ImageFilter.GaussianBlur(radius=1.5))

    # Add filamentary noise detail
    detail = np.random.random((h // 4, w // 4)) * 0.3
    detail_img = Image.fromarray((detail * 255).astype(np.uint8), 'L').resize((w, h), Image.NEAREST)
    detail_arr = np.array(detail_img, dtype=np.float32) / 255.0
    detail_arr = detail_arr * arm_strength * radial * 0.3
    detail_arr = np.clip(detail_arr, 0, 1)
    arr = np.array(img, dtype=np.float32) / 255.0
    arr[:,:,0] = np.clip(arr[:,:,0] + detail_arr * 0.15, 0, 1)
    arr[:,:,1] = np.clip(arr[:,:,1] + detail_arr * 0.1, 0, 1)
    arr[:,:,2] = np.clip(arr[:,:,2] + detail_arr * 0.2, 0, 1)
    return Image.fromarray((arr * 255).astype(np.uint8), 'RGB')

def generate_star_cluster(w, h, count=200):
    img = Image.new('RGBA', (w, h), (0,0,0,0))
    px = img.load()
    for _ in range(count):
        x = np.random.randint(0, w)
        y = np.random.randint(0, h)
        br = np.random.randint(80, 255)
        rad = np.random.randint(1, 4)
        for dy in range(-rad, rad+1):
            for dx in range(-rad, rad+1):
                d = math.sqrt(dx*dx + dy*dy)
                if d <= rad:
                    alpha = int(255 * (1 - d/rad) * br/255)
                    if x+dx < w and y+dy < h and x+dx >= 0 and y+dy >= 0:
                        px[x+dx, y+dy] = (br, br, int(br*0.9), alpha)
    return img

# ── Audio Generation ───────────────────────────────────────────
def write_wav(path, samples):
    samples = np.nan_to_num(samples)
    peak = np.max(np.abs(samples))
    if peak > 0:
        samples = samples / peak * 0.95
    int16 = (samples * 32767).astype(np.int16)
    with wave.open(path, 'w') as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(SR)
        wf.writeframes(int16.tobytes())

def generate_ambient():
    dur = 8.5
    t = np.linspace(0, dur, int(SR * dur), False)
    d1 = np.sin(2 * np.pi * 55 * t) * 0.25
    d2 = np.sin(2 * np.pi * 82.5 * t) * 0.18
    d3 = np.sin(2 * np.pi * 110 * t) * 0.10
    d4 = np.sin(2 * np.pi * 65 * t) * 0.08
    lfo = 0.6 + 0.4 * np.sin(2 * np.pi * 0.12 * t)
    noise = np.random.normal(0, 0.015, len(t))
    noise_filt = noise * 0.5
    audio = (d1 + d2 + d3 + d4) * lfo + noise_filt
    # Fade in/out
    fade = np.ones_like(t)
    fade[:int(SR*0.3)] = np.linspace(0, 1, int(SR*0.3))
    fade[-int(SR*0.5):] = np.linspace(1, 0, int(SR*0.5))
    return audio * fade

def generate_whoosh():
    dur = 1.2
    t = np.linspace(0, dur, int(SR * dur), False)
    noise = np.random.normal(0, 1, len(t))
    env = np.exp(-((t - 0.2) ** 2) / (2 * 0.3 ** 2))
    sweep = np.sin(2 * np.pi * (80 + 600 * (t / dur)) * t)
    audio = noise * sweep * env * 0.4
    audio[:int(SR*0.01)] = 0
    return audio

def generate_impact():
    dur = 0.8
    t = np.linspace(0, dur, int(SR * dur), False)
    thump = np.sin(2 * np.pi * 55 * t) * np.exp(-t * 25) * 0.6
    thump2 = np.sin(2 * np.pi * 110 * t) * np.exp(-t * 20) * 0.3
    noise = np.random.normal(0, 0.4, len(t)) * np.exp(-t * 15) * 0.3
    click = np.sin(2 * np.pi * 2000 * t) * np.exp(-t * 300) * 0.15
    audio = thump + thump2 + noise + click
    return audio

def generate_shimmer():
    dur = 1.0
    t = np.linspace(0, dur, int(SR * dur), False)
    noise = np.random.normal(0, 1, len(t))
    env = np.exp(-((t - 0.3) ** 2) / (2 * 0.15 ** 2))
    tone = np.sin(2 * np.pi * (600 + 1200 * (t / dur)) * t)
    audio = noise * tone * env * 0.25
    return audio

def generate_swell():
    dur = 1.5
    t = np.linspace(0, dur, int(SR * dur), False)
    env = np.sin(np.pi * t / dur) ** 2
    d1 = np.sin(2 * np.pi * 55 * t) * 0.2
    d2 = np.sin(2 * np.pi * 110 * t) * 0.15
    d3 = np.sin(2 * np.pi * 165 * t) * 0.08
    noise = np.random.normal(0, 0.05, len(t))
    audio = (d1 + d2 + d3 + noise) * env
    return audio

# ── Generate all assets if not present ─────────────────────────
GALAXY_CACHE = os.path.join(ASSET_DIR, "galaxy")
STARS_DIR = os.path.join(ASSET_DIR, "stars")
AUDIO_CACHE = os.path.join(ASSET_DIR, "audio.wav")

def ensure_assets():
    if not os.path.exists(GALAXY_CACHE):
        os.makedirs(GALAXY_CACHE, exist_ok=True)
        os.makedirs(STARS_DIR, exist_ok=True)
        params_list = [
            (1024, 768, 3, 3.5, 0.32, 0.06, 30, 4),
            (800, 600, 4, 4.0, 0.28, 0.05, -20, 3),
            (640, 480, 2, 3.0, 0.35, 0.07, 15, 5),
        ]
        for i, p in enumerate(params_list):
            img = generate_galaxy(*p)
            img.save(os.path.join(GALAXY_CACHE, f"gal{i+1}.png"))

        sc = generate_star_cluster(800, 600, 400)
        sc.save(os.path.join(STARS_DIR, "cluster1.png"))
        sc2 = generate_star_cluster(800, 600, 300)
        sc2.save(os.path.join(STARS_DIR, "cluster2.png"))

    if not os.path.exists(AUDIO_CACHE):
        ambient = generate_ambient()
        whoosh = generate_whoosh()
        impact = generate_impact()
        shimmer = generate_shimmer()
        swell = generate_swell()

        total = len(ambient)
        mix = np.zeros(total)
        mix[:len(ambient)] += ambient
        whoosh_pad = np.zeros(total)
        whoosh_pad[:len(whoosh)] += whoosh
        mix += whoosh_pad
        impact_pad = np.zeros(total)
        off = int(SR * 1.0)
        impact_pad[off:off+len(impact)] += impact
        mix += impact_pad
        shimmer_pad = np.zeros(total)
        soff = int(SR * 1.8)
        shimmer_pad[soff:soff+len(shimmer)] += shimmer
        mix += shimmer_pad
        swell_pad = np.zeros(total)
        swoff = int(SR * 6.0)
        swell_pad[swoff:swoff+len(swell)] += swell
        mix += swell_pad

        write_wav(AUDIO_CACHE, mix)

ensure_assets()

# ── Scene ──────────────────────────────────────────────────────
class LoadingAnimation(Scene):
    def construct(self):
        self.camera.background_color = "#020105"
        self.add_sound(os.path.join(ASSET_DIR, "audio.wav"))

        # ── Background galaxies ──
        gal1 = ImageMobject(os.path.join(GALAXY_CACHE, "gal1.png")).scale(2.5).move_to([-3.5, 2.2, -5]).set_opacity(0.7)
        gal2 = ImageMobject(os.path.join(GALAXY_CACHE, "gal2.png")).scale(2.0).move_to([5.0, -2.5, -4]).set_opacity(0.5)
        gal3 = ImageMobject(os.path.join(GALAXY_CACHE, "gal3.png")).scale(1.5).move_to([-2.0, -3.8, -3]).set_opacity(0.35)
        self.add(gal1, gal2, gal3)

        # ── Star clusters ──
        sc1 = ImageMobject(os.path.join(STARS_DIR, "cluster1.png")).scale(3.0).set_opacity(0.3)
        sc2 = ImageMobject(os.path.join(STARS_DIR, "cluster2.png")).scale(2.5).set_opacity(0.2).move_to([2, 1, -2])
        self.add(sc1, sc2)

        # ── Starfield ──
        stars = VGroup()
        for _ in range(200):
            dot = Dot(
                radius=np.random.uniform(0.002, 0.012),
                color="#604080" if np.random.random() > 0.7 else "#8060a0",
                fill_opacity=np.random.uniform(0.05, 0.35),
            ).move_to([np.random.uniform(-7, 7), np.random.uniform(-4, 4), 0])
            stars.add(dot)
        self.add(stars)

        # ── Black holes ──
        def make_blackhole(x, y, scale, hue):
            group = VGroup()
            for r, w, op in [(1.2 * scale, 0.8, 0.04), (0.9 * scale, 1.2, 0.07), (0.6 * scale, 1.5, 0.12)]:
                ring = Circle(radius=r, stroke_width=w, color=hue, stroke_opacity=op)
                group.add(ring)
            photon = Circle(radius=0.35 * scale, stroke_width=2.5, color="#d080ff", stroke_opacity=0.25)
            group.add(photon)
            horizon = Dot(radius=0.25 * scale, color="#000000", fill_opacity=1)
            group.add(horizon)
            spike = Dot(radius=0.15 * scale, color=hue, fill_opacity=0.15)
            group.add(spike)
            group.move_to([x, y, 0])
            return group

        bh1 = make_blackhole(-4.5, 2.5, 0.7, "#6b30a0")
        bh2 = make_blackhole(5, -2.8, 0.5, "#4a2070")
        bh3 = make_blackhole(-2, -3.5, 0.35, "#8030b0")
        self.add(bh1, bh2, bh3)

        # ── 3D Infinity symbol (layered extrusion) ──
        infinity_layers = VGroup()
        num_layers = 12
        for i in range(num_layers):
            offset = i * 0.02
            depth = i / num_layers
            bright = 0.15 + 0.85 * (1 - depth)
            hue = "#1a0033" if depth > 0.7 else "#6b30a0" if depth > 0.4 else "#c090ff"
            layer = Text("\u221E", font_size=200, color=hue, weight=BOLD)
            layer.set_stroke(width=1, color="#c090ff", opacity=0.05 * (1 - depth))
            layer.shift([-offset, offset * 0.3, 0])
            layer.set_opacity(bright * 0.7)
            infinity_layers.add(layer)

        infinity_front = Text("\u221E", font_size=200, color="#e0c0ff", weight=BOLD)
        infinity_front.set_stroke(width=1.5, color="#d080ff", opacity=0.5)

        bh_glow = Circle(radius=1.2, stroke_width=3, color="#8030b0", stroke_opacity=0.08)
        bh_glow2 = Circle(radius=0.8, stroke_width=2, color="#d080ff", stroke_opacity=0.05)

        start_pos = [9, 4.5, 0]
        end_pos = [0, 0.3, 0]

        for mob in [*infinity_layers, infinity_front, bh_glow, bh_glow2]:
            mob.move_to(start_pos)
            mob.scale(0.2)

        trail = Circle(radius=0.8, color="#8030b0", fill_opacity=0.06, stroke_opacity=0).move_to(start_pos)
        self.add(trail, *infinity_layers, infinity_front, bh_glow, bh_glow2)

        all_infinity = VGroup(*infinity_layers, infinity_front, bh_glow, bh_glow2)
        self.play(
            all_infinity.animate.move_to(end_pos).scale(5.2),
            trail.animate.move_to(end_pos).scale(0.2).set_opacity(0.01),
            rate_func=rate_functions.ease_out_cubic,
            run_time=0.9,
        )
        self.remove(trail)

        glow = infinity_front.copy()
        glow.set_stroke(width=60, opacity=0.04, color="#8030b0")
        self.add(glow)

        self.play(
            glow.animate.set_stroke(width=70, opacity=0.03),
            all_infinity.animate.scale(0.96),
            rate_func=there_and_back, run_time=0.5,
        )

        self.play(
            infinity_layers.animate.rotate(0.03, axis=UP),
            run_time=0.5,
        )

        ring = Circle(radius=1.9, stroke_width=1.5, color="#8030b0", stroke_opacity=0.12)
        ring2 = Circle(radius=2.05, stroke_width=0.8, color="#d080ff", stroke_opacity=0.06)
        self.add(ring, ring2)

        self.play(
            ring.animate.scale(1.3).set_stroke(opacity=0.03),
            ring2.animate.scale(1.4).set_stroke(opacity=0.015),
            glow.animate.set_stroke(width=65, opacity=0.03),
            run_time=0.6, rate_func=smooth,
        )

        orbit_ring = Circle(radius=2.3, stroke_width=2, color="#8030b0", stroke_opacity=0.15)
        orbit_dot = Dot(radius=0.05, color="#d080ff", fill_opacity=0.7).move_to(orbit_ring.point_from_proportion(0))
        self.add(orbit_ring, orbit_dot)

        self.play(glow.animate.set_stroke(width=70, opacity=0.03), all_infinity.animate.scale(1.04), rate_func=there_and_back, run_time=0.6)

        for i in range(6):
            t = i / 6
            self.play(
                orbit_dot.animate.move_to(orbit_ring.point_from_proportion(t)).set_color("#e0c0ff" if i % 2 == 0 else "#8030b0"),
                orbit_ring.animate.set_stroke(opacity=0.08 + 0.07 * abs(np.sin(t * PI))),
                glow.animate.set_stroke(width=50 + 15 * abs(np.sin(t * PI)), opacity=0.02 + 0.02 * abs(np.sin(t * PI))),
                run_time=0.16, rate_func=smooth,
            )

        self.play(
            stars.animate.rotate(0.03),
            bh1.animate.rotate(-0.05),
            bh2.animate.rotate(0.04),
            bh3.animate.rotate(-0.03),
            gal1.animate.rotate(0.01),
            gal2.animate.rotate(-0.015),
            gal3.animate.rotate(0.02),
            run_time=0.5, rate_func=smooth,
        )

        title = Text("Infinite Code", font_size=46, color="#e8d0ff", weight=BOLD).next_to(all_infinity, DOWN, buff=0.45)
        subtitle = Text("Loading", font_size=20, color="#8060a0").next_to(title, DOWN, buff=0.2)
        underline = Line(
            title.get_left() + DOWN * 0.15, title.get_right() + DOWN * 0.15,
            stroke_width=1.5, color="#8030b0", stroke_opacity=0.3,
        )
        self.play(Write(title, run_time=0.4), FadeIn(subtitle, shift=UP * 0.1, run_time=0.25), GrowFromCenter(underline, run_time=0.25))

        dots = VGroup()
        for i in range(3):
            d = Dot(radius=0.04, color="#8060a0", fill_opacity=0.8)
            d.shift(RIGHT * i * 0.25)
            dots.add(d)
        dots.next_to(subtitle, DOWN, buff=0.3)
        self.play(LaggedStart(*[FadeIn(d, scale=0.5) for d in dots], lag_ratio=0.2))

        c_on = "#d080ff"
        c_off = "#8060a0"
        for _ in range(2):
            self.play(dots[0].animate.shift(UP * 0.08).set_color(c_on), run_time=0.07)
            self.play(dots[0].animate.shift(DOWN * 0.08).set_color(c_off), dots[1].animate.shift(UP * 0.08).set_color(c_on), run_time=0.09)
            self.play(dots[1].animate.shift(DOWN * 0.08).set_color(c_off), dots[2].animate.shift(UP * 0.08).set_color(c_on), run_time=0.09)
            self.play(dots[2].animate.shift(DOWN * 0.08).set_color(c_off), run_time=0.07)

        self.play(
            all_infinity.animate.scale(1.06).set_opacity(0.85),
            glow.animate.set_stroke(width=80, opacity=0.025),
            orbit_ring.animate.set_stroke(opacity=0.25),
            orbit_dot.animate.set_opacity(0.8),
            underline.animate.set_stroke(opacity=0.5),
            bh_glow.animate.set_stroke(opacity=0.12),
            bh_glow2.animate.set_stroke(opacity=0.08),
            rate_func=there_and_back, run_time=0.5,
        )

        self.wait(0.15)
        self.play(*[FadeOut(m, shift=UP * 0.2) for m in self.mobjects], run_time=0.35)
        self.wait(0.1)
