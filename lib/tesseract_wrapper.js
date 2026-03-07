'use strict';

/**
 * Modern Tesseract wrapper for Tesseract 5.x+
 * Replaces the outdated node-tesseract module
 */

var exec = require('child_process').exec;
var fs = require('fs');
var tmpdir = require('os').tmpdir();
var path = require('path');
var crypto = require('crypto');

var TesseractWrapper = {
  tmpFiles: [],

  /**
   * Default options for Tesseract binary
   * @type {Object}
   */
  options: {
    'l': 'eng',
    'psm': 3,
    'config': null,
    'binary': 'tesseract'
  },

  /**
   * Output encoding
   * @type {String}
   */
  outputEncoding: 'UTF-8',

  /**
   * Runs Tesseract binary with options
   *
   * @param {String} image - path to image file
   * @param {Object|Function} options - options to pass to Tesseract binary
   * @param {Function} callback - callback function
   */
  process: function(image, options, callback) {
    if (typeof options === 'function') {
      callback = options;
      options = null;
    }

    // Merge options with defaults
    options = Object.assign({}, TesseractWrapper.options, options || {});

    // Generate output file name (without extension)
    var output = path.resolve(tmpdir, 'tesseract-' + crypto.randomBytes(16).toString('hex'));

    // Add to tmp files list for cleanup
    TesseractWrapper.tmpFiles.push(output);

    // Assemble tesseract command with modern syntax
    var command = [options.binary, '"' + image + '"', '"' + output + '"'];

    if (options.l !== null) {
      command.push('-l ' + options.l);
    }

    if (options.psm !== null) {
      command.push('--psm ' + options.psm);
    }

    if (options.config !== null) {
      command.push(options.config);
    }

    command = command.join(' ');

    var execOptions = options.env || {};

    // Run the tesseract command
    exec(command, execOptions, function(err, stdout, stderr) {
      if (err) {
        callback(err, null);
        return;
      }

      // Tesseract outputs to .txt file by default
      var outputFile = output + '.txt';

      fs.readFile(outputFile, TesseractWrapper.outputEncoding, function(err, data) {
        if (err) {
          callback(err, null);
          return;
        }

        // Clean up tmp file
        var index = TesseractWrapper.tmpFiles.indexOf(output);
        if (index !== -1) {
          TesseractWrapper.tmpFiles.splice(index, 1);
        }

        try {
          fs.unlinkSync(outputFile);
        } catch (e) {
          // Ignore cleanup errors
        }

        callback(null, data);
      });
    });
  }
};

module.exports = TesseractWrapper;
