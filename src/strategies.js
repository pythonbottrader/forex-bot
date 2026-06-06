export const SIGNAL = { BUY: 1, SELL: -1, HOLD: 0 }

// ─── INDICATORS ─────────────────────────────────────────

export function sma(data, period) {
  const r = []
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) { r.push(null); continue }
    r.push(data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period)
  }
  return r
}

export function ema(data, period) {
  const r = []
  let k = 2 / (period + 1), prev = null
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) { r.push(null); continue }
    if (prev === null) {
      prev = data.slice(0, period).reduce((a, b) => a + b, 0) / period
      r.push(prev); continue
    }
    prev = data[i] * k + prev * (1 - k)
    r.push(prev)
  }
  return r
}

export function rsi(prices, period = 14) {
  const r = [null]
  for (let i = 1; i < prices.length; i++) {
    if (i < period) { r.push(null); continue }
    let gain = 0, loss = 0
    for (let j = i - period + 1; j <= i; j++) {
      const d = prices[j] - prices[j - 1]
      gain += d > 0 ? d : 0
      loss += d < 0 ? -d : 0
    }
    const avgLoss = loss / period
    r.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + gain / loss))
  }
  return r
}

export function macd(prices, fast = 12, slow = 26, signal = 9) {
  const efast = ema(prices, fast)
  const eslow = ema(prices, slow)
  const macdLine = efast.map((v, i) => v !== null && eslow[i] !== null ? v - eslow[i] : null)
  const sigLine = ema(macdLine.filter(v => v !== null), signal)
  const result = [], sigResult = []
  let sigIdx = 0
  for (let i = 0; i < macdLine.length; i++) {
    if (macdLine[i] === null) { result.push(null); sigResult.push(null) }
    else {
      result.push(macdLine[i])
      sigResult.push(sigLine[sigIdx] ?? null)
      sigIdx++
    }
  }
  return { macd: result, signal: sigResult, histogram: result.map((v, i) => v !== null && sigResult[i] !== null ? v - sigResult[i] : null) }
}

export function stochastic(prices, highs, lows, kPeriod = 14, dPeriod = 3) {
  const k = []
  for (let i = 0; i < prices.length; i++) {
    if (i < kPeriod - 1) { k.push(null); continue }
    const hh = Math.max(...highs.slice(i - kPeriod + 1, i + 1))
    const ll = Math.min(...lows.slice(i - kPeriod + 1, i + 1))
    k.push(ll === hh ? 50 : ((prices[i] - ll) / (hh - ll)) * 100)
  }
  const d = sma(k.filter(v => v !== null), dPeriod)
  const d2 = []
  let di = 0
  for (let i = 0; i < k.length; i++) {
    d2.push(k[i] === null ? null : d[di] ?? null)
    if (k[i] !== null) di++
  }
  return { k, d: d2 }
}

export function adx(prices, highs, lows, period = 14) {
  const tr = [null], plusDM = [null], minusDM = [null]
  for (let i = 1; i < prices.length; i++) {
    const h = highs[i], l = lows[i], ph = highs[i - 1], pl = lows[i - 1], pc = prices[i - 1]
    tr.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)))
    const up = h - ph, down = pl - l
    plusDM.push(up > down && up > 0 ? up : 0)
    minusDM.push(down > up && down > 0 ? down : 0)
  }
  const atr = ema(tr.filter(v => v !== null), period)
  const pdi = [], mdi = [], dx = [], adxV = []
  let atrIdx = 0, pdiPrev = null, mdiPrev = null, dxCount = 0, dxSum = 0

  for (let i = 0; i < prices.length; i++) {
    if (i < period) { pdi.push(null); mdi.push(null); dx.push(null); adxV.push(null); continue }
    if (i < period + 1) { pdiPrev = 0; mdiPrev = 0 }

    const trVal = tr[i]
    const pVal = plusDM.slice(1, i + 1).reduce((a, b) => a + b, 0) / period
    const mVal = minusDM.slice(1, i + 1).reduce((a, b) => a + b, 0) / period
    const atrVal = atr[atrIdx] || 1
    atrIdx++

    const pdiVal = (pVal / atrVal) * 100
    const mdiVal = (mVal / atrVal) * 100
    pdi.push(pdiVal); mdi.push(mdiVal)

    const diSum = pdiVal + mdiVal
    dx.push(diSum === 0 ? 0 : Math.abs(pdiVal - mdiVal) / diSum * 100)
  }

  // Smooth DX into ADX
  for (let i = 0; i < dx.length; i++) {
    if (dx[i] === null || i < period + period - 1) { adxV.push(null); continue }
    const sum = dx.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0)
    adxV.push(sum / period)
  }

  return { adx: adxV, pdi, mdi }
}

