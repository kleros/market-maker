const assert = require('assert')
const crypto = require('crypto')
const program = require('commander')
const WS = require('ws')
const BigNumber = require('bignumber.js')
const ethfinexRestWrapper = require('./ethfinex-rest-api-wrapper')
const { chunk } = require('lodash')
const calculateMaximumReserve = require('./utils').calculateMaximumReserve
const getStaircaseOrders = require('./utils').getStaircaseOrders

const ETHFINEX_WEBSOCKET_API = 'wss://api.ethfinex.com/ws/2/'

BigNumber.config({ EXPONENTIAL_AT: [-30, 40] })

const SYMBOL = 'tPNKETH'
const ORDER_INTERVAL = new BigNumber(0.00075)
const MIN_ETH_SIZE = new BigNumber(0.15)

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

module.exports = {
  getOrders: function(steps, sizeInEther, spread, reserve) {
    const rawOrders = getStaircaseOrders(
      steps,
      sizeInEther,
      spread,
      ORDER_INTERVAL,
      reserve
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
    let availablePNK
    let availableETH
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

      if (
        !isNaN(availablePNK) &&
        !isNaN(availableETH) &&
        !reserve &&
        lowestAsk &&
        highestBid
      ) {
        reserve = calculateMaximumReserve(
          availableETH,
          availablePNK,
          lowestAsk.plus(highestBid).div(new BigNumber(2))
        )
        console.log('Calculating maximum reserve...')
      }

      if (reserve) {
        const date = new Date()

        console.log(
          `${date.getHours()}:${date.getMinutes()}:${date.getSeconds()} # RESERVE <> ETH*PNK: ${reserve.eth.times(
            reserve.pnk
          )} ETH: ${reserve.eth} | PNK: ${
            reserve.pnk
          } | ETH/PNK: ${reserve.eth.div(reserve.pnk)}`
        )

        assert(
          new BigNumber(steps).times(MIN_ETH_SIZE).lt(reserve.eth),
          `Your reserve cannot cover this many orders. Max number of steps you can afford: ${reserve.eth.div(
            MIN_ETH_SIZE
          )}.`
        )

        if (!initialOrdersPlaced) {
          const orders = module.exports.getOrders(
            parseInt(steps),
            MIN_ETH_SIZE,
            new BigNumber(spread),
            reserve
          )

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

      if (Array.isArray(parsed) && parsed[1] == 'wu') {
        const payload = parsed[2]
        if (payload[1] == 'PNK') availablePNK = new BigNumber(payload[2])
        else if (payload[1] == 'ETH') availableETH = new BigNumber(payload[2])
        else console.log('Unhandled wallet update.')
      }

      if (
        Array.isArray(parsed) &&
        parsed[1] == 'te' &&
        parsed[2][1] == SYMBOL
      ) {
        w.send(CANCEL_ALL_ORDERS)

        const tradeExecutionLog = parsed[2]
        const pinakionAmount = new BigNumber(tradeExecutionLog[4])
        const price = new BigNumber(tradeExecutionLog[5])

        const etherAmount = pinakionAmount
          .times(price)
          .times(new BigNumber('-1'))

        reserve.eth = reserve.eth.plus(etherAmount)
        reserve.pnk = reserve.pnk.plus(pinakionAmount)
        const orders = module.exports.getOrders(
          parseInt(steps),
          MIN_ETH_SIZE,
          new BigNumber(spread),
          reserve
        )
        for (batch of orders) w.send(JSON.stringify(batch))
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
