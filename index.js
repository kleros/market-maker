#!/usr/bin/env node
const commander = require('commander')

const ethfinexAutoMarketMake = require('./src/ethfinex-market-maker')
  .autoMarketMake
const idexAutoMarketMake = require('./src/idex-market-maker').autoMarketMake

// Globals
commander.version(require('./package.json').version)

console.log(`_  _ _    ____ ____ ____ ____    _  _ ____ ____ _  _ ____ ___    _  _ ____ _  _ ____ ____
|_/  |    |___ |__/ |  | [__     |\\/| |__| |__/ |_/  |___  |     |\\/| |__| |_/  |___ |__/
| \\_ |___ |___ |  \\ |__| ___]    |  | |  | |  \\ | \\_ |___  |     |  | |  | | \\_ |___ |  \\`)

console.log(`v ${require('./package.json').version}`)

console.log('\n')

commander
  .command('ethfinex <steps>')
  .action(steps => ethfinexAutoMarketMake(steps))

commander.command('idex <steps>').action(steps => idexAutoMarketMake(steps))

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
