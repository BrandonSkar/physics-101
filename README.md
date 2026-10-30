# Physics 101: The Real-Life Edition

A free, hands-on, hour-long intro physics class built from everyday life, live at
**[brandonskar.com/physics](https://brandonskar.com/physics/)**.

Nine short lessons and a final exam. Each lesson has a real situation, one big
idea in plain English, an interactive lab and a few real-world problems:

| # | Lesson | Physics | Lab |
|---|--------|---------|-----|
| 1 | Is speeding worth it? | speed, distance, time | Road-trip race |
| 2 | Can you stop in time? | acceleration, stopping distance | The deer test |
| 3 | Catch it! | gravity, free fall | Ruler-drop reaction test |
| 4 | Nothing but net | projectile motion | Free-throw line |
| 5 | Heavy in the elevator | Newton's three laws | The elevator scale |
| 6 | The egg drop | momentum, impulse | Egg drop |
| 7 | Burn off that donut | work, PE, KE, Calories | Stairs vs. snacks |
| 8 | Why is my power bill so high? | power, kWh, volts and amps | Power bill + breaker |
| 9 | How far away is the storm? | waves, sound, Doppler | Count the thunder + Doppler drive-by |
| 🎓 | Final exam | everything | Printable diploma |

Problems check your answer (with a little tolerance and hints for unit
mix-ups), award XP and stars, and remember your progress in the browser. There's
a built-in calculator and formula sheet.

## How it's built

Plain HTML, CSS and JavaScript, with no build step and no dependencies:

- `site/physics/index.html`: all the lesson text and problems
- `site/physics/app.js`: navigation, answer checking, XP, the calculator and the diploma
- `site/physics/labs.js`: the ten canvas labs
- `site/physics/style.css`: the look, in light and dark mode
- `worker.js` + `wrangler.jsonc`: a Cloudflare Worker that serves `site/` on the
  route `brandonskar.com/physics*` (the rest of brandonskar.com is served by other Workers)

## Run it locally

```sh
npm install
npm run dev       # http://localhost:8787/physics/
```

## Deploy

```sh
npm run deploy
```

## Adding a problem

Add a block like this inside a lesson's `.practice` card:

```html
<div class="problem" data-id="speed-5" data-answer="2.5" data-unit="hours">
  <p>The question…</p>
  <p class="hint">A nudge in the right direction.</p>
  <div class="solution"><p>The worked answer: <b>2.5 hours</b>.</p></div>
</div>
```

Answers within 3% count (set `data-tol="0.05"` for 5%, or `data-abs="1"` for ±1).
For multiple choice, use `data-type="choice"` with a `<ul class="choices">` and
mark the right `<li>` with `data-correct`. Keep `data-id` unique: it's the key
for saved progress.
