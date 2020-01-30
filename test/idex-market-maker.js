/* global describe, it */
const assert = require('chai').assert
const BigNumber = require('bignumber.js')

const getStaircaseOrders = require('../src/idex-market-maker.js')
  .getStaircaseOrders

BigNumber.config({ EXPONENTIAL_AT: [-30, 40] })

const testCases = [
  {
    args: {
      steps: 2,
      size: new BigNumber(10000),
      highestBid: new BigNumber(0.00004),
      lowestAsk: new BigNumber(0.00005),
      spread: new BigNumber(0.01)
    },
    expected: [
      {
        tokenBuy: '0x0000000000000000000000000000000000000000',
        amountBuy: '452261306532663300',
        tokenSell: '0x93ED3FBe21207Ec2E8f2d3c3de6e058Cb73Bc04d',
        amountSell: '10000000000000000000000'
      },
      {
        tokenBuy: '0x93ED3FBe21207Ec2E8f2d3c3de6e058Cb73Bc04d',
        amountBuy: '10000000000000000000000',
        tokenSell: '0x0000000000000000000000000000000000000000',
        amountSell: '447738693467336667'
      },
      {
        tokenBuy: '0x0000000000000000000000000000000000000000',
        amountBuy: '452487437185929632',
        tokenSell: '0x93ED3FBe21207Ec2E8f2d3c3de6e058Cb73Bc04d',
        amountSell: '10000000000000000000000'
      },
      {
        tokenBuy: '0x93ED3FBe21207Ec2E8f2d3c3de6e058Cb73Bc04d',
        amountBuy: '10000000000000000000000',
        tokenSell: '0x0000000000000000000000000000000000000000',
        amountSell: '447514824120602998'
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
          testCase.args.highestBid,
          testCase.args.lowestAsk,
          testCase.args.spread
        ),
        testCase.expected
      )
    })
  })
