const WS = require('ws')
const Web3 = require('web3')
const assert = require('assert')
const BigNumber = require('bignumber.js')

BigNumber.config({ EXPONENTIAL_AT: [-30, 40] })

const API_KEY = '17paIsICur8sA0OBqG6dH5G1rmrHNMwt4oNk4iX9'
const API_VERSION = '1.0.0'
const w = new WS('wss://datastream.idex.market')
const PINAKION = '0x93ED3FBe21207Ec2E8f2d3c3de6e058Cb73Bc04d'
const ETHER = '0x0000000000000000000000000000000000000000'
const MARKET = 'ETH_PNK'
const idexWrapper = require('./idex-https-api-wrapper')

const web3 = new Web3(
  new Web3.providers.HttpProvider(process.env.ETHEREUM_PROVIDER)
)
const ORDER_INTERVAL = 0.0005

const decimals = new BigNumber('10').pow(new BigNumber('18'))
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
const promiseTimeout = function(ms, promise) {
  // Create a promise that rejects in <ms> milliseconds
  let timeout = new Promise((resolve, reject) => {
    let id = setTimeout(() => {
      clearTimeout(id)
      reject('Timed out in ' + ms + 'ms.')
    }, ms)
  })

  // Returns a race between our timeout and the passed in promise
  return Promise.race([promise, timeout])
}

module.exports = {
  getStaircaseOrders: function(steps, size, highestBid, lowestAsk, spread) {
    assert(typeof steps === 'number')
    assert(typeof size === 'object')
    assert(typeof highestBid === 'object', highestBid.toString())
    assert(typeof lowestAsk === 'object')

    assert(typeof spread === 'object', spread.toString())
    assert(steps > 0)
    assert(size.gt(new BigNumber(0)))
    console.log(`highestBid: ${highestBid.toString()}`)
    assert(
      highestBid.gt(new BigNumber(0.000001)) &&
        highestBid.lt(new BigNumber(0.001)),
      highestBid.toString()
    )
    assert(
      lowestAsk.gt(new BigNumber(0.000001)) &&
        lowestAsk.lt(new BigNumber(0.001)),
      lowestAsk.toString()
    )
    assert(
      spread.gte(new BigNumber(0.001)) && spread.lt(new BigNumber(0.1)),
      spread.toString()
    )
    assert(new BigNumber(steps).times(spread).lt(new BigNumber(1)))

    const newAsk = lowestAsk
      .plus(highestBid)
      .div(new BigNumber(2).minus(spread))

    const newBid = newAsk.times(new BigNumber(1).minus(spread))

    const orders = []
    for (let i = 0; i < steps; i++) {
      const sellOrder = {
        tokenBuy: ETHER,
        amountBuy: newAsk
          .times(
            new BigNumber(1).plus(
              new BigNumber(ORDER_INTERVAL).times(new BigNumber(i))
            )
          )
          .times(size)
          .times(decimals)
          .toFixed(0, BigNumber.ROUND_UP)
          .toString(),
        tokenSell: PINAKION,
        amountSell: new BigNumber(size).times(decimals).toString()
      }

      const buyOrder = {
        tokenBuy: PINAKION,
        amountBuy: new BigNumber(size).times(decimals).toString(),
        tokenSell: ETHER,
        amountSell: newBid
          .times(
            new BigNumber(1).minus(
              new BigNumber(ORDER_INTERVAL).times(new BigNumber(i))
            )
          )
          .times(size)
          .times(decimals)
          .toFixed(0, BigNumber.ROUND_DOWN)
          .toString()
      }

      assert(
        new BigNumber(sellOrder.amountBuy)
          .div(new BigNumber(sellOrder.amountSell))
          .gt(highestBid),
        new BigNumber(sellOrder.amountBuy)
          .div(new BigNumber(sellOrder.amountSell))
          .toString()
      )
      assert(
        new BigNumber(buyOrder.amountSell)
          .div(new BigNumber(buyOrder.amountBuy))
          .lt(lowestAsk),
        new BigNumber(buyOrder.amountBuy)
          .div(new BigNumber(buyOrder.amountSell))
          .toString()
      )
      console.log(
        `Sell order at: ${new BigNumber(sellOrder.amountBuy)
          .div(new BigNumber(sellOrder.amountSell))
          .toString()}`
      )
      console.log(
        `Buy order at: ${new BigNumber(buyOrder.amountSell)
          .div(new BigNumber(buyOrder.amountBuy))
          .toString()}`
      )

      orders.push(sellOrder)
      orders.push(buyOrder)
    }

    return orders
  },
  clearOrdersAndSendStaircaseOrders: async function(
    address,
    privateKey,
    steps,
    size,
    highestBid,
    lowestAsk,
    spread
  ) {
    assert(web3.utils.checkAddressChecksum(address))

    while (true) {
      console.log('Clearing previous orders...')
      const openOrders = await idexWrapper.getOpenOrders(address)
      console.log(openOrders)
      if (Array.isArray(openOrders) && openOrders.length == 0) {
        console.log('No open order left.')
        break
      }

      console.log('Open orders:')
      console.log(openOrders.map(x => x.orderHash))

      for (let i = 0; i < openOrders.length; i++) {
        const nonce = await idexWrapper.getNextNonce(address)
        assert(typeof nonce.nonce === 'number')
        assert(typeof openOrders[i].orderHash === 'string')

        await idexWrapper.cancelOrder(
          web3,
          address,
          privateKey,
          openOrders[i].orderHash,
          nonce
        )
      }
    }

    assert((await idexWrapper.getOpenOrders(address)).length == 0)

    var orders = module.exports.getStaircaseOrders(
      steps,
      size,
      highestBid,
      lowestAsk,
      spread
    )
    for (let i = 0; i < orders.length; i++)
      await idexWrapper.sendOrder(
        web3,
        address,
        privateKey,
        orders[i],
        await idexWrapper.getNextNonce(address)
      )
  },
  autoMarketMake: async function(address, privateKey, steps, size, spread) {
    const date = new Date()
    let buyTotal = new BigNumber(0)
    let sellTotal = new BigNumber(0)
    const checksumAddress = web3.utils.toChecksumAddress(address)

    while (true) {
      const date = new Date()
      console.log(
        `${date.getHours()}:${date.getMinutes()}:${date.getSeconds()}`
      )
      const ticker = await idexWrapper.getTicker(MARKET)

      const highestBid = new BigNumber(ticker.highestBid)
      const lowestAsk = new BigNumber(ticker.lowestAsk)

      const currentSpread = lowestAsk.minus(highestBid).div(lowestAsk)

      await module.exports.clearOrdersAndSendStaircaseOrders(
        checksumAddress,
        privateKey,
        parseInt(steps),
        new BigNumber(size),
        highestBid,
        lowestAsk,
        new BigNumber(spread)
      )

      await sleep(300)
    }

    w.on('message', msg => {
      const parsed = JSON.parse(msg)
      console.log(parsed)
      if (parsed.request === 'handshake' && parsed.result === 'success') {
        w.send(
          JSON.stringify({
            sid: parsed.sid,
            request: 'subscribeToMarkets',
            payload: `{"topics": ["${MARKET}"], "events": ["market_orders", "market_cancels"] }`
          })
        )
      }
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
      var timeout = 10000
      if (w.readyState == WS.OPEN) w.send('')

      timerId = setTimeout(keepAlive, timeout)
    }
    function cancelKeepAlive() {
      if (timerId) clearTimeout(timerId)
    }
  }
}
