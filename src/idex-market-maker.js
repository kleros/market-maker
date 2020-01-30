const WS = require('ws')
const Web3 = require('web3')
const assert = require('assert')
const BigNumber = require('bignumber.js')

BigNumber.config({ EXPONENTIAL_AT: [-30, 40] })

const API_VERSION = '1.0.0'
const IDEX_API_KEY = process.env.IDEX_API_KEY

const PINAKION = '0x93ED3FBe21207Ec2E8f2d3c3de6e058Cb73Bc04d'
const ETHER = '0x0000000000000000000000000000000000000000'
const MARKET = 'ETH_PNK'
const idexWrapper = require('./idex-https-api-wrapper')
const utils = require('./utils')
const fs = require('fs')

const web3 = new Web3(
  new Web3.providers.HttpProvider(process.env.ETHEREUM_PROVIDER)
)

const MIN_ETH_SIZE = new BigNumber(0.15)
const decimals = new BigNumber('10').pow(new BigNumber('18'))

module.exports = {
  getOrders: function(steps, sizeInEther, reserve) {
    const rawOrders = utils.getBoundingCurveStaircaseOrders(
      steps,
      sizeInEther,
      reserve
    )

    const orders = []
    for (const rawOrder of rawOrders)
      if (rawOrder.pnk.lt(new BigNumber(0)))
        orders.push({
          tokenBuy: ETHER,
          amountBuy: rawOrder.eth
            .times(decimals)
            .toFixed(0, BigNumber.ROUND_UP)
            .toString(),
          tokenSell: PINAKION,
          amountSell: rawOrder.pnk
            .absoluteValue()
            .times(decimals)
            .toFixed(0, BigNumber.ROUND_DOWN)
            .toString()
        })
      else
        orders.push({
          tokenBuy: PINAKION,
          amountBuy: rawOrder.pnk
            .times(decimals)
            .toFixed(0, BigNumber.ROUND_UP)
            .toString(),
          tokenSell: ETHER,
          amountSell: rawOrder.eth
            .absoluteValue()
            .times(decimals)
            .toFixed(0, BigNumber.ROUND_DOWN)
            .toString()
        })

    return orders
  },
  clearOrders: async function(address) {
    assert(web3.utils.checkAddressChecksum(address))

    while (true) {
      console.log('Clearing previous orders...')
      try {
        const openOrders = await idexWrapper.getOpenOrders(
          IDEX_API_KEY,
          address
        )

        if (Array.isArray(openOrders) && openOrders.length === 0) {
          console.log('No open order left.')
          break
        }

        console.log(`Number of open orders: ${openOrders.length}`)

        for (const openOrder of openOrders) {
          const nonce = await idexWrapper.getNextNonce(IDEX_API_KEY, address)
          assert(typeof nonce.nonce === 'number')
          assert(typeof openOrder.orderHash === 'string')

          await idexWrapper.cancelOrder(
            IDEX_API_KEY,
            web3,
            address,
            process.env.IDEX_SECRET,
            openOrder.orderHash,
            nonce
          )
        }
        console.log('')
      } catch (err) {
        console.log(err)
      }
    }
  },
  placeStaircaseOrders: async function(
    address,
    _privateKey,
    steps,
    size,
    reserve
  ) {
    if ((await idexWrapper.getOpenOrders(IDEX_API_KEY, address)).length === 0) {
      var orders = module.exports.getOrders(steps, size, reserve)
      console.log('Placing orders...')
      for (let i = 0; i < orders.length; i++) {
        const nonce = await idexWrapper.getNextNonce(IDEX_API_KEY, address)
        if (typeof nonce.nonce !== 'number')
          console.log(
            `Failed to retrieve nonce, cannot send ${orders[
              orders.length - 1 - i
            ].toString()}. Skipping...`
          )
        else
          try {
            await idexWrapper.sendOrder(
              IDEX_API_KEY,
              web3,
              address,
              process.env.IDEX_SECRET,
              orders[orders.length - 1 - i],
              nonce
            )
          } catch (err) {
            console.log(err)
          }
      }
      console.log('')
    } else
      console.log(
        'There are previous orders to be cleared, skipping placing orders.'
      )
  },

  autoMarketMake: async function(steps) {
    const w = new WS('wss://datastream.idex.market')
    let reserve
    fs.readFile('idex_reserve.txt', 'utf-8', (err, data) => {
      if (err) return
      reserve = JSON.parse(data)
      reserve.pnk = new BigNumber(reserve.pnk)
      reserve.eth = new BigNumber(reserve.eth)
      console.log('Found a reserve file, loading...')
    })
    const checksumAddress = web3.utils.toChecksumAddress(
      process.env.IDEX_ADDRESS
    )

    const heartbeat = client => {
      clearTimeout(client.pingTimeout)
      client.pingTimeout = setTimeout(function() {
        process.exit(utils.WEBSOCKET_CONNECTION_DOWN)
      }, 60000)
    }
    w.on('ping', () => {
      heartbeat(w)
    })

    w.on('message', async msg => {
      heartbeat(w)

      if (reserve) utils.logStats('undefined', 'undefined', reserve)

      const parsed = JSON.parse(msg)
      console.log(parsed)
      if (parsed.request === 'handshake' && parsed.result === 'success')
        w.send(
          JSON.stringify({
            sid: parsed.sid,
            request: 'subscribeToAccounts',
            payload: `{"topics": ["${checksumAddress}"], "events": ["account_trades"] }`
          })
        )

      if (
        parsed.request === 'subscribeToAccounts' &&
        parsed.result === 'success'
      ) {
        await module.exports.clearOrders(
          checksumAddress,
          process.env.IDEX_SECRET
        )
        const ticker = await idexWrapper.getTicker(IDEX_API_KEY, MARKET)
        console.log(ticker)
        const highestBid = new BigNumber(ticker.highestBid)
        const lowestAsk = new BigNumber(ticker.lowestAsk)
        const balances = await idexWrapper.getBalances(
          IDEX_API_KEY,
          checksumAddress
        )
        const availableETH = new BigNumber(balances.ETH)
        const availablePNK = new BigNumber(balances.PNK)

        console.log('Account balance:')
        console.log(balances)

        if (!reserve)
          reserve = utils.calculateMaximumReserve(
            availableETH,
            availablePNK,
            lowestAsk.plus(highestBid).div(2)
          )

        fs.writeFile('idex_reserve.txt', JSON.stringify(reserve), err => {
          if (err) console.log(err)
          console.log('Reserve saved to file.')
        })

        utils.logStats(availableETH, availablePNK, reserve)

        await module.exports.placeStaircaseOrders(
          checksumAddress,
          process.env.IDEX_SECRET,
          parseInt(steps),
          MIN_ETH_SIZE,
          reserve
        )
      }

      if (parsed.event === 'account_trades') {
        const payload = JSON.parse(parsed.payload)
        const trade = payload.trades[0]
        const pnkAmount = trade.amount
        const ethAmount = trade.total
        const isBuy = trade.tokenSell === ETHER

        const oldInvariant = reserve.eth.times(reserve.pnk)

        if (isBuy) {
          reserve.pnk = reserve.pnk.plus(new BigNumber(pnkAmount))
          reserve.eth = reserve.eth.minus(new BigNumber(ethAmount))
        } else {
          reserve.pnk = reserve.pnk.minus(new BigNumber(pnkAmount))
          reserve.eth = reserve.eth.plus(new BigNumber(ethAmount))
        }

        console.log('Account balance:')
        console.log(
          await idexWrapper.getBalances(IDEX_API_KEY, checksumAddress)
        )

        const newInvariant = reserve.eth.times(reserve.pnk)

        fs.writeFile('idex_reserve.txt', JSON.stringify(reserve), err => {
          if (err) console.log(err)
          console.log('Reserve saved to file.')
          utils.logStats(availableETH, availablePNK, reserve)
        })

        const TOLERANCE = 0.99999
        assert(
          newInvariant.gte(oldInvariant.times(TOLERANCE)),
          `New Invariant: ${newInvariant}  Old Invariant: ${oldInvariant}\nInvariant should not decrease. Check bounding curve implemention.`
        )

        await module.exports.clearOrders(
          checksumAddress,
          process.env.IDEX_SECRET
        )

        await module.exports.placeStaircaseOrders(
          checksumAddress,
          process.env.IDEX_SECRET,
          parseInt(steps),
          MIN_ETH_SIZE,
          reserve
        )
      }
    })

    w.on('open', () => {
      w.send(
        JSON.stringify({
          request: 'handshake',
          payload: `{"version": "${API_VERSION}", "key": "${IDEX_API_KEY}"}`
        })
      )
      keepAlive()
    })

    w.on('error', async event => {
      console.error(event)
      console.log('Web socket error, restarting...')
      await new Promise(resolve => setTimeout(resolve, 5000))
      module.exports.autoMarketMake(steps)
    })

    w.on('close', () => {
      cancelKeepAlive()
    })

    var timerId = 0
    function keepAlive() {
      heartbeat(w)
      var timeout = 10000
      if (w.readyState === WS.OPEN) w.send('')

      timerId = setTimeout(keepAlive, timeout)
    }
    function cancelKeepAlive() {
      if (timerId) clearTimeout(timerId)
    }
  }
}
