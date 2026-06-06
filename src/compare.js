#!/usr/bin/env node

import { config } from 'dotenv'
config()

import { Oanda } from './oanda.js'
import { evaluateStrategy, STRATEGIES } from './strategies.js'

const PAIRS = [
  'EUR/USD', 'GBP/USD', 'USD/JPY', 'USD/CHF',
  'AUD/USD', 'USD/CAD', 'NZD/USD',
  'EUR/GBP', 'EUR/JPY', 'GBP/JPY',
  'EUR/CHF', 'GBP/AUD', 'AUD/JPY',
  'EUR/AUD', 'NZD/JPY', 'CHF/JPY'
]

const startDate = process.env.START_DATE || '2023-01-01'
const endDate = process.env.END_DATE || '2025-01-01'
const initialCapital = parseFloat(process.env.INITIAL_CAPITAL || '10000')
const api = new Oanda()

function rankResults(results) {
  return [...results].sort((a, b) => parseFloat(b.bestReturn) - parseFloat(a.bestReturn))
}

async function testPair(pair) {
  const [base, quote] = pair.split('/')

  try {
    const rates = await api.fetchRatesForPeriod(base, quote, startDate, endDate)
    if (rates.length < 50) return null

    const prices = rates.map(r => r.rate)
    const buyHold = ((prices[prices.length - 1] - prices[0]) / prices[0]) * 100

    const pairResults = []
    for (const [name, strategyFn] of Object.entries(STRATEGIES)) {
      try {
        const signals = strategyFn(prices)
        const result = evaluateStrategy(name, prices, signals, initialCapital)
        pairResults.push(result)
      } catch { }
    }

    pairResults.sort((a, b) => parseFloat(b.totalReturn) - parseFloat(a.totalReturn))
    const best = pairResults[0]

    return {
      pair,
      candles: rates.length,
      buyHold: buyHold.toFixed(2),
      bestStrategy: best?.strategy || '-',
      bestReturn: best?.totalReturn || '0.00',
      bestTrades: best?.totalTrades || 0
    }
  } catch (err) {
    console.error(`  ${pair}: erro - ${err.message}`)
    return null
  }
}

console.log('\n═══════════════════════════════════════════════════════════')
console.log('  COMPARACAO ENTRE PARES FOREX - OANDA')
console.log(`  Periodo: ${startDate} a ${endDate}`)
console.log('═══════════════════════════════════════════════════════════\n')

const results = []
for (let i = 0; i < PAIRS.length; i++) {
  const pair = PAIRS[i]
  process.stdout.write(`  [${i + 1}/${PAIRS.length}] ${pair}...`)
  const result = await testPair(pair)
  if (result) {
    results.push(result)
    console.log(` ${result.candles} candles | B&H: ${result.buyHold}% | Melhor: ${result.bestStrategy} (${result.bestReturn}%)`)
  } else {
    console.log(' sem dados')
  }
}

const ranked = rankResults(results)

console.log('\n═══════════════════════════════════════════════════════════')
console.log('  RANKING POR RETORNO')
console.log('═══════════════════════════════════════════════════════════\n')
console.log('  #  Par        B&H      Melhor Estrategia         Retorno  Trades')
console.log('  ────────────────────────────────────────────────────────────────')

ranked.forEach((r, i) => {
  const pair = r.pair.padEnd(9)
  const bh = r.buyHold.padStart(6)
  const strat = r.bestStrategy.padEnd(24)
  const ret = r.bestReturn.padStart(7)
  const trades = String(r.bestTrades).padStart(4)
  console.log(`  ${i + 1}. ${pair} ${bh}%  ${strat} ${ret}%  ${trades}x`)
})

console.log('\n═══════════════════════════════════════════════════════════\n')
