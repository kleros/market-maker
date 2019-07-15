#!/usr/bin/env node
const commander = require('commander')

const ethfinexAutoMarketMake = require('./src/ethfinex-market-maker')
  .autoMarketMake
const idexAutoMarketMake = require('./src/idex-market-maker').autoMarketMake

// Globals
commander.version(require('./package.json').version)

commander
  .command('ethfinex-market-maker <steps> <size> <spread>')
  .action((steps, size, spread) => ethfinexAutoMarketMake(steps, size, spread))

commander
  .command('idex-market-maker <address> <private_key> <steps> <size> <spread>')
  .action((address, privateKey, steps, size, spread) =>
    autoMarketMake(address, privateKey, steps, size, spread)
  )

// Handle unknown commands
commander.on('command:*', () => {
  console.error(
    `\nInvalid command: "${commander.args.join(
      ' '
    )}".\nSee --help for a list of available commands.\n`
  )
  process.exit(1)
})

// Run
commander.parse(process.argv)

// Require command
if (commander.args.length === 0) commander.help()
