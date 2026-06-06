import { config } from 'dotenv'
config()

import { Oanda } from './oanda.js'
import { SIGNAL } from './strategies.js'
import {
  makeSmaCross, makeEmaCross, makeMacdCross, makeMacdZeroCross,
  makeRsi, makeStoch, makeAdxCross, makeCci, makeWilliams,
  makeMacdRsi, makeSmaRsi, makeTripleMa, makeBollingerRsi,
  makeAdxSma, makeStochRsi
} from './strategies.js'

const FACTORIES = {
  sma:        makeSmaCross,
  ema:        makeEmaCross,
  macd:       makeMacdCross,
  macdz:      makeMacdZeroCross,
  rsi:        makeRsi,
  stoch:      makeStoch,
  adx:        makeAdxCross,
  cci:        makeCci,
  williams:   makeWilliams,
  macdrsi:    makeMacdRsi,
  smarsi:     makeSmaRsi,
  triplema:   makeTripleMa,
  bollrsi:    makeBollingerRsi,
  adxsma:     makeAdxSma,
  stochrsi:   makeStochRsi
}

const FAMILY_LABELS = {
  sma: 'SMA', ema: 'EMA', macd: 'MACD', macdz: 'MACD Zero',
  rsi: 'RSI', stoch: 'Stoch', adx: 'ADX', cci: 'CCI',
  williams: 'Williams', macdrsi: 'MACD+RSI', smarsi: 'SMA+RSI',
  triplema: 'Triple MA', bollrsi: 'Boll+RSI', adxsma: 'ADX+SMA',
  stochrsi: 'Stoch+RSI'
}

let savedCfg = null

export function setBotConfig(cfg) {
  savedCfg = cfg
}

export function getBotConfig() {
  const def = {
    token: process.env.OANDA_TOKEN || '',
    accountId: process.env.OANDA_ACCOUNT_ID || '',
    pair: process.env.BOT_PAIR || 'USD/JPY',
    granularity: process.env.BOT_GRANULARITY || 'D',
    lotSize: parseFloat(process.env.BOT_LOT_SIZE || '0.01')
  }
  if (savedCfg) {
    def.token = savedCfg.token || def.token
    def.accountId = savedCfg.accountId || def.accountId
    def.pair = savedCfg.pair || def.pair
    def.granularity = savedCfg.granularity || def.granularity
    def.lotSize = savedCfg.lotSize ?? def.lotSize
    def.strategyFamily = savedCfg.strategyFamily || def.strategyFamily
    def.strategyParams = savedCfg.strategyParams || def.strategyParams
    def.strategyLabel = savedCfg.strategyLabel || def.strategyLabel
    return def
  }
  def.strategyFamily = process.env.BOT_STRATEGY_FAMILY || 'rsi'
  def.strategyParams = process.env.BOT_STRATEGY_PARAMS || '19,35,75'
  def.strategyLabel = 'RSI 19 (35/75)'
  return def
}

function buildStrategy(family, paramsStr) {
  const fn = FACTORIES[family]
  if (!fn) return null
  const values = paramsStr.split(',').map(v => {
    const n = parseFloat(v)
    return isNaN(n) ? v : n
  })
  return fn(...values)
}

export class Bot {
  constructor() {
    this.status = 'stopped'
    this.position = null
    this.trades = []
    this.candles = []
    this.account = { balance: 0, equity: 0, pl: 0 }
    this.lastSignal = SIGNAL.HOLD
    this.lastChecked = null
    this.timer = null
    this.cfg = getBotConfig()
    this.api = null
    this.strategyFn = null
    this.equityHistory = []
    this.initialCapital = 0
  }

  _initApi() {
    const cfg = getBotConfig()
    this.cfg = cfg
    const [base, quote] = cfg.pair.split('/')
    this.base = base
    this.quote = quote
    this.instr = `${base}_${quote}`
    this.granularity = cfg.granularity
    this.lotSize = cfg.lotSize
    this.api = new Oanda({ token: cfg.token, accountId: cfg.accountId })
    this.strategyFn = buildStrategy(cfg.strategyFamily || 'sma', cfg.strategyParams || '5,20')
    if (!this.strategyFn) {
      this.strategyFn = makeSmaCross(5, 20)
      cfg.strategyFamily = 'sma'
      cfg.strategyParams = '5,20'
    }
  }

  getInfo() {
    const cfg = getBotConfig()
    const family = cfg.strategyFamily || 'sma'
    const label = cfg.strategyLabel || `${FAMILY_LABELS[family] || family} ${cfg.strategyParams || ''}`
    return {
      pair: cfg.pair,
      instrument: this.instr || cfg.pair.replace('/', '_'),
      granularity: cfg.granularity,
      strategy: label,
      strategyFamily: family,
      strategyParams: cfg.strategyParams,
      lotSize: cfg.lotSize,
      status: this.status,
      marketOpen: this.isMarketOpen(),
      position: this.position,
      trades: this.trades.slice(-50),
      lastSignal: this.lastSignal,
      lastChecked: this.lastChecked,
      account: this.account,
      candleCount: this.candles.length,
      config: {
        token: cfg.token ? cfg.token.substring(0, 8) + '...' : '',
        accountId: cfg.accountId || ''
      }
    }
  }

  getCandles() {
    return this.candles.slice(-300)
  }

  getPlHistory() {
    let cumPl = 0
    const tradePl = this.trades
      .filter(t => t.type === 'SELL' && t.pl !== undefined)
      .map(t => {
        cumPl += t.pl
        return { time: t.time, pl: t.pl, cumulative: cumPl }
      })
    return {
      initialCapital: this.initialCapital,
      currentEquity: this.account.equity,
      currentBalance: this.account.balance,
      totalPl: cumPl,
      tradePl,
      equityHistory: this.equityHistory.slice(-500)
    }
  }

