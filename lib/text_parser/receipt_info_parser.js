function receiptInfoParser (text) {
  text = text || ''

  var lines = text
    .split(/\r?\n/)
    .map(function (line) { return sanitizeLine(line) })
    .filter(function (line) { return line.length > 0 })

  var match = {
    merchant: extractMerchant(lines),
    phone: extractPhone(text),
    time: extractTime(text),
    cardLast4: extractCardLast4(lines, text),
    approvalCode: extractFromLabels(text, [
      /approval(?:\s+code)?\s*#?/i,
      /auth(?:orization)?(?:\s+code)?\s*#?/i
    ]),
    referenceCode: extractFromLabels(text, [
      /(?:\bref\b|reference)(?:\s+(?:no|number|num))?\s*#?/i
    ]),
    terminalId: extractFromLabels(text, [
      /terminal(?:\s+id)?\s*#?/i,
      /register\s*#?/i,
      /lane\s*#?/i,
      /till\s*#?/i
    ]),
    storeId: extractFromLabels(text, [
      /store(?:\s+(?:id|no|number|num))?\s*#?/i,
      /branch(?:\s+(?:id|no|number|num))?\s*#?/i,
      /location(?:\s+(?:id|no|number|num))?\s*#?/i
    ]),
    transactionId: extractFromLabels(text, [
      /trans(?:action)?(?:\s+id)?\s*#?/i,
      /invoice(?:\s+id|\s+no|\s+number)?\s*#?/i,
      /order(?:\s+id|\s+no|\s+number)?\s*#?/i
    ])
  }

  match = compactObject(match)
  var fieldConfidence = getFieldConfidence(match, text)

  return {
    matches: match,
    match: Object.keys(match).length ? match : false,
    confidence: Object.keys(fieldConfidence).length ? fieldConfidence : 0
  }
}

function getFieldConfidence (match, text) {
  var confidence = {}

  if (match.merchant) confidence.merchant = merchantConfidence(match.merchant)
  if (match.phone) confidence.phone = phoneConfidence(match.phone)
  if (match.time) confidence.time = timeConfidence(match.time)
  if (match.cardLast4) confidence.cardLast4 = 0.72
  if (match.approvalCode) confidence.approvalCode = labeledTokenConfidence(match.approvalCode, text, /approval|auth/i)
  if (match.referenceCode) confidence.referenceCode = labeledTokenConfidence(match.referenceCode, text, /ref|reference/i)
  if (match.terminalId) confidence.terminalId = labeledTokenConfidence(match.terminalId, text, /terminal|register|lane|till/i)
  if (match.storeId) confidence.storeId = labeledTokenConfidence(match.storeId, text, /store|branch|location/i)
  if (match.transactionId) confidence.transactionId = labeledTokenConfidence(match.transactionId, text, /trans|transaction|invoice|order/i)

  Object.keys(confidence).forEach(function (key) {
    confidence[key] = normalizeConfidence(confidence[key])
  })

  return confidence
}

function merchantConfidence (merchant) {
  var score = 0.58
  var words = merchant.split(/\s+/).filter(Boolean)

  if (words.length >= 1 && words.length <= 5) score += 0.14
  if (merchant.length >= 4 && merchant.length <= 40) score += 0.08
  if (!/\d/.test(merchant)) score += 0.08
  if (/manager|cashier|operator|clerk/i.test(merchant)) score -= 0.2

  return score
}

function phoneConfidence (phone) {
  var digits = phone.replace(/\D/g, '')
  var score = 0.55

  if (digits.length === 10 || digits.length === 11) score += 0.25
  if (/[\s.\-()]/.test(phone)) score += 0.1

  return score
}

function timeConfidence (time) {
  var score = 0.52

  if (/AM|PM/i.test(time)) score += 0.2
  if (/^\d{2}:\d{2}:\d{2}/.test(time)) score += 0.14
  if (/^\d{2}:\d{2}$/.test(time)) score += 0.1

  return score
}

function labeledTokenConfidence (token, text, labelPattern) {
  var score = 0.58

  if (token.length >= 4) score += 0.1
  if (/[-/]/.test(token)) score += 0.04
  if (/[A-Za-z]/.test(token) && /\d/.test(token)) score += 0.08
  if (labelPattern.test(text)) score += 0.12

  return score
}

