const createDatastreamClient = require('@auroradao/datastream-client')
const uwsConnector = require('@auroradao/datastream-connector-uws')
const WS = require('ws')
const Web3 = require('web3')
const fetch = require('node-fetch')
const assert = require('assert')

const API_KEY = '17paIsICur8sA0OBqG6dH5G1rmrHNMwt4oNk4iX9'
const w = new WS('wss://datastream.idex.market')
const PINAKION = '0x93ED3FBe21207Ec2E8f2d3c3de6e058Cb73Bc04d'
const QUANT = '0x4a220E6096B25EADb88358cb44068A3248254675'

const {
  hashPersonalMessage,
  bufferToHex,
  toBuffer,
  ecsign
} = require('ethereumjs-util')
const { mapValues } = require('lodash')

let web3
let lastTrade

module.exports = async (address, privateKey, steps, size, spread) => {
  if (typeof process.env.ETHEREUM_PROVIDER === 'undefined') {
    console.log('Please export ETHEREUM_PROVIDER environment variable.')
    process.exit(2)
  }

  console.log(privateKey)
  w.on('message', msg => {
    web3 = new Web3(
      new Web3.providers.HttpProvider(process.env.ETHEREUM_PROVIDER)
    )
    const parsed = JSON.parse(msg)
    console.log(parsed)
    if (parsed.request === 'handshake' && parsed.result === 'success')
      w.send(
        JSON.stringify({
          sid: parsed.sid,
          request: 'subscribeToMarkets',
          payload: '{"topics": ["ETH_QNT"], "events": ["market_trades"] }'
        })
      )

    if (parsed.event === 'market_trades') {
      lastTrade = JSON.parse(parsed.payload).trades[0].price

      const orders = staircaseOrders(
        parseInt(steps),
        parseInt(size),
        parseFloat(lastTrade),
        parseFloat(spread)
      )
      console.log(orders.length)
      console.log(orders)

      console.log('processing')
      fetch('https://api.idex.market/order', {
        headers: {
          'Content-Type': 'application/json'
        },
        method: 'POST',
        body: prepareOrder(
          orders[0].tokenBuy,
          orders[0].amountBuy,
          orders[0].tokenSell,
          orders[0].amountSell
        )
      })
        .then(function(response) {
          return response.json()
        })
        .then(console.log)

      // fetch('https://api.idex.market/order', {
      //   headers: {
      //     'Content-Type': 'application/json'
      //   },
      //   method: 'POST',
      //   body: JSON.stringify(
      //     prepareOrder(
      //       orders[1].tokenBuy,
      //       orders[1].amountBuy,
      //       orders[1].tokenSell,
      //       orders[1].amountSell
      //     ),
      //     null,
      //     2
      //   )
      // })
      //   .then(function(response) {
      //     return response.json()
      //   })
      //   .then(console.log)
      // fetch('https://api.idex.market/order', {
      //   headers: {
      //     'Content-Type': 'application/json'
      //   },
      //   method: 'POST',
      //   body: JSON.stringify(
      //     prepareOrder(
      //       orders[2].tokenBuy,
      //       orders[2].amountBuy,
      //       orders[2].tokenSell,
      //       orders[2].amountSell
      //     ),
      //     null,
      //     2
      //   )
      // })
      //   .then(function(response) {
      //     return response.json()
      //   })
      //   .then(console.log)
      // fetch('https://api.idex.market/order', {
      //   headers: {
      //     'Content-Type': 'application/json'
      //   },
      //   method: 'POST',
      //   body: JSON.stringify(
      //     prepareOrder(
      //       orders[3].tokenBuy,
      //       orders[3].amountBuy,
      //       orders[3].tokenSell,
      //       orders[3].amountSell
      //     ),
      //     null,
      //     2
      //   )
      // })
      //   .then(function(response) {
      //     return response.json()
      //   })
      //   .then(console.log)
    }
  })

  function staircaseOrders(stepsOnOneSide, size, lastTrade, spread) {
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

    for (let i = 1; i <= stepsOnOneSide; i++)
      orders.push({
        tokenBuy: PINAKION,
        amountBuy: size.toString(),
        tokenSell: '0x0000000000000000000000000000000000000000',
        amountSell: (lastTrade - i * step).toString()
      })

    for (let i = 1; i <= stepsOnOneSide; i++)
      orders.push({
        tokenBuy: '0x0000000000000000000000000000000000000000',
        amountBuy: (lastTrade + i * step).toString(),
        tokenSell: PINAKION,
        amountSell: size.toString()
      })

    return orders
  }

  function prepareOrder(tokenBuy, amountBuy, tokenSell, amountSell) {
    console.log('sign the fuck')

    fetch('https://api.idex.market/returnNextNonce', {
      headers: {
        'Content-Type': 'application/json'
      },
      method: 'POST',
      body: JSON.stringify({
        address: address
      })
    })
      .catch(function(error) {
        console.log('error')
      })
      .then(function(response) {
        return response.json()
      })
      .then(function(nextNonce) {
        console.log(`nextNonce: ${nextNonce.nonce}`)
        const args = {
          tokenBuy: tokenBuy,
          amountBuy: amountBuy,
          tokenSell: tokenSell,
          amountSell: amountSell,
          address: address,
          nonce: nextNonce.nonce,
          expires: 100000 // HAS NO EFFECT
        }
        const raw = web3.utils.soliditySha3(
          {
            t: 'address',
            v: '0x2a0c0dbecc7e4d658f48e01e3fa353f44050c208' // IDEX CONTRACT ADDRESS
          },
          {
            t: 'address',
            v: args.tokenBuy
          },
          {
            t: 'uint256',
            v: args.amountBuy
          },
          {
            t: 'address',
            v: args.tokenSell
          },
          {
            t: 'uint256',
            v: args.amountSell
          },
          {
            t: 'uint256',
            v: args.expires
          },
          {
            t: 'uint256',
            v: args.nonce
          },
          {
            t: 'address',
            v: args.address
          }
        )

        const salted = hashPersonalMessage(toBuffer(raw))
        const vrs = mapValues(
          ecsign(salted, toBuffer(privateKey)),
          (value, key) => (key === 'v' ? value : bufferToHex(value))
        )
        console.log(Object.assign(args, vrs))
        return JSON.stringify(Object.assign(args, vrs), null, 2)
      })
  }

  w.on('open', () => {
    w.send(
      JSON.stringify({
        request: 'handshake',
        payload:
          '{"version": "1.0.0", "key": "17paIsICur8sA0OBqG6dH5G1rmrHNMwt4oNk4iX9"}'
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
