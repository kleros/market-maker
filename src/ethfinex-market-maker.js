const assert = require('assert')
const crypto = require('crypto')
const WS = require('ws')
const BigNumber = require('bignumber.js')
const ethfinexRestWrapper = require('./ethfinex-rest-api-wrapper')
const { chunk } = require('lodash')
const utils = require('./utils')
const fs = require('fs')

const ETHFINEX_WEBSOCKET_API = 'wss://api.bitfinex.com/ws/2/'

BigNumber.config({ EXPONENTIAL_AT: [-30, 40] })

const SYMBOL = 'tPNKETH'
const MIN_ETH_SIZE = new BigNumber(0.2)
const HEARTBEAT_TIMEOUT = 90000 // 90 Seconds

let orderGroupID = 0

const MsgCodes = Object.freeze({
  ORDER_SNAPSHOT: 'os',
  ORDER_NEW: 'on',
  ORDER_UPDATE: 'ou',
  ORDER_CANCEL: 'oc',
  BALANCE_UPDATE: 'bu',
  WALLET_SNAPSHOT: 'ws',
  WALLET_UPDATE: 'wu',
  TRADE_EXECUTED: 'te',
  TRADE_EXECUTION_UPDATE: 'tu',
  NOTIFICATIONS: 'n',
  HEARTBEAT: 'hb'
})

const TradeSide = Object.freeze({
  MAKER: 1,
  TAKER: -1
})

const WSCloseCodes = Object.freeze({
  CLOSE_GOING_AWAY: 1001,
  CLOSE_ABNORMAL: 1006,
  NO_STATUS_RECEIVED: 1005
})

const CANCEL_ALL_ORDERS = JSON.stringify([
  0,
  'oc_multi',
  null,
  {
    all: 1
  }
])

