import { config } from 'dotenv'
config()

import { Oanda } from './oanda.js'
import { sma, SIGNAL } from './strategies.js'

const PAIR = (process.env.BOT_PAIR || 'USD/JPY').split('/')
const BASE = PAIR[0], QUOTE = PAIR[1]
const INSTR = `${BASE}_${QUOTE}`
const GRANULARITY = process.env.BOT_GRANULARITY || 'D'
const LOT_SIZE = parseFloat(process.env.BOT_LOT_SIZE || '0.01')
const CHECK_INTERVAL = parseInt(process.env.BOT_CHECK_INTERVAL || '300000')
const SMA_FAST = parseInt(process.env.BOT_SMA_FAST || '5')
const SMA_SLOW = parseInt(process.env.BOT_SMA_SLOW || '20')

export class Bot {
  constructor() {
    this.api = new Oanda()
    this.status = 'stopped'
    this.position = null
    this.trades = []
    this.candles = []
    this.account = { balance: 0, equity: 0, pl: 0 }
    this.lastSignal = SIGNAL.HOLD
    this.lastChecked = null
    this.timer = null
  }

  getInfo() {
    return {
      pair: `${BASE}/${QUOTE}`,
      instrument: INSTR,
      granularity: GRANULARITY,
      strategy: `SMA ${SMA_FAST}x${SMA_SLOW}`,
      lotSize: LOT_SIZE,
      checkInterval: CHECK_INTERVAL,
      status: this.status,
      position: this.position,
      trades: this.trades.slice(-50),
      lastSignal: this.lastSignal,
      lastChecked: this.lastChecked,
      account: this.account,
      candleCount: this.candles.length
    }
  }

  getCandles() {
    return this.candles.slice(-300)
  }

  async start() {
    if (this.status === 'running') return
    this.status = 'running'

    await this.updateAccount()
    await this.updateCandles()
    await this.checkPosition()
    await this.evaluate()

    this.timer = setInterval(() => this.tick(), CHECK_INTERVAL)
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
      const needed = Math.max(SMA_SLOW + 20, 100)
      const data = await this.api.fetchLatestCandles(BASE, QUOTE, needed, GRANULARITY)
      this.candles = data
      this.lastChecked = new Date().toISOString()
    } catch (err) {
      console.error(`[BOT] Erro candles: ${err.message}`)
    }
  }

  async checkPosition() {
    try {
      const instr = this.api.instrument(BASE, QUOTE)
      const pos = await this.api.getOpenPositions()
      const open = pos.positions?.find(p => p.instrument === instr)

      if (open) {
        const units = parseFloat(open.long?.units || '0')
        if (units > 0) {
          const avgPrice = parseFloat(open.long?.averagePrice || '0')
          const currentPrice = this.candles.length > 0 ? this.candles[this.candles.length - 1].close : avgPrice
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
    if (this.candles.length < SMA_SLOW + 2) return

    const complete = this.candles.filter(c => c.complete)
    if (complete.length < SMA_SLOW + 2) return

    const prices = complete.map(c => c.close)
    const fast = sma(prices, SMA_FAST)
    const slow = sma(prices, SMA_SLOW)
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
      const units = Math.round(LOT_SIZE * 100000)
      const instr = this.api.instrument(BASE, QUOTE)
      const result = await this.api.placeMarketOrder(instr, units)
      const order = result.orderFillTransaction || result.orderCreateTransaction
      const price = parseFloat(order?.price || order?.units || '0')

      this.trades.push({
        type: 'BUY',
        units,
        price,
        time: new Date().toISOString(),
        id: result?.orderFillTransaction?.id || ''
      })

      console.log(`[BOT] BUY ${units} ${INSTR} @ ${price}`)
      await this.checkPosition()
    } catch (err) {
      console.error(`[BOT] Erro compra: ${err.message}`)
    }
  }

  async exitLong() {
    try {
      const instr = this.api.instrument(BASE, QUOTE)
      const result = await this.api.closePosition(instr)
      const price = parseFloat(result?.longOrderFillTransaction?.price || '0')

      this.trades.push({
        type: 'SELL',
        units: this.position?.units || 0,
        price,
        time: new Date().toISOString(),
        pl: this.position?.pl || 0,
        id: result?.longOrderFillTransaction?.id || ''
      })

      console.log(`[BOT] SELL ${INSTR} @ ${price} PL: ${this.position?.pl || 0}`)
      this.position = null
    } catch (err) {
      console.error(`[BOT] Erro venda: ${err.message}`)
    }
  }
}
