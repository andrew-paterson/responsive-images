const imageSize = require('image-size');
const path = require('path');
const lib = require('./lib');
const fs = require('fs');
const isImage = require('is-image');
const chalk = require('chalk');

module.exports = function(settings) {
  const originalImagesDir = settings.src;
  const responsiveImagesDir = settings.dest;
  const absOriginalImagesDir = path.resolve(process.cwd(), originalImagesDir);
  const absResponsiveImagesDir = path.resolve(process.cwd(), responsiveImagesDir);
  const responsiveImageFilePaths = lib.getFiles(lib.getAbsolutePath(responsiveImagesDir));

  const manifest = lib.getFiles(lib.getAbsolutePath(originalImagesDir))
    .filter(filePath => isImage(filePath))
    .filter(filePath => {
      try {
        imageSize(filePath);
        return true;
      } catch (err) {
        return false;
      }
    }).map(srcFilePath => {
      return {
        original: srcFilePath.replace(process.cwd(), ''),
        clones: responsiveImageFilePaths.filter(responsiveImageFilePath => {
          const responsiveImageCommonPath = lib.removeExt(responsiveImageFilePath).replace(absResponsiveImagesDir, '').replace(/-\d{1,4}w$/, '');
          return responsiveImageCommonPath === lib.removeExt(srcFilePath).replace(absOriginalImagesDir, '');
        }).map(item => {
          const clonePath = item.replace(process.cwd(), '');
          return {
            clonePath: clonePath,
            cloneSize: lib.removeExt(clonePath).split('-')[lib.removeExt(clonePath).split('-').length - 1]
          };
        })
      };
    });
  if (settings.manifestPath) {
    fs.writeFileSync(settings.manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
    console.log(chalk.green(`Created manifest file at ${settings.manifestPath}`));
  }
};