module.exports = {
  newExchangeLimitOrder: function(amount, price) {
    return [
      'on',
      {
        amount,
        gid: ++orderGroupID,
        cid: Math.floor(Math.random() * 2 ** 45),
        price,
        symbol: SYMBOL,
        type: 'EXCHANGE LIMIT',
        tif: '2030-01-01 10:45:23'
      }
    ]
  },

  getOpenOrders: async function() {
    try {
      return await ethfinexRestWrapper.orders((Date.now() * 1000).toString())
    } catch (err) {
      console.log(err)
      process.exit(utils.ExitCodes.API_REQUEST_FAILED)
    }
  },

  getOrders: function(steps, sizeInEther, reserve) {
    const rawOrders = utils.getBoundingCurveStaircaseOrders(
      steps,
      sizeInEther,
      reserve
    )

    const orders = []
    const equilibrium = reserve.eth.div(reserve.pnk)
    for (const rawOrder of rawOrders) {
      const orderAmount = rawOrder.pnk
      const orderPrice = rawOrder.eth.div(rawOrder.pnk).absoluteValue()

      if (orderAmount.isPositive())
        assert(orderPrice.lt(equilibrium), orderPrice.toString())
      else assert(orderPrice.gt(equilibrium), orderPrice.toString())

      orders.push(
        this.newExchangeLimitOrder(
          rawOrder.pnk.toString(),
          rawOrder.eth
            .div(rawOrder.pnk)
            .absoluteValue()
            .toString()
        )
      )
    }
    const chunks = chunk(orders, 15).map(c => [0, 'ox_multi', null, c])
    return chunks
  },

  autoMarketMake: async steps => {
    let noOfTrades = 0

    assert(steps <= 128, 'You exceeded Ethfinex maximum order limit.')

    const w = new WS(ETHFINEX_WEBSOCKET_API)

    let highestBid
    let lowestAsk
    let reserve

    const available = {}

    fs.readFile('ethfinex_reserve.txt', 'utf-8', (err, data) => {
      if (err) return
      reserve = JSON.parse(data)
      reserve.pnk = new BigNumber(reserve.pnk)
      reserve.eth = new BigNumber(reserve.eth)
      console.log(
        `${new Date().toISOString()} # Found a reserve file, loading...`
      )
      utils.logReserve(reserve)
    })

    if (
      typeof process.env.ETHFINEX_KEY === 'undefined' ||
      typeof process.env.ETHFINEX_SECRET === 'undefined'
    ) {
      console.log(
        'Please export ETHFINEX_KEY and ETHFINEX_SECRET environment variables.'
      )
      process.exit(utils.ExitCodes.DONT_RESTART)
    }
    const heartbeat = client => {
      clearTimeout(client.pingTimeout)
      client.pingTimeout = setTimeout(function() {
        process.exit(utils.ExitCodes.WEBSOCKET_CONNECTION_DOWN)
      }, HEARTBEAT_TIMEOUT)
    }
    w.on('open', () => {
      heartbeat(w)
      w.send(authenticationPayload())
    })

    w.on('error', async event => {
      console.log('onerror')
      console.log(event)
    })

    w.on('close', async function(errorCode) {
      console.log(`${new Date().toISOString()} # WS.ONCLOSE`)
      console.log(
        `${new Date().toISOString()} # WS${errorCode} | Expected error. Restarting...`
      )
      if (
        errorCode == WSCloseCodes.CLOSE_GOING_AWAY ||
        errorCode == WSCloseCodes.CLOSE_ABNORMAL ||
        WSCloseCodes.NO_STATUS_RECEIVED
      ) {
        await new Promise(resolve => setTimeout(resolve, 10000))
        await module.exports.autoMarketMake(steps) // Restart
      } else {
        console.log(
          `${new Date().toISOString()} # WS${errorCode} | Unexpected error. Shutting down...`
        )
        clearTimeout(this.pingTimeout)
      }
    })

    w.on('message', async msg => {
      heartbeat(w)
      const parsed = JSON.parse(msg)

      if (
        parsed[1] == MsgCodes.ORDER_NEW ||
        parsed[1] == MsgCodes.NOTIFICATIONS ||
        parsed[1] == MsgCodes.ORDER_CANCEL ||
        parsed[1] == MsgCodes.BALANCE_UPDATE
      ) {
        // DO NOTHING
      } else if (parsed[1] == MsgCodes.HEARTBEAT) {
        if (reserve) {
          let openOrders = await module.exports.getOpenOrders()

          console.log(
            `${new Date().toISOString()} # ${
              MsgCodes.HEARTBEAT
            } | Number of open orders: ${openOrders.length}`
          )
          if (Array.isArray(openOrders) && openOrders.length == 0) {
            console.log(
              `${new Date().toISOString()} #    | Placing orders as there are none...`
            )
            const orders = module.exports.getOrders(
              parseInt(steps),
              MIN_ETH_SIZE,
              reserve
            )
            for (const batch of orders) w.send(JSON.stringify(batch))

            openOrders = await module.exports.getOpenOrders()
            console.log(
              `${new Date().toISOString()} #    | ...number of open orders: ${
                openOrders.length
              }`
            )
          } else if (
            Array.isArray(openOrders) &&
            openOrders.length != steps * 2
          ) {
            console.error(utils.ExitCodes.INCORRECT_NUMBER_OF_ORDERS)
            process.exit(utils.ExitCodes.INCORRECT_NUMBER_OF_ORDERS)
          }
        }
      } else if (parsed[1] == MsgCodes.ORDER_SNAPSHOT)
        console.log(
          `${new Date().toISOString()} # ${
            MsgCodes.ORDER_SNAPSHOT
          } | Number of open orders: ${parsed[2].length}`
        )
      else if (
        parsed[1] == MsgCodes.WALLET_SNAPSHOT ||
        parsed[1] == MsgCodes.WALLET_UPDATE
      ) {
        const payload = parsed[2]
        if (Array.isArray(payload[0]))
          // WALLET SNAPSHOT
          for (const array of payload)
            available[array[1]] = new BigNumber(array[2])
        // WALLET UPDATE
        else available[payload[1]] = new BigNumber(payload[2])

        utils.logBalance(available.ETH, available.PNK)
      } else if (parsed.length == 10)
        console.log(
          `Bid: ${parsed[0]} | Ask: ${parsed[2]} | Last: ${parsed[6]}`
        )
      // CATCH ALL - LOG RAW MESSAGE
      else console.log(parsed)

      if (
        !reserve &&
        available.ETH &&
        available.PNK &&
        lowestAsk &&
        highestBid
      ) {
        console.log('Reserve not found, calculating...')
        reserve = utils.calculateMaximumReserve(
          available.ETH,
          available.PNK,
          highestBid.plus(lowestAsk).div(2)
        )

        utils.logReserve(reserve)

        fs.writeFile('ethfinex_reserve.txt', JSON.stringify(reserve), err => {
          if (err) console.log(err)
          console.log('Reserve saved to file.')
        })
      }

      if (parsed.event == 'info') {
        const ticker = await ethfinexRestWrapper.ticker()
        console.log(ticker)
        highestBid = new BigNumber(ticker[0])
        lowestAsk = new BigNumber(ticker[2])

        return
      }

      if (parsed.event == 'auth') {
      }

      if (
        Array.isArray(parsed) &&
        parsed[1] == MsgCodes.TRADE_EXECUTION_UPDATE &&
        parsed[2][1] == SYMBOL
      ) {
        const tradeExecutionLog = parsed[2]
        const orderID = tradeExecutionLog[3]

        if (tradeExecutionLog[8] != TradeSide.MAKER) {
          console.log(
            `${new Date().toISOString()} # tu | Order ${orderID} was a taker trade.`
          )
          console.log(tradeExecutionLog)
        }

        let filledPartially
        let openOrders = await module.exports.getOpenOrders()

        if (openOrders.find(order => order[0] == orderID) != undefined) {
          // If we find the exact order in the list, it means it wasn't removed from the list thus was partially filled
          console.log(
            `${new Date().toISOString()} # tu | Order ${orderID} was partially filled.`
          )
          filledPartially = true
        }

        const pinakionAmount = new BigNumber(tradeExecutionLog[4])
        const price = new BigNumber(tradeExecutionLog[5])
        const tradeFee = new BigNumber(tradeExecutionLog[9])
        const tradeFeeCurrency = tradeExecutionLog[10]

        const fee = { ETH: 0, PNK: 0 } // Fees are always negative
        fee[tradeFeeCurrency] = tradeFee

        const pinakionAmountAfterFee = pinakionAmount.plus(fee.PNK)
        console.log(`pinakionAmountAfterFee: ${pinakionAmountAfterFee}`)
        const oldInvariant = reserve.eth.times(reserve.pnk)

        const etherAmountAfterFee = pinakionAmount
          .times(price)
          .times(new BigNumber('-1'))
          .plus(fee.ETH)
        console.log(`etherAmountAfterFee: ${etherAmountAfterFee}`)
        reserve.eth = reserve.eth.plus(etherAmountAfterFee)
        reserve.pnk = reserve.pnk.plus(pinakionAmountAfterFee)
        utils.logReserve(reserve)
        fs.writeFileSync('ethfinex_reserve.txt', JSON.stringify(reserve))
        const newInvariant = reserve.eth.times(reserve.pnk)
        const TOLERANCE = 0.999 // When multiple orders are taken invariant gets lowered a bit, so we need to tolerate tiny amounts.

        try {
          assert(
            newInvariant.gte(oldInvariant.times(TOLERANCE)),
            `New Invariant: ${newInvariant}  Old Invariant: ${oldInvariant}\nInvariant should not decrease. Check bounding curve implemention.`
          )
        } catch (err) {
          await console.log(err)
          process.exit(utils.ExitCodes.DONT_RESTART)
        }

        if (!filledPartially) {
          noOfTrades++
          console.log(`Number of trades done: ${noOfTrades}`)
          if (noOfTrades > 200) process.exit(utils.ExitCodes.DONT_RESTART)

          console.log(
            `${new Date().toISOString()} # tu | Order filled fully. Cancelling orders in order to replace all...`
          )

          const orders = module.exports.getOrders(
            parseInt(steps),
            MIN_ETH_SIZE,
            reserve
          )

          while (!Array.isArray(openOrders) || openOrders.length != 0) {
            w.send(CANCEL_ALL_ORDERS)
            await new Promise(resolve => setTimeout(resolve, 5000))
            console.log(
              `${new Date().toISOString()} # ${
                MsgCodes.TRADE_EXECUTION_UPDATE
              } | There are ${openOrders.length} leftover orders, cancelling...`
            )
            openOrders = await module.exports.getOpenOrders()
            if (openOrders[0] == 'error') console.log(openOrders)
          }

          await new Promise(resolve => setTimeout(resolve, 10000))
          console.log(
            `${new Date().toISOString()} # ${
              MsgCodes.TRADE_EXECUTION_UPDATE
            } | Placing new ${steps * 2} orders`
          )
          for (const batch of orders) w.send(JSON.stringify(batch))
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
  }
}

0x7065cb480000000000000000000000000539637082ac79ba945869603417c15ca05b0e3f
