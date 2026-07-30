from manim import *

class LoadingAnimation(Scene):
    def construct(self):
        self.camera.background_color = "#0a0608"

        # Outer glow ring
        ring = Circle(radius=2.6, stroke_width=1, color="#ff2040", stroke_opacity=0.08)
        ring2 = Circle(radius=2.8, stroke_width=0.5, color="#ff4060", stroke_opacity=0.04)

        # Layered infinity symbol for depth
        layers = VGroup()
        cols = ["#ff6080", "#ff5070", "#ff4060", "#ff3050", "#ff2040", "#cc1030"]
        for i in range(6):
            d = i / 6
            t = Text("\u221E", font_size=200, color=cols[i], weight=BOLD)
            t.shift([-i*0.012, i*0.005, 0])
            t.set_opacity(0.7 - d * 0.4)
            layers.add(t)

        infinity = Text("\u221E", font_size=200, color="#ff4060", weight=BOLD)
        infinity.shift([-0.04, 0.02, 0])

        # Inner bright core
        core = Text("\u221E", font_size=200, color="#ffa0b0", weight=BOLD)
        core.shift([-0.07, 0.04, 0])
        core.set_opacity(0.3)

        # Multi-stage glow
        glow1 = infinity.copy().set_stroke(width=80, opacity=0.08, color="#ff2040")
        glow2 = infinity.copy().set_stroke(width=50, opacity=0.15, color="#ff4060")
        glow3 = infinity.copy().set_stroke(width=25, opacity=0.25, color="#ff6080")

        self.add(ring, ring2)
        self.add(glow1, glow2, glow3, *layers, core, infinity)

        # Fade in everything
        all_obj = VGroup(ring, ring2, glow1, glow2, glow3, VGroup(*layers), core, infinity)
        all_obj.set_opacity(0)
        self.play(all_obj.animate.set_opacity(1), run_time=0.3)
        self.wait(0.15)

        # Intro pulse
        self.play(
            infinity.animate.scale(1.15).set_color("#ff6080"),
            core.animate.scale(1.15).set_color("#ffc0d0"),
            glow2.animate.set_stroke(width=60, opacity=0.2),
            glow3.animate.set_stroke(width=35, opacity=0.3),
            ring.animate.scale(1.1).set_stroke(opacity=0.12),
            rate_func=rate_functions.ease_out_cubic, run_time=0.5
        )
        self.play(
            infinity.animate.scale(1/1.15).set_color("#ff4060"),
            core.animate.scale(1/1.15).set_color("#ffa0b0"),
            glow2.animate.set_stroke(width=50, opacity=0.15),
            glow3.animate.set_stroke(width=25, opacity=0.25),
            ring.animate.scale(1/1.1).set_stroke(opacity=0.08),
            rate_func=rate_functions.ease_in_cubic, run_time=0.35
        )

        # Glow pulse
        self.play(
            glow1.animate.set_stroke(width=90, opacity=0.06),
            glow2.animate.set_stroke(width=60, opacity=0.12),
            rate_func=there_and_back, run_time=0.6
        )

        # Title with gradient-like effect
        title_bg = Text("Infinite Code", font_size=48, color="#ff4060", weight=BOLD)
        title_bg.shift([0.015, -0.01, 0])
        title_bg.set_opacity(0.3)

        title = Text("Infinite Code", font_size=48, color="#f0d0d0", weight=BOLD)
        subtitle = Text("Loading", font_size=22, color="#c08080")

        title.next_to(infinity, DOWN, buff=0.5)
        title_bg.move_to(title)
        subtitle.next_to(title, DOWN, buff=0.25)

        self.play(
            Write(title, run_time=0.6),
            FadeIn(title_bg, run_time=0.6),
            FadeIn(subtitle, shift=UP * 0.15, run_time=0.4),
        )

        # Decorative line under title
        line = Line(title.get_left() + DOWN * 0.15, title.get_right() + DOWN * 0.15,
                    stroke_width=1.5, color="#ff4060", stroke_opacity=0.3)
        self.play(GrowFromCenter(line, run_time=0.25))

        # Loading dots with better animation
        dots = VGroup()
        for i in range(3):
            dot = Dot(radius=0.045, color="#c08080").shift(RIGHT * i * 0.28)
            dots.add(dot)
        dots.next_to(subtitle, DOWN, buff=0.35)

        self.play(LaggedStart(*[FadeIn(d, scale=0.5) for d in dots], lag_ratio=0.25))

        pulse = VGroup(infinity, core, VGroup(*layers), glow1, glow2, glow3, ring, ring2)
        for _ in range(2):
            # Dot cascade
            self.play(dots[0].animate.shift(UP * 0.08).set_color("#ff6080"), run_time=0.08)
            self.play(dots[0].animate.shift(DOWN * 0.08).set_color("#c08080"),
                      dots[1].animate.shift(UP * 0.08).set_color("#ff6080"), run_time=0.1)
            self.play(dots[1].animate.shift(DOWN * 0.08).set_color("#c08080"),
                      dots[2].animate.shift(UP * 0.08).set_color("#ff6080"), run_time=0.1)
            self.play(dots[2].animate.shift(DOWN * 0.08).set_color("#c08080"), run_time=0.08)

            # Subtle infinity pulse
            if _ == 0:
                self.play(
                    pulse.animate.scale(1.03),
                    glow1.animate.set_stroke(width=85, opacity=0.07),
                    line.animate.set_stroke(opacity=0.45),
                    rate_func=there_and_back, run_time=0.6
                )

        # Final glow
        self.play(
            pulse.animate.scale(1.05),
            glow1.animate.set_stroke(width=95, opacity=0.05),
            glow2.animate.set_stroke(width=65, opacity=0.1),
            line.animate.set_stroke(opacity=0.5),
            rate_func=there_and_back, run_time=0.5
        )

        self.wait(0.2)
        self.play(*[FadeOut(m, shift=UP * 0.2) for m in self.mobjects], run_time=0.4)
        self.wait(0.1)
