from manim import *
import numpy as np

class LoadingAnimation(Scene):
    def construct(self):
        self.camera.background_color = "#050308"

        # === Galaxy starfield ===
        stars = VGroup()
        for _ in range(120):
            radius = np.random.uniform(0.003, 0.018)
            bright = np.random.uniform(0.1, 0.7)
            color = "#b080ff" if np.random.random() > 0.85 else "#6b4c99" if np.random.random() > 0.5 else "#3a2060"
            dot = Dot(radius=radius, color=color, fill_opacity=bright).move_to([
                np.random.uniform(-7, 7),
                np.random.uniform(-4, 4),
                0,
            ])
            stars.add(dot)
        self.add(stars)

        # Slow drift
        anims = []
        for dot in stars:
            anims.append(dot.animate.shift([
                np.random.uniform(-0.3, 0.3),
                np.random.uniform(-0.3, 0.3),
                0,
            ]).set_opacity(np.random.uniform(0.05, 0.4)))
        self.play(*anims, run_time=1.2, rate_func=smooth)

        # === Glow rings ===
        ring = Circle(
            radius=1.8, stroke_width=1.5, color="#b080ff",
            stroke_opacity=0.1,
        )
        ring2 = Circle(
            radius=1.95, stroke_width=0.8, color="#d4b0ff",
            stroke_opacity=0.05,
        )
        self.add(ring, ring2)
        self.play(
            ring.animate.scale(1.3).set_stroke(opacity=0.03),
            ring2.animate.scale(1.4).set_stroke(opacity=0.015),
            run_time=0.7, rate_func=smooth,
        )

        # === Infinity symbol ===
        infinity = Text(
            "\u221E", font_size=220, color="#b080ff", weight=BOLD,
        )
        infinity.set_stroke(width=1, color="#b080ff", opacity=0.3)

        glow = infinity.copy()
        glow.set_stroke(width=50, opacity=0.06, color="#b080ff")

        self.play(
            DrawBorderThenFill(glow, run_time=0.7, rate_func=smooth),
            DrawBorderThenFill(infinity, run_time=0.7, rate_func=smooth),
            ring.animate.scale(0.8).set_stroke(opacity=0.15),
            ring2.animate.scale(0.85).set_stroke(opacity=0.08),
        )

        # === Orbit ring ===
        orbit_ring = Circle(
            radius=2.2, stroke_width=2, color="#b080ff",
            stroke_opacity=0.15,
        )
        orbit_dot = Dot(
            radius=0.04, color="#d4b0ff", fill_opacity=0.6,
        ).move_to(orbit_ring.point_from_proportion(0))

        self.add(orbit_ring, orbit_dot)

        # Pulse + orbit
        self.play(
            glow.animate.set_stroke(width=65, opacity=0.04),
            infinity.animate.scale(1.04),
            rate_func=there_and_back, run_time=0.7,
        )

        for i in range(6):
            t = i / 6
            self.play(
                orbit_dot.animate.move_to(orbit_ring.point_from_proportion(t)),
                orbit_ring.animate.set_stroke(opacity=0.08 + 0.07 * abs(np.sin(t * PI))),
                glow.animate.set_stroke(width=45 + 15 * abs(np.sin(t * PI)), opacity=0.03 + 0.03 * abs(np.sin(t * PI))),
                run_time=0.18, rate_func=smooth,
            )

        # === Title ===
        title = Text(
            "Infinite Code", font_size=46, color="#e8d0ff", weight=BOLD,
        ).next_to(infinity, DOWN, buff=0.45)

        subtitle = Text(
            "Loading", font_size=20, color="#9970b0",
        ).next_to(title, DOWN, buff=0.2)

        underline = Line(
            title.get_left() + DOWN * 0.15,
            title.get_right() + DOWN * 0.15,
            stroke_width=1.5, color="#b080ff",
            stroke_opacity=0.3,
        )

        self.play(
            Write(title, run_time=0.45),
            FadeIn(subtitle, shift=UP * 0.1, run_time=0.3),
            GrowFromCenter(underline, run_time=0.3),
        )

        # === Loading dots (cascade) ===
        dots = VGroup()
        for i in range(3):
            d = Dot(radius=0.04, color="#9970b0", fill_opacity=0.8)
            d.shift(RIGHT * i * 0.25)
            dots.add(d)
        dots.next_to(subtitle, DOWN, buff=0.3)

        self.play(LaggedStart(*[FadeIn(d, scale=0.5) for d in dots], lag_ratio=0.2))

        colors = ["#b080ff", "#9970b0"]
        for _ in range(2):
            self.play(dots[0].animate.shift(UP * 0.08).set_color(colors[0]), run_time=0.08, rate_func=rate_functions.ease_out_sine)
            self.play(dots[0].animate.shift(DOWN * 0.08).set_color(colors[1]), dots[1].animate.shift(UP * 0.08).set_color(colors[0]), run_time=0.1, rate_func=rate_functions.ease_out_sine)
            self.play(dots[1].animate.shift(DOWN * 0.08).set_color(colors[1]), dots[2].animate.shift(UP * 0.08).set_color(colors[0]), run_time=0.1, rate_func=rate_functions.ease_out_sine)
            self.play(dots[2].animate.shift(DOWN * 0.08).set_color(colors[1]), run_time=0.08)

        # === Final glow ===
        self.play(
            infinity.animate.scale(1.06).set_opacity(0.85),
            glow.animate.set_stroke(width=75, opacity=0.03),
            orbit_ring.animate.set_stroke(opacity=0.25),
            orbit_dot.animate.set_opacity(0.8),
            underline.animate.set_stroke(opacity=0.5),
            rate_func=there_and_back, run_time=0.6,
        )

        self.wait(0.2)

        # === Fade out ===
        self.play(
            *[FadeOut(m, shift=UP * 0.2) for m in self.mobjects],
            run_time=0.4,
        )
        self.wait(0.1)
