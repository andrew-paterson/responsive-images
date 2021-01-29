const sharp = require('sharp');
const imageSize = require('image-size');
const path = require('path');
const lib = require('./lib');
const sourceDir = './input';
const outputDir = './output';
const fs = require('fs');

var sizeDefinitions = [{maxWidth: 400, maxHeight: 300}, {maxWidth: 50000, maxHeight: 40000}, {maxWidth: 4000, maxHeight: 3000}, {maxWidth: 20000, maxHeight: 3000}];

var srcFiles = lib.getFiles(lib.getAbsolutePath(sourceDir)).map(srcFilePath => {
  var relPath = srcFilePath.replace(lib.getAbsolutePath(sourceDir), '');
  var relPathNoExt = lib.trimFromEnd(relPath, path.extname(relPath));
  var fileOutputDir = `${lib.getAbsolutePath(outputDir)}${path.dirname(relPath)}`;
  destPaths = sizeDefinitions.map(sizeDefinition => {
    var outputSize = outputWidth(srcFilePath, sizeDefinition);
    var filename = `${path.basename(relPathNoExt)}-${outputSize.width}w${path.extname(relPath)}`;
    return {
      path: `${fileOutputDir}/${filename}`,
      dimensions: sizeDefinition
    }
  });
  return {
    absPath: srcFilePath,
    relPath: relPath,
    dest: destPaths,
    status: 'queued',
  }
});

console.log(srcFiles);
var filePromises = [];

srcFiles.forEach(srcFile => { 
  srcFile.dest.forEach(destOptions => {
    filePromises.push(genFile(srcFile.absPath, destOptions.path, destOptions.dimensions))
  });
});

Promise.all(filePromises).then(response => {
  console.log(response);
}).catch(err => {
  console.log(err)
})

function genFile(srcPath, destPath, dimensions) {
  return new Promise((resolve, reject) => {
    if (!lib.fileIsNewer(srcPath, destPath)) {
      resolve('skipped')
    }
    lib.mkdirP(path.dirname(destPath));
    sharp(srcPath)
    .resize(dimensions.maxWidth, dimensions.maxHeight, {fit: 'inside', withoutEnlargement: true})
    .toFile(destPath)
    .then( data => { resolve('created') })
    .catch( err => { reject(err) });
  })
}

// console.log(`Already exist: ${existsCount}`)
// console.log(`Created/updated: ${createdCount}`)

function outputWidth(input, outputMaxSize) {
  var inputSize = imageSize(input);
  var inputRatio = inputSize.width/inputSize.height;
  var heightExcess = inputSize.height/outputMaxSize.maxHeight;
  var widthExcess = inputSize.width/outputMaxSize.maxWidth;
  if (heightExcess <= 1 && widthExcess <= 1) {
    return inputSize;
  }
  if (heightExcess > widthExcess) {
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

// Remove orphaned folders from responsive images directory
var responsiveImageDirs = lib.getDirs(lib.getAbsolutePath(outputDir)).map(dirPath => {
  return {
    absPath: dirPath,
    relPath: dirPath.replace(lib.getAbsolutePath(outputDir), '')
  }
});

var originalImageDirs = lib.getDirs(lib.getAbsolutePath(sourceDir)).map(dirPath => {
  return {
    absPath: dirPath,
    relPath: dirPath.replace(lib.getAbsolutePath(sourceDir), '')
  }
});

responsiveImageDirs.forEach(resp => {
  if (!originalImageDirs.find(orig => orig.relPath === resp.relPath)) {
    lib.deleteFolderRecursively(resp.absPath);
  }
});

// Remove orphaned files from responsive images directory
var responsiveImages = lib.getFiles(lib.getAbsolutePath(outputDir)).map(imagePath => {
  return {
    absPath: imagePath,
    relPath: imagePath.replace(lib.getAbsolutePath(outputDir), '')
  }
});

var originalImages = lib.getFiles(lib.getAbsolutePath(sourceDir)).map(imagePath => {
  return {
    absPath: imagePath,
    relPath: imagePath.replace(lib.getAbsolutePath(sourceDir), '')
  }
});

responsiveImages.forEach(resp => {
  if (!originalImages.find(orig => orig.relPath === lib.unsizedImagePath(resp.relPath))) {
    fs.unlinkSync(resp.absPath);
  }
});
