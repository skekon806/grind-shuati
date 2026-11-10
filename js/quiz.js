/* 刷题助手 · 刷题：分组闯关 + 遗忘曲线（经典脚本，按 index.html 中的顺序加载） */
/* =======================================================================
 * 会话控制
 * ===================================================================== */
function refsOfGroup(sec, gi){
  const out = [], base = gi * GSIZE, end = Math.min(base + GSIZE, qsOf(sec).length);
  for (let i = base; i < end; i++) out.push({ sec, idx: i });
  return out;
}
function nextUnlearned(sec, cur){
  const n = nGroups(sec);
  for (let k = 1; k <= n; k++){
    const gi = (cur + k) % n;
    const g = PROG.g[gkey(sec, gi)];
    if (!g || g.stage === 0) return gi;
  }
  return -1;
}
function nextDue(sec){
  const n = nGroups(sec), t = now();
  for (let gi = 0; gi < n; gi++){
    const g = PROG.g[gkey(sec, gi)];
    if (g && g.stage > 0 && g.stage < PASS_TOTAL && g.due && g.due <= t) return gi;
  }
  return -1;
}
function startGroup(sec, gi, mode){
  const q = refsOfGroup(sec, gi);
  shuffle(q);
  SE = { mode: mode || (gst(sec, gi).stage > 0 ? "review" : "learn"),
         sec, gi, queue: q, qi: 0, streak: {}, wrong: 0, pass: 1, sel: [], result: null };
  LAST = null;
  go("quiz");
}
function startWrong(){
  const list = wrongList();
  const filtered = WRONG_FILTER === "all" ? list : list.filter(x => x.ref.sec === WRONG_FILTER);
  if (!filtered.length){ toast("没有错题"); return; }
  filtered.sort((a, b) => b.st.w - a.st.w);
  const picked = filtered.slice(0, 20);
  shuffle(picked);
  SE = { mode: "wrong", sec: picked[0].ref.sec, gi: 0,
         queue: picked.map(x => ({ sec: x.ref.sec, idx: x.ref.idx })),
         qi: 0, streak: {}, wrong: 0, pass: 1, sel: [], result: null };
  LAST = null;
  go("quiz");
}
function curRef(){ return SE.queue[SE.qi]; }
function curItem(){ const r = curRef(); return BANK.secs[r.sec].questions[r.idx]; }
function curQid(){ return qhash(curItem().q); }

function choose(i){
  if (LAST) return;
  const it = curItem();
  if (it.t === "multi"){
    const k = SE.sel.indexOf(i);
    if (k >= 0) SE.sel.splice(k, 1); else SE.sel.push(i);
    render();
  } else { SE.sel = [i]; submit(); }
}
function submit(){
  if (LAST) return;
  const it = curItem();
  if (!SE.sel.length) return;
  const ok = SE.sel.length === it.a.length && SE.sel.every(x => it.a.indexOf(x) >= 0);
  const qid = curQid();
  if (ok) SE.streak[qid] = (SE.streak[qid] || 0) + 1;
  else { SE.streak[qid] = 0; SE.wrong++; }
  bump(qid, ok);
  LAST = { ok };
  render();
  clearT();
  if (autoOn()) TQ = setTimeout(() => { TQ = null; if (VIEW.name === "quiz") nextQ(); }, ok ? 600 : 1400);
}
function nextQ(){
  if (!LAST || !BANK) return;
  clearT();
  LAST = null; SE.sel = [];
  SE.qi++;
  if (SE.qi >= SE.queue.length){ endPass(); return; }
  render();
}
function endPass(){
  const remain = SE.queue.filter(r => (SE.streak[qhash(BANK.secs[r.sec].questions[r.idx].q)] || 0) < PASS_TOTAL);
  const graduated = SE.queue.length - remain.length;
  if (SE.mode === "wrong"){
    SE.result = { ok: true, graduated };
    showResult();
    return;
  }
  if (SE.wrong === 0) applyPass(graduated);
  else { SE.result = { ok: false, wrong: SE.wrong, remain: remain.length, graduated }; showResult(); }
}
function applyPass(graduated){
  const st = gst(SE.sec, SE.gi);
  st.stage = Math.min(PASS_TOTAL, st.stage + 1);
  const ivs = IV();
  st.due = st.stage >= PASS_TOTAL ? 0 : now() + ivs[Math.min(st.stage - 1, ivs.length - 1)];
  saveProg();
  SE.stageAfter = st.stage; SE.dueAfter = st.due;
  SE.result = { ok: true, graduated };
  showResult();
}
function showResult(){
  go("result");
  if (autoOn()) TR = setTimeout(() => { TR = null; if (VIEW.name === "result") autoCont(); }, 1600);
}
function autoCont(){
  if (!BANK || !SE || !SE.result) return go("home");
  const r = SE.result;
  if (!r.ok) return again();
  if (SE.mode === "wrong") return go("wrong");
  if (SE.mode === "learn"){
    const nx = nextUnlearned(SE.sec, SE.gi);
    if (nx >= 0) return startGroup(SE.sec, nx, "learn");
  }
  const d = nextDue(SE.sec);
  if (d >= 0) return startGroup(SE.sec, d, "review");
  go("home");
}
function again(){
  if (!BANK || !SE) return;
  const remain = SE.queue.filter(r => (SE.streak[qhash(BANK.secs[r.sec].questions[r.idx].q)] || 0) < PASS_TOTAL);
  if (!remain.length) return toast("没有要重做的题");
  shuffle(remain);
  SE.queue = remain; SE.qi = 0; SE.wrong = 0; SE.pass++; SE.sel = []; LAST = null;
  go("quiz");
}

