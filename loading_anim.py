from manim import *
import numpy as np

class LoadingAnimation(Scene):
    def construct(self):
        self.camera.background_color = "#080404"

        # === Animated particle background ===
        particles = VGroup()
        for _ in range(50):
            dot = Dot(
                radius=np.random.uniform(0.008, 0.02),
                color="#5a2020" if np.random.random() > 0.3 else "#ff4444",
                fill_opacity=np.random.uniform(0.08, 0.3),
            ).move_to([
                np.random.uniform(-7, 7),
                np.random.uniform(-4, 4),
                0,
            ])
            particles.add(dot)
        self.add(particles)

        # Drift particles
        anims = []
        for dot in particles:
            anims.append(dot.animate.shift([
                np.random.uniform(-0.4, 0.4),
                np.random.uniform(-0.4, 0.4),
                0,
            ]).set_opacity(np.random.uniform(0.05, 0.25)))
        self.play(*anims, run_time=2.0, rate_func=smooth)

        # === Glow rings ===
        ring = Circle(
            radius=1.8, stroke_width=1.5, color="#ff4444",
            stroke_opacity=0.08,
        )
        ring2 = Circle(
            radius=1.95, stroke_width=0.8, color="#ff6666",
            stroke_opacity=0.04,
        )
        self.add(ring, ring2)
        self.play(
            ring.animate.scale(1.3).set_stroke(opacity=0.02),
            ring2.animate.scale(1.4).set_stroke(opacity=0.01),
            run_time=1.0, rate_func=smooth,
        )

        # === Infinity symbol ===
        infinity = Text(
            "\u221E", font_size=220, color="#ff4444", weight=BOLD,
        )
        infinity.set_stroke(width=1, color="#ff4444", opacity=0.3)

        glow = infinity.copy()
        glow.set_stroke(width=50, opacity=0.06, color="#ff4444")

        self.play(
            DrawBorderThenFill(glow, run_time=1.0, rate_func=smooth),
            DrawBorderThenFill(infinity, run_time=1.0, rate_func=smooth),
            ring.animate.scale(0.8).set_stroke(opacity=0.12),
            ring2.animate.scale(0.85).set_stroke(opacity=0.06),
        )

        # === Orbit ring ===
        orbit_ring = Circle(
            radius=2.2, stroke_width=2, color="#ff4444",
            stroke_opacity=0.15,
        )
        orbit_dot = Dot(
            radius=0.04, color="#ff6666", fill_opacity=0.6,
        ).move_to(orbit_ring.point_from_proportion(0))

        self.add(orbit_ring, orbit_dot)

        # === Pulse ===
        self.play(
            glow.animate.set_stroke(width=65, opacity=0.04),
            infinity.animate.scale(1.04),
            rate_func=there_and_back, run_time=1.0,
        )

        # Orbiting
        for i in range(8):
            t = i / 8
            self.play(
                orbit_dot.animate.move_to(
                    orbit_ring.point_from_proportion(t)
                ),
                orbit_ring.animate.set_stroke(
                    opacity=0.08 + 0.07 * abs(np.sin(t * PI))
                ),
                glow.animate.set_stroke(
                    width=45 + 15 * abs(np.sin(t * PI)),
                    opacity=0.03 + 0.03 * abs(np.sin(t * PI)),
                ),
                run_time=0.25, rate_func=smooth,
            )

        # === Title ===
        title = Text(
            "Infinite Code", font_size=46, color="#e8c8c8", weight=BOLD,
        ).next_to(infinity, DOWN, buff=0.45)

        subtitle = Text(
            "Loading", font_size=20, color="#a07070",
        ).next_to(title, DOWN, buff=0.2)

        underline = Line(
            title.get_left() + DOWN * 0.15,
            title.get_right() + DOWN * 0.15,
            stroke_width=1.5, color="#ff4444",
            stroke_opacity=0.3,
        )

        self.play(
            Write(title, run_time=0.6),
            FadeIn(subtitle, shift=UP * 0.1, run_time=0.4),
            GrowFromCenter(underline, run_time=0.4),
        )

        # === Loading dots ===
        dots = VGroup()
        for i in range(3):
            d = Dot(radius=0.04, color="#a07070", fill_opacity=0.8)
            d.shift(RIGHT * i * 0.25)
            dots.add(d)
        dots.next_to(subtitle, DOWN, buff=0.3)

        self.play(LaggedStart(
            *[FadeIn(d, scale=0.5) for d in dots], lag_ratio=0.25
        ))

        # Cascade bounce
        colors = ["#ff4444", "#a07070"]
        for _ in range(3):
            self.play(
                dots[0].animate.shift(UP * 0.08).set_color(colors[0]),
                run_time=0.1, rate_func=rate_functions.ease_out_sine,
            )
            self.play(
                dots[0].animate.shift(DOWN * 0.08).set_color(colors[1]),
                dots[1].animate.shift(UP * 0.08).set_color(colors[0]),
                run_time=0.15, rate_func=rate_functions.ease_out_sine,
            )
            self.play(
                dots[1].animate.shift(DOWN * 0.08).set_color(colors[1]),
                dots[2].animate.shift(UP * 0.08).set_color(colors[0]),
                run_time=0.15, rate_func=rate_functions.ease_out_sine,
            )
            self.play(
                dots[2].animate.shift(DOWN * 0.08).set_color(colors[1]),
                run_time=0.1,
            )

        # === Final glow ===
        self.play(
            infinity.animate.scale(1.06).set_opacity(0.85),
            glow.animate.set_stroke(width=75, opacity=0.03),
            orbit_ring.animate.set_stroke(opacity=0.2),
            orbit_dot.animate.set_opacity(0.8),
            underline.animate.set_stroke(opacity=0.5),
            rate_func=there_and_back, run_time=0.8,
        )

        self.wait(0.3)

        # === Fade out ===
        self.play(
            *[FadeOut(m, shift=UP * 0.2) for m in self.mobjects],
            run_time=0.5,
        )
        self.wait(0.1)
