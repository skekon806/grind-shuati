/* 刷题助手 · 模拟考试（经典脚本，按 index.html 中的顺序加载） */
/* =======================================================================
 * 模拟考试
 * ===================================================================== */
function allRefs(){
  const out = [];
  SECS.forEach(s => { const n = qsOf(s).length; for (let i = 0; i < n; i++) out.push({ sec: s, idx: i }); });
  return out;
}
function examSave(){ jsave(LS.exam(BANK.id), EXAM); }
function examClear(){ try { localStorage.removeItem(LS.exam(BANK.id)); } catch(e){} EXAM = null; }

function startExam(){
  const pool = allRefs();
  if (!pool.length){ toast("题库为空"); return; }
  shuffle(pool);
  const picked = pool.slice(0, Math.min(EXAM_SIZE, pool.length));
  EXAM = { refs: picked, ans: {}, startAt: now(), endAt: now() + EXAM_MINUTES * 60000,
           submitted: false, cur: 0, showAll: false };
  examSave();
  go("exam");
}
function examResume(){ if (EXAM) go("exam"); }

function stopTimer(){ if (ETIMER){ clearInterval(ETIMER); ETIMER = null; } }
function startTimer(){
  stopTimer();
  if (!EXAM || EXAM.submitted) return;
  tickClock();
  ETIMER = setInterval(tickClock, 1000);
}
function fmtClock(ms){
  if (ms < 0) ms = 0;
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  const pad = n => String(n).padStart(2, "0");
  return h > 0 ? h + ":" + pad(m) + ":" + pad(ss) : pad(m) + ":" + pad(ss);
}
function tickClock(){
  const el = document.getElementById("examClock");
  if (!EXAM || EXAM.submitted) return;
  const left = EXAM.endAt - now();
  if (el){
    el.textContent = fmtClock(left);
    el.className = "clock" + (left < 5 * 60000 ? " warn" : "");
  }
  if (left <= 0) submitExam(true);
}

function examAnsweredCount(){
  if (!EXAM) return 0;
  return EXAM.refs.reduce((n, _, i) => n + ((EXAM.ans[i] || []).length ? 1 : 0), 0);
}
function examPick(i){
  if (!EXAM || EXAM.submitted) return;
  const r = EXAM.refs[EXAM.cur];
  const it = BANK.secs[r.sec].questions[r.idx];
  const cur = EXAM.ans[EXAM.cur] || [];
  if (it.t === "multi"){
    const k = cur.indexOf(i);
    if (k >= 0) cur.splice(k, 1); else cur.push(i);
  } else {
    EXAM.ans[EXAM.cur] = (cur.length === 1 && cur[0] === i) ? [] : [i];
  }
  if (it.t === "multi") EXAM.ans[EXAM.cur] = cur;
  examSave();
  render();
}
function examGoto(i){
  if (!EXAM) return;
  EXAM.cur = Math.max(0, Math.min(EXAM.refs.length - 1, i));
  examSave();
  go("exam");
}
function examCheck(i){
  const r = EXAM.refs[i];
  const it = BANK.secs[r.sec].questions[r.idx];
  const mine = (EXAM.ans[i] || []).slice().sort((a, b) => a - b);
  const right = it.a.slice().sort((a, b) => a - b);
  return mine.length === right.length && mine.every((v, k) => v === right[k]);
}
function submitExam(auto){
  if (!EXAM || EXAM.submitted) return;
  const unanswered = EXAM.refs.length - examAnsweredCount();
  if (!auto && unanswered > 0 && !confirm("还有 " + unanswered + " 题未作答，确定交卷？")) return;
  let right = 0;
  EXAM.refs.forEach((r, i) => {
    const it = BANK.secs[r.sec].questions[r.idx];
    if (examCheck(i)) right++;
    else if ((EXAM.ans[i] || []).length) bump(qhash(it.q), false);   // 只把答错的记入错题本
  });
  EXAM.submitted = true;
  EXAM.usedMs = now() - EXAM.startAt;
  EXAM.right = right;
  EXAM.total = EXAM.refs.length;
  // 成绩历史（最多保留 30 次）
  const score = Math.round(right / EXAM.total * 100);
  PROG.exams = (PROG.exams || []).concat([{
    at: now(), score: score, right: right, total: EXAM.total, usedMs: EXAM.usedMs,
  }]).slice(-30);
  saveProg();
  examSave();
  stopTimer();
  go("examresult");
}

