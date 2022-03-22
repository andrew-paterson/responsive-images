var fs = require('fs');
var path = require('path');
// var copydir = require('copy-dir');
var mkdirp = require('mkdirp');
var nodeUrl = require('url');
// var YAML = require('json2yaml');
// var tomlify = require('tomlify-j0.4');

module.exports = {

  removeExt(filePath) { // In node utils
    return path.join(path.dirname(filePath), path.basename(filePath, path.extname(filePath)));
  },
  logJSToFile(outPut, filePath = 'log.json') {
    if (!outPut) { return; }
    fs.writeFile(filePath, JSON.stringify(outPut, null, 2), function (err) {
      if (err) {
        console.log(err);
        return err;
      }
      return `Success! ${filePath} was saved`;
    });
  },

  uniq(array) {
    return array.filter((item, i, ar) => {
      return ar.indexOf(item) === i;
    });
  },

  removeTrailingSlash(str) {
    if (str.charAt(str.length - 1) === '/') {
      return str.substring(0, str.length - 1);
    }
    return str;
  },

  removeLeadingSlash(str) {
    if (str.charAt(0) === '/') {
      return str.substring(1);
    }
    return str;
  },

  removeLeadingandTrailingSlash(str) {
    str = this.removeLeadingSlash(str);
    str = this.removeTrailingSlash(str);
    return str;
  },

  combinePaths(array) {
    return array.filter(item => {
      return item;
    }).map(item => {
      item = this.removeLeadingSlash(item);
      item = this.removeTrailingSlash(item);
      return item;
    }).join('/');
  },

  getFiles(dir, recursive = true, acc = []) {
    try {
      const files = fs.readdirSync(dir);
      for (const i in files) {
        const name = [dir, files[i]].join('/')
        if (fs.statSync(name).isDirectory()) {
          if (recursive) {
            this.getFiles(name, recursive, acc)
          }
        } else {
          acc.push(name)
        }
      }
      return acc
    } catch (e) {
      return acc
    }
  },

  getDirs(dir, recursive = true, acc = []) {
    try {
      const files = fs.readdirSync(dir)
      for (const i in files) {
        const name = [dir, files[i]].join('/')
        if (fs.statSync(name).isDirectory()) {
          acc.push(name)
          if (recursive) {
            this.getDirs(name, recursive, acc)
          }
        } 
      }
      return acc
    } catch (e) {
      return acc
    }
  },

  uniqFilter(value, index, self) {
    return self.indexOf(value) === index;
  },

  renameFilesAfterParentDir(sourceDir, opts = {}) {
    var subDirs = [sourceDir].concat(this.getDirs(sourceDir));
    subDirs.forEach(subDir => {
      var dirFiles = this.getFiles(subDir, false);
      var maxIndexDigits = dirFiles.length.toString().length;
      opts.minIndexDigits = opts.minIndexDigits || 0;
      var indexDigits = opts.minIndexDigits > maxIndexDigits ? opts.minIndexDigits : maxIndexDigits;
      dirFiles.forEach((orig, index) => {
        var numberStr = (index + 1).toString().padStart(indexDigits, "0"); // Add zeroes to the beginning of the nmber, so that each file's number has the same number of digits.
        var dest = `${subDir}/${path.basename(subDir)}-${numberStr}${path.extname(orig)}`;
        fs.renameSync(orig, dest);
      });
    });
    console.log('Renamed files after parent dir.')
  },

  cleanEmptyFoldersRecursively(folder) {
    var isDir = fs.statSync(folder).isDirectory();
    if (!isDir) {
      return;
    }
    var files = fs.readdirSync(folder);
    if (files.length > 0) {
      files.forEach(file => {
        var fullPath = path.join(folder, file);
        this.cleanEmptyFoldersRecursively(fullPath);
      });
      files = fs.readdirSync(folder);
    }

    if (files.length == 0) {
      fs.rmdirSync(folder);
      // console.log("removing: ", folder);
      return;
    }
  },

  deleteFolderRecursively(directoryPath) {
    if (fs.existsSync(directoryPath)) {
      fs.readdirSync(directoryPath).forEach((file, index) => {
        const curPath = path.join(directoryPath, file);
        if (fs.lstatSync(curPath).isDirectory()) {
          // recurse
          this.deleteFolderRecursively(curPath);
        } else {
          // delete file
          fs.unlinkSync(curPath);
        }
      });
      fs.rmdirSync(directoryPath);
    }
  },

  escapeRegExp(text) {
    return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
  },

  // flattenDirectory(dir, opts = {}) {
  //   if (opts.copyDir) {
  //     var copyResult = this.copyDirectory(dir, opts.copyDir.outputPath, opts.copyDir.copySyncOpts);
  //     dir = copyResult.to;
  //   }
  //   const rootdir = dir ? path.resolve(process.cwd(), dir) : process.cwd();
  //   this.getFiles(rootdir).forEach(orig => {
  //     var rootDirParts = rootdir.split(path.sep);
  //     var baseDir = orig.split(path.sep).slice(0, rootDirParts.length + (opts.depth || 0)).join(path.sep);
  //     const destFileName = orig.slice(baseDir.length).split(path.sep).filter(Boolean).join("-").split(" ").join("-");
  //     const dest = path.resolve(baseDir, destFileName);
  //     fs.renameSync(orig, dest);
  //   });
  //   this.cleanEmptyFoldersRecursively(rootdir);
  //   return `Flattened ${rootdir}`;
  // },

  // copyDirectory(source, dest, options={}) {
  //   const rootSource = source ? path.resolve(process.cwd(), source) : process.cwd();
  //   const rootDest = dest ? path.resolve(process.cwd(), dest) : process.cwd();
  //   copydir.sync(rootSource, rootDest, options);
  //   return {
  //     from: rootSource,
  //     to: rootDest
  //   }
  // },

  getAbsolutePath(inputPath) {
    return inputPath ? path.resolve(process.cwd(), inputPath) : process.cwd()
  },

  parsedFilePath(filePath, opts = {}) {
    filePath = filePath.trim();
      if (opts.downcase) {
        filePath = filePath.toLowerCase();
      }
      opts.customReplacements.forEach(replacement => {
        replacement.find.forEach(find => {
          var findRegex = new RegExp(find, replacement.flags);
          filePath = filePath.replace(findRegex, replacement.replace);
        });
      });
      if (opts.strict) {
        filePath = filePath.replace(/[^a-zA-Z0-9\-_./]/g, '-');
      }
      return filePath.replace(/ /g, '-').replace(/-+/g, '-');
  },

  parseFilePaths(sourceDir, opts = {}) {
    var absSourceDirPath = this.getAbsolutePath(sourceDir);
    var objectPaths;
    if (opts.excludeFiles) {
      objectPaths = this.getDirs(absSourceDirPath);
    } else if (opts.excludeDirs) {
      objectPaths = this.getFiles(absSourceDirPath);
    } else {
      objectPaths = this.getFiles(absSourceDirPath).concat(this.getDirs(absSourceDirPath));
    }
    objectPaths.forEach(filePath => {
      if (opts.preserveDirname) {
        fs.renameSync(filePath, `${path.dirname(filePath)}/${this.parsedFilePath(path.basename(filePath))}`);
      } else {
        var parsedSection = this.parsedFilePath(filePath.replace(absSourceDirPath, ''));  
        fs.renameSync(filePath, `${absSourceDirPath}${parsedSection}`);

      }
    });
    console.log('Parsed filenames')
    return;
  },

  capitalizeFirstLetter(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
  },

  createMDFile: function(object, fileOutPutPath, frontMatterFormat) {
    var frontMatter = object.frontMatter || {};
    var content = object.content || {};
    return new Promise((resolve, reject) => { 
      var frontMatterDelimiter;
      if (frontMatterFormat === 'toml') {
        frontMatterDelimiter = '+++';
      } else if (frontMatterFormat ==='yml' || frontMatterFormat ==='yaml') {
        frontMatterDelimiter = '---';
      }
      var final = '';
      if (frontMatterFormat === 'toml') {
        // Only for toml, because JSON doesn't have delimiters and with yml, the YAML dep adds the first delimiter for you.
        final += `${frontMatterDelimiter}\n`;
      }
      if (frontMatterFormat === 'toml') {
        final += tomlify.toToml(frontMatter, {space: 2});
      } else if (frontMatterFormat ==='yml' || frontMatterFormat ==='yaml') {
        final += YAML.stringify(frontMatter);
      } else {
        if (frontMatterFormat !=='json') {
          console.log(chalk.red(`${frontMatterFormat} is not a valid output format. Use 'toml', 'yml', 'yaml' ot 'json'. JSON has been used as the default.`));
        }
        final += JSON.stringify(frontMatter, null, 2);
      }
      if (frontMatterFormat === 'toml') {
        final += `\n${frontMatterDelimiter}\n\n`;
      } else if (frontMatterFormat ==='yml' || frontMatterFormat ==='yaml') {
        final += `${frontMatterDelimiter}\n\n`;
      } else {
        // When the frontMatter format is JSON, just add an empty line between the front matter and the content.
        final += '\n\n';
      }
      
      if (content.intro_text) {
        final += `${content.intro_text} \n`;
      }
      if (content.intro_text && content.full_text) {
        final += '<!--more-->\n';
      }
      if (content.full_text) {
        final += (content.full_text).replace(content.intro_text, '').trim();
      }
      var directoryOutPutPath = path.dirname(fileOutPutPath);
      this.mkdirP(directoryOutPutPath);
      var filepath = fileOutPutPath;
      fs.writeFile(filepath, final, function(err) {
        if(err) {
          reject(err);
        }
        resolve(`Succes! ${filepath} was saved!`);
      });
    });
  },

  fileOutputPathfromUrl: function(url, outputDirectory) {
    var directory = outputDirectory || "output";
    var fullPath = nodeUrl.parse(url).path;
    return this.parseUrl(`${directory}/${fullPath}.md`);
  },

  mkdirP: function(dirPath) {
    mkdirp.sync(dirPath);
  },

  parseUrl: function(string) {
    return string.replace(/\/\/+/g, '/').replace(/\s+/g, '-');
  },

  trimFromEnd(string, trim = '') {
    if (!string) { return; }
    string = string.slice(0, -1*trim.length)
    return string;
  },

  unsizedImagePath(imagePath) {
    var imagePathParts = imagePath.split('-');
    var lastPart = imagePathParts[imagePathParts.length-1].replace(/\d{1,}w./, '.');
    return `${imagePathParts.slice(0, -1).join('-')}${lastPart}`;
  },

  fileIsNewer(opts) {
    if (!fs.existsSync(opts.destPath)) {
      return true;
    }
    if (!fs.existsSync(opts.srcPath)) {
      return;
    }
    const srcMtime = opts.srcMtime || fs.statSync(opts.srcPath).mtime;
  
    return srcMtime > fs.statSync(opts.destPath).mtime;
  },

  conditionalSlash(string, position) {
    return (position === 'end' && string.endsWith('/')) || (position === 'start' && string.startsWith('/')) ? '' : '/';
  },

  timeConversion(duration) {
    if (duration < 1000) {
      return `${Math.round(parseFloat(duration/1000) * 100) / 100}s`;
    }
    const portions = [];
  
    const msInHour = 1000 * 60 * 60;
    const hours = Math.trunc(duration / msInHour);
    if (hours > 0) {
      portions.push(hours + 'h');
      duration = duration - (hours * msInHour);
    }
  
    const msInMinute = 1000 * 60;
    const minutes = Math.trunc(duration / msInMinute);
    if (minutes > 0) {
      portions.push(minutes + 'm');
      duration = duration - (minutes * msInMinute);
    }
  
    const seconds = Math.trunc(duration / 1000);
    if (seconds > 0) {
      portions.push(seconds + 's');
    }
  
    return portions.join(' ');
  }
};