export function cci(prices, highs, lows, period = 14) {
  const tp = prices.map((v, i) => (v + highs[i] + lows[i]) / 3)
  const avg = sma(tp, period)
  const r = []
  for (let i = 0; i < prices.length; i++) {
    if (i < period || avg[i] === null) { r.push(null); continue }
    const md = tp.slice(i - period + 1, i + 1).reduce((s, v) => s + Math.abs(v - avg[i]), 0) / period
    r.push(md === 0 ? 0 : (tp[i] - avg[i]) / (0.015 * md))
  }
  return r
}

export function williamsR(prices, highs, lows, period = 14) {
  const r = []
  for (let i = 0; i < prices.length; i++) {
    if (i < period) { r.push(null); continue }
    const hh = Math.max(...highs.slice(i - period + 1, i + 1))
    const ll = Math.min(...lows.slice(i - period + 1, i + 1))
    r.push(ll === hh ? -50 : -100 * (hh - prices[i]) / (hh - ll))
  }
  return r
}

export function atr(highs, lows, closes, period = 14) {
  const tr = []
  for (let i = 0; i < closes.length; i++) {
    if (i === 0) { tr.push(null); continue }
    tr.push(Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1])))
  }
  return ema(tr.filter(v => v !== null), period)
}

// ─── STRATEGY FACTORIES ─────────────────────────────────

function crossover(fast, slow, i) {
  if (i === 0 || fast[i] === null || slow[i] === null || fast[i - 1] === null || slow[i - 1] === null) return SIGNAL.HOLD
  if (fast[i] > slow[i] && fast[i - 1] <= slow[i - 1]) return SIGNAL.BUY
  if (fast[i] < slow[i] && fast[i - 1] >= slow[i - 1]) return SIGNAL.SELL
  return SIGNAL.HOLD
}

function thresholdCross(value, prev, lower, upper) {
  if (value === null || prev === null) return SIGNAL.HOLD
  if (prev <= lower && value > lower) return SIGNAL.BUY
  if (prev >= upper && value < upper) return SIGNAL.SELL
  return SIGNAL.HOLD
}

// ─── SMA CROSSOVER STRATEGIES ───────────────────────────

function makeSmaCross(fast, slow, label) {
  return (p, h, l) => {
    const f = sma(p, fast), s = sma(p, slow), sig = []
    for (let i = 0; i < p.length; i++) sig.push(crossover(f, s, i))
    return sig
  }
}

// ─── EMA CROSSOVER STRATEGIES ───────────────────────────

function makeEmaCross(fast, slow, label) {
  return (p, h, l) => {
    const f = ema(p, fast), s = ema(p, slow), sig = []
    for (let i = 0; i < p.length; i++) sig.push(crossover(f, s, i))
    return sig
  }
}

// ─── MACD STRATEGIES ────────────────────────────────────

function makeMacdCross(fast, slow, sigPeriod) {
  return (p, h, l) => {
    const m = macd(p, fast, slow, sigPeriod), sig = []
    for (let i = 0; i < p.length; i++) sig.push(crossover(m.macd, m.signal, i))
    return sig
  }
}

