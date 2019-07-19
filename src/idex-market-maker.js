const WS = require('ws')
const Web3 = require('web3')
const assert = require('assert')
const BigNumber = require('bignumber.js')

BigNumber.config({ EXPONENTIAL_AT: [-30, 40] })
BigNumber.DEBUG = true

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

const decimals = new BigNumber('10').pow(new BigNumber('18'))

module.exports = {
  getStaircaseOrders: function(steps, size, lastTrade, spread) {
    assert(typeof steps === 'number')
    assert(typeof size === 'object')
    assert(typeof lastTrade === 'object')
    assert(typeof spread === 'object')
    assert(steps > 0)
    assert(size.gt(new BigNumber(0)))
    console.log(lastTrade.toString())
    assert(
      lastTrade.gt(new BigNumber(0.000001)) &&
        lastTrade.lt(new BigNumber(0.001)),
      lastTrade.toString()
    )
    assert(
      spread.gte(new BigNumber(0.001)) && spread.lt(new BigNumber(0.1)),
      spread.toString()
    )
    assert(new BigNumber(steps).times(spread).lt(new BigNumber(1)))

    const step = lastTrade.times(spread)
    assert(step.gt(new BigNumber(0)))

    const orders = []
    for (let i = 1; i <= steps; i++) {
      const sellOrder = {
        tokenBuy: ETHER,
        amountBuy: new BigNumber(1)
          .plus(spread.times(new BigNumber(i)))
          .times(lastTrade)
          .times(size)
          .times(decimals)
          .toString(),
        tokenSell: PINAKION,
        amountSell: new BigNumber(size).times(decimals).toString()
      }

      const buyOrder = {
        tokenBuy: PINAKION,
        amountBuy: new BigNumber(size).times(decimals).toString(),
        tokenSell: ETHER,
        amountSell: new BigNumber(1)
          .minus(spread.times(new BigNumber(i)))
          .times(lastTrade)
          .times(size)
          .times(decimals)
          .toString()
      }

      assert(
        new BigNumber(sellOrder.amountBuy)
          .div(new BigNumber(sellOrder.amountSell))
          .gt(lastTrade),
        new BigNumber(sellOrder.amountBuy)
          .div(new BigNumber(sellOrder.amountSell))
          .toString()
      )
      assert(
        new BigNumber(buyOrder.amountSell)
          .div(new BigNumber(buyOrder.amountBuy))
          .lt(lastTrade),
        new BigNumber(buyOrder.amountBuy)
          .div(new BigNumber(buyOrder.amountSell))
          .toString()
      )
      console.log(
        new BigNumber(sellOrder.amountBuy)
          .div(new BigNumber(sellOrder.amountSell))
          .toString()
      )
      console.log(
        new BigNumber(buyOrder.amountSell)
          .div(new BigNumber(buyOrder.amountBuy))
          .toString()
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
    lastTrade,
    spread
  ) {
    assert(web3.utils.checkAddressChecksum(address))
    const openOrders = await idexWrapper.getOpenOrders(address)
    assert(Array.isArray(openOrders))

    console.log(openOrders.map(x => x.orderHash))
    for (let i = 0; i < openOrders.length; i++)
      await idexWrapper.cancelOrder(
        web3,
        address,
        privateKey,
        openOrders[i].orderHash,
        await idexWrapper.getNextNonce(address)
      )

    var orders = module.exports.getStaircaseOrders(
      steps,
      size,
      lastTrade,
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
  autoMarketMake: function(address, privateKey, steps, size, spread) {
    let buyTotal = new BigNumber(0)
    let sellTotal = new BigNumber(0)

    const checksumAddress = web3.utils.toChecksumAddress(address)
    w.on('message', async msg => {
      const parsed = JSON.parse(msg)
      console.log(parsed)
      if (parsed.request === 'handshake' && parsed.result === 'success') {
        w.send(
          JSON.stringify({
            sid: parsed.sid,
            request: 'subscribeToAccounts',
            payload: `{"topics": ["${checksumAddress}"], "events": ["account_trades"] }`
          })
        )
        const lastTrade = new BigNumber(
          (await idexWrapper.getTicker(MARKET)).last
        )
        await module.exports.clearOrdersAndSendStaircaseOrders(
          checksumAddress,
          privateKey,
          parseInt(steps),
          new BigNumber(size),
          new BigNumber(lastTrade),
          new BigNumber(spread)
        )
      }

      if (parsed.event === 'account_trades') {
        console.log('My account did a trade.')
        const payload = JSON.parse(parsed.payload)
        const trade = payload.trades[0]
        assert(trade.market === MARKET)

        const lastTrade = new BigNumber(trade.price)

        if (trade.type == 'buy') buyTotal = buyTotal.plus(trade.amount)
        else if (trade.type == 'sell') sellTotal = sellTotal.plus(trade.amount)
        else assert(false)
        console.log(`buyTotal: ${buyTotal}`)
        console.log(`sellTotal: ${sellTotal}`)

        if (buyTotal.eq(size) || sellTotal.eq(size)) {
          console.log('--- ORDER FILLED WHOLLY ---')
          buyTotal = new BigNumber(0)
          sellTotal = new BigNumber(0)
          await module.exports.clearOrdersAndSendStaircaseOrders(
            checksumAddress,
            privateKey,
            parseInt(steps),
            new BigNumber(size),
            new BigNumber(lastTrade),
            new BigNumber(spread)
          )
        } else {
          console.log('--- ORDER FILLED PARTIALLY ---')
        }
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
