const assert = require('assert')
const crypto = require('crypto')
const WS = require('ws')
const BigNumber = require('bignumber.js')
const ethfinexRestWrapper = require('./ethfinex-rest-api-wrapper')
const { chunk } = require('lodash')
const utils = require('./utils')
const fs = require('fs')

const ETHFINEX_WEBSOCKET_API = 'wss://api.bitfinex.com/ws/2/'

BigNumber.config({ EXPONENTIAL_AT: [-30, 40] })

const SYMBOL = 'tPNKETH'
const MIN_ETH_SIZE = new BigNumber(0.1)
let orderGroupID = 0

const newExchangeLimitOrder = (amount, price) => [
  'on',
  {
    amount,
    gid: ++orderGroupID,
    cid: Math.floor(Math.random() * 2 ** 45),
    price,
    symbol: SYMBOL,
    type: 'EXCHANGE LIMIT',
    tif: '2030-01-01 10:45:23'
  }
]

module.exports = {
  getOrders: function(steps, sizeInEther, reserve) {
    const rawOrders = utils.getBoundingCurveStaircaseOrders(
      steps,
      sizeInEther,
      reserve
    )

    const orders = []
    const equilibrium = reserve.eth.div(reserve.pnk)
    for (const rawOrder of rawOrders) {
      const orderAmount = rawOrder.pnk
      const orderPrice = rawOrder.eth.div(rawOrder.pnk).absoluteValue()

      if (orderAmount.isPositive())
        assert(orderPrice.lt(equilibrium), orderPrice.toString())
      else assert(orderPrice.gt(equilibrium), orderPrice.toString())

      orders.push(
        newExchangeLimitOrder(
          rawOrder.pnk.toString(),
          rawOrder.eth
            .div(rawOrder.pnk)
            .absoluteValue()
            .toString()
        )
      )
    }
    const chunks = chunk(orders, 15).map(c => [0, 'ox_multi', null, c])
    return chunks
  },

  autoMarketMake: async steps => {
    let noOfTrades = 0

    assert(steps <= 128, 'You exceeded Ethfinex maximum order limit.')
    let initialOrdersPlaced = true

    const w = new WS(ETHFINEX_WEBSOCKET_API)
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
    let reserve
    let availableETH
    let availablePNK

    fs.readFile('ethfinex_reserve.txt', 'utf-8', (err, data) => {
      if (err) return
      reserve = JSON.parse(data)
      reserve.pnk = new BigNumber(reserve.pnk)
      reserve.eth = new BigNumber(reserve.eth)
      console.log('Found a reserve file, loading...')
    })

    if (
      typeof process.env.ETHFINEX_KEY === 'undefined' ||
      typeof process.env.ETHFINEX_SECRET === 'undefined'
    ) {
      console.log(
        'Please export ETHFINEX_KEY and ETHFINEX_SECRET environment variables.'
      )
      process.exit(2)
    }
    const heartbeat = client => {
      clearTimeout(client.pingTimeout)
      client.pingTimeout = setTimeout(function() {
        process.exit(utils.WEBSOCKET_CONNECTION_DOWN)
      }, 50000)
    }
    w.on('open', () => {
      heartbeat(w)
      w.send(authenticationPayload())
    })

    w.on('error', async event => {
      console.log('onerror')
      console.log(event)
    })

    w.on('close', async function(errorCode) {
      console.log('onclose')
      console.log(errorCode)
      if (errorCode === 1001 || errorCode === 1006) {
        await new Promise(resolve => setTimeout(resolve, 10000))
        await module.exports.autoMarketMake(steps) // Restart
      } else clearTimeout(this.pingTimeout)
    })

    w.on('message', async msg => {
      heartbeat(w)
      const parsed = JSON.parse(msg)

      if (
        parsed[1] === 'on' ||
        parsed[1] === 'n' ||
        parsed[1] === 'oc' ||
        parsed[1] === 'hb' ||
        parsed[1] === 'bu'
      ) {
      } else if (parsed[1] === 'os')
        console.log(`Number of open orders: ${parsed[2].length}`)
      else if (parsed[1] === 'wu') {
        const payload = parsed[2]
        if (payload[1] === 'PNK') availablePNK = new BigNumber(payload[2])
        else if (payload[1] === 'ETH') availableETH = new BigNumber(payload[2])

        console.log(
          `Account has ${payload[2]} ${payload[1]} and ${payload[2] -
            payload[4]} on open orders.`
        )

        if (payload[1] === 'PNK' && payload[2] - payload[4] === 0) {
          const orders = module.exports.getOrders(
            parseInt(steps),
            MIN_ETH_SIZE,
            reserve
          )
          console.log(
            'Orders got cancelled it seems... Placing orders again...'
          )
          const openOrders = await ethfinexRestWrapper.orders(
            (Date.now() * 1000).toString()
          )
          console.log('Open Orders:')
          console.log(openOrders)
          console.log(`Cancelling orders `)

          w.send(CANCEL_ALL_ORDERS)
          await new Promise(resolve => setTimeout(resolve, 5000))

          console.log('Placing...')
          for (const batch of orders) w.send(JSON.stringify(batch))
        }
      } else if (parsed.length === 10)
        console.log(
          `Bid: ${parsed[0]} | Ask: ${parsed[2]} | Last: ${parsed[6]}`
        )
      else {
        console.log(parsed)
        if (reserve && availableETH && availablePNK)
          utils.logStats(availableETH, availablePNK, reserve)
      }

      if (!reserve && availableETH && availablePNK && lowestAsk && highestBid) {
        console.log('Reserve not found, calculating...')
        reserve = utils.calculateMaximumReserve(
          availableETH,
          availablePNK,
          highestBid.plus(lowestAsk).div(2)
        )

        utils.logStats(availableETH, availablePNK, reserve)

        fs.writeFile('ethfinex_reserve.txt', JSON.stringify(reserve), err => {
          if (err) console.log(err)
          console.log('Reserve saved to file.')
        })
      }

      if (reserve && !initialOrdersPlaced) {
        const orders = module.exports.getOrders(
          parseInt(steps),
          MIN_ETH_SIZE,
          reserve
        )

        console.log('Placing orders...')
        for (const batch of orders) w.send(JSON.stringify(batch))
        initialOrdersPlaced = true
      }

      if (parsed.event === 'info') {
        const ticker = await ethfinexRestWrapper.ticker()
        console.log(ticker)
        highestBid = new BigNumber(ticker[0])
        lowestAsk = new BigNumber(ticker[2])
      }

      if (parsed.event === 'auth') {
      }

      if (
        Array.isArray(parsed) &&
        parsed[1] === 'te' &&
        parsed[2][1] === SYMBOL
      ) {
        console.log('Cancelling orders...')
        w.send(CANCEL_ALL_ORDERS)
        await new Promise(resolve => setTimeout(resolve, 2000))

        const tradeExecutionLog = parsed[2]
        const pinakionAmount = new BigNumber(tradeExecutionLog[4])
        const price = new BigNumber(tradeExecutionLog[5])

        const oldInvariant = reserve.eth.times(reserve.pnk)

        const etherAmount = pinakionAmount
          .times(price)
          .times(new BigNumber('-1'))

        reserve.eth = reserve.eth.plus(etherAmount)
        reserve.pnk = reserve.pnk.plus(pinakionAmount)

        utils.logStats(availableETH, availablePNK, reserve)

        const TOLERANCE = 0.9999
        const newInvariant = reserve.eth.times(reserve.pnk)

        try {
          assert(
            newInvariant.gte(oldInvariant.times(TOLERANCE)),
            `New Invariant: ${newInvariant}  Old Invariant: ${oldInvariant}\nInvariant should not decrease. Check bounding curve implemention.`
          )
        } catch (err) {
          console.error(err)
          process.exit(3)
        }

        fs.writeFileSync('ethfinex_reserve.txt', JSON.stringify(reserve))

        const orders = module.exports.getOrders(
          parseInt(steps),
          MIN_ETH_SIZE,
          reserve
        )
        console.log('Placing orders...')

        for (const batch of orders) w.send(JSON.stringify(batch))

        noOfTrades++
        console.log(`Number of trades done: ${noOfTrades}`)
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
