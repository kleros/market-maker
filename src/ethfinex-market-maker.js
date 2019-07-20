const assert = require('assert')
const crypto = require('crypto')
const program = require('commander')
const WS = require('ws')
const BigNumber = require('bignumber.js')

const ETHFINEX_WEBSOCKET_API = 'wss://api.ethfinex.com/ws/2/'

BigNumber.config({ EXPONENTIAL_AT: [-30, 40] })

const SYMBOL = 'tPNKETH'
const ORDER_INTERVAL = 0.001

module.exports = {
  getStaircaseOrders: function(steps, size, lastTrade, spread) {
    console.log(lastTrade.toString())
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
    assert(typeof size === 'object')
    assert(typeof lastTrade === 'object')
    assert(typeof spread === 'object')
    assert(steps > 0)
    assert(size.gt(0))
    assert(
      lastTrade.gt(new BigNumber(0)) && lastTrade.lt(new BigNumber(1)),
      lastTrade.toString()
    )
    assert(
      spread.gte(new BigNumber(0.001)) && spread.lt(new BigNumber(0.1)),
      spread.toString()
    )
    assert(new BigNumber(steps).times(spread).lt(new BigNumber(1)))

    const step = lastTrade.times(spread)
    assert(step.gt(0))

    for (let i = 0; i < steps; i++)
      orders.push(
        newExchangeLimitOrder(
          size.toString(),
          lastTrade
            .times(
              new BigNumber(1)
                .minus(spread)
                .minus(new BigNumber(i).times(new BigNumber(ORDER_INTERVAL)))
            )
            .toString()
        )
      )

    for (let i = 0; i < steps; i++)
      orders.push(
        newExchangeLimitOrder(
          size.times(new BigNumber('-1')).toString(),
          lastTrade
            .times(
              new BigNumber(1)
                .plus(spread)
                .plus(new BigNumber(i).times(new BigNumber(ORDER_INTERVAL)))
            )
            .toString()
        )
      )
    return [0, 'ox_multi', null, orders]
  },

  autoMarketMake: async (steps, size, spread) => {
    if (
      typeof process.env.ETHFINEX_KEY === 'undefined' ||
      typeof process.env.ETHFINEX_SECRET === 'undefined'
    ) {
      console.error(
        'Please export ETHFINEX_KEY and ETHFINEX_SECRET environment variables.'
      )
      process.exit(2)
    }

    const w = new WS(ETHFINEX_WEBSOCKET_API)

    let channelID

    w.on('message', msg => {
      const parsed = JSON.parse(msg)
      if (!((Array.isArray(parsed) && parsed[1] == 'tu') || parsed[1] == 'hb'))
        // Don't log heartbeat or trade execution updates
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
