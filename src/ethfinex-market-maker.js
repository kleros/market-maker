const assert = require('assert')
const crypto = require('crypto')
const program = require('commander')
const WS = require('ws')
const BigNumber = require('bignumber.js')

const ETHFINEX_WEBSOCKET_API = 'wss://api.ethfinex.com/ws/2/'

BigNumber.config({ EXPONENTIAL_AT: [-30, 40] })

const SYMBOL = 'tPNKETH'
const ORDER_INTERVAL = 0.0005

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

module.exports = {
  getStaircaseOrders: function(steps, size, highestBid, lowestAsk, spread) {
    console.log(`Lowest ask: ${highestBid.toString()}`)
    console.log(`Highest bid: ${lowestAsk.toString()}`)
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
    assert(typeof highestBid === 'object')
    assert(typeof lowestAsk === 'object')
    assert(typeof spread === 'object')
    assert(steps > 0)
    assert(size.gt(0))
    assert(
      highestBid.gt(new BigNumber(0)) && highestBid.lt(new BigNumber(1)),
      `Highest bid out of bounds: ${highestBid.toString()}`
    )
    assert(
      lowestAsk.gt(new BigNumber(0)) && lowestAsk.lt(new BigNumber(1)),
      `Lowest ask out of bounds: ${lowestAsk.toString()}`
    )
    assert(
      spread.gte(new BigNumber(0.001)) && spread.lt(new BigNumber(0.1)),
      `Spread out of bounds: ${spread.toString()}`
    )
    assert(new BigNumber(steps).times(spread).lt(new BigNumber(1)))

    const newAsk = lowestAsk
      .plus(highestBid)
      .div(new BigNumber(2).minus(spread))

    const newBid = newAsk.times(new BigNumber(1).minus(spread))

    for (let i = 0; i < steps; i++)
      orders.push(
        newExchangeLimitOrder(
          size.toString(),
          newBid
            .times(
              new BigNumber(1).minus(
                new BigNumber(ORDER_INTERVAL).times(new BigNumber(i))
              )
            )
            .toString()
        )
      )

    for (let i = 0; i < steps; i++)
      orders.push(
        newExchangeLimitOrder(
          size.times(new BigNumber('-1')).toString(),
          newAsk
            .times(
              new BigNumber(1).plus(
                new BigNumber(ORDER_INTERVAL).times(new BigNumber(i))
              )
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
      if (
        !// Don't log ...
        (
          Array.isArray(parsed) &&
          (parsed[1] == 'tu' || // ... trade execution updates, ...
          parsed[1] == 'hb' || // ... heartbeats,
            parsed[1] == 'bu')
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
        parsed[0] == channelID &&
        Array.isArray(parsed[1]) &&
        parsed[1].length == 10
      ) {
        console.log('TICKER UPDATE!')

        const highestBid = new BigNumber(parsed[1][0])
        const lowestAsk = new BigNumber(parsed[1][2])
        const currentSpread = lowestAsk.minus(highestBid).div(lowestAsk)
        console.log(currentSpread.toString())
        console.log(spread)
        if (currentSpread.gt(new BigNumber(spread).times(new BigNumber(1.1)))) {
          console.log('SPREAD IS HIGHER THAN DESIRED.')
          w.send(CANCEL_ALL_ORDERS)
          w.send(
            JSON.stringify(
              module.exports.getStaircaseOrders(
                parseInt(steps),
                new BigNumber(size),
                highestBid,
                lowestAsk,
                new BigNumber(spread)
              )
            )
          )
        }
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

    const SUBSCRIBE_TRADES = JSON.stringify({
      channel: 'trades',
      event: 'subscribe',
      symbol: SYMBOL
    })

    const SUBSCRIBE_TICKER = JSON.stringify({
      channel: 'ticker',
      event: 'subscribe',
      symbol: SYMBOL
    })

    w.on('open', () => {
      w.send(authenticationPayload())
      w.send(SUBSCRIBE_TICKER)
    })
  }
}