function makeMacdZeroCross(fast, slow, sigPeriod, useHistogram = true) {
  return (p, h, l) => {
    const m = macd(p, fast, slow, sigPeriod), sig = []
    for (let i = 0; i < p.length; i++) {
      const val = useHistogram ? m.histogram : m.macd
      sig.push(thresholdCross(val[i], i > 0 ? val[i - 1] : null, 0, 0))
    }
    return sig
  }
}

// ─── RSI STRATEGIES ─────────────────────────────────────

function makeRsi(period, oversold, overbought) {
  return (p, h, l) => {
    const r = rsi(p, period), sig = []
    for (let i = 0; i < p.length; i++) sig.push(thresholdCross(r[i], i > 0 ? r[i - 1] : null, oversold, overbought))
    return sig
  }
}

// ─── STOCHASTIC STRATEGIES ──────────────────────────────

function makeStoch(kPeriod, dPeriod, oversold, overbought) {
  return (p, h, l) => {
    const s = stochastic(p, h, l, kPeriod, dPeriod), sig = []
    for (let i = 0; i < p.length; i++) sig.push(thresholdCross(s.k[i], i > 0 ? s.k[i - 1] : null, oversold, overbought))
    return sig
  }
}

// ─── ADX STRATEGIES ─────────────────────────────────────

function makeAdxCross(period) {
  return (p, h, l) => {
    const a = adx(p, h, l, period), sig = []
    for (let i = 0; i < p.length; i++) {
      if (a.pdi[i] === null || a.mdi[i] === null || a.adx[i] === null || a.adx[i] < 20) {
        sig.push(SIGNAL.HOLD)
      } else {
        sig.push(crossover(a.pdi, a.mdi, i))
      }
    }
    return sig
  }
}

// ─── CCI STRATEGIES ─────────────────────────────────────

function makeCci(period, lower, upper) {
  return (p, h, l) => {
    const c = cci(p, h, l, period), sig = []
    for (let i = 0; i < p.length; i++) sig.push(thresholdCross(c[i], i > 0 ? c[i - 1] : null, lower, upper))
    return sig
  }
}

// ─── WILLIAMS %R STRATEGIES ─────────────────────────────

function makeWilliams(period, lower, upper) {
  return (p, h, l) => {
    const w = williamsR(p, h, l, period), sig = []
    for (let i = 0; i < p.length; i++) sig.push(thresholdCross(w[i], i > 0 ? w[i - 1] : null, lower, upper))
    return sig
  }
}

// ─── COMBINATION STRATEGIES ─────────────────────────────

function makeMacdRsi(macdFast, macdSlow, macdSig, rsiPeriod, rsiLower, rsiUpper) {
  return (p, h, l) => {
    const m = macd(p, macdFast, macdSlow, macdSig)
    const r = rsi(p, rsiPeriod)
    const sig = []
    for (let i = 0; i < p.length; i++) {
      const macdCross = crossover(m.macd, m.signal, i)
      if (macdCross === SIGNAL.BUY && r[i] !== null && r[i] < rsiUpper) { sig.push(SIGNAL.BUY) }
      else if (macdCross === SIGNAL.SELL && r[i] !== null && r[i] > rsiLower) { sig.push(SIGNAL.SELL) }
      else { sig.push(SIGNAL.HOLD) }
    }
    return sig
  }
}

function makeSmaRsi(smaFast, smaSlow, rsiPeriod, rsiThreshold) {
  return (p, h, l) => {
    const f = sma(p, smaFast), s = sma(p, smaSlow)
    const r = rsi(p, rsiPeriod)
    const sig = []
    for (let i = 0; i < p.length; i++) {
      const smaCross = crossover(f, s, i)
      if (smaCross === SIGNAL.BUY && r[i] !== null && r[i] > rsiThreshold) { sig.push(SIGNAL.BUY) }
      else if (smaCross === SIGNAL.SELL && r[i] !== null && r[i] < rsiThreshold) { sig.push(SIGNAL.SELL) }
      else { sig.push(SIGNAL.HOLD) }
    }
    return sig
  }
}

