# grind-shuati

客服助理上岗资格证 · 刷题助手（纯前端，无后端）

- **在线使用**：https://skekon806.github.io/grind-shuati/
- **本地使用**：把 `index.html` 和 `bank.js` 放在同一目录，双击 `index.html`

## 功能

- 5 个板块：运营管理 / 零售 / 公司金融 / 零售信贷 / 反洗钱及安保
- 10 题一组，**必须全对**才算过；组内某题**连续答对 3 次**即跳出重复队列
- 每组共需完成 **3 次全对**（含首次），间隔按遗忘曲线：10 分钟 → 1 天 → 3 天
- 答题后自动跳转（对 0.6s / 错 1.4s），本组结束自动进入下一组或重做
- 键盘：`A–K` 选选项，`空格` 确认 / 跳过等待
- 错题本、进度导出 / 导入、冲刺模式

## 文件

| 文件 | 说明 |
|---|---|
| `index.html` | 界面（不含题目） |
| `bank.js` | 题库，447 题，结构见文件头注释 |
| `.nojekyll` | 让 GitHub Pages 跳过 Jekyll 处理 |

## 改题库

只需编辑 `bank.js`，`index.html` 不用动：

```js
window.BANK = {
  secs: {
    "运营管理": {
      weight: 33,
      questions: [
        { q: "题干", o: ["选项A", "选项B"], a: [0], t: "single", s: "来源" }
      ]
    }
  }
};
```

- `a` 是正确项下标数组（多选题给多个）
- `t` 取 `single` / `multi` / `judge`

## 进度存储

进度存在浏览器 `localStorage`（按域名隔离）。本地 `file://` 打开和 Pages 上的进度互不相通，可用「导出 / 导入」迁移。

## 更新题库后重新发布

```powershell
cd D:\Work\上柜\grind-shuati
copy ..\备考\刷题助手.html index.html -Force
copy ..\备考\bank.js bank.js -Force
git add -A
git commit -m "update bank"
git push
```

推送后 GitHub Pages 约 30 秒自动重建。
