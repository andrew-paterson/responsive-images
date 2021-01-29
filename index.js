const sharp = require('sharp');
const imageSize = require('image-size');
const path = require('path');
const lib = require('./lib');
const sourceDir = './input';
const outputDir = './output';
const fs = require('fs');
var files = lib.getFiles(lib.getAbsolutePath(sourceDir));

var sizeDefinitions = [{maxWidth: 400, maxHeight: 300}, {maxWidth: 50000, maxHeight: 40000}, {maxWidth: 4000, maxHeight: 3000}, {maxWidth: 20000, maxHeight: 3000}];

lib.getFiles(lib.getAbsolutePath(sourceDir)).forEach(input => { 
  var uniqPath = input.replace(lib.getAbsolutePath(sourceDir), '');
  var fileOutputDir = `${lib.getAbsolutePath(outputDir)}${path.dirname(uniqPath)}`;
  lib.mkdirP(fileOutputDir);
  var uniqPathNoExt = lib.trimFromEnd(uniqPath, path.extname(uniqPath));
  sizeDefinitions.forEach(max => {
    var outputSize = outputWidth(input, max);
    var filename = `${path.basename(uniqPathNoExt)}-${outputSize.width}w${path.extname(uniqPath)}`;
    var outPath = `${fileOutputDir}/${filename}`;
    if (lib.fileIsNewer(input, outPath)) {
      sharp(input)
      .rotate()
      .resize(max.maxWidth, max.maxHeight, {fit: 'inside', withoutEnlargement: true})
      .toFile(outPath)
      .then( data => { console.log(outPath) })
      .catch( err => { console.log(err) });
    } else {
      console.log('exists');
    }
    
  });
});

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
