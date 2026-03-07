/* eslint-env mocha */
var chai = require('chai')
var assert = chai.assert

var receiptInfoParser = require('../../../lib/text_parser/receipt_info_parser')

describe('ReceiptInfoParser', function () {
  describe('#parser()', function () {
    it('extracts metadata from generic labeled receipts', function () {
      var text = [
        'Northwind Grocer',
        'Phone: 617.555.0199',
        'Auth Code: A9F2K1',
        'Reference No 88442211',
        'Register: R12',
        'Store # 0042',
        'Transaction ID: TXN-77A912',
        '03/07/2026 7:05 PM',
        'Card **** 9012'
      ].join('\n')

      var result = receiptInfoParser.parser(text)

      assert.equal(result.match.merchant, 'Northwind Grocer')
      assert.equal(result.match.phone, '617.555.0199')
      assert.equal(result.match.time, '07:05 PM')
      assert.equal(result.match.cardLast4, '9012')
      assert.equal(result.match.approvalCode, 'A9F2K1')
      assert.equal(result.match.referenceCode, '88442211')
      assert.equal(result.match.terminalId, 'R12')
      assert.equal(result.match.storeId, '0042')
      assert.equal(result.match.transactionId, 'TXN-77A912')
      assert.isObject(result.confidence)
      assert.isAtLeast(result.confidence.merchant, 0)
      assert.isAtMost(result.confidence.merchant, 1)
      assert.isAtLeast(result.confidence.transactionId, 0)
      assert.isAtMost(result.confidence.transactionId, 1)
    })

    it('extracts useful fields with alternate labels', function () {
      var text = [
        'Green Leaf Cafe',
        '+1 (212) 555-1000',
        'Approval Code # 72GH99',
        'Lane # 03',
        'Order Number # AB-12004',
        'Card ending 4451',
        '18:22:05'
      ].join('\n')

      var result = receiptInfoParser.parser(text)

      assert.equal(result.match.merchant, 'Green Leaf Cafe')
      assert.equal(result.match.phone, '+1 (212) 555-1000')
      assert.equal(result.match.time, '18:22:05')
      assert.equal(result.match.cardLast4, '4451')
      assert.equal(result.match.approvalCode, '72GH99')
      assert.equal(result.match.terminalId, '03')
      assert.equal(result.match.transactionId, 'AB-12004')
    })

    it('returns false when no metadata is found', function () {
      var result = receiptInfoParser.parser('')

      assert.equal(result.match, false)
    })
  })
})