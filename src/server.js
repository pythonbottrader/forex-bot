import { config } from 'dotenv'
config()

import express from 'express'
import { Bot } from './bot.js'

const PORT = parseInt(process.env.BOT_PORT || '3000')
const app = express()
const bot = new Bot()

app.use(express.static('public'))

app.get('/api/status', (req, res) => res.json(bot.getInfo()))

app.get('/api/candles', (req, res) => res.json(bot.getCandles()))

app.post('/api/start', async (req, res) => {
  await bot.start()
  res.json({ status: 'started' })
})

app.post('/api/stop', (req, res) => {
  bot.stop()
  res.json({ status: 'stopped' })
})

app.listen(PORT, () => {
  console.log(`\n══════════════════════════════════════════`)
  console.log(`  FOREX BOT - OANDA`)
  console.log(`  Dashboard: http://localhost:${PORT}`)
  console.log(`  Par: ${process.env.BOT_PAIR || 'USD/JPY'}`)
  console.log(`  Estrategia: SMA ${process.env.BOT_SMA_FAST || '5'}x${process.env.BOT_SMA_SLOW || '20'}`)
  console.log(`  Timeframe: ${process.env.BOT_GRANULARITY || 'D'}`)
  console.log(`══════════════════════════════════════════\n`)
})
