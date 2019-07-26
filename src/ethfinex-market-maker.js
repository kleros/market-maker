const assert = require('assert')
const crypto = require('crypto')
const program = require('commander')
const WS = require('ws')
const BigNumber = require('bignumber.js')
const ethfinexRestWrapper = require('./ethfinex-rest-api-wrapper')

const ETHFINEX_WEBSOCKET_API = 'wss://api.ethfinex.com/ws/2/'

BigNumber.config({ EXPONENTIAL_AT: [-30, 40] })

const SYMBOL = 'tPNKETH'
const ORDER_INTERVAL = new BigNumber(0.00025)
const MIN_ETH_SIZE = new BigNumber(0.02)
const MIN_PNK_SIZE = new BigNumber(10000)

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

module.exports = {
  calculateMaximumReserve: function(
    availableEther,
    availablePinakion,
    initialPrice
  ) {
    const etherValueOfAvailablePinakion = availablePinakion.times(initialPrice)
    const isEtherTheLimitingResource = etherValueOfAvailablePinakion.gt(
      availableEther
    )
      ? true
      : false

    if (isEtherTheLimitingResource)
      return {
        ether: availableEther,
        pinakion: availableEther.div(initialPrice)
      }
    else
      return {
        ether: availablePinakion.times(initialPrice),
        pinakion: availablePinakion
      }
  },
  getStaircaseOrders: function(steps, sizeInEther, spread, reserve) {
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

    assert(typeof steps === 'number')
    assert(typeof spread === 'object')
    assert(steps > 0)

    // assert(
    //   spread.gte(new BigNumber(0.001)) && spread.lte(new BigNumber(1)),
    //   `Spread out of bounds: ${spread.toString()}`
    // )
    assert(new BigNumber(steps).times(spread).lt(new BigNumber(1)))

    const invariant = reserve.ether.times(reserve.pinakion)

    for (let i = 0; i < steps; i++) {
      const orderPrice = reserve.ether
        .div(reserve.pinakion)
        .times(
          new BigNumber(1)
            .minus(spread.div(new BigNumber(2)))
            .minus(ORDER_INTERVAL.times(new BigNumber(i)))
        )

      const sizeInPinakion = sizeInEther.div(orderPrice)

      orders.push(
        newExchangeLimitOrder(sizeInPinakion.toString(), orderPrice.toString())
      )
    }

    for (let i = 0; i < steps; i++) {
      const orderPrice = reserve.ether
        .div(reserve.pinakion)
        .times(
          new BigNumber(1)
            .plus(spread.div(new BigNumber(2)))
            .plus(ORDER_INTERVAL.times(new BigNumber(i)))
        )

      const sizeInPinakion = sizeInEther.div(orderPrice)

      orders.push(
        newExchangeLimitOrder(
          sizeInPinakion.times(new BigNumber('-1')).toString(),
          orderPrice.toString()
        )
      )
    }
    return [0, 'ox_multi', null, orders]
  },

  autoMarketMake: async (steps, size, spread) => {
    let flag = 0

    const w = new WS(ETHFINEX_WEBSOCKET_API)
    let reserve = { ether: 'Initializing...', pinakion: 'Initializing...' }
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

    w.on('message', async msg => {
      const parsed = JSON.parse(msg)
      // if (
      //   !// Don't log ...
      //   (
      //     Array.isArray(parsed) &&
      //     (parsed[1] == 'tu' || // ... trade execution updates, ...
      //     parsed[1] == 'hb' || // ... heartbeats,
      //       parsed[1] == 'b')
      //   ) // ... and balance updates.
      // )
      console.log(parsed)

      if (availablePNK && availableETH && highestBid && lowestAsk)
        console.log(
          `Available ETH: ${availableETH} | Reserve ETH: ${
            reserve.ether
          } |  Available PNK: ${availablePNK} | Reserve Pinakion: ${
            reserve.pinakion
          } Current Price: ${lowestAsk.plus(highestBid).div(new BigNumber(2))}`
        )

      if (parsed.event == 'auth') {
        const result = await ethfinexRestWrapper.getBalance()
        console.log(result)
        availableETH = result[0][2]
        availablePNK = result[1][2]
        console.log(await ethfinexRestWrapper.getTicker())
        highestBid = (await ethfinexRestWrapper.getTicker())[0]
        lowestAsk = (await ethfinexRestWrapper.getTicker())[2]
        highestBid = new BigNumber(highestBid)
        lowestAsk = new BigNumber(lowestAsk)

        availablePNK = new BigNumber(availablePNK)
        availableETH = new BigNumber(availableETH)

        reserve = module.exports.calculateMaximumReserve(
          availableETH,
          availablePNK,
          lowestAsk.plus(highestBid).div(new BigNumber(2))
        )

        console.log(`Initial reserve:
          ${JSON.stringify(reserve)}`)

        orders = module.exports.getStaircaseOrders(
          parseInt(steps),
          MIN_ETH_SIZE,
          new BigNumber(spread),
          reserve
        )
      }
      if (
        Array.isArray(parsed) &&
        parsed[1] == 'te' &&
        parsed[2][1] == SYMBOL
      ) {
        const tradeExecutionLog = parsed[2]
        const pinakionAmount = new BigNumber(tradeExecutionLog[4])
        const price = new BigNumber(tradeExecutionLog[5])

        const etherAmount = pinakionAmount
          .times(price)
          .times(new BigNumber('-1'))

        reserve.ether = reserve.ether.plus(etherAmount)
        reserve.pinakion = reserve.pinakion.plus(pinakionAmount)
        w.send(CANCEL_ALL_ORDERS)
        console.log(orders)

        w.send(JSON.stringify(orders))
        flag++
        if (flag > 3) process.exit(1)
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
    w.on('open', () => {
      w.send(authenticationPayload())
      w.send('laylaylom')
    })
  }
}
