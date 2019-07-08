const createDatastreamClient = require('@auroradao/datastream-client')
const uwsConnector = require('@auroradao/datastream-connector-uws')
const WS = require('ws')
const Web3 = require('web3')
const fetch = require('node-fetch')

const API_KEY = '17paIsICur8sA0OBqG6dH5G1rmrHNMwt4oNk4iX9'
const w = new WS('wss://datastream.idex.market')
const PINAKION = '0x93ED3FBe21207Ec2E8f2d3c3de6e058Cb73Bc04d'

const {
  hashPersonalMessage,
  bufferToHex,
  toBuffer,
  ecsign
} = require('ethereumjs-util')
const { mapValues } = require('lodash')

let web3

module.exports = async (address, privateKey, steps, size, spread) => {
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
          payload:
            '{"topics": ["ETH_QNT"], "events": ["market_trades", "market_orders"] }'
        })
      )

    if (parsed.event === 'market_trades' || parsed.event === 'market_orders')
      // console.log(JSON.parse(parsed.payload).trades[0].price)

      fetch('https://api.idex.market/returnNextNonce', {
        headers: {
          'Content-Type': 'application/json'
        },
        method: 'POST',
        body: JSON.stringify({
          address: address
        })
      })
        .then(function(response) {
          return response.json()
        })
        .then(function(result) {
          const buyOrder = {
            tokenBuy: '0x0000000000000000000000000000000000000000',
            amountBuy: '150000000000000000',
            tokenSell: PINAKION,
            amountSell: '1000000000000000000000',
            address: address,
            nonce: result.nonce,
            expires: 100000 // HAS NO EFFECT
          }

          fetch('https://api.idex.market/order', {
            headers: {
              'Content-Type': 'application/json'
            },
            method: 'POST',
            body: JSON.stringify(signMessage(buyOrder, privateKey), null, 2)
          })
            .then(function(response) {
              return response.json()
            })
            .then(console.log)
        })
  })

  function signMessage(args, privateKey) {
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
    const raw2 = `\u0019Ethereum Signed Message:\n32${raw}`
    const raw3 = web3.utils.soliditySha3(raw2)

    const salted = hashPersonalMessage(toBuffer(raw))
    const vrs = mapValues(ecsign(salted, toBuffer(privateKey)), (value, key) =>
      key === 'v' ? value : bufferToHex(value)
    )
    console.log(Object.assign(args, vrs))
    return Object.assign(args, vrs)
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
