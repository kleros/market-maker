const assert = require('chai').assert
const getStaircaseOrders = require('../src/ethfinex-market-maker.js')
  .getStaircaseOrders

const BigNumber = require('bignumber.js')

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
        ]
      ]
    ]
  }
]

for (const testCase of testCases)
  describe('Ethfinex Staircase Order Test', () => {
    it(`should correctly calculate for ${JSON.stringify(
      testCase.args
    )}`, function() {
      const actual = getStaircaseOrders(
        testCase.args.steps,
        testCase.args.size,
        testCase.args.highestBid,
        testCase.args.lowestAsk,
        testCase.args.spread
      )

      for (let i = 0; i < testCase.expected.length; i++) {
        console.log(actual[3][i][1])

        assert.equal(actual[3][i][0], testCase.expected[3][i][0])
        assert.equal(actual[3][i][1].amount, testCase.expected[3][i][1].amount)
        assert.equal(actual[3][i][1].price, testCase.expected[3][i][1].price)
        assert.equal(actual[3][i][1].symbol, testCase.expected[3][i][1].symbol)
        assert.equal(actual[3][i][1].type, testCase.expected[3][i][1].type)
      }
    })
  })
