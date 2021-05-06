# TODO

* Directory specific sizing
* Ability to process images in batches.
* Better console feedback
* Exit node correctly when complete
* Option to save originals in a location
# DONE

* Allow settings from file
* Skip if output file exists and is newer.
* Delete orphaned files
* Leaves image as original size where image is smaller than the size given, names it with the actual width.
* Resize original
* Pruning orphaned files must know if the sizes settings have changed.
  * Start with array of all files
  * Create array of all files to be created.
  * Compare and delete that way.
* Resize original images fit in the set of dimensions with the biggest `maxwidth` value.
* Skip resizing of original if it is already the appropriate size- ie both width and height are <= maxWidth and maxHeight
* Ignore non images.
* Retain metadata
