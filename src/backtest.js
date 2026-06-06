import { config } from 'dotenv'
config()

import { Oanda } from './oanda.js'
import { evaluateStrategy, STRATEGIES } from './strategies.js'

export class Backtest {
  constructor(options = {}) {
    this.pair = (options.pair || process.env.PAIR || 'EUR/USD').split('/')
    this.base = this.pair[0]
    this.quote = this.pair[1]
    this.startDate = options.startDate || process.env.START_DATE || '2024-01-01'
    this.endDate = options.endDate || process.env.END_DATE || '2025-01-01'
    this.initialCapital = parseFloat(options.initialCapital || process.env.INITIAL_CAPITAL || '10000')
    this.granularity = options.granularity || process.env.GRANULARITY || 'D'
    this.leverage = parseFloat(options.leverage || process.env.LEVERAGE || '1')
    this.api = new Oanda()
  }

  getGranularityLabel(g) {
    const map = { D: 'diario', H4: '4h', H1: '1h', M30: '30min', M15: '15min', M5: '5min' }
    return map[g] || g
  }

  async run() {
    const glabel = this.getGranularityLabel(this.granularity)
    console.log(`\n══════════════════════════════════════════`)
    console.log(`  FOREX BACKTEST - OANDA`)
    console.log(`  Par: ${this.base}/${this.quote}`)
    console.log(`  Timeframe: ${glabel}  |  Alavancagem: ${this.leverage}x`)
    console.log(`  Período: ${this.startDate} a ${this.endDate}`)
    console.log(`  Capital Inicial: $${this.initialCapital.toFixed(2)}`)
    console.log(`══════════════════════════════════════════\n`)

    console.log('Baixando dados históricos...')
    const rates = await this.api.fetchRatesForPeriod(
      this.base, this.quote, this.startDate, this.endDate, this.granularity
    )

    if (rates.length < 50) {
      console.error('Poucos dados para o período.')
      return
    }

    console.log(`  ${rates.length} candles carregados\n`)
    console.log(`  Preço inicial: ${rates[0].close}  /  Preço final: ${rates[rates.length - 1].close}\n`)

    const prices = rates.map(r => r.close)
    const highs = rates.map(r => r.high)
    const lows = rates.map(r => r.low)
    const buyHold = ((prices[prices.length - 1] - prices[0]) / prices[0]) * 100
    const bhComLeverage = buyHold * this.leverage

    const results = []
    for (const [name, strategyFn] of Object.entries(STRATEGIES)) {
      const signals = strategyFn(prices, highs, lows)
      const result = evaluateStrategy(name, prices, signals, this.initialCapital, 0.0002, this.leverage)
      results.push(result)
    }

    results.sort((a, b) => parseFloat(b.totalReturn) - parseFloat(a.totalReturn))

    console.log('────────────────────────────────────────')
    console.log('  RESULTADOS (ORDENADOS)')
    console.log('────────────────────────────────────────')
    console.log(`  Buy & Hold ${this.leverage}x:  ${bhComLeverage.toFixed(2)}%\n`)

    for (const r of results) {
      const blown = r.blown ? ' 💀' : ''
      console.log(`  ${r.strategy}${blown}`)
      console.log(`    Retorno:          ${r.totalReturn}%`)
      console.log(`    Capital Final:    $${r.finalCapital}`)
      console.log(`    Max Drawdown:     ${r.maxDrawdown}%`)
      console.log(`    Trades:           ${r.totalTrades}  |  Win Rate: ${r.winRate}%\n`)
    }
    console.log('────────────────────────────────────────\n')
    console.log(`  Melhor: ${results[0].strategy} (${results[0].totalReturn}%)`)
    console.log()
  }
}
