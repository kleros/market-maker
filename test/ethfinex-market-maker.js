/* global describe, it */
const assert = require('chai').assert
const getBoundingCurveStaircaseOrders = require('../src/utils')
  .getBoundingCurveStaircaseOrders
const calculateMaximumReserve = require('../src/utils').calculateMaximumReserve
const BigNumber = require('bignumber.js')

BigNumber.config({ EXPONENTIAL_AT: [-30, 40] })

// eslint-disable-next-line no-unused-vars
const testCasesOld = [
  {
    args: {
      steps: 3,
      sizeInEther: new BigNumber(0.15),
      spread: new BigNumber(0.005),
      interval: new BigNumber(0.00025),
      reserve: { eth: new BigNumber('120'), pnk: new BigNumber(3000000) }
    },
    expected: [
      0,
      'ox_multi',
      null,
      [
        [
          'on',
          {
            amount: '10000',
            cid: null,
            price: '0.0000447738693467336667',
            symbol: 'tPNKETH',
            type: 'EXCHANGE LIMIT'
          }
        ],
        [
          'on',
          {
            amount: '10000',
            cid: null,
            price: '0.00004475148241206029986665',
            symbol: 'tPNKETH',
            type: 'EXCHANGE LIMIT'
          }
        ],
        [
          'on',
          {
            amount: '-10000',
            cid: null,
            price: '0.00004522613065326633',
            symbol: 'tPNKETH',
            type: 'EXCHANGE LIMIT'
          }
        ],
        [
          'on',
          {
            amount: '-10000',
            cid: null,
            price: '0.000045248743718592963165',
            symbol: 'tPNKETH',
            type: 'EXCHANGE LIMIT'
          }
        ],
        [
          'on',
          {
            amount: '-10000',
            cid: null,
            price: '0.00004522613065326633',
            symbol: 'tPNKETH',
            type: 'EXCHANGE LIMIT'
          }
        ],
        [
          'on',
          {
            amount: '-10000',
            cid: null,
            price: '0.000045248743718592963165',
            symbol: 'tPNKETH',
            type: 'EXCHANGE LIMIT'
          }
        ]
      ]
    ]
  }
]

const testCases = [
  {
    args: {
      steps: 3,
      sizeInEther: new BigNumber(0.15),
      spread: new BigNumber(0.005),
      interval: new BigNumber(0.00025),
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

describe('Bounding Curve Staircase Order Test', () => {
  for (const testCase of testCases)
    it(`should correctly calculate for ${JSON.stringify(
      testCase.args
    )}`, function() {
      const actual = getBoundingCurveStaircaseOrders(
        testCase.args.steps,
        testCase.args.sizeInEther,
        testCase.args.reserve
      )

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
      const actual = calculateMaximumReserve(
        testCase.args.availableEther,
        testCase.args.availablePinakion,
        testCase.args.lastPrice
      )

      assert.deepEqual(actual, testCase.expected)
    })
})
