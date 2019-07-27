const BigNumber = require('bignumber.js')
BigNumber.config({ EXPONENTIAL_AT: [-30, 40] })

module.exports = {
  calculateMaximumReserve: function(
    availableEther,
    availablePinakion,
    initialPrice
  ) {
    const etherValueOfAvailablePinakion = availablePinakion.times(initialPrice)
    const isEtherTheLimitingResource = etherValueOfAvailablePinakion.gt(
      availableEther
    )
      ? true
      : false

    if (isEtherTheLimitingResource)
      return {
        ether: availableEther,
        pinakion: availableEther.div(initialPrice)
      }
    else
      return {
        ether: availablePinakion.times(initialPrice),
        pinakion: availablePinakion
      }
  },

  getStaircaseOrders: function(steps, sizeInEther, spread, interval, reserve) {
    const orders = []
    for (let i = 0; i < steps; i++) {
      let orderPrice = reserve.ether
        .div(reserve.pinakion)
        .times(
          new BigNumber(1)
            .plus(spread.div(new BigNumber(2)))
            .plus(interval.times(new BigNumber(steps - 1 - i)))
        )

      let sizeInPinakion = sizeInEther.div(orderPrice)
      const sellOrder = {
        eth: sizeInEther,
        pnk: new BigNumber('-1').times(sizeInPinakion)
      }

      orderPrice = reserve.ether
        .div(reserve.pinakion)
        .times(
          new BigNumber(1)
            .minus(spread.div(new BigNumber(2)))
            .minus(interval.times(new BigNumber(steps - 1 - i)))
        )

      sizeInPinakion = sizeInEther.div(orderPrice)

      const buyOrder = {
        pnk: sizeInPinakion,
        eth: new BigNumber('-1').times(sizeInEther)
      }

      orders.push(sellOrder)
      orders.push(buyOrder)
    }
    return orders
  }
}
