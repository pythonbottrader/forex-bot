import { config } from 'dotenv'
config()

import { Oanda } from './oanda.js'
import { sma, SIGNAL } from './strategies.js'

let savedCfg = null

export function setBotConfig(cfg) {
  savedCfg = cfg
}

export function getBotConfig() {
  return savedCfg || {
    token: process.env.OANDA_TOKEN || '',
    accountId: process.env.OANDA_ACCOUNT_ID || '',
    pair: process.env.BOT_PAIR || 'USD/JPY',
    granularity: process.env.BOT_GRANULARITY || 'D',
    smaFast: parseInt(process.env.BOT_SMA_FAST || '5'),
    smaSlow: parseInt(process.env.BOT_SMA_SLOW || '20'),
    lotSize: parseFloat(process.env.BOT_LOT_SIZE || '0.01')
  }
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
    this.smaFast = cfg.smaFast
    this.smaSlow = cfg.smaSlow
    this.api = new Oanda({ token: cfg.token, accountId: cfg.accountId })
  }

  getInfo() {
    const cfg = getBotConfig()
    return {
      pair: cfg.pair,
      instrument: this.instr || cfg.pair.replace('/', '_'),
      granularity: cfg.granularity,
      strategy: `SMA ${cfg.smaFast}x${cfg.smaSlow}`,
      lotSize: cfg.lotSize,
      status: this.status,
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

    await this.updateAccount()
    await this.updateCandles()
    await this.checkPosition()
    await this.evaluate()

    this.timer = setInterval(() => this.tick(), 300000)
  }

  stop() {
    this.status = 'stopped'
    if (this.timer) { clearInterval(this.timer); this.timer = null }
  }

  async tick() {
    if (this.status !== 'running') return
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
    } catch (err) {
      console.error(`[BOT] Erro conta: ${err.message}`)
    }
  }

  async updateCandles() {
    try {
      const needed = Math.max(this.smaSlow + 20, 100)
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
    if (this.candles.length < this.smaSlow + 2) return
    const complete = this.candles.filter(c => c.complete)
    if (complete.length < this.smaSlow + 2) return

    const prices = complete.map(c => c.close)
    const fast = sma(prices, this.smaFast)
    const slow = sma(prices, this.smaSlow)
    const lastIdx = prices.length - 1

    if (fast[lastIdx] === null || slow[lastIdx] === null) return
    const prevFast = fast[lastIdx - 1], prevSlow = slow[lastIdx - 1]

    if (fast[lastIdx] > slow[lastIdx] && prevFast <= prevSlow) {
      this.lastSignal = SIGNAL.BUY
      if (!this.position) await this.enterLong()
    } else if (fast[lastIdx] < slow[lastIdx] && prevFast >= prevSlow) {
      this.lastSignal = SIGNAL.SELL
      if (this.position) await this.exitLong()
    } else {
      this.lastSignal = SIGNAL.HOLD
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
