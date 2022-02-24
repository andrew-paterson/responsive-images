const sharp = require('sharp');
const imageSize = require('image-size');
const path = require('path');
const lib = require('./lib');
const fs = require('fs');
const isImage = require('is-image');
const  uniqBy = require('lodash.uniqby');
const chalk = require('chalk');

module.exports = function(settings) {
  return new Promise((resolve, reject) => {
    const startDate = new Date();
    const sourceDir = settings.src;
    const outputDir = settings.dest;
    const sizeDefinitions = settings.sizes;
    const maxQuality = settings.maxQuality || 90;
    const minJpegQuality = settings.minJpegQuality || 1;
    const batchSize = settings.batchSize || 10;
    const dynamicQualityParams = settings.dynamicQualityParams || {};
    let maxBytesPerPixel;
    if (dynamicQualityParams.width && dynamicQualityParams.height && dynamicQualityParams.maxBytes) {
      maxBytesPerPixel = dynamicQualityParams.maxBytes/(dynamicQualityParams.width*dynamicQualityParams.height);
    } else {
      maxBytesPerPixel = 999999999;
    }
    const resultSummary = {
      deletedImages: [],
      deletedDirs: [],
      newClones: [],
      resizedOriginals: [],
      failed: []
    };
    const srcFiles = lib.getFiles(lib.getAbsolutePath(sourceDir))
      .filter(filePath => isImage(filePath))
      .filter(filePath => {
        try {
          imageSize(filePath);
          return true;
        } catch (err) {
          return false;
        }
      }).map(srcFilePath => {
        const relPath = srcFilePath.replace(lib.getAbsolutePath(sourceDir), '');
        const relPathNoExt = lib.trimFromEnd(relPath, path.extname(relPath));
        const fileOutputDir = `${lib.getAbsolutePath(outputDir)}${path.dirname(relPath)}`;
        const srcFileStats = fs.statSync(srcFilePath);
        const srcMtime = srcFileStats.mtime;
        const destPaths = uniqBy(sizeDefinitions.map(sizeDefinition => {
          const outputSize = getOutputSize(srcFilePath, sizeDefinition);
          const suffix = sizeDefinition.suffix ? sizeDefinition.suffix.replace('{imageHeight}', outputSize.height).replace('{imageWidth}', outputSize.width) : `-${outputSize.width}w`;
          const filename = `${path.basename(relPathNoExt)}${suffix}${path.extname(relPath)}`;
          const outputPath = `${fileOutputDir}${lib.conditionalSlash(fileOutputDir, 'end')}${filename}`;
          return {
            path: outputPath,
            dimensions: sizeDefinition,
            actualDimensions: outputSize
          };
        }), 'path');
        (getWidest(destPaths) || {}).widestOverall = true;


        const queuedFileDefs = destPaths.filter(destPath => {
          if (settings.skipExisting && !lib.fileIsNewer({srcPath: srcFilePath, srcMtime: srcMtime, destPath: destPath.path})) { 
            return false; 
          }
          return true;
        });

        (getWidest(queuedFileDefs) || {}).widestQueued = true;

        return {
          absPath: srcFilePath,
          srcMtime: srcMtime,
          srcBytes : srcFileStats.size,
          relPath: relPath,
          dest: queuedFileDefs,
          allSizes: destPaths,
          originalImageSize: imageSize(srcFilePath)
        };
      });

    const queue = srcFiles.filter(srcFile => srcFile.dest.length > 0);
    const batches = chunkArray(queue, batchSize);
    let totalClones = 0;
    let newClones = 0;

    srcFiles.forEach(srcFile => {
      totalClones += srcFile.allSizes.length;
      newClones += srcFile.dest.length;
    });

    console.log(chalk.cyan(`${srcFiles.length} original images in ${sourceDir} will result in ${totalClones} responsive images in ${outputDir}.`));
    console.log(chalk.cyan(`${totalClones - newClones} already exist, ${newClones} will be generated now.`));

    (async () => {
      try {
        for (const batch of batches) {
          await processBatch(batch).then().catch(err => console.log(err));
        }
        if (settings.resizeOriginal) {
          resizeOriginals();
        }
        pruneImages();
        updateLog(resultSummary, true);
        resolve();
      } catch (err) {
        console.log(chalk.red(err));
        reject(err);
      }
    })();

    function getWidest(fileDefs) {
      if (fileDefs.length) {
        return fileDefs.sort((a, b) => {
          return b.actualDimensions.width - a.actualDimensions.width;
        })[0];
      }
    }

    function processBatch(batch) {
      return new Promise((resolve, reject) => {
        const filePromises = batch.map(srcFile => processImage(srcFile));
        Promise.all(filePromises).then(res => {
          resolve(res);
        }).catch(err => {
          reject(err);
        });
      });
    }

    function chunkArray(arr, chunkSize) {
      return arr.map(function(e,i) { 
        return i % chunkSize === 0 ? arr.slice(i,i+chunkSize) : null; 
      }).filter(function(e) { return e; });
    }


    function processImage(srcFile) {
      return new Promise((resolve, reject) => {
        const widestDest = srcFile.dest.find(item => {
          return item.widestQueued;
        });
        const generalMaxBytes = maxBytesPerPixel * (widestDest.actualDimensions.width * widestDest.actualDimensions.height);
        let maxBytes;
        if (generalMaxBytes > srcFile.srcBytes) {
          maxBytes = srcFile.srcBytes;
        } else {
          maxBytes = generalMaxBytes;
        }
        const widestCloneOptions = {
          src: srcFile.absPath, 
          dest: widestDest.path, 
          srcMtime: srcFile.srcMtime,
          dimensions: widestDest.actualDimensions,
          maxBytes: maxBytes,
          quality: settings.maxQuality
        };
        createLargestClone(widestCloneOptions)
          .then(createLargestCloneResult => {
            const others = srcFile.dest.filter(item => {
              return !item.widestQueued;
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
              }).catch(err => reject(err));
          }).catch(err => {
            reject(err);
          });
      });
    }
    
    function resizeOriginals() {
      srcFiles.forEach(srcFile => {
        const widestDest = srcFile.allSizes.find(item => item.widestOverall);
        if (srcFile.originalImageSize.width > widestDest.actualDimensions.width) {
          try {
            fs.copyFileSync(widestDest.path, srcFile.absPath);
            resultSummary.resizedOriginals.push(srcFile.absPath);
            updateLog(resultSummary);
          } catch(err) {
            console.log(err);
          }
        }
      });
    }

    function updateLog(resultSummary, isFinal) {
      const text = [];
      if (resultSummary.resizedOriginals.length) {
        text.push(chalk.cyan(`${resultSummary.resizedOriginals.length} originals downsized` ));
      }
      if (resultSummary.newClones.length) {
        text.push(chalk.green(`${resultSummary.newClones.length} of ${newClones} new clones generated, based on ${queue.length} original images` ));
      }
      if (resultSummary.deletedImages.length) {
        text.push(chalk.magenta(`${resultSummary.deletedImages.length} orphaned images deleted` ));
      }
      if (resultSummary.deletedDirs.length) {
        text.push(chalk.magenta(`${resultSummary.deletedDirs.length} orphaned directories deleted` ));
      }
      process.stdout.clearLine();
      process.stdout.cursorTo(0);
      const endDate = new Date();
      const elapsed = endDate.getTime() - startDate.getTime();
      if (isFinal) {
        if (!text.length) {
          console.log(chalk.yellow('Responsive image directory - no images to process.'))
        } else {
          process.stdout.write(text.join(', ') + ` in ${lib.timeConversion(elapsed)}` +  '\n');
          if (settings.logPath) {
            try {
              fs.writeFileSync(settings.logPath, JSON.stringify(resultSummary, null, 2));
              console.log(chalk.cyan(`Image generation results logged at ${path.resolve(process.cwd(), settings.logPath)}.`));
            } catch (err) {
              console.log(err);
            }
          } else {
            console.log('Finished');
          }
        }
      } else {
        process.stdout.write(text.join(', ') + ` in ${lib.timeConversion(elapsed)}`);
      }
    }

    function createLargestClone(opts) {
      return new Promise((resolve, reject) => {
        const run = function(opts) {
          opts.attempts = opts.attempts ||[];
          
          genImage(opts).then(data => {
            opts.attempts.push({
              quality: opts.quality,
              bytes: data.size,
              increment: opts.increment
            });
            if (data.size > opts.maxBytes) {
              if ((opts.quality || maxQuality) > minJpegQuality ) {
                opts.quality = opts.quality || maxQuality;
                opts.quality = opts.quality - opts.increment > minJpegQuality ? opts.quality - opts.increment : minJpegQuality;
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
                  opts.quality = closestTooHigh.quality || maxQuality - opts.increment > minJpegQuality ? closestTooHigh.quality - opts.increment : minJpegQuality;
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
        };
        opts.increment = 40;
        run(opts);
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
          .then(data => { 
            resolve(data);
          })
          .catch(err => { reject(err); });
      });
    }

    function cloneImage(opts) {
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
          resultSummary.failed.push({
            file: opts.dest,
            error: err
          });
          updateLog(resultSummary);
          reject(err);
        })
      });
    }
    
    function getOutputSize(input, outputMaxSize) {
      let inputSize;
      try {
        inputSize = imageSize(input);
      }  catch (err) {
        console.log(err);
        inputSize = {};
      }
      const inputRatio = inputSize.width/inputSize.height;
      const heightExcess = inputSize.height/outputMaxSize.maxHeight;
      const widthExcess = inputSize.width/outputMaxSize.maxWidth;
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
      const dimensions = {};
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
      const orphanedDirs = existingResponsiveDirs.filter(existingDir => {
        return !outputResponsiveImages.find(existingImage => existingImage.startsWith(existingDir));
      });
      orphanedDirs.forEach(dirPath => {
        lib.deleteFolderRecursively(dirPath);
        resultSummary.deletedDirs.push(dirPath);
        updateLog(resultSummary);
      });
      // Remove orphaned files from responsive images directory
      const existingResponsiveImages = lib.getFiles(lib.getAbsolutePath(outputDir)).sort();
      const orphanedImages = existingResponsiveImages.filter(existing => outputResponsiveImages.indexOf(existing) < 0);
      orphanedImages.forEach(filePath => {
        fs.unlinkSync(filePath);
        resultSummary.deletedImages.push(filePath);
        updateLog(resultSummary);
      });
    }
  });
}