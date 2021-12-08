## Overview

Given a `src` directory of images, the script creates a clone of the directory and its contained images at the provided `dest` path, but with multiple sizes of each image, based on the sizes specified in the settings. 

## Features

* Can dynamically adjust the JPEG compression quality of each set of generated images so that they conform closely to a specified file size.
* Appends the output width to the end of each filename. For example `image.jpg` becomes `image-600w.jpg`.
* Images will never be up-scaled. If the image is smaller than some of  the dimensions provided, only sizes of the image equal to or smaller than the original will be generated.
* With each responsive image generated, the aspect ratio will be maintained, and the image will be resized so that both the height and width are less than or equal to the relevant size setting.
* Files and directories in the `dest` directory are deleted if the corresponding files or directories no longer exist int he `src` directory.
* If the `resizeOriginal` option is `true`, the original version of the image will be overwritten by the biggest responsive version of the image generated.

## Installation

`npm install responsive-image-directory`

## Usage

    const responsiveImages = require('responsive-images');
    responsiveImages(settings);

## Settings

## `src`

**required** - the path to the source directory of images.
## `dest`

**required** - the path to the output directory of the generated images.
## `sizes`

**required** - an array of `maxWidth` and `maxHeight` combinations. Responsive versions of each image will be generated based on these values.

* Images will never be up-scaled. If the image is smaller than some of  the dimensions provided, only sizes of the image equal to or smaller than the original will be generated.
* With each responsive image generated, the aspect ratio will be maintained, and the image will be resized so that both the height and width are less than or equal to the relevant size setting.
## `logPath`

**optional** - path to a file to save the verbose log of image operations to.
## `resizeOriginal`

**optional** - if `true`, the original image from the `src` directory will be overwritten with the largest responsive version of the image in the `dest` directory.
## `skipExisting`

**optional; default === true** - if `true`, existing responsive images in the `dest` directory which are newer than the original image in the `src` directory will not be regenerated.
## `batchSize`

**optional; default === 10** - the number of images from the `src` directory to process at a time. 

## `maxQuality`

**optional; default === 90** - the maximum allowed quality setting for JPEG compression. If `dynamicQualityParams` (See below) is not passed, then the quality setting for JPEG compression will be fixed to this value for all images.

## `minQuality`

**optional; default === 1** - the minimum allowed quality setting for JPEG compression.
## `dynamicQualityParams`

**optional** - an object that must contain `width`, `height` and `maxBytes`. 

Allows the quality of each set of responsive images to be adjusted on the fly, such that the file sizes of the responsive images to conform closely to the params in `dynamicQualityParams`.

### `dynamicQualitySetting` example

**Options**

      ...

      "dynamicQualityParams": {
        "width": 1440,
        "height": 1080,
        "maxBytes": 204800
      }
      "maxQuality": 90,
      "minQuality": 10,
      "sizes": [{
        "maxWidth": 400,
        "maxHeight": 300
      }, {
        "maxWidth": 800,
        "maxHeight": 600
      }, {
        "maxWidth": 1600,
        "maxHeight": 1200
      }]

      ...

Assume you have one large image in the `src` directory with dimensions of `4000px x 2000px`. Based on the `sizes` setting above, three responsive versions of the image would be generated in the `dest` directory with the following dimensions:

* `1600px X 800px`
* `800px x 400px`
* `400px x 200px`

First, the quality of the largest image in the set will be determined as follows.

* The `dynamicQualityParams` setting tells us that a `1440px` x `1080px` image has a `maxBytes` setting of `204800 bytes`.
* Based on this, a `1600px` x `800px` image has a proportional `maxBytes` setting of `168559` bytes. 
    * ***Note that if the original image has a smaller file size than this, then `maxBytes` will be set to the file size of the original image.***
* The script will then generate `1600px x 800px` image at the `maxQuality` setting, and if the resulting image is bigger than `168559` bytes, it will reduce the quality and try again, repeating this process until the resulting image is just below `168559` bytes.
    * ***Note that the image will never be reduced to below the `minQuality` setting, even if the resulting image is bigger than `maxBytes`.***

The final `quality` value above is then used to generate each other image in the set. 

Assuming the final `quality` setting of the largest image was `75`, then the `800px x 400px` image and `400px x 200px` will each be generated with a quality setting of `75`.

## Example options

``` 
{
  "src": "./input",
  "dest": "./output",
  "logPath": "./image-log.json",
  "resizeOriginal": true,
  "skipExisting": true,
  "batchSize": 20,
  "dynamicQualityParams": {
    "width": 1440,
    "height": 1080,
    "maxBytes": 204800
  },
  "maxQuality": 90,
  "minQuality: 10,
  "sizes": [
    {
      "maxWidth": 400,
      "maxHeight": 300
    },
    {
      "maxWidth": 50000,
      "maxHeight": 40000
    },
    {
      "maxWidth": 4000,
      "maxHeight": 3000
    },
    {
      "maxWidth": 20000,
      "maxHeight": 3000
    }
  ]
}
```