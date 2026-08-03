/* 全网实时热榜抓取器 —— 供 GitHub Actions 定时运行，输出 hotlist.json
 * 纯前端 PWA 无法跨域抓取，故用仓库 Actions（服务器端）每30分钟抓取一次，
 * Push 到 main 分支后由 GitHub Pages 同源静态托管，前端 fetch 无 CORS 问题。
 * 所有源均尽力而为：某个平台失败不影响其余平台，前端只展示有数据的平台。
 *
 * 数据源说明（Actions 运行于境外节点，多数大陆平台直连会被拦/需登录）：
 *  - 60s.viki.moe：全球 CDN 聚合，稳定可达，覆盖 抖音/微博/知乎/头条（主用）
 *  - 官方直连：B站 / 百度 在境外仍可访问（主用）；抖音/快手直连作兜底
 */
const https = require("https");
const fs = require("fs");

const UA = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
  Accept: "application/json, text/plain, */*",
};

function get(url, headers, _hop) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      { headers: Object.assign({}, UA, headers || {}) },
      (res) => {
        if ([301, 302, 303, 307, 308].indexOf(res.statusCode) > -1 && res.headers.location && (_hop || 0) < 3) {
          return resolve(get(res.headers.location, headers, (_hop || 0) + 1));
        }
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () => resolve({ s: res.statusCode, b: d }));
      }
    );
    req.on("error", reject);
    req.setTimeout(9000, () => req.destroy(new Error("timeout")));
  });
}
async function jget(url, headers) {
  const r = await get(url, headers);
  if (r.s !== 200) throw new Error("HTTP " + r.s);
  return JSON.parse(r.b);
}
const enc = encodeURIComponent;

/* ===== 全球聚合源（viki.moe）：境外可达，覆盖 抖音/微博/知乎/头条 ===== */
const VURL = "https://60s.viki.moe/v2/";
async function viki(slug, _try) {
  let j;
  try {
    j = await jget(VURL + slug);
  } catch (e) {
    if (!_try) return viki(slug, true); // 单次重试，规避境外节点的瞬时超时/抖动
    throw e;
  }
  const arr = j && j.data && Array.isArray(j.data) ? j.data : Array.isArray(j) ? j : [];
  return arr
    .slice(0, 15)
    .map((it) => ({ t: String(it.title || "").trim(), url: it.link || "", hot: Number(it.hot_value) || 0 }))
    .filter((x) => x.t && x.url);
}

/* ===== 官方直连兜底 ===== */
async function directDouyin() {
  const j = await jget("https://www.iesdouyin.com/web/api/v2/hotsearch/billboard/word/");
  const a = j.word_list || [];
  return a.map((it) => ({ t: it.word, url: "https://www.douyin.com/search/" + enc(it.word), hot: it.hot_value || 0 }));
}
async function directKuaishou() {
  const j = await jget("https://www.kuaishou.com/aggregate-page/web/hot-search");
  const a = (j.data && j.data.hotSearch && j.data.hotSearch.list) || [];
  return a.map((it) => ({
    t: it.name || it.word || "",
    url: "https://www.kuaishou.com/search/video?searchQuery=" + enc(it.name || it.word || ""),
    hot: it.hot || 0,
  }));
}
async function directBilibili() {
  const j = await jget("https://api.bilibili.com/x/web-interface/popular?ps=20&pn=1", {
    Referer: "https://www.bilibili.com",
  });
  const a = (j.data && j.data.list) || [];
  return a.map((it) => ({ t: it.title, url: "https://www.bilibili.com/video/" + it.bvid, hot: it.stat ? it.stat.view : 0 }));
}
async function directWeibo() {
  const j = await jget("https://weibo.com/ajax/side/hotSearch");
  const a = (j.data && j.data.realtime) || [];
  return a
    .filter((it) => it.is_hot !== 0)
    .map((it) => ({ t: it.word, url: "https://s.weibo.com/weibo?q=" + enc("%23" + it.word + "%23"), hot: it.num || 0 }));
}
async function directZhihu() {
  const j = await jget("https://www.zhihu.com/api/v3/feed/topstory/hot-lists/total?limit=20");
  const a = (j.data && j.data.list) || [];
  return a.map((it) => {
    const tg = it.target || {};
    const url = tg.url ? (tg.url.indexOf("http") === 0 ? tg.url : "https://www.zhihu.com" + tg.url) : "https://www.zhihu.com/question/" + (tg.id || "");
    return { t: tg.title || "", url, hot: it.detail ? Number(String(it.detail.text).replace(/\D/g, "")) || 0 : 0 };
  });
}
async function directBaidu() {
  const j = await jget("https://top.baidu.com/api/board?platform=wise&tab=realtime");
  const cards = (j.data && j.data.cards) || [];
  const out = [];
  cards.forEach((c) =>
    (c.content || []).forEach((it) => {
      if (it.word)
        out.push({ t: it.word, url: "https://www.baidu.com/s?wd=" + enc(it.word), hot: it.hotScore || 0 });
    })
  );
  return out;
}

/* 每个平台：优先全球聚合（可达性好），失败再回退官方直连 */
const SRC = {
  douyin: () => viki("douyin").catch(() => directDouyin().catch(() => [])),
  kuaishou: () => directKuaishou().catch(() => []),
  bilibili: () => directBilibili().catch(() => []),
  weibo: () => viki("weibo").catch(() => directWeibo().catch(() => [])),
  zhihu: () => viki("zhihu").catch(() => directZhihu().catch(() => [])),
  baidu: () => directBaidu().catch(() => []),
  toutiao: () => viki("toutiao").catch(() => []),
};

const ORDER = ["douyin", "kuaishou", "bilibili", "weibo", "zhihu", "baidu", "toutiao"];
const NAMES = { douyin: "抖音", kuaishou: "快手", bilibili: "B站", weibo: "微博", zhihu: "知乎", baidu: "百度", toutiao: "头条" };

(async () => {
  const platforms = [];
  for (const id of ORDER) {
    let items = [];
    try {
      items = await SRC[id]();
    } catch (e) {
      console.error(id, "fail:", e.message);
    }
    items = items.filter((x) => x && x.t && x.url).slice(0, 15);
    platforms.push({ id, name: NAMES[id], items });
  }
  const payload = {
    updated: new Date().toISOString(),
    count: platforms.reduce((s, p) => s + p.items.length, 0),
    platforms,
  };
  fs.writeFileSync("hotlist.json", JSON.stringify(payload));
  console.log(
    "wrote hotlist.json items=" + payload.count,
    platforms.map((p) => p.name + ":" + p.items.length).join(" ")
  );
})();
