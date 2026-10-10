import type { Config } from "tailwindcss";

const c = (name: string) => `rgb(var(--c-${name}) / <alpha-value>)`;

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: c("ink"),
        panel: c("panel"),
        raised: c("raised"),
        line: c("line"),
        hair: c("hair"),
        bone: c("bone"),
        mute: c("mute"),
        faint: c("faint"),
        gold: { DEFAULT: c("gold"), hi: c("gold-hi"), dim: c("gold-dim"), wash: "var(--gold-wash)" },
        alert: c("alert"),
        calm: c("calm"),
      },
      fontFamily: {
        display: ['"Cormorant Garamond"', "ui-serif", "Georgia", "serif"],
        sans: ['"Inter Variable"', "Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      letterSpacing: { eyebrow: "0.22em" },
      maxWidth: { page: "1120px" },
      keyframes: {
        rise: { from: { opacity: "0", transform: "translateY(8px)" }, to: { opacity: "1", transform: "none" } },
        fade: { from: { opacity: "0" }, to: { opacity: "1" } },
        sheet: { from: { transform: "translateY(100%)" }, to: { transform: "none" } },
        fall: {
          "0%": { transform: "translate3d(0,-10vh,0) rotate(0deg)", opacity: "0" },
          "10%": { opacity: "1" },
          "100%": { transform: "translate3d(var(--drift),105vh,0) rotate(540deg)", opacity: "0" },
        },
      },
      animation: {
        rise: "rise .45s cubic-bezier(.2,.7,.2,1) both",
        fade: "fade .3s ease both",
        sheet: "sheet .32s cubic-bezier(.2,.8,.2,1) both",
        fall: "fall var(--dur) cubic-bezier(.25,.6,.4,1) var(--delay) both",
      },
    },
  },
  plugins: [],
} satisfies Config;
