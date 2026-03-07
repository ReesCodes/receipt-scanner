function receiptItemsParser (text) {
  text = text || ''
  var lines = splitLines(text)

  var items = []
  for (var i = 0; i < lines.length; i++) {
    var item = parseItemLine(lines[i])
    if (item) {
      items.push(item)
    }
  }

  var summary = extractSummary(lines)
  var match = {}

  if (items.length) match.items = items
  if (Object.keys(summary).length) match.summary = summary

  var hasMatch = Object.keys(match).length > 0

  return {
    matches: match,
    match: hasMatch ? match : false,
    confidence: hasMatch ? buildConfidence(match) : 0
  }
}

function splitLines (text) {
  return text
    .split(/\r?\n/)
    .map(function (line) {
      return line
        .replace(/[^\w\s.,:/()\-+#xX%]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    })
    .filter(function (line) { return line.length > 0 })
}

function parseItemLine (line) {
  if (!line || line.length < 5) return null
  if (isSummaryOrMetadataLine(line)) return null

  var lastAmount = findLastAmount(line)
  if (!lastAmount) return null

  var descriptionPart = line.slice(0, lastAmount.index).trim()
  if (!descriptionPart) return null

  var description = normalizeDescription(descriptionPart)
  if (!description || description.split(/\s+/).length < 1) return null
  var sku = extractSku(descriptionPart)

  var quantity = extractQuantity(line)
  var lineTotal = toMoneyString(lastAmount.value)
  var unitPrice = extractUnitPrice(line, lastAmount.index, quantity, lineTotal)

  var item = {
    description: description,
    lineTotal: lineTotal
  }

  if (sku) item.sku = sku
  if (quantity) item.quantity = quantity
  if (unitPrice) item.unitPrice = unitPrice

  return item
}

function isSummaryOrMetadataLine (line) {
  return /\b(subtotal|sub total|tax|total|change due|items sold|approval|trans(?:action)?|terminal|customer copy|payment|manager|visa|debit|credit|store|ref|receipt|date|time)\b/i.test(line)
}

function normalizeDescription (value) {
  return value
    // Remove long SKU-like numeric tokens from the description section.
    .replace(/\b\d{5,}\b/g, ' ')
    .replace(/\b\d{4,}[A-Za-z]{1,}\b/g, ' ')
    // Remove trailing monetary token that usually represents unit price.
    .replace(/\s+(\d+[.,]\d{2})\s*$/g, ' ')
    .replace(/\b[A-Z]{1,2}\b$/g, '')
    .replace(/\b[fxno]{1}\b$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractSku (value) {
  var tokens = String(value || '').split(/\s+/)
  var best = null
  var bestDigitCount = 0

  for (var i = 0; i < tokens.length; i++) {
    var token = tokens[i].replace(/[^A-Za-z0-9\-]/g, '')
    if (!token) continue
    if (/^\d+[.,]\d{2}$/.test(token)) continue

    var digitCount = (token.match(/\d/g) || []).length
    if (digitCount < 5) continue

    if (digitCount > bestDigitCount) {
      best = token
      bestDigitCount = digitCount
    }
  }

  return best
}

function findLastAmount (line) {
  var regexp = /(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})|\d+[.,]\d{2})/g
  var match
  var last = null

  while ((match = regexp.exec(line)) !== null) {
    last = {
      index: match.index,
      raw: match[1],
      value: parseMoney(match[1])
    }
  }

  if (!last || isNaN(last.value)) return null

  return last
}

function parseMoney (value) {
  var raw = String(value)
  var hasDot = raw.indexOf('.') !== -1
  var hasComma = raw.indexOf(',') !== -1

  if (hasDot && hasComma) {
    if (raw.lastIndexOf('.') > raw.lastIndexOf(',')) {
      raw = raw.replace(/,/g, '')
    } else {
      raw = raw.replace(/\./g, '').replace(/,/g, '.')
    }
  } else if (hasComma) {
    raw = raw.replace(/,/g, '.')
  }

  return parseFloat(raw)
}

function toMoneyString (number) {
  return number.toFixed(2)
}

function extractQuantity (line) {
  var qtyMatch = line.match(/(?:^|\s)(\d+(?:[.,]\d+)?)\s*[xX](?:\s|$)/)
  if (!qtyMatch) return null

  var quantity = parseFloat(String(qtyMatch[1]).replace(',', '.'))
  if (!quantity || quantity <= 0) return null
  // Most receipts represent quantity as whole-number counts.
  if (Math.floor(quantity) !== quantity) return null
  if (quantity > 50) return null

  return quantity
}

function extractUnitPrice (line, lastAmountIndex, quantity, lineTotal) {
  if (!quantity || quantity <= 1) return null

  var candidateRegion = line.slice(0, lastAmountIndex)
  var unitCandidate = findLastAmount(candidateRegion)

  if (unitCandidate && unitCandidate.value > 0) {
    return toMoneyString(unitCandidate.value)
  }

  var total = parseFloat(lineTotal)
  if (!total || quantity <= 0) return null

  return toMoneyString(total / quantity)
}

function extractSummary (lines) {
  var summary = {}

  lines.forEach(function (line) {
    if (/\bsub\s*total\b|\bsubtotal\b/i.test(line)) {
      var subtotal = findLastAmount(line)
      if (subtotal) summary.subtotal = toMoneyString(subtotal.value)
      return
    }

    if (/\btax\b/i.test(line)) {
      var tax = findLastAmount(line)
      if (tax) summary.tax = toMoneyString(tax.value)
      return
    }

    if (/\btotal\b/i.test(line) && !/\bsub\s*total\b|\bsubtotal\b/i.test(line)) {
      var total = findLastAmount(line)
      if (total) summary.total = toMoneyString(total.value)
      return
    }

    if (/\bchange\s+due\b/i.test(line)) {
      var change = findLastAmount(line)
      if (change) summary.changeDue = toMoneyString(change.value)
      return
    }

    if (/\bitems\s+sold\b/i.test(line)) {
      var countMatch = line.match(/(\d{1,3})\s*$/)
      if (countMatch) summary.itemsSold = parseInt(countMatch[1], 10)
    }
  })

  return summary
}

function buildConfidence (match) {
  var itemConfidence = []
  var summaryConfidence = {}

  if (match.items) {
    itemConfidence = match.items.map(function (item) {
      return {
        description: normalizeConfidence(descriptionConfidence(item.description)),
        lineTotal: normalizeConfidence(moneyConfidence(item.lineTotal)),
        sku: item.sku ? normalizeConfidence(skuConfidence(item.sku)) : undefined,
        quantity: typeof item.quantity !== 'undefined' ? normalizeConfidence(quantityConfidence(item.quantity)) : undefined,
        unitPrice: item.unitPrice ? normalizeConfidence(moneyConfidence(item.unitPrice)) : undefined,
        overall: normalizeConfidence(overallItemConfidence(item))
      }
    }).map(removeUndefinedFields)
  }

  if (match.summary) {
    if (match.summary.subtotal) summaryConfidence.subtotal = 0.9
    if (match.summary.tax) summaryConfidence.tax = 0.86
    if (match.summary.total) summaryConfidence.total = 0.92
    if (match.summary.changeDue) summaryConfidence.changeDue = 0.88
    if (typeof match.summary.itemsSold !== 'undefined') summaryConfidence.itemsSold = 0.85
  }

  var confidence = {
    overall: normalizeConfidence(overallConfidence(itemConfidence, summaryConfidence))
  }

  if (itemConfidence.length) confidence.items = itemConfidence
  if (Object.keys(summaryConfidence).length) confidence.summary = summaryConfidence

  return confidence
}

function descriptionConfidence (description) {
  var score = 0.55
  var words = description.split(/\s+/).filter(Boolean)

  if (words.length >= 2) score += 0.2
  if (description.length >= 4 && description.length <= 48) score += 0.15
  if (/\d{5,}/.test(description)) score -= 0.2

  return score
}

function moneyConfidence (value) {
  var score = 0.65
  if (/^\d+\.\d{2}$/.test(String(value))) score += 0.25
  return score
}

function quantityConfidence (quantity) {
  var score = 0.65
  if (quantity > 0 && quantity <= 100) score += 0.2
  return score
}

function skuConfidence (sku) {
  var digits = (String(sku).match(/\d/g) || []).length
  var score = 0.62

  if (digits >= 6) score += 0.2
  if (/^[A-Za-z0-9\-]+$/.test(sku)) score += 0.1

  return score
}

function overallItemConfidence (item) {
  var score = 0.5
  score += descriptionConfidence(item.description) * 0.25
  score += moneyConfidence(item.lineTotal) * 0.35
  if (item.sku) score += skuConfidence(item.sku) * 0.15
  if (typeof item.quantity !== 'undefined') score += quantityConfidence(item.quantity) * 0.2
  if (item.unitPrice) score += moneyConfidence(item.unitPrice) * 0.2
  return score
}

function overallConfidence (itemConfidence, summaryConfidence) {
  var values = []

  itemConfidence.forEach(function (item) {
    values.push(item.overall)
  })

  Object.keys(summaryConfidence).forEach(function (key) {
    values.push(summaryConfidence[key])
  })

  if (!values.length) return 0

  var sum = values.reduce(function (a, b) { return a + b }, 0)
  return sum / values.length
}

function removeUndefinedFields (obj) {
  var output = {}
  Object.keys(obj).forEach(function (key) {
    if (typeof obj[key] !== 'undefined') output[key] = obj[key]
  })
  return output
}

function normalizeConfidence (value) {
  if (value < 0) return 0
  if (value > 1) return 1
  return Math.round(value * 100) / 100
}

module.exports = exports = { parser: receiptItemsParser }