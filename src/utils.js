const assert = require("assert");
const BigNumber = require("bignumber.js");
BigNumber.config({ EXPONENTIAL_AT: [-30, 40] });

module.exports = {
  WEBSOCKET_CONNECTION_DOWN: 123,
  logStats: function(availableETH, availablePNK, reserve) {
    const date = new Date();
    console.log(
      `${date.getFullYear()}:${date.getMonth()}:${date.getDate()} - ${date.getHours()}:${date.getMinutes()}:${date.getSeconds()} # RESERVE <> ETH*PNK: ${reserve.eth.times(
        reserve.pnk
      )} ETH: ${reserve.eth} | PNK: ${reserve.pnk} | ETH/PNK: ${reserve.eth.div(
        reserve.pnk
      )}`
    );
    console.log(
      `Wallet ETH Balance: ${availableETH} | Wallet PNK Balance: ${availablePNK}`
    );
  },
  calculateMaximumReserve: function(availableETH, availablePNK, initialPrice) {
    assert(availableETH.gt(0) && availablePNK.gt(0));
    assert(initialPrice.gt(0.000004) && initialPrice.lt(0.0004));

    const etherValueOfAvailablePinakion = availablePNK.times(initialPrice);
    const isEtherTheLimitingResource = etherValueOfAvailablePinakion.gt(
      availableETH
    )
      ? true
      : false;

    if (isEtherTheLimitingResource) {
      assert(availableETH.gt(0) && availableETH.div(initialPrice).gt(0));
      return {
        eth: availableETH,
        pnk: availableETH.div(initialPrice)
      };
    } else {
      assert(availableETH.times(initialPrice).gt(0) && availablePNK.gt(0));
      return {
        eth: availablePNK.times(initialPrice),
        pnk: availablePNK
      };
    }
  },

  getSimpleStaircaseOrders: function(
    steps,
    sizeInEther,
    spread,
    interval,
    priceCenter
  ) {
    assert(sizeInEther.gt(0) && sizeInEther.lt(100));
    assert(spread.gt(0.001) && spread.lt(1));
    assert(interval.gt(0) && interval.lt(spread));

    const orders = [];
    for (let i = 0; i < steps; i++) {
      const sellOrderPrice = priceCenter.times(
        new BigNumber(1).plus(spread.div(2)).plus(interval.times(i))
      );
      assert(sellOrderPrice.gt(priceCenter));

      sellOrder = {
        pnk: sizeInEther.div(sellOrderPrice).times(-1),
        eth: sizeInEther
      };

      const buyOrderPrice = priceCenter.times(
        new BigNumber(1).minus(spread.div(2)).minus(interval.times(i))
      );

      buyOrder = {
        pnk: sizeInEther.div(buyOrderPrice),
        eth: sizeInEther.times(-1)
      };

      assert(buyOrderPrice.lt(priceCenter));

      orders.push(sellOrder);
      orders.push(buyOrder);
    }
    return orders;
  },

  getBoundingCurveStaircaseOrders: function(steps, sizeInEther, reserve) {
    assert(reserve.eth.gt(sizeInEther.times(steps)));
    assert(sizeInEther.gt(0) && sizeInEther.lt(100));
    assert(reserve.eth.gt(0) && reserve.pnk.gt(0));

    const orders = [];
    for (let i = 0; i < steps; i++) {
      const sellOrderPrice = reserve.eth
        .plus(sizeInEther.times(i + 1))
        .pow(2)
        .div(reserve.pnk.times(reserve.eth));

      assert(sellOrderPrice.gt(reserve.eth.div(reserve.pnk)));

      let sizeInPinakion = sizeInEther.div(sellOrderPrice);
      const sellOrder = {
        eth: sizeInEther,
        pnk: sizeInPinakion.times(-1)
      };

      const buyOrderPrice = reserve.eth
        .minus(sizeInEther.times(i + 1))
        .pow(2)
        .div(reserve.pnk.times(reserve.eth));

      assert(
        buyOrderPrice.lt(reserve.eth.div(reserve.pnk)),
        `Buy order price: ${buyOrderPrice}; equilibrium: ${reserve.eth.div(
          reserve.pnk
        )}`
      );

      sizeInPinakion = sizeInEther.div(buyOrderPrice);

      const buyOrder = {
        pnk: sizeInPinakion,
        eth: sizeInEther.times(-1)
      };

      orders.push(sellOrder);
      orders.push(buyOrder);
    }
    return orders;
  }
};
