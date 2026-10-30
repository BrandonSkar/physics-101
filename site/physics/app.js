// Physics 101 at brandonskar.com/physics: the course map, the lessons (one at a
// time, at addresses like #/speed), their problems, XP and the final exam.
// Progress stays in this browser (localStorage, when it's allowed). The labs
// are in labs.js, and each one starts the first time its lesson opens.
(function () {
	"use strict";

	const KEY = "physics101";
	const XP_FIRST_TRY = 10;
	const XP_LATER = 5;
	const XP_LAB = 5;
	const XP_EXAM = 20;
	const RANKS = [
		[0, "Curious Human"],
		[40, "Lab Intern"],
		[120, "Apple Dodger"],
		[220, "Junior Galileo"],
		[340, "Newton's Apprentice"],
		[460, "Certified Physics Person"],
		[570, "Basically Einstein"],
	];
	const YAY = ["Nailed it!", "Correct!", "Newton would be proud.", "That's the one.", "Physics: understood.", "Exactly right."];
	const NOPE = ["Not quite. Try again!", "Not yet. Give it another go.", "Hmm, not that one. Check your steps."];

	const $ = (sel, root) => (root || document).querySelector(sel);
	const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
	const pickOne = (list) => list[Math.floor(Math.random() * list.length)];

	let state = load();

	function load() {
		try {
			const saved = JSON.parse(localStorage.getItem(KEY));
			if (saved && typeof saved === "object") {
				return { p: saved.p || {}, labs: saved.labs || {}, name: typeof saved.name === "string" ? saved.name : "" };
			}
		} catch (e) {}
		return { p: {}, labs: {}, name: "" };
	}

	function save() {
		try {
			localStorage.setItem(KEY, JSON.stringify(state));
		} catch (e) {}
	}

	const home = $("#home");
	const lessons = $$(".lesson");
	const exam = $("#exam");
	const views = $$(".view");
	const labCount = $$(".lab").length;
	let problemCount = 0;

	function totalXp() {
		let xp = 0;
		for (const id in state.p) xp += state.p[id].xp || 0;
		for (const id in state.labs) if (state.labs[id]) xp += XP_LAB;
		return xp;
	}

	function rankFor(xp) {
		let name = RANKS[0][1];
		for (const [min, title] of RANKS) if (xp >= min) name = title;
		return name;
	}

	function stats(view) {
		const ids = $$(".problem", view).map((p) => p.dataset.id);
		let done = 0;
		let right = 0;
		let xp = 0;
		for (const id of ids) {
			const rec = state.p[id];
			if (!rec) continue;
			done++;
			xp += rec.xp || 0;
			if (rec.s === "right") right++;
		}
		const max = ids.length * (view === exam ? XP_EXAM : XP_FIRST_TRY);
		const complete = ids.length > 0 && done === ids.length;
		const stars = complete ? (xp >= max * 0.9 ? 3 : xp >= max * 0.6 ? 2 : 1) : 0;
		return { total: ids.length, done, right, xp, complete, stars };
	}

	// ------------------------------------------------------------ problems

	// Reads "1,200", "$61.20", "0.55 s" or "0,55" as numbers.
	function parseNumber(text) {
		let s = String(text).trim().replace(/[−–]/g, "-");
		if (/^-?\d*,\d+$/.test(s) && !/,\d{3}$/.test(s)) s = s.replace(",", ".");
		s = s.replace(/[\s,$]/g, "");
		const m = /-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?/i.exec(s);
		return m ? parseFloat(m[0]) : NaN;
	}

	// A friendlier "wrong" when the digits are right but the units aren't.
	function unitSlip(value, answer, tol) {
		if (Math.abs(value + answer) <= tol) return "Right size, wrong sign. Check your plus and minus.";
		const near = (f) => Math.abs(value - answer * f) <= tol * f || Math.abs(value - answer / f) <= tol / f;
		if (near(60) || near(3600)) return "So close! That looks like a units mix-up: seconds, minutes or hours?";
		if (near(1000) || near(100) || near(10)) return "The digits look right, but the decimal point is off. Check your units.";
		if (near(3.6) || near(2.237)) return "Close! Check whether you're working in m/s, km/h or mph.";
		if (near(9.8)) return "Off by a factor of g (9.8). Mass and weight mix-up?";
		if (near(2)) return "Off by a factor of 2. Check for a ½, a square root or a there-and-back trip.";
		return "";
	}

	function setupProblem(el, index, view) {
		const id = el.dataset.id;
		const oneShot = view === exam;
		const isChoice = el.dataset.type === "choice";
		const hint = $(".hint", el);
		const solution = $(".solution", el);
		const anchor = hint || solution;
		problemCount++;

		const tag = document.createElement("div");
		tag.className = "p-tag";
		tag.innerHTML = "<span></span><span class=\"p-status\"></span>";
		tag.firstChild.textContent = (oneShot ? "Question " : "Problem ") + (index + 1);
		const status = tag.lastChild;
		el.prepend(tag);

		const feedback = document.createElement("p");
		feedback.className = "feedback";
		feedback.setAttribute("aria-live", "polite");

		let wrong = 0;
		let hinted = false;
		let input = null;
		let checkBtn = null;
		const choices = [];

		if (isChoice) {
			$$(".choices li", el).forEach((li) => {
				const b = document.createElement("button");
				b.type = "button";
				b.className = "choice";
				b.innerHTML = li.innerHTML;
				b.dataset.correct = li.hasAttribute("data-correct") ? "1" : "";
				li.removeAttribute("data-correct");
				li.replaceChildren(b);
				b.addEventListener("click", () => pick(b));
				choices.push(b);
			});
		} else {
			const form = document.createElement("form");
			form.className = "answer";
			form.innerHTML =
				'<input type="text" inputmode="decimal" autocomplete="off" spellcheck="false" placeholder="Your answer">' +
				'<span class="unit"></span><button class="btn primary small" type="submit">Check</button>';
			input = $("input", form);
			input.setAttribute("aria-label", "Answer to " + tag.firstChild.textContent.toLowerCase() + (el.dataset.unit ? ", in " + el.dataset.unit : ""));
			checkBtn = $("button", form);
			$(".unit", form).textContent = el.dataset.unit || "";
			form.addEventListener("submit", (e) => {
				e.preventDefault();
				check();
			});
			el.insertBefore(form, anchor);
		}
		el.insertBefore(feedback, anchor);

		let hintBtn = null;
		let solveBtn = null;
		if (!oneShot) {
			const tools = document.createElement("div");
			tools.className = "p-tools";
			if (hint) {
				hintBtn = linkButton("💡 Hint", () => {
					hinted = true;
					el.classList.add("show-hint");
					hintBtn.hidden = true;
				});
				tools.append(hintBtn);
			}
			if (solution) {
				solveBtn = linkButton("Show the solution (no XP)", () => {
					if (!state.p[id]) resolve("revealed", 0, null);
				});
				tools.append(solveBtn);
			}
			el.insertBefore(tools, anchor);
		}

		function say(mood, text) {
			feedback.className = "feedback" + (mood ? " " + mood : "");
			feedback.textContent = text;
		}

		function earned() {
			if (oneShot) return XP_EXAM;
			return wrong || hinted ? XP_LATER : XP_FIRST_TRY;
		}

		function check() {
			if (state.p[id]) return;
			const value = parseNumber(input.value);
			if (!isFinite(value)) {
				say("bad", "Type a number. The units are already filled in for you.");
				input.focus();
				return;
			}
			const answer = parseFloat(el.dataset.answer);
			const tol = el.dataset.abs ? parseFloat(el.dataset.abs) : Math.abs(answer) * (el.dataset.tol ? parseFloat(el.dataset.tol) : 0.03);
			if (Math.abs(value - answer) <= tol) {
				resolve("right", earned(), checkBtn);
			} else if (oneShot) {
				resolve("wrong", 0, checkBtn);
			} else {
				wrong++;
				let text = unitSlip(value, answer, tol) || pickOne(NOPE);
				if (wrong >= 2 && hintBtn && !hinted) text += " The hint might help.";
				say("bad", text);
				input.select();
			}
		}

		function pick(b) {
			if (state.p[id]) return;
			if (b.dataset.correct) {
				resolve("right", earned(), b);
			} else if (oneShot) {
				resolve("wrong", 0, b);
			} else {
				wrong++;
				b.classList.add("wrong");
				b.disabled = true;
				say("bad", pickOne(NOPE));
			}
		}

		function resolve(kind, xp, from) {
			const rankBefore = rankFor(totalXp());
			const doneBefore = stats(view).complete;
			state.p[id] = { s: kind, xp: xp, a: isChoice ? choices.indexOf(from) : input.value.trim() };
			save();
			paint(true);
			refresh();
			if (kind === "right") {
				celebrate(from || el);
				toast("+" + xp + " XP");
			}
			const after = stats(view);
			if (!doneBefore && after.complete) {
				setTimeout(() => {
					if (view === exam) toast("🎓 Exam done! " + after.right + " of " + after.total + " right. Your diploma is ready.");
					else toast("🎉 Lesson complete! " + "★".repeat(after.stars) + "☆".repeat(3 - after.stars));
				}, 700);
			}
			const rankAfter = rankFor(totalXp());
			if (rankAfter !== rankBefore) setTimeout(() => toast("⭐ New rank: " + rankAfter), 1400);
		}

		function paint(fresh) {
			const rec = state.p[id];
			el.classList.toggle("is-right", !!rec && rec.s === "right");
			el.classList.toggle("is-wrong", !!rec && rec.s === "wrong");
			el.classList.toggle("is-revealed", !!rec && rec.s === "revealed");
			el.classList.toggle("show-solution", !!rec);
			if (!rec) return;
			status.textContent = rec.s === "right" ? "✓ +" + rec.xp + " XP" : rec.s === "wrong" ? "✗ 0 XP" : "Solution shown";
			if (input) {
				input.disabled = true;
				checkBtn.disabled = true;
				if (!input.value && rec.a) input.value = rec.a;
				if (!input.value) input.placeholder = "";
			}
			choices.forEach((b, i) => {
				b.disabled = true;
				if (b.dataset.correct) b.classList.add("right");
				else if (i === rec.a) b.classList.add("wrong");
			});
			if (hintBtn) hintBtn.hidden = true;
			if (solveBtn) solveBtn.hidden = true;
			if (rec.s === "right") say("good", fresh ? pickOne(YAY) : "Solved.");
			else if (rec.s === "wrong") say("bad", "Not this time. Here's how it works:");
			else say("", "Here's how it works:");
		}

		paint(false);
	}

	function linkButton(label, onClick) {
		const b = document.createElement("button");
		b.type = "button";
		b.className = "link-btn";
		b.textContent = label;
		b.addEventListener("click", onClick);
		return b;
	}

	// ------------------------------------------------------------ lessons and the map

	const ordered = lessons.concat(exam);
	ordered.forEach((view, i) => {
		const top = document.createElement("div");
		top.className = "lesson-top";
		top.innerHTML = '<a class="back" href="#/">← Course map</a><span></span>';
		top.lastChild.textContent = (view === exam ? "Final exam" : "Lesson " + (i + 1) + " of " + lessons.length) + " · about " + view.dataset.mins + " min";
		view.prepend(top);
		$$(".problem", view).forEach((el, j) => setupProblem(el, j, view));

		const nav = document.createElement("nav");
		nav.className = "lesson-nav";
		nav.setAttribute("aria-label", "Lessons");
		const prev = ordered[i - 1];
		const next = ordered[i + 1];
		nav.append(navLink(prev || home, prev ? "← " + prev.dataset.title : "← Course map", ""));
		nav.append(next ? navLink(next, (next === exam ? "On to the final exam" : "Next: " + next.dataset.title) + " →", "primary") : navLink(home, "Back to the course map", "primary"));
		view.append(nav);
	});

	function navLink(view, label, kind) {
		const a = document.createElement("a");
		a.className = "btn " + kind;
		a.href = view === home ? "#/" : "#/" + view.id;
		a.textContent = label;
		return a;
	}

	const map = $("#map");
	function renderMap() {
		map.replaceChildren();
		ordered.forEach((view, i) => {
			const s = stats(view);
			const li = document.createElement("li");
			const a = document.createElement("a");
			a.href = "#/" + view.id;
			a.className = "map-card" + (view === exam ? " exam-card" : "") + (s.complete ? " done" : s.done ? " started" : "");
			a.innerHTML =
				'<span class="map-head"><span class="map-icon" aria-hidden="true"></span><span class="map-num"></span></span>' +
				'<span class="map-title"></span><span class="map-blurb"></span><span class="map-status"></span>';
			$(".map-icon", a).textContent = view.dataset.icon;
			$(".map-num", a).textContent = (view === exam ? "Final" : "Lesson " + (i + 1)) + " · " + view.dataset.mins + " min";
			$(".map-title", a).textContent = view.dataset.title;
			$(".map-blurb", a).textContent = view.dataset.blurb;
			const st = $(".map-status", a);
			if (s.complete && view === exam) {
				st.textContent = "🎓 " + s.right + " / " + s.total + " right";
			} else if (s.complete) {
				const stars = document.createElement("span");
				stars.className = "stars";
				stars.textContent = "★".repeat(s.stars) + "☆".repeat(3 - s.stars);
				stars.setAttribute("aria-label", s.stars + " of 3 stars");
				st.append(stars, " Complete");
			} else if (s.done) {
				st.textContent = s.done + " of " + s.total + " solved";
			} else {
				st.textContent = "Not started";
			}
			li.append(a);
			map.append(li);
		});
	}

	function refresh() {
		const xp = totalXp();
		const xpNum = $("#xp-num");
		if (xpNum.textContent !== String(xp)) {
			xpNum.textContent = xp;
			const chip = xpNum.parentElement;
			chip.classList.remove("bump");
			void chip.offsetWidth;
			chip.classList.add("bump");
		}
		const done = Object.keys(state.p).length + Object.keys(state.labs).filter((k) => state.labs[k]).length;
		const pct = Math.min(100, Math.round((done / (problemCount + labCount)) * 100));
		$("#progress-bar").style.width = pct + "%";
		$("#progress").setAttribute("aria-valuenow", String(pct));

		const next = lessons.find((v) => !stats(v).complete) || (stats(exam).complete ? null : exam);
		const started = Object.keys(state.p).length > 0 || Object.keys(state.labs).length > 0;
		const start = $("#start");
		if (!started) {
			start.textContent = "Start class";
			start.href = "#/" + lessons[0].id;
		} else if (next) {
			start.textContent = next === exam ? "Take the final exam" : "Continue: Lesson " + (lessons.indexOf(next) + 1);
			start.href = "#/" + next.id;
		} else {
			start.textContent = "See your diploma";
			start.href = "#/exam";
		}
		$("#rank-note").textContent = started ? "Your rank: " + rankFor(xp) + " · " + pct + "% done" : "9 lessons · 10 labs · 1 final exam";

		renderMap();
		paintDiploma();
	}

	// ------------------------------------------------------------ diploma

	const dipName = $("#dip-name");
	dipName.value = state.name;
	dipName.addEventListener("input", () => {
		state.name = dipName.value.slice(0, 40);
		save();
		paintDiploma();
	});
	$("#print-diploma").addEventListener("click", () => window.print());

	function paintDiploma() {
		const s = stats(exam);
		$("#diploma-lock").hidden = s.complete;
		$("#diploma-wrap").hidden = !s.complete;
		$("#diploma-lock").textContent = "Answer all " + s.total + " questions to unlock your diploma" + (s.done ? " (" + (s.total - s.done) + " to go)." : ".");
		if (!s.complete) return;
		const honors = s.right === s.total ? "summa cum laude" : s.right >= s.total - 2 ? "magna cum laude" : s.right >= s.total / 2 ? "cum laude" : "with gravity still working";
		$("#dip-who").textContent = state.name.trim() || "A Curious Human";
		$("#dip-score").textContent = "Final exam: " + s.right + " of " + s.total + ", " + honors + " · " + totalXp() + " XP · " + rankFor(totalXp());
		$("#dip-date").textContent = new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
	}

	// ------------------------------------------------------------ routing

	const started = new WeakSet();
	function startLabs(view) {
		$$(".lab", view).forEach((el) => {
			if (started.has(el)) return;
			started.add(el);
			const name = el.dataset.lab;
			const make = window.PhysicsLabs && window.PhysicsLabs[name];
			if (!make) return;
			try {
				make(el, { done: () => labDone(name), visible: () => !view.hidden });
			} catch (err) {
				el.textContent = "This lab couldn't start in your browser, but the lesson still works.";
				console.error(err);
			}
		});
	}

	function labDone(name) {
		if (state.labs[name]) return;
		const rankBefore = rankFor(totalXp());
		state.labs[name] = 1;
		save();
		toast("🧪 Lab explored · +" + XP_LAB + " XP");
		refresh();
		const rankAfter = rankFor(totalXp());
		if (rankAfter !== rankBefore) setTimeout(() => toast("⭐ New rank: " + rankAfter), 1200);
	}

	let firstRoute = true;
	function route() {
		const m = /^#\/([a-z-]+)$/.exec(location.hash);
		const found = m && document.getElementById(m[1]);
		const view = found && views.includes(found) ? found : home;
		views.forEach((v) => {
			v.hidden = v !== view;
		});
		document.title = view === home ? "Physics 101: The Real-Life Edition · Brandon Skar" : view.dataset.title + " · Physics 101 · Brandon Skar";
		if (view !== home) startLabs(view);
		if (!firstRoute) {
			window.scrollTo(0, 0);
			const heading = $("h1, h2", view);
			if (heading) {
				heading.setAttribute("tabindex", "-1");
				heading.focus({ preventScroll: true });
			}
		}
		firstRoute = false;
	}
	window.addEventListener("hashchange", route);

	// ------------------------------------------------------------ toasts and confetti

	const toasts = $("#toasts");
	function toast(text) {
		const t = document.createElement("div");
		t.className = "toast";
		t.textContent = text;
		toasts.append(t);
		while (toasts.children.length > 3) toasts.firstChild.remove();
		setTimeout(() => t.classList.add("out"), 2400);
		setTimeout(() => t.remove(), 2900);
	}

	const calm = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };
	const confetti = $("#confetti");
	const cctx = confetti.getContext("2d");
	let bits = [];
	let flying = false;
	const HUES = ["#2f7de1", "#f7c531", "#2e9e52", "#e2507f", "#a77cf2", "#f08a3c"];

	// Confetti with real-ish gravity, from the button that got it right.
	function celebrate(from) {
		if (calm.matches || !cctx) return;
		const r = from.getBoundingClientRect();
		const x = r.left + r.width / 2;
		const y = r.top + r.height / 2;
		for (let i = 0; i < 40; i++) {
			const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.9;
			const s = 5 + Math.random() * 7;
			bits.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, c: HUES[i % HUES.length], life: 1 });
		}
		if (!flying) {
			flying = true;
			requestAnimationFrame(fly);
		}
	}

	function fly() {
		const dpr = Math.min(window.devicePixelRatio || 1, 2);
		const w = window.innerWidth;
		const h = window.innerHeight;
		if (confetti.width !== Math.round(w * dpr) || confetti.height !== Math.round(h * dpr)) {
			confetti.width = Math.round(w * dpr);
			confetti.height = Math.round(h * dpr);
		}
		cctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		cctx.clearRect(0, 0, w, h);
		bits = bits.filter((b) => b.life > 0 && b.y < h + 20);
		for (const b of bits) {
			b.vy += 0.32;
			b.vx *= 0.985;
			b.x += b.vx;
			b.y += b.vy;
			b.r += b.vr;
			b.life -= 0.011;
			cctx.save();
			cctx.globalAlpha = Math.max(0, Math.min(1, b.life * 2));
			cctx.translate(b.x, b.y);
			cctx.rotate(b.r);
			cctx.fillStyle = b.c;
			cctx.fillRect(-4, -2.5, 8, 5);
			cctx.restore();
		}
		if (bits.length) {
			requestAnimationFrame(fly);
		} else {
			flying = false;
			cctx.clearRect(0, 0, w, h);
		}
	}

	if (calm.matches) {
		const art = $(".hero-art");
		if (art && art.pauseAnimations) art.pauseAnimations();
	}

	// ------------------------------------------------------------ formula sheet

	const sheet = $("#formulas");
	$("#open-formulas").addEventListener("click", () => {
		if (sheet.showModal) sheet.showModal();
		else sheet.setAttribute("open", "");
	});
	sheet.addEventListener("click", (e) => {
		if (e.target === sheet || e.target.closest("[data-close]")) sheet.close ? sheet.close() : sheet.removeAttribute("open");
	});

	// ------------------------------------------------------------ calculator

	const calc = $("#calc");
	const calcIn = $("#calc-in");
	const calcOut = $("#calc-out");
	const calcBtn = $("#open-calc");
	let ans = 0;

	function setCalc(open) {
		calc.hidden = !open;
		calcBtn.setAttribute("aria-expanded", String(open));
		if (open) calcIn.focus();
	}
	calcBtn.addEventListener("click", () => setCalc(calc.hidden));
	$("[data-close]", calc).addEventListener("click", () => {
		setCalc(false);
		calcBtn.focus();
	});
	calc.addEventListener("keydown", (e) => {
		if (e.key === "Escape") {
			setCalc(false);
			calcBtn.focus();
		}
	});
	calcIn.addEventListener("input", showCalc);
	$("#calc-form").addEventListener("submit", (e) => {
		e.preventDefault();
		const v = tryEval(calcIn.value);
		if (v !== null) {
			ans = v;
			calcIn.value = formatNumber(v);
			showCalc();
			calcIn.select();
		}
	});
	$(".calc-keys", calc).addEventListener("click", (e) => {
		const b = e.target.closest("button");
		if (!b) return;
		if (b.hasAttribute("data-clear")) {
			calcIn.value = "";
		} else {
			const text = b.dataset.ins;
			const at = calcIn.selectionStart == null ? calcIn.value.length : calcIn.selectionStart;
			const end = calcIn.selectionEnd == null ? at : calcIn.selectionEnd;
			calcIn.value = calcIn.value.slice(0, at) + text + calcIn.value.slice(end);
			calcIn.setSelectionRange(at + text.length, at + text.length);
		}
		calcIn.focus();
		showCalc();
	});

	function showCalc() {
		const text = calcIn.value.trim();
		if (!text) {
			calcOut.textContent = "0";
			calcOut.classList.remove("err");
			return;
		}
		const v = tryEval(text);
		calcOut.classList.toggle("err", v === null);
		calcOut.textContent = v === null ? "…keep typing" : "= " + formatNumber(v);
	}

	function tryEval(text) {
		try {
			const v = evaluate(text, ans);
			return isFinite(v) ? v : null;
		} catch (e) {
			return null;
		}
	}

	function formatNumber(v) {
		if (v !== 0 && (Math.abs(v) >= 1e12 || Math.abs(v) < 1e-6)) return v.toExponential(4);
		return String(parseFloat(v.toPrecision(10)));
	}

	// A small, safe calculator: + − × ÷ ^ ( ), √ and trig in degrees, π, g and
	// ans. "2π" and "3(4)" multiply. No eval.
	function evaluate(text, last) {
		const src = text
			.toLowerCase()
			.replace(/[×·]/g, "*")
			.replace(/÷/g, "/")
			.replace(/[−–]/g, "-")
			.replace(/π/g, "pi")
			.replace(/√/g, "sqrt")
			.replace(/²/g, "^2")
			.replace(/,/g, "");
		const FUN = {
			sqrt: Math.sqrt,
			sin: (d) => Math.sin((d * Math.PI) / 180),
			cos: (d) => Math.cos((d * Math.PI) / 180),
			tan: (d) => Math.tan((d * Math.PI) / 180),
			log: Math.log10,
			ln: Math.log,
			abs: Math.abs,
		};
		const VARS = { pi: Math.PI, g: 9.8, ans: last };
		let i = 0;
		const space = () => {
			while (src[i] === " ") i++;
		};
		function sum() {
			let v = product();
			for (;;) {
				space();
				if (src[i] === "+") {
					i++;
					v += product();
				} else if (src[i] === "-") {
					i++;
					v -= product();
				} else return v;
			}
		}
		function product() {
			let v = unary();
			for (;;) {
				space();
				const c = src[i];
				if (c === "*") {
					i++;
					v *= unary();
				} else if (c === "/") {
					i++;
					v /= unary();
				} else if (c && /[a-z0-9.(]/.test(c)) {
					v *= unary();
				} else return v;
			}
		}
		function unary() {
			space();
			if (src[i] === "-") {
				i++;
				return -unary();
			}
			if (src[i] === "+") {
				i++;
				return unary();
			}
			return power();
		}
		function power() {
			const base = atom();
			space();
			if (src[i] === "^") {
				i++;
				return Math.pow(base, unary());
			}
			return base;
		}
		function atom() {
			space();
			if (src[i] === "(") {
				i++;
				const v = sum();
				space();
				if (src[i] === ")") i++;
				else if (i < src.length) throw new Error("bracket");
				return v;
			}
			const rest = src.slice(i);
			const num = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/.exec(rest);
			if (num) {
				i += num[0].length;
				return parseFloat(num[0]);
			}
			const word = /^[a-z]+/.exec(rest);
			if (word) {
				const w = word[0];
				i += w.length;
				if (FUN[w]) return FUN[w](power());
				if (w in VARS) return VARS[w];
			}
			throw new Error("unexpected");
		}
		const v = sum();
		space();
		if (i < src.length) throw new Error("extra");
		return v;
	}

	// ------------------------------------------------------------ start over

	$("#reset").addEventListener("click", () => {
		if (!window.confirm("Start over? This clears your XP, stars and exam answers in this browser.")) return;
		state = { p: {}, labs: {}, name: "" };
		save();
		location.hash = "#/";
		location.reload();
	});

	$("#year").textContent = new Date().getFullYear();
	refresh();
	route();
})();
