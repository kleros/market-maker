const assert = require('assert')
const crypto = require('crypto')
const program = require('commander')
const WS = require('ws')
const BigNumber = require('bignumber.js')
const ethfinexRestWrapper = require('./ethfinex-rest-api-wrapper')
const { chunk } = require('lodash')
const calculateMaximumReserve = require('./utils').calculateMaximumReserve
const utils = require('./utils')
const Mutex = require('async-mutex').Mutex

const ETHFINEX_WEBSOCKET_API = 'wss://api.ethfinex.com/ws/2/'

BigNumber.config({ EXPONENTIAL_AT: [-30, 40] })

const SYMBOL = 'tPNKETH'
const ORDER_INTERVAL = new BigNumber(0.00025)
const MIN_ETH_SIZE = new BigNumber(0.02)

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

module.exports = {
  getOrders: function(steps, sizeInEther, spread, priceCenter) {
    const rawOrders = utils.getSimpleStaircaseOrders(
      steps,
      sizeInEther,
      spread,
      ORDER_INTERVAL,
      priceCenter
    )
    const newExchangeLimitOrder = (amount, price) => [
      'on',
      {
        amount,
        cid: Math.floor(Math.random() * 2 ** 45),
        price,
        symbol: SYMBOL,
        type: 'EXCHANGE LIMIT'
      }
    ]

    const orders = []

    for (let i = 0; i < rawOrders.length; i++) {
      const orderAmount = rawOrders[i].pnk
      const orderPrice = rawOrders[i].eth.div(rawOrders[i].pnk).absoluteValue()

      if (orderAmount.isPositive())
        assert(orderPrice.lt(priceCenter), orderPrice.toString())
      else assert(orderPrice.gt(priceCenter), orderPrice.toString())

      orders.push(
        newExchangeLimitOrder(
          rawOrders[i].pnk.toString(),
          rawOrders[i].eth
            .div(rawOrders[i].pnk)
            .absoluteValue()
            .toString()
        )
      )
    }
    const chunks = chunk(orders, 15).map(c => [0, 'ox_multi', null, c])
    return chunks
  },

  autoMarketMake: async (steps, spread) => {
    const mutex = new Mutex()
    let flag = 0
    const replaceOrders = async function() {
      const release = await mutex.acquire()
      console.log('Cancelling orders...')
      w.send(CANCEL_ALL_ORDERS)

      const tradeExecutionLog = parsed[2]
      const pinakionAmount = new BigNumber(tradeExecutionLog[4])
      const price = new BigNumber(tradeExecutionLog[5])

      let newPriceCenter
      if (pinakionAmount.gt(0))
        newPriceCenter = price.times(new BigNumber(1).minus(ORDER_INTERVAL))
      else if (pinakionAmount.lt(0))
        newPriceCenter = price.times(new BigNumber(1).plus(ORDER_INTERVAL))

      const orders = module.exports.getOrders(
        parseInt(steps),
        MIN_ETH_SIZE,
        new BigNumber(spread),
        newPriceCenter
      )
      console.log('Placing orders...')

      for (batch of orders) w.send(JSON.stringify(batch))
      release()
    }

    assert(steps <= 128, 'You exceeded Ethfinex maximum order limit.')
    let initialOrdersPlaced = false

    const w = new WS(ETHFINEX_WEBSOCKET_API)
    let reserve
    const CANCEL_ALL_ORDERS = JSON.stringify([
      0,
      'oc_multi',
      null,
      {
        all: 1
      }
    ])
    let highestBid
    let lowestAsk
    let orders

    if (
      typeof process.env.ETHFINEX_KEY === 'undefined' ||
      typeof process.env.ETHFINEX_SECRET === 'undefined'
    ) {
      console.error(
        'Please export ETHFINEX_KEY and ETHFINEX_SECRET environment variables.'
      )
      process.exit(2)
    }

    w.on('open', () => {
      w.send(authenticationPayload())
    })
    w.on('message', async msg => {
      const parsed = JSON.parse(msg)

      console.log(parsed)
      console.log(`Mutex Locked: ${mutex.isLocked()}`)

      if (lowestAsk && highestBid) {
        if (!initialOrdersPlaced) {
          const orders = module.exports.getOrders(
            parseInt(steps),
            MIN_ETH_SIZE,
            new BigNumber(spread),
            highestBid.plus(lowestAsk).div(2)
          )

          console.log('Placing orders...')
          for (batch of orders) w.send(JSON.stringify(batch))
          initialOrdersPlaced = true
        }
      }

      if (parsed.event == 'info') {
        const ticker = await ethfinexRestWrapper.getTicker()
        highestBid = new BigNumber(ticker[0])
        lowestAsk = new BigNumber(ticker[2])
      }

      if (parsed.event == 'auth') {
      }

      if (
        Array.isArray(parsed) &&
        parsed[1] == 'te' &&
        parsed[2][1] == SYMBOL
      ) {
        replaceOrders()
        flag++
        if (flag > 2) process.exit(5)
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
  }
}
