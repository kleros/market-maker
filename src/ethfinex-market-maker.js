const assert = require("assert");
const crypto = require("crypto");
const program = require("commander");
const WS = require("ws");
const BigNumber = require("bignumber.js");
const ethfinexRestWrapper = require("./ethfinex-rest-api-wrapper");
const { chunk } = require("lodash");
const calculateMaximumReserve = require("./utils").calculateMaximumReserve;
const utils = require("./utils");
const Mutex = require("async-mutex").Mutex;
const fs = require("fs");

const ETHFINEX_WEBSOCKET_API = "wss://api.bitfinex.com/ws/2/";

BigNumber.config({ EXPONENTIAL_AT: [-30, 40] });

const SYMBOL = "tPNKETH";
const ORDER_INTERVAL = new BigNumber(0.0005);
const MIN_ETH_SIZE = new BigNumber(0.1);
const WEBSOCKET_CONNECTION_DOWN = 123;

module.exports = {
  logStats: function(availableETH, availablePNK, reserve) {
    const date = new Date();
    console.log(
      `${date.getYear()}:${date.getMonth()}:${date.getDate()} - ${date.getHours()}:${date.getMinutes()}:${date.getSeconds()} # RESERVE <> ETH*PNK: ${reserve.eth.times(
        reserve.pnk
      )} ETH: ${reserve.eth} | PNK: ${reserve.pnk} | ETH/PNK: ${reserve.eth.div(
        reserve.pnk
      )}`
    );
    console.log(
      `Wallet ETH Balance: ${availableETH} | Wallet PNK Balance: ${availablePNK}`
    );
  },

  getOrders: function(steps, sizeInEther, reserve) {
    const rawOrders = utils.getBoundingCurveStaircaseOrders(
      steps,
      sizeInEther,
      reserve
    );
    const newExchangeLimitOrder = (amount, price) => [
      "on",
      {
        amount,
        cid: Math.floor(Math.random() * 2 ** 45),
        price,
        symbol: SYMBOL,
        type: "EXCHANGE LIMIT"
      }
    ];

    const orders = [];
    const equilibrium = reserve.eth.div(reserve.pnk);
    for (let i = 0; i < rawOrders.length; i++) {
      const orderAmount = rawOrders[i].pnk;
      const orderPrice = rawOrders[i].eth.div(rawOrders[i].pnk).absoluteValue();

      if (orderAmount.isPositive())
        assert(orderPrice.lt(equilibrium), orderPrice.toString());
      else assert(orderPrice.gt(equilibrium), orderPrice.toString());

      orders.push(
        newExchangeLimitOrder(
          rawOrders[i].pnk.toString(),
          rawOrders[i].eth
            .div(rawOrders[i].pnk)
            .absoluteValue()
            .toString()
        )
      );
    }
    const chunks = chunk(orders, 15).map(c => [0, "ox_multi", null, c]);
    return chunks;
  },

  autoMarketMake: async steps => {
    const mutex = new Mutex();
    let flag = 0;

    assert(steps <= 128, "You exceeded Ethfinex maximum order limit.");
    let initialOrdersPlaced = false;

    const w = new WS(ETHFINEX_WEBSOCKET_API);
    const CANCEL_ALL_ORDERS = JSON.stringify([
      0,
      "oc_multi",
      null,
      {
        all: 1
      }
    ]);
    let highestBid;
    let lowestAsk;
    let orders;
    let reserve;
    let availableETH;
    let availablePNK;

    fs.readFile("ethfinex_reserve.txt", "utf-8", (err, data) => {
      if (err) return;
      reserve = JSON.parse(data);
      reserve.pnk = new BigNumber(reserve.pnk);
      reserve.eth = new BigNumber(reserve.eth);
      console.log("Found a reserve file, loading...");
    });

    if (
      typeof process.env.ETHFINEX_KEY === "undefined" ||
      typeof process.env.ETHFINEX_SECRET === "undefined"
    ) {
      console.log(
        "Please export ETHFINEX_KEY and ETHFINEX_SECRET environment variables."
      );
      process.exit(2);
    }
    heartbeat = client => {
      clearTimeout(client.pingTimeout);
      client.pingTimeout = setTimeout(function() {
        process.exit(utils.WEBSOCKET_CONNECTION_DOWN);
      }, 50000);
    };
    w.on("open", () => {
      heartbeat(w);
      w.send(authenticationPayload());
    });

    w.on("error", async event => {
      console.log("onerror");
      console.log(event);
      await new Promise(resolve => setTimeout(resolve, 10000));
      module.exports.autoMarketMake(steps);
    });

    w.on("close", function(e) {
      console.log("onclose");
      console.log(e);
      if (e == 1001) {
        // Code: Going Away
        module.exports.autoMarketMake(steps); // Restart
      } else {
        clearTimeout(this.pingTimeout);
      }
    });

    w.on("message", async msg => {
      const parsed = JSON.parse(msg);

      if (
        parsed[1] != "on" &&
        parsed[1] != "n" &&
        parsed[1] != "oc" &&
        parsed[1] != "hb" &&
        parsed[1] != "bu"
      ) {
        if (reserve) module.exports.logStats(reserve);
        console.log(parsed);
      }
      heartbeat(w);

      if (Array.isArray(parsed) && parsed[1] == "wu") {
        const payload = parsed[2];
        if (payload[1] == "PNK") {
          availablePNK = new BigNumber(payload[2]);
        } else if (payload[1] == "ETH") {
          availableETH = new BigNumber(payload[2]);
        } else console.log("Unhandled wallet update.");
      }

      if (!reserve && availableETH && availablePNK && lowestAsk && highestBid) {
        console.log("Reserve not found, calculating...");
        reserve = utils.calculateMaximumReserve(
          availableETH,
          availablePNK,
          highestBid.plus(lowestAsk).div(2)
        );

        const date = new Date();

        module.exports.logStats(reserve);

        fs.writeFile("ethfinex_reserve.txt", JSON.stringify(reserve), err => {
          if (err) console.log(err);
          console.log("Reserve saved to file.");
        });
      }

      if (reserve && !initialOrdersPlaced) {
        const orders = module.exports.getOrders(
          parseInt(steps),
          MIN_ETH_SIZE,
          reserve
        );

        console.log("Placing orders...");
        for (batch of orders) w.send(JSON.stringify(batch));
        initialOrdersPlaced = true;
      }

      if (parsed.event == "info") {
        const ticker = await ethfinexRestWrapper.getTicker();
        console.log(ticker);
        highestBid = new BigNumber(ticker[0]);
        lowestAsk = new BigNumber(ticker[2]);
      }

      if (parsed.event == "auth") {
      }

      if (
        Array.isArray(parsed) &&
        parsed[1] == "te" &&
        parsed[2][1] == SYMBOL
      ) {
        const release = await mutex.acquire();
        console.log("Cancelling orders...");
        w.send(CANCEL_ALL_ORDERS);

        const tradeExecutionLog = parsed[2];
        const pinakionAmount = new BigNumber(tradeExecutionLog[4]);
        const price = new BigNumber(tradeExecutionLog[5]);

        const oldInvariant = reserve.eth.times(reserve.pnk);

        const etherAmount = pinakionAmount
          .times(price)
          .times(new BigNumber("-1"));

        reserve.eth = reserve.eth.plus(etherAmount);
        reserve.pnk = reserve.pnk.plus(pinakionAmount);

        module.exports.logStats(reserve);

        const TOLERANCE = 0.9999;
        const newInvariant = reserve.eth.times(reserve.pnk);
        assert(
          newInvariant.gte(oldInvariant.times(TOLERANCE)),
          `New Invariant: ${newInvariant}  Old Invariant: ${oldInvariant}\nInvariant should not decrease. Check bounding curve implemention.`
        );

        fs.writeFile("ethfinex_reserve.txt", JSON.stringify(reserve), err => {
          if (err) console.log(err);
          console.log("Reserve saved to file.");
        });

        const orders = module.exports.getOrders(
          parseInt(steps),
          MIN_ETH_SIZE,
          reserve
        );
        console.log("Placing orders...");

        for (batch of orders) w.send(JSON.stringify(batch));
        await new Promise(resolve => setTimeout(resolve, 2000));

        release();
        flag++;
        if (flag > 20) {
          console.log("Kill switch...");
          process.exit(5);
        }
      }
    });
    const authenticationPayload = function() {
      const nonce = Date.now() * 1000;
      const payload = `AUTH${nonce}`;
      const signature = crypto
        .createHmac("SHA384", process.env.ETHFINEX_SECRET)
        .update(payload)
        .digest("hex");

      return JSON.stringify({
        apiKey: process.env.ETHFINEX_KEY,
        authNonce: nonce,
        authPayload: payload,
        authSig: signature,
        dms: 4,
        event: "auth"
      });
    };
  }
};
