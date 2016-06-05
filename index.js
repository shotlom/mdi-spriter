#!/usr/bin/env node --harmony

'use strict'
const debug = require('debug')('mdi')
const path = require('path')
const find = require('findit')
const fs = require('fs-extra')
const SVGSpriter = require('svg-sprite')
const File = require('vinyl')
const kgo = require('kgo')
const nodeDir = path.join(__dirname, '/node_modules/material-design-icons')
const argv = require('minimist')(process.argv.slice(2))
const mkdirp = require('mkdirp')
const finder = find(nodeDir)
const Svg = require('svgutils').Svg

kgo('required', function (done) {
  debug('kgo:required config')
  if (!argv.c && (argv.help || argv._.length === 0)) {
    debug('Required arguments not passed in. Please check the documentation')
    let msg = 'you need a config.json file'
    done(msg)
  }
  let config = require(path.join(process.cwd(), '/', argv.c))

  config.output = (argv.o) ? path.join(process.cwd(), '/', argv.o) : ((config.dest) ? path.join(process.cwd(), '/', config.dest) : path.join(process.cwd(), '/assets'))

  config.tmp = (config.temp) ? path.join(process.cwd(), '/', config.temp) : path.join(process.cwd(), '/temp')

  fs.ensureDir(config.output, function (err) {
    if (err) done(err)
  })
  fs.ensureDir(config.tmp, function (err) {
    if (err) done(err)
    done(null, config)
  })
})('search', ['required'], function (config, done) {
  debug('kgo:search for files')
  let icons = config.mdi
  processIcons(icons, function (err, files) {
    if (err) done(err)
    done(null, files)
  })
})('copy', ['required', 'search'], function (config, files, done) {
  files.forEach(function (source, index, array) {
    var target = path.join(config.tmp, '/', path.basename(source))
    debug('kgo:copy clobbering target file', target)

    Svg.fromSvgDocument(source, function (err, svg) {
      if (err) {
        throw new Error('SVG file not found or invalid')
      }

      var json = svg.toJSON()
      debug('svg:json', json)
    })

    fs.copySync(source, target, {clobber: true}, function (err) {
      if (err) done(err)
    })

    if (index === array.length - 1) {
      debug('done copy', array.length, index)
      done(null)
    }
  })
})('sprite', ['required', 'copy'], function (config, copy, done) {
  debug('kgo:sprite creating sprite')
  const spriter = new SVGSpriter({
    dest: config.output,
    mode: {
      css: {
        render: {
          css: true,
          styl: true
        },
        example: true
      }
    }
  })

  fs.walk(config.tmp)
    .on('readable', function () {
      var item
      while ((item = this.read())) {
        if (item.stats.isFile()) {
          spriter.add(new File({
            path: item.path,                         // Absolute path to the SVG file
            base: config.tmp,                                          // Base path (see `name` argument)
            contents: fs.readFileSync(item.path)     // SVG file contents
          }))
        }
      }
    })
    .on('end', function () {
      spriter.compile(function (err, result, data) {
        if (err) done(err)
        for (var type in result.css) {
          mkdirp.sync(path.dirname(result.css[type].path))
          fs.writeFileSync(result.css[type].path, result.css[type].contents)
        }
      })

      fs.removeSync(config.tmp, function (err) {
        if (err) done(err)
      })

      debug('kgo:sprite done')
      done(null)
    })
})(['*'], function (err) {
  debug('err: ' + err)
  return
})

function processIcons (icons, callback) {
  let files = []
  debug('processIcons')
  finder.on('file', function (file, stat) {
    icons.forEach(function (mdi, index, array) {
      let fileName = 'ic_' + mdi.icon + '_' + (mdi.size || '24px') + '.svg'
      if (fileName === path.basename(file)) {
        files.push(file)
      }
    })
  })
  finder.on('end', function () {
    debug('processIcons end. Files')
    callback(null, files)
  })
  finder.on('err', function (err) {
    debug('finder err', err)
    callback(err)
  })
}
