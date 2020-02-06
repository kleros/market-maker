const HTTPS_API = 'https://api.idex.market'
const fetch = require('node-fetch')
const {
  hashPersonalMessage,
  bufferToHex,
  toBuffer,
  ecsign
} = require('ethereumjs-util')
const { mapValues } = require('lodash')

const IDEX_CONTRACT = '0x2a0c0dbecc7e4d658f48e01e3fa353f44050c208'

const getHeader = function(apiKey) {
  return {
    'Content-Type': 'application/json',
    'API-Key': apiKey
  }
}

module.exports = {
  getOrderStatus: async function(apiKey, orderHash) {
    return fetch(`${HTTPS_API}/returnOrderStatus`, {
      headers: getHeader(apiKey),
      method: 'POST',
      body: JSON.stringify({ orderHash }).then(function(response) {
        return response.json()
      })
    })
  },

  getOpenOrders: async function(apiKey, address, count = 100, cursor = 0) {
    return fetch(`${HTTPS_API}/returnOpenOrders`, {
      headers: getHeader(apiKey),
      method: 'POST',
      body: JSON.stringify({ address: address, count: count, cursor: cursor })
    }).then(function(response) {
      return response.json()
    })
  },

  getBalances: async function(apiKey, address) {
    return fetch(`${HTTPS_API}/returnBalances`, {
      headers: getHeader(apiKey),
      method: 'POST',
      body: JSON.stringify({ address: address })
    }).then(function(response) {
      return response.json()
    })
  },

  getTicker: async function(apiKey, market) {
    return fetch(`${HTTPS_API}/returnTicker`, {
      headers: getHeader(apiKey),
      method: 'POST',
      body: JSON.stringify({
        market: market
      })
    }).then(function(response) {
      return response.json()
    })
  },

  getNextNonce: async function(apiKey, address) {
    return fetch(`${HTTPS_API}/returnNextNonce`, {
      headers: getHeader(apiKey),
      method: 'POST',
      body: JSON.stringify({
        address: address
      })
    }).then(function(response) {
      return response.json()
    })
  },

  cancelOrder: async function(
    apiKey,
    web3,
    address,
    privateKey,
    orderHash,
    nextNonce
  ) {
    await fetch(`${HTTPS_API}/cancel`, {
      headers: getHeader(apiKey),
      method: 'POST',
      body: JSON.stringify(
        this.signCancel(web3, privateKey, {
          orderHash: orderHash,
          address: address,
          nonce: nextNonce.nonce
        })
      )
    })
      .catch(function(err) {
        console.error(err)
      })
      .then(function(response) {
        return response.json()
      })
      .then(function(response) {
        if (response.success) process.stdout.write('✔️')
        else console.log(response)
      })
  },

  signCancel: (web3, privateKey, args) => {
    const raw = web3.utils.soliditySha3(
      {
        t: 'uint256',
        v: args.orderHash
      },

      {
        t: 'uint256',
        v: args.nonce
      }
    )

    const salted = hashPersonalMessage(toBuffer(raw))
    const vrs = mapValues(ecsign(salted, toBuffer(privateKey)), (value, key) =>
      key === 'v' ? value : bufferToHex(value)
    )
    return Object.assign(args, vrs)
  },

  sendOrder: async function(
    apiKey,
    web3,
    address,
    privateKey,
    order,
    nextNonce
  ) {
    await fetch(`${HTTPS_API}/order`, {
      headers: getHeader(apiKey),
      method: 'POST',
      body: JSON.stringify(
        this.signOrder(web3, privateKey, {
          tokenBuy: order.tokenBuy,
          amountBuy: order.amountBuy,
          tokenSell: order.tokenSell,
          amountSell: order.amountSell,
          address: address,
          nonce: nextNonce.nonce,
          expires: 100000 // HAS NO EFFECT
        }),
        null,
        2
      )
    })
      .catch(function(err) {
        console.error(err)
      })
      .then(function(response) {
        return response.json()
      })
      .then(function(response) {
        if (response.orderHash) process.stdout.write('✔️')
        else console.log(response)
      })
  },

  signOrder: (web3, privateKey, args) => {
    const raw = web3.utils.soliditySha3(
      {
        t: 'address',
        v: IDEX_CONTRACT // IDEX CONTRACT ADDRESS
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
    const vrs = mapValues(ecsign(salted, toBuffer(privateKey)), (value, key) =>
      key === 'v' ? value : bufferToHex(value)
    )
    return Object.assign(args, vrs)
  }
}
