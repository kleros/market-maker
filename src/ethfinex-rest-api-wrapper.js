const REST_API = 'https://api.bitfinex.com'
const fetch = require('node-fetch')
const crypto = require('crypto')

const apiPath = 'v2/auth/r/wallets'
const nonce = Date.now() * 1000

const queryParams = 'type=price'
const body = {}
let signature = `/api/${apiPath}${nonce}${JSON.stringify(body)}`

const sig = crypto
  .createHmac('SHA384', process.env.ETHFINEX_SECRET)
  .update(signature)
const shex = sig.digest('hex')

module.exports = {
  getBalance: async function() {
    return await fetch(
      `https://api.bitfinex.com/v2/auth/r/wallets?type=price`,
      {
        headers: {
          'Content-Type': 'application/json',
          'bfx-nonce': nonce,
          'bfx-apikey': 'V1F4WqaK7DAxtfS3kV5l6KtSd4d0h5zltYv7BjYoKD2',
          'bfx-signature': shex
        },
        json: true,
        method: 'POST',
        body: JSON.stringify(body)
      }
    ).then(function(response) {
      return response.json()
    })
  },

  getTicker: async function(symbol = 'tPNKETH') {
    return await fetch(`https://api-pub.bitfinex.com/v2/ticker/tPNKETH`).then(
      function(response) {
        return response.json()
      }
    )
  }
}
