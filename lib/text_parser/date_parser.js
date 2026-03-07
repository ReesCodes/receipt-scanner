function dateParser (text, config) {
  config = config || {}
  var parser = config.parser || 'earliest'
  var parserName = parser

  if (typeof parser === 'string') {
    parser = require('./date/' + parser)
  } else {
    parserName = parser.name || 'custom'
  }

  text = prepareText(text)

  var result = {
    matches: allDates(text)
  }
  result.match = parser.extract(result.matches) || false
  result.confidence = getDateConfidence(result.matches, result.match, text, parserName)

  // Post processing
  if (result.match) {
    result.actualMatch = result.match
    result.match = result.match.toISOString().slice(0, 10)
  }

  return result
}

function getDateConfidence (matches, chosenDate, text, parserName) {
  if (!chosenDate) return 0

  var confidence = parserName === 'earliest' ? 0.76 : 0.7
  if (matches.length === 1) confidence += 0.14
  if (matches.length > 1) confidence += 0.04

  var chosenMatch = findChosenDateMatch(matches, chosenDate)
  if (chosenMatch && /\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}/.test(chosenMatch.text)) confidence += 0.05
  if (chosenMatch && /[a-z]{3,}/i.test(chosenMatch.text)) confidence += 0.03

  var year = chosenDate.getFullYear()
  var currentYear = new Date().getFullYear()
  if (year >= 1990 && year <= currentYear + 1) confidence += 0.03
  else confidence -= 0.2

  if (/\b(due|expires?|valid|until)\b/i.test(text)) confidence -= 0.04

  return normalizeConfidence(confidence)
}

function findChosenDateMatch (matches, chosenDate) {
  for (var i = 0; i < matches.length; i++) {
    if (matches[i].start.date().getTime() === chosenDate.getTime()) {
      return matches[i]
    }
  }

  return null
}

function normalizeConfidence (value) {
  if (value < 0) return 0
  if (value > 1) return 1
  return Math.round(value * 100) / 100
}

function allDates (text) {
  return chrono().create().parse(text)
}

function monthNameRegexp () {
  return 'Jan(?:uary|\\.)?|Feb(?:ruary|\\.)?|Mar(?:ch|\\.)?|Apr(?:il|\\.)?|May|Jun(?:e|\\.)?|Jul(?:y|\\.)?|Aug(?:ust|\\.)?|Sep(?:tember|\\.)?|Oct(?:ober|\\.)?|Nov(?:ember|\\.)?|Dec(?:ember|\\.)?' +
    '|' +
    'Ene(?:ro|\\.)?|Feb(?:rero|\\.)?|Mar(?:zo|\\.)?|Abr(?:il|\\.)?|May(?:o|\\.)?|Jun(?:io|\\.)?|Jul(?:io|\\.)?|Ago(?:sto|\\.)?|Sep(?:tiembre|\\.)?|Oct(?:ubre|\\.)?|Nov(?:iembre|\\.)?|Dic(?:iembre|\\.)?'
}

function prepareText (text) {
  return text
    // Incorrectly scanned hyphens
    .replace(/[\u2013\u2014\u2012\uFE58/]{1}/ig, '-')
    // Incorrectly scanned dd/mm/yyyy date, e.g. dd\'mm\'yyyy
    // Example: 01\'01\'2016 -> 01/01/2016
    .replace(new RegExp('(^|\\s)' +
      // (d)d?(?)
      '(?:([0-3]{0,1}[0-9]{1})[^a-z0-9]{1,2})' +
      // (m)m?(?)
      '(?:([0-3]{0,1}[0-9]{1})[^a-z0-9]{1,2})' +
      // yyyy
      '([1-9]{1}[0-9]{3})' +
      '(?=$|\\s)', 'ig'), '$1$2/$3/$4')
    // Incorrect format MMM dd yyyy
    // Example: Jan01 2016 -> Jan 01 2016
    .replace(new RegExp('(^|\\s)' +
      // monthname?
      '(?:(' +
        monthNameRegexp() +
      ')[^a-z0-9]{0,2})' +
      // (d)d?(?)
      '(?:(' +
        '[0-3]{0,1}[0-9]{1}' +
      ')[^a-z0-9]{1,2})' +
      // yyyy
      '([1-9]{1}[0-9]{3})' +
      '(?=$|\\s)', 'ig'), '$1$2 $3 $4')
    // Incorrect format dd MMM yyyy
    // Example: 01Jan 2016 -> 01 Jan 2016
    .replace(new RegExp('(^|\\s)' +
      // (d)d?(?)
      '(?:(' +
        '[0-3]{0,1}[0-9]{1}' +
      ')[^a-z0-9]{1,2})' +
      // monthname?
      '(?:(' +
        monthNameRegexp() +
      ')[^a-z0-9]{1,2})' +
      // yyyy
      '([1-9]{1}[0-9]{3})' +
      '(?=$|\\s)', 'ig'), '$1$2 $3 $4')
    // Incorrectly scanned ..Thh;ii;ss
    // Example: T12;45;59 -> T12:45:59
    .replace(new RegExp(
      // Thh
      'T([0-1][0-9]|2[0-4])' +
      // seperator
      '[^a-z0-9]{1}' +
      // ii
      '([0-5][0-9])' +
      // seperator
      '[^a-z0-9]{1}' +
      // ss
      '([0-5][0-9])' +
      '(?=$|\\s)', 'ig'), 'T$1:$2:$3')
}

function chrono () {
  var chronoNode = require('chrono-node')
  
  return {
    'create': function () {
      // Merge English and Spanish parsers for broader date format support
      var custom = chronoNode.casual.clone()
      
      // Add Spanish parser configurations
      custom.parsers = custom.parsers.concat(chronoNode.es.casual.parsers)
      
      // Add custom refiner to filter results
      custom.refiners.push({
        refine: function (context, results) {
          var filteredResults = []
          results.forEach(function (result) {
            // Filter out relative dates (like "in 60 days") 
            // by checking if the matched text contains relative indicators
            var text = result.text.toLowerCase()
            var isRelativeDate = /\b(in|within|after|last|next|ago)\b/.test(text) && 
                                 /\b(day|days|week|weeks|month|months|year|years)\b/.test(text)
            
            if (result.start.isCertain('month') &&
                  result.start.isCertain('day') &&
                  result.start.isCertain('year') &&
                  // Weird bug in chrono 2016-06-18
                  result.start.get('day') !== 0 &&
                  // Exclude relative dates
                  !isRelativeDate) {
              filteredResults.push(result)
            }
          })
          return filteredResults
        }
      })

      return custom
    },
    'class': chronoNode,
    'parser': chronoNode.parser,
    'certainYearRefiner': function (text, results, opt) {
      // This is now handled in the refiner above
      return results
    },
    'strictMode': false,
    'options': function () {
      // In chrono-node v2.x, we use the built-in casual parser
      // which already has all the parsers we need
      return {}
    }
  }
}

module.exports = exports = { parser: dateParser, allDates: allDates, prepareText: prepareText }
