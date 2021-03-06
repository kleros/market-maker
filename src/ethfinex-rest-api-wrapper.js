const AUTHENTICATED = 'https://api.bitfinex.com'
const PUBLIC = 'https://api-pub.bitfinex.com'

const fetch = require('node-fetch')
const crypto = require('crypto')

module.exports = {
  getSignatureHash: function(apiPath, body, nonce) {
    const signature = `/api/${apiPath}${nonce}${JSON.stringify(body)}`
    const sig = crypto
      .createHmac('SHA384', process.env.ETHFINEX_SECRET)
      .update(signature)
    return sig.digest('hex')
  },

  ticker: async function(symbol = 'tPNKETH') {
    return fetch(`${PUBLIC}/v2/ticker/${symbol}`).then(function(response) {
      return response.json()
    })
  },

  wallets: async function(nonce) {
    return fetch(`${AUTHENTICATED}/v2/auth/r/wallets?type=price`, {
      headers: {
        'Content-Type': 'application/json',
        'bfx-nonce': nonce,
        'bfx-apikey': process.env.ETHFINEX_KEY,
        'bfx-signature': module.exports.getSignatureHash(
          'v2/auth/r/wallets',
          {},
          nonce
        )
      },
      json: true,
      method: 'POST',
      body: JSON.stringify({})
    }).then(function(response) {
      return response.json()
    })
  },

  orders: async function(nonce) {
    return fetch(`${AUTHENTICATED}/v2/auth/r/orders`, {
      headers: {
        'Content-Type': 'application/json',
        'bfx-nonce': nonce,
        'bfx-apikey': process.env.ETHFINEX_KEY,
        'bfx-signature': module.exports.getSignatureHash(
          'v2/auth/r/orders',
          {},
          nonce
        )
      },
      json: true,
      method: 'POST',
      body: JSON.stringify({})
    }).then(function(response) {
      return response.json()
    })
  },
  sendOrders: async function(nonce, orders) {
    return fetch(`${AUTHENTICATED}/v2/auth/w/order/multi`, {
      headers: {
        'Content-Type': 'application/json',
        'bfx-nonce': nonce,
        'bfx-apikey': process.env.ETHFINEX_KEY,
        'bfx-signature': module.exports.getSignatureHash(
          'v2/auth/w/order/multi',
          {},
          nonce
        )
      },
      json: true,
      method: 'POST',
      body: JSON.stringify({ ops: { ...orders } })
    }).then(function(response) {
      return response.json()
    })
  },
  cancelAllOrders: async function(nonce) {
    return fetch(`${AUTHENTICATED}/v2/auth/w/order/cancel`, {
      headers: {
        'Content-Type': 'application/json',
        'bfx-nonce': nonce,
        'bfx-apikey': process.env.ETHFINEX_KEY,
        'bfx-signature': module.exports.getSignatureHash(
          'v2/auth/w/order/cancel/multi',
          {},
          nonce
        )
      },
      json: true,
      method: 'POST',
      body: JSON.stringify({ all: 1 })
    }).then(function(response) {
      console.log(response)
      return response.json()
    })
  }
}
