const assert = require('chai').assert
const getStaircaseOrders = require('../src/idex-market-maker.js')
  .getStaircaseOrders

const BigNumber = require('bignumber.js')

BigNumber.config({ EXPONENTIAL_AT: [-30, 40] })

const testCases = [
  {
    args: {
      steps: 2,
      size: new BigNumber(10000),
      lastTrade: new BigNumber(0.00004),
      spread: new BigNumber(0.01)
    },
    expected: [
      {
        tokenBuy: '0x0000000000000000000000000000000000000000',
        amountBuy: '404000000000000000',
        tokenSell: '0x93ED3FBe21207Ec2E8f2d3c3de6e058Cb73Bc04d',
        amountSell: '10000000000000000000000'
      },
      {
        tokenBuy: '0x93ED3FBe21207Ec2E8f2d3c3de6e058Cb73Bc04d',
        amountBuy: '10000000000000000000000',
        tokenSell: '0x0000000000000000000000000000000000000000',
        amountSell: '396000000000000000'
      },
      {
        tokenBuy: '0x0000000000000000000000000000000000000000',
        amountBuy: '408000000000000000',
        tokenSell: '0x93ED3FBe21207Ec2E8f2d3c3de6e058Cb73Bc04d',
        amountSell: '10000000000000000000000'
      },
      {
        tokenBuy: '0x93ED3FBe21207Ec2E8f2d3c3de6e058Cb73Bc04d',
        amountBuy: '10000000000000000000000',
        tokenSell: '0x0000000000000000000000000000000000000000',
        amountSell: '392000000000000000'
      }
    ]
  },
  {
    args: {
      steps: 2,
      size: new BigNumber(10000),
      lastTrade: new BigNumber(0.00004),
      spread: new BigNumber(0.001)
    },
    expected: [
      {
        tokenBuy: '0x0000000000000000000000000000000000000000',
        amountBuy: '400400000000000000',
        tokenSell: '0x93ED3FBe21207Ec2E8f2d3c3de6e058Cb73Bc04d',
        amountSell: '10000000000000000000000'
      },
      {
        tokenBuy: '0x93ED3FBe21207Ec2E8f2d3c3de6e058Cb73Bc04d',
        amountBuy: '10000000000000000000000',
        tokenSell: '0x0000000000000000000000000000000000000000',
        amountSell: '399600000000000000'
      },
      {
        tokenBuy: '0x0000000000000000000000000000000000000000',
        amountBuy: '400800000000000000',
        tokenSell: '0x93ED3FBe21207Ec2E8f2d3c3de6e058Cb73Bc04d',
        amountSell: '10000000000000000000000'
      },
      {
        tokenBuy: '0x93ED3FBe21207Ec2E8f2d3c3de6e058Cb73Bc04d',
        amountBuy: '10000000000000000000000',
        tokenSell: '0x0000000000000000000000000000000000000000',
        amountSell: '399200000000000000'
      }
    ]
  },
  {
    args: {
      steps: 2,
      size: new BigNumber(100000),
      lastTrade: new BigNumber(0.00004),
      spread: new BigNumber(0.001)
    },
    expected: [
      {
        tokenBuy: '0x0000000000000000000000000000000000000000',
        amountBuy: '4004000000000000000',
        tokenSell: '0x93ED3FBe21207Ec2E8f2d3c3de6e058Cb73Bc04d',
        amountSell: '100000000000000000000000'
      },
      {
        tokenBuy: '0x93ED3FBe21207Ec2E8f2d3c3de6e058Cb73Bc04d',
        amountBuy: '100000000000000000000000',
        tokenSell: '0x0000000000000000000000000000000000000000',
        amountSell: '3996000000000000000'
      },
      {
        tokenBuy: '0x0000000000000000000000000000000000000000',
        amountBuy: '4008000000000000000',
        tokenSell: '0x93ED3FBe21207Ec2E8f2d3c3de6e058Cb73Bc04d',
        amountSell: '100000000000000000000000'
      },
      {
        tokenBuy: '0x93ED3FBe21207Ec2E8f2d3c3de6e058Cb73Bc04d',
        amountBuy: '100000000000000000000000',
        tokenSell: '0x0000000000000000000000000000000000000000',
        amountSell: '3992000000000000000'
      }
    ]
  }
]

for (const testCase of testCases)
  describe('IDEX Staircase Order Test', () => {
    it(`should correctly calculate for ${JSON.stringify(
      testCase.args
    )}`, function() {
      assert.deepEqual(
        getStaircaseOrders(
          testCase.args.steps,
          testCase.args.size,
          testCase.args.lastTrade,
          testCase.args.spread
        ),
        testCase.expected
      )
    })
  })