  isMarketOpen() {
    const now = new Date()
    const utcDay = now.getUTCDay()
    const utcHour = now.getUTCHours()
    const utcMin = now.getUTCMinutes()
    const utcTotal = utcHour * 60 + utcMin
    const openTime = 22 * 60
    const closeTime = 22 * 60
    if (utcDay === 6) return false
    if (utcDay === 0 && utcTotal < openTime) return false
    if (utcDay === 5 && utcTotal >= closeTime) return false
    return true
  }

  async start() {
    if (this.status === 'running') return
    try {
      this._initApi()
    } catch (err) {
      throw new Error(`Config invalida: ${err.message}`)
    }
    this.status = 'running'
    this.trades = []
    this.position = null
    this.candles = []

    if (!this.isMarketOpen()) {
      console.log('[BOT] Mercado fechado. Aguardando abertura...')
    } else {
      await this.updateAccount()
      await this.updateCandles()
      await this.checkPosition()
      await this.evaluate()
    }

    this.timer = setInterval(() => this.tick(), 300000)
  }

  stop() {
    this.status = 'stopped'
    if (this.timer) { clearInterval(this.timer); this.timer = null }
  }

  async tick() {
    if (this.status !== 'running') return
    if (!this.isMarketOpen()) return
    try {
      await this.updateAccount()
      await this.updateCandles()
      await this.checkPosition()
      await this.evaluate()
    } catch (err) {
      console.error(`[BOT] Erro: ${err.message}`)
    }
  }

  async updateAccount() {
    try {
      const summary = await this.api.getAccountSummary()
      this.account = {
        balance: parseFloat(summary.account.balance),
        equity: parseFloat(summary.account.NAV),
        pl: parseFloat(summary.account.pl),
        marginUsed: parseFloat(summary.account.marginUsed),
        marginAvailable: parseFloat(summary.account.marginAvailable)
      }
      if (this.initialCapital === 0) this.initialCapital = this.account.balance
      this.equityHistory.push({
        time: new Date().toISOString(),
        equity: this.account.equity,
        balance: this.account.balance
      })
      if (this.equityHistory.length > 1000) this.equityHistory.splice(0, 100)
    } catch (err) {
      console.error(`[BOT] Erro conta: ${err.message}`)
    }
  }

  async updateCandles() {
    try {
      const needed = 200
      const data = await this.api.fetchLatestCandles(this.base, this.quote, needed, this.granularity)
      this.candles = data
      this.lastChecked = new Date().toISOString()
    } catch (err) {
      console.error(`[BOT] Erro candles: ${err.message}`)
    }
  }

  async checkPosition() {
    try {
      const pos = await this.api.getOpenPositions()
      const open = pos.positions?.find(p => p.instrument === this.instr)

      if (open) {
        const units = parseFloat(open.long?.units || '0')
        if (units > 0) {
          const avgPrice = parseFloat(open.long?.averagePrice || '0')
          const last = this.candles[this.candles.length - 1]
          const currentPrice = last ? last.close : avgPrice
          this.position = {
            units,
            avgPrice,
            currentPrice,
            pl: parseFloat(open.long?.unrealizedPL || '0'),
            since: this.position?.since || new Date().toISOString()
          }
          return
        }
      }
      this.position = null
    } catch (err) {
      console.error(`[BOT] Erro posicao: ${err.message}`)
    }
  }

  async evaluate() {
    if (!this.strategyFn || this.candles.length < 30) return
    const complete = this.candles.filter(c => c.complete)
    if (complete.length < 30) return

    const prices = complete.map(c => c.close)
    const highs = complete.map(c => c.high)
    const lows = complete.map(c => c.low)

    const signals = this.strategyFn(prices, highs, lows)
    const lastIdx = signals.length - 1
    if (lastIdx < 0 || signals[lastIdx] === null || signals[lastIdx] === undefined) return

    const sig = signals[lastIdx]
    this.lastSignal = sig

    if (sig === SIGNAL.BUY && !this.position) {
      await this.enterLong()
    } else if (sig === SIGNAL.SELL && this.position) {
      await this.exitLong()
    }
  }

  async enterLong() {
    try {
      const units = Math.round(this.lotSize * 100000)
      const result = await this.api.placeMarketOrder(this.instr, units)
      const order = result.orderFillTransaction || result.orderCreateTransaction
      const price = parseFloat(order?.price || order?.units || '0')

      this.trades.push({
        type: 'BUY', units, price,
        time: new Date().toISOString(),
        id: result?.orderFillTransaction?.id || ''
      })
      console.log(`[BOT] BUY ${units} ${this.instr} @ ${price}`)
      await this.checkPosition()
    } catch (err) {
      console.error(`[BOT] Erro compra: ${err.message}`)
    }
  }

  async exitLong() {
    try {
      const result = await this.api.closePosition(this.instr)
      const price = parseFloat(result?.longOrderFillTransaction?.price || '0')

      this.trades.push({
        type: 'SELL', units: this.position?.units || 0, price,
        time: new Date().toISOString(),
        pl: this.position?.pl || 0,
        id: result?.longOrderFillTransaction?.id || ''
      })
      console.log(`[BOT] SELL ${this.instr} @ ${price} PL: ${this.position?.pl || 0}`)
      this.position = null
    } catch (err) {
      console.error(`[BOT] Erro venda: ${err.message}`)
    }
  }
}
