/* Seedance audio-as-input study — interactive report. Vanilla JS, no build step. */
(async function () {
  "use strict";
  const D = await (await fetch("data/data.json")).json();
  const RUNS = D.runs, C = D.conditions, ST = D.stats;
  const condOrder = ["E1-T", "E1-TT", "E1-N", "E1-R8", "E1-R4", "E2-U", "E2-S", "E2-V", "E3-B", "E3-N", "E3-A"];
  const RUN_IDS = Object.keys(RUNS).sort(sortRuns);
  const NS = "http://www.w3.org/2000/svg";
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

  /* ---------------- helpers ---------------- */
  function h(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === "class") e.className = v;
      else if (k === "html") e.innerHTML = v;
      else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
      else if (k === "style") e.style.cssText = v;
      else if (v !== undefined && v !== null && v !== false) e.setAttribute(k, v);
    }
    for (const k of kids.flat()) if (k !== null && k !== undefined) e.append(k.nodeType ? k : document.createTextNode(k));
    return e;
  }
  function S(tag, attrs, ...kids) {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
      else if (v !== undefined && v !== null) e.setAttribute(k, v);
    }
    for (const k of kids.flat()) if (k !== null && k !== undefined) e.append(k.nodeType ? k : document.createTextNode(k));
    return e;
  }
  const fmt = (v, d = 2) => (v === null || v === undefined || Number.isNaN(v) ? "—" : (+v).toFixed(d));
  const sgn = (v, d = 2) => (v === null || v === undefined ? "—" : (v > 0 ? "+" : "") + (+v).toFixed(d));
  const MC = (m) => (m === "2.5" ? css("--m25") : css("--m20"));
  function sortRuns(a, b) {
    const ra = RUNS[a], rb = RUNS[b];
    return condOrder.indexOf(ra.cond) - condOrder.indexOf(rb.cond) || ra.model.localeCompare(rb.model) || ra.rep - rb.rep;
  }
  const label = (id) => { const r = RUNS[id]; return `${r.cond} · ${C[r.cond].ko} · ${r.model} · #${r.rep}`; };
  const dur = (id) => (RUNS[id].exp === 3 ? 8 : 12);
  const refOf = (id) => C[RUNS[id].cond].audio;
  const dropOf = (id) => { const a = refOf(id); return a === "A_drop8" ? 8 : a === "A_drop4" ? 4 : null; };

  const tip = h("div", { class: "tip" });
  document.body.append(tip);
  function showTip(ev, html) {
    tip.innerHTML = html; tip.classList.add("show");
    const x = Math.min(ev.clientX + 14, window.innerWidth - tip.offsetWidth - 8);
    const y = Math.min(ev.clientY + 14, window.innerHeight - tip.offsetHeight - 8);
    tip.style.left = x + "px"; tip.style.top = y + "px";
  }
  const hideTip = () => tip.classList.remove("show");
  function seg(options, value, onChange) {
    const wrap = h("div", { class: "seg" });
    options.forEach(([v, l]) => {
      const b = h("button", { class: v === value ? "on" : "", onclick: () => { wrap.querySelectorAll("button").forEach((x) => x.classList.remove("on")); b.classList.add("on"); onChange(v); } }, l);
      wrap.append(b);
    });
    return wrap;
  }
  const $ = (s) => document.querySelector(s);

  /* ---------------- theme ---------------- */
  const themeBtn = $("#themeBtn");
  const saved = (() => { try { return localStorage.getItem("theme"); } catch (e) { return null; } })();
  document.documentElement.dataset.theme = saved === "dark" ? "dark" : "light";
  themeBtn.onclick = () => {
    const t = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem("theme", t); } catch (e) {}
    redrawAll();
  };

  /* ---------------- fill stat placeholders ---------------- */
  function statLookup(path) {
    return path.split(".").reduce((o, k) => (o == null ? o : o[k]), D);
  }
  document.querySelectorAll("[data-s]").forEach((el) => {
    const [path, d, mode] = el.dataset.s.split("|");
    let v = statLookup(path);
    if (v && typeof v === "object" && "mean" in v) v = v.mean;
    if (mode === "abs") v = Math.abs(v);
    if (mode === "pct") { el.textContent = v == null ? "—" : Math.round(v * 100) + "%"; return; }
    el.textContent = mode === "sgn" ? sgn(v, +d || 2) : fmt(v, d === undefined ? 2 : +d);
  });
  $("#nRuns").textContent = Object.keys(RUNS).length;

  /* =====================================================================
     Audio stimulus players (spectrogram + playhead + ground-truth marks)
     ===================================================================== */
  document.querySelectorAll(".aplayer").forEach((box) => {
    const name = box.dataset.ref, dur0 = D.refs[name].dur;
    const audio = h("audio", { src: `media/ref/${name}.mp3`, preload: "none" });
    const ph = h("div", { class: "ph" });
    const spec = h("div", { class: "spec" }, h("img", { src: `media/ref/${name}.jpg`, alt: `${name} spectrogram`, loading: "lazy" }), ph);
    const marks = name === "A_dialogue" ? [[1.0, "노크 1.0s"], [4.0, "대사 4.0s"]] : [[D.refs[name].gt.t_build, "build"], [D.refs[name].gt.t_drop, "DROP"]];
    marks.forEach(([t, l]) => spec.append(h("div", { class: "mk", style: `left:${(t / dur0) * 100}%` }, h("span", {}, l))));
    const btn = h("button", { class: "btn sm" }, "▶ 재생");
    const tm = h("span", { class: "mono" }, "0.00s");
    btn.onclick = () => (audio.paused ? audio.play() : audio.pause());
    audio.onplay = () => (btn.textContent = "❚❚ 정지"); audio.onpause = () => (btn.textContent = "▶ 재생");
    spec.onclick = (e) => { const r = spec.getBoundingClientRect(); audio.currentTime = ((e.clientX - r.left) / r.width) * dur0; audio.play(); };
    (function loop() { ph.style.left = (audio.currentTime / dur0) * 100 + "%"; tm.textContent = audio.currentTime.toFixed(2) + "s"; requestAnimationFrame(loop); })();
    box.append(spec, h("div", { class: "ctl" }, btn, tm, h("span", {}, "스펙트로그램을 클릭하면 그 지점부터 재생")), audio);
  });

  /* =====================================================================
     Design matrix with prompts
     ===================================================================== */
  const EXP_INFO = {
    1: ["실험 1 — 오디오가 타이밍을 지배하는가", "12초 · @Image1 캐릭터 + @Image2 환경 고정 · 조건당 3회 × 2 모델"],
    2: ["실험 2 — 시간 레퍼런스 충돌", "12초 · @Video1(등속 돌리인, 무음) vs @Audio1(120 BPM EDM)"],
    3: ["실험 3 — 대사·SFX 타이밍과 립싱크", "8초 · 노크 1.0s, 대사 4.0s 목표 · 배경음악 금지"],
  };
  const matrix = $("#matrix");
  [1, 2, 3].forEach((e) => {
    const blk = h("div", { class: "exp-block" }, h("div", { class: "eh" }, h("b", {}, EXP_INFO[e][0]), h("span", {}, EXP_INFO[e][1])));
    condOrder.filter((c) => C[c].exp === e).forEach((c) => {
      const n20 = RUN_IDS.filter((r) => RUNS[r].cond === c && RUNS[r].model === "2.0").length;
      const n25 = RUN_IDS.filter((r) => RUNS[r].cond === c && RUNS[r].model === "2.5").length;
      blk.append(h("div", { class: "cond-row" },
        h("div", { class: "code" }, c),
        h("div", { class: "d" }, h("b", {}, C[c].ko), h("small", {}, C[c].desc),
          h("details", { class: "prompt" }, h("summary", {}, "프롬프트 원문 보기"), h("pre", {}, C[c].prompt))),
        h("div", {}, h("span", { class: "badge m20" }, `2.0 ×${n20}`), " ", h("span", { class: "badge m25" }, `2.5 ×${n25}`))));
    });
    matrix.append(blk);
  });

  /* =====================================================================
     EXPLORER (synced video + multi-track timeline)
     ===================================================================== */
  class Explorer {
    constructor(root, opts = {}) {
      this.root = root; this.compact = !!opts.compact; this.onLoad = opts.onLoad;
      this.video = h("video", { playsinline: "", preload: "metadata", controls: false });
      this.flash = h("div", { class: "flash" });
      this.ov = h("div", { class: "ov" });
      this.sub = h("div", { class: "sub" });
      this.vbox = h("div", { class: "vbox" }, this.video, this.ov, this.flash, this.sub);
      this.svg = S("svg", { class: "tl", preserveAspectRatio: "none" });
      this.timeEl = h("span", { class: "time" }, "0.00 / 0.00 s");
      this.playBtn = h("button", { class: "btn primary sm", onclick: () => this.toggle() }, "▶ 재생");
      this.rate = 1;
      const rateSeg = seg([["1", "1×"], ["0.5", "0.5×"], ["0.25", "0.25×"]], "1", (v) => { this.rate = +v; this.video.playbackRate = this.rate; });
      this.loopOn = false;
      this.loopBtn = h("button", { class: "btn sm", onclick: () => { this.loopOn = !this.loopOn; this.loopBtn.classList.toggle("primary", this.loopOn); if (this.loopOn) this.seek(this.loopRange()[0]); this.video.play(); } }, "⟲ 이벤트 구간 반복");
      this.muteBtn = h("button", { class: "btn sm", onclick: () => { this.video.muted = !this.video.muted; this.muteBtn.textContent = this.video.muted ? "🔇" : "🔊"; } }, "🔊");
      const step = (d) => h("button", { class: "btn sm", title: d > 0 ? "다음 프레임" : "이전 프레임", onclick: () => { this.video.pause(); this.seek(this.video.currentTime + d / 24); } }, d > 0 ? "▸|" : "|◂");
      this.ctl = h("div", { class: "ctl-row" }, this.playBtn, step(-1), step(1), rateSeg, this.loopBtn, this.muteBtn, this.timeEl);
      this.showBeat = !this.compact; this.showRef = true;
      this.toggles = h("div", { class: "toggles" });
      const tg = (key, lab) => { const i = h("input", { type: "checkbox" }); i.checked = this[key]; i.onchange = () => { this[key] = i.checked; this.draw(); }; return h("label", {}, i, lab); };
      this.toggles.append(tg("showBeat", "비트 그리드(0.5s)"), tg("showRef", "레퍼런스 오디오 엔벨로프"));
      this.info = h("div", { class: "ex-side" });
      if (this.compact) {
        root.append(this.vbox, this.ctl, this.svg);
      } else {
        this.below = h("div", { style: "margin-top:10px" });
        root.append(h("div", { class: "ex-top" }, this.vbox, this.info), this.ctl, this.svg,
          h("div", { style: "display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px;margin-top:6px" }, this.toggles,
            h("span", { class: "hint" }, "타임라인 클릭/드래그 = 탐색 · 스페이스 = 재생/정지 · ←/→ = 프레임 이동")), this.below);
      }
      this.video.addEventListener("play", () => (this.playBtn.textContent = "❚❚ 정지"));
      this.video.addEventListener("pause", () => (this.playBtn.textContent = "▶ 재생"));
      this.video.addEventListener("click", () => this.toggle());
      let drag = false;
      const seekEv = (e) => { const r = this.svg.getBoundingClientRect(); const x = (e.clientX - r.left) / r.width; this.seek(Math.max(0, Math.min(1, x)) * this.dur); };
      this.svg.addEventListener("pointerdown", (e) => { drag = true; this.svg.setPointerCapture(e.pointerId); seekEv(e); });
      this.svg.addEventListener("pointermove", (e) => drag && seekEv(e));
      this.svg.addEventListener("pointerup", () => (drag = false));
      this.lastT = 0;
      let rw = 0;
      new ResizeObserver(() => { const w = Math.round(this.svg.getBoundingClientRect().width); if (w && Math.abs(w - rw) > 4) { rw = w; this.draw(); } }).observe(this.svg);
      const loop = () => { this.tick(); requestAnimationFrame(loop); };
      requestAnimationFrame(loop);
    }
    toggle() { this.video.paused ? this.video.play() : this.video.pause(); }
    seek(t) { this.video.currentTime = Math.max(0, Math.min(this.dur - 0.01, t)); }
    keyEvent() {
      const r = RUNS[this.id];
      if (r.exp === 3) return 4.0;
      return dropOf(this.id) ?? C[r.cond].target ?? r.metrics.t_reveal ?? 6;
    }
    loopRange() { const k = this.keyEvent(); return [Math.max(0, k - 2), Math.min(this.dur, k + 2.5)]; }
    load(id, autoplay = false) {
      this.id = id; const r = RUNS[id]; this.dur = dur(id);
      this.video.src = `media/v/${id}.mp4`; this.video.poster = `media/p/${id}.jpg`;
      this.video.playbackRate = this.rate;
      this.ov.innerHTML = "";
      this.ov.append(h("span", {}, r.cond), h("span", { style: `color:${MC(r.model)};font-weight:700` }, "Seedance " + r.model), h("span", {}, "#" + r.rep));
      this.tChip = h("span", {}, "t=0.00"); this.ov.append(this.tChip);
      this.events = this.collectEvents();
      this.fired = new Set();
      this.draw(); this.renderInfo();
      if (autoplay) this.video.play().catch(() => {});
      this.onLoad && this.onLoad(id);
    }
    collectEvents() {
      const r = RUNS[this.id], m = r.metrics, ev = [];
      if (r.exp === 3) {
        if (m.knock_t != null) ev.push({ t: m.knock_t, c: css("--hit"), l: "노크 감지" });
        if (m.speech_on != null) ev.push({ t: m.speech_on, c: css("--reveal"), l: "발화 시작" });
      } else {
        const d = dropOf(this.id);
        if (d != null) ev.push({ t: d, c: css("--drop"), l: "레퍼런스 드롭" });
        if (m.t_reveal != null) ev.push({ t: m.t_reveal, c: css("--reveal"), l: "야경 리빌" });
        if (m.t_hit != null) ev.push({ t: m.t_hit, c: css("--hit"), l: "모션 히트" });
        (r.cuts || []).forEach((t) => ev.push({ t, c: css("--cut"), l: "컷" }));
      }
      return ev.sort((a, b) => a.t - b.t);
    }
    tick() {
      if (!this.id) return;
      const t = this.video.currentTime;
      if (this.loopOn) { const [a, b] = this.loopRange(); if (t >= b || t < a - 0.05) this.seek(a); }
      if (this.ph) { const x = (t / this.dur) * this.W; this.ph.setAttribute("x1", x); this.ph.setAttribute("x2", x); }
      this.timeEl.textContent = `${t.toFixed(2)} / ${this.dur.toFixed(2)} s`;
      if (this.tChip) this.tChip.textContent = "t=" + t.toFixed(2);
      if (t < this.lastT - 0.05) this.fired.clear();
      for (const e of this.events) {
        const k = e.l + e.t;
        if (!this.fired.has(k) && this.lastT <= e.t && t > e.t && !this.video.paused) {
          this.fired.add(k); this.flash.style.borderColor = e.c;
          clearTimeout(this._ft); this._ft = setTimeout(() => (this.flash.style.borderColor = "transparent"), 260);
        }
      }
      const r = RUNS[this.id];
      if (r.exp === 3 && r.metrics.speech_on != null) {
        const on = t >= r.metrics.speech_on && t <= (r.metrics.speech_off ?? r.metrics.speech_on + 1.5);
        this.sub.textContent = "“" + r.metrics.transcript + "”"; this.sub.style.opacity = on ? 1 : 0;
      } else this.sub.style.opacity = 0;
      this.lastT = t;
    }
    draw() {
      if (!this.id) return;
      const r = RUNS[this.id], svg = this.svg, d = this.dur;
      const W = (this.W = Math.max(300, Math.round(svg.getBoundingClientRect().width || svg.parentElement.clientWidth || 1000)));
      const X = (t) => (t / d) * W, narrow = W < 640;
      svg.innerHTML = "";
      const tracks = [];
      const L = 0; let y = 0;
      const lineCol = { motion: css("--accent"), blue: css("--reveal"), out: css("--good"), ref: css("--muted"), mouth: css("--hit") };
      const add = (name, hgt, fn) => { tracks.push([name, y, hgt]); fn(y, hgt); y += hgt + 6; };
      const path = (arr, dt, y0, hh, col, fill) => {
        const mx = Math.max(...arr, 1e-9); let p = "";
        arr.forEach((v, i) => { const x = X(i * dt), yy = y0 + hh - (v / mx) * (hh - 3); p += (i ? "L" : "M") + x.toFixed(1) + "," + yy.toFixed(1); });
        if (fill) svg.append(S("path", { d: p + `L${X((arr.length - 1) * dt)},${y0 + hh}L0,${y0 + hh}Z`, fill: col, "fill-opacity": 0.22, stroke: "none" }));
        svg.append(S("path", { d: p, fill: "none", stroke: col, "stroke-width": 1.6, "vector-effect": "non-scaling-stroke" }));
      };
      const thumbs = this.compact ? 46 : 62;
      add("프레임", thumbs, (y0, hh) => svg.append(S("image", { href: `media/strip/${this.id}.jpg`, x: 0, y: y0, width: W, height: hh, preserveAspectRatio: "none" })));
      add("출력 오디오 스펙트로그램", this.compact ? 36 : 50, (y0, hh) => svg.append(S("image", { href: `media/s/${this.id}.jpg`, x: 0, y: y0, width: W, height: hh, preserveAspectRatio: "none", class: "spec-img" })));
      const ser = r.series;
      if (r.exp === 3) {
        add("음성 엔벨로프", 36, (y0, hh) => path(ser.speech, ser.dt, y0, hh, lineCol.blue, true));
        if (ser.mouth) add("입 벌림 (랜드마크)", 36, (y0, hh) => path(ser.mouth, ser.dt, y0, hh, lineCol.mouth, false));
      } else {
        const ref = refOf(this.id);
        if (ref !== "—" && this.showRef) add("레퍼런스 오디오 (입력)", 30, (y0, hh) => path(D.refs[ref].rms, 1 / 12, y0, hh, lineCol.ref, true));
        add("출력 오디오 RMS", 30, (y0, hh) => path(ser.out_rms, ser.dt, y0, hh, lineCol.out, true));
        add("모션 강도 (옵티컬 플로우)", this.compact ? 34 : 44, (y0, hh) => path(ser.motion, ser.dt, y0, hh, lineCol.motion, true));
        if (!this.compact) add("야경 노출 비율", 30, (y0, hh) => path(ser.blue, ser.dt, y0, hh, lineCol.blue, false));
      }
      const H = y + 16;
      // beat grid
      if (this.showBeat && r.exp !== 3) for (let t = 0; t <= d + 1e-6; t += 0.5) svg.append(S("line", { x1: X(t), x2: X(t), y1: 0, y2: H - 16, stroke: css("--text"), "stroke-opacity": Number.isInteger(t) ? 0.13 : 0.06, "vector-effect": "non-scaling-stroke" }));
      // markers
      const vline = (t, col, dash, w = 2, lbl, top) => {
        svg.append(S("line", { x1: X(t), x2: X(t), y1: 0, y2: H - 16, stroke: col, "stroke-width": w, "stroke-dasharray": dash || null, "vector-effect": "non-scaling-stroke" }));
        if (lbl) {
          const right = X(t) > W - 120;
          svg.append(S("text", { x: right ? X(t) - 4 : X(t) + 4, y: top ? 10 + 15 * top : H - 4, "text-anchor": right ? "end" : "start", fill: col, class: "trk-l", style: `font-size:10.5px;font-weight:700;fill:${col}` }, lbl));
        }
      };
      if (r.exp === 3) {
        vline(1.0, css("--hit"), "5 4", 1.5, "노크 목표 1.0s", true);
        vline(4.0, css("--reveal"), "5 4", 1.5, "대사 목표 4.0s", true);
        if (r.metrics.knock_t != null) vline(r.metrics.knock_t, css("--hit"), null, 2.5);
        if (r.metrics.speech_on != null) {
          svg.append(S("rect", { x: X(r.metrics.speech_on), width: X((r.metrics.speech_off ?? r.metrics.speech_on + 1) - r.metrics.speech_on), y: 0, height: H - 16, fill: css("--reveal"), "fill-opacity": 0.12 }));
          vline(r.metrics.speech_on, css("--reveal"), null, 2.5);
        }
      } else {
        (r.cuts || []).forEach((t) => vline(t, css("--cut"), null, 1.5));
        const dd = dropOf(this.id) ?? C[r.cond].target;
        if (dd != null) vline(dd, css("--drop"), "6 4", 2, (dropOf(this.id) != null ? "입력 드롭 " : "목표 ") + dd + "s", true);
        if (r.metrics.out_drop != null && refOf(this.id) !== "—") vline(r.metrics.out_drop, css("--good"), "2 3", 2, "출력 드롭 " + r.metrics.out_drop.toFixed(1) + "s", 2);
        if (r.metrics.t_reveal != null) vline(r.metrics.t_reveal, css("--reveal"), null, 2.5);
        if (r.metrics.t_hit != null) vline(r.metrics.t_hit, css("--hit"), null, 2.5);
      }
      tracks.forEach(([n, y0]) => svg.append(S("text", { x: 6, y: y0 + 12, class: "trk-l" }, n)));
      for (let t = 0; t <= d; t += narrow ? 2 : 1) svg.append(S("text", { x: Math.min(W - 16, X(t) + 2), y: H - 4, style: "font-size:10px" }, t + "s"));
      this.ph = S("line", { x1: 0, x2: 0, y1: 0, y2: H - 14, stroke: css("--text"), "stroke-width": 2, "vector-effect": "non-scaling-stroke" });
      svg.append(this.ph);
      svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
      svg.style.height = H + "px";
    }
    renderInfo() {
      if (this.compact) return;
      const r = RUNS[this.id], m = r.metrics, box = this.info;
      box.innerHTML = "";
      const sel = runPicker(this.id, (id) => this.load(id));
      const kv = h("div", { class: "kv" });
      const add = (k, v, c) => kv.append(h("div", {}, h("div", { class: "k" }, k), h("div", { class: "v", style: c ? `color:${c}` : "" }, v)));
      if (r.exp === 3) {
        add("전사 (Whisper)", m.correct_line ? "✓ 대본 일치" : "✗ 다른 대사", m.correct_line ? css("--good") : css("--bad"));
        add("CER", fmt(m.cer, 2));
        add("노크 시점 (목표 1.0)", fmt(m.knock_t) + "s", css("--hit"));
        add("발화 시작 (목표 4.0)", fmt(m.speech_on) + "s", css("--reveal"));
        add("발화 오차", sgn(m.speech_err) + "s");
        add("립싱크 오프셋", m.av_offset == null ? "—" : sgn(m.av_offset * 1000, 0) + "ms");
        box.append(sel, kv, h("div", { class: "card", style: "padding:10px 12px" }, h("div", { class: "hint" }, "Whisper large-v3-turbo 전사"), h("div", { style: "font-size:1.05rem" }, "“" + m.transcript + "”")));
      } else {
        const tgt = dropOf(this.id) ?? C[r.cond].target;
        add("야경 리빌", fmt(m.t_reveal) + "s", css("--reveal"));
        add("모션 히트", fmt(m.t_hit) + "s", css("--hit"));
        add(tgt != null ? "리빌−목표" : "목표", tgt != null ? sgn(m.t_reveal - tgt) + "s" : "없음");
        add("출력 드롭", refOf(this.id) !== "—" ? fmt(m.out_drop) + "s" : "—", css("--good"));
        add("하드 컷", String(m.n_cuts));
        add("비트 위상 R", fmt(m.R_beat) + (m.p_beat < 0.05 ? " *" : ""));
        if (r.exp === 2) { add("첫 6초 줌인 비율", fmt(m.zoom_pos_first6)); add("카메라 속도 CV", fmt(m.cam_speed_cv)); }
        else { add("출력↔입력 오디오 r", refOf(this.id) !== "—" ? fmt(m.fidelity) : "—"); add("중복 프레임", Math.round(m.dup_rate * 100) + "%"); }
        box.append(sel, kv);
      }
      const leg = h("div", { class: "legend" });
      const li = (c, t, cls) => leg.append(h("span", {}, h("i", { class: cls || "", style: `background:${c};border-color:${c}` }), t));
      if (r.exp === 3) { li(css("--hit"), "노크(점선=목표, 실선=감지)", "ln"); li(css("--reveal"), "발화(점선=목표, 실선=감지)", "ln"); }
      else { li(css("--drop"), "입력 드롭/목표", "dash"); li(css("--good"), "출력 오디오 드롭", "dash"); li(css("--reveal"), "야경 리빌", "ln"); li(css("--hit"), "모션 히트", "ln"); li(css("--cut"), "하드 컷", "ln"); }
      this.below.innerHTML = "";
      this.below.append(leg, h("details", { class: "prompt" }, h("summary", {}, "이 조건의 프롬프트 원문"), h("pre", {}, C[r.cond].prompt)),
        h("div", { class: "hint mono" }, "Higgsfield job " + (r.job || "—")));
    }
  }

  function runPicker(cur, onPick) {
    const r = RUNS[cur];
    const condSel = h("select", { class: "s" }, condOrder.filter((c) => RUN_IDS.some((id) => RUNS[id].cond === c)).map((c) => h("option", { value: c, selected: c === r.cond ? "" : null }, `${c} · ${C[c].ko}`)));
    const modelSel = h("select", { class: "s" }, ["2.0", "2.5"].map((m) => h("option", { value: m, selected: m === r.model ? "" : null }, "Seedance " + m)));
    const repSel = h("select", { class: "s" }, [1, 2, 3].map((n) => h("option", { value: n, selected: n === r.rep ? "" : null }, "반복 #" + n)));
    const go = () => {
      let id = RUN_IDS.find((x) => RUNS[x].cond === condSel.value && RUNS[x].model === modelSel.value && RUNS[x].rep === +repSel.value);
      if (!id) id = RUN_IDS.find((x) => RUNS[x].cond === condSel.value && RUNS[x].model === modelSel.value) || RUN_IDS.find((x) => RUNS[x].cond === condSel.value);
      onPick(id);
    };
    [condSel, modelSel, repSel].forEach((s) => (s.onchange = go));
    return h("div", { class: "sel-grid" }, h("div", { style: "grid-column:1/-1" }, h("label", {}, "조건"), condSel), h("div", {}, h("label", {}, "모델"), modelSel), h("div", {}, h("label", {}, "반복"), repSel));
  }

  const explorer = new Explorer($("#explorer"));
  explorer.load(RUN_IDS.includes("E1-R8_r2") ? "E1-R8_r2" : RUN_IDS[0]);
  function openRun(id) { explorer.load(id, true); $("#player").scrollIntoView({ behavior: "smooth", block: "start" }); }
  document.addEventListener("keydown", (e) => {
    if (["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement.tagName)) return;
    const rect = $("#explorer").getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > window.innerHeight) return;
    if (e.code === "Space") { e.preventDefault(); explorer.toggle(); }
    if (e.code === "ArrowRight") { explorer.video.pause(); explorer.seek(explorer.video.currentTime + 1 / 24); }
    if (e.code === "ArrowLeft") { explorer.video.pause(); explorer.seek(explorer.video.currentTime - 1 / 24); }
  });
  document.querySelectorAll("[data-open]").forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); openRun(a.dataset.open); }));
  if (window.CONTENT) window.CONTENT(D, openRun);

  /* =====================================================================
     A/B COMPARE
     ===================================================================== */
  const cmpA = new Explorer(h("div"), { compact: true }), cmpB = new Explorer(h("div"), { compact: true });
  const colA = h("div", { class: "cmp-col" }), colB = h("div", { class: "cmp-col" });
  const headA = h("div", { class: "head" }), headB = h("div", { class: "head" });
  colA.append(headA, cmpA.root); colB.append(headB, cmpB.root);
  const PRESETS = [
    ["드롭 8초 vs 4초 (2.0)", "E1-R8_r2", "E1-R4_r2"],
    ["드롭 8초 vs 4초 (2.5)", "E1-R8_r1v25", "E1-R4_r1v25"],
    ["텍스트 타임스탬프 vs 오디오 (2.5)", "E1-TT_r1v25", "E1-R8_r1v25"],
    ["2.0 vs 2.5 (역할 매핑)", "E1-R8_r2", "E1-R8_r2v25"],
    ["비디오만 vs 비디오+오디오", "E2-V_r1", "E2-S_r1"],
    ["대괄호 문법 vs 대사 오디오", "E3-B_r1", "E3-A_r1"],
  ].filter((p) => RUNS[p[1]] && RUNS[p[2]]);
  const syncBtn = h("button", { class: "btn primary", onclick: () => { const play = cmpA.video.paused; [cmpA, cmpB].forEach((x) => { x.seek(0); play ? x.video.play() : x.video.pause(); }); } }, "▶ 둘 다 처음부터 동시 재생");
  const syncSeek = (src, dst) => src.svg.addEventListener("pointerup", () => dst.seek(src.video.currentTime));
  syncSeek(cmpA, cmpB); syncSeek(cmpB, cmpA);
  function loadPair(a, b) {
    cmpA.load(a); cmpB.load(b);
    headA.innerHTML = ""; headB.innerHTML = "";
    headA.append(runPicker(a, (id) => loadPair(id, cmpB.id)));
    headB.append(runPicker(b, (id) => loadPair(cmpA.id, id)));
  }
  $("#compare").append(h("div", { class: "presets" }, PRESETS.map(([l, a, b]) => h("button", { class: "btn sm", onclick: () => loadPair(a, b) }, l))),
    h("div", { style: "margin-bottom:10px" }, syncBtn, h("span", { class: "hint", style: "margin-left:10px" }, "한쪽 타임라인을 클릭하면 다른 쪽도 같은 시점으로 이동")),
    h("div", { class: "cmp-grid" }, colA, colB));
  if (PRESETS.length) loadPair(PRESETS[0][1], PRESETS[0][2]);

  /* =====================================================================
     GALLERY (scrub previews)
     ===================================================================== */
  const gal = $("#gallery"), galState = { exp: "all", model: "all" };
  function renderGallery() {
    gal.innerHTML = "";
    RUN_IDS.filter((id) => (galState.exp === "all" || RUNS[id].exp === +galState.exp) && (galState.model === "all" || RUNS[id].model === galState.model)).forEach((id) => {
      const r = RUNS[id], dd = dur(id), nT = dd * 2;
      const t = h("span", { class: "t" }, "0.0s"), bar = h("span");
      const sc = h("div", { class: "scrub", style: `background-image:url(media/strip/${id}.jpg);background-size:${nT * 100}% 100%` }, t, h("div", { class: "bar" }, bar));
      const evs = r.exp === 3 ? [[r.metrics.speech_on, css("--reveal")]] : [[dropOf(id) ?? C[r.cond].target, css("--drop")], [r.metrics.t_reveal, css("--reveal")]];
      evs.forEach(([tt, c]) => tt != null && sc.append(h("span", { class: "mk", style: `left:${(tt / dd) * 100}%;background:${c}` })));
      const setF = (f) => { const i = Math.max(0, Math.min(nT - 1, Math.floor(f * nT))); sc.style.backgroundPosition = `${(i / (nT - 1)) * 100}% 0`; t.textContent = (i / 2).toFixed(1) + "s"; bar.style.width = f * 100 + "%"; };
      sc.addEventListener("pointermove", (e) => { const rr = sc.getBoundingClientRect(); setF((e.clientX - rr.left) / rr.width); });
      sc.addEventListener("pointerleave", () => setF(0.5));
      setF(0.5);
      const m = r.metrics;
      const mline = r.exp === 3 ? (m.correct_line ? "✓ " : "✗ ") + `발화 ${fmt(m.speech_on)}s` : `리빌 ${fmt(m.t_reveal)}s · 컷 ${m.n_cuts}`;
      gal.append(h("div", { class: "gcard", onclick: () => openRun(id), title: "클릭하면 분석 플레이어로 열림" }, sc,
        h("div", { class: "gb" }, h("div", { class: "c" }, `${r.cond} · ${C[r.cond].ko}`),
          h("div", { class: "m" }, h("span", { class: "badge " + (r.model === "2.5" ? "m25" : "m20") }, r.model), ` #${r.rep} · ${mline}`))));
    });
  }
  $("#galFilters").append(
    seg([["all", "전체 실험"], ["1", "실험 1"], ["2", "실험 2"], ["3", "실험 3"]], "all", (v) => { galState.exp = v; renderGallery(); }),
    seg([["all", "두 모델"], ["2.0", "Seedance 2.0"], ["2.5", "Seedance 2.5"]], "all", (v) => { galState.model = v; renderGallery(); }),
    h("span", { class: "hint" }, "썸네일 위에서 마우스를 움직이거나 손가락으로 끌면 2fps 프레임 스크럽 · 클릭하면 분석 플레이어"));
  renderGallery();

  /* =====================================================================
     FIGURES
     ===================================================================== */
  const figs = [];
  function chartBox(id) { const el = $(id); return el; }
  function axisX(svg, x0, x1, y, d, X, step = 1) {
    for (let t = 0; t <= d + 1e-9; t += step) {
      svg.append(S("line", { x1: X(t), x2: X(t), y1: 8, y2: y, class: "gridl" }));
      svg.append(S("text", { x: X(t), y: y + 14, "text-anchor": "middle" }, t + "s"));
    }
  }

  /* Fig 1 — climax timing strip plot */
  function figClimax() {
    const box = chartBox("#figClimax"); if (!box) return;
    const state = figClimax.state || (figClimax.state = { k: "t_reveal" });
    box.innerHTML = "";
    const conds = ["E1-T", "E1-TT", "E1-N", "E1-R8", "E1-R4"];
    const W = 960, LW = 300, RW = 20, rowH = 30, top = 10;
    const rows = []; conds.forEach((c) => ["2.0", "2.5"].forEach((m) => rows.push([c, m])));
    const H = top + rows.length * rowH + 34;
    const X = (t) => LW + (t / 12) * (W - LW - RW);
    const svg = S("svg", { viewBox: `0 0 ${W} ${H}`, class: "chart" });
    axisX(svg, LW, W - RW, H - 26, 12, X);
    rows.forEach(([c, m], i) => {
      const y = top + i * rowH + rowH / 2;
      if (m === "2.0") {
        svg.append(S("rect", { x: 0, y: y - rowH / 2, width: W, height: rowH * 2, fill: i % 4 === 0 ? css("--grid") : "none" }));
        svg.append(S("text", { x: 4, y: y + 4, class: "lbl" }, `${c} ${C[c].ko}`));
        const tg = c === "E1-R4" ? 4 : C[c].target;
        if (tg != null) {
          svg.append(S("line", { x1: X(tg), x2: X(tg), y1: y - rowH / 2 + 2, y2: y + rowH * 1.5 - 2, stroke: css("--drop"), "stroke-width": 2, "stroke-dasharray": "5 4" }));
        }
      }
      svg.append(S("text", { x: LW - 8, y: y + 4, "text-anchor": "end", fill: MC(m), style: "font-family:var(--mono);font-size:11px;font-weight:700" }, m));
      svg.append(S("line", { x1: LW, x2: W - RW, y1: y, y2: y, stroke: css("--line"), "stroke-width": 1 }));
      const ids = RUN_IDS.filter((id) => RUNS[id].cond === c && RUNS[id].model === m);
      const ks = state.k === "both" ? ["t_reveal", "t_hit"] : [state.k];
      ks.forEach((k) => {
        const vals = ids.map((id) => RUNS[id].metrics[k]).filter((v) => v != null);
        if (vals.length) {
          const mu = vals.reduce((a, b) => a + b, 0) / vals.length;
          svg.append(S("line", { x1: X(mu), x2: X(mu), y1: y - 10, y2: y + 10, stroke: MC(m), "stroke-width": 3, "stroke-opacity": 0.55 }));
        }
        ids.forEach((id, j) => {
          const v = RUNS[id].metrics[k]; if (v == null) return;
          const hollow = k === "t_hit";
          const p = S("circle", { cx: X(v), cy: y + (j - 1) * 4, r: 6.5, fill: hollow ? css("--surface") : MC(m), stroke: MC(m), "stroke-width": hollow ? 2.2 : 1, class: "pt" });
          p.addEventListener("mousemove", (e) => showTip(e, `<b>${label(id)}</b><br>${k === "t_reveal" ? "야경 리빌" : "모션 히트"}: <b>${fmt(v)}s</b><br>클릭 → 분석 플레이어`));
          p.addEventListener("mouseleave", hideTip); p.addEventListener("click", () => { hideTip(); openRun(id); });
          svg.append(p);
        });
      });
    });
    const head = h("div", { class: "fig-head" }, h("div", { class: "fig-title" }, "클라이맥스가 터진 시점 (조건 × 모델 × 반복)"),
      seg([["t_reveal", "야경 리빌 (의미 지표)"], ["t_hit", "모션 히트 (모션 지표)"], ["both", "둘 다"]], state.k, (v) => { state.k = v; figClimax(); }));
    const leg = h("div", { class: "legend" },
      h("span", {}, h("i", { style: `background:${css("--m20")}` }), "Seedance 2.0"), h("span", {}, h("i", { style: `background:${css("--m25")}` }), "Seedance 2.5"),
      h("span", {}, h("i", { class: "dash", style: `border-color:${css("--drop")}` }), "목표 시점 (오디오 드롭 / 텍스트 지시)"),
      h("span", {}, "● = 리빌, ○ = 모션 히트, 굵은 세로선 = 평균"));
    box.append(head, h("div", { class: "scroll-x" }, h("div", { style: "min-width:780px" }, svg)), leg);
  }
  figs.push(figClimax);

  /* Fig 2 — motion envelopes small multiples */
  function figCurves() {
    const box = chartBox("#figCurves"); if (!box) return;
    const state = figCurves.state || (figCurves.state = { m: "both", s: "motion" });
    box.innerHTML = "";
    const conds = ["E1-T", "E1-TT", "E1-N", "E1-R8", "E1-R4"];
    const grid = h("div", { class: "grid-3" });
    conds.forEach((c) => {
      const W = 320, H = 150, P = 22, X = (t) => P + (t / 12) * (W - P - 6), Y = (v) => H - 20 - v * (H - 34);
      const svg = S("svg", { viewBox: `0 0 ${W} ${H}`, class: "chart" });
      for (let t = 0; t <= 12; t += 2) { svg.append(S("line", { x1: X(t), x2: X(t), y1: 8, y2: H - 20, class: "gridl" })); svg.append(S("text", { x: X(t), y: H - 6, "text-anchor": "middle" }, t)); }
      const ref = C[c].audio;
      if (ref !== "—") {
        const arr = D.refs[ref].rms, mx = Math.max(...arr);
        let p = `M${X(0)},${Y(0)}`; arr.forEach((v, i) => (p += `L${X(i / 12)},${Y(v / mx)}`)); p += `L${X((arr.length - 1) / 12)},${Y(0)}Z`;
        svg.append(S("path", { d: p, fill: css("--muted"), "fill-opacity": 0.18 }));
      }
      const tg = c === "E1-R4" ? 4 : C[c].target;
      if (tg != null) svg.append(S("line", { x1: X(tg), x2: X(tg), y1: 8, y2: H - 20, stroke: css("--drop"), "stroke-dasharray": "4 3", "stroke-width": 1.5 }));
      RUN_IDS.filter((id) => RUNS[id].cond === c && (state.m === "both" || RUNS[id].model === state.m)).forEach((id) => {
        const arr = RUNS[id].series[state.s === "blue" ? "blue" : "motion"], mx = Math.max(...arr, 1e-9);
        let p = ""; arr.forEach((v, i) => (p += (i ? "L" : "M") + X(i / 12).toFixed(1) + "," + Y(v / mx).toFixed(1)));
        const el = S("path", { d: p, fill: "none", stroke: MC(RUNS[id].model), "stroke-width": 1.6, "stroke-opacity": 0.85, class: "pt" });
        el.addEventListener("mousemove", (e) => showTip(e, `<b>${label(id)}</b><br>클릭 → 분석 플레이어`)); el.addEventListener("mouseleave", hideTip);
        el.addEventListener("click", () => openRun(id));
        svg.append(el);
      });
      grid.append(h("div", { class: "card", style: "padding:10px 12px" }, h("div", { style: "font-weight:700;font-size:.88rem" }, `${c} · ${C[c].ko}`), svg));
    });
    box.append(h("div", { class: "fig-head" }, h("div", { class: "fig-title" }, "조건별 시간 곡선 (각 선 = 영상 1개, 최대값 정규화)"),
      h("div", { style: "display:flex;gap:6px;flex-wrap:wrap" },
        seg([["motion", "모션 강도"], ["blue", "야경 노출"]], state.s, (v) => { state.s = v; figCurves(); }),
        seg([["both", "두 모델"], ["2.0", "2.0"], ["2.5", "2.5"]], state.m, (v) => { state.m = v; figCurves(); }))),
      grid, h("div", { class: "legend" }, h("span", {}, h("i", { style: `background:${css("--muted")};opacity:.4` }), "입력 오디오 RMS 엔벨로프"), h("span", {}, h("i", { class: "dash", style: `border-color:${css("--drop")}` }), "드롭/목표")));
  }
  figs.push(figCurves);

  /* Fig 3 — input drop vs output drop (re-timing) */
  function figRetime() {
    const box = chartBox("#figRetime"); if (!box) return;
    box.innerHTML = "";
    const ids = RUN_IDS.filter((id) => refOf(id) === "A_drop8" || refOf(id) === "A_drop4").filter((id) => RUNS[id].exp !== 3);
    const W = 900, LW = 200, rowH = 19, top = 8, H = top + ids.length * rowH + 30, X = (t) => LW + (t / 12) * (W - LW - 16);
    const svg = S("svg", { viewBox: `0 0 ${W} ${H}`, class: "chart" });
    axisX(svg, LW, W - 16, H - 22, 12, X);
    let lastC = null;
    ids.forEach((id, i) => {
      const r = RUNS[id], y = top + i * rowH + rowH / 2, d = dropOf(id), o = r.metrics.out_drop;
      if (r.cond !== lastC) { svg.append(S("line", { x1: 0, x2: W, y1: y - rowH / 2, y2: y - rowH / 2, stroke: css("--line") })); lastC = r.cond; }
      svg.append(S("text", { x: 4, y: y + 4, style: "font-size:10.5px", fill: css("--text-2") }, `${r.cond} · ${r.model} #${r.rep}`));
      svg.append(S("line", { x1: X(d), x2: X(o), y1: y, y2: y, stroke: MC(r.model), "stroke-width": 2, "stroke-opacity": 0.5 }));
      svg.append(S("path", { d: `M${X(d)},${y - 6}L${X(d) + 5},${y}L${X(d)},${y + 6}L${X(d) - 5},${y}Z`, fill: css("--drop") }));
      const p = S("circle", { cx: X(o), cy: y, r: 5.5, fill: MC(r.model), class: "pt" });
      p.addEventListener("mousemove", (e) => showTip(e, `<b>${label(id)}</b><br>입력 드롭 ${d}s → 출력 드롭 <b>${fmt(o)}s</b> (${sgn(o - d)}s)<br>엔벨로프 일치 r = ${fmt(r.metrics.fidelity)}<br>클릭 → 분석 플레이어`));
      p.addEventListener("mouseleave", hideTip); p.addEventListener("click", () => openRun(id));
      svg.append(p);
      svg.append(S("text", { x: W - 4, y: y + 4, "text-anchor": "end", style: "font-family:var(--mono);font-size:10px" }, Math.abs(o - d) < 0.3 ? "보존" : sgn(o - d, 1) + "s"));
    });
    box.append(h("div", { class: "fig-head" }, h("div", { class: "fig-title" }, "입력 오디오의 드롭(◆) → 생성된 영상 사운드트랙의 드롭(●)")),
      h("div", { class: "scroll-x" }, h("div", { style: "min-width:720px" }, svg)),
      h("div", { class: "legend" }, h("span", {}, h("i", { style: `background:${css("--drop")}` }), "입력 드롭"), h("span", {}, h("i", { style: `background:${css("--m20")}` }), "2.0 출력 드롭"), h("span", {}, h("i", { style: `background:${css("--m25")}` }), "2.5 출력 드롭"), h("span", {}, "오른쪽 숫자 = 이동량 (±0.3s 이내 = 보존)")));
  }
  figs.push(figRetime);

  /* Fig 4 — pooled beat-phase roses */
  function figBeat() {
    const box = chartBox("#figBeat"); if (!box) return;
    box.innerHTML = "";
    const conds = ["E1-T", "E1-TT", "E1-N", "E1-R8", "E1-R4", "E2-U", "E2-S", "E2-V"];
    const grid = h("div", { style: "display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px" });
    ["2.0", "2.5"].forEach((m) => conds.forEach((c) => {
      const b = ST.beat_pooled?.[m]?.[c]; if (!b) return;
      const W = 150, R0 = 52, cx = 75, cy = 66, mx = Math.max(...b.hist);
      const svg = S("svg", { viewBox: `0 0 ${W} 140`, class: "chart" });
      svg.append(S("circle", { cx, cy, r: R0, fill: "none", stroke: css("--line-2") }));
      svg.append(S("circle", { cx, cy, r: R0 / 2, fill: "none", stroke: css("--grid") }));
      b.hist.forEach((n, i) => {
        const a0 = (i / 12) * 2 * Math.PI - Math.PI / 2, a1 = ((i + 1) / 12) * 2 * Math.PI - Math.PI / 2, rr = (n / mx) * R0;
        svg.append(S("path", { d: `M${cx},${cy}L${cx + rr * Math.cos(a0)},${cy + rr * Math.sin(a0)}A${rr},${rr} 0 0 1 ${cx + rr * Math.cos(a1)},${cy + rr * Math.sin(a1)}Z`, fill: MC(m), "fill-opacity": 0.75, stroke: css("--surface"), "stroke-width": 0.8 }));
      });
      const am = (b.mu_ms / 500) * 2 * Math.PI - Math.PI / 2;
      svg.append(S("line", { x1: cx, y1: cy, x2: cx + b.R * R0 * Math.cos(am), y2: cy + b.R * R0 * Math.sin(am), stroke: css("--text"), "stroke-width": 2.5 }));
      svg.append(S("text", { x: cx, y: 10, "text-anchor": "middle", style: "font-size:9px" }, "박자 위"));
      svg.append(S("text", { x: cx, y: 136, "text-anchor": "middle", style: `font-size:10.5px;font-weight:${b.p < 0.05 ? 700 : 400};fill:${b.p < 0.05 ? css("--bad") : css("--muted")}` }, `R=${fmt(b.R)} p=${fmt(b.p, 3)} n=${b.n}`));
      grid.append(h("div", { class: "card", style: "padding:8px" }, h("div", { style: "font-size:.78rem;font-weight:700" }, h("span", { class: "badge " + (m === "2.5" ? "m25" : "m20") }, m), " ", c), svg));
    }));
    box.append(h("div", { class: "fig-head" }, h("div", { class: "fig-title" }, "시각 이벤트(모션 온셋+컷)의 0.5초 비트 위상 분포 — 조건별 풀링")), grid,
      h("div", { class: "legend" }, h("span", {}, "12시 방향 = 박자 정박. 막대 = 위상 히스토그램, 바늘 길이 = 위상 집중도 R (0=무작위, 1=완전 고정). 빨간 굵은 글씨 = Rayleigh p<0.05 (실험 2의 쏠림은 프레임 카덴스 아티팩트 — 본문 참고)")));
  }
  figs.push(figBeat);

  /* Fig 5 — E2 camera adherence */
  function figE2() {
    const box = chartBox("#figE2"); if (!box) return;
    const state = figE2.state || (figE2.state = { k: "zoom_pos_first6" });
    box.innerHTML = "";
    const conds = ["E2-V", "E2-U", "E2-S"], K = { zoom_pos_first6: ["첫 6초 중 줌인(전진) 프레임 비율", 1, D.refs.V1_dolly.zoom_pos], cam_speed_cv: ["카메라 속도 변동계수 (낮을수록 등속)", 2, D.refs.V1_dolly.cam_speed_cv], n_cuts: ["하드 컷 수", 3, 0] }[state.k];
    const W = 900, LW = 170, top = 10, rowH = 24, ids = RUN_IDS.filter((id) => conds.includes(RUNS[id].cond)).sort((a, b) => conds.indexOf(RUNS[a].cond) - conds.indexOf(RUNS[b].cond) || RUNS[a].model.localeCompare(RUNS[b].model) || RUNS[a].rep - RUNS[b].rep);
    const groups = [...new Set(ids.map((id) => RUNS[id].cond))];
    const H = top + ids.length * rowH + groups.length * 22 + 28, X = (v) => LW + (v / K[1]) * (W - LW - 60);
    const svg = S("svg", { viewBox: `0 0 ${W} ${H}`, class: "chart" });
    for (let i = 0; i <= 4; i++) { const v = (K[1] * i) / 4; svg.append(S("line", { x1: X(v), x2: X(v), y1: 6, y2: H - 22, class: "gridl" })); svg.append(S("text", { x: X(v), y: H - 8, "text-anchor": "middle" }, fmt(v, K[1] >= 2 ? 1 : 2))); }
    svg.append(S("line", { x1: X(K[2]), x2: X(K[2]), y1: 4, y2: H - 22, stroke: css("--drop"), "stroke-dasharray": "5 4", "stroke-width": 2 }));
    svg.append(S("text", { x: X(K[2]) - 4, y: 12, "text-anchor": "end", fill: css("--drop"), style: "font-size:10px;font-weight:700" }, "@Video1 원본 값 " + fmt(K[2])));
    let last = null, yy = top;
    ids.forEach((id) => {
      const r = RUNS[id], v = r.metrics[state.k];
      if (r.cond !== last) {
        yy += 22; svg.append(S("line", { x1: 0, x2: W, y1: yy - 20, y2: yy - 20, stroke: css("--text"), "stroke-width": 0.6 }));
        svg.append(S("text", { x: 4, y: yy - 6, class: "lbl" }, `${r.cond} · ${C[r.cond].ko}`)); last = r.cond;
      }
      const y = yy; yy += rowH;
      svg.append(S("text", { x: 4, y: y + 16, style: "font-size:10.5px", fill: css("--text-2") }, `Seedance ${r.model} · 반복 #${r.rep}`));
      const bar = S("rect", { x: LW, y: y + 5, width: Math.max(1, X(Math.min(v, K[1])) - LW), height: rowH - 10, rx: 4, fill: MC(r.model), "fill-opacity": 0.85, class: "pt" });
      bar.addEventListener("mousemove", (e) => showTip(e, `<b>${label(id)}</b><br>${K[0]}: <b>${fmt(v)}</b><br>클릭 → 분석 플레이어`)); bar.addEventListener("mouseleave", hideTip); bar.addEventListener("click", () => openRun(id));
      svg.append(bar, S("text", { x: X(Math.min(v, K[1])) + 5, y: y + 16, style: "font-family:var(--mono);font-size:10px" }, fmt(v)));
    });
    const strips = h("div", { style: "margin-top:14px" }, h("div", { class: "fig-title", style: "margin-bottom:6px" }, "필름스트립 (0.5초 간격) — @Video1의 박물관 복도가 새어 들어왔는지 육안 확인"),
      h("div", { class: "strip-row" }, h("div", { class: "lab" }, "@Video1 원본"), h("div", { class: "s", style: `background-image:url(media/strip/V1_dolly.jpg)` })),
      ids.map((id) => h("div", { class: "strip-row" }, h("div", { class: "lab" }, `${RUNS[id].cond} · ${RUNS[id].model} #${RUNS[id].rep}`), h("div", { class: "s", style: `background-image:url(media/strip/${id}.jpg)`, onclick: () => openRun(id) }))));
    box.append(h("div", { class: "fig-head" }, h("div", { class: "fig-title" }, K[0]),
      seg([["zoom_pos_first6", "돌리인 추종"], ["cam_speed_cv", "속도 안정성"], ["n_cuts", "컷 수"]], state.k, (v) => { state.k = v; figE2(); })),
      h("div", { class: "scroll-x" }, h("div", { style: "min-width:720px" }, svg)), strips);
  }
  figs.push(figE2);

  /* Fig 6 — E3 dialogue timing */
  function figE3() {
    const box = chartBox("#figE3"); if (!box) return;
    box.innerHTML = "";
    const ids = RUN_IDS.filter((id) => RUNS[id].exp === 3);
    const W = 960, LW = 150, RW = 290, rowH = 26, top = 18, H = top + ids.length * rowH + 26, X = (t) => LW + (t / 8) * (W - LW - RW);
    const svg = S("svg", { viewBox: `0 0 ${W} ${H}`, class: "chart" });
    for (let t = 0; t <= 8; t++) { svg.append(S("line", { x1: X(t), x2: X(t), y1: top - 6, y2: H - 22, class: "gridl" })); svg.append(S("text", { x: X(t), y: H - 8, "text-anchor": "middle" }, t + "s")); }
    [[1, "--hit", "노크 목표"], [4, "--reveal", "대사 목표"]].forEach(([t, c, l]) => { svg.append(S("line", { x1: X(t), x2: X(t), y1: top - 6, y2: H - 22, stroke: css(c), "stroke-dasharray": "5 4", "stroke-width": 2 })); svg.append(S("text", { x: X(t) + 3, y: top - 8, fill: css(c), style: "font-size:10px;font-weight:700" }, l)); });
    let last = null;
    ids.forEach((id, i) => {
      const r = RUNS[id], m = r.metrics, y = top + i * rowH + rowH / 2;
      if (r.cond !== last) { svg.append(S("line", { x1: 0, x2: W, y1: y - rowH / 2, y2: y - rowH / 2, stroke: css("--line") })); last = r.cond; }
      svg.append(S("text", { x: 4, y: y + 4, style: "font-size:10.5px", fill: css("--text-2") }, `${r.cond} · ${r.model} #${r.rep}`));
      if (m.speech_on != null) {
        const sp = S("rect", { x: X(m.speech_on), y: y - 7, width: X(m.speech_off ?? m.speech_on + 1) - X(m.speech_on), height: 14, rx: 4, fill: MC(r.model), "fill-opacity": m.correct_line ? 0.9 : 0.35, stroke: m.correct_line ? "none" : css("--bad"), "stroke-dasharray": "3 2", class: "pt" });
        sp.addEventListener("mousemove", (e) => showTip(e, `<b>${label(id)}</b><br>“${m.transcript}”<br>발화 ${fmt(m.speech_on)}–${fmt(m.speech_off)}s (오차 ${sgn(m.speech_err)}s)<br>${m.correct_line ? "✓ 대본과 일치" : "✗ 대본과 다른 대사"}`));
        sp.addEventListener("mouseleave", hideTip); sp.addEventListener("click", () => openRun(id)); svg.append(sp);
      }
      if (m.knock_t != null) svg.append(S("path", { d: `M${X(m.knock_t)},${y - 7}L${X(m.knock_t) + 6},${y}L${X(m.knock_t)},${y + 7}L${X(m.knock_t) - 6},${y}Z`, fill: css("--hit") }));
      svg.append(S("text", { x: W - RW + 10, y: y + 4, style: `font-size:11px;fill:${m.correct_line ? css("--good") : css("--bad")}` }, (m.correct_line ? "✓ " : "✗ ") + m.transcript));
    });
    box.append(h("div", { class: "fig-head" }, h("div", { class: "fig-title" }, "노크(◆)와 대사 구간(막대) — 실제 생성 위치 vs 목표")),
      h("div", { class: "scroll-x" }, h("div", { style: "min-width:780px" }, svg)),
      h("div", { class: "legend" }, h("span", {}, h("i", { style: `background:${css("--hit")}` }), "감지된 노크"), h("span", {}, h("i", { style: `background:${css("--m20")}` }), "2.0 발화 구간"), h("span", {}, h("i", { style: `background:${css("--m25")}` }), "2.5 발화 구간"), h("span", {}, "흐린 막대+빨간 점선 테두리 = 대본과 다른 대사"), h("span", {}, "오른쪽 = Whisper 전사")));
  }
  figs.push(figE3);

  /* Fig 7 — model comparison table */
  function figModel() {
    const box = chartBox("#figModel"); if (!box) return;
    box.innerHTML = "";
    const rows = ST.model_cmp || [];
    const tb = h("table", { class: "t" }, h("thead", {}, h("tr", {}, h("th", {}, "지표"), h("th", {}, "조건"), h("th", { style: "text-align:right" }, "2.0"), h("th", { style: "text-align:right" }, "2.5"), h("th", {}, "비교"), h("th", { style: "text-align:right" }, "p (순열)"))));
    const body = h("tbody");
    rows.forEach((r) => {
      const better = r.lower_better ? r.m25 < r.m20 : r.m25 > r.m20;
      const mx = Math.max(Math.abs(r.m20), Math.abs(r.m25), 1e-9);
      const bars = h("div", {}, h("div", { class: "mini-bar" }, h("span", { style: `width:${(Math.abs(r.m20) / mx) * 100}%;background:${css("--m20")}` })), h("div", { class: "mini-bar" }, h("span", { style: `width:${(Math.abs(r.m25) / mx) * 100}%;background:${css("--m25")}` })));
      body.append(h("tr", {}, h("td", {}, r.label, h("div", { class: "hint" }, r.lower_better ? "낮을수록 좋음" : "높을수록 좋음")), h("td", { class: "hint" }, r.conds.join(", ")),
        h("td", { class: "num" }, fmt(r.m20)), h("td", { class: "num", style: `font-weight:700;color:${better ? css("--good") : css("--bad")}` }, fmt(r.m25)),
        h("td", { class: "bar-cell" }, bars), h("td", { class: "num" }, fmt(r.p, 3))));
    });
    tb.append(body);
    box.append(h("div", { class: "fig-head" }, h("div", { class: "fig-title" }, "Seedance 2.0 vs 2.5 — 동일 프롬프트·동일 레퍼런스")), h("div", { class: "scroll-x" }, tb),
      h("div", { class: "legend" }, h("span", {}, "초록 굵은 숫자 = 2.5가 더 나은 방향, 빨강 = 2.0이 더 나은 방향. 각 셀은 해당 조건들의 모든 영상 평균. p = 두 모델 평균 차에 대한 정확 순열검정(양측)")));
  }
  figs.push(figModel);

  /* Fig 8 — frame cadence */
  function figCadence() {
    const box = chartBox("#figCadence"); if (!box) return;
    box.innerHTML = "";
    const ids = RUN_IDS.filter((id) => RUNS[id].exp !== 3);
    const W = 900, H = 150, X = (v) => 70 + v * (W - 100) / 0.35;
    const svg = S("svg", { viewBox: `0 0 ${W} ${H}`, class: "chart" });
    [0, 0.1, 0.2, 0.25, 0.3].forEach((v) => { svg.append(S("line", { x1: X(v), x2: X(v), y1: 10, y2: H - 26, class: "gridl" })); svg.append(S("text", { x: X(v), y: H - 10, "text-anchor": "middle" }, Math.round(v * 100) + "%")); });
    svg.append(S("line", { x1: X(0.25), x2: X(0.25), y1: 10, y2: H - 26, stroke: css("--warn"), "stroke-dasharray": "4 3", "stroke-width": 2 }));
    svg.append(S("text", { x: X(0.25) + 4, y: 18, fill: css("--warn"), style: "font-size:10px;font-weight:700" }, "18→24fps 풀다운 이론값 25%"));
    ["2.0", "2.5"].forEach((m, k) => {
      const y = 48 + k * 44;
      svg.append(S("text", { x: 4, y: y + 4, fill: MC(m), style: "font-family:var(--mono);font-weight:700;font-size:12px" }, "Seedance " + m));
      ids.filter((id) => RUNS[id].model === m).forEach((id, j) => {
        const v = RUNS[id].metrics.dup_rate; const p = S("circle", { cx: X(v), cy: y + ((j % 5) - 2) * 3.5, r: 5, fill: MC(m), "fill-opacity": 0.75, class: "pt" });
        p.addEventListener("mousemove", (e) => showTip(e, `<b>${label(id)}</b><br>중복 프레임 ${Math.round(v * 100)}%`)); p.addEventListener("mouseleave", hideTip); p.addEventListener("click", () => openRun(id));
        svg.append(p);
      });
    });
    box.append(h("div", { class: "fig-head" }, h("div", { class: "fig-title" }, "영상별 (거의) 동일한 연속 프레임 비율")), h("div", { class: "scroll-x" }, h("div", { style: "min-width:640px" }, svg)));
  }
  figs.push(figCadence);

  function redrawAll() { figs.forEach((f) => f()); explorer.draw(); cmpA.draw(); cmpB.draw(); }
  figs.forEach((f) => f());

  /* nav highlight */
  const links = [...document.querySelectorAll(".nav-links a")];
  const io = new IntersectionObserver((ents) => ents.forEach((e) => { if (e.isIntersecting) { links.forEach((l) => l.classList.toggle("active", l.getAttribute("href") === "#" + e.target.id)); } }), { rootMargin: "-45% 0px -50% 0px" });
  document.querySelectorAll("section.sec[id]").forEach((s) => io.observe(s));
})();