function viewGroups(sec){
  const st = secStats(sec);
  let html = '<h1>' + esc(sec) + '</h1><p class="sub">' + qsOf(sec).length + ' 题 / ' + st.n + ' 组 · 已掌握 ' +
    st.mastered + ' 组 · 待复习 ' + st.due + ' 组</p><div class="gbox"><div class="st" style="display:flex;gap:14px;font-size:12.5px;color:var(--muted)">' +
    '<span><i class="dotb d-new"></i>未开始</span><span><i class="dotb d-learn"></i>进行中</span>' +
    '<span><i class="dotb d-due"></i>可复习</span><span><i class="dotb d-mastered"></i>已掌握</span></div><div class="ggrid">';
  const t = now();
  for (let gi = 0; gi < st.n; gi++){
    const g = PROG.g[gkey(sec, gi)], stage = g ? g.stage : 0;
    let cls = "", label = "未开始";
    if (stage >= PASS_TOTAL){ cls = "mastered"; label = "已掌握"; }
    else if (stage > 0){
      if (g.due && g.due <= t){ cls = "due"; label = "可复习 " + stage + "/" + PASS_TOTAL; }
      else { cls = "learn"; label = "第 " + (stage + 1) + " 次"; }
    }
    html += '<div class="gc ' + cls + '" data-act="gstart" data-sec="' + esc(sec) + '" data-gi="' + gi + '">第 ' +
      (gi + 1) + ' 组<b>' + label + '</b></div>';
  }
  html += '</div></div><div class="row"><button class="btn ghost" data-act="home">返回首页</button></div>';
  return html;
}