function viewExam(){
  if (!EXAM) return '<div class="empty">没有进行中的模考<br><br><button class="btn" data-act="home">返回首页</button></div>';
  if (EXAM.submitted) return viewExamResult();
  const i = EXAM.cur, n = EXAM.refs.length;
  const r = EXAM.refs[i];
  const it = BANK.secs[r.sec].questions[r.idx];
  const sel = EXAM.ans[i] || [];
  const done = examAnsweredCount();
  const badge = it.t === "multi" ? '<span class="badge multi">多选</span>' :
                it.t === "judge" ? '<span class="badge judge">判断</span>' : '<span class="badge">单选</span>';

  let html = '<div class="exambar"><div class="t">第 ' + (i + 1) + ' / ' + n + ' 题</div>' +
    '<div class="spacer"></div><div class="mini">已答 ' + done + '</div>' +
    '<div class="clock" id="examClock">--:--</div></div>';
  html += '<div class="bar small"><i style="width:' + Math.round(done / n * 100) + '%"></i></div>';
  html += '<div class="qcard" style="margin-top:12px">';
  html += '<div style="display:flex;gap:8px;align-items:center;margin-bottom:12px">' + badge +
          '<span class="mini">' + esc(r.sec) + '</span></div>';
  html += '<p class="stem">' + esc(it.q) + '</p><div class="opts">';
  it.o.forEach((o, k) => {
    const cls = "opt" + (sel.indexOf(k) >= 0 ? " sel" : "");
    const key = it.t === "judge" ? (k === 0 ? "√" : "×") : OPTKEY[k];
    html += '<div class="' + cls + '" data-act="examopt" data-v="' + k + '"><span class="k">' + key + '</span><span>' + esc(o) + '</span></div>';
  });
  html += '</div></div>';
  html += '<div class="row">' +
    '<button class="btn ghost" data-act="examprev"' + (i === 0 ? " disabled" : "") + '>上一题</button>' +
    '<button class="btn ghost" data-act="examcard">答题卡</button>' +
    '<button class="btn" data-act="examnext"' + (i === n - 1 ? " disabled" : "") + '>下一题</button>' +
  '</div>';
  html += '<div class="row"><button class="btn ghost danger" data-act="examsubmit">交卷</button></div>' +
    '<p class="mini" style="text-align:center;margin-top:10px">交卷后才显示答案与成绩</p>';
  return html;
}

function viewExamCard(){
  if (!EXAM) return '<div class="empty">没有进行中的模考</div>';
  let html = '<h1>答题卡</h1><p class="sub">已答 ' + examAnsweredCount() + ' / ' + EXAM.refs.length + ' 题，点击题号跳转。</p>';
  html += '<div class="cardgrid">';
  EXAM.refs.forEach((r, i) => {
    const cls = "cn" + ((EXAM.ans[i] || []).length ? " done" : "") + (i === EXAM.cur ? " cur" : "");
    html += '<div class="' + cls + '" data-act="examjump" data-v="' + i + '">' + (i + 1) + '</div>';
  });
  html += '</div><div class="row"><button class="btn" data-act="examback">继续答题</button>' +
          '<button class="btn ghost danger" data-act="examsubmit">交卷</button></div>';
  return html;
}

