function Preprocessor (processor) {
  this.preprocessors = []
  this.processor = processor

  return this
}

function isMissingOptionalPreprocessorDependency (error, preprocessorName) {
  if (!error || error.code !== 'MODULE_NOT_FOUND') return false

  var optionalModules = {
    opencv: ['@techstark/opencv-js', 'sharp'],
    sharp: 'sharp',
    imagemagick: 'gm',
    graphicsmagick: 'gm'
  }

  var missingModules = optionalModules[preprocessorName]
  if (!missingModules) return false

  if (!(missingModules instanceof Array)) {
    missingModules = [missingModules]
  }

  return missingModules.some(function (missingModule) {
    return error.message.indexOf("'" + missingModule + "'") !== -1
  })
}

function getProcessableInput (fileOrStream) {
  if (typeof fileOrStream === 'string') return fileOrStream

  if (fileOrStream && fileOrStream.path) {
    return fileOrStream.path
  }

  return fileOrStream
}

Preprocessor.prototype.run = function (preprocessor) {
  this.preprocessors.push(preprocessor)
}

Preprocessor.prototype.process = function (fileOrStream, outfile, callback) {
  this.preprocessors.reverse()

  this._runPreprocessor(fileOrStream, outfile, callback)
}

Preprocessor.prototype._runPreprocessor = function (fileOrStream, outfile, callback) {
  var self = this
  var preprocessor = self.preprocessors.pop()
  var config = {}

  // If no preprocessors remain, continue with the current input.
  if (!preprocessor) {
    return callback(null, getProcessableInput(fileOrStream))
  }

  if (preprocessor instanceof Array) {
    config = preprocessor[1] // Before we override preprocessor
    preprocessor = preprocessor[0]
  }

  config.log = self.processor.log

  if (typeof preprocessor === 'string') {
    var preprocessorName = preprocessor

    try {
      preprocessor = require('./preprocessor/' + preprocessorName)
    } catch (error) {
      if (isMissingOptionalPreprocessorDependency(error, preprocessorName)) {
        self.processor.log('Skipping image preprocessor "' + preprocessorName + '": missing optional dependency.')

        if (!self.preprocessors.length) {
          return callback(null, getProcessableInput(fileOrStream))
        }

        return self._runPreprocessor(fileOrStream, outfile, callback)
      }

      return callback(error, outfile)
    }
  }

  preprocessor(fileOrStream, outfile, function (error, fileOrStream) {
    if (error || !self.preprocessors.length) {
      return callback(error, outfile)
    }

    self._runPreprocessor(fileOrStream, outfile, callback)
  }, config)
}

module.exports = exports = Preprocessor
