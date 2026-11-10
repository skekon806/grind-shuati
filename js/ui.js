/* 刷题助手 · 界面：路由/首页/事件（经典脚本，按 index.html 中的顺序加载） */

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
  else if (VIEW.name === "exam")   $app.innerHTML = viewExam();
  else if (VIEW.name === "examcard") $app.innerHTML = viewExamCard();
  else if (VIEW.name === "examresult") $app.innerHTML = viewExamResult();
  else if (VIEW.name === "import") $app.innerHTML = viewImport(false);
  else if (VIEW.name === "banks")  $app.innerHTML = viewImport(false);

  if (VIEW.name === "exam" && EXAM && !EXAM.submitted) startTimer();
  else stopTimer();
}

function bankBar(){
  const opts = META.list.map(b =>
    '<option value="' + esc(b.id) + '"' + (b.id === BANK.id ? " selected" : "") + '>' + esc(b.name) + '</option>'
  ).join("");
  return '<div class="bankbar">' +
    '<select class="sel" data-act="switch">' + opts + '</select>' +
    '<span class="cnt">' + bankTotal() + " 题</span>" +
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

  // 模拟考试
  const ex = EXAM;
  if (ex && !ex.submitted){
    const left = Math.max(0, ex.endAt - now());
    html += '<div class="sec" data-act="examresume" style="border-color:#c9d8fb">' +
      '<div class="hd"><div class="nm">继续上次模考</div><div class="tag">剩余 ' + fmtClock(left) + '</div></div>' +
      '<div class="st" style="margin-top:6px">已答 ' + examAnsweredCount() + ' / ' + ex.refs.length + ' 题</div></div>';
  } else if (ex && ex.submitted){
    const sc = Math.round((ex.right || 0) / (ex.total || 1) * 100);
    html += '<div class="sec" data-act="examview" style="border-color:#bfe6d3">' +
      '<div class="hd"><div class="nm">上次模考成绩</div><div class="tag">' + sc + ' 分</div></div>' +
      '<div class="st" style="margin-top:6px">答对 ' + (ex.right || 0) + ' / ' + (ex.total || 0) + ' 题，点开看解析</div></div>';
  } else {
    const exs = PROG.exams || [];
    const best = exs.length ? Math.max.apply(null, exs.map(h => h.score)) : null;
    html += '<div class="sec" data-act="examstart">' +
      '<div class="hd"><div class="nm">模拟考试</div>' +
      '<div class="tag">' + (exs.length ? "最好 " + best + " 分 · 已考 " + exs.length + " 次"
        : "随机 " + Math.min(EXAM_SIZE, bankTotal()) + " 题 · " + EXAM_MINUTES + " 分钟") + '</div></div>' +
      '<div class="st" style="margin-top:6px">交卷后才显示答案与成绩</div></div>';
  }

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
  if (act === "examstart"){
    if (EXAM && !EXAM.submitted && !confirm("已有未交卷的模考，重新开始会放弃当前进度，确定？")) return;
    startExam(); return;
  }
  if (act === "examresume"){ examResume(); return; }
  if (act === "examview"){ go("examresult"); return; }
  if (act === "examopt"){ examPick(+t.dataset.v); return; }
  if (act === "examprev"){ examGoto(EXAM.cur - 1); return; }
  if (act === "examnext"){ examGoto(EXAM.cur + 1); return; }
  if (act === "examcard"){ go("examcard"); return; }
  if (act === "examback"){ go("exam"); return; }
  if (act === "examjump"){ examGoto(+t.dataset.v); return; }
  if (act === "examsubmit"){ submitExam(false); return; }
  if (act === "examtoggle"){ EXAM.showAll = !EXAM.showAll; examSave(); go("examresult"); return; }
  if (act === "examagain"){ examClear(); startExam(); return; }
  if (act === "examclose"){ examClear(); go("home"); return; }
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
    localStorage.removeItem(LS.exam(id));
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
  if (VIEW.name === "exam"){
    if (k === "ArrowLeft"){ e.preventDefault(); examGoto(EXAM.cur - 1); return; }
    if (k === "ArrowRight"){ e.preventDefault(); examGoto(EXAM.cur + 1); return; }
    const uu = k.toUpperCase();
    if (KEYMAP[uu] !== undefined){ e.preventDefault(); examPick(KEYMAP[uu]); }
    return;
  }
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

