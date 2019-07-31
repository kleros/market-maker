const assert = require('assert')
const BigNumber = require('bignumber.js')
BigNumber.config({ EXPONENTIAL_AT: [-30, 40] })

module.exports = {
  calculateMaximumReserve: function(availableETH, availablePNK, initialPrice) {
    assert(availableETH.gt(0) && availablePNK.gt(0))
    assert(initialPrice.gt(0.000004) && initialPrice.lt(0.0004))

    const etherValueOfAvailablePinakion = availablePNK.times(initialPrice)
    const isEtherTheLimitingResource = etherValueOfAvailablePinakion.gt(
      availableETH
    )
      ? true
      : false

    if (isEtherTheLimitingResource)
      return {
        eth: availableETH,
        pnk: availableETH.div(initialPrice)
      }
    else
      return {
        eth: availablePNK.times(initialPrice),
        pnk: availablePNK
      }
  },

  getStaircaseOrders: function(steps, sizeInEther, spread, interval, reserve) {
    assert(sizeInEther.gt(0) && sizeInEther.lt(100))
    assert(spread.gt(0.001) && spread.lt(1))
    assert(interval.gt(0) && interval.lt(spread))
    assert(reserve.eth.gt(0) && reserve.pnk.gt(0))

    const orders = []
    for (let i = 0; i < steps; i++) {
      const sellOrderPrice = reserve.eth
        .div(reserve.pnk)
        .times(
          new BigNumber(1)
            .plus(spread.div(2))
            .plus(interval.times(steps - 1 - i))
        )
      assert(sellOrderPrice.gt(reserve.eth.div(reserve.pnk)))

      let sizeInPinakion = sizeInEther.div(sellOrderPrice)
      const sellOrder = {
        eth: sizeInEther,
        pnk: sizeInPinakion.times(-1)
      }

      const buyOrderPrice = reserve.eth
        .div(reserve.pnk)
        .times(
          new BigNumber(1)
            .minus(spread.div(2))
            .minus(interval.times(steps - 1 - i))
        )

      assert(buyOrderPrice.lt(reserve.eth.div(reserve.pnk)))

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
