const assert = require('assert')
const BigNumber = require('bignumber.js')

BigNumber.config({ EXPONENTIAL_AT: [-30, 40] })

module.exports = {
  ExitCodes: Object.freeze({
    WEBSOCKET_CONNECTION_DOWN: 123,
    API_REQUEST_FAILED: 135,
    NON_MAKER_TRADE_OCCURRED: 721,
    UTIL_ASSERTION_FAILED: 999
  }),
  logStats: function(availableETH, availablePNK, reserve) {
    const date = new Date()
    console.log(
      `${date.toISOString()} # RESERVE <> ETH*PNK: ${reserve.eth.times(
        reserve.pnk
      )} ETH: ${reserve.eth} | PNK: ${reserve.pnk} | ETH/PNK: ${reserve.eth.div(
        reserve.pnk
      )}`
    )
    console.log(
      `${date.toISOString()} # Wallet ETH Balance: ${availableETH} | Wallet PNK Balance: ${availablePNK}`
    )
  },
  calculateMaximumReserve: function(availableETH, availablePNK, initialPrice) {
    assert(availableETH.gt(0) && availablePNK.gt(0))
    // The bounds feel pretty loose. I think we can tighten them a little. If price fluctuates to anywhere close to these ranges we can make a manual update to the bot.
    // Also make bounds a constant to make it easier to change.
    assert(initialPrice.gt(0.000004) && initialPrice.lt(0.0004))

    const etherValueOfAvailablePinakion = availablePNK.times(initialPrice)
    const isEtherTheLimitingResource = !!etherValueOfAvailablePinakion.gt(
      availableETH
    )

    if (isEtherTheLimitingResource) {
      assert(availableETH.gt(0) && availableETH.div(initialPrice).gt(0))
      return {
        eth: availableETH,
        pnk: availableETH.div(initialPrice)
      }
    } else {
      assert(availableETH.times(initialPrice).gt(0) && availablePNK.gt(0))
      return {
        eth: availablePNK.times(initialPrice),
        pnk: availablePNK
      }
    }
  },

  getSimpleStaircaseOrders: function(
    steps,
    sizeInEther,
    spread,
    interval,
    priceCenter
  ) {
    try {
      assert(sizeInEther.gt(0) && sizeInEther.lt(100))
      assert(spread.gt(0.001) && spread.lt(1))
      assert(interval.gt(0) && interval.lt(spread))
    } catch (err) {
      console.error(err)
      process.exit(this.ExitCodes.UTIL_ASSERTION_FAILED)
    }

    const orders = []
    for (let i = 0; i < steps; i++) {
      const sellOrderPrice = priceCenter.times(
        new BigNumber(1).plus(spread.div(2)).plus(interval.times(i))
      )
      assert(sellOrderPrice.gt(priceCenter))

      const sellOrder = {
        pnk: sizeInEther.div(sellOrderPrice).times(-1),
        eth: sizeInEther
      }

      const buyOrderPrice = priceCenter.times(
        new BigNumber(1).minus(spread.div(2)).minus(interval.times(i))
      )

      const buyOrder = {
        pnk: sizeInEther.div(buyOrderPrice),
        eth: sizeInEther.times(-1)
      }

      assert(buyOrderPrice.lt(priceCenter))

      orders.push(sellOrder)
      orders.push(buyOrder)
    }
    return orders
  },

  getBoundingCurveStaircaseOrders: function(steps, sizeInEther, reserve) {
    try {
      assert(reserve.eth.gt(sizeInEther.times(steps)))
      assert(sizeInEther.gt(0) && sizeInEther.lt(100))
      assert(reserve.eth.gt(0) && reserve.pnk.gt(0))
    } catch (err) {
      console.error(err)
      process.exit(this.ExitCodes.UTIL_ASSERTION_FAILED)
    }

    const orders = []
    for (let i = 0; i < steps; i++) {
      const sellOrderPrice = reserve.eth
        .plus(sizeInEther.times(i + 1))
        .pow(2)
        .div(reserve.pnk.times(reserve.eth))

      assert(sellOrderPrice.gt(reserve.eth.div(reserve.pnk)))

      let sizeInPinakion = sizeInEther.div(sellOrderPrice)
      const sellOrder = {
        eth: sizeInEther,
        pnk: sizeInPinakion.times(-1)
      }

      const buyOrderPrice = reserve.eth
        .minus(sizeInEther.times(i + 1))
        .pow(2)
        .div(reserve.pnk.times(reserve.eth))

      assert(
        buyOrderPrice.lt(reserve.eth.div(reserve.pnk)),
        `Buy order price: ${buyOrderPrice}; equilibrium: ${reserve.eth.div(
          reserve.pnk
        )}`
      )

      sizeInPinakion = sizeInEther.div(buyOrderPrice)

      const buyOrder = {
        pnk: sizeInPinakion,
        eth: sizeInEther.times(-1)
      }

      // Would be cleaner to return orders as object of buys and sells instead of having them mixed like this.
      orders.push(sellOrder)
      orders.push(buyOrder)
    }
    return orders
  }
}
