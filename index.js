const generateImages = require('./generate-images');
const generateManifest = require('./generate-manifest');

module.exports = {
  generateImages(settings) {
    return generateImages(settings);
  },
  generateManifest(settings) {
    return generateManifest(settings);
  },
};
