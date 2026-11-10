"use strict";
/* =======================================================================
 * 刷题助手 · Grind
 * - 多题库：内置题库 + 导入 xlsx/xls/csv
 * - 10 题一组，全对过组，组内连对 3 次跳出重复队列
 * - 每组 3 次全对，按遗忘曲线复习
 * - 错题本：记录错误次数 / 连对清除 / 按板块重练
 * ===================================================================== */

/* ---------------- 常量 ---------------- */
const GSIZE = 10;
const PASS_TOTAL = 3;
const WRONG_CLEAR = 2;                       // 错题连对几次移出
const IV_STD = [10 * 60e3, 24 * 3600e3, 3 * 24 * 3600e3];
const IV_FAST = [60e3, 8 * 60e3, 20 * 60e3];
const OPTKEY = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const KEYMAP = (function(){
  const m = { "1":0,"2":1,"3":2,"4":3,"5":4,"6":5,"7":6,"8":7,"9":8,"0":9 };
  for (let i = 0; i < 26; i++) m[OPTKEY[i]] = i;
  return m;
})();
const LS = {
  banks: "grind_banks_v1",
  bank: id => "grind_bank_" + id,
  prog: id => "grind_prog_" + id,
};

/* ---------------- 小工具 ---------------- */
const $app = document.getElementById("app");
const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;" }[c]));
const now = () => Date.now();
function toast(msg){
  const t = document.getElementById("toast");
  t.textContent = msg; t.classList.add("show");
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("show"), 1600);
}
function fmtGap(ms){
  if (ms <= 0) return "现在";
  const m = Math.round(ms / 60000);
  if (m < 60) return m + " 分钟";
  const h = Math.round(m / 60);
  if (h < 24) return h + " 小时";
  return Math.round(h / 24) + " 天";
}
function fmtTime(ts){
  if (!ts) return "";
  const d = new Date(ts), n = new Date();
  const sameDay = d.toDateString() === n.toDateString();
  const hm = String(d.getHours()).padStart(2,"0") + ":" + String(d.getMinutes()).padStart(2,"0");
  return sameDay ? "今天 " + hm : (d.getMonth()+1) + "/" + d.getDate() + " " + hm;
}
function qhash(s){
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
function todayStr(){
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0");
}
function safeName(s){ return String(s || "题库").replace(/[\\/:*?"<>|]/g, "_").slice(0, 40); }
function download(text, filename, mime){
  const blob = new Blob([text], { type: mime || "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function countQ(secs){
  return Object.keys(secs || {}).reduce((n, s) => n + ((secs[s].questions || []).length), 0);
}
function shuffle(a){
  for (let i = a.length - 1; i > 0; i--){ const j = Math.floor(Math.random()*(i+1)); const t = a[i]; a[i] = a[j]; a[j] = t; }
  return a;
}
function jload(key, dft){ try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : dft; } catch(e){ return dft; } }
function jsave(key, val){
  try { localStorage.setItem(key, JSON.stringify(val)); return true; }
  catch(e){ toast("存储空间不足，导入题库可能太大"); return false; }
}

/* ---------------- 题库管理 ---------------- */
let META = jload(LS.banks, { active: null, list: [] });
// 清掉历史遗留的内置题库记录
META.list = (META.list || []).filter(b => !b.builtin && b.id !== "builtin");
if (!META.list.find(b => b.id === META.active)) META.active = META.list[0] ? META.list[0].id : null;

let BANK = null;          // { id, name, secs:{ name:{weight, questions:[...]} } }
let PROG = null;          // { mode, auto, g:{}, stats:{} }
let SECS = [];            // 板块名数组
let QIDX = {};            // qid -> {sec, idx, item}
let IMP_REPORT = "";      // 导入结果（持久显示，不随页面切换消失）

function bankMeta(id){ return META.list.find(b => b.id === id); }

function loadBank(id){
  const data = jload(LS.bank(id), null);
  if (!data) throw new Error("题库数据丢失");
  const secs = data.secs || {};
  const meta = bankMeta(id) || { id: id, name: id };
  BANK = { id: id, name: meta.name, secs: secs };
  SECS = Object.keys(secs);
  QIDX = {};
  SECS.forEach(s => (secs[s].questions || []).forEach((it, i) => {
    QIDX[qhash(it.q)] = { sec: s, idx: i, item: it };
  }));
  PROG = jload(LS.prog(id), null) || { mode: "std", auto: true, g: {}, stats: {} };
  if (!PROG.stats) PROG.stats = {};
  META.active = id; jsave(LS.banks, META);
}
function saveProg(){ jsave(LS.prog(BANK.id), PROG); }

function bankTotal(){ return SECS.reduce((n,s) => n + (BANK.secs[s].questions || []).length, 0); }
function qsOf(sec){ return (BANK.secs[sec] && BANK.secs[sec].questions) || []; }
function nGroups(sec){ return Math.max(1, Math.ceil(qsOf(sec).length / GSIZE)); }

/* ---------------- 进度 ---------------- */
const gkey = (sec, gi) => sec + "#" + gi;
function gst(sec, gi){
  const k = gkey(sec, gi);
  if (!PROG.g[k]) PROG.g[k] = { stage: 0, due: 0 };
  return PROG.g[k];
}
const IV = () => (PROG.mode === "fast" ? IV_FAST : IV_STD);
const autoOn = () => PROG.auto !== false;

function secStats(sec){
  const n = nGroups(sec), t = now();
  let mastered = 0, learning = 0, due = 0;
  for (let gi = 0; gi < n; gi++){
    const g = PROG.g[gkey(sec, gi)], stage = g ? g.stage : 0;
    if (stage >= PASS_TOTAL) mastered++;
    else if (stage > 0){ learning++; if (g.due && g.due <= t) due++; }
  }
  return { n, mastered, learning, due };
}
function statOf(qid){
  return PROG.stats[qid] || null;
}
function isWrong(qid){
  const st = PROG.stats[qid];
  return !!st && st.w > 0 && st.s < WRONG_CLEAR;
}
function wrongList(){
  return Object.keys(PROG.stats)
    .filter(isWrong)
    .map(qid => ({ qid: qid, st: PROG.stats[qid], ref: QIDX[qid] }))
    .filter(x => x.ref);
}
function bump(qid, ok){
  const st = PROG.stats[qid] || (PROG.stats[qid] = { w:0, r:0, s:0, lt:0 });
  if (ok){ st.r++; st.s++; } else { st.w++; st.s = 0; }
  st.lt = now();
  saveProg();
}

/* ---------------- 会话 ---------------- */
let SE = null;
let LAST = null;
let VIEW = { name: "home" };
let TQ = null, TR = null;
function clearT(){ if (TQ){ clearTimeout(TQ); TQ = null; } if (TR){ clearTimeout(TR); TR = null; } }

function go(name, payload){ clearT(); VIEW = Object.assign({ name }, payload || {}); render(); window.scrollTo({ top: 0 }); }

/* ---------------- 渲染 ---------------- */
function render(){
  if (!BANK){
    document.getElementById("hdrSub").textContent = "";
    $app.innerHTML = viewImport(true);
    return;
  }
  document.getElementById("hdrSub").textContent = " " + BANK.name;
  if (VIEW.name === "home")        $app.innerHTML = viewHome();
  else if (VIEW.name === "groups") $app.innerHTML = viewGroups(VIEW.sec);
  else if (VIEW.name === "quiz")   $app.innerHTML = viewQuiz();
  else if (VIEW.name === "result") $app.innerHTML = viewResult();
  else if (VIEW.name === "wrong")  $app.innerHTML = viewWrong();
  else if (VIEW.name === "import") $app.innerHTML = viewImport(false);
  else if (VIEW.name === "banks")  $app.innerHTML = viewImport(false);
}

function bankBar(){
  const opts = META.list.map(b =>
    '<option value="' + esc(b.id) + '"' + (b.id === BANK.id ? " selected" : "") + '>' + esc(b.name) + '</option>'
  ).join("");
  return '<div class="bankbar">' +
    '<select class="sel" data-act="switch">' + opts + '</select>' +
    '<span class="cnt">' + bankTotal() + " 题</span>" +
    '<button class="iconbtn" data-act="import">导入</button>' +
  '</div>';
}

function viewHome(){
  const wl = wrongList().length;
  let html = bankBar();
  html += '<h1>选择板块</h1><p class="sub">每组 ' + GSIZE + ' 题，必须全对才算过；组内某题连续答对 ' + PASS_TOTAL +
    ' 次即可跳出重复队列。每组共需完成 ' + PASS_TOTAL + ' 次全对（含首次），间隔按遗忘曲线安排。' +
    '<span class="kbd"><br><b>键盘：</b>A–Z 选选项，<b>空格</b> 确认 / 跳过等待。</span></p>';

  SECS.forEach(sec => {
    const st = secStats(sec), meta = BANK.secs[sec];
    const total = qsOf(sec).length;
    const pct = st.n ? Math.round(st.mastered / st.n * 100) : 0;
    html += '<div class="sec" data-act="open" data-sec="' + esc(sec) + '">' +
      '<div class="hd"><div class="nm">' + esc(sec) + '</div>' +
      '<div class="tag">' + total + ' 题 · ' + st.n + ' 组' + (meta.weight ? " · 占分 " + meta.weight + "%" : "") + '</div></div>' +
      '<div class="bar"><i style="width:' + pct + '%"></i></div>' +
      '<div class="st">' +
        '<span><i class="dotb d-mastered"></i>已掌握 <b>' + st.mastered + '</b>/' + st.n + '</span>' +
        '<span><i class="dotb d-learn"></i>进行中 <b>' + st.learning + '</b></span>' +
        '<span><i class="dotb d-due"></i>待复习 <b>' + st.due + '</b></span>' +
      '</div></div>';
  });

  html += '<div class="sec" data-act="wrong" style="border-color:#f5c2c4">' +
    '<div class="hd"><div class="nm">错题本</div><div class="tag">' + wl + ' 道待清除</div></div>' +
    '<div class="st" style="margin-top:6px">答错自动收录；连续答对 ' + WRONG_CLEAR + ' 次自动移出</div></div>';

  html += '<div class="settings"><h3>设置</h3>' +
    '<label class="chk"><input type="checkbox" data-act="auto" ' + (autoOn() ? "checked" : "") + '> 答题后自动跳转（对 0.6 秒 / 错 1.4 秒），结果页 1.6 秒后自动继续</label>' +
    '<label class="chk"><input type="checkbox" data-act="mode" ' + (PROG.mode === "fast" ? "checked" : "") + '> 冲刺模式：复习间隔 1 分钟 / 8 分钟 / 20 分钟</label>' +
    '<div class="row">' +
      '<button class="btn ghost" data-act="banks">题库管理</button>' +
      '<button class="btn ghost" data-act="import">导入题库</button>' +
      '<button class="btn ghost danger" data-act="reset">清空本库进度</button>' +
    '</div>' +
    '<p class="mini" style="margin-top:12px">进度按题库分别保存；换设备重新导入同一份题库即可继续（进度不会跟随）。</p>' +
  '</div>';
  return html;
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

/* ---------------- 错题本 ---------------- */
let WRONG_FILTER = "all";
function viewWrong(){
  const list = wrongList();
  const totalW = list.reduce((n,x) => n + x.st.w, 0);
  const near = list.filter(x => x.st.s === WRONG_CLEAR - 1).length;
  let html = '<h1>错题本</h1><p class="sub">答错自动收录，连续答对 ' + WRONG_CLEAR + ' 次自动移出。</p>';
  html += '<div class="statgrid">' +
    '<div class="c"><div class="v" style="color:var(--bad)">' + list.length + '</div><div class="l">待清除</div></div>' +
    '<div class="c"><div class="v">' + totalW + '</div><div class="l">累计答错</div></div>' +
    '<div class="c"><div class="v" style="color:var(--warn)">' + near + '</div><div class="l">差一次就清</div></div>' +
  '</div>';
  if (!list.length){
    return html + '<div class="empty">题库很干净 👍</div><div class="row"><button class="btn ghost" data-act="home">返回首页</button></div>';
  }
  const secs = Array.from(new Set(list.map(x => x.ref.sec)));
  html += '<div class="tabs"><span class="chip' + (WRONG_FILTER === "all" ? " on" : "") + '" data-act="wfilter" data-v="all">全部</span>';
  secs.forEach(s => {
    const n = list.filter(x => x.ref.sec === s).length;
    html += '<span class="chip' + (WRONG_FILTER === s ? " on" : "") + '" data-act="wfilter" data-v="' + esc(s) + '">' + esc(s) + ' ' + n + '</span>';
  });
  html += '</div>';

  const shown = WRONG_FILTER === "all" ? list : list.filter(x => x.ref.sec === WRONG_FILTER);
  shown.sort((a, b) => b.st.w - a.st.w || b.st.lt - a.st.lt);
  html += '<div class="row" style="margin-top:0"><button class="btn" data-act="wstart">重练这批（' + Math.min(shown.length, 20) + ' 题）</button></div>';
  shown.slice(0, 100).forEach(x => {
    const it = x.ref.item;
    html += '<div class="wq" data-act="wtoggle">' +
      '<div class="h"><span class="tag n">错 ' + x.st.w + ' 次</span><span class="tag">' + esc(x.ref.sec) + '</span>' +
      '<span class="tag">' + fmtTime(x.st.lt) + '</span>' +
      (x.st.s ? '<span class="tag">连对 ' + x.st.s + '/' + WRONG_CLEAR + '</span>' : '') + '</div>' +
      '<div class="q">' + esc(it.q) + '</div>' +
      '<div class="a">正确答案：<b>' + it.a.map(i => OPTKEY[i]).join("") + '</b>' +
        (it.t === "judge" ? '（' + it.a.map(i => it.o[i]).join("/") + '）' : '') +
        '<br>' + it.o.map((o, i) => OPTKEY[i] + ". " + esc(o)).join("<br>") + '</div>' +
    '</div>';
  });
  if (shown.length > 100) html += '<p class="mini">只显示前 100 道，重练不受影响。</p>';
  html += '<div class="row"><button class="btn ghost" data-act="home">返回首页</button>' +
    '<button class="btn ghost danger" data-act="wclear">清空错题本</button></div>';
  return html;
}

/* ---------------- 导入 ---------------- */
function viewImport(empty){
  const banks = META.list.length ? META.list.map(b => {
    const active = META.active === b.id;
    return '<div class="bankitem"><div><div class="nm">' + esc(b.name) + '</div>' +
      '<div class="meta">' + b.count + ' 题 · ' + (b.at ? new Date(b.at).toLocaleDateString() : "内置") + '</div></div>' +
      '<div class="act">' +
        (active ? '<span class="smallbtn on">使用中</span>'
                : '<button class="smallbtn" data-act="use" data-id="' + esc(b.id) + '">使用</button>') +
        '<button class="smallbtn" data-act="delbank" data-id="' + esc(b.id) + '">删除</button>' +
      '</div></div>';
  }).join("") : '<div class="mini" style="padding:8px 0">还没有导入任何题库</div>';

  let html = '<h1>' + (empty ? "导入题库开始刷题" : "题库管理") + '</h1>';
  html += '<p class="sub">支持 .xlsx / .xls / .csv。至少需要「题目」「答案」两列。选项可以是：①「选项A…选项Z」多列；②直接写在题目里（A. … B. …）；③塞在「选项」一列里。判断题选项可用 正确/错误。</p>';
  html += '<div class="drop" data-act="pick"><div class="big">📥</div><div class="t">点击选择文件，或把文件拖到这里</div>' +
          '<div class="s">支持 xlsx / xls / csv · 解析在本地完成，文件不会上传</div></div>';
  html += '<div id="impReport" class="report">' + IMP_REPORT + '</div>';
  html += '<h2>已有题库</h2><div class="gbox">' + banks + '</div>';
  if (!empty) html += '<div class="row"><button class="btn ghost" data-act="home">返回首页</button></div>';
  return html;
}

/* =======================================================================
 * 导入解析
 * ===================================================================== */
function parseWorkbook(rows){
  const cell = v => String(v == null ? "" : v).replace(/\s+/g, " ").trim();
  const norm = rows.map(r => r.map(cell));
  let hi = -1, map = null;
  for (let r = 0; r < Math.min(8, norm.length); r++){
    const c = norm[r];
    const hasQ = c.some(x => /^(题目|题干|问题|试题)/.test(x));
    const hasA = c.some(x => /^(答案|正确答案)/.test(x));
    if (hasQ && hasA){ hi = r; map = buildMap(c); break; }
  }
  if (hi < 0) throw new Error("没有找到表头：至少需要「题目」和「答案」两列");

  const out = [];
  const skipped = [];
  const secs = {};
  const seen = new Set();
  for (let r = hi + 1; r < norm.length; r++){
    const row = norm[r];
    if (!row.length || row.every(x => !x)) continue;
    const q = map.q >= 0 ? row[map.q] : "";
    const ansRaw = map.ans >= 0 ? row[map.ans] : "";
    const typeRaw = map.type >= 0 ? row[map.type] : "";
    const secRaw = map.sec >= 0 ? row[map.sec] : "";
    if (!q){ skipped.push({ row: r + 1, why: "题目为空" }); continue; }
    if (/^(序号|题目|题干)/.test(q)) continue;

    const opts = map.opts.map(o => row[o.i] || "");
    let pairs = [];
    map.opts.forEach((o, k) => { if (opts[k]) pairs.push({ letter: o.letter, text: opts[k] }); });

    // 选项也可能直接写在题目里（A. … B. …），或整列塞在一格里
    let inline = null;
    if (map.combined >= 0) inline = splitOptionsFromText(row[map.combined] || "", true);
    if (!inline) inline = splitOptionsFromText(q, false);
    if (!inline && pairs.length === 1) inline = splitOptionsFromText(pairs[0].text, true);

    let stem = q;
    if (inline && inline.opts.length >= 2){
      const ansLetters = (String(ansRaw).toUpperCase().match(/[A-Z]/g) || []);
      const need = ansLetters.length ? Math.max.apply(null, ansLetters.map(c => c.charCodeAt(0) - 65)) : -1;
      const useInline = pairs.length < 2 || inline.opts.length > pairs.length || need >= pairs.length;
      if (useInline){
        pairs = inline.opts.map((t, i) => ({ letter: OPTKEY[i], text: t }));
        if (!inline.empty) stem = inline.stem;
      }
    }

    if (pairs.length < 2){ skipped.push({ row: r + 1, why: "选项不足 2 个", q: q.slice(0, 30) }); continue; }

    const a = parseAnswer(ansRaw, pairs);
    if (!a || !a.length){ skipped.push({ row: r + 1, why: "答案无法解析：「" + ansRaw + "」", q: q.slice(0, 30) }); continue; }
    if (a.some(i => i >= pairs.length)){ skipped.push({ row: r + 1, why: "答案超出选项范围", q: q.slice(0, 30) }); continue; }

    let t = /多选/.test(typeRaw) ? "multi" : /判断/.test(typeRaw) ? "judge" : "single";
    if (t === "single" && a.length > 1) t = "multi";
    if (t === "judge" && pairs.length !== 2) t = a.length > 1 ? "multi" : "single";

    const key = stem.replace(/\s+/g, "");
    if (seen.has(key)){ skipped.push({ row: r + 1, why: "与前面重复", q: q.slice(0, 30) }); continue; }
    seen.add(key);

    const sec = secRaw || "未分类";
    (secs[sec] || (secs[sec] = [])).push({ q: stem, o: pairs.map(p => p.text), a, t, s: "" });
    out.push(1);
  }
  return { secs, total: out.length, skipped };
}

function buildMap(header){
  const m = { q: -1, ans: -1, type: -1, sec: -1, combined: -1, opts: [] };
  header.forEach((h, i) => {
    if (m.q < 0 && /^(题目|题干|问题|试题)/.test(h)) { m.q = i; return; }
    if (m.ans < 0 && /^(答案|正确答案)/.test(h)) { m.ans = i; return; }
    if (m.type < 0 && /^题型/.test(h)) { m.type = i; return; }
    if (m.sec < 0 && /(题库|分类|模块|类别|章节|科目)/.test(h)) { m.sec = i; return; }
    // 「选项」这一列里塞了 A. B. C. 多行选项
    if (m.combined < 0 && /^选项/.test(h) && !/[A-Z]/i.test(h.replace(/^选项/, ""))) { m.combined = i; return; }
    const lm = h.match(/^选项\s*([A-Z])/i) || h.match(/^([A-Z])$/i) || h.match(/^([A-Z])[\.、]/i);
    if (lm) m.opts.push({ i, letter: lm[1].toUpperCase() });
  });
  // 没有字母选项列时，把「答案」之后未使用的列当作 A/B/C…
  if (!m.opts.length && m.combined < 0){
    const used = new Set([m.q, m.ans, m.type, m.sec]);
    let L = 0;
    for (let i = 0; i < header.length && L < 26; i++){
      if (used.has(i) || !header[i]) continue;
      m.opts.push({ i, letter: OPTKEY[L++] });
    }
  }
  m.opts.sort((a, b) => a.letter.localeCompare(b.letter));
  return m;
}

/* 从一段文本里拆出「A. … B. … C. …」形式的选项 */
function splitOptionsFromText(text, allowNoStem){
  const s = String(text || "").replace(/\r/g, "\n").trim();
  if (!s) return null;
  const marks = [];
  let cursor = 0;
  for (let i = 0; i < 26; i++){
    const L = OPTKEY[i];
    const re = new RegExp("(^|[\\s；;。、,，：:（()）\\n])" + L + "\\s*[.、．)）]\\s*", "g");
    re.lastIndex = cursor;
    const m = re.exec(s);
    if (!m) break;
    if (m.index + m[0].length >= s.length) break;
    marks.push({ start: m.index + m[1].length, contentStart: re.lastIndex });
    cursor = re.lastIndex;
  }
  if (marks.length < 2) return null;
  const stem = s.slice(0, marks[0].start).trim();
  if (!allowNoStem && !stem) return null;
  const opts = [];
  for (let i = 0; i < marks.length; i++){
    const end = i + 1 < marks.length ? marks[i + 1].start : s.length;
    opts.push(s.slice(marks[i].contentStart, end).trim().replace(/[\s；;]+$/, ""));
  }
  if (opts.some(o => !o)) return null;
  return { stem: stem, opts: opts, empty: !stem };
}

function parseAnswer(raw, pairs){
  const s = String(raw || "").trim();
  if (!s) return null;
  // 判断题文字答案
  if (/^(正确|对|是|√|✓|T|TRUE|Y|YES)$/i.test(s)) return [0];
  if (/^(错误|错|否|×|✗|F|FALSE|N|NO)$/i.test(s)) return [1];
  // 字母答案 A / A,B,C / A、B
  const letters = (s.toUpperCase().match(/[A-Z]/g) || []);
  if (letters.length){
    const idx = [];
    letters.forEach(L => {
      const k = pairs.findIndex(p => p.letter === L);
      if (k >= 0 && idx.indexOf(k) < 0) idx.push(k);
    });
    return idx;
  }
  // 答案直接写选项内容
  const k = pairs.findIndex(p => p.text === s);
  return k >= 0 ? [k] : null;
}

function doImport(file){
  if (!file) return;
  if (!window.XLSX){
    document.getElementById("impReport").innerHTML = '<div class="bad">解析库没加载成功（vendor/xlsx.full.min.js）</div>';
    return;
  }
  const rep = document.getElementById("impReport");
  rep.innerHTML = '<div class="mini">正在解析…</div>';
  const reader = new FileReader();
  reader.onload = function(e){
    try{
      const wb = XLSX.read(new Uint8Array(e.target.result), { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" });
      const res = parseWorkbook(rows);
      if (!res.total) throw new Error("没有解析出任何题目");

      const id = "u" + now().toString(36);
      const name = file.name.replace(/\.(xlsx|xls|csv)$/i, "");
      const secNames = Object.keys(res.secs);
      const secs = {};
      secNames.forEach(s => { secs[s] = { weight: 0, count: res.secs[s].length, questions: shuffle(res.secs[s]) }; });

      const okSave = jsave(LS.bank(id), { secs: secs, at: now() });
      if (!okSave) return;
      META.list.push({ id: id, name: name, count: res.total, at: now() });
      META.active = id;
      jsave(LS.banks, META);

      let html = '<div class="ok">✔ 解析成功：<b>' + res.total + '</b> 题，' + secNames.length + ' 个板块</div>';
      html += '<div class="mini" style="margin-top:6px">' + secNames.map(s => esc(s) + " " + res.secs[s].length + " 题").join(" · ") + '</div>';
      if (res.skipped.length){
        html += '<div class="bad" style="margin-top:8px">跳过 ' + res.skipped.length + ' 行：</div><div class="mini">' +
          res.skipped.slice(0, 8).map(x => "第 " + x.row + " 行：" + esc(x.why) + (x.q ? "（" + esc(x.q) + "…）" : "")).join("<br>") +
          (res.skipped.length > 8 ? "<br>…" : "") + '</div>';
      }
      html += '<div class="row"><button class="btn" data-act="use" data-id="' + esc(id) + '">开始刷这套题</button>' +
              '<button class="btn ghost" data-act="pick">继续导入</button></div>';
      IMP_REPORT = html;                       // 持久保存，切页面也不会消失
      render();                                // 停在当前页，报告完整可见
      toast("导入成功：" + res.total + " 题");
    }catch(err){
      IMP_REPORT = '<div class="bad">导入失败：' + esc(err.message) + '</div>';
      render();
    }
  };
  reader.readAsArrayBuffer(file);
}

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

/* =======================================================================
 * 事件
 * ===================================================================== */
document.addEventListener("click", function(e){
  const t = e.target.closest("[data-act]");
  if (!t) return;
  const act = t.dataset.act;

  if (act === "home"){ SE = null; LAST = null; go("home"); return; }
  if (act === "open"){ go("groups", { sec: t.dataset.sec }); return; }
  if (act === "gstart"){ startGroup(t.dataset.sec, +t.dataset.gi); return; }
  if (act === "opt"){ choose(+t.dataset.v); return; }
  if (act === "submit"){ submit(); return; }
  if (act === "next"){ nextQ(); return; }
  if (act === "again"){ again(); return; }
  if (act === "nextgroup"){ startGroup(SE.sec, +t.dataset.gi, "learn"); return; }
  if (act === "quit"){ if (confirm("退出本组？这一遍的进度不保留。")){ SE = null; LAST = null; go("home"); } return; }
  if (act === "wrong"){ go("wrong"); return; }
  if (act === "wstart"){ startWrong(); return; }
  if (act === "wfilter"){ WRONG_FILTER = t.dataset.v; render(); return; }
  if (act === "wtoggle"){ t.classList.toggle("open"); return; }
  if (act === "wclear"){
    if (!confirm("清空错题本？已掌握记录不受影响。")) return;
    Object.keys(PROG.stats).forEach(k => { if (isWrong(k)) delete PROG.stats[k]; });
    saveProg(); render(); toast("已清空"); return;
  }
  if (act === "import"){ go("import"); return; }
  if (act === "banks"){ go("banks"); return; }
  if (act === "use"){ loadBank(t.dataset.id); go("home"); toast("已切换题库"); return; }
  if (act === "delbank"){
    const id = t.dataset.id;
    if (!confirm("删除这个题库？导入的题和进度都会一起删除。")) return;
    localStorage.removeItem(LS.bank(id));
    localStorage.removeItem(LS.prog(id));
    META.list = META.list.filter(b => b.id !== id);
    if (META.active === id) META.active = META.list[0] ? META.list[0].id : null;
    jsave(LS.banks, META);
    clearT(); SE = null; LAST = null;
    BANK = null; PROG = null;
    if (META.active){ try { loadBank(META.active); } catch(e){} }
    go("import"); toast("已删除"); return;
  }
  if (act === "pick"){
    const inp = document.createElement("input");
    inp.type = "file"; inp.accept = ".xlsx,.xls,.csv";
    inp.onchange = () => doImport(inp.files[0]);
    inp.click(); return;
  }
  if (act === "reset"){
    if (!confirm("清空当前题库的进度和错题本？不可恢复。")) return;
    PROG = { mode: PROG.mode, auto: PROG.auto, g: {}, stats: {} };
    saveProg(); go("home"); toast("已清空"); return;
  }
});

document.addEventListener("change", function(e){
  const t = e.target;
  if (!t.dataset) return;
  if (t.dataset.act === "mode"){ PROG.mode = t.checked ? "fast" : "std"; saveProg(); toast(PROG.mode === "fast" ? "已启用冲刺模式" : "已恢复标准间隔"); }
  if (t.dataset.act === "auto"){ PROG.auto = !!t.checked; saveProg(); toast(PROG.auto ? "已开启自动跳转" : "已关闭自动跳转"); }
  if (t.dataset.act === "switch"){ loadBank(t.value); go("home"); }
});

document.addEventListener("dragover", function(e){
  if (!e.dataTransfer) return;
  const d = e.target.closest(".drop");
  if (d){ e.preventDefault(); d.classList.add("hover"); }
});
document.addEventListener("dragleave", function(e){
  const d = e.target.closest(".drop");
  if (d) d.classList.remove("hover");
});
document.addEventListener("drop", function(e){
  const d = e.target.closest(".drop");
  if (!d) return;
  e.preventDefault(); d.classList.remove("hover");
  const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
  if (f) doImport(f);
});

document.addEventListener("keydown", function(e){
  const k = e.key;
  const isSpace = (k === " " || k === "Spacebar" || e.code === "Space");
  if (VIEW.name === "result"){
    if (isSpace || k === "Enter"){ e.preventDefault(); clearT(); autoCont(); }
    return;
  }
  if (VIEW.name !== "quiz") return;
  if (isSpace || k === "Enter"){
    e.preventDefault(); clearT();
    if (LAST) nextQ();
    else if (curItem().t === "multi") submit();
    return;
  }
  const u = k.toUpperCase();
  if (KEYMAP[u] !== undefined && !LAST){ e.preventDefault(); choose(KEYMAP[u]); }
});

/* ---------------- 启动 ---------------- */
(function boot(){
  const id = META.active;
  if (id && bankMeta(id)){
    try { loadBank(id); } catch(err){ console.error(err); BANK = null; }
  }
  render();
})();