function makeTripleMa(short, mid, long) {
  return (p, h, l) => {
    const s = sma(p, short), m = sma(p, mid), lg = sma(p, long)
    const sig = []
    for (let i = 0; i < p.length; i++) {
      if (s[i] === null || m[i] === null || lg[i] === null) { sig.push(SIGNAL.HOLD); continue }
      const bull = s[i] > m[i] && m[i] > lg[i]
      const bear = s[i] < m[i] && m[i] < lg[i]
      if (bull && (i === 0 || !(s[i-1] > m[i-1] && m[i-1] > lg[i-1]))) sig.push(SIGNAL.BUY)
      else if (bear && (i === 0 || !(s[i-1] < m[i-1] && m[i-1] < lg[i-1]))) sig.push(SIGNAL.SELL)
      else sig.push(SIGNAL.HOLD)
    }
    return sig
  }
}

function makeBollingerRsi(bollPeriod, bollStd, rsiPeriod, rsiLower, rsiUpper) {
  return (p, h, l) => {
    const mid = sma(p, bollPeriod), r = rsi(p, rsiPeriod), sig = []
    for (let i = 0; i < p.length; i++) {
      if (i < bollPeriod || mid[i] === null || r[i] === null) { sig.push(SIGNAL.HOLD); continue }
      const slice = p.slice(i - bollPeriod + 1, i + 1)
      const std = Math.sqrt(slice.reduce((s, v) => s + (v - mid[i]) ** 2, 0) / bollPeriod)
      const lower = mid[i] - bollStd * std, upper = mid[i] + bollStd * std
      if (p[i] < lower && r[i] < rsiLower) sig.push(SIGNAL.BUY)
      else if (p[i] > upper && r[i] > rsiUpper) sig.push(SIGNAL.SELL)
      else sig.push(SIGNAL.HOLD)
    }
    return sig
  }
}

function makeAdxSma(adxPeriod, smaFast, smaSlow, adxThreshold) {
  return (p, h, l) => {
    const a = adx(p, h, l, adxPeriod)
    const f = sma(p, smaFast), s = sma(p, smaSlow), sig = []
    for (let i = 0; i < p.length; i++) {
      if (a.adx[i] === null || a.adx[i] < adxThreshold) { sig.push(SIGNAL.HOLD); continue }
      const cross = crossover(f, s, i)
      if (cross === SIGNAL.BUY && a.pdi[i] > a.mdi[i]) sig.push(SIGNAL.BUY)
      else if (cross === SIGNAL.SELL && a.mdi[i] > a.pdi[i]) sig.push(SIGNAL.SELL)
      else sig.push(SIGNAL.HOLD)
    }
    return sig
  }
}

function makeStochRsi(kPeriod, dPeriod, rsiPeriod, stochLower, stochUpper, rsiLower, rsiUpper) {
  return (p, h, l) => {
    const s = stochastic(p, h, l, kPeriod, dPeriod)
    const r = rsi(p, rsiPeriod), sig = []
    for (let i = 0; i < p.length; i++) {
      if (s.k[i] === null || r[i] === null) { sig.push(SIGNAL.HOLD); continue }
      const prev = i > 0 ? s.k[i - 1] : null
      if (prev !== null && s.k[i] > stochLower && prev <= stochLower && r[i] < rsiUpper) sig.push(SIGNAL.BUY)
      else if (prev !== null && s.k[i] < stochUpper && prev >= stochUpper && r[i] > rsiLower) sig.push(SIGNAL.SELL)
      else sig.push(SIGNAL.HOLD)
    }
    return sig
  }
}

// ─── GENERATE ALL STRATEGIES ────────────────────────────

const strategies = {}

// SMA Crossovers
for (const [f, s] of [[5,20],[9,21],[10,50],[20,100],[50,200]]) {
  strategies[`SMA ${f}x${s}`] = makeSmaCross(f, s)
}

// EMA Crossovers
for (const [f, s] of [[5,20],[9,21],[12,26],[20,100],[50,200]]) {
  strategies[`EMA ${f}x${s}`] = makeEmaCross(f, s)
}

