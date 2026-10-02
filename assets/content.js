/* Narrative blocks. Every number is computed from data.json at runtime so prose and figures never disagree. */
window.CONTENT = function (D, openRun) {
  "use strict";
  const R = D.runs, C = D.conditions, ST = D.stats;
  const ids = Object.keys(R);
  const f = (v, d = 1) => (v === null || v === undefined || Number.isNaN(v) ? "—" : (+v).toFixed(d));
  const sg = (v, d = 1) => (v === null || v === undefined ? "—" : (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(+v).toFixed(d));
  const vals = (cond, k, model, abs) => ids.filter((i) => R[i].cond === cond && (!model || R[i].model === model)).map((i) => R[i].metrics[k]).filter((v) => typeof v === "number").map((v) => (abs ? Math.abs(v) : v));
  const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  const M = (cond, k, model, abs) => mean(vals(cond, k, model, abs));
  const Mm = (conds, k, model, abs) => mean(conds.flatMap((c) => vals(c, k, model, abs)));
  const cnt = (cond, model, pred) => ids.filter((i) => R[i].cond === cond && (!model || R[i].model === model) && pred(R[i].metrics)).length;
  const N = (cond, model) => ids.filter((i) => R[i].cond === cond && (!model || R[i].model === model)).length;
  const T = (model, k) => (ST.tests[model] || {})[k] || {};
  const p = (x) => (x === undefined || x === null ? "—" : x < 0.001 ? "<0.001" : x.toFixed(3));
  const link = (id, txt) => (R[id] ? `<a href="#player" data-run="${id}">${txt}</a>` : txt);
  const $ = (s) => document.querySelector(s);
  const set = (sel, html) => { const el = $(sel); if (el) el.innerHTML = html; };
  const dropT = (c) => (c === "E1-R4" ? 4 : 8);
  const preserved = (cond, model) => cnt(cond, model, (m) => m.out_drop != null && Math.abs(m.out_drop - dropT(cond)) < 0.3);
  const audioConds = ["E1-N", "E1-R8", "E1-R4", "E2-U", "E2-S"];
  const presTot = (model) => audioConds.reduce((s, c) => s + preserved(c, model), 0);
  const nTot = (model) => audioConds.reduce((s, c) => s + N(c, model), 0);
  const shift = (model, k = "t_reveal") => (M("E1-R8", k, model) ?? 0) - (M("E1-R4", k, model) ?? 0);
  const lagAfterDrop = (model) => mean([...vals("E1-R8", "t_reveal_err", model), ...vals("E1-R4", "t_reveal_err", model)]);
  const correct = (cond, model) => cnt(cond, model, (m) => m.correct_line);
  const beat = (m, c) => ((ST.beat_pooled || {})[m] || {})[c] || {};
  const fm = ST.frame_mod || {};
  const r4moved = ids.filter((i) => R[i].cond === "E1-R4" && R[i].metrics.out_drop != null && R[i].metrics.out_drop - 4 >= 0.3);
  const r4od = ids.filter((i) => R[i].cond === "E1-R4").map((i) => R[i].metrics.out_drop).filter((v) => v != null);
  const relOwn = (model) => {
    const sel = ids.filter((i) => ["E1-N", "E1-R8", "E1-R4"].includes(R[i].cond) && R[i].model === model && R[i].metrics.out_drop != null && R[i].metrics.t_reveal != null);
    return [mean(sel.map((i) => Math.abs(R[i].metrics.t_reveal - R[i].metrics.out_drop))), mean(sel.map((i) => Math.abs(R[i].metrics.t_reveal - dropT(R[i].cond))))];
  };
  const maxAudioR = Math.max(...["2.0", "2.5"].flatMap((m) => ["E1-N", "E1-R8", "E1-R4"].map((c) => beat(m, c).R || 0)));
  const nullR = (m) => Math.max(beat(m, "E1-T").R || 0, beat(m, "E2-V").R || 0);

  /* ---------------- abstract ---------------- */
  set("#abstract", `동일한 캐릭터·환경 이미지와 장면 문단을 고정하고, 오디오 레퍼런스의 유무·지시 방식·드롭 위치만 바꿔 Seedance 2.0과 2.5로 각 33편(총 ${ids.length}편)을 생성해 측정했습니다.
    <b>입력 오디오의 드롭을 8초에서 4초로 옮기자 영상의 클라이맥스(서울 야경 리빌)가 2.0에서는 평균 ${f(shift("2.0"))}초, 2.5에서는 ${f(shift("2.5"))}초 앞당겨졌습니다</b>(두 모델 합산 순열검정 p = ${p(T("all", "drop_shift_t_reveal").p)}). 오디오가 시간 구조에 인과적으로 영향을 준다는 핵심 주장은 지지되지만, 이동량은 4초에 못 미쳤고 클라이맥스는 드롭보다 평균 ${f(lagAfterDrop("2.0"))}초(2.0)·${f(lagAfterDrop("2.5"))}초(2.5) 늦었습니다.
    더 중요한 발견은 <b>모델이 넣은 음악을 그대로 쓰지 않는다</b>는 점입니다. 음악 레퍼런스를 넣은 영상 중 사운드트랙의 드롭이 입력 위치(±0.3초)에 남은 것은 ${presTot("2.0") + presTot("2.5")}/${nTot("2.0") + nTot("2.5")}편뿐이었고, 나머지는 같은 음색으로 곡을 다시 배치했습니다(드롭 4초 트랙은 ${r4moved.length}/${N("E1-R4")}편 모두 드롭이 뒤로 밀림).
    비트 단위의 컷·모션 동기화는 무음 대조군 수준을 넘지 않았고, 텍스트 타임스탬프(“정확히 8초에”)는 오디오와 통계적으로 구분되지 않을 만큼 정확했습니다.
    대사는 프롬프트에 적으면 ${correct("E3-B") + correct("E3-N")}/${N("E3-B") + N("E3-N")}편이 대본대로 말했지만, 대사를 오디오로 넣으면 2.0은 ${correct("E3-A", "2.0")}/${N("E3-A", "2.0")}, 2.5는 ${correct("E3-A", "2.5")}/${N("E3-A", "2.5")}편만 대본을 유지했습니다.
    결론적으로 <b>오디오 레퍼런스는 ‘마스터 클락’이 아니라 클라이맥스를 끌어당기는 ‘인력(引力)’이자 음색·에너지 레퍼런스</b>이며, 정밀한 타이밍은 텍스트로 이중 고정하는 편이 안전합니다.`);

  /* ---------------- findings ---------------- */
  const card = (c, tag, big, title, body) => `<div class="card finding" style="--c:${c}"><div class="tag">${tag}</div><div class="big">${big}</div><h4>${title}</h4><p>${body}</p></div>`;
  set("#findings", [
    card("var(--good)", "H1 · 부분 지지", `${sg(-shift("2.0"))}s · ${sg(-shift("2.5"))}s`, "드롭 4초 앞당김 → 클라이맥스 이동 (2.0 · 2.5)", `야경 리빌 평균이 2.0 ${f(M("E1-R8", "t_reveal", "2.0"))}→${f(M("E1-R4", "t_reveal", "2.0"))}초(3:3 완전 분리), 2.5 ${f(M("E1-R8", "t_reveal", "2.5"))}→${f(M("E1-R4", "t_reveal", "2.5"))}초. 방향은 일관되나 크기는 4초에 못 미치고, 2.5에서 더 약했습니다.`),
    card("var(--bad)", "새 발견", `${presTot("2.0") + presTot("2.5")}/${nTot("2.0") + nTot("2.5")}`, "입력 음악의 드롭이 출력 사운드트랙에 보존된 영상", "나머지는 같은 킥·라이저 음색으로 곡을 재배치했습니다. 원곡을 편집에서 다시 깔면 영상의 클라이맥스와 어긋날 수 있습니다."),
    card("var(--warn)", "H4 · 기각", `R ≤ ${f(maxAudioR, 2)}`, "‘비트마다 컷’ — 관찰되지 않음", `오디오 조건의 비트 위상 집중도는 무음 대조군(최대 R ${f(Math.max(nullR("2.0"), nullR("2.5")), 2)}) 이하였습니다. 유의하게 보인 쏠림은 오디오가 없어도 나타나는 3·4프레임 카덴스 아티팩트였습니다.`),
    card("var(--accent)", "H6 · 모델별로 다름", `2.0 ${correct("E3-A", "2.0")}/${N("E3-A", "2.0")} · 2.5 ${correct("E3-A", "2.5")}/${N("E3-A", "2.5")}`, "대사 오디오를 넣었을 때 대본 유지", `2.0은 매번 다른 문장을 지어냈고, 2.5는 내용을 지키되 목소리를 재합성하고 시점을 옮겼습니다. 텍스트로 쓴 대사는 두 모델 모두 ${correct("E3-B") + correct("E3-N")}/${N("E3-B") + N("E3-N")} 정확. [AUDIO: Xs] 문법의 이점은 없었습니다.`),
  ].join(""));

  /* ---------------- R1 ---------------- */
  const tt20 = M("E1-TT", "t_reveal_err", "2.0", true), tt25 = M("E1-TT", "t_reveal_err", "2.5", true);
  const r820 = M("E1-R8", "t_reveal_err", "2.0", true), r825 = M("E1-R8", "t_reveal_err", "2.5", true);
  const n20 = M("E1-N", "t_reveal_err", "2.0", true), n25 = M("E1-N", "t_reveal_err", "2.5", true);
  set("#r1text", `
    <p>각 영상에서 두 가지 ‘클라이맥스 시각’을 독립적으로 측정했습니다. <b>야경 리빌</b>은 화면에서 서울 야경(블루아워 청색)이 차지하는 비율이 가장 가파르게 늘어난 순간 — 프롬프트가 요구한 ‘클라이맥스의 의미적 사건’입니다. <b>모션 히트</b>는 옵티컬 플로우 모션 강도가 가장 급격히 상승한 순간입니다. 사전에 정한 2구간 변화점(t<sub>cp</sub>)은 ‘상승 후 하강’형 곡선에서 불안정해 보조 지표로 돌렸고, 이 결정은 결과를 본 뒤에 이뤄졌음을 밝힙니다.</p>
    <p><b>드롭 이동 검정(H1).</b> 2.0에서 리빌은 드롭 8초 조건 ${f(M("E1-R8", "t_reveal", "2.0"), 2)}초 → 드롭 4초 조건 ${f(M("E1-R4", "t_reveal", "2.0"), 2)}초로 이동했고(Δ ${sg(-shift("2.0"), 2)}초, 세 반복이 완전히 분리, 정확 순열 p = ${p(T("2.0", "drop_shift_t_reveal").p)} — n=3 대 3에서 가능한 최소값), 2.5에서는 ${f(M("E1-R8", "t_reveal", "2.5"), 2)} → ${f(M("E1-R4", "t_reveal", "2.5"), 2)}초(Δ ${sg(-shift("2.5"), 2)}초, p = ${p(T("2.5", "drop_shift_t_reveal").p)})였습니다. 두 모델 합산(6 대 6)은 p = ${p(T("all", "drop_shift_t_reveal").p)}, Cliff’s δ = ${f(T("all", "drop_shift_t_reveal").delta, 2)}. 모션 히트로 봐도 방향이 같았습니다(합산 Δ ${sg(T("all", "drop_shift_t_hit").diff, 2)}초, p = ${p(T("all", "drop_shift_t_hit").p)}).</p>
    <p><b>그러나 ‘마스터 클락’은 아니다.</b> 드롭 4초 조건에서 리빌은 드롭보다 평균 ${f(M("E1-R4", "t_reveal_err", "2.0"), 2)}초(2.0)·${f(M("E1-R4", "t_reveal_err", "2.5"), 2)}초(2.5) 늦었습니다. 장면 문단이 “점점 고조되다가 클라이맥스”를 요구하므로 모델은 클라이맥스를 드롭 쪽으로 <i>끌어당기되</i> 빌드업 시간을 포기하지는 않습니다. 2.5에서 이동이 약했던 이유는 3.2에서 보듯 2.5가 드롭 4초 트랙의 드롭을 자기 사운드트랙에서 ${ids.filter((i) => R[i].cond === "E1-R4" && R[i].model === "2.5").map((i) => f(R[i].metrics.out_drop, 1)).join("·")}초로 재배치했고, 영상이 그 재배치된 드롭을 따라갔기 때문으로 보입니다.</p>
    <p><b>텍스트 vs 오디오(H3).</b> 타이밍 지시가 전혀 없으면 리빌 시점은 넓게 흩어졌고(2.0 SD ${f((ST.by_cond["2.0"]["E1-T"].t_reveal || {}).sd, 1)}초), 모션 히트는 후반(2.0 ${f(M("E1-T", "t_hit", "2.0"), 1)}초, 2.5 ${f(M("E1-T", "t_hit", "2.5"), 1)}초)에 몰렸습니다. “정확히 8초에” 같은 <b>텍스트 타임스탬프는 오디오와 통계적으로 구분되지 않을 만큼 정확</b>했습니다(합산 p = ${p(T("all", "audio_vs_texttime_t_reveal").p)}). |리빌−8초| 평균: 텍스트 타임스탬프 ${f(tt20, 2)}초(2.0)·${f(tt25, 2)}초(2.5), 오디오+역할 매핑 ${f(r820, 2)}·${f(r825, 2)}초, 오디오+단순 지시 ${f(n20, 2)}·${f(n25, 2)}초. 2.0에서는 텍스트가 가장 정확했고, 2.5에서는 리빌 기준으로 역할 매핑 오디오가, 모션 히트 기준으로는 텍스트가 가장 정확했습니다. ${link("E1-TT_r1v25", "2.5 텍스트 타임스탬프 #1")}은 정확히 8.00초 프레임에서 컷과 함께 리빌이 일어납니다.</p>
    <p><b>역할 매핑 vs 단순 지시(H2).</b> 같은 A_drop8 오디오에서 역할 매핑 템플릿의 |리빌−8초|는 “Match the video to the music”보다 평균 ${f(-T("all", "role_vs_naive_t_reveal").diff, 2)}초 작았습니다(합산 p = ${p(T("all", "role_vs_naive_t_reveal").p)}, 모션 히트 기준으로는 차이 없음). 원 리포트의 권고와 방향은 같지만 효과는 작고 불확실합니다.</p>`);

  /* ---------------- R2 ---------------- */
  const retimed = ids.filter((i) => audioConds.includes(R[i].cond) && R[i].metrics.out_drop != null && Math.abs(R[i].metrics.out_drop - dropT(R[i].cond)) >= 0.3);
  const shifts = retimed.map((i) => R[i].metrics.out_drop - dropT(R[i].cond));
  const [own20, in20] = relOwn("2.0"), [own25, in25] = relOwn("2.5");
  const fid20 = Mm(["E1-N", "E1-R8", "E1-R4"], "fidelity", "2.0"), fid25 = Mm(["E1-N", "E1-R8", "E1-R4"], "fidelity", "2.5");
  set("#r2text", `
    <p><code>generate_audio=true</code>로 생성된 영상의 사운드트랙을 입력 오디오와 비교했습니다. 원 리포트가 가정한 “오디오를 영상의 타임라인으로 쓴다”와 달리, 모델은 입력 오디오를 <b>그대로 통과(pass-through)시키지 않고</b> 킥·스네어·라이저·코드의 음색을 차용해 <b>곡을 다시 생성</b>합니다. 그 과정에서 드롭이 이동합니다.</p>
    <p>음악 레퍼런스를 쓴 ${nTot("2.0") + nTot("2.5")}편 중 출력 드롭이 입력 위치 ±0.3초 이내였던 것은 ${presTot("2.0") + presTot("2.5")}편(2.0 ${presTot("2.0")}/${nTot("2.0")}, 2.5 ${presTot("2.5")}/${nTot("2.5")})이고, 이동한 경우 ${sg(Math.min(...shifts), 1)}~${sg(Math.max(...shifts), 1)}초 범위였습니다. 특히 <b>드롭 4초 트랙은 ${r4moved.length}/${N("E1-R4")}편 모두 드롭이 ${f(Math.min(...r4od), 1)}–${f(Math.max(...r4od), 1)}초로 밀렸습니다</b> — ‘짧은 인트로 + 긴 피크’ 구조를 ‘인트로 → 빌드 → 드롭’의 전형적 배치로 되돌리는 경향입니다. 입력↔출력 RMS 엔벨로프 상관(2초 창 평균)은 2.0 ${f(fid20, 2)}, 2.5 ${f(fid25, 2)}로 ${Math.abs(fid20 - fid25) < 0.05 ? "비슷했습니다" : fid25 > fid20 ? "2.5가 원곡을 조금 더 보존했습니다" : "2.0이 원곡을 조금 더 보존했습니다"}.</p>
    <p>그렇다면 영상은 어느 쪽에 맞춰졌을까요? 실험 1 오디오 조건에서 |리빌 − 자기 사운드트랙 드롭|은 2.0 ${f(own20, 2)}초 / 2.5 ${f(own25, 2)}초, |리빌 − 입력 드롭|은 2.0 ${f(in20, 2)}초 / 2.5 ${f(in25, 2)}초였습니다. ${own25 < in25 ? "2.5의 영상은 입력보다 <b>자기가 재작곡한 사운드트랙</b>에 더 가깝게 정렬됐고" : "2.5의 영상은 입력 오디오에 더 가까웠고"}, ${own20 < in20 ? "2.0도 자기 사운드트랙 쪽에 더 가까웠습니다" : "2.0은 오히려 입력 오디오 쪽에 더 가까웠습니다"}. 소리와 영상을 함께 생성하는 공동 생성 구조에서 ‘싱크’의 기준은 입력이 아니라 출력 사운드트랙이라는 해석과 일치합니다.</p>
    <div class="callout bad"><b>실무적 의미</b> — Suno 곡을 @Audio1로 넣고 편집에서 <i>원곡</i>을 다시 깔면, 영상의 클라이맥스는 원곡의 드롭이 아니라 <i>모델이 재작곡한 드롭</i>에 맞춰져 있을 수 있습니다. 생성 영상의 자체 사운드트랙(또는 리빌 시점)을 확인한 뒤 원곡을 그 위치에 맞춰 슬립하세요.</div>`);
  const specPairs = [["E1-R8_r2", "보존 사례 · 2.0 드롭 8초"], ["E1-R4_r1", "재작곡 사례 · 2.0 드롭 4초"], ["E1-R8_r2v25", "보존 사례 · 2.5 드롭 8초"], ["E1-R4_r1v25", "재작곡 사례 · 2.5 드롭 4초"]].filter(([i]) => R[i]);
  set("#specCmp", specPairs.map(([i, t]) => { const ref = C[R[i].cond].audio; return `<div class="card" style="padding:10px;cursor:pointer" data-run="${i}"><div style="font-weight:700;font-size:.86rem;margin-bottom:6px">${t} <span class="hint">· 출력 드롭 ${f(R[i].metrics.out_drop, 2)}s</span></div><div class="hint">입력 (${ref})</div><img class="spec-img" src="media/ref/${ref}.jpg" alt="입력 스펙트로그램" style="width:100%;height:60px;object-fit:fill;border-radius:6px" loading="lazy"><div class="hint" style="margin-top:4px">생성된 영상의 사운드트랙</div><img class="spec-img" src="media/s/${i}.jpg" alt="출력 스펙트로그램" style="width:100%;height:60px;object-fit:fill;border-radius:6px" loading="lazy"></div>`; }).join(""));

  /* ---------------- R3 ---------------- */
  const fmRow = (m) => ["6", "8", "11", "12", "13", "24"].map((P) => { const x = (fm[m] || {})[P] || {}; return `<td class="num" style="font-weight:${x.p < 0.05 ? 700 : 400};color:${x.p < 0.05 ? "var(--bad)" : "var(--muted)"}">${f(x.R, 3)}<br><span class="hint">p=${p(x.p)}</span></td>`; }).join("");
  set("#r3text", `
    <p>Reddit 글은 “Beat/Downbeat → 컷·카메라 전환”을 주장합니다. 모든 시각 이벤트(모션 온셋 + 하드컷) 시각을 0.5초 비트 주기에 대한 위상으로 바꿔 조건별로 모았습니다. 비트에 맞춰 편집됐다면 위상이 정박 근처로 몰려 R이 커져야 합니다. 오디오를 듣지 못한 조건(텍스트만, 비디오만)은 같은 그리드에 대한 <b>귀무 기준</b>입니다.</p>
    <p><b>결과:</b> 실험 1의 오디오 조건 R은 ${["2.0", "2.5"].map((m) => `${m}: ${["E1-N", "E1-R8", "E1-R4"].map((c) => f(beat(m, c).R, 2)).join(" / ")}`).join(", ")}로, 오디오를 듣지 않은 텍스트만 조건(2.0 ${f(beat("2.0", "E1-T").R, 2)}, 2.5 ${f(beat("2.5", "E1-T").R, 2)})보다 높지 않았습니다. 하드컷 자체도 드물었습니다(오디오 조건 영상당 ${f(Mm(["E1-N", "E1-R8", "E1-R4"], "n_cuts"), 2)}개) — 오디오가 있으면 Seedance는 컷보다 <b>원테이크 카메라 무브</b>로 에너지를 표현했습니다.</p>
    <p><b>함정:</b> 실험 2에서는 유의한 쏠림이 보였는데(2.0 역할 분리 R = ${f(beat("2.0", "E2-S").R, 2)}, p = ${p(beat("2.0", "E2-S").p)}), <b>오디오가 전혀 없는 ‘비디오만’ 조건에서 더 강했습니다</b>(2.0 R = ${f(beat("2.0", "E2-V").R, 2)}, p = ${p(beat("2.0", "E2-V").p)}). 위상 히스토그램을 보면 12칸 중 매 3번째 칸이 항상 비어 있습니다 — 프레임 번호 ≡ 2 (mod 3)인 위치에서는 온셋이 검출되지 않는다는 뜻으로, 생성 과정의 <b>프레임 카덴스(3·4프레임 단위 중복)</b> 구조입니다. 0.5초 = 12프레임이 3과 4의 배수라서 비트 그리드가 이 구조와 겹칩니다. 아래 표처럼 3·4와 약수를 공유하는 주기(6·8·12·24프레임)에서만 쏠림이 나오고, 서로소인 11·13프레임에서는 사라지는 것이 이를 확인합니다.</p>
    <div class="scroll-x"><table class="t" style="min-width:560px"><thead><tr><th>모델</th><th style="text-align:right">6프레임</th><th style="text-align:right">8</th><th style="text-align:right">11 (서로소)</th><th style="text-align:right">12 = 0.5s 비트</th><th style="text-align:right">13 (서로소)</th><th style="text-align:right">24</th></tr></thead>
    <tbody><tr><td><span class="badge m20">2.0</span></td>${fmRow("2.0")}</tr><tr><td><span class="badge m25">2.5</span></td>${fmRow("2.5")}</tr></tbody></table></div>
    <p class="hint">표: 모든 실험 1·2 영상의 시각 온셋 프레임 번호를 주기 P로 나눈 나머지의 Rayleigh R (빨간 굵은 값 = p&lt;0.05). 오디오와 무관한 생성 구조가 0.5초 그리드 분석을 오염시킬 수 있으므로, 비트 싱크 주장은 반드시 무음 대조군과 비교해야 합니다.</p>`);

  /* ---------------- R4 ---------------- */
  set("#r4text", `
    <p>무음 등속 돌리인(@Video1)과 120 BPM EDM(@Audio1)을 동시에 넣어 두 시간 레퍼런스를 경쟁시켰습니다. 지표는 <b>첫 6초 동안 카메라가 전진(줌인)한 프레임 비율</b>(원본 돌리 = 1.00)과 <b>카메라 속도 변동계수</b>(원본 = ${f(D.refs.V1_dolly.cam_speed_cv, 2)}, 낮을수록 등속)입니다.</p>
    <p><b>2.0: 충돌은 실재했고, 역할 분리 문구로 해소되지 않았다.</b> 비디오만 넣었을 때 첫 6초 줌인 비율은 ${f(M("E2-V", "zoom_pos_first6", "2.0"), 2)}였지만, 오디오를 함께 넣자 ${f(M("E2-U", "zoom_pos_first6", "2.0"), 2)}(역할 미분리)·${f(M("E2-S", "zoom_pos_first6", "2.0"), 2)}(역할 분리)로 떨어졌습니다(비디오만 vs 오디오 추가 p = ${p(T("2.0", "dolly_video_only_vs_with_audio").p)}). 원 리포트가 권한 “@Video1은 카메라만, @Audio1은 템포만, 경쟁 금지” 문구는 오히려 가장 낮았습니다(역할 분리 vs 미분리 p = ${p(T("2.0", "dolly_separated_vs_unseparated").p)}, δ = ${f(T("2.0", "dolly_separated_vs_unseparated").delta, 2)}).</p>
    <p><b>2.5: 역할 분리 문구가 효과를 냈다.</b> 2.5에서는 역할 분리 조건의 돌리인 추종이 ${f(M("E2-S", "zoom_pos_first6", "2.5"), 2)}로 세 조건 중 가장 높고 일관됐습니다(미분리 ${f(M("E2-U", "zoom_pos_first6", "2.5"), 2)}, 비디오만 ${f(M("E2-V", "zoom_pos_first6", "2.5"), 2)}). 비디오만 조건의 낮은 평균은 ${link("E2-V_r2v25", "한 반복")}이 ‘느린 단일 연속 무브’라는 스타일은 지키면서 <b>방향을 돌리아웃으로 뒤집어</b> 리빌 서사를 만족시킨 결과입니다 — 카메라 레퍼런스의 <i>방향</i>과 장면 서사(“야경을 드러내라”)가 경쟁할 때 서사가 이길 수 있습니다.</p>
    <p>두 모델 모두 박물관 복도·액자 등 @Video1의 <b>환경이 새어 들어온 사례는 18편 중 0편</b>이었습니다(아래 필름스트립으로 직접 확인 가능).</p>`);

  /* ---------------- R5 ---------------- */
  const e3 = (c, m, k, abs) => M(c, k, m, abs);
  set("#r5text", `
    <p>8초 미디엄 클로즈업에서 “1초에 노크, 4초에 대사”를 세 방식으로 지시했습니다: Reddit식 <code>[AUDIO: 1s]</code> 블록(B), 자연어 타임라인(N), 노크+TTS 대사를 담은 오디오 레퍼런스(A). 생성된 사운드트랙을 Whisper large-v3-turbo로 전사하고(대본 일치 = CER ≤ 0.3, ‘설마’→‘소마’ 같은 전사 오인식 허용), 발화 시작·노크 시각·입 벌림과 음성의 교차상관을 측정했습니다.</p>
    <div class="scroll-x"><table class="t" style="min-width:640px"><thead><tr><th>조건</th><th>모델</th><th style="text-align:right">대본 일치</th><th style="text-align:right">노크 (목표 1.0)</th><th style="text-align:right">발화 시작 (목표 4.0)</th><th style="text-align:right">|발화 오차|</th><th style="text-align:right">|립싱크 오프셋|</th></tr></thead><tbody>
    ${["E3-B", "E3-N", "E3-A"].flatMap((c) => ["2.0", "2.5"].map((m) => `<tr><td>${c} · ${C[c].ko}</td><td><span class="badge ${m === "2.5" ? "m25" : "m20"}">${m}</span></td><td class="num">${correct(c, m)}/${N(c, m)}</td><td class="num">${f(e3(c, m, "knock_t"), 2)}s</td><td class="num">${f(e3(c, m, "speech_on"), 2)}s</td><td class="num">${f(e3(c, m, "speech_err", true), 2)}s</td><td class="num">${f(e3(c, m, "av_offset", true) * 1000, 0)}ms</td></tr>`)).join("")}
    </tbody></table></div>
    <p><b>대사 내용.</b> 프롬프트에 대사를 적은 B·N은 ${correct("E3-B") + correct("E3-N")}/${N("E3-B") + N("E3-N")}편이 글자 그대로 말했습니다. 대사를 오디오로 넣은 A는 모델에 따라 정반대였습니다. <b>2.0은 ${N("E3-A", "2.0") - correct("E3-A", "2.0")}/${N("E3-A", "2.0")}편이 대본을 버리고</b> “저기 이거 집 앞에 묻혀도 돼요?”처럼 그럴듯한 다른 문장을 지어냈습니다(노크 음색만 복제). <b>2.5는 ${correct("E3-A", "2.5")}/${N("E3-A", "2.5")}편이 대본 내용을 유지</b>했지만, 입력 파형과의 상관은 최대 0.19로 통과가 아니라 <b>목소리를 새로 합성</b>했고 발화 시점도 입력보다 −0.5~+0.8초 이동했습니다.</p>
    <p><b>타이밍.</b> [AUDIO: Xs] 문법(B)과 자연어(N)의 |발화 오차|는 두 모델 합산 ${f(mean(vals("E3-B", "speech_err", null, true)), 2)}초 vs ${f(mean(vals("E3-N", "speech_err", null, true)), 2)}초로 유의한 차이가 없었습니다(p = ${p(T("all", "bracket_vs_natural_abs_speech_err").p)}). 자연어는 대사를 일관되게 <i>늦게</i>(평균 ${sg(M("E3-N", "speech_err"), 2)}초), 대괄호는 이르거나 늦게 배치했습니다. <b>노크(SFX) 타이밍은 모델 차이가 뚜렷</b>했습니다: 2.0은 평균 ${f(Mm(["E3-B", "E3-N"], "knock_t", "2.0"), 2)}초로 거의 항상 영상 시작 직후에 노크를 넣었고, 2.5는 ${f(Mm(["E3-B", "E3-N"], "knock_t", "2.5"), 2)}초로 1초 목표에 가까웠습니다(|오차| 2.0 ${f(Mm(["E3-B", "E3-N"], "knock_err", "2.0", true), 2)} vs 2.5 ${f(Mm(["E3-B", "E3-N"], "knock_err", "2.5", true), 2)}초). 오디오 레퍼런스(A)에서 2.5는 노크를 ${f(M("E3-A", "knock_t", "2.5"), 2)}초에 넣어 입력의 두 번 노크(1.00·1.20초)와 거의 일치했습니다.</p>
    <p><b>립싱크.</b> 발화 구간 안에서 입 벌림(MediaPipe)과 음성 엔벨로프의 교차상관 최대 지점은 2.0 평균 ±${f(Mm(["E3-B", "E3-N"], "av_offset", "2.0", true) * 1000, 0)}ms, 2.5 ±${f(Mm(["E3-B", "E3-N"], "av_offset", "2.5", true) * 1000, 0)}ms였습니다. 다만 상관 자체가 낮고(r ≈ 0.1–0.5), 3D 스타일 얼굴의 랜드마크 검출률이 고르지 않으며, 대사 직후의 ‘반응 표정’이 측정을 오염시켜(이를 피하려 창을 발화 구간으로 좁힌 것은 결과를 본 뒤의 결정) 이 수치는 거친 추정입니다. “밀리초 단위 립싱크”는 이 측정으로 확인되지 않습니다.</p>`);

  /* ---------------- R6 ---------------- */
  set("#r6text", `
    <p>동일한 프롬프트·레퍼런스·해상도로 Seedance 2.5(mode <code>omni_reference</code>)를 복제했습니다. 표의 각 셀은 해당 조건들의 모든 영상 평균입니다. 정리하면 <b>2.5는 레퍼런스의 ‘내용’(대사, 노크 SFX 타이밍, 역할 분리 시 카메라 무브)을 더 충실히 따르지만, 오디오 드롭에 클라이맥스를 맞추는 반응은 2.0보다 약했습니다</b> — 2.5는 자기 사운드트랙의 드롭을 관습적인 위치(8–9초 부근)로 재배치하는 경향이 더 강했습니다. 비트 단위 동기화와 출력 오디오 보존도는 두 모델이 비슷했습니다. 비용은 12초 기준 2.0 54크레딧, 2.5 84크레딧(+56%)입니다.</p>`);
  set("#cadText", `<p>옵티컬 플로우를 분석하다가, 일부 영상에서 <b>3~4프레임마다 직전 프레임과 거의 같은 프레임</b>이 끼어 있는 것을 발견했습니다(플로우 패턴 예: [1.0, 1.1, 2.2, 0.06] 반복). 저프레임으로 생성한 뒤 24fps로 올릴 때 생기는 풀다운 패턴과 일치하며, 비율이 25%에 가까울수록 클립 전체가 그런 카덴스입니다. 화면상 미세한 저더로 보이고, 옵티컬 플로우 슬로모션·리타임·비트 분석에 영향을 줍니다(3.3 참고). 실험 1·2 영상 기준 2.0 평균 ${f(mean(ids.filter((i) => R[i].model === "2.0" && R[i].exp !== 3).map((i) => R[i].metrics.dup_rate)) * 100, 0)}%, 2.5 평균 ${f(mean(ids.filter((i) => R[i].model === "2.5" && R[i].exp !== 3).map((i) => R[i].metrics.dup_rate)) * 100, 0)}%. 편집에서 프레임 보간(옵티컬 플로우 리타임)을 쓸 계획이라면 먼저 중복 프레임을 제거(decimate)하는 것이 좋습니다.</p>`);

  /* ---------------- verdict ---------------- */
  const V = (cls, t) => `<span class="pill ${cls}">${t}</span>`;
  const rows = [
    ["Audio input 지원, Text+Image+Video+Audio 동시 입력", "공식 확인", V("yes", "재현됨"), "이미지 2 + 비디오 1 + 오디오 1 조합이 두 모델 모두에서 정상 생성"],
    ["Audio가 motion rhythm에 영향", "공식 확인", V("yes", "지지"), `드롭 8→4초 이동 시 리빌 이동 (2.0 ${sg(-shift("2.0"), 1)}s, 2.5 ${sg(-shift("2.5"), 1)}s; 합산 p=${p(T("all", "drop_shift_t_reveal").p)})`],
    ["BGM/SFX/Voice와 영상 동기화", "공식 확인", V("part", "자기 사운드트랙과"), "영상은 함께 생성된 사운드트랙과 맞춰지지만, 입력 오디오의 타이밍이 보존된다는 뜻은 아님"],
    ["Audio를 Beat Sync용 reference로 활용", "공식 구조와 부합", V("part", "구간 단위만"), "빌드/드롭 같은 큰 구조는 반영. 비트 단위 컷·모션 위상 고정은 무음 대조군 이상으로 관찰되지 않음"],
    ["Audio를 Master Clock처럼 활용", "커뮤니티 테크닉", V("no", "과장"), `입력 드롭 보존 ${presTot("2.0") + presTot("2.5")}/${nTot("2.0") + nTot("2.5")}, 클라이맥스는 드롭보다 평균 ${f(mean([lagAfterDrop("2.0"), lagAfterDrop("2.5")]), 1)}s 늦음 — ‘클락’이 아니라 ‘인력’`],
    ["역할을 명시해야 한다 (vs ‘음악에 맞춰줘’)", "실무 노하우", V("part", "약한 지지"), `역할 매핑의 |리빌−드롭|이 ${f(-T("all", "role_vs_naive_t_reveal").diff, 2)}s 작음 (p=${p(T("all", "role_vs_naive_t_reveal").p)}), 모션 기준 차이 없음`],
    ["오디오가 텍스트보다 타이밍 통제에 유리", "(암묵적 전제)", V("no", "차이 없음"), `텍스트 타임스탬프와 오디오의 정렬 오차가 통계적으로 같음 (p=${p(T("all", "audio_vs_texttime_t_reveal").p)}); 2.0에선 텍스트가 가장 정확`],
    ["@Video1·@Audio1 역할 분리로 충돌 회피", "커뮤니티 가이드", V("part", "2.5만 효과"), `2.0: 오디오 추가 시 돌리 추종 하락, 역할 분리로 회복 안 됨. 2.5: 역할 분리 시 줌인 비율 ${f(M("E2-S", "zoom_pos_first6", "2.5"), 2)}로 최고`],
    ["Build/Drop 구간을 잘라 넣어라", "실무 노하우", V("part", "조건부"), `드롭이 클립 앞(4s)에 있으면 ${r4moved.length}/${N("E1-R4")}편 모두 드롭이 뒤로 재배치됨 → 드롭을 클립 중후반에 두는 편이 안전`],
    ["[AUDIO: Xs]가 공식 문법", "공식 확인 안 됨", V("no", "이점 없음"), "자연어 타임라인과 대사·노크 정확도 차이 없음. 대사 내용은 둘 다 정확"],
    ["대사 오디오로 립싱크", "테스트 가치", V("part", "2.5만 내용 유지"), `대본 유지 2.0 ${correct("E3-A", "2.0")}/${N("E3-A", "2.0")} · 2.5 ${correct("E3-A", "2.5")}/${N("E3-A", "2.5")}. 2.5도 목소리는 재합성, 시점은 이동`],
    ["밀리초 단위 립싱크 보장", "과장 가능성", V("no", "확인 안 됨"), "입-음성 정렬은 수십~수백 ms 수준의 거친 일치. ms 단위 보장 근거 없음"],
  ];
  set("#verdictTable", `<table class="t" style="min-width:720px"><thead><tr><th>주장</th><th>원 리포트 판단</th><th>실측 판정</th><th>근거</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${r[0]}</td><td class="hint">${r[1]}</td><td>${r[2]}</td><td style="font-size:.86rem;color:var(--text-2)">${r[3]}</td></tr>`).join("")}</tbody></table>`);

  /* ---------------- recommendations ---------------- */
  set("#recsText", `
    <p>원 리포트의 “REFERENCE ROLES + AUDIO-VISUAL CHOREOGRAPHY” 구조는 유지하되, 측정 결과를 반영해 <b>타이밍은 오디오에만 맡기지 말고 텍스트로 이중 고정</b>하고, 오디오는 음색·에너지·장르 레퍼런스로 쓰는 것을 권합니다.</p>
    <pre class="code">REFERENCE ROLES
@Image1: main character identity, clothing and appearance.
@Image2: environment and visual art direction.
@Video1: camera movement reference only. Do not copy its subject or environment.   ← 2.5에서 효과
@Audio1: musical style, instrumentation and energy reference.

SCENE
(장면 서술)

TIMING   ← 원곡의 드롭/악센트 시각을 직접 재서 초 단위로 적는다
0–6 s: calm, slow camera, small movements.
6–8 s: build-up, movements accelerate.
At exactly 8 seconds: the most dramatic camera move reveals the Seoul cityscape.
8–12 s: high energy.

AUDIO
Keep the arrangement of @Audio1: the drop lands at exactly 8 seconds.</pre>
    <div class="grid-2">
      <div class="card"><h4>① 드롭이 클립 중후반에 오도록 자른다</h4><p>드롭이 4초에 있는 트랙은 모든 반복에서 드롭이 6–9.5초로 재배치됐습니다. 12–15초를 자를 때 드롭이 6–9초에 오게 하세요.</p></div>
      <div class="card"><h4>② 생성 후 사운드트랙부터 확인</h4><p>입력 드롭이 그대로 남은 경우는 소수였습니다. 원곡을 다시 깔 계획이면 영상의 리빌/히트 시점을 보고 원곡을 슬립하세요(분석 플레이어의 ‘출력 드롭’ 마커 참고).</p></div>
      <div class="card"><h4>③ 비트 컷은 편집에서</h4><p>비트 단위 컷은 생성 단계에서 나오지 않았고, 오디오가 있으면 원테이크 무브가 늘었습니다. 몽타주는 짧은 샷 여러 개를 생성해 편집에서 비트에 맞추세요.</p></div>
      <div class="card"><h4>④ 대사는 텍스트로</h4><p>대사·노크는 자연어 타임라인으로 충분하고 [AUDIO: Xs] 문법의 이점은 없었습니다. 대사 오디오는 2.0에서 무시됐고, 2.5에서도 목소리가 재합성됩니다. 특정 녹음 목소리가 필요하면 생성 후 립싱크/더빙 도구를 쓰세요.</p></div>
      <div class="card"><h4>⑤ 카메라 레퍼런스 + 음악이면 2.5 + 역할 분리</h4><p>2.0은 오디오가 들어오면 돌리 카메라 언어를 잃었고 역할 분리 문구도 소용없었습니다. 2.5는 역할 분리 문구와 함께 돌리인을 가장 일관되게 유지했습니다.</p></div>
      <div class="card"><h4>⑥ 같은 프롬프트로 최소 3회</h4><p>같은 입력에서도 리빌 시점이 수 초 범위로 흩어졌습니다. 중요한 컷은 3회 이상 생성해 고르고, 2.0의 정밀 타이밍이 필요하면 텍스트 타임스탬프를 우선하세요.</p></div>
    </div>`);

  /* ---------------- limitations ---------------- */
  const m = D.meta;
  set("#limitsText", `
    <ul>
      <li><b>표본 크기.</b> 조건당 모델별 n=3(합산 6). 큰 효과의 방향은 신뢰할 만하지만 작은 효과는 검출력이 낮습니다. n=3 대 3 정확 순열검정의 최소 p는 0.05입니다. 모든 영상을 공개하고 점 단위로 표시한 이유입니다.</li>
      <li><b>시드 통제 불가.</b> Higgsfield의 Seedance 엔드포인트는 시드를 노출하지 않아, 반복 간 변동은 모델의 확률성과 서버측 변동을 모두 포함합니다.</li>
      <li><b>합성 자극.</b> 정답을 알기 위해 합성 EDM·노크·TTS를 썼고 120 BPM 한 가지 템포만 검증했습니다. 보컬이 있는 실제 곡(예: Suno)에서는 결과가 다를 수 있습니다.</li>
      <li><b>단일 장면.</b> ‘스튜디오 → 야경 리빌’ 한 장면만 썼습니다. 댄스·액션처럼 리듬적 움직임이 자연스러운 장면에서는 비트 동기화가 더 나타날 수 있습니다.</li>
      <li><b>자동 지표의 한계.</b> 야경 리빌(색 기반)·모션 히트(플로우 기반)는 클라이맥스의 대리 지표이며, 서로 독립적인 두 지표가 같은 방향의 결론을 낸다는 점으로 보완했습니다. 립싱크 측정은 거친 추정입니다.</li>
      <li><b>사후 결정의 공개.</b> 주 지표를 t<sub>cp</sub>에서 리빌/모션 히트로 바꾼 것, 출력 오디오 분석·카덴스 보정·프레임 주기 검정·립싱크 창 정제·대본 일치 기준(CER ≤ 0.3)은 결과를 본 뒤의 결정입니다(탐색적 분석으로 보세요). 프롬프트·조건·반복 수는 생성 전에 고정했습니다.</li>
      <li><b>플랫폼 의존성.</b> Higgsfield 경유 결과입니다. 2.0은 mode <code>std</code>, 2.5는 <code>omni_reference</code>로 모드 의미가 다릅니다. 2.5 생성 1건이 서버에서 실패해 같은 조건으로 재생성했습니다. 다른 플랫폼(Dreamina, BytePlus API)의 레퍼런스 처리와 다를 수 있습니다.</li>
    </ul>
    <h3>재현 정보</h3>
    <p>${m.models["2.0"]} / ${m.models["2.5"]}. 모든 영상의 Higgsfield job ID는 분석 플레이어 하단과 <a href="data/data.json">data.json</a>에 있습니다. 합성 오디오 생성 코드, 특징 추출(OpenCV Farnebäck, librosa), 지표·통계, 이 사이트의 원본은 같은 저장소의 <code>research/</code> 폴더에 공개되어 있습니다.</p>`);

  document.querySelectorAll("[data-run]").forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); openRun(a.dataset.run); }));
};
