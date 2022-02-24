const sharp = require('sharp');
const imageSize = require('image-size');
const path = require('path');
const lib = require('./lib');
const fs = require('fs');
const isImage = require('is-image');
const  uniqBy = require('lodash.uniqby');
const chalk = require('chalk');
const generateImages = require('./generate-images');

module.exports = {
  generateImages(settings) {
    return generateImages(settings);
  },
  createManifest(settings) {
    const sourceDir = settings.src;
    const outputDir = settings.dest;
    const absSourceDir = path.resolve(process.cwd(), sourceDir);
    const absOutputDir = path.resolve(process.cwd(), outputDir);
    const outputFiles = lib.getFiles(lib.getAbsolutePath(outputDir));

    const manifest = lib.getFiles(lib.getAbsolutePath(sourceDir))
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
          clones: outputFiles.filter(outputFile => {
            return lib.removeExt(outputFile).replace(absOutputDir, '').startsWith(lib.removeExt(srcFilePath).replace(absSourceDir, ''));
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
  }
};

