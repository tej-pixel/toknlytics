/* tokanalyzr.ai — shared interactions. Every component self-guards: it only
   initialises if its DOM exists, so the same file powers all pages. */
(function () {
  "use strict";

  function fmtInt(n) { return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ","); }
  function tokShort(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(2).replace(/\.?0+$/, "") + "M";
    if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "k";
    return String(Math.round(n));
  }
  var REDUCE = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function tween(el, from, to, dur, render, key) {
    key = "_t" + (key || "");
    el[key] = (el[key] || 0) + 1;
    var myId = el[key];
    var t0 = (window.performance && performance.now) ? performance.now() : Date.now();
    var raf = window.requestAnimationFrame || function (fn) { return setTimeout(function () { fn(Date.now()); }, 30); };
    if (REDUCE || dur <= 0) { render(to); return; }
    render(from);
    setTimeout(function () { if (el[key] === myId) render(to); }, dur + 60);
    (function step(now) {
      if (el[key] !== myId) return;
      var t = now || ((window.performance && performance.now) ? performance.now() : Date.now());
      var p = Math.min(1, (t - t0) / dur);
      var e = 1 - Math.pow(1 - p, 3);
      render(from + (to - from) * e);
      if (p < 1) raf(step);
    })(t0);
  }

  function grade(score) {
    if (score >= 90) return "A";
    if (score >= 85) return "A−";
    if (score >= 80) return "B+";
    if (score >= 74) return "B";
    if (score >= 67) return "B−";
    if (score >= 60) return "C+";
    if (score >= 50) return "C";
    return "D";
  }

  // ---------- Year ----------
  var yr = document.getElementById("yr");
  if (yr) yr.textContent = new Date().getFullYear();

  // ---------- Mobile menu ----------
  var menuBtn = document.getElementById("menuBtn");
  var navLinks = document.getElementById("navLinks");
  if (menuBtn && navLinks) {
    menuBtn.addEventListener("click", function () { navLinks.classList.toggle("open"); });
    navLinks.addEventListener("click", function (e) { if (e.target.tagName === "A") navLinks.classList.remove("open"); });
  }

  // ---------- Reveal on scroll ----------
  (function () {
    var els = Array.prototype.slice.call(document.querySelectorAll(".reveal"));
    if (!els.length) return;
    if (REDUCE || !("IntersectionObserver" in window)) { els.forEach(function (e) { e.classList.add("in"); }); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
    }, { threshold: 0.12 });
    els.forEach(function (e) { io.observe(e); });
  })();

  // ---------- Live API request-stream console ----------
  (function () {
    var card = document.getElementById("liveConsole");
    if (!card) return;
    var feed = document.getElementById("consFeed");
    var elTokens = document.getElementById("csTokens");
    var elSpend = document.getElementById("csSpend");
    var elGrade = document.getElementById("csGrade");
    var scope = document.getElementById("consScope");
    var sparkLine = document.getElementById("sparkLine");
    var sparkArea = document.getElementById("sparkArea");

    var SPARK = {
      all:       "M0,46 L29,42 L58,45 L87,34 L116,40 L145,27 L174,33 L203,22 L232,28 L261,16 L290,24 L320,12",
      openai:    "M0,43 L29,45 L58,38 L87,40 L116,29 L145,35 L174,24 L203,30 L232,19 L261,26 L290,15 L320,19",
      anthropic: "M0,50 L29,47 L58,49 L87,42 L116,44 L145,38 L174,40 L203,35 L232,37 L261,31 L290,33 L320,29",
      gemini:    "M0,52 L29,50 L58,51 L87,47 L116,49 L145,45 L174,46 L203,43 L232,44 L261,41 L290,42 L320,39"
    };
    var allScope = card.getAttribute("data-allscope") || "across all providers · sampled";
    var PROV = {
      all:       { scope: allScope, tokens: 1240000, spend: 312, grade: "B+",
                   models: [["GPT-4o",0.0265,"warn"],["Claude Sonnet",0.0150,"warn"],["Gemini 1.5 Flash",0.0031,"eco"],["GPT-4o mini",0.0044,"eco"],["Claude Haiku",0.0035,"eco"],["Llama 3.1 70B",0.0009,"eco"],["o1-mini",0.0190,"hot"]] },
      openai:    { scope: "OpenAI · sampled", tokens: 720000, spend: 198, grade: "B",
                   models: [["GPT-4o",0.0265,"warn"],["GPT-4o mini",0.0044,"eco"],["o1-mini",0.0190,"hot"],["GPT-3.5 Turbo",0.0018,"eco"]] },
      anthropic: { scope: "Anthropic · sampled", tokens: 410000, spend: 86, grade: "A−",
                   models: [["Claude Opus",0.0900,"hot"],["Claude Sonnet",0.0150,"warn"],["Claude Haiku",0.0035,"eco"]] },
      gemini:    { scope: "Gemini · sampled", tokens: 110000, spend: 28, grade: "A",
                   models: [["Gemini 1.5 Pro",0.0125,"warn"],["Gemini 1.5 Flash",0.0031,"eco"],["Gemini Nano",0.0006,"eco"]] }
    };
    var current = "all";
    var dispTokens = 0, dispSpend = 0;

    function drawSpark(prov, animate) {
      if (!sparkLine) return;
      var d = SPARK[prov];
      sparkLine.setAttribute("d", d);
      if (sparkArea) sparkArea.setAttribute("d", d + " L320,60 L0,60 Z");
      if (animate && !REDUCE && sparkLine.getTotalLength) {
        var len = sparkLine.getTotalLength();
        sparkLine.style.transition = "none";
        sparkLine.style.strokeDasharray = len;
        sparkLine.style.strokeDashoffset = len;
        void sparkLine.getBoundingClientRect();
        sparkLine.style.transition = "stroke-dashoffset 1.1s ease";
        sparkLine.style.strokeDashoffset = "0";
      } else {
        sparkLine.style.strokeDasharray = "none";
        sparkLine.style.strokeDashoffset = "0";
      }
    }

    function setProvider(prov, animate) {
      current = prov;
      var p = PROV[prov];
      if (scope) scope.textContent = p.scope;
      if (elGrade) elGrade.textContent = p.grade;
      var fromT = dispTokens, fromS = dispSpend;
      dispTokens = p.tokens; dispSpend = p.spend;
      if (elTokens) tween(elTokens, fromT, dispTokens, animate ? 700 : 0, function (v) { elTokens.textContent = tokShort(v); }, "tok");
      if (elSpend) tween(elSpend, fromS, dispSpend, animate ? 700 : 0, function (v) { elSpend.textContent = "$" + fmtInt(v); }, "spend");
      drawSpark(prov, animate);
      if (feed) feed.innerHTML = "";
    }

    function makeCall() {
      var p = PROV[current];
      var m = p.models[Math.floor(Math.random() * p.models.length)];
      var tokens = Math.round(4000 + Math.random() * 34000);
      return { model: m[0], dot: m[2], tokens: tokens, cost: tokens / 1000 * m[1] };
    }
    function pushRow(c) {
      if (!feed) return;
      var row = document.createElement("div");
      row.className = "feed-row in";
      row.innerHTML =
        '<span class="fr-dot ' + c.dot + '"></span>' +
        '<span class="fr-model">' + c.model + '</span>' +
        '<span class="fr-tok">' + tokShort(c.tokens) + ' tok</span>' +
        '<span class="fr-cost">$' + c.cost.toFixed(2) + '</span>';
      feed.insertBefore(row, feed.firstChild);
      while (feed.children.length > 5) feed.removeChild(feed.lastChild);
      var fromT = dispTokens, fromS = dispSpend;
      dispTokens += c.tokens; dispSpend += c.cost;
      if (elTokens) tween(elTokens, fromT, dispTokens, 450, function (v) { elTokens.textContent = tokShort(v); }, "tok");
      if (elSpend) tween(elSpend, fromS, dispSpend, 450, function (v) { elSpend.textContent = "$" + fmtInt(v); }, "spend");
    }

    var chips = Array.prototype.slice.call(card.querySelectorAll(".cons-chip"));
    chips.forEach(function (chip) {
      chip.addEventListener("click", function () {
        chips.forEach(function (c) { c.classList.remove("is-active"); });
        chip.classList.add("is-active");
        setProvider(chip.getAttribute("data-prov"), true);
        if (!REDUCE) { for (var i = 0; i < 3; i++) pushRow(makeCall()); }
      });
    });

    if (REDUCE) { setProvider("all", false); for (var i = 0; i < 4; i++) pushRow(makeCall()); return; }
    setProvider("all", false);

    var timer = null;
    function run() { if (timer) return; timer = setInterval(function () { pushRow(makeCall()); }, 1100); }
    function halt() { if (timer) { clearInterval(timer); timer = null; } }
    var everSeen = false;
    function kick() { drawSpark(current, true); for (var k = 0; k < 3; k++) pushRow(makeCall()); run(); }

    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) { everSeen = true; kick(); }
          else if (everSeen) { halt(); }
        });
      }, { threshold: 0.25 });
      io.observe(card);
      setTimeout(function () { if (!everSeen) kick(); }, 1000);
    } else { kick(); }
  })();

  // ---------- Green Score: gauge + metrics + equivalence + what-if ----------
  (function () {
    var card = document.getElementById("greenCard");
    if (!card) return;
    var ring = document.getElementById("gsProg");
    var gradeEl = document.getElementById("gsGrade");
    var scoreEl = document.getElementById("gsScoreNum");
    var co2El = document.getElementById("gmCo2");
    var kwhEl = document.getElementById("gmKwh");
    var waterEl = document.getElementById("gmWater");
    var geIcons = document.getElementById("geIcons");
    var geCap = document.getElementById("geCap");
    var whatif = document.getElementById("whatif");
    var wiOut = document.getElementById("wiOut");

    var R = 76, C = 2 * Math.PI * R;
    if (ring) { ring.style.strokeDasharray = C.toFixed(1); ring.style.strokeDashoffset = C.toFixed(1); }

    var STATE = {
      base: { score: 80, co2: 182, kwh: 412, water: 1940 },
      opt:  { score: 88, co2: 109, kwh: 247, water: 1164 }
    };
    var mode = "base";

    function renderGauge(s, animate) {
      if (ring) ring.style.strokeDashoffset = (C * (1 - s.score / 100)).toFixed(1);
      if (gradeEl) gradeEl.textContent = grade(s.score);
      if (scoreEl) tween(scoreEl, +scoreEl.textContent || 0, s.score, animate ? 900 : 0, function (v) { scoreEl.textContent = Math.round(v); }, "gsc");
    }
    function renderMetrics(s, animate) {
      if (co2El) tween(co2El, +(co2El.textContent.replace(/,/g, "")) || 0, s.co2, animate ? 900 : 0, function (v) { co2El.textContent = fmtInt(v); }, "co2");
      if (kwhEl) tween(kwhEl, +(kwhEl.textContent.replace(/,/g, "")) || 0, s.kwh, animate ? 900 : 0, function (v) { kwhEl.textContent = fmtInt(v); }, "kwh");
      if (waterEl) tween(waterEl, +(waterEl.textContent.replace(/,/g, "")) || 0, s.water, animate ? 900 : 0, function (v) { waterEl.textContent = fmtInt(v); }, "wat");
    }

    var curEq = "trees";
    function eqData(co2) {
      return {
        trees: { icon: "🌳", count: Math.max(1, Math.round(co2 / 21)), cap: function (n) { return "<b>" + co2 + " kg CO₂e</b> ≈ " + n + " trees working for a month to absorb it."; } },
        drive: { icon: "🚗", count: Math.max(1, Math.round(co2 * 4 / 100)), cap: function () { return "<b>" + co2 + " kg CO₂e</b> ≈ " + fmtInt(co2 * 4) + " km driven in an average car."; } },
        phone: { icon: "📱", count: Math.max(1, Math.round(co2 * 121 / 1000)), cap: function () { return "<b>" + co2 + " kg CO₂e</b> ≈ " + fmtInt(co2 * 121) + " smartphone charges."; } }
      };
    }
    function renderEq(animate) {
      if (!geIcons || !geCap) return;
      var co2 = STATE[mode].co2;
      var d = eqData(co2)[curEq];
      var n = Math.min(d.count, 60), html = "";
      for (var i = 0; i < n; i++) html += '<span style="animation-delay:' + (animate && !REDUCE ? (i * 22) : 0) + 'ms">' + d.icon + '</span>';
      if (d.count > n) html += '<span style="animation-delay:0ms">+' + (d.count - n) + '</span>';
      geIcons.innerHTML = html;
      geCap.innerHTML = d.cap(d.count);
    }

    Array.prototype.slice.call(card.querySelectorAll(".ge-tab")).forEach(function (tab) {
      tab.addEventListener("click", function () {
        card.querySelectorAll(".ge-tab").forEach(function (t) { t.classList.remove("is-active"); });
        tab.classList.add("is-active");
        curEq = tab.getAttribute("data-eq");
        renderEq(true);
      });
    });

    if (whatif) whatif.addEventListener("change", function () {
      mode = whatif.checked ? "opt" : "base";
      renderGauge(STATE[mode], true);
      renderMetrics(STATE[mode], true);
      renderEq(true);
      if (wiOut) wiOut.innerHTML = whatif.checked
        ? "Green Score <b>B+ → A−</b> · −0.4t CO₂e/yr, no quality drop"
        : "Try it — watch the score climb";
    });

    function reveal(animate) { renderGauge(STATE[mode], animate); renderMetrics(STATE[mode], animate); renderEq(animate); }
    if (REDUCE) { reveal(false); return; }
    var everSeen = false;
    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) { if (e.isIntersecting && !everSeen) { everSeen = true; reveal(true); } });
      }, { threshold: 0.3 });
      io.observe(card);
      setTimeout(function () { if (!everSeen) { everSeen = true; reveal(true); } }, 1200);
    } else { reveal(true); }
  })();

  // ---------- Optimization control panel ----------
  (function () {
    var sws = Array.prototype.slice.call(document.querySelectorAll(".opt-sw"));
    if (!sws.length) return;
    var BASE_SPEND = 8400, BASE_CARBON = 169, BASE_SCORE = 50;
    var spendEl = document.getElementById("opSpend");
    var baseEl = document.getElementById("opBase");
    var gradeEl = document.getElementById("opGrade");
    var spendBar = document.getElementById("opSpendBar");
    var spendPct = document.getElementById("opSpendPct");
    var carbonEl = document.getElementById("opCarbon");
    var carbonBar = document.getElementById("opCarbonBar");
    var saveEl = document.getElementById("opSave");
    var prevSpend = BASE_SPEND;

    function recalc() {
      var factor = 1, scoreBoost = 0, anyOn = false;
      sws.forEach(function (sw) {
        if (sw.checked) { factor *= (1 - parseFloat(sw.getAttribute("data-cut"))); scoreBoost += parseFloat(sw.getAttribute("data-score")); anyOn = true; }
      });
      var spend = BASE_SPEND * factor, carbon = BASE_CARBON * factor;
      var score = Math.min(94, BASE_SCORE + scoreBoost), pct = factor * 100;
      tween(spendEl, prevSpend, spend, 500, function (v) { spendEl.textContent = "$" + fmtInt(v); }, "sp");
      prevSpend = spend;
      baseEl.textContent = anyOn ? ("was $" + fmtInt(BASE_SPEND)) : "baseline";
      baseEl.style.visibility = anyOn ? "visible" : "hidden";
      gradeEl.textContent = grade(score);
      spendBar.style.width = pct.toFixed(1) + "%";
      spendPct.textContent = Math.round(pct) + "%";
      carbonEl.textContent = fmtInt(carbon) + " kg";
      carbonBar.style.width = pct.toFixed(1) + "%";
      if (anyOn) {
        saveEl.classList.remove("idle");
        saveEl.innerHTML = "Saving <b>$" + fmtInt(BASE_SPEND - spend) + "/mo</b> (" + Math.round((1 - factor) * 100) + "%) · " + fmtInt((BASE_CARBON - carbon) * 12) + " kg CO₂e/yr avoided";
      } else {
        saveEl.classList.add("idle");
        saveEl.innerHTML = "Flip a switch to start saving &rarr;";
      }
    }
    sws.forEach(function (sw) { sw.addEventListener("change", recalc); });
    if (spendBar) spendBar.style.width = "100%";
    if (carbonBar) carbonBar.style.width = "100%";
    recalc();
  })();

  // ---------- Try it: live prompt analyzer ----------
  (function () {
    var input = document.getElementById("tryInput");
    var samplesWrap = document.getElementById("trySamples");
    if (!input || !samplesWrap) return;
    var empty = document.getElementById("tryEmpty");
    var live = document.getElementById("tryLive");
    var tokEl = document.getElementById("tryTokens");
    var gradeEl = document.getElementById("tryGrade");
    var tSave = document.getElementById("tSave");
    var els = {
      gpt: [document.getElementById("costGpt"), document.getElementById("barGpt"), 0.0265],
      claude: [document.getElementById("costClaude"), document.getElementById("barClaude"), 0.0150],
      gem: [document.getElementById("costGem"), document.getElementById("barGem"), 0.0031]
    };
    var SAMPLES = {
      support: { tokens: 1450, text: "You are a senior support agent for a SaaS billing product. Given the full ticket history and the customer's plan details below, write a warm, thorough reply that resolves their double-charge issue, explains the refund timeline, and offers a goodwill credit.\n\n[+ full ticket history and account context attached]" },
      code: { tokens: 3850, text: "You are an expert TypeScript engineer. Given this 600-line module and its failing tests, refactor it for readability, fix the bug causing the race condition, add JSDoc to every export, and return the full updated file with no omissions.\n\n[+ 600-line source module and test suite attached]" },
      summary: { tokens: 8600, text: "Summarize the attached 40-page quarterly report into an executive brief. Preserve every financial figure, list all risks verbatim, and produce a section-by-section breakdown with key quotes from the leadership commentary. Then translate the brief into French and Spanish.\n\n[+ 40-page quarterly report attached]" }
    };
    function tokenGrade(t) {
      if (t <= 600) return ["A", "eco"];
      if (t <= 1200) return ["B+", "eco"];
      if (t <= 2500) return ["B", "warn"];
      if (t <= 5000) return ["C+", "warn"];
      if (t <= 9000) return ["C", "miss"];
      return ["D", "miss"];
    }
    var prevTok = 0;
    function update(animate, overrideTokens) {
      var text = input.value.trim();
      if (!text) { empty.hidden = false; live.hidden = true; prevTok = 0; return; }
      empty.hidden = true; live.hidden = false;
      var tokens = overrideTokens || Math.max(1, Math.round(text.length / 4) + 8);
      tween(tokEl, prevTok, tokens, animate ? 500 : 0, function (v) { tokEl.textContent = fmtInt(v); }, "tk");
      prevTok = tokens;
      var g = tokenGrade(tokens);
      gradeEl.textContent = g[0]; gradeEl.className = "badge " + g[1];
      var costs = {}, maxCost = tokens / 1000 * els.gpt[2];
      Object.keys(els).forEach(function (k) {
        var c = tokens / 1000 * els[k][2];
        costs[k] = c;
        els[k][0].textContent = "$" + c.toFixed(c < 0.1 ? 4 : 3);
        els[k][1].style.width = (maxCost ? (c / maxCost * 100) : 0).toFixed(1) + "%";
      });
      tSave.innerHTML = "Routing this to <b>Gemini Flash</b> instead of GPT-4o saves <b>" + Math.round((1 - costs.gem / costs.gpt) * 100) + "%</b> per call.";
    }
    var sampleBtns = Array.prototype.slice.call(samplesWrap.querySelectorAll("button"));
    sampleBtns.forEach(function (b) {
      b.addEventListener("click", function () {
        sampleBtns.forEach(function (x) { x.classList.remove("is-active"); });
        b.classList.add("is-active");
        var s = SAMPLES[b.getAttribute("data-sample")];
        input.value = s.text;
        update(true, s.tokens);
      });
    });
    input.addEventListener("input", function () {
      sampleBtns.forEach(function (x) { x.classList.remove("is-active"); });
      update(false);
    });
  })();

  // ---------- Savings calculator ----------
  (function () {
    var spend = document.getElementById("spend"), over = document.getElementById("over"), save = document.getElementById("save");
    if (!spend || !over || !save) return;
    var spendOut = document.getElementById("spendOut"), overOut = document.getElementById("overOut"), saveOut = document.getElementById("saveOut");
    var moMoney = document.getElementById("moMoney"), yrMoney = document.getElementById("yrMoney"), co2 = document.getElementById("co2"), trees = document.getElementById("trees");
    function calc() {
      var s = +spend.value, o = +over.value, v = +save.value;
      spendOut.textContent = "$" + fmtInt(s); overOut.textContent = o + "%"; saveOut.textContent = v + "%";
      var mo = s * (o / 100) * (v / 100), yrv = mo * 12;
      moMoney.textContent = fmtInt(mo); yrMoney.textContent = fmtInt(yrv);
      var kg = yrv * 0.6; co2.textContent = fmtInt(kg); trees.textContent = fmtInt(kg / 21);
    }
    [spend, over, save].forEach(function (el) { el.addEventListener("input", calc); });
    calc();
  })();

  // ---------- Pricing: monthly / annual toggle (data-driven) ----------
  (function () {
    var toggle = document.getElementById("billToggle");
    if (!toggle) return;
    var btns = Array.prototype.slice.call(toggle.querySelectorAll("button"));
    var vals = Array.prototype.slice.call(document.querySelectorAll(".price-val"));
    var notes = Array.prototype.slice.call(document.querySelectorAll(".bill-note"));
    function setBill(mode) {
      vals.forEach(function (el) { el.textContent = el.getAttribute(mode === "annual" ? "data-a" : "data-m"); });
      notes.forEach(function (el) {
        el.textContent = mode === "annual" ? (el.getAttribute("data-a-note") || "Billed annually") : (el.getAttribute("data-m-note") || "Billed monthly");
      });
      btns.forEach(function (b) { b.classList.toggle("is-active", b.getAttribute("data-bill") === mode); });
    }
    btns.forEach(function (b) { b.addEventListener("click", function () { setBill(b.getAttribute("data-bill")); }); });
  })();

  // ---------- Start form (mock) ----------
  (function () {
    var form = document.getElementById("startForm");
    if (!form) return;
    var email = document.getElementById("startEmail"), success = document.getElementById("startSuccess");
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var v = (email.value || "").trim();
      if (!v || v.indexOf("@") === -1) { email.focus(); return; }
      form.style.display = "none";
      if (success) success.style.display = "block";
    });
  })();

  // ---------- Sticky bar ----------
  (function () {
    var bar = document.getElementById("stickyBar");
    if (!bar) return;
    var startSec = document.getElementById("start"), x = document.getElementById("stickyBarX");
    var dismissed = false;
    try { dismissed = sessionStorage.getItem("tk-sticky-dismissed") === "1"; } catch (e) {}
    var startInView = false;
    function update() {
      if (dismissed) { bar.classList.remove("show"); return; }
      var past = (window.scrollY || window.pageYOffset) > 700;
      if (past && !startInView) bar.classList.add("show"); else bar.classList.remove("show");
    }
    if (x) x.addEventListener("click", function () { dismissed = true; bar.classList.remove("show"); try { sessionStorage.setItem("tk-sticky-dismissed", "1"); } catch (e) {} });
    if ("IntersectionObserver" in window && startSec) {
      new IntersectionObserver(function (entries) { entries.forEach(function (e) { startInView = e.isIntersecting; }); update(); }, { threshold: 0.15 }).observe(startSec);
    }
    window.addEventListener("scroll", update, { passive: true });
    update();
  })();
})();
