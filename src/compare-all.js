#!/usr/bin/env node

import { config } from 'dotenv'
config()

import { Oanda } from './oanda.js'
import { evaluateStrategy, STRATEGIES } from './strategies.js'

const PAIRS = [
  'EUR/USD', 'GBP/USD', 'USD/JPY', 'USD/CHF',
  'AUD/USD', 'USD/CAD', 'NZD/USD',
  'EUR/JPY', 'GBP/JPY', 'CHF/JPY',
  'EUR/GBP', 'AUD/JPY', 'NZD/JPY'
]

const TIMEFRAMES = [
  { id: 'D', label: 'Diario' },
  { id: 'H4', label: '4h' },
  { id: 'H1', label: '1h' },
  { id: 'M30', label: '30min' },
  { id: 'M15', label: '15min' }
]

const LEVERAGES = [1, 2, 3, 5, 10]

const startDate = process.env.START_DATE || '2023-01-01'
const endDate = process.env.END_DATE || '2025-01-01'
const initialCapital = parseFloat(process.env.INITIAL_CAPITAL || '10000')
const api = new Oanda()

function label(pair, tf) {
  return `${pair} ${tf.label}`
}

async function testOne(pair, base, quote, tf) {
  try {
    const rates = await api.fetchRatesForPeriod(base, quote, startDate, endDate, tf.id)
    if (rates.length < 100) return null
    const prices = rates.map(r => r.close)
    const highs = rates.map(r => r.high)
    const lows = rates.map(r => r.low)
    const buyHold = ((prices[prices.length - 1] - prices[0]) / prices[0]) * 100

    let best = null
    for (const [sname, fn] of Object.entries(STRATEGIES)) {
      try {
        const signals = fn(prices, highs, lows)
        const r = evaluateStrategy(sname, prices, signals, initialCapital, 0.0002, 1)
        if (!best || parseFloat(r.totalReturn) > parseFloat(best.totalReturn)) best = r
      } catch {}
    }

    return {
      pair, tf: tf.id, tfLabel: tf.label,
      candles: rates.length, buyHold: buyHold,
      strategy: best.strategy, ret1x: parseFloat(best.totalReturn),
      trades: best.totalTrades,
      dd: parseFloat(best.maxDrawdown)
    }
  } catch {
    return null
  }
}

console.log('\n══════════════════════════════════════════════════════════════════')
console.log('  COMPARACAO COMPLETA: PARES x TIMEFRAMES x ALAVANCAGEM')
console.log(`  Periodo: ${startDate} a ${endDate}`)
console.log('══════════════════════════════════════════════════════════════════\n')

const all = []
let total = PAIRS.length * TIMEFRAMES.length
let done = 0

for (const pair of PAIRS) {
  const [base, quote] = pair.split('/')
  for (const tf of TIMEFRAMES) {
    done++
    process.stdout.write(`  [${done}/${total}] ${pair} ${tf.label}...`)
    const r = await testOne(pair, base, quote, tf)
    if (r) {
      all.push(r)
      console.log(` ${r.candles}c B&H:${r.buyHold.toFixed(1)}% ${r.strategy} ${r.ret1x.toFixed(2)}%`)
    } else {
      console.log(' sem dados')
    }
  }
}

all.sort((a, b) => b.ret1x - a.ret1x)
const top = all.slice(0, 30)

console.log('\n══════════════════════════════════════════════════════════════════')
console.log('  TOP 30 PAR + TIMEFRAME (retorno 1x)')
console.log('══════════════════════════════════════════════════════════════════\n')
console.log('  #  Par       TF      B&H     Estrategia         Ret  Trades  DD')
console.log('  ───────────────────────────────────────────────────────────────')

top.forEach((r, i) => {
  const p = r.pair.padEnd(9)
  const tf = r.tfLabel.padEnd(6)
  const bh = r.buyHold.toFixed(1).padStart(6)
  const s = r.strategy.padEnd(18)
  const ret = r.ret1x.toFixed(2).padStart(7)
  const t = String(r.trades).padStart(4)
  const dd = r.dd.toFixed(1).padStart(5)
  console.log(`  ${(i+1+'').padStart(2)}. ${p} ${tf} ${bh}% ${s} ${ret}% ${t}x ${dd}%`)
})

console.log('\n══════════════════════════════════════════════════════════════════')
console.log('  ALAVANCAGEM: melhores com 1x, 2x, 3x, 5x, 10x')
console.log('══════════════════════════════════════════════════════════════════\n')

for (const lev of LEVERAGES) {
  const withLev = all
    .map(r => ({
      ...r,
      ret: r.ret1x * lev,
      dd: Math.min(r.dd * lev, 100)
    }))
    .filter(r => r.ret > 0)
    .sort((a, b) => b.ret - a.ret)
    .slice(0, 5)

  console.log(`  Alavancagem ${lev}x:`)
  console.log(`  ${'Par'.padStart(9)} ${'TF'.padStart(6)} ${'Ret'.padStart(8)} ${'DD'.padStart(6)}  Estrategia`)
  console.log(`  ${''.padStart(9,'─')} ${''.padStart(6,'─')} ${''.padStart(8,'─')} ${''.padStart(6,'─')} ──────────`)
  for (const r of withLev) {
    const p = r.pair.padStart(9)
    const tf = r.tfLabel.padStart(6)
    const ret = r.ret.toFixed(1).padStart(7)
    const dd = r.dd.toFixed(1).padStart(5)
    console.log(`  ${p} ${tf} ${ret}% ${dd}%  ${r.strategy}`)
  }
  console.log()
}

console.log('══════════════════════════════════════════════════════════════════\n')
