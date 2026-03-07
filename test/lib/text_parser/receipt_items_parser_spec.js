/* eslint-env mocha */
var chai = require('chai')
var assert = chai.assert

var receiptItemsParser = require('../../../lib/text_parser/receipt_items_parser')

describe('ReceiptItemsParser', function () {
  describe('#parser()', function () {
    it('extracts line items and summary from generic receipt text', function () {
      var text = [
        'ACME MARKET',
        'MILK 2% 123456 4.59',
        'BREAD WHOLE GRAIN 2 x 3.25 6.50',
        'BANANAS 1.25',
        'SUBTOTAL 12.34',
        'TAX 0.98',
        'TOTAL 13.32',
        '# ITEMS SOLD 3'
      ].join('\n')

      var result = receiptItemsParser.parser(text)

      assert.isObject(result.match)
      assert.isArray(result.match.items)
      assert.isAtLeast(result.match.items.length, 2)

      assert.equal(result.match.items[0].description, 'MILK 2%')
      assert.equal(result.match.items[0].sku, '123456')
      assert.equal(result.match.items[0].lineTotal, '4.59')

      assert.equal(result.match.items[1].description, 'BREAD WHOLE GRAIN 2 x')
      assert.equal(result.match.items[1].lineTotal, '6.50')
      assert.equal(result.match.items[1].quantity, 2)
      assert.equal(result.match.items[1].unitPrice, '3.25')

      assert.isObject(result.match.summary)
      assert.equal(result.match.summary.subtotal, '12.34')
      assert.equal(result.match.summary.tax, '0.98')
      assert.equal(result.match.summary.total, '13.32')
      assert.equal(result.match.summary.itemsSold, 3)

      assert.isObject(result.confidence)
      assert.isAtLeast(result.confidence.overall, 0)
      assert.isAtMost(result.confidence.overall, 1)
      assert.isArray(result.confidence.items)
      assert.isAtLeast(result.confidence.items[0].sku, 0)
      assert.isAtMost(result.confidence.items[0].sku, 1)
    })

    it('returns false when there are no detectable items', function () {
      var result = receiptItemsParser.parser('Hello world\nThank you')
      assert.equal(result.match, false)
      assert.equal(result.confidence, 0)
    })
  })
})