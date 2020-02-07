const assert = require('assert')
const BigNumber = require('bignumber.js')

BigNumber.config({ EXPONENTIAL_AT: [-30, 40] })

module.exports = {
  ExitCodes: Object.freeze({
    DONT_RESTART: 0,
    WEBSOCKET_CONNECTION_DOWN: 123,
    API_REQUEST_FAILED: 135,
    INCORRECT_NUMBER_OF_ORDERS: 567,
    NON_MAKER_TRADE_OCCURRED: 721,
    UTIL_ASSERTION_FAILED: 999
  }),

  logReserve: function(reserve) {
    console.log(
      `${new Date().toISOString()} # RESERVE <> ETH*PNK: ${reserve.eth.times(
        reserve.pnk
      )} ETH: ${reserve.eth} | PNK: ${reserve.pnk} | ETH/PNK: ${reserve.eth.div(
        reserve.pnk
      )}`
    )
  },

  logBalance: function(availableETH, availablePNK, pnkPrice) {
    if (pnkPrice)
      console.log(
        `${new Date().toISOString()} # ETH: ${availableETH} | PNK: ${availablePNK} | ETH Equivalent: ${new BigNumber(
          availableETH
        ).plus(new BigNumber(availablePNK).times(new BigNumber(pnkPrice)))}`
      )
    else
      console.log(
        `${new Date().toISOString()} # ETH: ${availableETH} | PNK: ${availablePNK}`
      )
  },
  calculateMaximumReserve: function(availableETH, availablePNK, initialPrice) {
    try {
      assert(availableETH.gt(0) && availablePNK.gt(0))
      assert(initialPrice.gt(0.00001) && initialPrice.lt(0.0001))
    } catch (err) {
      console.error(err)
      process.exit(this.ExitCodes.UTIL_ASSERTION_FAILED)
    }

    const etherValueOfAvailablePinakion = availablePNK.times(initialPrice)
    const isEtherTheLimitingResource = !!etherValueOfAvailablePinakion.gt(
      availableETH
    )

    if (isEtherTheLimitingResource) {
      try {
        assert(availableETH.gt(0) && availableETH.div(initialPrice).gt(0))
      } catch (err) {
        console.error(err)
        process.exit(this.ExitCodes.UTIL_ASSERTION_FAILED)
      }
      return {
        eth: availableETH,
        pnk: availableETH.div(initialPrice)
      }
    } else {
      try {
        assert(availableETH.times(initialPrice).gt(0) && availablePNK.gt(0))
      } catch (err) {
        console.error(err)
        process.exit(this.ExitCodes.UTIL_ASSERTION_FAILED)
      }
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
      try {
        assert(sellOrderPrice.gt(priceCenter))
      } catch (err) {
        console.error(err)
        process.exit(this.ExitCodes.UTIL_ASSERTION_FAILED)
      }

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

      try {
        assert(buyOrderPrice.lt(priceCenter))
      } catch (err) {
        console.error(err)
        process.exit(this.ExitCodes.UTIL_ASSERTION_FAILED)
      }

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

      try {
        assert(sellOrderPrice.gt(reserve.eth.div(reserve.pnk)))
      } catch (err) {
        console.error(err)
        process.exit(this.ExitCodes.UTIL_ASSERTION_FAILED)
      }

      let sizeInPinakion = sizeInEther.div(sellOrderPrice)
      const sellOrder = {
        eth: sizeInEther,
        pnk: sizeInPinakion.times(-1)
      }

      const buyOrderPrice = reserve.eth
        .minus(sizeInEther.times(i + 1))
        .pow(2)
        .div(reserve.pnk.times(reserve.eth))

      try {
        assert(
          buyOrderPrice.lt(reserve.eth.div(reserve.pnk)),
          `Buy order price: ${buyOrderPrice}; equilibrium: ${reserve.eth.div(
            reserve.pnk
          )}`
        )
      } catch (err) {
        console.error(err)
        process.exit(this.ExitCodes.UTIL_ASSERTION_FAILED)
      }

      sizeInPinakion = sizeInEther.div(buyOrderPrice)

      const buyOrder = {
        pnk: sizeInPinakion,
        eth: sizeInEther.times(-1)
      }

      orders.push(sellOrder)
      orders.push(buyOrder)
    }
    return orders
  }
}
