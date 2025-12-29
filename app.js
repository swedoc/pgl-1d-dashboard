// 1D Crypto Dashboard — Trend colors, PGL momentum, class-sorted + News + Market Overview

const BASE = "USDT";
const LIMIT = 30;
const BAN_SUFFIX = ["UP", "DOWN", "BULL", "BEAR"];
const EXCLUDE_BASES = new Set(["USDC","FDUSD","TUSD"]); // hide stablecoins
const ORDER_MODE = "class"; // Bull -> Neutral -> Bear

// PGL (momentum only)
const PGL_THRESH = { upL: 0.60, downL: 0.40 };

// News feeds
const NEWS_FEEDS = [
  "https://www.coindesk.com/arc/outboundfeeds/rss/",
  "https://cointelegraph.com/rss",
  "https://decrypt.co/feed"
];

const els = {
  lastUpdated: document.getElementById("lastUpdated"),
  cards: document.getElementById("cards"),
  count: {
    bull: document.getElementById("count-bull"),
    neutral: document.getElementById("count-neutral"),
    bear: document.getElementById("count-bear"),
  },
  refresh: document.getElementById("refreshBtn"),
  newsList: document.getElementById("newsList"),
  newsNote: document.getElementById("newsNote"),
  sumSent: document.getElementById("sum-sent"),
  sumSigs: document.getElementById("sum-sigs"),
  sumInterp: document.getElementById("sum-interpret"),
};

function fmt(n, d=2){ return Number(n).toLocaleString(undefined, {minimumFractionDigits:d, maximumFractionDigits:d}); }
function pct(n, d=1){ return `${fmt(n, d)}%`; }
function clsColor(c){ return c === "Bull" ? "bull" : c === "Bear" ? "bear" : "neutral"; }
function tvUrl(symbol){ return `https://www.tradingview.com/chart/?symbol=BINANCE%3A${symbol}`; }

function validSymbol(sym){
  if(!sym.endsWith(BASE)) return false;
  for(const suf of BAN_SUFFIX){
    if(sym.endsWith(suf + BASE)) return false;
  }
  const baseAsset = sym.replace(BASE,"");
  if(EXCLUDE_BASES.has(baseAsset)) return false;
  return true;
}

// --- PGL (momentum) from Binance 24h-ticker ---
function calcPgl(last, prevClose, high, low){
  const rng = Math.max(1e-12, high - low);
  const L = (last - low) / rng; // [0,1]
  const z = ((last / Math.max(1e-12, prevClose)) - 1) / Math.max(1e-12, rng / Math.max(1e-12, prevClose));
  let momentum = "Mid";
  if (z >= 0 && L >= PGL_THRESH.upL) momentum = "Up";
  else if (z <= 0 && L <= PGL_THRESH.downL) momentum = "Down";
  return { L, z, momentum, rangePct: (rng / Math.max(1e-12, prevClose)) * 100 };
}

