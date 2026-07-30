from manim import *

class LoadingAnimation(Scene):
    def construct(self):
        self.camera.background_color = "#0d0808"

        # Infinity symbol using SVG or Text
        infinity = Text(
            "\u221E",
            font_size=200,
            color="#ff4444",
            weight=BOLD,
        )

        glow = infinity.copy().set_stroke(
            width=40, opacity=0.12, color="#ff4444"
        )

        self.play(
            DrawBorderThenFill(glow, run_time=1.2, rate_func=smooth),
            DrawBorderThenFill(infinity, run_time=1.2, rate_func=smooth),
        )

        # Pulse glow
        self.play(
            glow.animate.set_stroke(width=55, opacity=0.06),
            infinity.animate.scale(1.03),
            rate_func=there_and_back,
            run_time=1.0,
        )

        # Title
        title = Text(
            "Infinite Code",
            font_size=48,
            color="#e8c8c8",
            weight=BOLD,
        ).next_to(infinity, DOWN, buff=0.5)

        subtitle = Text(
            "Loading",
            font_size=22,
            color="#a07070",
        ).next_to(title, DOWN, buff=0.25)

        self.play(
            Write(title, run_time=0.7),
            FadeIn(subtitle, shift=UP * 0.15, run_time=0.5),
        )

        # Loading dots
        dots = VGroup()
        for i in range(3):
            dot = Dot(radius=0.05, color="#a07070").shift(RIGHT * i * 0.3)
            dots.add(dot)
        dots.next_to(subtitle, DOWN, buff=0.35)

        self.play(LaggedStart(*[FadeIn(d, scale=0.5) for d in dots], lag_ratio=0.3))

        for _ in range(4):
            self.play(
                *[dot.animate.shift(UP * 0.1) for dot in dots],
                run_time=0.15, rate_func=rate_functions.ease_out_sine,
            )
            self.play(
                *[dot.animate.shift(DOWN * 0.1) for dot in dots],
                run_time=0.2, rate_func=rate_functions.ease_in_sine,
            )

        self.play(
            infinity.animate.scale(1.04).set_opacity(0.85),
            glow.animate.set_stroke(width=65, opacity=0.04),
            rate_func=there_and_back, run_time=0.7,
        )

        self.wait(0.3)

        self.play(
            *[FadeOut(m, shift=UP * 0.25) for m in self.mobjects],
            run_time=0.5,
        )
        self.wait(0.1)
