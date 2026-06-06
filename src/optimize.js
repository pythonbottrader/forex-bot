import { config } from 'dotenv'
config()

import { Oanda } from './oanda.js'
import { evaluateStrategy } from './strategies.js'
import {
  makeSmaCross, makeEmaCross, makeMacdCross, makeMacdZeroCross,
  makeRsi, makeStoch, makeAdxCross, makeCci, makeWilliams,
  makeMacdRsi, makeSmaRsi, makeTripleMa, makeBollingerRsi,
  makeAdxSma, makeStochRsi
} from './strategies.js'

const FAMILIES = {
  sma: {
    label: 'SMA Cross',
    factory: makeSmaCross,
    params: [
      { key: 'fast', values: range(3, 30, 2) },
      { key: 'slow', values: range(10, 200, 10) }
    ],
    constraint: p => p.slow > p.fast
  },
  ema: {
    label: 'EMA Cross',
    factory: makeEmaCross,
    params: [
      { key: 'fast', values: range(3, 30, 2) },
      { key: 'slow', values: range(10, 200, 10) }
    ],
    constraint: p => p.slow > p.fast
  },
  macd: {
    label: 'MACD',
    factory: makeMacdCross,
    params: [
      { key: 'fast', values: range(5, 20, 3) },
      { key: 'slow', values: range(10, 50, 5) },
      { key: 'sigPeriod', values: [5, 9, 12, 15] }
    ],
    constraint: p => p.slow > p.fast
  },
  rsi: {
    label: 'RSI',
    factory: makeRsi,
    params: [
      { key: 'period', values: range(5, 21, 2) },
      { key: 'oversold', values: range(15, 35, 5) },
      { key: 'overbought', values: range(65, 85, 5) }
    ],
    constraint: p => p.overbought > p.oversold
  },
  stoch: {
    label: 'Stochastic',
    factory: makeStoch,
    params: [
      { key: 'kPeriod', values: [5, 9, 14, 21] },
      { key: 'dPeriod', values: [3, 5, 10] },
      { key: 'oversold', values: [15, 20, 25] },
      { key: 'overbought', values: [75, 80, 85] }
    ],
    constraint: p => p.overbought > p.oversold
  },
  adx: {
    label: 'ADX',
    factory: makeAdxCross,
    params: [
      { key: 'period', values: range(7, 21, 2) }
    ]
  },
  cci: {
    label: 'CCI',
    factory: makeCci,
    params: [
      { key: 'period', values: [7, 10, 14, 20] },
      { key: 'lower', values: [-150, -100, -75, -50] },
      { key: 'upper', values: [50, 75, 100, 150] }
    ],
    constraint: p => p.upper > p.lower
  },
  williams: {
    label: 'Williams %R',
    factory: makeWilliams,
    params: [
      { key: 'period', values: range(7, 21, 2) }
    ]
  },
  macdrsi: {
    label: 'MACD + RSI',
    factory: makeMacdRsi,
    params: [
      { key: 'macdFast', values: [8, 12, 16] },
      { key: 'macdSlow', values: [17, 26, 35] },
      { key: 'macdSig', values: [5, 9, 15] },
      { key: 'rsiPeriod', values: [7, 14, 21] },
      { key: 'rsiLower', values: [30, 40, 50] },
      { key: 'rsiUpper', values: [50, 60, 70] }
    ],
    constraint: p => p.macdSlow > p.macdFast && p.rsiUpper > p.rsiLower
  },
  smarsi: {
    label: 'SMA + RSI',
    factory: makeSmaRsi,
    params: [
      { key: 'smaFast', values: [5, 10, 20] },
      { key: 'smaSlow', values: [20, 50, 100, 200] },
      { key: 'rsiPeriod', values: [7, 14, 21] },
      { key: 'rsiThreshold', values: [40, 50, 60] }
    ],
    constraint: p => p.smaSlow > p.smaFast
  },
  triplema: {
    label: 'Triple MA',
    factory: makeTripleMa,
    params: [
      { key: 'short', values: [3, 5, 8, 10] },
      { key: 'mid', values: [10, 20, 30, 50] },
      { key: 'long', values: [50, 100, 150, 200] }
    ],
    constraint: p => p.short < p.mid && p.mid < p.long
  },
  bollrsi: {
    label: 'Bollinger + RSI',
    factory: makeBollingerRsi,
    params: [
      { key: 'bollPeriod', values: [10, 20, 30] },
      { key: 'bollStd', values: [1, 1.5, 2, 2.5, 3] },
      { key: 'rsiPeriod', values: [7, 14, 21] },
      { key: 'rsiLower', values: [25, 30, 35] },
      { key: 'rsiUpper', values: [65, 70, 75] }
    ],
    constraint: p => p.rsiUpper > p.rsiLower
  },
  adxsma: {
    label: 'ADX + SMA',
    factory: makeAdxSma,
    params: [
      { key: 'adxPeriod', values: [7, 14, 21] },
      { key: 'smaFast', values: [5, 10, 20] },
      { key: 'smaSlow', values: [20, 50, 100] },
      { key: 'adxThreshold', values: [20, 25, 30] }
    ],
    constraint: p => p.smaSlow > p.smaFast
  },
  stochrsi: {
    label: 'Stoch + RSI',
    factory: makeStochRsi,
    params: [
      { key: 'kPeriod', values: [9, 14, 21] },
      { key: 'dPeriod', values: [3, 5] },
      { key: 'rsiPeriod', values: [7, 14, 21] },
      { key: 'stochLower', values: [15, 20, 25] },
      { key: 'stochUpper', values: [75, 80, 85] },
      { key: 'rsiLower', values: [25, 30, 40] },
      { key: 'rsiUpper', values: [60, 70, 75] }
    ],
    constraint: p => p.stochUpper > p.stochLower && p.rsiUpper > p.rsiLower
  }
}