// MACD
for (const [f, s, sig] of [[8,17,9],[12,26,9],[5,35,5]]) {
  strategies[`MACD ${f}/${s} (cruz)`] = makeMacdCross(f, s, sig)
  strategies[`MACD ${f}/${s} (zero)`] = makeMacdZeroCross(f, s, sig, true)
}

// RSI
for (const [p, lo, hi] of [[5,20,80],[9,25,75],[14,25,75],[14,30,70]]) {
  strategies[`RSI ${p} (${lo}/${hi})`] = makeRsi(p, lo, hi)
}

// Stochastic
for (const [k, d, lo, hi] of [[14,3,20,80],[5,3,15,85]]) {
  strategies[`Stoch ${k}/${d} (${lo}/${hi})`] = makeStoch(k, d, lo, hi)
}

// ADX
for (const p of [14]) {
  strategies[`ADX ${p}`] = makeAdxCross(p)
}

// CCI
for (const [p, lo, hi] of [[14,-100,100],[20,-100,100]]) {
  strategies[`CCI ${p} (${lo}/${hi})`] = makeCci(p, lo, hi)
}

// Williams %R
for (const [p, lo, hi] of [[14,-80,-20]]) {
  strategies[`Williams ${p}`] = makeWilliams(p, lo, hi)
}

// Combinations
strategies[`MACD 12/26 + RSI 14`] = makeMacdRsi(12, 26, 9, 14, 40, 60)
strategies[`SMA 10/50 + RSI 14`] = makeSmaRsi(10, 50, 14, 50)
strategies[`SMA 20/100 + RSI 14`] = makeSmaRsi(20, 100, 14, 50)
strategies[`Triple MA (5/20/50)`] = makeTripleMa(5, 20, 50)
strategies[`Triple MA (8/21/55)`] = makeTripleMa(8, 21, 55)
strategies[`Triple MA (10/50/200)`] = makeTripleMa(10, 50, 200)
strategies[`Bollinger 20/2 + RSI 14`] = makeBollingerRsi(20, 2, 14, 30, 70)
strategies[`ADX 14 + SMA 10/50`] = makeAdxSma(14, 10, 50, 25)
strategies[`ADX 14 + SMA 20/100`] = makeAdxSma(14, 20, 100, 25)
strategies[`Stoch 14/3 + RSI 14`] = makeStochRsi(14, 3, 14, 20, 80, 30, 70)

// ─── EVALUATE ───────────────────────────────────────────

export function evaluateStrategy(name, prices, signals, initialCapital = 10000, spread = 0.0002, leverage = 1) {
  let capital = initialCapital, position = 0, trades = 0, wins = 0, peak = initialCapital, maxDrawdown = 0, blown = false

  for (let i = 0; i < prices.length; i++) {
    if (blown) break
    const equity = capital + (i > 0 ? position * prices[i] : 0)
    if (equity > peak) peak = equity
    const drawdown = (peak - equity) / peak * 100
    if (drawdown > maxDrawdown) maxDrawdown = drawdown

    if (signals[i] === SIGNAL.BUY && position === 0) {
      position = (capital * leverage) / (prices[i] * (1 + spread))
      capital = 0; trades++
    } else if (signals[i] === SIGNAL.SELL && position > 0) {
      capital = position * prices[i] * (1 - spread)
      position = 0
      if (capital <= 0) { blown = true; capital = 0; break }
      wins++
    }
  }

  if (position > 0 && !blown) {
    capital = position * prices[prices.length - 1] * (1 - spread)
    if (capital <= 0) { blown = true; capital = 0 }
  }

  const totalReturn = blown ? -100 : ((capital - initialCapital) / initialCapital) * 100

  return {
    strategy: name,
    totalReturn: totalReturn.toFixed(2),
    finalCapital: blown ? '0.00' : capital.toFixed(2),
    maxDrawdown: maxDrawdown.toFixed(2),
    totalTrades: trades,
    winRate: trades > 0 ? ((wins / trades) * 100).toFixed(1) : '0.0',
    blown
  }
}

export const STRATEGIES = strategies
