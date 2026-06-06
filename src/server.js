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
  const botInfo = bot.getInfo()
  res.json({
    token: c.token ? c.token.substring(0, 8) + '...' : '',
    accountId: c.accountId,
    pair: c.pair,
    granularity: c.granularity,
    strategy: botInfo.strategy,
    strategyFamily: c.strategyFamily || 'rsi',
    strategyParams: c.strategyParams || '19,35,75',
    lotSize: c.lotSize
  })
})

app.post('/api/config', (req, res) => {
  const family = req.body.strategyFamily || 'sma'
  const paramsStr = req.body.strategyParams || '5,20'
  const token = req.body.token || process.env.OANDA_TOKEN

  const cfg = {
    token,
    accountId: req.body.accountId || process.env.OANDA_ACCOUNT_ID,
    pair: req.body.pair || process.env.BOT_PAIR || 'USD/JPY',
    granularity: req.body.granularity || process.env.BOT_GRANULARITY || 'D',
    strategyFamily: family,
    strategyParams: paramsStr,
    lotSize: parseFloat(req.body.lotSize || process.env.BOT_LOT_SIZE || '0.01')
  }

  setBotConfig(cfg)

  if (bot.status === 'running') {
    bot.stop()
    bot.start().catch(err => console.error(err))
  }

  res.json({
    status: 'saved',
    config: {
      ...cfg,
      strategy: `${family} ${paramsStr}`,
      token: token ? token.substring(0, 8) + '...' : ''
    }
  })
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
