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

module.exports = {
  getOpenOrders: async function(address, count = 100, cursor = 0) {
    return await fetch(`${HTTPS_API}/returnOpenOrders`, {
      headers: {
        'Content-Type': 'application/json'
      },
      method: 'POST',
      body: JSON.stringify({ address: address, count: count, cursor: cursor })
    }).then(function(response) {
      return response.json()
    })
  },

  getTicker: async function(market) {
    return await fetch(`${HTTPS_API}/returnTicker`, {
      headers: {
        'Content-Type': 'application/json'
      },
      method: 'POST',
      body: JSON.stringify({
        market: market
      })
    }).then(function(response) {
      return response.json()
    })
  },

  getNextNonce: async function(address) {
    return await fetch(`${HTTPS_API}/returnNextNonce`, {
      headers: {
        'Content-Type': 'application/json'
      },
      method: 'POST',
      body: JSON.stringify({
        address: address
      })
    }).then(function(response) {
      return response.json()
    })
  },

  cancelOrder: async function(
    web3,
    address,
    privateKey,
    orderHash,
    nextNonce,
    tryFor
  ) {
    await fetch_retry(
      `${HTTPS_API}/cancel`,
      {
        headers: {
          'Content-Type': 'application/json'
        },
        method: 'POST',
        body: JSON.stringify(
          this.signCancel(web3, privateKey, {
            orderHash: orderHash,
            address: address,
            nonce: nextNonce.nonce
          })
        )
      },
      3
    )
      .catch(function(error) {
        console.error(error)
      })
      .then(function(response) {
        return response.json()
      })
      .then(console.log)
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
    console.log(Object.assign(args, vrs))
    return Object.assign(args, vrs)
  },

  sendOrder: async function(web3, address, privateKey, order, nextNonce) {
    await fetch(`${HTTPS_API}/order`, {
      headers: {
        'Content-Type': 'application/json'
      },
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
      .catch(function(error) {
        console.error(error)
      })
      .then(function(response) {
        return response.json()
      })
      .then(console.log)
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
    console.log(Object.assign(args, vrs))
    return Object.assign(args, vrs)
  },

  fetch_retry: (url, options, n) =>
    fetch(url, options).catch(function(error) {
      if (n === 1) throw error
      return fetch_retry(url, options, n - 1)
    })
}