function sanitizeLine (line) {
  return line
    .replace(/[^\w\s#&'.,:/()\-+]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractMerchant (lines) {
  var searchLines = lines.slice(0, 8)
  var best = null
  var bestScore = -1

  for (var i = 0; i < searchLines.length; i++) {
    var line = searchLines[i]
    if (!/[A-Za-z]/.test(line)) continue
    if (/save money|live better|customer copy|approval|terminal|trans(?:action)?|invoice|order|thank you|total|subtotal|tax/i.test(line)) continue
    if (/\d{3}[-.\s]\d{3}[-.\s]\d{4}/.test(line)) continue
    if (line.length < 3) continue

    var score = merchantScore(line) + Math.max(0, 2 - i * 0.35)
    if (score > bestScore) {
      best = line
      bestScore = score
    }
  }

  return best
}

function merchantScore (line) {
  var alphaChars = (line.match(/[A-Za-z]/g) || []).length
  var totalChars = line.length || 1
  var alphaRatio = alphaChars / totalChars
  var words = line.split(/\s+/).filter(Boolean)
  var score = alphaRatio * 10

  if (words.length >= 1 && words.length <= 5) score += 2
  if (line.length >= 4 && line.length <= 40) score += 2
  if (/&|\.|'/.test(line)) score += 0.5
  if (/manager|cashier|operator|clerk|customer copy|approval|transaction|terminal/i.test(line)) score -= 4

  return score
}

function extractPhone (text) {
  var match = text.match(/(?:\+?1[\s.-]*)?\(?\d{3}\)?[\s.-]+\d{3}[\s.-]+\d{4}/)
  if (!match) return null
  return match[0].replace(/\s+/g, ' ').trim()
}

function extractTime (text) {
  var regexes = [
    /\b([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?\s*(AM|PM)?\b/ig,
    /\b([01]?\d|2[0-3])\.([0-5]\d)(?:\.([0-5]\d))?\s*(AM|PM)\b/ig
  ]
  var best = null
  for (var r = 0; r < regexes.length; r++) {
    var regex = regexes[r]
    var result = regex.exec(text)

    while (result) {
      var start = Math.max(0, result.index - 25)
      var end = Math.min(text.length, result.index + result[0].length + 25)
      var context = text.slice(start, end)
      var score = 0

      if (result[4]) score += 3
      if (result[3]) score += 1
      if (/\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}|\b20\d{2}\b/.test(context)) score += 2
      if (/time|date|pm|am/i.test(context)) score += 1

      if (!best || score > best.score) {
        best = {
          score: score,
          hh: result[1],
          mm: result[2],
          ss: result[3] || null,
          meridiem: result[4] ? result[4].toUpperCase() : null
        }
      }

      result = regex.exec(text)
    }
  }

  if (!best || best.score < 1) return null

  return compactTime(best.hh, best.mm, best.ss, best.meridiem)
}

function compactTime (hh, mm, ss, meridiem) {
  var time = [pad2(hh), pad2(mm)]
  if (ss) time.push(pad2(ss))

  var output = time.join(':')
  if (meridiem) output += ' ' + meridiem

  return output
}

function pad2 (v) {
  v = String(v)
  return v.length === 1 ? ('0' + v) : v
}

function extractCardLast4 (lines, text) {
  var directPatterns = [
    /(?:card|acct|account|visa|mastercard|amex|discover|payment)\D{0,25}(?:[*x#\s-]*)(\d{4})\b/i,
    /(?:ending|ends|last\s*4)\D{0,10}(\d{4})\b/i,
    /\b(?:\*{2,}|x{2,}|#{2,})[\s-]*(\d{4})\b/i
  ]

  for (var p = 0; p < directPatterns.length; p++) {
    var match = text.match(directPatterns[p])
    if (match) return match[1]
  }

  for (var i = 0; i < lines.length; i++) {
    if (/\b(card|visa|mastercard|amex|discover|acct|account|payment)\b/i.test(lines[i])) {
      var last4Match = lines[i].match(/(?:\D|^)(\d{4})(?:\D|$)/g)
      if (!last4Match) continue

      var finalChunk = last4Match[last4Match.length - 1].replace(/\D/g, '')
      if (finalChunk.length === 4) {
        return finalChunk
      }
    }
  }

  return null
}

function extractFromLabels (text, labelRegExps) {
  for (var i = 0; i < labelRegExps.length; i++) {
    var extracted = extractAfterLabel(text, labelRegExps[i])
    if (extracted) return extracted
  }

  return null
}

function extractAfterLabel (text, labelRegExp) {
  var lines = text.split(/\r?\n/)
  for (var i = 0; i < lines.length; i++) {
    var labelMatch = lines[i].match(labelRegExp)
    if (!labelMatch) continue

    var fromLabel = lines[i].slice(labelMatch.index + labelMatch[0].length)

    var cleaned = fromLabel
      .replace(/^\s*[:#\-]\s*/, '')
      .split(/\b(?:auth|approval|ref|reference|terminal|register|lane|till|store|branch|location|trans|transaction|invoice|order|card|date|time)\b/i)[0]
      .replace(/\s+/g, ' ')
      .trim()

    if (cleaned.length) {
      var tokenMatch = cleaned.match(/[A-Z0-9][A-Z0-9\-/]{1,}/i)
      return tokenMatch ? tokenMatch[0] : cleaned
    }
  }

  return null
}

function compactObject (obj) {
  var output = {}

  Object.keys(obj).forEach(function (key) {
    if (obj[key] !== null && obj[key] !== undefined && obj[key] !== '') {
      output[key] = obj[key]
    }
  })

  return output
}

function normalizeConfidence (value) {
  if (value < 0) return 0
  if (value > 1) return 1
  return Math.round(value * 100) / 100
}

module.exports = exports = { parser: receiptInfoParser }