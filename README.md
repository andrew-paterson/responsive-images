## Overview

Given a `src` directory of images, the script creates a clone of the directory and its contained images at the provided `dest` path, but with multiple sizes of each image, based on the sizes specified in the settings. 

## Features

* Appends the output width to the end of each filename. For example `image.jpg` becomes `image-600w.jpg`.
* Images will never be upscaled. If the image is smaller than the dimensions provided, it will remain at that size.
* With each responsive image generated, the aspect ratio will be maintained, and the image will be resized so that both the height and width are less than or equal to the relevant size setting.
* Orphaned files and directories in the responsive image directory are deleted.
* The original version of the image is resized so that it fits into the dimensions with the biggest `maxWidth` value.

## Installation

`npm install git+ssh://git@github.com/andrew-paterson/responsive-images.git`

## Usage

    const responsiveImages = require('responsive-images');
    responsiveImages(settings);

## Settings

* `src` - the path to the source directory of images.
* `dest` - the path to the output directory of the generated images.
* `sizes` - an array of maxWidth and maxHeight combintations.
``` 
{
  "src": "./input",
  "dest": "./output",
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