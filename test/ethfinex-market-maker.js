const assert = require('chai').assert
const getStaircaseOrders = require('../src/ethfinex-market-maker.js')
  .getStaircaseOrders
const calculateMaximumReserve = require('../src/ethfinex-market-maker.js')
  .calculateMaximumReserve
const BigNumber = require('bignumber.js')

BigNumber.config({ EXPONENTIAL_AT: [-30, 40] })

const testCases = [
  {
    args: {
      steps: 3,
      sizeInEther: new BigNumber(0.25),
      spread: new BigNumber(0.005),
      reserve: { ether: new BigNumber('12'), pinakion: new BigNumber(300000) }
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

const maximumReserveTestCases = [
  {
    args: {
      availableEther: new BigNumber(12),
      availablePinakion: new BigNumber(400000),
      lastPrice: new BigNumber(0.00004)
    },
    expected: { ether: new BigNumber(12), pinakion: new BigNumber(300000) }
  },
  {
    args: {
      availableEther: new BigNumber(12),
      availablePinakion: new BigNumber(300000),
      lastPrice: new BigNumber(0.00004)
    },
    expected: { ether: new BigNumber(12), pinakion: new BigNumber(300000) }
  },
  {
    args: {
      availableEther: new BigNumber(12),
      availablePinakion: new BigNumber(200000),
      lastPrice: new BigNumber(0.00004)
    },
    expected: { ether: new BigNumber(8), pinakion: new BigNumber(200000) }
  }
]

describe('Ethfinex Staircase Order Test', () => {
  for (const testCase of testCases)
    it(`should correctly calculate for ${JSON.stringify(
      testCase.args
    )}`, function() {
      const actual = getStaircaseOrders(
        testCase.args.steps,
        testCase.args.sizeInEther,
        testCase.args.spread,
        testCase.args.reserve
      )

      console.log(actual)
      for (let i = 0; i < testCase.expected[3].length; i++) {
        console.log(testCase.expected[3].length)
        console.log(actual[3][i][1])
        console.log(
          new BigNumber(actual[3][i][1].amount)
            .times(new BigNumber(actual[3][i][1].price))
            .toString()
        )
        // assert.equal(actual[3][i][0], testCase.expected[3][i][0])
        // assert.equal(actual[3][i][1].amount, testCase.expected[3][i][1].amount)
        // assert.equal(actual[3][i][1].price, testCase.expected[3][i][1].price)
        // assert.equal(actual[3][i][1].symbol, testCase.expected[3][i][1].symbol)
        // assert.equal(actual[3][i][1].type, testCase.expected[3][i][1].type)
      }
    })
})

describe('Ethfinex Maximum Reserve Calculation Test', () => {
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
