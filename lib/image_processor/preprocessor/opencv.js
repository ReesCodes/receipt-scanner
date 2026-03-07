var fs = require('fs')
var sharp = require('sharp')

var cvModule = null
var cvModuleLoading = false
var cvModuleWaiters = []

function opencv (stream, outfile, callback) {
  readInput(stream, function (readError, inputBuffer) {
    if (readError) return callback(readError)

    getCvModule(function (cvError, cv) {
      if (cvError) return callback(cvError)

      preprocessImage(cv, inputBuffer, outfile, callback)
    })
  })
}

function preprocessImage (cv, inputBuffer, outfile, callback) {
  var mats = []

  sharp(inputBuffer, { limitInputPixels: false })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
    .then(function (result) {
      var width = result.info.width
      var height = result.info.height
      var src = new cv.Mat(height, width, cv.CV_8UC4)
      mats.push(src)
      src.data.set(result.data)

      var gray = new cv.Mat()
      mats.push(gray)
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY)

      var working = gray
      if (width < 1800) {
        var upscaled = new cv.Mat()
        mats.push(upscaled)
        var scaledSize = new cv.Size(width * 2, height * 2)
        cv.resize(gray, upscaled, scaledSize, 0, 0, cv.INTER_CUBIC)
        working = upscaled
      }

      var normalized = new cv.Mat()
      mats.push(normalized)
      cv.normalize(working, normalized, 0, 255, cv.NORM_MINMAX)

      var blurred = new cv.Mat()
      mats.push(blurred)
      cv.medianBlur(normalized, blurred, 3)

      var threshold = new cv.Mat()
      mats.push(threshold)
      cv.adaptiveThreshold(blurred, threshold, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 31, 12)

      return sharp(Buffer.from(threshold.data), {
        raw: {
          width: threshold.cols,
          height: threshold.rows,
          channels: 1
        }
      }).png().toFile(outfile)
    })
    .then(function () {
      cleanupMats(mats)
      callback(null, outfile)
    })
    .catch(function (error) {
      cleanupMats(mats)
      callback(error)
    })
}

function readInput (stream, callback) {
  if (typeof stream === 'string') {
    fs.readFile(stream, callback)
    return
  }

  if (Buffer.isBuffer(stream)) {
    callback(null, stream)
    return
  }

  var chunks = []
  stream.on('data', function (chunk) {
    chunks.push(chunk)
  })
  stream.on('error', callback)
  stream.on('end', function () {
    callback(null, Buffer.concat(chunks))
  })
}

function getCvModule (callback) {
  if (cvModule) {
    process.nextTick(function () {
      callback(null, cvModule)
    })
    return
  }

  cvModuleWaiters.push(callback)

  if (cvModuleLoading) return
  cvModuleLoading = true

  var candidate
  try {
    candidate = require('@techstark/opencv-js')
  } catch (error) {
    flushCvWaiters(error)
    return
  }

  resolveCvCandidate(candidate, function (error, resolved) {
    if (error) {
      flushCvWaiters(error)
      return
    }

    cvModule = normalizeCvShape(resolved)
    if (!cvModule) {
      flushCvWaiters(new Error('Unable to initialize @techstark/opencv-js module.'))
      return
    }

    flushCvWaiters(null, cvModule)
  })
}

function resolveCvCandidate (candidate, callback) {
  if (!candidate) {
    callback(new Error('Invalid @techstark/opencv-js export.'))
    return
  }

  // Emscripten modules may expose a thenable that resolves to themselves.
  // When that happens, recurse-free runtime waiting is required.
  if (isEmscriptenModule(candidate)) {
    waitForEmscriptenRuntime(candidate, callback)
    return
  }

  if (typeof candidate.then === 'function') {
    candidate.then(function (resolved) {
      if (resolved === candidate) {
        waitForEmscriptenRuntime(candidate, callback)
        return
      }
      resolveCvCandidate(resolved, callback)
    }, function (error) {
      callback(error)
    })
    return
  }

  if (typeof candidate === 'function') {
    var loaded
    try {
      loaded = candidate()
    } catch (error) {
      callback(error)
      return
    }

    resolveCvCandidate(loaded, callback)
    return
  }

  callback(null, candidate)
}

function isEmscriptenModule (candidate) {
  return !!(
    candidate &&
    typeof candidate === 'object' &&
    (typeof candidate.onRuntimeInitialized === 'function' ||
      typeof candidate.calledRun !== 'undefined')
  )
}

function waitForEmscriptenRuntime (candidate, callback) {
  if (typeof candidate.Mat === 'function') {
    callback(null, candidate)
    return
  }

  var originalInit = candidate.onRuntimeInitialized
  candidate.onRuntimeInitialized = function () {
    if (typeof originalInit === 'function') {
      originalInit()
    }

    if (typeof candidate.Mat === 'function') {
      callback(null, candidate)
      return
    }

    callback(new Error('OpenCV runtime initialized but Mat API is unavailable.'))
  }
}

function normalizeCvShape (candidate) {
  if (candidate && typeof candidate.Mat === 'function') return candidate
  if (candidate && candidate.default && typeof candidate.default.Mat === 'function') return candidate.default
  if (candidate && candidate.cv && typeof candidate.cv.Mat === 'function') return candidate.cv
  return null
}

function flushCvWaiters (error, cv) {
  var waiters = cvModuleWaiters
  cvModuleWaiters = []
  cvModuleLoading = false

  waiters.forEach(function (waiter) {
    waiter(error, cv)
  })
}

function cleanupMats (mats) {
  mats.forEach(function (mat) {
    if (mat && typeof mat.delete === 'function') {
      mat.delete()
    }
  })
}

module.exports = opencv
