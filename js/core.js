/* 刷题助手 · 核心：常量/存储/题库/进度（经典脚本，按 index.html 中的顺序加载） */
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
  exam: id => "grind_exam_" + id,
};

const EXAM_SIZE = 100;
const EXAM_MINUTES = 60;

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
  EXAM = jload(LS.exam(id), null);
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
}function isWrong(qid){
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
let EXAM = null;
let ETIMER = null;
let VIEW = { name: "home" };
let TQ = null, TR = null;
function clearT(){ if (TQ){ clearTimeout(TQ); TQ = null; } if (TR){ clearTimeout(TR); TR = null; } }

function go(name, payload){ clearT(); VIEW = Object.assign({ name }, payload || {}); render(); window.scrollTo({ top: 0 }); }
