const sharp = require('sharp');
const imageSize = require('image-size');
const path = require('path');
const lib = require('./lib');
const fs = require('fs');
const isImage = require('is-image');
const  uniqBy = require('lodash.uniqby');
const chalk = require('chalk');

module.exports = function(settings) {
  settings.minJpegQuality = settings.minJpegQuality || 1;
  settings.maxBytes = settings.maxBytes || 9999999999999999999;
  const sourceDir = settings.src;
  const outputDir = settings.dest;
  const sizeDefinitions = settings.sizes;
  const maxQuality = settings.maxQuality || 90;
  const resultSummary = {
    deletedImages: [],
    deletedDirs: [],
    newClones: [],
    resizedOriginals: [],
  };
  var srcFiles = lib.getFiles(lib.getAbsolutePath(sourceDir))
  .filter(filePath => isImage(filePath))
  .filter(filePath => {
    try {
      imageSize(filePath);
      return true;
    } catch(err) {
      return false;
    }
  })
  .map(srcFilePath => {
    var relPath = srcFilePath.replace(lib.getAbsolutePath(sourceDir), '');
    var relPathNoExt = lib.trimFromEnd(relPath, path.extname(relPath));
    var fileOutputDir = `${lib.getAbsolutePath(outputDir)}${path.dirname(relPath)}`;
    const srcFileStats = fs.statSync(srcFilePath);
    var srcMtime = srcFileStats.mtime;
    destPaths = uniqBy(sizeDefinitions.map(sizeDefinition => {
      var outputSize = getOutputSize(srcFilePath, sizeDefinition);
      const suffix = sizeDefinition.suffix ? sizeDefinition.suffix.replace('{imageHeight}', outputSize.height).replace('{imageWidth}', outputSize.width) : `-${outputSize.width}w`;
      var filename = `${path.basename(relPathNoExt)}${suffix}${path.extname(relPath)}`;
      const outputPath = `${fileOutputDir}${lib.conditionalSlash(fileOutputDir, 'end')}${filename}`;
      return {
        path: outputPath,
        dimensions: sizeDefinition,
        actualDimensions: outputSize
      }
    }), 'path');
    (destPaths || []).sort((a, b) => {
      return b.actualDimensions.width - a.actualDimensions.width;
    })[0].widest = true;

    const queuedFileDefs = destPaths.filter(destPath => {
      if (settings.skipExisting && !lib.fileIsNewer({srcPath: srcFilePath, srcMtime: srcMtime, destPath: destPath.path})) { return false }
      return true;
    });
    return {
      absPath: srcFilePath,
      srcMtime: srcMtime,
      relPath: relPath,
      dest: queuedFileDefs,
      allSizes: destPaths,
      originalImageSize: imageSize(srcFilePath)
    }
  });

  const queue = srcFiles.filter(srcFile => srcFile.dest.length > 0);
  (async () => {
    try {
      for (var srcFile of queue) {
        await processImage(srcFile);
      }
      if (settings.resizeOriginal) {
        resizeOriginals();
      }
      pruneImages();
      updateLog(resultSummary, true);
    } catch(err) {
      console.log(err)
    }
  })();

  // const fileProcessors = queue.map(srcFile => processImage(srcFile));
  // Promise.all(fileProcessors).then(res => {
  //   if (settings.resizeOriginal) {
  //     resizeOriginals();
  //   }
  //   pruneImages();
  //   updateLog(resultSummary, true);
  // }).catch(err => {
  //   console.log(err)
  // });

  function processImage(srcFile) {
    // console.log(`Start ${path.basename(srcFile.absPath)}`);
    
    return new Promise((resolve, reject) => {
      const widestDest = srcFile.allSizes.find(item => {
        return item.widest;
      });
      const widestCloneOptions = {
        src: srcFile.absPath, 
        dest: widestDest.path, 
        srcMtime: srcFile.srcMtime,
        dimensions: widestDest.actualDimensions,
        maxBytes: settings.maxBytes,
        quality: settings.maxQuality
      }
      createLargestClone(widestCloneOptions)
      .then(createLargestCloneResult => {
        const others = srcFile.dest.filter(item => {
          return !item.widest;
        });
        const filePromises = [];
        others.forEach(destOptions => {
          filePromises.push({
            src: srcFile.absPath, 
            dest: destOptions.path, 
            dimensions: destOptions.actualDimensions,
            srcMtime: srcFile.srcMtime,
            quality: createLargestCloneResult.quality,
            skipExisting: settings.skipExisting === false ? false : true
          });
        });
        Promise.all(filePromises.map(opts => cloneImage(opts)))
        .then(response => {
          updateLog(resultSummary);
          resolve(response);
          // console.log(`Finish ${path.basename(srcFile.absPath)}`);

        }).catch(err => reject(err));
      }).catch(err => {
        reject(err)
      });
    });
  }
  
  function resizeOriginals() {
    srcFiles.forEach(srcFile => {
      const widestDest = srcFile.allSizes.find(item => item.widest);
      if (srcFile.originalImageSize.width > widestDest.dimensions.width) {
        try {
          fs.copyFileSync(createLargestCloneResult.dest, srcFile.absPath);
          resultSummary.resizedOriginals.push(srcFile.absPath);
          updateLog(resultSummary);
        } catch(err) {
          console.log(err);
        }
      }
    });
  }

  function updateLog(resultSummary, isFinal) {
    let text = [];
    if (resultSummary.resizedOriginals.length) {
      text.push(chalk.cyan(`downsized ${resultSummary.resizedOriginals.length} originals` ));
    }
    if (resultSummary.newClones.length) {
      text.push(chalk.green(`created ${resultSummary.newClones.length} new clones of ${queue.length} images` ));
    }
    if (resultSummary.deletedImages.length) {
      text.push(chalk.magenta(`deleted ${resultSummary.deletedImages.length} orphaned clones` ));
    }
    process.stdout.clearLine();
    process.stdout.cursorTo(0);

    if (isFinal) {
      if (!text.length) {
        console.log(chalk.yellow('Responsive image directory - no images to process.'))
      } else {
        process.stdout.write('Responsive image directory finished - ' + text.join(', ') + '\n');
        if (settings.logPath) {
          fs.writeFile(settings.logPath, JSON.stringify(resultSummary, null, 2), (err, data) => {
            if (err) {
              console.log(err)
            } else {
              console.log(`Results logged at ${path.resolve(process.cwd(), settings.logPath)}.`)
            }
          })
        }
      }
    } else {
      process.stdout.write('Responsive image directory - ' + text.join(', '));
    }
  }

  function createLargestClone(opts) {
    return new Promise((resolve, reject) => {
      const run = function(opts) {
        opts.attempts = opts.attempts ||[];
        
        genImage(opts).then(data => {
          opts.attempts.push({
            quality: opts.quality,
            // quality: Math.floor(opts.quality),
            bytes: data.size,
            increment: opts.increment
          });
          if (data.size > opts.maxBytes) {
            if ((opts.quality || maxQuality) > settings.minJpegQuality ) {
              opts.quality = opts.quality || maxQuality;
              opts.quality = opts.quality - opts.increment > settings.minJpegQuality ? opts.quality - opts.increment : settings.minJpegQuality;
              run(opts)
            } else {
              resultSummary.newClones.push({
                file: opts.dest,
                quality: opts.quality,
                bytes: opts.attepmts.find(attempt => attempt.quality === opts.quality).bytes
              });
              updateLog(resultSummary);
              resolve(opts);
            }
          } else { // Resulting image is smaller than maxBytes
            if (opts.attempts.length === 1 && opts.attempts[0].quality === maxQuality && opts.attempts[0].bytes <= opts.maxBytes) {
              
              resultSummary.newClones.push({
                file: opts.dest,
                quality: opts.quality,
                bytes: opts.attempts.find(attempt => attempt.quality === opts.quality).bytes
              });
              updateLog(resultSummary);
              resolve(opts);
            } else {
              const closestTooHigh = opts.attempts.filter(attempt => attempt.bytes > opts.maxBytes).sort((a,b) => a.bytes - b.bytes)[0];
              if (closestTooHigh && opts.quality && opts.increment > 5 ) {
                opts.increment = opts.increment/5;
                opts.quality = closestTooHigh.quality || maxQuality - opts.increment > settings.minJpegQuality ? closestTooHigh.quality - opts.increment : settings.minJpegQuality;
                run(opts);
              } else {
                resultSummary.newClones.push({
                  file: opts.dest,
                  quality: opts.quality,
                  bytes: opts.attempts.find(attempt => attempt.quality === opts.quality).bytes
                });
                updateLog(resultSummary);
                resolve(opts);
              }
            }
          }
        }).catch(err => reject(err));
      }
      opts.increment = 40;
      run(opts)
    });
  }
  
  function genImage(opts) {
    return new Promise((resolve, reject) => {
      lib.mkdirP(path.dirname(opts.dest));
      const sharpInstance = sharp(opts.src);
      sharpInstance.resize(opts.dimensions.width, opts.dimensions.height, {fit: 'inside', withoutEnlargement: true});
      if (opts.quality) {
        opts.quality = Math.floor(opts.quality);
        sharpInstance.jpeg({ quality: opts.quality, progressive: true });
      }
      sharpInstance.withMetadata()
      .toFile(opts.dest)
      .then( data => { 
        resolve(data);
      })
      .catch( err => { reject(err) });
    });
  }

  function cloneImage(opts) {
    // if (opts.quality) {
    //   opts.quality = Math.floor(opts.quality);
    // }
    return new Promise((resolve, reject) => {
      genImage(opts).then(data => {
        resultSummary.newClones.push({
          file: opts.dest,
          quality: opts.quality,
          bytes: data.size
        });
        updateLog(resultSummary);
        resolve(opts);
      }).catch(err => {
        reject(err);
      })
    });
  }
  
  function getOutputSize(input, outputMaxSize) {
    let inputSize;
    try {
      inputSize = imageSize(input);
    }  catch (err) {
      console.log(err)
      inputSize = {};
    }
    var inputRatio = inputSize.width/inputSize.height;
    var heightExcess = inputSize.height/outputMaxSize.maxHeight;
    var widthExcess = inputSize.width/outputMaxSize.maxWidth;
    if (heightExcess <= 1 && widthExcess <= 1) {
      return inputSize;
    }
    if (heightExcess >= widthExcess) {
      return getOther(inputRatio, 'height', outputMaxSize.maxHeight);
    } else if (widthExcess > heightExcess) {
      return getOther(inputRatio, 'width', outputMaxSize.maxWidth);
    }
  }
  
  function getOther(ratio, side, length) {
    var dimensions = {}
    dimensions[side] = length;
    if (side === 'width') {
      dimensions['height'] = Math.round(length/ratio);
    } else {
      dimensions['width'] = Math.round(length*ratio);
    }
    return dimensions;
  }

  function pruneImages() {
    const outputResponsiveImages = srcFiles.reduce((acc, srcFile) => {
      return acc.concat(srcFile.allSizes.map(item => item.path))
    }, [])
    const outputResponsiveDirs = lib.uniq(outputResponsiveImages.map(outputPath => path.dirname(outputPath)));
    const existingResponsiveDirs = lib.getDirs(lib.getAbsolutePath(outputDir));
    var orphanedDirs = existingResponsiveDirs.filter(existingDir => {
      return !outputResponsiveImages.find(existingImage => existingImage.startsWith(existingDir));
    });
    orphanedDirs.forEach(dirPath => {
      lib.deleteFolderRecursively(dirPath);
      resultSummary.deletedDirs.push(dirPath);
      updateLog(resultSummary);
    });
    // Remove orphaned files from responsive images directory
    const existingResponsiveImages = lib.getFiles(lib.getAbsolutePath(outputDir)).sort();
    var orphanedImages = existingResponsiveImages.filter(existing => outputResponsiveImages.indexOf(existing) < 0);
    orphanedImages.forEach(filePath => {
      fs.unlinkSync(filePath);
      resultSummary.deletedImages.push(filePath);
      updateLog(resultSummary);
    });
  }
}

