/* global describe, it */
const assert = require('chai').assert
const BigNumber = require('bignumber.js')

const utils = require('../src/utils')

BigNumber.config({ EXPONENTIAL_AT: [-30, 40] })

const simpleStaircaseTestCases = [
  {
    args: {
      steps: 3,
      sizeInEther: new BigNumber(0.15),
      spread: new BigNumber(0.005),
      interval: new BigNumber(0.00025),
      priceCenter: new BigNumber('0.00004')
    },
    expected: [
      {
        eth: new BigNumber(0.15),
        pnk: new BigNumber('-3740.64837905236907730673')
      },
      {
        eth: new BigNumber(-0.15),
        pnk: new BigNumber('3759.3984962406015037594')
      },
      {
        eth: new BigNumber(0.15),
        pnk: new BigNumber('-3739.71578160059835452506')
      },
      {
        eth: new BigNumber(-0.15),
        pnk: new BigNumber('3760.34093757834043619955')
      },
      {
        eth: new BigNumber(0.15),
        pnk: new BigNumber('-3738.78364905284147557328')
      },
      {
        eth: new BigNumber(-0.15),
        pnk: new BigNumber('3761.28385155466399197593')
      }
    ]
  }
]

const boundingCurveTestCases = [
  {
    args: {
      steps: 3,
      sizeInEther: new BigNumber(0.15),
      reserve: { eth: new BigNumber('120'), pnk: new BigNumber(3000000) }
    },
    expected: [
      {
        eth: new BigNumber(0.15),
        pnk: new BigNumber('-3740.64254887383280262967')
      },
      {
        eth: new BigNumber(-0.15),
        pnk: new BigNumber('3759.39260746772013201734')
      },
      {
        eth: new BigNumber(0.15),
        pnk: new BigNumber('-3731.32007885523099980722')
      },
      {
        eth: new BigNumber(-0.15),
        pnk: new BigNumber('3768.82054760962556767859')
      },
      {
        eth: new BigNumber(0.15),
        pnk: new BigNumber('-3722.03241580064794380972')
      },
      {
        eth: new BigNumber(-0.15),
        pnk: new BigNumber('3778.28399786526954120612')
      }
    ]
  }
]

const maximumReserveTestCases = [
  {
    args: {
      availableEther: new BigNumber(12),
      availablePinakion: new BigNumber(400000),
      lastPrice: new BigNumber(0.00004)
    },
    expected: { eth: new BigNumber(12), pnk: new BigNumber(300000) }
  },
  {
    args: {
      availableEther: new BigNumber(12),
      availablePinakion: new BigNumber(300000),
      lastPrice: new BigNumber(0.00004)
    },
    expected: { eth: new BigNumber(12), pnk: new BigNumber(300000) }
  },
  {
    args: {
      availableEther: new BigNumber(12),
      availablePinakion: new BigNumber(200000),
      lastPrice: new BigNumber(0.00004)
    },
    expected: { eth: new BigNumber(8), pnk: new BigNumber(200000) }
  }
]

describe('Simple Staircase Order Test', () => {
  for (const testCase of simpleStaircaseTestCases)
    it(`should correctly calculate for ${JSON.stringify(
      testCase.args
    )}`, function() {
      const actual = utils.getSimpleStaircaseOrders(
        testCase.args.steps,
        testCase.args.sizeInEther,
        testCase.args.spread,
        testCase.args.interval,
        testCase.args.priceCenter
      )

      assert.equal(testCase.args.steps * 2, testCase.expected.length)
      for (let i = 0; i < testCase.expected.length; i++) {
        assert(
          actual[i].eth.eq(testCase.expected[i].eth),
          `Actual: ${actual[i].eth.toString()} Expected: ${testCase.expected[
            i
          ].eth.toString()}`
        )
        assert(
          actual[i].pnk.eq(testCase.expected[i].pnk),
          `Actual: ${actual[i].pnk.toString()} Expected: ${testCase.expected[
            i
          ].pnk.toString()}`
        )
      }
    })
})

describe('Bounding Curve Staircase Order Test', () => {
  for (const testCase of boundingCurveTestCases)
    it(`should correctly calculate for ${JSON.stringify(
      testCase.args
    )}`, function() {
      const actual = utils.getBoundingCurveStaircaseOrders(
        testCase.args.steps,
        testCase.args.sizeInEther,
        testCase.args.reserve
      )
      assert.equal(testCase.args.steps * 2, testCase.expected.length)
      for (let i = 0; i < testCase.expected.length; i++) {
        assert(
          actual[i].eth.eq(testCase.expected[i].eth),
          `Actual: ${actual[i].eth.toString()} Expected: ${testCase.expected[
            i
          ].eth.toString()}`
        )
        assert(
          actual[i].pnk.eq(testCase.expected[i].pnk),
          `Actual: ${actual[i].pnk.toString()} Expected: ${testCase.expected[
            i
          ].pnk.toString()}`
        )
      }
    })
})

describe('Maximum Reserve Calculation Test', () => {
  for (const testCase of maximumReserveTestCases)
    it(`should correctly calculate for ${JSON.stringify(
      testCase.args
    )}`, function() {
      const actual = utils.calculateMaximumReserve(
        testCase.args.availableEther,
        testCase.args.availablePinakion,
        testCase.args.lastPrice
      )

      assert.deepEqual(actual, testCase.expected)
    })
})