// --- Trend (1D) ---
async function fetchDaily(symbol, limit=250){
  const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1d&limit=${limit}`;
  const r = await fetch(url);
  const data = await r.json();
  return data.map(k => Number(k[4])); // closes
}
function ema(arr, period){
  const k = 2/(period+1);
  const out = [];
  let prev = arr[0];
  for (let i=0;i<arr.length;i++){
    prev = i===0 ? arr[0] : arr[i]*k + prev*(1-k);
    out.push(prev);
  }
  return out;
}
function trendClass(close, e20, e50, e100, e20_prev){
  const slopePct = (e20 - e20_prev) / Math.max(1e-12, e20); // ΔEMA20 / EMA20
  const minSlope = 0.0005; // 0.05%
  if (close > e50 && e20 > e50 && e50 > e100 && slopePct >  minSlope) return {klass:"Bull", slopePct};
  if (close < e50 && e20 < e50 && e50 < e100 && slopePct < -minSlope) return {klass:"Bear", slopePct};
  return {klass:"Neutral", slopePct};
}

// --- NEWS (RSS via AllOrigins) ---
function timeAgo(ts){
  const t = new Date(ts).getTime();
  if (isNaN(t)) return "";
  const diff = Date.now() - t;
  const mins = Math.floor(diff/60000);
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins/60);
  if (h < 48) return `${h}h ago`;
  const d = Math.floor(h/24);
  return `${d}d ago`;
}
async function fetchRssViaAllOrigins(url){
  const api = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
  const r = await fetch(api);
  if(!r.ok) throw new Error(`Feed error ${r.status}`);
  const txt = await r.text();
  const doc = new DOMParser().parseFromString(txt, "text/xml");
  const items = Array.from(doc.querySelectorAll("item"));
  return items.map(it => ({
    title: it.querySelector("title")?.textContent?.trim() || "",
    link: it.querySelector("link")?.textContent?.trim() || "",
    pubDate: it.querySelector("pubDate")?.textContent?.trim() || ""
  }));
}
async function loadNews(){
  try{
    const results = await Promise.allSettled(NEWS_FEEDS.map(fetchRssViaAllOrigins));
    let items = [];
    for (const r of results){
      if (r.status === "fulfilled") items.push(...r.value);
    }
    const seen = new Set();
    items = items.filter(it => {
      const key = it.link || it.title;
      if(!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    items.sort((a,b) => new Date(b.pubDate||0) - new Date(a.pubDate||0));
    items = items.slice(0, 10);

    els.newsList.innerHTML = "";
    for (const it of items){
      const li = document.createElement("li");
      li.className = "news-item";
      li.innerHTML = `
        <a href="${it.link}" target="_blank" rel="noopener">${it.title}</a>
        <div class="news-meta">${it.pubDate ? timeAgo(it.pubDate) : ""}</div>
      `;
      els.newsList.appendChild(li);
    }
    els.newsNote.textContent = items.length ? "" : "No items found. Feeds may be blocked.";
  }catch(e){
    els.newsNote.textContent = `News unavailable (${e.message}).`;
  }
}

// --- SUMMARY HELPERS ---
// Removes accidental duplication if the same screening sentence ends up in JS summary.
function stripScreeningPrefix(s){
  if(!s) return s;
  const p = "1D screening & regime context only. Describes conditions, not actions.";
  let out = String(s).trimStart();
  while (out.startsWith(p)) out = out.slice(p.length).trimStart();
  return out;
}

// --- SUMMARY ---
function summarize(rows){
  const total = rows.length || 1;
  const bull = rows.filter(r => r.klass==="Bull");
  const bear = rows.filter(r => r.klass==="Bear");
  const neutral = rows.filter(r => r.klass==="Neutral");
  const breadth = bull.length/total;

  const alt = rows.filter(r => r.base!=="BTC" && r.base!=="ETH");
  const altBreadth = alt.length ? alt.filter(r => r.klass==="Bull").length/alt.length : 0;

  const avgRange = rows.reduce((a,r)=>a + r.pgl.rangePct, 0)/total;
  const upMom = rows.filter(r => r.pgl.momentum==="Up").length;
  const downMom = rows.filter(r => r.pgl.momentum==="Down").length;

  const BTC = rows.find(r => r.base==="BTC");
  const ETH = rows.find(r => r.base==="ETH");

  // Sentiment line
  let sent = "Mixed conditions.";
  if (breadth >= 0.6) sent = "Positive bias: breadth is supportive.";
  else if (breadth <= 0.4) sent = "Negative bias: breadth is weak.";
  else if (breadth > 0.5) sent = "Slightly positive: breadth improving.";
  else if (breadth < 0.5) sent = "Slightly negative: breadth softening.";

  // Volatility label from avg 24h range
  let vol = "normal volatility";
  if (avgRange < 2) vol = "subdued volatility";
  else if (avgRange > 4) vol = "elevated volatility";

  const sentLine =
    `${sent} ${pct(bull.length/total*100,1)} Bull, ${pct(neutral.length/total*100,1)} Neutral, ${pct(bear.length/total*100,1)} Bear. ` +
    `Average 24h range: ${fmt(avgRange,1)}% (${vol}).`;

  // Make summary resilient if an older build accidentally prepends the screening sentence.
  els.sumSent.textContent = stripScreeningPrefix(sentLine);

  // Signals & triggers bullets
  const sigs = [];
  if (BTC) sigs.push(`BTC trend: ${BTC.klass}${BTC.slopePct!=null?` (EMA20 slope ${fmt(BTC.slopePct*100,2)}%)`:""}.`);
  if (ETH) sigs.push(`ETH trend: ${ETH.klass}${ETH.slopePct!=null?` (EMA20 slope ${fmt(ETH.slopePct*100,2)}%)`:""}.`);
  sigs.push(`Breadth: ${bull.length}/${total} assets in Bull (${fmt(altBreadth*100,1)}% of alts).`);
  sigs.push(`Momentum pockets: ${upMom} Up vs ${downMom} Down (by PGL).`);

  els.sumSigs.innerHTML = "";
  sigs.forEach(s => {
    const li = document.createElement("li");
    li.textContent = s;
    els.sumSigs.appendChild(li);
  });

  // Interpretation
  let interp = "Base case: range with directional moves driven by momentum pockets; respect EMA50 flips.";
  if (BTC && BTC.klass==="Bull" && altBreadth>0.5) interp = "Base case: constructive uptrend while BTC holds above EMA50; dips likely get bought in leaders.";
  if (BTC && BTC.klass==="Bear") interp = "Regime context: downside bias while BTC remains below EMA50 and breadth is weak. This is screening context, not an actionable edge or a trade instruction.";
  els.sumInterp.textContent = interp;
}

// --- MAIN LOAD ---
async function load(){
  els.refresh.disabled = true;
  try{
    const r = await fetch("https://api.binance.com/api/v3/ticker/24hr");
    const all = await r.json();

    const baseRows = all
      .filter(t => validSymbol(t.symbol))
      .map(t => ({
        symbol: t.symbol,
        base: t.symbol.replace(BASE,""),
        last: Number(t.lastPrice),
        high: Number(t.highPrice),
        low: Number(t.lowPrice),
        prevClose: Number(t.prevClosePrice),
        chgPct: Number(t.priceChangePercent),
        volQuote: Number(t.quoteVolume)
      }))
      .sort((a,b) => b.volQuote - a.volQuote)
      .slice(0, LIMIT);

    // Enrich with PGL and Trend
    const enriched = await Promise.all(baseRows.map(async t => {
      const pgl = calcPgl(t.last, t.prevClose, t.high, t.low);
      let e20=null,e50=null,e100=null, slopePct=null, klass="Neutral";
      const closes = await fetchDaily(t.symbol, 250);
      if (closes.length >= 100){
        const e20s  = ema(closes, 20);
        const e50s  = ema(closes, 50);
        const e100s = ema(closes,100);
        e20  = e20s.at(-1);
        e50  = e50s.at(-1);
        e100 = e100s.at(-1);
        const e20_prev = e20s.at(-2);
        const tc = trendClass(t.last, e20, e50, e100, e20_prev);
        klass = tc.klass;
        slopePct = tc.slopePct;
      }
      return {...t, pgl, e20, e50, e100, slopePct, klass};
    }));

    // Sort Bull -> Neutral -> Bear, then by volume
    const rank = { "Bull": 0, "Neutral": 1, "Bear": 2 };
    const rows = enriched.sort((a,b) => {
      const rc = (rank[a.klass] ?? 9) - (rank[b.klass] ?? 9);
      if (rc !== 0) return rc;
      return b.volQuote - a.volQuote;
    });

    // Render cards
    let cBull=0, cNeutral=0, cBear=0;
    els.cards.innerHTML = "";
    const frag = document.createDocumentFragment();

    for (const t of rows){
      if(t.klass==="Bull") cBull++; else if(t.klass==="Bear") cBear++; else cNeutral++;

      const card = document.createElement("div");
      card.className = "card";
      card.innerHTML = `
        <div class="head">
          <div class="badge">
            <span class="dot ${clsColor(t.klass)}"></span>
            <span class="lab">${t.base}</span>
          </div>
          <span class="sub">${t.symbol}</span>
        </div>
        <div class="price">$${fmt(t.last,2)} <span class="sub">(${t.chgPct>0?"+":""}${fmt(t.chgPct,2)}% 24h)</span></div>

        <div class="kv">
          <div><span>High 24h</span>$${fmt(t.high,2)}</div>
          <div><span>Low 24h</span>$${fmt(t.low,2)}</div>
          <div><span>PGL L</span>${fmt(t.pgl.L,2)}</div>
          <div><span>Z</span>${fmt(t.pgl.z,2)}</div>
        </div>

        <div class="kv" style="margin-top:6px">
          <div><span>EMA20</span>${t.e20!==null?("$"+fmt(t.e20,2)):"—"}</div>
          <div><span>EMA50</span>${t.e50!==null?("$"+fmt(t.e50,2)):"—"}</div>
          <div><span>EMA100</span>${t.e100!==null?("$"+fmt(t.e100,2)):"—"}</div>
          <div><span>Slope20%</span>${t.slopePct!==null?fmt(t.slopePct*100,2)+"%":"—"}</div>
        </div>

        <div class="kv" style="margin-top:6px">
          <div><span>Momentum</span>${t.pgl.momentum}</div>
          <div><span>Trend</span>${t.klass}</div>
        </div>

        <div class="actions">
          <a href="${tvUrl(t.symbol)}" target="_blank" rel="noopener">Open in TradingView</a>
          <a href="https://www.binance.com/en/trade/${t.base}_${BASE}" target="_blank" rel="noopener">Open on Binance</a>
        </div>
      `;
      frag.appendChild(card);
    }

    els.cards.appendChild(frag);
    els.count.bull.textContent = cBull;
    els.count.neutral.textContent = cNeutral;
    els.count.bear.textContent = cBear;
    els.lastUpdated.textContent = "Last updated: " + new Date().toLocaleString();

    // Summary + News
    summarize(rows);
    loadNews();
  }catch(err){
    els.cards.innerHTML = `<div class="card"><div class="sub">Error: ${err}</div><div class="sub">If your browser blocks direct API calls, run a local server:</div><div class="kv"><div><span>Python</span>python3 -m http.server 8000</div><div><span>Open</span>http://127.0.0.1:8000/</div></div></div>`;
  }finally{
    els.refresh.disabled = false;
  }
}

els.refresh.addEventListener("click", load);
load();
