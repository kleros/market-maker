const assert = require("assert");
const crypto = require("crypto");
const program = require("commander");
const WS = require("ws");
const BigNumber = require("bignumber.js");
const ethfinexRestWrapper = require("./ethfinex-rest-api-wrapper");
const { chunk } = require("lodash");
const utils = require("./utils");
const fs = require("fs");

const ETHFINEX_WEBSOCKET_API = "wss://api.bitfinex.com/ws/2/";

BigNumber.config({ EXPONENTIAL_AT: [-30, 40] });

const SYMBOL = "tPNKETH";
const ORDER_INTERVAL = new BigNumber(0.0005);
const MIN_ETH_SIZE = new BigNumber(0.1);
const WEBSOCKET_CONNECTION_DOWN = 123;
let orderGroupID = 0;

const MsgCodes = Object.freeze({
  ORDER_SNAPSHOT: "os",
  ORDER_NEW: "on",
  ORDER_UPDATE: "ou",
  ORDER_CANCEL: "oc",
  BALANCE_UPDATE: "bu",
  WALLET_SNAPSHOT: "ws",
  WALLET_UPDATE: "wu",
  TRADE_EXECUTED: "te",
  TRADE_EXECUTION_UPDATE: "tu",
  NOTIFICATIONS: "n",
  HEARTBEAT: "hb"
});

const WSCloseCodes = Object.freeze({
  CLOSE_GOING_AWAY: 1001,
  CLOSE_ABNORMAL: 1006
});

module.exports = {
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
        gid: ++orderGroupID,
        cid: Math.floor(Math.random() * 2 ** 45),
        price,
        symbol: SYMBOL,
        type: "EXCHANGE LIMIT",
        tif: "2030-01-01 10:45:23"
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
    let noOfTrades = 0;

    assert(steps <= 128, "You exceeded Ethfinex maximum order limit.");

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

    const available = {};

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
    const heartbeat = client => {
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
    });

    w.on("close", async function(errorCode) {
      console.log("onclose");
      console.log(errorCode);
      if (
        errorCode == WSCloseCodes.CLOSE_GOING_AWAY ||
        errorCode == WSCloseCodes.CLOSE_ABNORMAL
      ) {
        await new Promise(resolve => setTimeout(resolve, 10000));
        await module.exports.autoMarketMake(steps); // Restart
      } else {
        clearTimeout(this.pingTimeout);
      }
    });

    w.on("message", async msg => {
      heartbeat(w);
      const parsed = JSON.parse(msg);

      if (
        parsed[1] == MsgCodes.ORDER_NEW ||
        parsed[1] == MsgCodes.NOTIFICATIONS ||
        parsed[1] == MsgCodes.ORDER_CANCEL ||
        parsed[1] == MsgCodes.HEARTBEAT ||
        parsed[1] == MsgCodes.BALANCE_UPDATE
      ) {
      } else if (parsed[1] == MsgCodes.ORDER_SNAPSHOT) {
        console.log(`Number of open orders: ${parsed[2].length}`);
      } else if (
        parsed[1] == MsgCodes.WALLET_SNAPSHOT ||
        parsed[1] == MsgCodes.WALLET_UPDATE
      ) {
        const payload = parsed[2];
        if (Array.isArray(payload[0]))
          for (const array of payload) {
            available[array[1]] = new BigNumber(array[2]);
          }
        else {
          available[payload[1]] = new BigNumber(payload[2]);
        }
      } else if (parsed.length == 10) {
        console.log(
          `Bid: ${parsed[0]} | Ask: ${parsed[2]} | Last: ${parsed[6]}`
        );
      } else {
        console.log(parsed);
        if (reserve && available.ETH && available.PNK)
          utils.logStats(available.ETH, available.PNK, reserve);
      }

      if (
        !reserve &&
        available.ETH &&
        available.PNK &&
        lowestAsk &&
        highestBid
      ) {
        console.log("Reserve not found, calculating...");
        reserve = utils.calculateMaximumReserve(
          available.ETH,
          available.PNK,
          highestBid.plus(lowestAsk).div(2)
        );

        const date = new Date();

        utils.logStats(available.ETH, available.PNK, reserve);

        fs.writeFile("ethfinex_reserve.txt", JSON.stringify(reserve), err => {
          if (err) console.log(err);
          console.log("Reserve saved to file.");
        });
      }

      if (parsed.event == "info") {
        const ticker = await ethfinexRestWrapper.ticker();
        console.log(ticker);
        highestBid = new BigNumber(ticker[0]);
        lowestAsk = new BigNumber(ticker[2]);
      }

      if (parsed.event == "auth") {
      }

      if (
        Array.isArray(parsed) &&
        parsed[1] == MsgCodes.TRADE_EXECUTED &&
        parsed[2][1] == SYMBOL
      ) {
        noOfTrades++;
        console.log(`Number of trades done: ${noOfTrades}`);
        if (noOfTrades > 5) process.exit(0); // Code zero doesn't get restarted.

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

        utils.logStats(available.ETH, available.PNK, reserve);

        const TOLERANCE = 0.9999;
        const newInvariant = reserve.eth.times(reserve.pnk);

        try {
          assert(
            newInvariant.gte(oldInvariant.times(TOLERANCE)),
            `New Invariant: ${newInvariant}  Old Invariant: ${oldInvariant}\nInvariant should not decrease. Check bounding curve implemention.`
          );
        } catch (err) {
          await console.log(err);
          process.exit(0); // Code zero doesn't get restarted.
        }

        fs.writeFileSync("ethfinex_reserve.txt", JSON.stringify(reserve));

        await new Promise(resolve => setTimeout(resolve, 1000));

        const orders = module.exports.getOrders(
          parseInt(steps),
          MIN_ETH_SIZE,
          reserve
        );
        console.log("Placing orders...");

        w.send(CANCEL_ALL_ORDERS);
        await new Promise(resolve => setTimeout(resolve, 5000));

        //for (batch of orders) w.send(JSON.stringify(batch));
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