function viewExamResult(){
  if (!EXAM || !EXAM.submitted) return '<div class="empty">还没有成绩</div>';
  const total = EXAM.total || EXAM.refs.length;
  const right = EXAM.right || 0;
  const score = Math.round(right / total * 100);
  const unanswered = total - examAnsweredCount();
  const wrong = total - right;

  let html = '<div class="res" style="margin-top:16px">' +
    '<div class="big">' + score + '</div><div class="ttl">分</div>' +
    '<div class="desc">答对 ' + right + ' / ' + total + ' 题' + (unanswered ? '，未作答 ' + unanswered + ' 题' : '') + '</div>' +
    '<div class="hr"></div>' +
    '<div class="kv"><span>用时</span><b>' + fmtClock(EXAM.usedMs || 0) + '</b></div>' +
    '<div class="kv"><span>错题</span><b style="color:var(--bad)">' + wrong + ' 道（已记入错题本）</b></div>' +
  '</div>';

  html += '<div class="row">' +
    '<button class="btn" data-act="examtoggle">' + (EXAM.showAll ? "只看错题" : "查看全部解析") + '</button>' +
    '<button class="btn ghost" data-act="examagain">再来一次（新题）</button>' +
    '<button class="btn ghost" data-act="examclose">结束</button></div>';

  // 历史成绩
  const hist = (PROG.exams || []).slice(-8).reverse();
  if (hist.length){
    const best = Math.max.apply(null, (PROG.exams || []).map(h => h.score));
    html += '<h2 style="margin-top:20px">历史成绩</h2>';
    html += '<div class="gbox" style="padding:6px 14px">' +
      '<div class="kv"><span>最好成绩</span><b style="color:var(--ok)">' + best + ' 分</b></div>' +
      hist.map(h => '<div class="kv"><span>' + new Date(h.at).toLocaleString() + '</span><b>' +
        h.score + ' 分 <span class="mini">（' + h.right + '/' + h.total + '，' + fmtClock(h.usedMs) + '）</span></b></div>').join("") +
    '</div>';
  }

  const list = [];
  EXAM.refs.forEach((r, i) => {
    const ok = examCheck(i);
    if (!EXAM.showAll && ok) return;
    const it = BANK.secs[r.sec].questions[r.idx];
    const mine = EXAM.ans[i] || [];
    list.push('<div class="rev ' + (ok ? "ok" : "bad") + '">' +
      '<div class="mini" style="margin-bottom:6px">第 ' + (i + 1) + ' 题 · ' + esc(r.sec) +
        (ok ? ' <span style="color:var(--ok)">✔</span>' : ' <span style="color:var(--bad)">✘</span>') + '</div>' +
      '<div style="font-size:14.5px;line-height:1.6">' + esc(it.q) + '</div>' +
      it.o.map((o, k) => {
        const isRight = it.a.indexOf(k) >= 0, picked = mine.indexOf(k) >= 0;
        const color = isRight ? "color:var(--ok);font-weight:600" : (picked ? "color:var(--bad)" : "");
        const mark = (isRight ? "✔ " : (picked ? "✘ " : "")) + OPTKEY[k] + ". ";
        return '<div style="font-size:13.5px;margin-top:3px;' + color + '">' + mark + esc(o) + '</div>';
      }).join('') +
      '<div class="mini" style="margin-top:6px">你的答案：' + (mine.length ? mine.map(k => OPTKEY[k]).join("") : "未作答") +
        ' · 正确答案：<b>' + it.a.map(k => OPTKEY[k]).join("") + '</b></div>' +
    '</div>');
  });
  html += '<h2 style="margin-top:18px">' + (EXAM.showAll ? "全部解析" : "错题解析") + '</h2>';
  html += list.length ? list.join("") : '<div class="empty">全对，没有错题 🎉</div>';
  return html;
}

/* 模考首页（底部导航「模考」标签） */
function viewExamHome(){
  const exs = PROG.exams || [];
  const best = exs.length ? Math.max.apply(null, exs.map(h => h.score)) : null;
  const total = Math.min(EXAM_SIZE, bankTotal());
  let html = '<h1>模拟考试</h1><p class="sub">从当前题库全部板块随机抽题，限时 ' + EXAM_MINUTES +
    ' 分钟；答题过程中不显示对错，交卷后才出答案。</p>';

  html += '<div class="gbox" style="padding:14px 16px">' +
    '<div class="kv"><span>题量</span><b>' + total + ' 题（随机抽取）</b></div>' +
    '<div class="kv"><span>时长</span><b>' + EXAM_MINUTES + ' 分钟</b></div>' +
    '<div class="kv"><span>公布答案</span><b>交卷后</b></div>' +
    '<div class="kv"><span>错题处理</span><b>自动记入错题本</b></div>' +
  '</div>';
  html += '<div class="row"><button class="btn" data-act="examstart">开始模考</button></div>';

  if (EXAM && !EXAM.submitted){
    const left = Math.max(0, EXAM.endAt - now());
    html += '<div class="sec" data-act="examresume" style="border-color:#c9d8fb;margin-top:16px">' +
      '<div class="hd"><div class="nm">继续上次模考</div><div class="tag">剩余 ' + fmtClock(left) + '</div></div>' +
      '<div class="st" style="margin-top:6px">已答 ' + examAnsweredCount() + ' / ' + EXAM.refs.length + ' 题</div></div>';
  } else if (EXAM && EXAM.submitted){
    const sc = Math.round((EXAM.right || 0) / (EXAM.total || 1) * 100);
    html += '<div class="sec" data-act="examview" style="border-color:#bfe6d3;margin-top:16px">' +
      '<div class="hd"><div class="nm">上次模考成绩</div><div class="tag">' + sc + ' 分</div></div>' +
      '<div class="st" style="margin-top:6px">答对 ' + (EXAM.right || 0) + ' / ' + (EXAM.total || 0) +
      ' 题，点开看解析</div></div>';
  }

  if (exs.length){
    const hist = exs.slice(-8).reverse();
    html += '<h2 style="margin-top:22px">历史成绩</h2>';
    html += '<div class="gbox" style="padding:6px 16px">' +
      '<div class="kv"><span>最好成绩</span><b style="color:var(--ok)">' + best + ' 分</b></div>' +
      hist.map(h => '<div class="kv"><span>' + new Date(h.at).toLocaleString() + '</span><b>' + h.score +
        ' 分 <span class="mini">（' + h.right + '/' + h.total + '，' + fmtClock(h.usedMs) + '）</span></b></div>').join("") +
    '</div>';
  }
  return html;
}
