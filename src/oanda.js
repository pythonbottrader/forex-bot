import { config } from 'dotenv'
config()

const API_PRACTICE = 'https://api-fxpractice.oanda.com'
const API_LIVE = 'https://api-fxtrade.oanda.com'

export class Oanda {
  constructor(options = {}) {
    this.token = options.token || process.env.OANDA_TOKEN
    this.accountId = options.accountId || process.env.OANDA_ACCOUNT_ID
    this.isLive = options.live || process.env.OANDA_LIVE === 'true'

    if (!this.token || this.token === 'seu_token_aqui') {
      throw new Error(
        'Token OANDA não configurado.\n' +
        '1. Crie conta demo em https://fxtrade.oanda.com\n' +
        '2. Gere o token em "Manage API Access"\n' +
        '3. Edite o arquivo .env com OANDA_TOKEN e OANDA_ACCOUNT_ID'
      )
    }

    this.baseUrl = this.isLive ? API_LIVE : API_PRACTICE
  }

  async fetchCandles(base, quote, startDate, endDate, granularity = 'D') {
    const instr = this.instrument(base, quote)
    const from = new Date(startDate).toISOString()
    const to = new Date(endDate).toISOString()

    const path = `/v3/instruments/${instr}/candles` +
      `?granularity=${granularity}` +
      `&from=${from}&to=${to}` +
      `&price=M`

    const data = await this._request(path)
    return data
  }

  async fetchRatesForPeriod(base, quote, startDate, endDate, granularity = 'D') {
    const data = await this.fetchCandles(base, quote, startDate, endDate, granularity)

    if (!data.candles || data.candles.length === 0) {
      throw new Error('Nenhum candle retornado pela API OANDA')
    }

    return data.candles
      .map(c => ({
        date: c.time,
        close: parseFloat(c.mid.c),
        high: parseFloat(c.mid.h),
        low: parseFloat(c.mid.l),
        open: parseFloat(c.mid.o),
        complete: c.complete
      }))
  }

  async fetchLatestCandles(base, quote, count = 300, granularity = 'D') {
    const instr = this.instrument(base, quote)
    const path = `/v3/instruments/${instr}/candles` +
      `?granularity=${granularity}&count=${count}&price=M`
    const data = await this._request(path)
    return data.candles.map(c => ({
      date: c.time,
      close: parseFloat(c.mid.c),
      high: parseFloat(c.mid.h),
      low: parseFloat(c.mid.l),
      open: parseFloat(c.mid.o),
      complete: c.complete
    }))
  }

  async getAccountSummary() {
    return this._request(`/v3/accounts/${this.accountId}/summary`)
  }

  async getOpenPositions() {
    return this._request(`/v3/accounts/${this.accountId}/openPositions`)
  }

  async placeMarketOrder(instrument, units) {
    return this._request(`/v3/accounts/${this.accountId}/orders`, {
      method: 'POST',
      body: JSON.stringify({
        order: {
          type: 'MARKET',
          instrument,
          units: String(units)
        }
      })
    })
  }

  async closePosition(instrument) {
    return this._request(`/v3/accounts/${this.accountId}/positions/${instrument}/close`, {
      method: 'PUT',
      body: JSON.stringify({ longUnits: 'ALL' })
    })
  }

  async _request(path, options = {}) {
    const res = await fetch(`${this.baseUrl}${path}`, {
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      },
      ...options
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`OANDA HTTP ${res.status}: ${text}`)
    }
    return res.json()
  }

  instrument(base, quote) {
    return `${base}_${quote}`
  }
}