function range(start, end, step) {
  const r = []
  for (let v = start; v <= end; v += step) r.push(v)
  return r
}

function* cartesian(arrays) {
  if (arrays.length === 0) { yield []; return }
  const [first, ...rest] = arrays
  for (const v of first) {
    for (const tail of cartesian(rest)) {
      yield [v, ...tail]
    }
  }
}

function combinations(familyDef) {
  const keys = familyDef.params.map(p => p.key)
  const valueSets = familyDef.params.map(p => p.values)
  const combos = []
  for (const values of cartesian(valueSets)) {
    const params = Object.fromEntries(keys.map((k, i) => [k, values[i]]))
    if (familyDef.constraint && !familyDef.constraint(params)) continue
    const label = keys.map(k => params[k]).join('/')
    combos.push({ params, label })
  }
  return combos
}

async function main() {
  const args = process.argv.slice(2)
  const familyName = args[0] || 'sma'
  const pair = args[1] || process.env.PAIR || 'USD/JPY'
  const granularity = args[2] || process.env.GRANULARITY || 'D'
  const startDate = args[3] || process.env.START_DATE || '2023-01-01'
  const endDate = args[4] || process.env.END_DATE || '2025-01-01'
  const leverage = parseFloat(args[5] || process.env.LEVERAGE || '1')
  const topN = parseInt(args[6] || '10', 10)

  const familyDef = FAMILIES[familyName]
  if (!familyDef) {
    console.error(`Unknown family: ${familyName}`)
    console.error(`Available: ${Object.keys(FAMILIES).join(', ')}`)
    process.exit(1)
  }

  const [base, quote] = pair.split('/')
  const api = new Oanda()

  console.log(`\n════════════════════════════════════════════════════`)
  console.log(`  STRATEGY OPTIMIZER — ${familyDef.label}`)
  console.log(`  ${pair}  ${granularity}  |  Alavancagem: ${leverage}x`)
  console.log(`  Período: ${startDate} a ${endDate}`)
  console.log(`════════════════════════════════════════════════════\n`)

  console.log('Baixando dados históricos...')
  const rates = await api.fetchRatesForPeriod(base, quote, startDate, endDate, granularity)
  if (rates.length < 50) {
    console.error('Poucos dados.')
    process.exit(1)
  }
  console.log(`  ${rates.length} candles carregados\n`)

  const prices = rates.map(r => r.close)
  const highs = rates.map(r => r.high)
  const lows = rates.map(r => r.low)

  const combos = combinations(familyDef)
  console.log(`Testando ${combos.length} combinações...\n`)

  const results = []
  for (const combo of combos) {
    const strategyFn = familyDef.factory(...Object.values(combo.params))
    const signals = strategyFn(prices, highs, lows)
    const result = evaluateStrategy(combo.label, prices, signals, 10000, 0.0002, leverage)
    result.params = JSON.stringify(combo.params)
    results.push(result)
  }

  results.sort((a, b) => parseFloat(b.totalReturn) - parseFloat(a.totalReturn))

  console.log(`─── TOP ${topN} ───\n`)
  for (let i = 0; i < Math.min(topN, results.length); i++) {
    const r = results[i]
    console.log(`  #${i + 1}  ${r.strategy}`)
    console.log(`      Params:        ${r.params}`)
    console.log(`      Retorno:       ${r.totalReturn}%`)
    console.log(`      Capital Final: $${r.finalCapital}`)
    console.log(`      Max Drawdown:  ${r.maxDrawdown}%`)
    console.log(`      Trades:        ${r.totalTrades}  |  Win Rate: ${r.winRate}%`)
    if (r.blown) console.log('      💀 ACCOUNT BLOWN')
    console.log()
  }
  console.log(`  Total testado: ${results.length} combinações`)
  console.log(`  Melhor: ${results[0].strategy} (${results[0].totalReturn}%)`)
  console.log()
}

main().catch(console.error)
