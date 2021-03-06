const sharp = require('sharp');
const imageSize = require('image-size');
const path = require('path');
const lib = require('./lib');
const fs = require('fs');
const isImage = require('is-image');

module.exports = function(settings) {
  const sourceDir = settings.src;
  const outputDir = settings.dest;
  const sizeDefinitions = settings.sizes;
  var srcFiles = lib.getFiles(lib.getAbsolutePath(sourceDir))
  .filter(filePath => isImage(filePath))
  .map(srcFilePath => {
    var relPath = srcFilePath.replace(lib.getAbsolutePath(sourceDir), '');
    var relPathNoExt = lib.trimFromEnd(relPath, path.extname(relPath));
    var fileOutputDir = `${lib.getAbsolutePath(outputDir)}${path.dirname(relPath)}`;
    destPaths = sizeDefinitions.map(sizeDefinition => {
      var outputSize = outputWidth(srcFilePath, sizeDefinition);
      const suffix = sizeDefinition.suffix ? sizeDefinition.suffix.replace('{imageHeight}', outputSize.height).replace('{imageWidth}', outputSize.width) : `-${outputSize.width}w`;
      var filename = `${path.basename(relPathNoExt)}${suffix}${path.extname(relPath)}`;
      return {
        path: `${fileOutputDir}${lib.conditionalSlash(fileOutputDir, 'end')}${filename}`,
        dimensions: sizeDefinition
      }
    });
    return {
      absPath: srcFilePath,
      srcMtime: fs.statSync(srcFilePath).mtime,
      relPath: relPath,
      dest: destPaths,
      status: 'queued',
    }
  });
  var outputResponsiveImages = [];
  var outputResponsiveDirs = [];
  var srcFilePromises = [];
  var filePromises = [];
  srcFiles.forEach(srcFile => { 
    var widestDimensions = srcFile.dest.sort((a, b) => {
      return b.dimensions.maxWidth - a.dimensions.maxWidth;
    })[0].dimensions;
    let srcImageSize;
    try {
      srcImageSize = imageSize(srcFile.absPath);
    }  catch (err) {
      srcImageSize = {};
    }
    if (settings.resizeOriginal && (srcImageSize.height > widestDimensions.maxHeight || srcImageSize.width > widestDimensions.maxWidth )) {
      srcFilePromises.push({
        src: srcFile.absPath, 
        dest: srcFile.absPath, 
        srcMtime: srcFile.srcMtime,
        dimensions: widestDimensions
      });
    }
    srcFile.dest.forEach(destOptions => {
      filePromises.push({
        src: srcFile.absPath, 
        dest: destOptions.path, 
        dimensions: destOptions.dimensions,
        srcMtime: srcFile.srcMtime,
        skipExisting: true
      });
      outputResponsiveImages.push(destOptions.path);
      if (outputResponsiveDirs.indexOf(path.dirname(destOptions.path)) < 0) {
        outputResponsiveDirs.push(path.dirname(destOptions.path));
      }
    });
  });
  
  function arrayCount(array) {
    var obj = {};
    array.forEach(item => {
      if (!obj[item]) {
        obj[item] = 1;
      } else {
        obj[item] ++;
      }
    });
    return obj;
  }
  Promise.all(srcFilePromises.map(opts => genFile(opts)))
  .then(srcFileResponses => {
    Promise.all(filePromises.map(opts => genFile(opts)))
    .then(response => {
      pruneImages();
      return response;
    })
    .then(response => {
      console.log(arrayCount(response.concat(srcFileResponses)));
    });
  }).catch(err => {
    console.log(err)
  });
  
  function genFile(opts) {
    return new Promise((resolve, reject) => {
      if (opts.skipExisting && !lib.fileIsNewer({srcPath: opts.src, srcMtime: opts.srcMtime, destPath: opts.dest})) {
        resolve('skipped');
        return;
      }
      if (opts.src === opts.dest) {// To resize and replace the source image, you must first create a resized buffer of it and then overwrite the image with the buffer.
        sharp(opts.src)
        .jpeg({ quality: 100, progressive: true })
        .resize(opts.dimensions.maxWidth, opts.dimensions.maxHeight, {fit: 'inside', withoutEnlargement: true})
        .withMetadata()
        .toBuffer()
        .then(buffer => { 
          sharp(buffer)
          .withMetadata()
          .toFile(opts.dest)
          .then( data => { resolve('resized') })
          .catch( err => { reject(err) });
        });
        
      } else { // For image clones
        lib.mkdirP(path.dirname(opts.dest));
        sharp(opts.src)
        .jpeg({ quality: 100, progressive: true })
        .resize(opts.dimensions.maxWidth, opts.dimensions.maxHeight, {fit: 'inside', withoutEnlargement: true})
        .withMetadata()
        .toFile(opts.dest)
        .then( data => { resolve('created') })
        .catch( err => { reject(err) });
      }
    })
  }
  
  function outputWidth(input, outputMaxSize) {
    let inputSize;
    try {
      inputSize = imageSize(input);
    }  catch (err) {
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
    const existingResponsiveDirs = lib.getDirs(lib.getAbsolutePath(outputDir));
    var orphanedDirs = existingResponsiveDirs.filter(existingDir => {
      return !outputResponsiveImages.find(existingImage => existingImage.startsWith(existingDir));
    });
    orphanedDirs.forEach(dirPath => {
      lib.deleteFolderRecursively(dirPath);
    });
    console.log(`Deleted ${orphanedDirs.length} orphaned directories recursively.`);
    // Remove orphaned files from responsive images directory
    const existingResponsiveImages = lib.getFiles(lib.getAbsolutePath(outputDir)).sort();
    var orphanedImages = existingResponsiveImages.filter(existing => outputResponsiveImages.indexOf(existing) < 0);
    orphanedImages.forEach(filePath => {
      fs.unlinkSync(filePath);
    });
    console.log(`Deleted ${orphanedImages.length} orphaned images.`);

    
  }
}

