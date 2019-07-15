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

    const step = lastTrade * spread
    assert(typeof stepsOnOneSide === 'number')
    assert(typeof size === 'number')
    assert(typeof lastTrade === 'number')
    assert(typeof spread === 'number')
    assert(stepsOnOneSide > 0)
    assert(size > 0)
    assert(lastTrade > 0)
    assert(spread > 0 && spread < 1)
    assert(stepsOnOneSide * spread < 1)

    assert(typeof step === 'number')
    assert(step > 0)

    const bnSize = new BigNumber(size)
    const bnLastTrade = new BigNumber(lastTrade)
    const bnSpread = new BigNumber(spread)

    for (let i = 1; i <= stepsOnOneSide; i++)
      orders.push(
        newExchangeLimitOrder(
          bnSize.toString(),
          bnLastTrade
            .times(new BigNumber(1).minus(new BigNumber(i).times(bnSpread)))
            .toString()
        )
      )

    for (let i = 1; i <= stepsOnOneSide; i++)
      orders.push(
        newExchangeLimitOrder(
          bnSize.times(new BigNumber('-1')).toString(),
          bnLastTrade
            .times(new BigNumber(1).plus(new BigNumber(i).times(bnSpread)))
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
      console.log(parsed)

      if (parsed.event === 'subscribed') channelID = parsed.chanId

      if (
        channelID !== undefined &&
        Array.isArray(parsed) &&
        parsed[0] === channelID &&
        Array.isArray(parsed[1]) &&
        parsed[1].length === 10
      ) {
        w.send(CANCEL_ALL_ORDERS)
        w.send(
          JSON.stringify(
            module.exports.getStaircaseOrders(
              parseInt(steps),
              parseInt(size),
              parseFloat(parsed[1][6]),
              parseFloat(spread)
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
      channel: 'ticker',
      event: 'subscribe',
      symbol: 'tPNKETH'
    })

    w.on('open', () => {
      w.send(authenticationPayload())
      w.send(SUBSCRIBE)
    })
  }
}
