const WS = require('ws')
const Web3 = require('web3')
const assert = require('assert')

const API_KEY = '17paIsICur8sA0OBqG6dH5G1rmrHNMwt4oNk4iX9'
const API_VERSION = '1.0.0'
const w = new WS('wss://datastream.idex.market')
const PINAKION = '0x93ED3FBe21207Ec2E8f2d3c3de6e058Cb73Bc04d'
const ETHER = '0x0000000000000000000000000000000000000000'

const idexWrapper = require('./idex-https-api-wrapper')

const web3 = new Web3(
  new Web3.providers.HttpProvider(process.env.ETHEREUM_PROVIDER)
)
const decimals = web3.utils.toBN('10').pow(web3.utils.toBN('18'))

const getStaircaseOrders = (steps, size, lastTrade, spread) => {
  assert(typeof steps === 'number')
  assert(typeof size === 'number')
  assert(typeof lastTrade === 'number')
  assert(typeof spread === 'number')
  assert(steps > 0)
  assert(size > 0)
  assert(lastTrade > 0)
  assert(spread > 0 && spread < 1)
  assert(steps * spread < 1)

  const step = lastTrade * spread
  assert(typeof step === 'number')
  assert(step > 0)

  const orders = []
  for (let i = 1; i <= steps; i++) {
    orders.push({
      tokenBuy: ETHER,
      amountBuy: (
        (1 + parseFloat(spread) * i) *
        parseFloat(lastTrade) *
        size *
        10 ** 18
      ).toString(),
      tokenSell: PINAKION,
      amountSell: web3.utils
        .toBN(parseInt(size))
        .mul(decimals)
        .toString()
    })
    orders.push({
      tokenBuy: PINAKION,
      amountBuy: web3.utils
        .toBN(parseInt(size))
        .mul(decimals)
        .toString(),
      tokenSell: ETHER,
      amountSell: (
        (1 - parseFloat(spread) * i) *
        parseFloat(lastTrade) *
        size *
        10 ** 18
      ).toString()
    })
  }

  return orders
}

const clearOrdersAndSendStaircaseOrders = async (
  address,
  privateKey,
  steps,
  size,
  spread
) => {
  const openOrders = await idexWrapper.getOpenOrders(address)

  console.log(openOrders.map(x => x.orderHash))
  for (let i = 0; i < openOrders.length; i++)
    await idexWrapper.cancelOrder(
      web3,
      address,
      privateKey,
      openOrders[i].orderHash,
      await idexWrapper.getNextNonce(address)
    )

  const PRECISION = 1000000
  const lastTrade =
    parseInt(
      parseFloat((await idexWrapper.getTicker('ETH_PNK')).last) * PRECISION
    ) / PRECISION

  console.log(lastTrade)

  var orders = getStaircaseOrders(
    parseInt(steps),
    parseInt(size),
    parseFloat(lastTrade),
    parseFloat(spread)
  )
  for (let i = 0; i < orders.length; i++)
    await idexWrapper.sendOrder(
      web3,
      address,
      privateKey,
      orders[i],
      await idexWrapper.getNextNonce(address)
    )
}

module.exports = async (address, privateKey, steps, size, spread) => {
  w.on('message', async msg => {
    const parsed = JSON.parse(msg)
    console.log(parsed)
    if (parsed.request === 'handshake' && parsed.result === 'success') {
      w.send(
        JSON.stringify({
          sid: parsed.sid,
          request: 'subscribeToMarkets',
          payload: '{"topics": ["ETH_PNK"], "events": ["market_trades"] }'
        })
      )
      await clearOrdersAndSendStaircaseOrders(
        address,
        privateKey,
        steps,
        size,
        spread
      )
    }

    if (parsed.event === 'market_trades')
      await clearOrdersAndSendStaircaseOrders(
        address,
        privateKey,
        steps,
        size,
        spread
      )
  })

  w.on('open', () => {
    w.send(
      JSON.stringify({
        request: 'handshake',
        payload: `{"version": "${API_VERSION}", "key": "${API_KEY}"}`
      })
    )
    keepAlive()
  })

  w.on('close', () => {
    cancelKeepAlive()
  })

  var timerID = 0
  function keepAlive() {
    var timeout = 20000
    if (w.readyState == WS.OPEN) w.send('')

    timerId = setTimeout(keepAlive, timeout)
  }
  function cancelKeepAlive() {
    if (timerId) clearTimeout(timerId)
  }
}
