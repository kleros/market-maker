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
const calculateMaximumReserve = require('./utils').calculateMaximumReserve
const getStaircaseOrders = require('./utils').getStaircaseOrders

const web3 = new Web3(
  new Web3.providers.HttpProvider(process.env.ETHEREUM_PROVIDER)
)
const ORDER_INTERVAL = new BigNumber(0.0005)
const MIN_ETH_SIZE = new BigNumber(0.15)
const decimals = new BigNumber('10').pow(new BigNumber('18'))

module.exports = {
  getOrders: function(steps, sizeInEther, spread, reserve) {
    const rawOrders = getStaircaseOrders(
      steps,
      sizeInEther,
      spread,
      ORDER_INTERVAL,
      reserve
    )

    const orders = []
    for (let i = 0; i < rawOrders.length; i++) {
      if (rawOrders[i].pnk.lt(new BigNumber(0))) {
        orders.push({
          tokenBuy: ETHER,
          amountBuy: rawOrders[i].eth
            .times(decimals)
            .toFixed(0, BigNumber.ROUND_UP)
            .toString(),
          tokenSell: PINAKION,
          amountSell: rawOrders[i].pnk
            .absoluteValue()
            .times(decimals)
            .toString()
        })
      } else {
        orders.push({
          tokenBuy: PINAKION,
          amountBuy: rawOrders[i].pnk.times(decimals).toString(),
          tokenSell: ETHER,
          amountSell: rawOrders[i].eth
            .absoluteValue()
            .times(decimals)
            .toFixed(0, BigNumber.ROUND_DOWN)
            .toString()
        })
      }
    }

    return orders
  },
  clearOrders: async function(address, privateKey) {
    assert(web3.utils.checkAddressChecksum(address))

    while (true) {
      console.log('Clearing previous orders...')
      try {
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
            process.env.IDEX_SECRET,
            openOrders[i].orderHash,
            nonce
          )
        }
      } catch (e) {
        console.log(e)
      }
    }
  },
  placeStaircaseOrders: async function(
    address,
    privateKey,
    steps,
    size,
    spread,
    reserve
  ) {
    if ((await idexWrapper.getOpenOrders(address)).length == 0) {
      var orders = module.exports.getOrders(steps, size, spread, reserve)
      for (let i = 0; i < orders.length; i++) {
        const nonce = await idexWrapper.getNextNonce(address)
        if (typeof nonce.nonce !== 'number') {
          console.log(
            `Failed to retrieve nonce, cannot send ${orders[
              i
            ].toString()}. Skipping...`
          )
        } else
          try {
            await idexWrapper.sendOrder(
              web3,
              address,
              process.env.IDEX_SECRET,
              orders[i],
              nonce
            )
          } catch (e) {
            console.log(e)
          }
      }
    } else {
      console.log(
        'There are previous orders to be cleared, skipping placing orders.'
      )
    }
  },

  autoMarketMake: async function(steps, spread) {
    w.on('message', async msg => {
      const parsed = JSON.parse(msg)
      console.log(parsed)
      if (parsed.request === 'handshake' && parsed.result === 'success') {
        w.send(
          JSON.stringify({
            sid: parsed.sid,
            request: 'subscribeToAccounts',
            payload: `{"topics": ["${MARKET}"], "events": ["account_trades"] }`
          })
        )
      }

      if (
        parsed.request === 'subscribeToAccounts' &&
        parsed.result === 'success'
      ) {
        const date = new Date()
        const checksumAddress = web3.utils.toChecksumAddress(
          process.env.IDEX_ADDRESS
        )
        await module.exports.clearOrders(
          checksumAddress,
          process.env.IDEX_SECRET
        )
        const ticker = await idexWrapper.getTicker(MARKET)

        const highestBid = new BigNumber(ticker.highestBid)
        const lowestAsk = new BigNumber(ticker.lowestAsk)
        const balances = await idexWrapper.getBalances(checksumAddress)
        const availableETH = new BigNumber(balances['ETH'])
        const availablePNK = new BigNumber(balances['PNK'])
        console.log(balances)
        reserve = calculateMaximumReserve(
          availableETH,
          availablePNK,
          lowestAsk.plus(highestBid).div(new BigNumber(2))
        )

        await module.exports.placeStaircaseOrders(
          checksumAddress,
          process.env.IDEX_SECRET,
          parseInt(steps),
          MIN_ETH_SIZE,
          new BigNumber(spread),
          reserve
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