/* ---------------- 答题 ---------------- */
function headHTML(){
  const title = SE.mode === "wrong" ? "错题重练" : esc(SE.sec) + " · 第 " + (SE.gi + 1) + " 组";
  return '<div class="qhead"><button class="iconbtn" data-act="quit">退出</button>' +
    '<div class="t">' + title + ' · 第 ' + SE.pass + ' 遍</div><div class="spacer"></div>' +
    '<div class="t">' + (SE.qi + 1) + '/' + SE.queue.length + '</div></div>' +
    '<div class="bar small"><i style="width:' + Math.round(SE.qi / SE.queue.length * 100) + '%"></i></div>';
}
function viewQuiz(){
  const ref = SE.queue[SE.qi];
  const it = BANK.secs[ref.sec].questions[ref.idx];
  const qid = qhash(it.q);
  const st = SE.streak[qid] || 0;
  const answered = !!LAST;
  const badge = it.t === "multi" ? '<span class="badge multi">多选</span>' :
                it.t === "judge" ? '<span class="badge judge">判断</span>' : '<span class="badge">单选</span>';
  let html = headHTML() + '<div class="qcard">';
  html += '<div style="display:flex;gap:8px;align-items:center;margin-bottom:12px">' + badge +
    (SE.mode === "wrong" ? '<span class="mini">连对 ' + st + '/' + WRONG_CLEAR + '</span>' :
     '<span class="mini">连对 ' + "●".repeat(Math.min(st, PASS_TOTAL)) + "○".repeat(Math.max(0, PASS_TOTAL - st)) + '（' + st + '/' + PASS_TOTAL + '）</span>') +
    '</div>';
  html += '<p class="stem">' + esc(it.q) + '</p><div class="opts">';
  it.o.forEach((o, i) => {
    let cls = "opt";
    if (answered){
      const isRight = it.a.indexOf(i) >= 0, picked = SE.sel.indexOf(i) >= 0;
      cls += isRight ? " right" : (picked ? " wrong" : " dim");
    } else if (SE.sel.indexOf(i) >= 0) cls += " sel";
    const key = it.t === "judge" ? (i === 0 ? "√" : "×") : OPTKEY[i];
    html += '<div class="' + cls + '" data-act="opt" data-v="' + i + '"><span class="k">' + key + '</span><span>' + esc(o) + '</span></div>';
  });
  html += '</div>';
  if (it.t === "multi" && !answered){
    html += '<div class="actions"><button class="btn" data-act="submit" ' + (SE.sel.length ? "" : "disabled") + '>提交答案</button></div>';
  }
  html += '<div class="fb ' + (answered ? (LAST.ok ? "good show" : "bad show") : "") + '">' +
    (answered ? (LAST.ok ? "✔ 正确" : "✘ 错误，正确答案：<span class='ans'>" + it.a.map(i => OPTKEY[i]).join("") + "</span>") +
      '<div class="src">' + esc(ref.sec) + (it.s ? " · 来源：" + esc(it.s) : "") + '</div>' : '') + '</div>';
  html += '</div>';
  if (answered) html += '<div class="actions"><button class="btn ok" data-act="next">' +
    (SE.qi + 1 >= SE.queue.length ? "完成本遍" : "下一题") + '<span class="kbd">（空格）</span></button></div>';
  return html;
}

function viewResult(){
  const r = SE.result;
  if (SE.mode === "wrong"){
    return '<div class="res"><div class="big">🧹</div><div class="ttl">错题重练完成</div>' +
      '<div class="desc">连对 ' + WRONG_CLEAR + ' 次的题已移出错题本</div><div class="hr"></div>' +
      '<div class="kv"><span>剩余错题</span><b>' + wrongList().length + ' 道</b></div></div>' +
      '<div class="row"><button class="btn" data-act="wrong">回错题本</button><button class="btn ghost" data-act="home">首页</button></div>';
  }
  let html = '<div class="res">';
  if (r.ok){
    html += '<div class="big">🎉</div><div class="ttl">本组通过</div><div class="desc">' + esc(SE.sec) + ' · 第 ' + (SE.gi+1) + ' 组</div>';
    html += '<div class="hr"></div><div class="kv"><span>完成第几次</span><b>' + SE.stageAfter + ' / ' + PASS_TOTAL + '</b></div>';
    if (SE.stageAfter >= PASS_TOTAL) html += '<div class="kv"><span>状态</span><b style="color:var(--ok)">已掌握 ✓</b></div>';
    else html += '<div class="kv"><span>下次复习</span><b>' + fmtGap(SE.dueAfter - now()) + '后</b></div>';
    if (r.graduated) html += '<div class="kv"><span>本组跳出队列</span><b>' + r.graduated + ' 题</b></div>';
  } else {
    html += '<div class="big">🔁</div><div class="ttl">第 ' + SE.pass + ' 遍结束</div><div class="desc">错 ' + r.wrong + ' 题，需要重做本组</div>';
    html += '<div class="hr"></div><div class="kv"><span>待重做</span><b>' + r.remain + ' 题</b></div>' +
            '<div class="kv"><span>本组已跳出</span><b>' + r.graduated + ' 题</b></div>';
  }
  html += '</div><div class="row">';
  if (!r.ok) html += '<button class="btn" data-act="again">开始第 ' + (SE.pass + 1) + ' 遍</button>';
  else {
    const next = nextUnlearned(SE.sec, SE.gi);
    if (next >= 0) html += '<button class="btn" data-act="nextgroup" data-gi="' + next + '">下一组</button>';
    html += '<button class="btn ghost" data-act="open" data-sec="' + esc(SE.sec) + '">回组列表</button>';
  }
  html += '<button class="btn ghost" data-act="home">首页</button></div>';
  if (autoOn()) html += '<p class="mini" style="text-align:center;margin-top:14px">1.6 秒后自动继续<span class="kbd">（按 空格 立即继续）</span></p>';
  return html;
}

