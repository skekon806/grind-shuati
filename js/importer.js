/* 刷题助手 · 导入：解析 Excel/CSV（经典脚本，按 index.html 中的顺序加载） */
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
  html += '<p class="sub">支持 .xlsx / .xls / .csv。至少需要「题目」「答案」两列，选项列写成「选项A…选项Z」；判断题选项可用 正确/错误。</p>';
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
    const pairs = [];
    map.opts.forEach((o, k) => { if (opts[k]) pairs.push({ letter: o.letter, text: opts[k] }); });
    if (pairs.length < 2){ skipped.push({ row: r + 1, why: "选项不足 2 个", q: q.slice(0, 30) }); continue; }

    const a = parseAnswer(ansRaw, pairs);
    if (!a || !a.length){ skipped.push({ row: r + 1, why: "答案无法解析：「" + ansRaw + "」", q: q.slice(0, 30) }); continue; }
    if (a.some(i => i >= pairs.length)){ skipped.push({ row: r + 1, why: "答案超出选项范围", q: q.slice(0, 30) }); continue; }

    let t = /多选/.test(typeRaw) ? "multi" : /判断/.test(typeRaw) ? "judge" : "single";
    if (t === "single" && a.length > 1) t = "multi";
    if (t === "judge" && pairs.length !== 2) t = a.length > 1 ? "multi" : "single";

    const key = q.replace(/\s+/g, "");
    if (seen.has(key)){ skipped.push({ row: r + 1, why: "与前面重复", q: q.slice(0, 30) }); continue; }
    seen.add(key);

    const sec = secRaw || "未分类";
    (secs[sec] || (secs[sec] = [])).push({ q, o: pairs.map(p => p.text), a, t, s: "" });
    out.push(1);
  }
  return { secs, total: out.length, skipped };
}

function buildMap(header){
  const m = { q: -1, ans: -1, type: -1, sec: -1, opts: [] };
  header.forEach((h, i) => {
    if (m.q < 0 && /^(题目|题干|问题|试题)/.test(h)) { m.q = i; return; }
    if (m.ans < 0 && /^(答案|正确答案)/.test(h)) { m.ans = i; return; }
    if (m.type < 0 && /^题型/.test(h)) { m.type = i; return; }
    if (m.sec < 0 && /(题库|分类|模块|类别|章节|科目)/.test(h)) { m.sec = i; return; }
    const lm = h.match(/^选项\s*([A-Z])/i) || h.match(/^([A-Z])$/i) || h.match(/^([A-Z])[\.、]/i);
    if (lm) m.opts.push({ i, letter: lm[1].toUpperCase() });
  });
  // 没有字母选项列时，把「答案」之后未使用的列当作 A/B/C…
  if (!m.opts.length){
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
