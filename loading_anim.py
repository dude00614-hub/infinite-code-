from manim import *
import numpy as np

class LoadingAnimation(Scene):
    def construct(self):
        self.camera.background_color = "#030106"

        # === Spiral galaxies ===
        galaxies = VGroup()
        for gx, gy, arms, hue, gscale in [
            (-4, 2, 3, "#6b4c99", 0.6),
            (5, -2, 4, "#4a3070", 0.5),
            (-3, -3, 3, "#8050b0", 0.35),
        ]:
            galaxy = VGroup()
            for arm in range(arms):
                for i in range(80):
                    t = i / 80
                    angle = t * PI * 5 + arm * TAU / arms
                    r = t * gscale * 3.5
                    x = r * np.cos(angle) + gx + np.random.uniform(-0.04, 0.04)
                    y = r * np.sin(angle) * 0.6 + gy + np.random.uniform(-0.04, 0.04)
                    bright = max(0.02, np.random.uniform(0.02, 0.12) * (1 - t * 0.6))
                    size = max(0.002, np.random.uniform(0.002, 0.01) * (1 - t * 0.3))
                    dot = Dot(radius=size, color=hue, fill_opacity=bright).move_to([x, y, 0])
                    galaxy.add(dot)
            galaxies.add(galaxy)
        self.add(galaxies)

        # Starfield
        stars = VGroup()
        for _ in range(200):
            dot = Dot(
                radius=np.random.uniform(0.002, 0.012),
                color="#8060a0",
                fill_opacity=np.random.uniform(0.04, 0.25),
            ).move_to([np.random.uniform(-7, 7), np.random.uniform(-4, 4), 0])
            stars.add(dot)
        self.add(stars)

        # Slow galaxy rotation + star drift
        anims = []
        for galaxy in galaxies:
            anims.append(galaxy.animate.rotate(0.15))
        for dot in stars:
            anims.append(dot.animate.shift([
                np.random.uniform(-0.15, 0.15),
                np.random.uniform(-0.15, 0.15), 0,
            ]).set_opacity(np.random.uniform(0.03, 0.2)))
        self.play(*anims, run_time=1.5, rate_func=smooth)

        # === Meteor fly-in: infinity symbol ===
        infinity = Text(
            "\u221E", font_size=200, color="#c090ff", weight=BOLD,
        )
        infinity.set_stroke(width=1.5, color="#c090ff", opacity=0.4)
        start_pos = [9, 4.5, 0]
        end_pos = [0, 0.3, 0]
        infinity.move_to(start_pos)
        infinity.scale(0.25)

        # Meteor trail glow
        trail_glow = Circle(
            radius=0.6, color="#c090ff",
            fill_opacity=0.08, stroke_opacity=0,
        ).move_to(start_pos)

        self.add(trail_glow, infinity)

        # Animate meteor fly-in: move + scale + trail
        self.play(
            infinity.animate.move_to(end_pos).scale(4.2),
            trail_glow.animate.move_to(end_pos).scale(0.3).set_opacity(0.02),
            rate_func=rate_functions.ease_out_cubic,
            run_time=0.9,
        )
        self.remove(trail_glow)

        # Glow after settling
        glow = infinity.copy()
        glow.set_stroke(width=50, opacity=0.06, color="#c090ff")
        self.add(glow)

        self.play(
            glow.animate.set_stroke(width=55, opacity=0.04),
            infinity.animate.scale(1.04),
            rate_func=there_and_back, run_time=0.5,
        )

        # === Rings ===
        ring = Circle(radius=1.8, stroke_width=1.5, color="#b080ff", stroke_opacity=0.12)
        ring2 = Circle(radius=1.95, stroke_width=0.8, color="#d4b0ff", stroke_opacity=0.06)
        self.add(ring, ring2)
        self.play(
            ring.animate.scale(1.3).set_stroke(opacity=0.03),
            ring2.animate.scale(1.4).set_stroke(opacity=0.015),
            glow.animate.set_stroke(width=60, opacity=0.04),
            run_time=0.6, rate_func=smooth,
        )

        # Orbit ring
        orbit_ring = Circle(radius=2.2, stroke_width=2, color="#b080ff", stroke_opacity=0.15)
        orbit_dot = Dot(radius=0.04, color="#d4b0ff", fill_opacity=0.6).move_to(orbit_ring.point_from_proportion(0))
        self.add(orbit_ring, orbit_dot)

        # Pulse
        self.play(glow.animate.set_stroke(width=65, opacity=0.04), infinity.animate.scale(1.04), rate_func=there_and_back, run_time=0.6)

        # Orbit
        for i in range(6):
            t = i / 6
            self.play(
                orbit_dot.animate.move_to(orbit_ring.point_from_proportion(t)),
                orbit_ring.animate.set_stroke(opacity=0.08 + 0.07 * abs(np.sin(t * PI))),
                glow.animate.set_stroke(width=45 + 15 * abs(np.sin(t * PI)), opacity=0.03 + 0.03 * abs(np.sin(t * PI))),
                run_time=0.16, rate_func=smooth,
            )

        # === Title ===
        title = Text("Infinite Code", font_size=46, color="#e8d0ff", weight=BOLD).next_to(infinity, DOWN, buff=0.45)
        subtitle = Text("Loading", font_size=20, color="#9970b0").next_to(title, DOWN, buff=0.2)
        underline = Line(
            title.get_left() + DOWN * 0.15, title.get_right() + DOWN * 0.15,
            stroke_width=1.5, color="#b080ff", stroke_opacity=0.3,
        )
        self.play(Write(title, run_time=0.4), FadeIn(subtitle, shift=UP * 0.1, run_time=0.25), GrowFromCenter(underline, run_time=0.25))

        # === Loading dots ===
        dots = VGroup()
        for i in range(3):
            d = Dot(radius=0.04, color="#9970b0", fill_opacity=0.8)
            d.shift(RIGHT * i * 0.25)
            dots.add(d)
        dots.next_to(subtitle, DOWN, buff=0.3)
        self.play(LaggedStart(*[FadeIn(d, scale=0.5) for d in dots], lag_ratio=0.2))

        c_on = "#b080ff"
        c_off = "#9970b0"
        for _ in range(2):
            self.play(dots[0].animate.shift(UP * 0.08).set_color(c_on), run_time=0.07)
            self.play(dots[0].animate.shift(DOWN * 0.08).set_color(c_off), dots[1].animate.shift(UP * 0.08).set_color(c_on), run_time=0.09)
            self.play(dots[1].animate.shift(DOWN * 0.08).set_color(c_off), dots[2].animate.shift(UP * 0.08).set_color(c_on), run_time=0.09)
            self.play(dots[2].animate.shift(DOWN * 0.08).set_color(c_off), run_time=0.07)

        # Final glow
        self.play(
            infinity.animate.scale(1.06).set_opacity(0.85),
            glow.animate.set_stroke(width=75, opacity=0.03),
            orbit_ring.animate.set_stroke(opacity=0.25),
            orbit_dot.animate.set_opacity(0.8),
            underline.animate.set_stroke(opacity=0.5),
            rate_func=there_and_back, run_time=0.5,
        )
        self.wait(0.15)

        # Fade out
        self.play(*[FadeOut(m, shift=UP * 0.2) for m in self.mobjects], run_time=0.35)
        self.wait(0.1)
