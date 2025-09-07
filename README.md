# 1D Crypto Dashboard — PGL-first (Pure Frontend)

Single HTML + JS. Fetches Binance 24h tickers, selects top 30 USDT pairs by quote volume, computes PGL, colors each asset by class, and links to TradingView.

## How to use
1. Open `index.html` directly in your browser.
2. If your browser blocks direct API calls, run a tiny local server:
   ```bash
   python3 -m http.server 8000
   # then open http://127.0.0.1:8000/index.html
   ```

## PGL definition (shared with `pgl_tv.pine`)
- L = (close - low24h) / max(1e-12, (high24h - low24h))  in [0,1]
- z = ((close / prevClose) - 1) / max(1e-12, (high24h - low24h)/prevClose)
- Class:
  - Bull if L ≥ 0.67 and z ≥ 0
  - Bear if L ≤ 0.33 and z ≤ 0
  - Neutral otherwise

You can tweak thresholds at the top of `app.js` and inputs in the Pine script. Both use the exact same math for one-to-one alignment with TradingView.
