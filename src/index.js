#!/usr/bin/env node

import { config } from 'dotenv'
config()

import { Backtest } from './backtest.js'

const backtest = new Backtest()
backtest.run().catch(err => {
  console.error('Erro:', err.message)
  process.exit(1)
})
