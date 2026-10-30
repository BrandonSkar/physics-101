// The hands-on labs for Physics 101. app.js starts each one the first time its
// lesson opens: PhysicsLabs[name](el, api) fills el, and calls api.done() once
// the visitor has properly tried it. Every lab runs on the formulas from its
// lesson, in meters and seconds, and its canvas follows the page's colours.
(function () {
	"use strict";

	const G = 9.8;
	const MPH = 0.44704; // m/s in 1 mph
	const LB = 2.20462; // lb in 1 kg
	const FONT = "'M PLUS Rounded 1c', ui-rounded, system-ui, sans-serif";
	const labs = {};
	window.PhysicsLabs = labs;

	// ------------------------------------------------------------ helpers

	function palette() {
		const s = getComputedStyle(document.documentElement);
		const v = (n) => s.getPropertyValue("--" + n).trim();
		return {
			ink: v("ink"), muted: v("muted"), line: v("line"), surface: v("surface"), surface2: v("surface-2"),
			edge: v("edge"), accent: v("accent"), sun: v("sun"), good: v("good"), bad: v("bad"), warn: v("warn"),
			skyTop: v("sky-top"), skyLow: v("sky-low"), grass: v("grass"), road: v("road"),
		};
	}

	const stages = [];
	const dark = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
	if (dark && dark.addEventListener) dark.addEventListener("change", () => stages.forEach((s) => s.draw && s.draw()));

	// A canvas as wide as its lab (height = width × ratio, kept between minH and
	// maxH) that stays sharp on high-density screens. Set view.draw; it runs again
	// whenever the size or the colour scheme changes.
	function stage(parent, ratio, minH, maxH) {
		const wrap = document.createElement("div");
		wrap.className = "canvas-wrap";
		const canvas = document.createElement("canvas");
		wrap.append(canvas);
		parent.append(wrap);
		const view = { wrap, canvas, ctx: canvas.getContext("2d"), w: 0, h: 0, draw: null };
		function fit() {
			const w = wrap.clientWidth;
			if (!w) return;
			const h = Math.round(Math.min(maxH, Math.max(minH, w * ratio)));
			if (w === view.w && h === view.h) return;
			const dpr = Math.min(window.devicePixelRatio || 1, 2);
			canvas.width = Math.round(w * dpr);
			canvas.height = Math.round(h * dpr);
			canvas.style.height = h + "px";
			view.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
			view.w = w;
			view.h = h;
			if (view.draw) view.draw();
		}
		if (window.ResizeObserver) new ResizeObserver(fit).observe(wrap);
		else window.addEventListener("resize", fit);
		fit();
		stages.push(view);
		return view;
	}

	// Calls step(dt, now) every frame until it returns false. Returns a stopper.
	function animate(step) {
		let last = performance.now();
		let alive = true;
		let id = 0;
		function frame(now) {
			if (!alive) return;
			const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
			last = now;
			if (step(dt, now) === false) {
				alive = false;
				return;
			}
			id = requestAnimationFrame(frame);
		}
		id = requestAnimationFrame(frame);
		return () => {
			alive = false;
			cancelAnimationFrame(id);
		};
	}

	function rangeHTML(name, label, min, max, step, value) {
		return '<label class="ctl"><span class="ctl-top"><span>' + label + '</span><output data-for="' + name + '"></output></span>' +
			'<input type="range" name="' + name + '" min="' + min + '" max="' + max + '" step="' + step + '" value="' + value + '"></label>';
	}

	function bindRange(root, name, show, onChange) {
		const input = root.querySelector('input[name="' + name + '"]');
		const out = root.querySelector('output[data-for="' + name + '"]');
		const read = () => parseFloat(input.value);
		input.addEventListener("input", () => {
			out.textContent = show(read());
			if (onChange) onChange(read());
		});
		out.textContent = show(read());
		return {
			input,
			get: read,
			set(v) {
				input.value = v;
				out.textContent = show(read());
				if (onChange) onChange(read());
			},
		};
	}

	function segHTML(name, label, options, selected) {
		return '<div class="ctl"><span class="ctl-top"><span>' + label + '</span></span><div class="seg" role="group" aria-label="' + label + '" data-seg="' + name + '">' +
			options.map((o) => '<button type="button" data-v="' + o[0] + '" aria-pressed="' + (o[0] === selected) + '">' + o[1] + "</button>").join("") +
			"</div></div>";
	}

	function bindSeg(root, name, onChange) {
		const box = root.querySelector('[data-seg="' + name + '"]');
		let value = box.querySelector('[aria-pressed="true"]').dataset.v;
		box.addEventListener("click", (e) => {
			const b = e.target.closest("button");
			if (!b || b.disabled) return;
			box.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
			value = b.dataset.v;
			if (onChange) onChange(value);
		});
		return {
			box,
			get: () => value,
			disable(off) {
				box.querySelectorAll("button").forEach((b) => (b.disabled = off));
			},
		};
	}

	function tileHTML(key, label) {
		return '<div class="tile" data-tile="' + key + '"><span>' + label + "</span><b>–</b></div>";
	}

	function tiles(root) {
		const all = {};
		root.querySelectorAll("[data-tile]").forEach((t) => (all[t.dataset.tile] = t));
		return {
			set(key, text, mood) {
				const t = all[key];
				t.querySelector("b").textContent = text;
				t.classList.toggle("hot", mood === "hot");
				t.classList.toggle("ok", mood === "ok");
			},
		};
	}

	function message(root) {
		const p = root.querySelector(".lab-msg");
		return (text, mood) => {
			p.textContent = text;
			p.className = "lab-msg" + (mood ? " " + mood : "");
		};
	}

	function rrect(ctx, x, y, w, h, r) {
		ctx.beginPath();
		if (ctx.roundRect) {
			ctx.roundRect(x, y, w, h, r);
		} else {
			r = Math.min(r, w / 2, h / 2);
			ctx.moveTo(x + r, y);
			ctx.arcTo(x + w, y, x + w, y + h, r);
			ctx.arcTo(x + w, y + h, x, y + h, r);
			ctx.arcTo(x, y + h, x, y, r);
			ctx.arcTo(x, y, x + w, y, r);
			ctx.closePath();
		}
	}

	function font(size, weight) {
		return (weight || 800) + " " + size + "px " + FONT;
	}

	const num = (n, digits) => n.toLocaleString("en-US", { minimumFractionDigits: digits || 0, maximumFractionDigits: digits || 0 });
	const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

	// Text the visitor is typing into shouldn't trigger keyboard shortcuts.
	const typing = (t) => t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);

	let audio = null;
	function getAudio() {
		const AC = window.AudioContext || window.webkitAudioContext;
		if (!AC) return null;
		if (!audio) audio = new AC();
		if (audio.state === "suspended") audio.resume();
		return audio;
	}

	// A side-on cartoon car whose front bumper is at x, wheels on the ground at y.
	function drawCar(ctx, front, ground, len, color, braking) {
		const L = len;
		const H = L * 0.3;
		const x = front - L;
		const y = ground - H - L * 0.1;
		ctx.save();
		ctx.lineWidth = 2;
		ctx.strokeStyle = "#141a26";
		ctx.fillStyle = color;
		rrect(ctx, x + L * 0.2, y - H * 0.75, L * 0.52, H * 0.95, H * 0.35);
		ctx.fill();
		ctx.stroke();
		ctx.fillStyle = "rgba(225,242,255,0.95)";
		rrect(ctx, x + L * 0.47, y - H * 0.58, L * 0.2, H * 0.55, H * 0.15);
		ctx.fill();
		rrect(ctx, x + L * 0.25, y - H * 0.58, L * 0.18, H * 0.55, H * 0.15);
		ctx.fill();
		ctx.fillStyle = color;
		rrect(ctx, x, y, L, H, H * 0.4);
		ctx.fill();
		ctx.stroke();
		ctx.fillStyle = "#fff4b8";
		ctx.fillRect(front - 4, y + H * 0.22, 3, H * 0.3);
		ctx.fillStyle = braking ? "#ff2020" : "#7a1d1d";
		ctx.fillRect(x + 1, y + H * 0.22, 4, H * 0.32);
		if (braking) {
			ctx.fillStyle = "rgba(255,40,40,0.35)";
			ctx.beginPath();
			ctx.arc(x + 2, y + H * 0.38, H * 0.6, 0, Math.PI * 2);
			ctx.fill();
		}
		ctx.fillStyle = "#141a26";
		for (const f of [0.22, 0.78]) {
			ctx.beginPath();
			ctx.arc(x + L * f, ground - L * 0.1, L * 0.1, 0, Math.PI * 2);
			ctx.fill();
			ctx.fillStyle = "#9aa3b0";
			ctx.beginPath();
			ctx.arc(x + L * f, ground - L * 0.1, L * 0.04, 0, Math.PI * 2);
			ctx.fill();
			ctx.fillStyle = "#141a26";
		}
		ctx.restore();
	}

	function emoji(ctx, ch, x, y, size) {
		ctx.save();
		// Colour emoji still take on the fill's transparency.
		ctx.fillStyle = "#000";
		ctx.globalAlpha = 1;
		ctx.font = size + "px 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif";
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		ctx.fillText(ch, x, y);
		ctx.restore();
	}

	// ------------------------------------------------------------ 1. road trip

	labs.roadtrip = function (el, api) {
		el.innerHTML =
			'<div class="controls">' +
			rangeHTML("dist", "Trip length", 5, 500, 5, 300) +
			rangeHTML("you", "🔵 Your speed", 40, 100, 1, 70) +
			rangeHTML("them", "🔴 Cousin's speed", 40, 100, 1, 80) +
			"</div>" +
			'<div class="lab-buttons"><button class="btn primary" type="button" data-go>🏁 Race!</button></div>';
		const view = stage(el, 0.36, 180, 290);
		el.insertAdjacentHTML(
			"beforeend",
			'<div class="readouts">' + tileHTML("you", "Your drive") + tileHTML("them", "Cousin's drive") + tileHTML("gap", "Time saved by the faster car") + tileHTML("commute", "Same speeds, 10-mile commute") + "</div>" +
			'<p class="lab-msg" aria-live="polite"></p>'
		);
		const t = tiles(el);
		const say = message(el);
		const go = el.querySelector("[data-go]");
		let shown = 0; // trip hours drawn so far
		let racing = false;

		const changed = () => {
			if (racing) return;
			shown = 0;
			say("");
			update();
		};
		const dist = bindRange(el, "dist", (v) => v + " mi", changed);
		const you = bindRange(el, "you", (v) => v + " mph", changed);
		const them = bindRange(el, "them", (v) => v + " mph", changed);

		function hm(hours) {
			const m = Math.round(hours * 60);
			if (m < 60) return m + " min";
			return Math.floor(m / 60) + " h " + (m % 60) + " min";
		}
		function ms(hours) {
			const s = Math.round(hours * 3600);
			if (s < 60) return s + " s";
			if (s >= 3600) return hm(hours);
			return Math.floor(s / 60) + " min " + (s % 60) + " s";
		}

		function update() {
			const d = dist.get();
			const a = d / you.get();
			const b = d / them.get();
			t.set("you", hm(a));
			t.set("them", hm(b));
			t.set("gap", a === b ? "None" : ms(Math.abs(a - b)));
			t.set("commute", you.get() === them.get() ? "None" : ms(Math.abs(10 / you.get() - 10 / them.get())));
			view.draw();
		}

		go.addEventListener("click", () => {
			if (racing) return;
			racing = true;
			go.disabled = true;
			say("");
			shown = 0;
			const d = dist.get();
			const slow = Math.max(d / you.get(), d / them.get());
			animate((dt) => {
				shown = Math.min(slow, shown + (dt * slow) / 4);
				view.draw();
				if (shown < slow) return true;
				racing = false;
				go.disabled = false;
				finish();
				return false;
			});
		});

		function finish() {
			const d = dist.get();
			const vy = you.get();
			const vc = them.get();
			const gap = Math.abs(d / vy - d / vc);
			if (vy === vc) say("Same speed, same time. You arrive together. 🤝");
			else {
				const who = vc > vy ? "Your cousin" : "You";
				const extra = Math.abs(vc - vy);
				say(who + " got there " + ms(gap) + " sooner by driving " + extra + " mph faster for " + d + " miles. Worth a ticket?", "good");
			}
			api.done();
		}

		view.draw = function () {
			const { ctx, w, h } = view;
			const c = palette();
			ctx.clearRect(0, 0, w, h);
			ctx.fillStyle = c.grass;
			ctx.fillRect(0, 0, w, h);
			const carLen = clamp(w * 0.09, 40, 64);
			const x0 = carLen + 8;
			const x1 = w - 24;
			const d = dist.get();
			const lanes = [
				{ y: h * 0.18, speed: you.get(), color: "#2f7de1", label: "You" },
				{ y: h * 0.56, speed: them.get(), color: "#e2507f", label: "Cousin" },
			];
			const laneH = h * 0.3;
			for (const lane of lanes) {
				ctx.fillStyle = c.road;
				ctx.fillRect(0, lane.y, w, laneH);
				ctx.strokeStyle = "rgba(255,255,255,0.75)";
				ctx.lineWidth = 2;
				ctx.setLineDash([14, 12]);
				ctx.beginPath();
				ctx.moveTo(0, lane.y + laneH - 4);
				ctx.lineTo(w, lane.y + laneH - 4);
				ctx.stroke();
				ctx.setLineDash([]);
			}
			// Mile markers, then the start and the checkered finish.
			const step = d <= 20 ? 5 : d <= 60 ? 10 : d <= 200 ? 50 : 100;
			ctx.font = font(11, 700);
			ctx.textAlign = "center";
			ctx.fillStyle = c.ink;
			for (let m = step; m < d; m += step) {
				const x = x0 + ((x1 - x0) * m) / d;
				ctx.fillRect(x - 1, lanes[1].y + laneH, 2, 6);
				ctx.fillText(m + " mi", x, lanes[1].y + laneH + 18);
			}
			ctx.fillStyle = "#ffffff";
			ctx.fillRect(x0 - 2, lanes[0].y, 3, lanes[1].y + laneH - lanes[0].y);
			const sq = 6;
			for (let yy = lanes[0].y, i = 0; yy < lanes[1].y + laneH; yy += sq, i++) {
				ctx.fillStyle = i % 2 ? "#111" : "#fff";
				ctx.fillRect(x1, yy, sq, sq);
				ctx.fillStyle = i % 2 ? "#fff" : "#111";
				ctx.fillRect(x1 + sq, yy, sq, sq);
			}
			for (const lane of lanes) {
				const p = Math.min(1, (lane.speed * shown) / d);
				drawCar(ctx, x0 + (x1 - x0 - 2) * p, lane.y + laneH - 8, carLen, lane.color, false);
				ctx.font = font(13);
				ctx.textAlign = "left";
				ctx.fillStyle = "#ffffff";
				ctx.fillText(lane.label + " · " + lane.speed + " mph", x0 + 8, lane.y + 16);
				if (p >= 1 && shown > 0) {
					ctx.textAlign = "right";
					ctx.fillText("🏁 " + hm(d / lane.speed), x1 - 8, lane.y + 16);
				}
			}
			ctx.textAlign = "right";
			ctx.font = font(14);
			ctx.fillStyle = c.ink;
			ctx.fillText("⏱ " + hm(shown), w - 10, h * 0.12);
		};
		update();
	};

	// ------------------------------------------------------------ 2. stopping distance

	labs.stopping = function (el, api) {
		const ROADS = { dry: 0.7, wet: 0.4, icy: 0.1 };
		const DEER = 50; // meters ahead
		el.innerHTML =
			'<div class="controls">' +
			rangeHTML("speed", "Speed", 20, 80, 1, 45) +
			rangeHTML("react", "Reaction time", 0.5, 3, 0.1, 1) +
			segHTML("road", "Road", [["dry", "☀️ Dry"], ["wet", "🌧️ Wet"], ["icy", "🧊 Icy"]], "dry") +
			'<div class="ctl"><span class="ctl-top"><span>Driver</span></span><div class="seg" data-presets>' +
			'<button type="button" data-t="0.7">😃 Alert</button><button type="button" data-t="1.5">🥱 Tired</button><button type="button" data-t="2.5">📱 Texting</button></div></div>' +
			"</div>" +
			'<div class="lab-buttons"><button class="btn primary" type="button" data-go>🦌 Drive and brake!</button></div>';
		const view = stage(el, 0.36, 190, 280);
		el.insertAdjacentHTML(
			"beforeend",
			'<div class="readouts">' + tileHTML("v", "Your speed") + tileHTML("dr", "Reaction distance") + tileHTML("db", "Braking distance") + tileHTML("total", "Total to stop") + "</div>" +
			'<p class="lab-msg" aria-live="polite"></p>'
		);
		const t = tiles(el);
		const say = message(el);
		const go = el.querySelector("[data-go]");
		let run = null;

		const changed = () => {
			if (run && !run.done) return;
			run = null;
			say("");
			update();
		};
		const speed = bindRange(el, "speed", (v) => v + " mph", changed);
		const react = bindRange(el, "react", (v) => v.toFixed(1) + " s", changed);
		const road = bindSeg(el, "road", changed);
		el.querySelector("[data-presets]").addEventListener("click", (e) => {
			const b = e.target.closest("button");
			if (b && !(run && !run.done)) react.set(parseFloat(b.dataset.t));
		});

		function numbers() {
			const v = speed.get() * MPH;
			const tr = react.get();
			const a = ROADS[road.get()] * G;
			const dr = v * tr;
			const db = (v * v) / (2 * a);
			return { v, tr, a, dr, db, total: dr + db };
		}

		function update() {
			const n = numbers();
			t.set("v", num(n.v, 1) + " m/s");
			t.set("dr", num(n.dr, 1) + " m");
			t.set("db", num(n.db, 1) + " m");
			t.set("total", num(n.total, 1) + " m", n.total > DEER ? "hot" : "ok");
			view.draw();
		}

		go.addEventListener("click", () => {
			if (run && !run.done) return;
			const n = numbers();
			run = { n, t: 0, x: 0, braking: false, done: false, hit: false, vHit: 0 };
			go.disabled = true;
			say("");
			animate((dt) => {
				run.t += dt;
				if (run.t < n.tr) {
					run.x = n.v * run.t;
				} else {
					run.braking = true;
					const tb = run.t - n.tr;
					if (n.v - n.a * tb <= 0) {
						run.x = n.total;
						run.done = true;
					} else {
						run.x = n.dr + n.v * tb - 0.5 * n.a * tb * tb;
					}
				}
				if (run.x >= DEER) {
					run.x = DEER;
					run.hit = true;
					run.done = true;
					run.vHit = n.dr >= DEER ? n.v : Math.sqrt(Math.max(0, n.v * n.v - 2 * n.a * (DEER - n.dr)));
				}
				view.draw();
				if (!run.done) return true;
				go.disabled = false;
				if (run.hit) {
					say("💥 Too late. You'd hit the deer at " + num(run.vHit / MPH) + " mph. You needed " + num(n.total, 1) + " m to stop, but had only " + DEER + " m.", "bad");
				} else {
					say("😅 Stopped with " + num(DEER - n.total, 1) + " m to spare. The deer wanders off, unimpressed.", "good");
				}
				api.done();
				return false;
			});
		});

		view.draw = function () {
			const { ctx, w, h } = view;
			const c = palette();
			const n = run ? run.n : numbers();
			ctx.clearRect(0, 0, w, h);
			const sky = ctx.createLinearGradient(0, 0, 0, h * 0.55);
			sky.addColorStop(0, "#f7a96b");
			sky.addColorStop(1, "#ffd9a8");
			ctx.fillStyle = sky;
			ctx.fillRect(0, 0, w, h);
			const ground = h * 0.62;
			ctx.fillStyle = c.grass;
			ctx.fillRect(0, h * 0.5, w, h * 0.5);
			ctx.fillStyle = c.road;
			ctx.fillRect(0, h * 0.5, w, ground - h * 0.5 + 10);
			const left = 14;
			const s = (w - left - 26) / (DEER + 9); // pixels per meter, with 5 m of car room
			const X = (m) => left + (m + 5) * s;
			// Distance ticks.
			ctx.font = font(11, 700);
			ctx.textAlign = "center";
			ctx.fillStyle = c.ink;
			for (let m = 0; m <= DEER; m += 10) {
				ctx.fillRect(X(m) - 1, ground + 4, 2, 6);
				ctx.fillText(m + " m", X(m), ground + 22);
			}
			// The plan: reaction (yellow) then braking (red), drawn to scale.
			const barY = h * 0.84;
			const barH = Math.max(10, h * 0.06);
			const endR = Math.min(X(n.dr), w - 6);
			const endB = Math.min(X(n.total), w - 6);
			ctx.fillStyle = "#f7c531";
			ctx.fillRect(X(0), barY, endR - X(0), barH);
			ctx.fillStyle = "#e5484d";
			if (endB > endR) ctx.fillRect(endR, barY, endB - endR, barH);
			ctx.strokeStyle = "#141a26";
			ctx.lineWidth = 1.5;
			ctx.strokeRect(X(0), barY, endB - X(0), barH);
			if (X(n.total) > w - 6) {
				ctx.fillStyle = c.ink;
				ctx.font = font(12);
				ctx.textAlign = "right";
				ctx.fillText("→ " + num(n.total) + " m", w - 10, barY - 4);
			}
			ctx.textAlign = "left";
			ctx.font = font(11);
			ctx.fillStyle = "#141a26";
			if (endR - X(0) > 60) ctx.fillText("thinking", X(0) + 4, barY + barH - 2);
			if (endB - endR > 56) ctx.fillText("braking", endR + 4, barY + barH - 2);
			// The deer, and the car.
			const deerSize = clamp(s * 2.6, 26, 48);
			emoji(ctx, run && run.hit ? "💥" : "🦌", X(DEER) + deerSize * 0.45, ground - deerSize * 0.45, deerSize);
			const x = run ? run.x : 0;
			const carLen = Math.max(36, 4.5 * s);
			if (run && run.braking) {
				ctx.strokeStyle = "rgba(20,20,20,0.55)";
				ctx.lineWidth = 3;
				ctx.beginPath();
				ctx.moveTo(X(n.dr) - carLen * 0.78, ground - 2);
				ctx.lineTo(X(x) - carLen * 0.78, ground - 2);
				ctx.stroke();
			}
			drawCar(ctx, X(x), ground, carLen, "#2f7de1", !!(run && run.braking));
			if (run && !run.done && !run.braking) emoji(ctx, "🤔", X(x) - carLen * 0.5, ground - carLen * 0.62, 20);
			ctx.font = font(13);
			ctx.textAlign = "left";
			ctx.fillStyle = "#3b2a14";
			ctx.fillText(speed.get() + " mph · " + react.get().toFixed(1) + " s to react · " + road.get() + " road", 10, 20);
		};
		update();
	};

	// ------------------------------------------------------------ 3. ruler drop

	labs.ruler = function (el, api) {
		const LEN = 1; // a meter stick
		el.innerHTML =
			'<div class="lab-buttons"><button class="btn primary" type="button" data-ready>🖐️ Get ready</button>' +
			'<button class="btn sun catch" type="button" data-catch disabled>Catch!</button></div>';
		const view = stage(el, 0.62, 320, 440);
		el.insertAdjacentHTML("beforeend", '<p class="lab-msg" aria-live="polite">Press Get ready. Then catch it the instant it drops.</p><ol class="tries"></ol>');
		const say = message(el);
		const readyBtn = el.querySelector("[data-ready]");
		const catchBtn = el.querySelector("[data-catch]");
		const list = el.querySelector(".tries");
		let mode = "idle"; // idle, armed, falling, caught, missed, early
		let dropAt = 0;
		let scheduled = 0;
		let fallen = 0;
		let stop = null;
		const tries = [];

		function verdict(t) {
			if (t < 0.16) return "Lightning reflexes ⚡";
			if (t < 0.2) return "Cat-like 🐈";
			if (t < 0.25) return "A solid, normal human 👍";
			if (t < 0.3) return "A little sleepy 😴";
			return "Coffee first? ☕";
		}

		function ready() {
			if (mode === "armed" || mode === "falling") return;
			mode = "armed";
			fallen = 0;
			scheduled = performance.now() + 1200 + Math.random() * 2300;
			readyBtn.disabled = true;
			catchBtn.disabled = false;
			say("Eyes on the ruler…");
			if (stop) stop();
			stop = animate((dt, now) => {
				if (mode === "armed" && now >= scheduled) {
					mode = "falling";
					dropAt = now;
				}
				if (mode === "falling") {
					const t = (now - dropAt) / 1000;
					fallen = 0.5 * G * t * t;
					if (fallen >= LEN) {
						fallen = LEN;
						mode = "missed";
						end();
						say("It got away! A meter stick falls its whole length in 0.45 s. Try again.", "bad");
					}
				}
				view.draw();
				return mode === "armed" || mode === "falling";
			});
		}

		function grab() {
			if (mode === "armed") {
				mode = "early";
				if (stop) stop();
				end();
				say("Too early! You grabbed before it dropped. No guessing. 😄", "bad");
				view.draw();
				return;
			}
			if (mode !== "falling") return;
			const t = (performance.now() - dropAt) / 1000;
			fallen = Math.min(LEN, 0.5 * G * t * t);
			if (stop) stop();
			mode = "caught";
			end();
			const cm = fallen * 100;
			const time = Math.sqrt((2 * fallen) / G);
			tries.unshift({ cm, time });
			if (tries.length > 5) tries.pop();
			say("Caught at " + num(cm, 1) + " cm → t = √(2 × " + num(fallen, 3) + " ÷ 9.8) = " + num(time, 3) + " s. " + verdict(time), "good");
			paintTries();
			view.draw();
			api.done();
		}

		function end() {
			readyBtn.disabled = false;
			catchBtn.disabled = true;
			readyBtn.textContent = "🖐️ Try again";
		}

		function paintTries() {
			const best = Math.min.apply(null, tries.map((x) => x.time));
			list.replaceChildren();
			tries.forEach((x, i) => {
				const li = document.createElement("li");
				if (x.time === best && tries.length > 1) li.className = "best";
				li.innerHTML = "<span></span><span></span>";
				li.firstChild.textContent = (i === 0 ? "Latest: " : "") + num(x.cm, 1) + " cm";
				li.lastChild.textContent = num(x.time, 3) + " s · at 60 mph that's " + num(26.8 * x.time, 1) + " m of road";
				list.append(li);
			});
		}

		readyBtn.addEventListener("click", ready);
		catchBtn.addEventListener("pointerdown", (e) => {
			e.preventDefault();
			grab();
		});
		catchBtn.addEventListener("click", (e) => {
			if (e.detail === 0) grab(); // keyboard press of the button
		});
		view.canvas.addEventListener("pointerdown", (e) => {
			e.preventDefault();
			if (mode === "armed" || mode === "falling") grab();
			else ready();
		});
		document.addEventListener("keydown", (e) => {
			if (e.code !== "Space" || e.repeat || typing(e.target) || !api.visible()) return;
			if (mode === "armed" || mode === "falling") {
				e.preventDefault();
				grab();
			}
		});

		view.draw = function () {
			const { ctx, w, h } = view;
			const c = palette();
			ctx.clearRect(0, 0, w, h);
			ctx.fillStyle = c.surface2;
			ctx.fillRect(0, 0, w, h);
			const fingerY = h * 0.8;
			const top = 14;
			const pxm = (fingerY - top) / LEN;
			const rw = clamp(w * 0.11, 44, 64);
			const rx = w / 2 - rw / 2;
			const zeroY = fingerY + fallen * pxm;
			const topY = zeroY - LEN * pxm;
			// The meter stick, 0 at the bottom between your fingers.
			ctx.fillStyle = "#f4d35e";
			ctx.strokeStyle = "#5c4a12";
			ctx.lineWidth = 2;
			ctx.fillRect(rx, topY, rw, LEN * pxm);
			ctx.strokeRect(rx, topY, rw, LEN * pxm);
			ctx.fillStyle = "#3b300c";
			ctx.textAlign = "left";
			ctx.font = font(11, 800);
			for (let cm = 0; cm <= 100; cm++) {
				const y = zeroY - (cm / 100) * pxm;
				if (y < -10 || y > h + 10) continue;
				const len = cm % 10 === 0 ? rw * 0.45 : cm % 5 === 0 ? rw * 0.3 : rw * 0.16;
				if (cm % 10 !== 0 && pxm / 100 < 2.4) continue;
				ctx.fillRect(rx, y - 0.5, len, 1);
				if (cm % 10 === 0 && cm > 0) ctx.fillText(String(cm), rx + rw * 0.5, y + 4);
			}
			// Thumb and finger: open while waiting, pinched once caught.
			const closed = mode === "caught";
			const gap = closed ? 0 : 18;
			const fw = clamp(w * 0.16, 54, 110);
			const fh = 26;
			ctx.fillStyle = "#f0bf96";
			ctx.strokeStyle = "#8a5a3a";
			ctx.lineWidth = 2;
			rrect(ctx, rx - gap - fw, fingerY - fh / 2, fw, fh, fh / 2);
			ctx.fill();
			ctx.stroke();
			rrect(ctx, rx + rw + gap, fingerY - fh / 2, fw, fh, fh / 2);
			ctx.fill();
			ctx.stroke();
			ctx.fillStyle = "#f7d9c2";
			rrect(ctx, rx + rw + gap + 4, fingerY - fh / 2 + 5, 14, fh - 10, 5);
			ctx.fill();
			rrect(ctx, rx - gap - 18, fingerY - fh / 2 + 5, 14, fh - 10, 5);
			ctx.fill();
			// Reading at the fingers.
			ctx.fillStyle = c.ink;
			ctx.font = font(18);
			ctx.textAlign = "left";
			const label = mode === "caught" || mode === "falling" || mode === "missed" ? num(fallen * 100, 1) + " cm" : "";
			if (label) ctx.fillText(label, rx + rw + gap + fw + 10, fingerY + 6);
			ctx.textAlign = "center";
			ctx.font = font(15);
			ctx.fillStyle = c.muted;
			const note = { idle: "Tap here or press Get ready", armed: "Get ready…", early: "Too early!", missed: "Missed!", caught: "Gotcha!", falling: "" }[mode];
			if (note) ctx.fillText(note, w / 2, h - 12);
		};
		view.draw();
	};

	// ------------------------------------------------------------ 4. free throw

	labs.freethrow = function (el, api) {
		const HAND = { x: 0.7, y: 2.1 };
		const HOOP = { x: 4.9, y: 3.05, r: 0.229 };
		const BALL = 0.12;
		const BOARD = { x: 5.28, y0: 2.9, y1: 3.95 };
		const WORLD = 6.0;
		el.innerHTML =
			'<div class="controls">' + rangeHTML("angle", "Launch angle", 25, 75, 1, 45) + rangeHTML("speed", "Launch speed", 5, 10, 0.1, 7) + "</div>" +
			'<div class="lab-buttons"><button class="btn primary" type="button" data-go>🏀 Shoot!</button><span class="hero-note" data-score>0 of 0 made</span></div>';
		const view = stage(el, 0.62, 230, 420);
		el.insertAdjacentHTML("beforeend", '<p class="lab-msg" aria-live="polite"></p>');
		const say = message(el);
		const go = el.querySelector("[data-go]");
		const score = el.querySelector("[data-score]");
		let ball = null;
		let path = [];
		const old = [];
		let shots = 0;
		let makes = 0;
		let flying = false;
		const angle = bindRange(el, "angle", (v) => v + "°", () => !flying && view.draw());
		const speed = bindRange(el, "speed", (v) => v.toFixed(1) + " m/s", () => !flying && view.draw());

		function bounce(px, py, e) {
			const dx = ball.x - px;
			const dy = ball.y - py;
			const d = Math.hypot(dx, dy);
			const reach = BALL + 0.01;
			if (d >= reach || d === 0) return false;
			const nx = dx / d;
			const ny = dy / d;
			const vn = ball.vx * nx + ball.vy * ny;
			if (vn < 0) {
				ball.vx -= (1 + e) * vn * nx;
				ball.vy -= (1 + e) * vn * ny;
			}
			ball.x = px + nx * reach;
			ball.y = py + ny * reach;
			return true;
		}

		go.addEventListener("click", () => {
			if (flying) return;
			flying = true;
			go.disabled = true;
			say("");
			if (path.length) {
				old.unshift(path);
				if (old.length > 3) old.pop();
			}
			const a = (angle.get() * Math.PI) / 180;
			const v = speed.get();
			ball = { x: HAND.x, y: HAND.y, vx: v * Math.cos(a), vy: v * Math.sin(a), t: 0, rim: false, board: false, made: false, cross: null, top: HAND.y };
			path = [[ball.x, ball.y]];
			animate((dt) => {
				const STEP = 1 / 240;
				for (let s = dt; s > 0; s -= STEP) {
					const h = Math.min(STEP, s);
					const prevY = ball.y;
					ball.vy -= G * h;
					ball.x += ball.vx * h;
					ball.y += ball.vy * h;
					ball.t += h;
					ball.top = Math.max(ball.top, ball.y);
					if (bounce(HOOP.x - HOOP.r, HOOP.y, 0.55)) ball.rim = true;
					if (bounce(HOOP.x + HOOP.r, HOOP.y, 0.55)) ball.rim = true;
					if (ball.x + BALL > BOARD.x && ball.x < BOARD.x + 0.05 && ball.y > BOARD.y0 && ball.y < BOARD.y1 && ball.vx > 0) {
						ball.x = BOARD.x - BALL;
						ball.vx = -ball.vx * 0.6;
						ball.board = true;
					}
					if (prevY >= HOOP.y && ball.y < HOOP.y && ball.vy < 0) {
						if (ball.cross === null) ball.cross = ball.x;
						if (!ball.made && Math.abs(ball.x - HOOP.x) < HOOP.r) {
							ball.made = true;
							ball.vx *= 0.3;
							ball.vy *= 0.6;
						}
					}
				}
				path.push([ball.x, ball.y]);
				view.draw();
				if (ball.y > BALL && ball.t < 5 && ball.x < WORLD + 0.5 && ball.x > -0.5) return true;
				flying = false;
				go.disabled = false;
				result();
				return false;
			});
		});

		function result() {
			shots++;
			if (ball.made) makes++;
			score.textContent = makes + " of " + shots + " made";
			if (ball.made) {
				say(ball.board ? "Bank shot! 🏦 It counts." : ball.rim ? "It rattles in! 🎉" : "Swish! Nothing but net. 🏀", "good");
				api.done();
			} else if (ball.top < HOOP.y) {
				say("Didn't even reach rim height (3.05 m). More speed or a higher angle.", "bad");
			} else if (ball.rim) {
				say("Off the rim! So close. Nudge the speed by 0.1.", "bad");
			} else if (ball.board) {
				say("Off the backboard. A touch softer.", "bad");
			} else if (ball.cross !== null && ball.cross < HOOP.x) {
				say("Air ball: short. A little more speed.", "bad");
			} else {
				say("Long! Ease off a little.", "bad");
			}
			if (shots === 3 && !makes) say("Hint: try about 52° at 7.2 m/s. Real shooters use 45–55°.");
		}

		view.draw = function () {
			const { ctx, w, h } = view;
			const c = palette();
			ctx.clearRect(0, 0, w, h);
			ctx.fillStyle = c.surface2;
			ctx.fillRect(0, 0, w, h);
			const floor = h - 16;
			const s = Math.min(w / WORLD, (floor - 10) / 4.4);
			const ox = (w - WORLD * s) / 2;
			const X = (x) => ox + x * s;
			const Y = (y) => floor - y * s;
			ctx.fillStyle = "#d9a066";
			ctx.fillRect(0, floor, w, h - floor);
			ctx.fillStyle = "#b37a42";
			ctx.fillRect(0, floor, w, 3);
			// Height guide.
			ctx.strokeStyle = c.line;
			ctx.lineWidth = 1;
			ctx.setLineDash([4, 6]);
			ctx.beginPath();
			ctx.moveTo(X(0), Y(HOOP.y));
			ctx.lineTo(X(HOOP.x - HOOP.r), Y(HOOP.y));
			ctx.stroke();
			ctx.setLineDash([]);
			ctx.fillStyle = c.muted;
			ctx.font = font(11, 700);
			ctx.textAlign = "left";
			ctx.fillText("rim 3.05 m", X(0) + 4, Y(HOOP.y) - 4);
			// Pole, board, rim and net.
			ctx.fillStyle = "#8b95a3";
			ctx.fillRect(X(5.62), Y(3.6), 0.07 * s, 3.6 * s);
			ctx.fillRect(X(BOARD.x + 0.05), Y(3.45), X(5.62) - X(BOARD.x + 0.05), 0.05 * s);
			ctx.fillStyle = "#ffffff";
			ctx.strokeStyle = c.edge;
			ctx.lineWidth = 2;
			ctx.fillRect(X(BOARD.x), Y(BOARD.y1), 0.05 * s, (BOARD.y1 - BOARD.y0) * s);
			ctx.strokeRect(X(BOARD.x), Y(BOARD.y1), 0.05 * s, (BOARD.y1 - BOARD.y0) * s);
			ctx.strokeStyle = "rgba(140,150,165,0.9)";
			ctx.lineWidth = 1.2;
			ctx.beginPath();
			const netB = 0.42;
			for (let k = 0; k <= 4; k++) {
				const top = HOOP.x - HOOP.r + (k / 4) * 2 * HOOP.r;
				const bot = HOOP.x - HOOP.r * 0.55 + (k / 4) * 1.1 * HOOP.r;
				ctx.moveTo(X(top), Y(HOOP.y));
				ctx.lineTo(X(bot), Y(HOOP.y - netB));
			}
			ctx.moveTo(X(HOOP.x - HOOP.r * 0.8), Y(HOOP.y - netB * 0.45));
			ctx.lineTo(X(HOOP.x + HOOP.r * 0.8), Y(HOOP.y - netB * 0.45));
			ctx.stroke();
			ctx.strokeStyle = "#e8642c";
			ctx.lineWidth = Math.max(3, 0.03 * s);
			ctx.lineCap = "round";
			ctx.beginPath();
			ctx.moveTo(X(HOOP.x - HOOP.r), Y(HOOP.y));
			ctx.lineTo(X(BOARD.x), Y(HOOP.y));
			ctx.stroke();
			ctx.lineCap = "butt";
			// The shooter.
			ctx.strokeStyle = c.ink;
			ctx.lineWidth = 3.5;
			ctx.lineCap = "round";
			ctx.beginPath();
			const px = 0.45;
			ctx.moveTo(X(px - 0.15), Y(0));
			ctx.lineTo(X(px), Y(0.9));
			ctx.lineTo(X(px + 0.15), Y(0));
			ctx.moveTo(X(px), Y(0.9));
			ctx.lineTo(X(px), Y(1.5));
			ctx.moveTo(X(px), Y(1.45));
			ctx.lineTo(X(HAND.x), Y(HAND.y - 0.08));
			ctx.stroke();
			ctx.beginPath();
			ctx.arc(X(px), Y(1.65), 0.14 * s, 0, Math.PI * 2);
			ctx.stroke();
			ctx.lineCap = "butt";
			// Aim arrow (only when the ball is in hand).
			if (!flying) {
				const a = (angle.get() * Math.PI) / 180;
				const L = speed.get() * 0.1;
				ctx.strokeStyle = c.accent;
				ctx.lineWidth = 3;
				ctx.setLineDash([6, 5]);
				ctx.beginPath();
				ctx.moveTo(X(HAND.x), Y(HAND.y));
				ctx.lineTo(X(HAND.x + L * Math.cos(a)), Y(HAND.y + L * Math.sin(a)));
				ctx.stroke();
				ctx.setLineDash([]);
			}
			// Old shots, faded, then this one.
			const trail = (pts, alpha) => {
				ctx.fillStyle = c.accent;
				ctx.globalAlpha = alpha;
				for (let i = 0; i < pts.length; i += 3) {
					ctx.beginPath();
					ctx.arc(X(pts[i][0]), Y(pts[i][1]), 2, 0, Math.PI * 2);
					ctx.fill();
				}
				ctx.globalAlpha = 1;
			};
			old.forEach((p, i) => trail(p, 0.25 - i * 0.07));
			trail(path, 0.8);
			const bx = flying ? ball.x : HAND.x;
			const by = flying ? ball.y : HAND.y;
			const r = BALL * s;
			ctx.fillStyle = "#f08a3c";
			ctx.strokeStyle = "#3a1f0c";
			ctx.lineWidth = 1.5;
			ctx.beginPath();
			ctx.arc(X(bx), Y(by), r, 0, Math.PI * 2);
			ctx.fill();
			ctx.stroke();
			ctx.beginPath();
			ctx.moveTo(X(bx) - r, Y(by));
			ctx.lineTo(X(bx) + r, Y(by));
			ctx.moveTo(X(bx), Y(by) - r);
			ctx.lineTo(X(bx), Y(by) + r);
			ctx.stroke();
		};
		view.draw();
	};

	// ------------------------------------------------------------ 5. elevator

	labs.elevator = function (el, api) {
		const FLOOR = 3;
		const TOP = 10;
		const A = 1.5;
		const VMAX = 3;
		el.innerHTML =
			'<div class="controls">' + rangeHTML("mass", "Your mass", 40, 130, 1, 70) + "</div>" +
			'<div class="lab-buttons"><button class="btn primary" type="button" data-up>⬆️ Up 5 floors</button>' +
			'<button class="btn primary" type="button" data-down>⬇️ Down 5 floors</button>' +
			'<button class="btn" type="button" data-cut>✂️ Cut the cable</button></div>';
		const view = stage(el, 0.58, 280, 420);
		el.insertAdjacentHTML(
			"beforeend",
			'<div class="readouts">' + tileHTML("floor", "Floor") + tileHTML("v", "Velocity") + tileHTML("a", "Acceleration") + tileHTML("scale", "Scale reads") + "</div>" +
			'<p class="lab-msg" aria-live="polite"></p>'
		);
		const t = tiles(el);
		const say = message(el);
		const up = el.querySelector("[data-up]");
		const down = el.querySelector("[data-down]");
		const cut = el.querySelector("[data-cut]");
		let y = 0;
		let v = 0;
		let a = 0;
		let mode = "idle"; // idle, ride, fall, brake
		let target = 0;
		let fallT = 0;
		let clock = 0;
		let history = [];
		let cableCut = false;
		const mass = bindRange(el, "mass", (m) => m + " kg (" + num(m * LB) + " lb)", () => {
			history = [];
			paint();
		});

		const reading = () => Math.max(0, (mass.get() * (G + a)) / G);

		function buttons() {
			const busy = mode !== "idle";
			const floor = Math.round(y / FLOOR);
			up.disabled = busy || floor >= TOP;
			down.disabled = busy || y < 0.01;
			cut.disabled = busy;
			mass.input.disabled = busy;
		}

		function start(m) {
			mode = m;
			fallT = 0;
			buttons();
			animate((dt) => {
				const STEP = 1 / 240;
				for (let s = dt; s > 0; s -= STEP) step(Math.min(STEP, s));
				clock += dt;
				history.push([clock, reading()]);
				while (history.length && history[0][0] < clock - 10) history.shift();
				paint();
				if (mode !== "idle") return true;
				// Leave a flat stretch on the graph after stopping.
				history.push([clock + 0.001, reading()]);
				buttons();
				paint();
				return false;
			});
		}

		function step(dt) {
			if (mode === "ride") {
				const dir = target > y ? 1 : -1;
				const left = Math.abs(target - y);
				let sp = v * dir;
				let acc = sp * sp >= 2 * A * left ? -Math.min(2 * A, (sp * sp) / (2 * Math.max(left, 1e-4))) : sp < VMAX ? A : 0;
				sp = Math.min(VMAX, sp + acc * dt);
				if ((acc < 0 && sp <= 0.01) || left < 0.0005) {
					y = target;
					v = 0;
					a = 0;
					mode = "idle";
					say("Arrived at floor " + label(y) + ". Notice the scale went up when the elevator sped up going up, and down when it slowed.");
					api.done();
					return;
				}
				y += sp * dir * dt;
				if ((target - y) * dir < 0) y = target;
				v = sp * dir;
				a = acc * dir;
			} else if (mode === "fall") {
				a = -G;
				v += a * dt;
				y += v * dt;
				fallT += dt;
				if (fallT >= 1 || y - (v * v) / (4 * G) <= 1) {
					mode = "brake";
					say("🛑 Emergency brakes! Now you feel three times heavier.", "bad");
				}
			} else if (mode === "brake") {
				a = 2 * G;
				v += a * dt;
				y += v * dt;
				if (v >= 0) {
					v = 0;
					a = 0;
					mode = "idle";
					say("Phew. In free fall the scale read 0: you and the scale were falling together, so it didn't have to push at all. That's how astronauts float.", "good");
					api.done();
				}
			}
		}

		function label(height) {
			const f = height / FLOOR;
			if (Math.abs(f - Math.round(f)) < 0.02) return Math.round(f) === 0 ? "L (lobby)" : String(Math.round(f));
			return "between " + (Math.floor(f) || "L") + " and " + Math.ceil(f);
		}

		up.addEventListener("click", () => {
			target = Math.min(TOP, Math.round(y / FLOOR) + 5) * FLOOR;
			cableCut = false;
			say("Going up…");
			start("ride");
		});
		down.addEventListener("click", () => {
			target = Math.max(0, Math.round(y / FLOOR) - 5) * FLOOR;
			cableCut = false;
			say("Going down…");
			start("ride");
		});
		cut.addEventListener("click", () => {
			if (y < 6) {
				say("Ride up a few floors first. The brakes need some room to work!");
				return;
			}
			cableCut = true;
			say("✂️ Snip! Free fall: the scale reads… zero?!", "bad");
			start("fall");
		});

		function paint() {
			const r = reading();
			t.set("floor", label(y));
			t.set("v", num(Math.abs(v), 1) + " m/s " + (v > 0.01 ? "↑" : v < -0.01 ? "↓" : ""));
			t.set("a", num(Math.abs(a), 1) + " m/s² " + (a > 0.01 ? "↑" : a < -0.01 ? "↓" : ""));
			t.set("scale", num(r, 1) + " kg", r > mass.get() + 0.5 ? "hot" : r < mass.get() - 0.5 ? "ok" : "");
			view.draw();
		}

		view.draw = function () {
			const { ctx, w, h } = view;
			const c = palette();
			ctx.clearRect(0, 0, w, h);
			ctx.fillStyle = c.surface2;
			ctx.fillRect(0, 0, w, h);
			// The shaft, all 11 floors.
			const sw = clamp(w * 0.22, 70, 140);
			const top = 14;
			const bottom = h - 14;
			const pm = (bottom - top) / ((TOP + 1) * FLOOR);
			const SY = (m) => bottom - m * pm;
			ctx.fillStyle = c.surface;
			ctx.strokeStyle = c.edge;
			ctx.lineWidth = 2;
			ctx.fillRect(14, top, sw, bottom - top);
			ctx.strokeRect(14, top, sw, bottom - top);
			ctx.font = font(10, 800);
			ctx.textAlign = "right";
			for (let f = 0; f <= TOP; f++) {
				ctx.fillStyle = c.line;
				ctx.fillRect(14, SY(f * FLOOR), sw, 1);
				ctx.fillStyle = c.muted;
				ctx.fillText(f === 0 ? "L" : String(f), 14 + sw - 4, SY(f * FLOOR) - 3);
			}
			const carW = sw * 0.5;
			const carX = 14 + sw * 0.15;
			ctx.strokeStyle = c.muted;
			ctx.lineWidth = 1.5;
			ctx.beginPath();
			ctx.moveTo(carX + carW / 2, top);
			ctx.lineTo(carX + carW / 2, cableCut ? top + 20 : SY(y + FLOOR * 0.9));
			ctx.stroke();
			ctx.fillStyle = c.accent;
			ctx.strokeStyle = c.edge;
			ctx.lineWidth = 2;
			ctx.fillRect(carX, SY(y + FLOOR * 0.9), carW, FLOOR * 0.9 * pm);
			ctx.strokeRect(carX, SY(y + FLOOR * 0.9), carW, FLOOR * 0.9 * pm);
			// Inside the elevator: you, on a scale.
			const bx = 14 + sw + 20;
			const bw = w - bx - 14;
			const bh = (bottom - top) * 0.6;
			ctx.fillStyle = c.surface;
			ctx.strokeStyle = c.edge;
			ctx.lineWidth = 2;
			rrect(ctx, bx, top, bw, bh, 14);
			ctx.fill();
			ctx.stroke();
			const r = reading();
			const ratio = r / mass.get();
			const floorY = top + bh - 16;
			const cx = bx + bw * 0.32;
			ctx.fillStyle = "#e9edf2";
			ctx.strokeStyle = c.edge;
			rrect(ctx, cx - 34, floorY - 10, 68, 12, 4);
			ctx.fill();
			ctx.stroke();
			const float = ratio < 0.05 ? 16 : 0;
			const squash = clamp(1.08 - ratio * 0.08, 0.86, 1.06);
			const body = (bh - 54) * 0.75 * squash;
			const feet = floorY - 10 - float;
			ctx.strokeStyle = c.ink;
			ctx.lineWidth = 4;
			ctx.lineCap = "round";
			ctx.beginPath();
			ctx.moveTo(cx - 10, feet);
			ctx.lineTo(cx, feet - body * 0.42);
			ctx.lineTo(cx + 10, feet);
			ctx.moveTo(cx, feet - body * 0.42);
			ctx.lineTo(cx, feet - body * 0.82);
			const armsUp = ratio < 0.05;
			ctx.moveTo(cx - 16, feet - body * (armsUp ? 1.0 : 0.55));
			ctx.lineTo(cx, feet - body * 0.75);
			ctx.lineTo(cx + 16, feet - body * (armsUp ? 1.0 : 0.55));
			ctx.stroke();
			ctx.beginPath();
			ctx.arc(cx, feet - body * 0.82 - 10, 10, 0, Math.PI * 2);
			ctx.stroke();
			ctx.lineCap = "butt";
			if (armsUp) emoji(ctx, "😱", cx, feet - body * 0.82 - 10, 18);
			// The scale's display.
			const dx = bx + bw * 0.58;
			const dw = bw * 0.36;
			ctx.fillStyle = "#18232f";
			rrect(ctx, dx, top + 16, dw, 66, 10);
			ctx.fill();
			ctx.fillStyle = r > mass.get() + 0.5 ? "#ff8a8a" : r < mass.get() - 0.5 ? "#7de39a" : "#cfe8ff";
			ctx.textAlign = "center";
			ctx.font = font(clamp(dw * 0.2, 16, 30));
			ctx.fillText(num(r * LB) + " lb", dx + dw / 2, top + 48);
			ctx.font = font(13, 700);
			ctx.fillText(num(r, 1) + " kg", dx + dw / 2, top + 70);
			// Scale reading over the last 10 seconds.
			const gy = top + bh + 14;
			const gh = bottom - gy;
			ctx.fillStyle = c.surface;
			ctx.strokeStyle = c.edge;
			rrect(ctx, bx, gy, bw, gh, 12);
			ctx.fill();
			ctx.stroke();
			const maxR = mass.get() * 3.2;
			const GX = (tt) => bx + 8 + ((tt - (clock - 10)) / 10) * (bw - 16);
			const GY = (rv) => gy + gh - 8 - (rv / maxR) * (gh - 22);
			ctx.strokeStyle = c.line;
			ctx.setLineDash([4, 4]);
			ctx.lineWidth = 1;
			ctx.beginPath();
			ctx.moveTo(bx + 8, GY(mass.get()));
			ctx.lineTo(bx + bw - 8, GY(mass.get()));
			ctx.stroke();
			ctx.setLineDash([]);
			ctx.fillStyle = c.muted;
			ctx.font = font(10, 700);
			ctx.textAlign = "left";
			ctx.fillText(bw > 340 ? "scale reading, last 10 s (dashed = your normal weight)" : "scale, last 10 s (dashed = normal)", bx + 10, gy + 13);
			if (history.length > 1) {
				ctx.strokeStyle = c.accent;
				ctx.lineWidth = 2.5;
				ctx.beginPath();
				history.forEach(([tt, rv], i) => (i ? ctx.lineTo(GX(tt), GY(rv)) : ctx.moveTo(GX(tt), GY(rv))));
				ctx.stroke();
			}
		};
		buttons();
		paint();
	};

	// ------------------------------------------------------------ 6. egg drop

	labs.eggdrop = function (el, api) {
		const MASS = 0.06;
		const BREAK = 30;
		// How far each surface lets the egg sink while stopping it.
		const SURF = {
			concrete: { name: "concrete", give: 0.0005, color: "#9aa1aa" },
			carpet: { name: "carpet", give: 0.012, color: "#b5525a" },
			grass: { name: "grass", give: 0.03, color: "#5aa64a" },
			pillow: { name: "a pillow", give: 0.1, color: "#f2f0ea" },
			hands: { name: "soft hands", give: 0.25, color: "#f0bf96" },
		};
		el.innerHTML =
			'<div class="controls">' + rangeHTML("height", "Drop height", 0.5, 5, 0.1, 1.5) +
			segHTML("surf", "Lands on", [["concrete", "🧱 Concrete"], ["carpet", "🧶 Carpet"], ["grass", "🌱 Grass"], ["pillow", "🛏️ Pillow"], ["hands", "🙌 Catch it"]], "concrete") +
			"</div>" +
			'<div class="lab-buttons"><button class="btn primary" type="button" data-go>🥚 Drop it!</button></div>';
		const view = stage(el, 0.55, 260, 380);
		el.insertAdjacentHTML(
			"beforeend",
			'<div class="readouts">' + tileHTML("v", "Speed at impact") + tileHTML("p", "Momentum to remove") + tileHTML("dt", "Stopping time") + tileHTML("f", "Average force") + "</div>" +
			'<div class="meter" aria-hidden="true"><div class="meter-fill"></div><div class="meter-mark"><span>30 N: crack!</span></div></div>' +
			'<div class="meter-scale" aria-hidden="true"><span>1 N</span><span>10 N</span><span>100 N</span><span>1,000 N</span><span>10,000 N</span></div>' +
			'<p class="lab-msg" aria-live="polite"></p>'
		);
		const t = tiles(el);
		const say = message(el);
		const go = el.querySelector("[data-go]");
		const meter = el.querySelector(".meter");
		const fill = el.querySelector(".meter-fill");
		el.querySelector(".meter-mark").style.left = (Math.log10(BREAK) / 4) * 100 + "%";
		let y = null; // egg height while falling, null when sitting on the shelf
		let phase = "ready"; // ready, fall, squash, done
		let squash = 0;
		let cracked = false;

		const changed = () => {
			if (phase === "fall" || phase === "squash") return;
			phase = "ready";
			y = null;
			cracked = false;
			say("");
			update();
		};
		const height = bindRange(el, "height", (v) => v.toFixed(1) + " m (" + num(v * 3.281, 1) + " ft)", changed);
		const surf = bindSeg(el, "surf", changed);

		function numbers() {
			const h = height.get();
			const s = SURF[surf.get()];
			const v = Math.sqrt(2 * G * h);
			const p = MASS * v;
			const dt = (2 * s.give) / v;
			return { v, p, dt, f: p / dt, s };
		}

		function update() {
			const n = numbers();
			t.set("v", num(n.v, 1) + " m/s");
			t.set("p", num(n.p, 3) + " kg·m/s");
			t.set("dt", n.dt < 0.01 ? num(n.dt * 1000, 2) + " ms" : num(n.dt, 3) + " s");
			t.set("f", num(n.f, n.f < 100 ? 1 : 0) + " N", n.f > BREAK ? "hot" : "ok");
			fill.style.width = clamp(Math.log10(Math.max(1, n.f)) / 4, 0.02, 1) * 100 + "%";
			meter.classList.toggle("over", n.f > BREAK);
			view.draw();
		}

		go.addEventListener("click", () => {
			if (phase === "fall" || phase === "squash") return;
			const n = numbers();
			const h0 = height.get();
			let tt = 0;
			phase = "fall";
			cracked = false;
			squash = 0;
			go.disabled = true;
			surf.disable(true);
			height.input.disabled = true;
			say("");
			animate((dt) => {
				if (phase === "fall") {
					tt += dt;
					y = Math.max(0, h0 - 0.5 * G * tt * tt);
					if (y <= 0) {
						phase = "squash";
						tt = 0;
					}
				} else {
					tt += dt;
					squash = Math.min(1, tt / 0.25);
					if (squash >= 1) {
						phase = "done";
						cracked = n.f > BREAK;
					}
				}
				view.draw();
				if (phase !== "done") return true;
				go.disabled = false;
				surf.disable(false);
				height.input.disabled = false;
				const f = num(n.f, n.f < 100 ? 1 : 0);
				if (cracked) say("🍳 Splat! " + n.s.name[0].toUpperCase() + n.s.name.slice(1) + " stopped it in " + (n.dt < 0.01 ? num(n.dt * 1000, 2) + " ms" : num(n.dt, 3) + " s") + ", for about " + f + " N. Way over 30 N.", "bad");
				else say("🥚 It survived! " + n.s.name[0].toUpperCase() + n.s.name.slice(1) + " stretched the stop to " + num(n.dt, 3) + " s, so the force was only about " + f + " N.", "good");
				api.done();
				return false;
			});
		});

		view.draw = function () {
			const { ctx, w, h } = view;
			const c = palette();
			const n = numbers();
			ctx.clearRect(0, 0, w, h);
			ctx.fillStyle = c.surface2;
			ctx.fillRect(0, 0, w, h);
			const ground = h - 44;
			const top = 24;
			const pm = (ground - top) / 5.2;
			const Y = (m) => ground - m * pm;
			// A height scale.
			ctx.fillStyle = c.muted;
			ctx.font = font(11, 700);
			ctx.textAlign = "left";
			for (let m = 0; m <= 5; m++) {
				ctx.fillRect(10, Y(m), 10, 1.5);
				ctx.fillText(m + " m", 24, Y(m) + 4);
			}
			// The shelf it rolls off.
			const cx = w * 0.55;
			const h0 = height.get();
			const EW = 15;
			const EH = 20;
			ctx.fillStyle = "#a07850";
			ctx.fillRect(cx - 80, Y(h0), 80 - EW - 2, 6);
			ctx.fillRect(cx - 80, Y(h0), 6, ground - Y(h0));
			// The surface (the pillow and your hands are over a wooden floor).
			const s = n.s;
			if (surf.get() === "pillow" || surf.get() === "hands") {
				ctx.fillStyle = "#c9955f";
				ctx.fillRect(0, ground + 16, w, h - ground - 16);
			}
			ctx.fillStyle = s.color;
			if (surf.get() === "pillow") {
				rrect(ctx, cx - 70, ground - 14, 140, 34, 16);
				ctx.fill();
				ctx.strokeStyle = "#c9c5ba";
				ctx.lineWidth = 2;
				ctx.stroke();
			} else if (surf.get() === "hands") {
				emoji(ctx, "🙌", cx, ground + 6, 48);
			} else {
				ctx.fillRect(0, ground, w, h - ground);
				if (surf.get() === "grass") {
					ctx.strokeStyle = "#3e8a36";
					ctx.lineWidth = 2;
					ctx.beginPath();
					for (let x = 4; x < w; x += 9) {
						ctx.moveTo(x, ground + 2);
						ctx.lineTo(x + 3, ground - 7);
					}
					ctx.stroke();
				} else if (surf.get() === "carpet") {
					ctx.fillStyle = "rgba(255,255,255,0.18)";
					for (let x = 0; x < w; x += 14) ctx.fillRect(x, ground + 4, 7, h - ground);
				} else {
					ctx.fillStyle = "rgba(0,0,0,0.12)";
					for (let x = 0; x < w; x += 60) ctx.fillRect(x, ground, 2, h - ground);
				}
			}
			// The egg (drawn bigger than life so you can see it).
			const ey = y === null ? h0 : y;
			const sink = surf.get() === "pillow" ? 12 : surf.get() === "hands" ? 8 : surf.get() === "grass" ? 3 : 0;
			const bottom = Y(ey) + (phase === "squash" || phase === "done" ? sink * squash : 0);
			if (phase === "done" && cracked) {
				ctx.fillStyle = "rgba(255,255,255,0.95)";
				ctx.beginPath();
				ctx.ellipse(cx, ground - 2, 34, 7, 0, 0, Math.PI * 2);
				ctx.fill();
				ctx.fillStyle = "#f6b81a";
				ctx.beginPath();
				ctx.ellipse(cx + 4, ground - 4, 10, 6, 0, 0, Math.PI * 2);
				ctx.fill();
				ctx.fillStyle = "#f6efe0";
				ctx.strokeStyle = "#b9a888";
				ctx.lineWidth = 1.5;
				for (const [dx, rot] of [[-26, -0.5], [24, 0.6]]) {
					ctx.save();
					ctx.translate(cx + dx, ground - 6);
					ctx.rotate(rot);
					ctx.beginPath();
					ctx.moveTo(-9, 0);
					ctx.lineTo(-6, -4);
					ctx.lineTo(-2, 0);
					ctx.lineTo(2, -4);
					ctx.lineTo(6, 0);
					ctx.lineTo(9, -3);
					ctx.arc(0, 0, 9, 0, Math.PI, false);
					ctx.fill();
					ctx.stroke();
					ctx.restore();
				}
			} else {
				const sq = phase === "squash" ? 1 - 0.18 * Math.sin(squash * Math.PI) : 1;
				ctx.fillStyle = "#f6efe0";
				ctx.strokeStyle = "#b9a888";
				ctx.lineWidth = 2;
				const cy = bottom - EH * sq;
				ctx.beginPath();
				ctx.ellipse(cx, cy, EW / sq, EH * sq, 0, 0, Math.PI * 2);
				ctx.fill();
				ctx.stroke();
				ctx.fillStyle = "rgba(255,255,255,0.7)";
				ctx.beginPath();
				ctx.ellipse(cx - 5, cy - 7, 3, 6, -0.3, 0, Math.PI * 2);
				ctx.fill();
			}
			ctx.fillStyle = c.muted;
			ctx.font = font(11, 700);
			ctx.textAlign = "right";
			ctx.fillText("egg not to scale", w - 10, 16);
		};
		update();
	};

	// ------------------------------------------------------------ 7. stairs vs. snacks

	labs.donut = function (el, api) {
		const SNACKS = {
			apple: ["🍎", "an apple", 95, "Apple"],
			latte: ["☕", "a latte", 190, "Latte"],
			candy: ["🍫", "a candy bar", 215, "Candy bar"],
			donut: ["🍩", "a donut", 250, "Donut"],
			pizza: ["🍕", "a slice of pizza", 285, "Pizza"],
			burger: ["🍔", "a burger", 550, "Burger"],
		};
		const PLACES = [
			["Statue of Liberty", 93, "statue"],
			["Eiffel Tower", 330, "eiffel"],
			["Empire State Building", 381, "empire"],
			["Burj Khalifa", 828, "burj"],
		];
		const STORY = 3;
		el.innerHTML =
			'<div class="controls">' + rangeHTML("lb", "Your weight", 90, 300, 5, 160) +
			segHTML("snack", "Snack", Object.keys(SNACKS).map((k) => [k, SNACKS[k][0] + " " + SNACKS[k][3]]), "donut") + "</div>";
		const view = stage(el, 0.55, 260, 400);
		el.insertAdjacentHTML(
			"beforeend",
			'<div class="readouts">' + tileHTML("food", "Food energy") + tileHTML("work", "Useful work (25%)") + tileHTML("floor", "Energy per floor") + tileHTML("floors", "Floors to climb") + "</div>" +
			'<p class="lab-msg" aria-live="polite"></p>'
		);
		const t = tiles(el);
		const say = message(el);
		let shown = 0;
		let goal = 0;
		let stop = null;
		let touched = false;

		const changed = () => {
			if (!touched) {
				touched = true;
				api.done();
			}
			update(true);
		};
		const lb = bindRange(el, "lb", (v) => v + " lb (" + num(v / LB) + " kg)", changed);
		const snack = bindSeg(el, "snack", changed);

		function numbers() {
			const kg = lb.get() / LB;
			const s = SNACKS[snack.get()];
			const food = s[2] * 4184;
			const work = food * 0.25;
			const perFloor = kg * G * STORY;
			const floors = work / perFloor;
			return { kg, s, food, work, perFloor, floors, meters: floors * STORY };
		}

		function update(animateIt) {
			const n = numbers();
			t.set("food", num(n.s[2]) + " Cal = " + num(n.food / 1000) + " kJ");
			t.set("work", num(n.work / 1000) + " kJ");
			t.set("floor", num(n.perFloor) + " J");
			t.set("floors", num(n.floors) + " floors", "hot");
			const near = PLACES.reduce((best, p) => (Math.abs(p[1] - n.meters) < Math.abs(best[1] - n.meters) ? p : best));
			const ratio = n.meters / near[1];
			const compare = ratio > 0.85 && ratio < 1.18 ? "about as tall as the " + near[0] : ratio >= 1.18 ? num(ratio, 1) + "× the height of the " + near[0] : num(ratio * 100) + "% of the way up the " + near[0];
			say("Burning off " + n.s[1] + " means climbing " + num(n.meters) + " m of stairs: " + compare + ".");
			goal = n.meters;
			if (!animateIt || (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches)) {
				shown = goal;
				view.draw();
				return;
			}
			if (stop) stop();
			stop = animate((dt) => {
				shown += (goal - shown) * Math.min(1, dt * 6);
				if (Math.abs(goal - shown) < 0.5) shown = goal;
				view.draw();
				return shown !== goal;
			});
		}

		function landmark(ctx, kind, x, base, hp, wp, color) {
			ctx.fillStyle = color;
			ctx.beginPath();
			if (kind === "eiffel") {
				ctx.moveTo(x - wp / 2, base);
				ctx.quadraticCurveTo(x - wp * 0.12, base - hp * 0.45, x - 2, base - hp);
				ctx.lineTo(x + 2, base - hp);
				ctx.quadraticCurveTo(x + wp * 0.12, base - hp * 0.45, x + wp / 2, base);
				ctx.closePath();
				ctx.fill();
			} else if (kind === "empire") {
				ctx.fillRect(x - wp / 2, base - hp * 0.62, wp, hp * 0.62);
				ctx.fillRect(x - wp * 0.36, base - hp * 0.8, wp * 0.72, hp * 0.2);
				ctx.fillRect(x - wp * 0.2, base - hp * 0.92, wp * 0.4, hp * 0.12);
				ctx.fillRect(x - 2, base - hp, 4, hp * 0.08);
			} else if (kind === "burj") {
				ctx.moveTo(x - wp / 2, base);
				ctx.lineTo(x - wp * 0.3, base - hp * 0.4);
				ctx.lineTo(x - wp * 0.14, base - hp * 0.72);
				ctx.lineTo(x - 1.5, base - hp);
				ctx.lineTo(x + 1.5, base - hp);
				ctx.lineTo(x + wp * 0.14, base - hp * 0.72);
				ctx.lineTo(x + wp * 0.3, base - hp * 0.4);
				ctx.lineTo(x + wp / 2, base);
				ctx.closePath();
				ctx.fill();
			} else {
				ctx.fillRect(x - wp / 2, base - hp * 0.5, wp, hp * 0.5);
				ctx.fillRect(x - wp * 0.18, base - hp * 0.88, wp * 0.36, hp * 0.38);
				ctx.fillRect(x + wp * 0.08, base - hp, wp * 0.1, hp * 0.14);
			}
		}

		view.draw = function () {
			const { ctx, w, h } = view;
			const c = palette();
			ctx.clearRect(0, 0, w, h);
			const sky = ctx.createLinearGradient(0, 0, 0, h);
			sky.addColorStop(0, c.skyTop);
			sky.addColorStop(1, c.skyLow);
			ctx.fillStyle = sky;
			ctx.fillRect(0, 0, w, h);
			const base = h - 30;
			ctx.fillStyle = c.grass;
			ctx.fillRect(0, base, w, h - base);
			const places = PLACES.filter((p, i) => i === 0 || p[1] <= Math.max(goal, shown) * 1.6);
			const tallest = Math.max(shown, goal, places[places.length - 1][1]);
			const pm = (base - 40) / tallest;
			const slots = places.length + 1;
			const slotW = w / slots;
			// Your stairs, first.
			const sx = slotW * 0.5;
			const bw = clamp(slotW * 0.42, 26, 70);
			const sh = shown * pm;
			ctx.fillStyle = c.accent;
			ctx.fillRect(sx - bw / 2, base - sh, bw, sh);
			ctx.strokeStyle = c.edge;
			ctx.lineWidth = 2;
			ctx.strokeRect(sx - bw / 2, base - sh, bw, sh);
			const every = STORY * pm < 3 ? 10 : 1;
			ctx.fillStyle = "rgba(255,255,255,0.35)";
			for (let f = every; f * STORY < shown; f += every) ctx.fillRect(sx - bw / 2, base - f * STORY * pm, bw, 1);
			emoji(ctx, numbers().s[0], sx, base - sh - 16, 24);
			ctx.textAlign = "center";
			ctx.fillStyle = c.ink;
			ctx.font = font(12);
			ctx.fillText("Your stairs", sx, h - 10);
			ctx.font = font(13);
			ctx.fillText(num(shown / STORY) + " floors", sx, Math.max(14, base - sh - 34));
			// The landmarks.
			const shade = dark && dark.matches ? "#7f93ad" : "#7b8a9e";
			places.forEach((p, i) => {
				const x = slotW * (i + 1.5);
				const hp = p[1] * pm;
				landmark(ctx, p[2], x, base, hp, clamp(slotW * (p[2] === "statue" ? 0.3 : 0.5), 18, 90), shade);
				ctx.fillStyle = c.ink;
				ctx.font = font(11);
				ctx.textAlign = "center";
				ctx.fillText(p[0].replace(" Building", ""), x, h - 10);
				ctx.font = font(11, 700);
				ctx.fillText(p[1] + " m", x, base - hp - 6);
			});
		};
		update(false);
	};

	// ------------------------------------------------------------ 8. power bill and the breaker

	labs.powerbill = function (el, api) {
		const THINGS = [
			["🔥", "Space heater", 1500, 8],
			["💡", "5 old-style bulbs (60 W each)", 300, 5],
			["✨", "5 LED bulbs (9 W each)", 45, 0],
			["📺", "TV", 100, 4],
			["🎮", "Gaming PC", 400, 3],
			["💻", "Laptop", 50, 6],
			["🧊", "Fridge (average)", 60, 24],
			["👕", "Clothes dryer", 3000, 0.5],
			["❄️", "Window AC", 1000, 0],
			["📱", "Phone charger", 5, 3],
		];
		const KITCHEN = [
			["🍿 Microwave", 1100],
			["🍞 Toaster", 900],
			["♨️ Kettle", 1500],
			["☕ Coffee maker", 1000],
			["🍟 Air fryer", 1700],
			["🥤 Blender", 600],
		];
		el.innerHTML =
			'<label class="ctl price">Price per kWh <span>$ <input type="number" min="0.01" max="1" step="0.01" value="0.17" aria-label="Price per kilowatt-hour in dollars"></span></label>' +
			'<div class="bill">' +
			THINGS.map((x, i) =>
				'<div class="appl" data-i="' + i + '"><span class="appl-name">' + x[0] + " " + x[1] + "<small>" + num(x[2]) + ' W</small></span>' +
				'<input type="range" min="0" max="24" step="0.5" value="' + x[3] + '" aria-label="' + x[1] + ' hours per day"><output></output><span class="appl-cost"></span><div class="appl-bar"><i></i></div></div>'
			).join("") +
			"</div>" +
			'<div class="readouts">' + tileHTML("kwh", "Energy in 30 days") + tileHTML("cost", "Monthly cost") + tileHTML("hog", "Biggest power hog") + "</div>" +
			"<h4>🔌 Will it trip the breaker?</h4><p>Your kitchen outlets share one 120 V circuit with a 15 A breaker. Switch things on.</p>" +
			'<div class="kitchen"><div class="seg" data-kitchen>' + KITCHEN.map((k) => '<button type="button" aria-pressed="false" data-w="' + k[1] + '">' + k[0] + " · " + num(k[1]) + " W</button>").join("") + "</div>" +
			'<div class="meter" aria-hidden="true"><div class="meter-fill"></div><div class="meter-mark" style="left:50%"><span>15 A breaker</span></div></div>' +
			'<div class="meter-scale" aria-hidden="true"><span>0 A</span><span>10 A</span><span>20 A</span><span>30 A</span></div>' +
			'<p class="amp-math" aria-live="polite"></p><p class="lab-msg" aria-live="polite"></p>' +
			'<div class="lab-buttons"><button class="btn small" type="button" data-reset hidden>🔁 Reset the breaker</button></div></div>';
		const t = tiles(el);
		const say = message(el);
		const price = el.querySelector(".price input");
		const rows = Array.from(el.querySelectorAll(".appl"));
		let touched = false;

		function bill() {
			const p = clamp(parseFloat(price.value) || 0, 0, 5);
			let total = 0;
			let hog = null;
			const costs = rows.map((row, i) => {
				const hours = parseFloat(row.querySelector("input").value);
				const kwh = (THINGS[i][2] / 1000) * hours * 30;
				total += kwh;
				row.querySelector("output").textContent = hours + " h/day";
				row.querySelector(".appl-cost").textContent = "$" + num(kwh * p, 2);
				if (!hog || kwh > hog.kwh) hog = { i, kwh };
				return kwh;
			});
			const max = Math.max.apply(null, costs) || 1;
			rows.forEach((row, i) => {
				row.querySelector(".appl-bar i").style.width = (costs[i] / max) * 100 + "%";
				row.classList.toggle("hog", hog && hog.i === i && costs[i] > 0);
			});
			t.set("kwh", num(total) + " kWh");
			t.set("cost", "$" + num(total * p, 2), "hot");
			t.set("hog", hog && hog.kwh > 0 ? THINGS[hog.i][0] + " " + THINGS[hog.i][1].replace(/ \(.*\)/, "") + " (" + Math.round((hog.kwh / total) * 100) + "%)" : "Nothing's on");
		}
		el.querySelector(".bill").addEventListener("input", () => {
			bill();
			if (!touched) {
				touched = true;
				api.done();
			}
		});
		price.addEventListener("input", bill);
		bill();

		const kitchen = el.querySelector(".kitchen");
		const box = el.querySelector("[data-kitchen]");
		const fill = kitchen.querySelector(".meter-fill");
		const meter = kitchen.querySelector(".meter");
		const math = kitchen.querySelector(".amp-math");
		const reset = kitchen.querySelector("[data-reset]");
		const btns = Array.from(box.querySelectorAll("button"));
		const kitchenSay = (text, mood) => {
			const p = kitchen.querySelector(".lab-msg");
			p.textContent = text;
			p.className = "lab-msg" + (mood ? " " + mood : "");
		};

		function amps() {
			const watts = btns.reduce((sum, b) => sum + (b.getAttribute("aria-pressed") === "true" ? parseFloat(b.dataset.w) : 0), 0);
			return { watts, amps: watts / 120 };
		}
		function paintAmps() {
			const a = amps();
			fill.style.width = clamp(a.amps / 30, 0, 1) * 100 + "%";
			meter.classList.toggle("over", a.amps > 15);
			math.textContent = num(a.watts) + " W ÷ 120 V = " + num(a.amps, 1) + " A";
		}
		box.addEventListener("click", (e) => {
			const b = e.target.closest("button");
			if (!b || b.disabled) return;
			b.setAttribute("aria-pressed", String(b.getAttribute("aria-pressed") !== "true"));
			paintAmps();
			const a = amps();
			if (a.amps > 15) {
				kitchenSay("💥 CLACK! " + num(a.amps, 1) + " A is over 15 A, so the breaker tripped and the kitchen went dark.", "bad");
				btns.forEach((x) => {
					x.setAttribute("aria-pressed", "false");
					x.disabled = true;
				});
				kitchen.classList.add("dark");
				reset.hidden = false;
				setTimeout(paintAmps, 600);
				api.done();
			} else if (a.amps > 12) {
				kitchenSay("Close to the limit. Wires warm up as current flows, and the breaker is there to stop them overheating.");
			} else {
				kitchenSay("");
			}
		});
		reset.addEventListener("click", () => {
			btns.forEach((x) => (x.disabled = false));
			kitchen.classList.remove("dark");
			reset.hidden = true;
			kitchenSay("Breaker reset. Try a combination that stays under 15 A (1,800 W).");
			paintAmps();
		});
		paintAmps();
	};

	// ------------------------------------------------------------ 9a. thunder

	labs.thunder = function (el, api) {
		const SOUND = 343;
		el.innerHTML =
			'<div class="lab-buttons"><button class="btn primary" type="button" data-start>⚡ Start a storm</button>' +
			'<button class="btn sun catch" type="button" data-heard disabled>🔊 I heard it!</button>' +
			'<label class="check"><input type="checkbox" data-rumble> No sound? Show me the rumble</label></div>';
		const view = stage(el, 0.42, 200, 320);
		el.insertAdjacentHTML("beforeend", '<p class="lab-msg" aria-live="polite">Sound on, then start the storm.</p><ol class="tries"></ol>');
		const say = message(el);
		const startBtn = el.querySelector("[data-start]");
		const heardBtn = el.querySelector("[data-heard]");
		const rumble = el.querySelector("[data-rumble]");
		const list = el.querySelector(".tries");
		let phase = "idle"; // idle, wait, count, done
		let flashAt = 0;
		let thunderAt = 0;
		let dist = 0;
		let bolt = [];
		let boltX = 0.5;
		let now = performance.now();
		let stop = null;
		let rain = [];
		const results = [];

		function makeBolt() {
			boltX = 0.15 + Math.random() * 0.7;
			const pts = [[boltX, 0.12]];
			let x = boltX;
			const far = dist / 4000;
			const bottom = 0.62 + 0.08 * (1 - far);
			for (let y = 0.12; y < bottom; ) {
				y = Math.min(bottom, y + 0.05 + Math.random() * 0.06);
				x += (Math.random() - 0.5) * 0.06;
				pts.push([x, y]);
			}
			bolt = pts;
		}

		function thunderSound(ctx, when, d) {
			const dur = 3.2;
			const len = Math.floor(ctx.sampleRate * dur);
			const buf = ctx.createBuffer(1, len, ctx.sampleRate);
			const data = buf.getChannelData(0);
			let last = 0;
			for (let i = 0; i < len; i++) {
				last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
				data[i] = last * 3.5;
			}
			const src = ctx.createBufferSource();
			src.buffer = buf;
			const lp = ctx.createBiquadFilter();
			lp.type = "lowpass";
			lp.frequency.value = d < 1500 ? 1000 : d < 2800 ? 600 : 380;
			const gain = ctx.createGain();
			const peak = clamp(1.4 - d / 3500, 0.35, 1.2);
			gain.gain.setValueAtTime(0.0001, when);
			gain.gain.exponentialRampToValueAtTime(peak, when + (d < 1500 ? 0.03 : 0.25));
			let tt = when + 0.35;
			while (tt < when + dur - 0.6) {
				gain.gain.exponentialRampToValueAtTime(peak * (0.25 + Math.random() * 0.75), tt);
				tt += 0.2 + Math.random() * 0.35;
			}
			gain.gain.exponentialRampToValueAtTime(0.0001, when + dur);
			src.connect(lp);
			lp.connect(gain);
			gain.connect(ctx.destination);
			src.start(when);
			src.stop(when + dur);
		}

		function startStorm() {
			if (phase === "wait" || phase === "count") return;
			if (!rumble.checked) getAudio();
			phase = "wait";
			dist = 600 + Math.random() * 3200;
			makeBolt();
			flashAt = performance.now() + 1000 + Math.random() * 2000;
			thunderAt = flashAt + (dist / SOUND) * 1000;
			let scheduled = false;
			startBtn.disabled = true;
			heardBtn.disabled = false;
			say("Watch the sky…");
			rain = Array.from({ length: 70 }, () => [Math.random(), Math.random()]);
			if (stop) stop();
			stop = animate((dt, t) => {
				now = t;
				if (phase === "wait" && now >= flashAt) {
					phase = "count";
					say("⚡ Flash! Count… press I heard it! when the thunder arrives.");
				}
				if (!scheduled && phase !== "idle" && now >= flashAt - 50 && !rumble.checked) {
					scheduled = true;
					const ctx = getAudio();
					if (ctx) thunderSound(ctx, ctx.currentTime + Math.max(0, (thunderAt - performance.now()) / 1000), dist);
				}
				if (phase === "count" && now > thunderAt + 6000) {
					finish(null);
				}
				rain.forEach((r) => {
					r[1] += dt * 1.6;
					if (r[1] > 1) {
						r[1] -= 1;
						r[0] = Math.random();
					}
				});
				view.draw();
				return phase === "wait" || phase === "count" || now < thunderAt + 3000;
			});
		}

		function heard() {
			if (phase === "wait") {
				say("Wait for the flash first! Light gets here before sound does.", "bad");
				return;
			}
			if (phase !== "count") return;
			const t = (performance.now() - flashAt) / 1000;
			if (t < (thunderAt - flashAt) / 1000 - 0.6) {
				say("Not yet! That's only " + num(t, 1) + " s. Keep listening…", "bad");
				return;
			}
			finish(t);
		}

		function finish(t) {
			phase = "done";
			startBtn.disabled = false;
			startBtn.textContent = "⚡ Next flash";
			heardBtn.disabled = true;
			const realKm = dist / 1000;
			if (t === null) {
				say("Missed it? The thunder took " + num((thunderAt - flashAt) / 1000, 1) + " s, so the strike was " + num(realKm, 1) + " km (" + num(dist / 1609, 1) + " mi) away.", "bad");
				return;
			}
			const est = SOUND * t;
			const off = Math.abs(est - dist) / dist;
			results.unshift({ t, est, dist });
			if (results.length > 4) results.pop();
			say(
				"You counted " + num(t, 1) + " s → 343 × " + num(t, 1) + " = " + num(est / 1000, 2) + " km (" + num(est / 1609, 1) + " mi). " +
				"Real distance: " + num(realKm, 2) + " km. " + (off < 0.1 ? "Spot on! 🎯" : "Not bad!"),
				off < 0.1 ? "good" : ""
			);
			list.replaceChildren();
			results.forEach((r) => {
				const li = document.createElement("li");
				li.innerHTML = "<span></span><span></span>";
				li.firstChild.textContent = num(r.t, 1) + " s → you said " + num(r.est / 1000, 2) + " km";
				li.lastChild.textContent = "actual " + num(r.dist / 1000, 2) + " km · rule of thumb " + num(r.t / 3, 1) + " km / " + num(r.t / 5, 1) + " mi";
				list.append(li);
			});
			api.done();
		}

		startBtn.addEventListener("click", startStorm);
		heardBtn.addEventListener("pointerdown", (e) => {
			e.preventDefault();
			heard();
		});
		heardBtn.addEventListener("click", (e) => {
			if (e.detail === 0) heard();
		});
		document.addEventListener("keydown", (e) => {
			if (e.code !== "Space" || e.repeat || typing(e.target) || !api.visible()) return;
			if (phase === "wait" || phase === "count") {
				e.preventDefault();
				heard();
			}
		});

		view.draw = function () {
			const { ctx, w, h } = view;
			ctx.save();
			const shaking = rumble.checked && phase !== "idle" && now >= thunderAt && now < thunderAt + 2500;
			if (shaking) ctx.translate((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 6);
			const sky = ctx.createLinearGradient(0, 0, 0, h);
			sky.addColorStop(0, "#1a2133");
			sky.addColorStop(1, "#3a4660");
			ctx.fillStyle = sky;
			ctx.fillRect(-10, -10, w + 20, h + 20);
			const since = now - flashAt;
			const lit = phase !== "idle" && since >= 0 && since < 450;
			if (lit) {
				const far = dist / 4000;
				ctx.fillStyle = "rgba(220,230,255," + (0.55 * (1 - since / 450) * (1 - far * 0.5)) + ")";
				ctx.fillRect(-10, -10, w + 20, h + 20);
				ctx.strokeStyle = "rgba(255,255,240," + (1 - since / 450) + ")";
				ctx.lineWidth = 4 - far * 2.5;
				ctx.lineJoin = "round";
				ctx.beginPath();
				bolt.forEach(([x, y], i) => (i ? ctx.lineTo(x * w, y * h) : ctx.moveTo(x * w, y * h)));
				ctx.stroke();
			}
			// Clouds.
			ctx.fillStyle = "#2a3247";
			for (let i = 0; i < 7; i++) {
				ctx.beginPath();
				ctx.ellipse((i / 6) * w, h * 0.08, w * 0.12, h * 0.12, 0, 0, Math.PI * 2);
				ctx.fill();
			}
			// Hills and a house with its light on.
			ctx.fillStyle = "#18241c";
			ctx.beginPath();
			ctx.moveTo(0, h);
			ctx.lineTo(0, h * 0.72);
			ctx.quadraticCurveTo(w * 0.25, h * 0.6, w * 0.5, h * 0.72);
			ctx.quadraticCurveTo(w * 0.75, h * 0.82, w, h * 0.68);
			ctx.lineTo(w, h);
			ctx.fill();
			const hx = w * 0.12;
			const hy = h * 0.8;
			ctx.fillStyle = "#2b2b33";
			ctx.fillRect(hx, hy, 46, 32);
			ctx.beginPath();
			ctx.moveTo(hx - 6, hy);
			ctx.lineTo(hx + 23, hy - 20);
			ctx.lineTo(hx + 52, hy);
			ctx.fill();
			ctx.fillStyle = "#ffd76a";
			ctx.fillRect(hx + 8, hy + 9, 12, 10);
			// Rain.
			if (phase !== "idle") {
				ctx.strokeStyle = "rgba(170,190,230,0.45)";
				ctx.lineWidth = 1;
				ctx.beginPath();
				rain.forEach(([x, y]) => {
					ctx.moveTo(x * w, y * h);
					ctx.lineTo(x * w - 3, y * h + 10);
				});
				ctx.stroke();
			}
			// The timer.
			ctx.textAlign = "right";
			ctx.fillStyle = "#e8eef8";
			if (phase === "count" || phase === "done") {
				const t = phase === "count" ? since / 1000 : null;
				ctx.font = font(26);
				if (t !== null) ctx.fillText("⏱ " + num(t, 1) + " s", w - 14, h - 16);
			} else if (phase === "idle") {
				ctx.font = font(15);
				ctx.textAlign = "center";
				ctx.fillText("Press Start a storm", w / 2, h * 0.45);
			}
			if (shaking) {
				ctx.font = font(34);
				ctx.textAlign = "center";
				ctx.fillStyle = "rgba(255,255,255," + (1 - (now - thunderAt) / 2500) + ")";
				ctx.fillText("RUMBLE", w / 2, h * 0.45);
			}
			ctx.restore();
		};
		view.draw();
	};

	// ------------------------------------------------------------ 9b. Doppler

	labs.doppler = function (el, api) {
		const C = 343;
		const F = 700;
		const WORLD = 240;
		const NEAR = 14; // how far you stand from the road, in meters
		el.innerHTML =
			'<div class="controls">' + rangeHTML("v", "Ambulance speed", 10, 120, 1, 40) + "</div>" +
			'<div class="lab-buttons"><button class="btn primary" type="button" data-go>🚑 Drive by</button>' +
			'<label class="check"><input type="checkbox" data-sound checked> Sound on</label></div>';
		const view = stage(el, 0.4, 190, 300);
		el.insertAdjacentHTML(
			"beforeend",
			'<div class="readouts">' + tileHTML("real", "Siren's real pitch") + tileHTML("toward", "Heard coming toward you") + tileHTML("away", "Heard going away") + tileHTML("now", "You hear right now") + "</div>"
		);
		const t = tiles(el);
		const go = el.querySelector("[data-go]");
		const sound = el.querySelector("[data-sound]");
		let x = -20;
		let running = false;
		let waves = [];
		let clock = 0;
		let heard = F;
		const speed = bindRange(el, "v", (v) => v + " m/s (" + num(v / MPH) + " mph)", () => update());

		function update() {
			const v = speed.get();
			t.set("real", F + " Hz");
			t.set("toward", num((F * C) / (C - v)) + " Hz ▲", "hot");
			t.set("away", num((F * C) / (C + v)) + " Hz ▼", "ok");
			if (!running) {
				t.set("now", "–");
				view.draw();
			}
		}

		go.addEventListener("click", () => {
			if (running) return;
			running = true;
			go.disabled = true;
			x = -20;
			waves = [];
			clock = 0;
			let nextWave = 0;
			let osc = null;
			let gain = null;
			let ctx = null;
			if (sound.checked) {
				ctx = getAudio();
				if (ctx) {
					osc = ctx.createOscillator();
					osc.type = "triangle";
					gain = ctx.createGain();
					gain.gain.value = 0.0001;
					osc.connect(gain);
					gain.connect(ctx.destination);
					osc.start();
				}
			}
			let lastText = 0;
			const v = speed.get();
			animate((dt) => {
				clock += dt;
				x += v * dt;
				while (clock >= nextWave) {
					waves.push([x - v * (clock - nextWave), nextWave]);
					nextWave += 0.06;
				}
				waves = waves.filter((wv) => C * (clock - wv[1]) < WORLD * 1.2);
				const lx = WORLD / 2;
				const dx = lx - x;
				const d = Math.hypot(dx, NEAR);
				const toward = (v * dx) / d;
				heard = (F * C) / (C - toward);
				if (osc) {
					const at = ctx.currentTime;
					osc.frequency.setTargetAtTime(heard, at, 0.01);
					gain.gain.setTargetAtTime(clamp(0.22 * (25 / d), 0.01, 0.22), at, 0.03);
				}
				if (clock - lastText > 0.1) {
					lastText = clock;
					t.set("now", num(heard) + " Hz " + (heard > F + 1 ? "▲" : heard < F - 1 ? "▼" : ""), heard > F + 1 ? "hot" : heard < F - 1 ? "ok" : "");
				}
				view.draw();
				if (x < WORLD + 20) return true;
				if (osc) {
					gain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.05);
					osc.stop(ctx.currentTime + 0.3);
				}
				running = false;
				go.disabled = false;
				api.done();
				return false;
			});
		});

		view.draw = function () {
			const { ctx, w, h } = view;
			const c = palette();
			ctx.clearRect(0, 0, w, h);
			ctx.fillStyle = c.surface2;
			ctx.fillRect(0, 0, w, h);
			const s = w / WORLD;
			const roadY = h * 0.4;
			const youY = Math.min(h - 26, roadY + NEAR * s + 26);
			ctx.fillStyle = c.road;
			ctx.fillRect(0, roadY - 18, w, 36);
			ctx.strokeStyle = "rgba(255,255,255,0.7)";
			ctx.setLineDash([16, 14]);
			ctx.lineWidth = 2;
			ctx.beginPath();
			ctx.moveTo(0, roadY);
			ctx.lineTo(w, roadY);
			ctx.stroke();
			ctx.setLineDash([]);
			// Sound waves: each circle started where the ambulance was when it left.
			ctx.lineWidth = 1.5;
			for (const [wx, born] of waves) {
				const r = C * (clock - born) * s;
				const alpha = clamp(1 - r / (w * 0.9), 0, 0.7);
				if (alpha <= 0) continue;
				ctx.strokeStyle = "rgba(47,125,225," + alpha + ")";
				ctx.beginPath();
				ctx.arc(wx * s, roadY, r, 0, Math.PI * 2);
				ctx.stroke();
			}
			// The ambulance, drawn bigger than life.
			if (running) {
				const ax = x * s;
				const L = clamp(w * 0.09, 40, 70);
				const H = L * 0.42;
				ctx.fillStyle = "#ffffff";
				ctx.strokeStyle = "#1b2233";
				ctx.lineWidth = 2;
				rrect(ctx, ax - L / 2, roadY - H, L * 0.7, H, 4);
				ctx.fill();
				ctx.stroke();
				rrect(ctx, ax - L / 2 + L * 0.68, roadY - H * 0.7, L * 0.32, H * 0.7, 4);
				ctx.fill();
				ctx.stroke();
				ctx.fillStyle = "#e5484d";
				ctx.fillRect(ax - L / 2, roadY - H * 0.45, L * 0.7, H * 0.14);
				ctx.fillRect(ax - L / 2 + L * 0.3, roadY - H * 0.85, 4, H * 0.32);
				ctx.fillRect(ax - L / 2 + L * 0.3 - H * 0.14, roadY - H * 0.71, H * 0.32, 4);
				ctx.fillStyle = Math.floor(clock * 6) % 2 ? "#3b82f6" : "#ef4444";
				ctx.fillRect(ax - L / 2 + L * 0.1, roadY - H - 5, L * 0.18, 5);
				ctx.fillStyle = "#1b2233";
				for (const f of [0.18, 0.78]) {
					ctx.beginPath();
					ctx.arc(ax - L / 2 + L * f, roadY, H * 0.2, 0, Math.PI * 2);
					ctx.fill();
				}
			}
			// You.
			const yx = (WORLD / 2) * s;
			ctx.strokeStyle = c.ink;
			ctx.lineWidth = 3;
			ctx.lineCap = "round";
			ctx.beginPath();
			ctx.arc(yx, youY - 16, 6, 0, Math.PI * 2);
			ctx.moveTo(yx, youY - 10);
			ctx.lineTo(yx, youY + 4);
			ctx.moveTo(yx - 7, youY + 14);
			ctx.lineTo(yx, youY + 4);
			ctx.lineTo(yx + 7, youY + 14);
			ctx.stroke();
			ctx.lineCap = "butt";
			ctx.fillStyle = c.ink;
			ctx.font = font(12);
			ctx.textAlign = "left";
			ctx.fillText("you", yx + 12, youY - 8);
			if (running) {
				ctx.textAlign = "center";
				ctx.font = font(15);
				ctx.fillStyle = heard > F ? c.bad : c.good;
				ctx.fillText(num(heard) + " Hz", yx, youY - 30 > roadY + 20 ? youY - 30 : roadY + 34);
			}
		};
		update();
	};
})();
