const assert = require('assert')
const crypto = require('crypto')
const program = require('commander')
const WS = require('ws')
const BigNumber = require('bignumber.js')

const ETHFINEX_WEBSOCKET_API = 'wss://api.ethfinex.com/ws/2/'

BigNumber.config({ EXPONENTIAL_AT: [-30, 40] })

const ETHFINEX_SYMBOL = 'tPNKETH'
const Web3 = require('web3')
const assert = require('assert')

const IDEX_DATASTREAM_API_KEY = '17paIsICur8sA0OBqG6dH5G1rmrHNMwt4oNk4iX9'
const IDEX_DATASTREAM_API_VERSION = '1.0.0'
const w = new WS('wss://datastream.idex.market')
const PINAKION = '0x93ED3FBe21207Ec2E8f2d3c3de6e058Cb73Bc04d'
const ETHER = '0x0000000000000000000000000000000000000000'
const IDEX_MARKET = 'ETH_PNK'
const idexWrapper = require('./idex-https-api-wrapper')

module.exports = {
  autoMarketMake: async () => {
    if (typeof process.env.ETHFINEX_KEY === 'undefined') {
      console.error('Please export ETHFINEX_KEY environment variable.')
      process.exit(100)
    }

    if (typeof process.env.ETHFINEX_SECRET === 'undefined') {
      console.error('Please export ETHFINEX_SECRET environment variable.')
      process.exit(101)
    }

    if (typeof process.env.IDEX_ADDRESS === 'undefined') {
      console.error('Please export IDEX_ADDRESS environment variable.')
      process.exit(102)
    }

    if (typeof process.env.IDEX_KEY === 'undefined') {
      console.error('Please export IDEX_KEY environment variable.')
      process.exit(103)
    }

    const w = new WS(ETHFINEX_WEBSOCKET_API)

    let channelID

    w.on('message', msg => {
      const parsed = JSON.parse(msg)
      if (
        !// Don't log ...
        (
          (Array.isArray(parsed) && parsed[1] == 'tu') || // ... trade execution updates, ...
          parsed[1] == 'hb' || // ... heartbeats,
          parsed[1] == 'bu'
        ) // ... and balance updates.
      )
        console.log(parsed)

      if (parsed.event === 'subscribed') {
        channelID = parsed.chanId
      }

      if (
        // Initial
        channelID !== undefined &&
        Array.isArray(parsed) &&
        Array.isArray(parsed[1]) &&
        Array.isArray(parsed[1][0])
      ) {
        w.send(CANCEL_ALL_ORDERS)
        w.send(
          JSON.stringify(
            module.exports.getStaircaseOrders(
              parseInt(steps),
              new BigNumber(size),
              new BigNumber(parsed[1][0][3]),
              new BigNumber(spread)
            )
          )
        )
      }

      if (
        // Order fully filled
        channelID !== undefined &&
        Array.isArray(parsed) &&
        parsed[0] == 0 &&
        parsed[1] === 'oc' &&
        Array.isArray(parsed[2]) &&
        parsed[2][6] == 0 // Updated amount, if equals to zero means the orders was fully filled.
      ) {
        console.log('--- ORDER FULLY FILLED ---')
        w.send(CANCEL_ALL_ORDERS)
        w.send(
          JSON.stringify(
            module.exports.getStaircaseOrders(
              parseInt(steps),
              new BigNumber(size),
              new BigNumber(parsed[2][16]),
              new BigNumber(spread)
            )
          )
        )
      }
    })

    const authenticationPayload = function() {
      const nonce = Date.now() * 1000
      const payload = `AUTH${nonce}`
      const signature = crypto
        .createHmac('SHA384', process.env.ETHFINEX_SECRET)
        .update(payload)
        .digest('hex')

      return JSON.stringify({
        apiKey: process.env.ETHFINEX_KEY,
        authNonce: nonce,
        authPayload: payload,
        authSig: signature,
        dms: 4,
        event: 'auth'
      })
    }

    const CANCEL_ALL_ORDERS = JSON.stringify([
      0,
      'oc_multi',
      null,
      {
        all: 1
      }
    ])

    const SUBSCRIBE = JSON.stringify({
      channel: 'trades',
      event: 'subscribe',
      symbol: SYMBOL
    })

    w.on('open', () => {
      w.send(authenticationPayload())
      w.send(SUBSCRIBE)
    })
  }
}
