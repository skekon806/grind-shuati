/* 刷题助手 · 错题本（经典脚本，按 index.html 中的顺序加载） */
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

