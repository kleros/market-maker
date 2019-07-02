const assert = require('assert')
const crypto = require('crypto')
const program = require('commander')
const WS = require('ws')

let stepsValue
let spreadValue

program.arguments('<steps> <spread>').action(function(steps, spread) {
  stepsValue = steps
  spreadValue = spread
})

program.parse(process.argv)

if (typeof stepsValue === 'undefined' || typeof spreadValue === 'undefined')
  program.help()

console.log('Number of steps for each sides:', stepsValue)
console.log('Spread:', spreadValue)

program.parse(process.argv)

let counter = new Date().getTime()

const w = new WS('wss://api.ethfinex.com/ws/2/')

let channelID

w.on('message', msg => {
  const parsed = JSON.parse(msg)

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
      staircaseOrders(
        parseInt(stepsValue),
        parseFloat(parsed[1][6]),
        parseFloat(spreadValue)
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

const newExchangeLimitOrder = function(amount, price) {
  return JSON.stringify([
    'on',
    {
      amount,
      cid: counter++,
      price,
      symbol: 'tPNKETH',
      type: 'EXCHANGE LIMIT'
    }
  ])
}

const staircaseOrders = function(stepsOnOneSide, lastTrade, spread) {
  const orders = []
  console.log(lastTrade)

  const step = lastTrade * spread
  assert(typeof stepsOnOneSide === 'number')
  assert(typeof lastTrade === 'number')
  assert(typeof spread === 'number')
  assert(stepsOnOneSide > 0)
  assert(lastTrade > 0)
  assert(spread > 0 && spread < 1)
  assert(stepsOnOneSide * spread < 1)

  assert(typeof step === 'number')
  assert(step > 0)

  for (let i = 1; i <= stepsOnOneSide; i++)
    orders.push(
      JSON.parse(
        newExchangeLimitOrder('442', (lastTrade - i * step).toString())
      )
    )

  for (let i = 1; i <= stepsOnOneSide; i++)
    orders.push(
      JSON.parse(
        newExchangeLimitOrder('-442', (lastTrade + i * step).toString())
      )
    )

  return JSON.stringify([0, 'ox_multi', null, orders])
}

const SUBSCRIBE = JSON.stringify({
  channel: 'ticker',
  event: 'subscribe',
  symbol: 'tPNKETH'
})

w.on('open', () => {
  w.send(authenticationPayload())
  w.send(SUBSCRIBE)
})
