import { config } from 'dotenv'
config()

import express from 'express'
import { Bot, setBotConfig, getBotConfig } from './bot.js'

const PORT = parseInt(process.env.PORT || process.env.BOT_PORT || '3000')
const app = express()
const bot = new Bot()

app.get('/', (req, res) => res.redirect('/dashboard.html'))
app.use(express.json())
app.use(express.static('public'))

app.get('/api/status', (req, res) => res.json(bot.getInfo()))

app.get('/api/candles', (req, res) => res.json(bot.getCandles()))

app.get('/api/config', (req, res) => {
  const c = getBotConfig()
  res.json({
    token: c.token ? c.token.substring(0, 8) + '...' : '',
    accountId: c.accountId,
    pair: c.pair,
    granularity: c.granularity,
    strategy: c.smaFast + ',' + c.smaSlow,
    lotSize: c.lotSize
  })
})

app.post('/api/config', (req, res) => {
  const strategy = req.body.strategy || (req.body.smaFast
    ? req.body.smaFast + ',' + req.body.smaSlow
    : null)

  let smaFast, smaSlow
  if (strategy) {
    const parts = strategy.split(',').map(Number)
    smaFast = parts[0]
    smaSlow = parts[1] || parts[0] * 4
  }

  const cfg = {
    token: req.body.token || process.env.OANDA_TOKEN,
    accountId: req.body.accountId || process.env.OANDA_ACCOUNT_ID,
    pair: req.body.pair || process.env.BOT_PAIR || 'USD/JPY',
    granularity: req.body.granularity || process.env.BOT_GRANULARITY || 'D',
    smaFast: smaFast || parseInt(process.env.BOT_SMA_FAST || '5'),
    smaSlow: smaSlow || parseInt(process.env.BOT_SMA_SLOW || '20'),
    lotSize: parseFloat(req.body.lotSize || process.env.BOT_LOT_SIZE || '0.01')
  }
  setBotConfig(cfg)

  if (bot.status === 'running') {
    bot.stop()
    bot.start().catch(err => console.error(err))
  }

  res.json({ status: 'saved', config: { ...cfg, token: cfg.token ? cfg.token.substring(0, 8) + '...' : '' } })
})

app.post('/api/start', async (req, res) => {
  try {
    await bot.start()
    res.json({ status: 'started' })
  } catch (err) {
    res.status(400).json({ status: 'error', message: err.message })
  }
})

app.post('/api/stop', (req, res) => {
  bot.stop()
  res.json({ status: 'stopped' })
})

app.listen(PORT, () => {
  console.log(`\n══════════════════════════════════════════`)
  console.log(`  FOREX BOT - OANDA`)
  console.log(`  Dashboard: http://localhost:${PORT}/dashboard.html`)
  console.log(`══════════════════════════════════════════\n`)
})
