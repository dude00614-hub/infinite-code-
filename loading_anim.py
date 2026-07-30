from manim import *
import numpy as np

class LoadingAnimation(Scene):
    def construct(self):
        self.camera.background_color = "#020105"

        # === Starfield ===
        stars = VGroup()
        for _ in range(300):
            dot = Dot(
                radius=np.random.uniform(0.002, 0.015),
                color="#604080" if np.random.random() > 0.7 else "#8060a0",
                fill_opacity=np.random.uniform(0.04, 0.3),
            ).move_to([np.random.uniform(-7, 7), np.random.uniform(-4, 4), 0])
            stars.add(dot)
        self.add(stars)

        # === Black holes ===
        def make_blackhole(x, y, scale, hue):
            group = VGroup()
            # Accretion disk outer ring
            for r, w, op in [(1.2 * scale, 0.8, 0.04), (0.9 * scale, 1.2, 0.07), (0.6 * scale, 1.5, 0.12)]:
                ring = Circle(radius=r, stroke_width=w, color=hue, stroke_opacity=op)
                group.add(ring)
            # Photon ring (bright)
            photon = Circle(radius=0.35 * scale, stroke_width=2.5, color="#d080ff", stroke_opacity=0.25)
            group.add(photon)
            # Event horizon (black center)
            horizon = Dot(radius=0.25 * scale, color="#000000", fill_opacity=1)
            group.add(horizon)
            # Inner glow spike
            spike = Dot(radius=0.15 * scale, color=hue, fill_opacity=0.15)
            group.add(spike)
            group.move_to([x, y, 0])
            return group

        bh1 = make_blackhole(-4.5, 2.5, 0.7, "#6b30a0")
        bh2 = make_blackhole(5, -2.8, 0.5, "#4a2070")
        bh3 = make_blackhole(-2, -3.5, 0.35, "#8030b0")
        self.add(bh1, bh2, bh3)

        # === 3D Infinity symbol (layered extrusion) ===
        infinity_layers = VGroup()
        num_layers = 12
        for i in range(num_layers):
            offset = i * 0.02
            depth = i / num_layers
            bright = 0.15 + 0.85 * (1 - depth)
            hue = "#1a0033" if depth > 0.7 else "#6b30a0" if depth > 0.4 else "#c090ff"
            layer = Text(
                "\u221E", font_size=200, color=hue, weight=BOLD,
            )
            layer.set_stroke(width=1, color="#c090ff", opacity=0.05 * (1 - depth))
            layer.shift([-offset, offset * 0.3, 0])
            layer.set_opacity(bright * 0.7)
            infinity_layers.add(layer)

        # Front face (bright)
        infinity_front = Text(
            "\u221E", font_size=200, color="#e0c0ff", weight=BOLD,
        )
        infinity_front.set_stroke(width=1.5, color="#d080ff", opacity=0.5)

        # Blackhole accretion glow around infinity
        bh_glow = Circle(radius=1.2, stroke_width=3, color="#8030b0", stroke_opacity=0.08)
        bh_glow2 = Circle(radius=0.8, stroke_width=2, color="#d080ff", stroke_opacity=0.05)

        # Position off-screen for meteor entrance
        start_pos = [9, 4.5, 0]
        end_pos = [0, 0.3, 0]

        for mob in [*infinity_layers, infinity_front, bh_glow, bh_glow2]:
            mob.move_to(start_pos)
            mob.scale(0.2)

        # Meteor trail
        trail = Circle(radius=0.8, color="#8030b0", fill_opacity=0.06, stroke_opacity=0).move_to(start_pos)

        self.add(trail, *infinity_layers, infinity_front, bh_glow, bh_glow2)

        # Fly in
        all_infinity = VGroup(*infinity_layers, infinity_front, bh_glow, bh_glow2)
        self.play(
            all_infinity.animate.move_to(end_pos).scale(5.2),
            trail.animate.move_to(end_pos).scale(0.2).set_opacity(0.01),
            rate_func=rate_functions.ease_out_cubic,
            run_time=0.9,
        )
        self.remove(trail)

        # Final scale correction after fly-in (scale(5.2) * scale(0.2) = 1.04)
        # Add glow on top
        glow = infinity_front.copy()
        glow.set_stroke(width=60, opacity=0.04, color="#8030b0")
        self.add(glow)

        self.play(
            glow.animate.set_stroke(width=70, opacity=0.03),
            all_infinity.animate.scale(0.96),
            rate_func=there_and_back, run_time=0.5,
        )

        # Slowly rotate the 3D layers to simulate depth rotation
        self.play(
            infinity_layers.animate.rotate(0.03, axis=UP),
            run_time=0.5,
        )

        # === Blackhole accretion rings around infinity ===
        ring = Circle(radius=1.9, stroke_width=1.5, color="#8030b0", stroke_opacity=0.12)
        ring2 = Circle(radius=2.05, stroke_width=0.8, color="#d080ff", stroke_opacity=0.06)
        self.add(ring, ring2)

        self.play(
            ring.animate.scale(1.3).set_stroke(opacity=0.03),
            ring2.animate.scale(1.4).set_stroke(opacity=0.015),
            glow.animate.set_stroke(width=65, opacity=0.03),
            run_time=0.6, rate_func=smooth,
        )

        # Orbit ring
        orbit_ring = Circle(radius=2.3, stroke_width=2, color="#8030b0", stroke_opacity=0.15)
        orbit_dot = Dot(radius=0.05, color="#d080ff", fill_opacity=0.7).move_to(orbit_ring.point_from_proportion(0))
        self.add(orbit_ring, orbit_dot)

        # Pulse
        self.play(glow.animate.set_stroke(width=70, opacity=0.03), all_infinity.animate.scale(1.04), rate_func=there_and_back, run_time=0.6)

        # Orbit
        for i in range(6):
            t = i / 6
            self.play(
                orbit_dot.animate.move_to(orbit_ring.point_from_proportion(t)).set_color("#e0c0ff" if i % 2 == 0 else "#8030b0"),
                orbit_ring.animate.set_stroke(opacity=0.08 + 0.07 * abs(np.sin(t * PI))),
                glow.animate.set_stroke(width=50 + 15 * abs(np.sin(t * PI)), opacity=0.02 + 0.02 * abs(np.sin(t * PI))),
                run_time=0.16, rate_func=smooth,
            )

        # Galaxy/star rotation
        self.play(
            stars.animate.rotate(0.03),
            bh1.animate.rotate(-0.05),
            bh2.animate.rotate(0.04),
            bh3.animate.rotate(-0.03),
            run_time=0.5, rate_func=smooth,
        )

        # === Title ===
        title = Text("Infinite Code", font_size=46, color="#e8d0ff", weight=BOLD).next_to(all_infinity, DOWN, buff=0.45)
        subtitle = Text("Loading", font_size=20, color="#8060a0").next_to(title, DOWN, buff=0.2)
        underline = Line(
            title.get_left() + DOWN * 0.15, title.get_right() + DOWN * 0.15,
            stroke_width=1.5, color="#8030b0", stroke_opacity=0.3,
        )
        self.play(Write(title, run_time=0.4), FadeIn(subtitle, shift=UP * 0.1, run_time=0.25), GrowFromCenter(underline, run_time=0.25))

        # === Loading dots ===
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

        # Final glow
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

        # Fade out
        self.play(*[FadeOut(m, shift=UP * 0.2) for m in self.mobjects], run_time=0.35)
        self.wait(0.1)
