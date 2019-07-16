const assert = require('assert')
const crypto = require('crypto')
const program = require('commander')
const WS = require('ws')
const BigNumber = require('bignumber.js')

const ETHFINEX_WEBSOCKET_API = 'wss://api.ethfinex.com/ws/2/'

BigNumber.config({ EXPONENTIAL_AT: [-30, 40] })

module.exports = {
  getStaircaseOrders: function(stepsOnOneSide, size, lastTrade, spread) {
    const newExchangeLimitOrder = (amount, price) => [
      'on',
      {
        amount,
        cid: Math.floor(Math.random() * 2 ** 45),
        price,
        symbol: 'tPNKETH',
        type: 'EXCHANGE LIMIT'
      }
    ]

    const orders = []

    const step = lastTrade.times(spread)
    assert(typeof stepsOnOneSide === 'number')
    assert(typeof size === 'object')
    assert(typeof lastTrade === 'object')
    assert(typeof spread === 'object')
    assert(stepsOnOneSide > 0)
    assert(size.gt(0))
    assert(lastTrade.gt(0) && lastTrade.lt(1), lastTrade.toString())
    assert(spread.gt(0) && spread.lt(1))
    assert(stepsOnOneSide * spread < 1)

    assert(step.gt(0))

    for (let i = 1; i <= stepsOnOneSide; i++)
      orders.push(
        newExchangeLimitOrder(
          size.toString(),
          lastTrade
            .times(new BigNumber(1).minus(new BigNumber(i).times(spread)))
            .toString()
        )
      )

    for (let i = 1; i <= stepsOnOneSide; i++)
      orders.push(
        newExchangeLimitOrder(
          size.times(new BigNumber('-1')).toString(),
          lastTrade
            .times(new BigNumber(1).plus(new BigNumber(i).times(spread)))
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
      console.log(
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
        channelID !== undefined &&
        Array.isArray(parsed) &&
        parsed[0] === channelID &&
        parsed[1] === 'te' &&
        Array.isArray(parsed[2]) &&
        parsed[2].length === 4
      ) {
        w.send(CANCEL_ALL_ORDERS)
        w.send(
          JSON.stringify(
            module.exports.getStaircaseOrders(
              parseInt(steps),
              new BigNumber(size),
              new BigNumber(parsed[2][4]),
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
      symbol: 'tPNKETH'
    })

    w.on('open', () => {
      w.send(authenticationPayload())
      w.send(SUBSCRIBE)
    })
  }
}
