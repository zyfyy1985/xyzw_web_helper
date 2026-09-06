(function(global) {
  // Define a module-like system for internal dependencies
  var modules = {};
  var require = function(name) { return modules[name]; };

  // --------------------------------------------------------------------------
  // util.js
  // --------------------------------------------------------------------------
  modules['./util.js'] = (function() {
    var exports = {};
    
    // Simple hash function, from: http://burtleburtle.net/bob/hash/integer.html.
    // Chosen because it doesn't use multiply and achieves full avalanche.
    exports.hashU32 = function hashU32 (a) {
      a = a | 0;
      a = a + 2127912214 + (a << 12) | 0;
      a = a ^ -949894596 ^ a >>> 19;
      a = a + 374761393 + (a << 5) | 0;
      a = a + -744332180 ^ a << 9;
      a = a + -42973499 + (a << 3) | 0;
      a = a + -1252372727 ^ a >>> 16 | 0;
      return a;
    };

    // Reads a 64-bit little-endian integer from an array.
    exports.readU64 = function readU64 (b, n) {
      var x = 0;
      x |= b[n++] << 0;
      x |= b[n++] << 8;
      x |= b[n++] << 16;
      x |= b[n++] << 24;
      x |= b[n++] << 32;
      x |= b[n++] << 40;
      x |= b[n++] << 48;
      x |= b[n++] << 56;
      return x;
    };

    // Reads a 32-bit little-endian integer from an array.
    exports.readU32 = function readU32 (b, n) {
      var x = 0;
      x |= b[n++] << 0;
      x |= b[n++] << 8;
      x |= b[n++] << 16;
      x |= b[n++] << 24;
      return x;
    };

    // Writes a 32-bit little-endian integer from an array.
    exports.writeU32 = function writeU32 (b, n, x) {
      b[n++] = (x >> 0) & 0xff;
      b[n++] = (x >> 8) & 0xff;
      b[n++] = (x >> 16) & 0xff;
      b[n++] = (x >> 24) & 0xff;
    };

    // Multiplies two numbers using 32-bit integer multiplication.
    // Algorithm from Emscripten.
    exports.imul = function imul (a, b) {
      var ah = a >>> 16;
      var al = a & 65535;
      var bh = b >>> 16;
      var bl = b & 65535;

      return al * bl + (ah * bl + al * bh << 16) | 0;
    };

    return exports;
  })();

  // --------------------------------------------------------------------------
  // xxh32.js
  // --------------------------------------------------------------------------
  modules['./xxh32.js'] = (function() {
    var exports = {};
    var util = modules['./util.js'];

    // xxhash32 primes
    var prime1 = 0x9e3779b1;
    var prime2 = 0x85ebca77;
    var prime3 = 0xc2b2ae3d;
    var prime4 = 0x27d4eb2f;
    var prime5 = 0x165667b1;

    // Utility functions/primitives
    function rotl32 (x, r) {
      x = x | 0;
      r = r | 0;
      return x >>> (32 - r | 0) | x << r | 0;
    }

    function rotmul32 (h, r, m) {
      h = h | 0;
      r = r | 0;
      m = m | 0;
      return util.imul(h >>> (32 - r | 0) | h << r, m) | 0;
    }

    function shiftxor32 (h, s) {
      h = h | 0;
      s = s | 0;
      return h >>> s ^ h | 0;
    }

    // Implementation
    function xxhapply (h, src, m0, s, m1) {
      return rotmul32(util.imul(src, m0) + h, s, m1);
    }

    function xxh1 (h, src, index) {
      return rotmul32((h + util.imul(src[index], prime5)), 11, prime1);
    }

    function xxh4 (h, src, index) {
      return xxhapply(h, util.readU32(src, index), prime3, 17, prime4);
    }

    function xxh16 (h, src, index) {
      return [
        xxhapply(h[0], util.readU32(src, index + 0), prime2, 13, prime1),
        xxhapply(h[1], util.readU32(src, index + 4), prime2, 13, prime1),
        xxhapply(h[2], util.readU32(src, index + 8), prime2, 13, prime1),
        xxhapply(h[3], util.readU32(src, index + 12), prime2, 13, prime1)
      ];
    }

    function xxh32 (seed, src, index, len) {
      var h, l;
      l = len;
      if (len >= 16) {
        h = [
          seed + prime1 + prime2,
          seed + prime2,
          seed,
          seed - prime1
        ];

        while (len >= 16) {
          h = xxh16(h, src, index);
          index += 16;
          len -= 16;
        }

        h = rotl32(h[0], 1) + rotl32(h[1], 7) + rotl32(h[2], 12) + rotl32(h[3], 18) + l;
      } else {
        h = (seed + prime5 + len) >>> 0;
      }

      while (len >= 4) {
        h = xxh4(h, src, index);
        index += 4;
        len -= 4;
      }

      while (len > 0) {
        h = xxh1(h, src, index);
        index++;
        len--;
      }

      h = shiftxor32(util.imul(shiftxor32(util.imul(shiftxor32(h, 15), prime2), 13), prime3), 16);
      return h >>> 0;
    }

    exports.hash = xxh32;
    return exports;
  })();

  // --------------------------------------------------------------------------
  // lz4.js
  // --------------------------------------------------------------------------
  var lz4 = (function() {
    var exports = {};
    var xxhash = modules['./xxh32.js'];
    var util = modules['./util.js'];

    // Constants
    var minMatch = 4;
    var minLength = 13;
    var searchLimit = 5;
    var skipTrigger = 6;
    var hashSize = 1 << 16;

    var mlBits = 4;
    var mlMask = (1 << mlBits) - 1;
    var runBits = 4;
    var runMask = (1 << runBits) - 1;

    // Shared buffers
    var blockBuf = makeBuffer(5 << 20);
    var hashTable = makeHashTable();

    // Frame constants.
    var magicNum = 0x184D2204;

    // Frame descriptor flags.
    var fdContentChksum = 0x4;
    var fdContentSize = 0x8;
    var fdBlockChksum = 0x10;
    // var fdBlockIndep = 0x20;
    var fdVersion = 0x40;
    var fdVersionMask = 0xC0;

    // Block sizes.
    var bsUncompressed = 0x80000000;
    var bsDefault = 7;
    var bsShift = 4;
    var bsMask = 7;
    var bsMap = {
      4: 0x10000,
      5: 0x40000,
      6: 0x100000,
      7: 0x400000
    };

    // Utility functions/primitives
    function makeHashTable () {
      try {
        return new Uint32Array(hashSize);
      } catch (error) {
        var hashTable = new Array(hashSize);
        for (var i = 0; i < hashSize; i++) {
          hashTable[i] = 0;
        }
        return hashTable;
      }
    }

    function clearHashTable (table) {
      for (var i = 0; i < hashSize; i++) {
        hashTable[i] = 0;
      }
    }

    function makeBuffer (size) {
      try {
        return new Uint8Array(size);
      } catch (error) {
        var buf = new Array(size);
        for (var i = 0; i < size; i++) {
          buf[i] = 0;
        }
        return buf;
      }
    }

    function sliceArray (array, start, end) {
      if (typeof array.buffer !== undefined) {
        if (Uint8Array.prototype.slice) {
          return array.slice(start, end);
        } else {
          var len = array.length;
          start = start | 0;
          start = (start < 0) ? Math.max(len + start, 0) : Math.min(start, len);
          end = (end === undefined) ? len : end | 0;
          end = (end < 0) ? Math.max(len + end, 0) : Math.min(end, len);
          var arraySlice = new Uint8Array(end - start);
          for (var i = start, n = 0; i < end;) {
            arraySlice[n++] = array[i++];
          }
          return arraySlice;
        }
      } else {
        return array.slice(start, end);
      }
    }

    // Implementation
    exports.compressBound = function compressBound (n) {
      return (n + (n / 255) + 16) | 0;
    };

    exports.decompressBound = function decompressBound (src) {
      var sIndex = 0;
      if (util.readU32(src, sIndex) !== magicNum) {
        throw new Error('invalid magic number');
      }
      sIndex += 4;
      var descriptor = src[sIndex++];
      if ((descriptor & fdVersionMask) !== fdVersion) {
        throw new Error('incompatible descriptor version ' + (descriptor & fdVersionMask));
      }
      var useBlockSum = (descriptor & fdBlockChksum) !== 0;
      var useContentSize = (descriptor & fdContentSize) !== 0;
      var bsIdx = (src[sIndex++] >> bsShift) & bsMask;
      if (bsMap[bsIdx] === undefined) {
        throw new Error('invalid block size ' + bsIdx);
      }
      var maxBlockSize = bsMap[bsIdx];
      if (useContentSize) {
        return util.readU64(src, sIndex);
      }
      sIndex++;
      var maxSize = 0;
      while (true) {
        var blockSize = util.readU32(src, sIndex);
        sIndex += 4;
        if (blockSize & bsUncompressed) {
          blockSize &= ~bsUncompressed;
          maxSize += blockSize;
        } else {
          maxSize += maxBlockSize;
        }
        if (blockSize === 0) {
          return maxSize;
        }
        if (useBlockSum) {
          sIndex += 4;
        }
        sIndex += blockSize;
      }
    };

    exports.makeBuffer = makeBuffer;

    exports.decompressBlock = function decompressBlock (src, dst, sIndex, sLength, dIndex) {
      var mLength, mOffset, sEnd, n, i;
      sEnd = sIndex + sLength;
      while (sIndex < sEnd) {
        var token = src[sIndex++];
        var literalCount = (token >> 4);
        if (literalCount > 0) {
          if (literalCount === 0xf) {
            while (true) {
              literalCount += src[sIndex];
              if (src[sIndex++] !== 0xff) {
                break;
              }
            }
          }
          for (n = sIndex + literalCount; sIndex < n;) {
            dst[dIndex++] = src[sIndex++];
          }
        }
        if (sIndex >= sEnd) {
          break;
        }
        mLength = (token & 0xf);
        mOffset = src[sIndex++] | (src[sIndex++] << 8);
        if (mLength === 0xf) {
          while (true) {
            mLength += src[sIndex];
            if (src[sIndex++] !== 0xff) {
              break;
            }
          }
        }
        mLength += minMatch;
        for (i = dIndex - mOffset, n = i + mLength; i < n;) {
          dst[dIndex++] = dst[i++] | 0;
        }
      }
      return dIndex;
    };

    exports.compressBlock = function compressBlock (src, dst, sIndex, sLength, hashTable) {
      var mIndex, mAnchor, mLength, mOffset, mStep;
      var literalCount, dIndex, sEnd, n;
      dIndex = 0;
      sEnd = sLength + sIndex;
      mAnchor = sIndex;
      if (sLength >= minLength) {
        var searchMatchCount = (1 << skipTrigger) + 3;
        while (sIndex + minMatch < sEnd - searchLimit) {
          var seq = util.readU32(src, sIndex);
          var hash = util.hashU32(seq) >>> 0;
          hash = ((hash >> 16) ^ hash) >>> 0 & 0xffff;
          mIndex = hashTable[hash] - 1;
          hashTable[hash] = sIndex + 1;
          if (mIndex < 0 || ((sIndex - mIndex) >>> 16) > 0 || util.readU32(src, mIndex) !== seq) {
            mStep = searchMatchCount++ >> skipTrigger;
            sIndex += mStep;
            continue;
          }
          searchMatchCount = (1 << skipTrigger) + 3;
          literalCount = sIndex - mAnchor;
          mOffset = sIndex - mIndex;
          sIndex += minMatch;
          mIndex += minMatch;
          mLength = sIndex;
          while (sIndex < sEnd - searchLimit && src[sIndex] === src[mIndex]) {
            sIndex++;
            mIndex++;
          }
          mLength = sIndex - mLength;
          var token = mLength < mlMask ? mLength : mlMask;
          if (literalCount >= runMask) {
            dst[dIndex++] = (runMask << mlBits) + token;
            for (n = literalCount - runMask; n >= 0xff; n -= 0xff) {
              dst[dIndex++] = 0xff;
            }
            dst[dIndex++] = n;
          } else {
            dst[dIndex++] = (literalCount << mlBits) + token;
          }
          for (var i = 0; i < literalCount; i++) {
            dst[dIndex++] = src[mAnchor + i];
          }
          dst[dIndex++] = mOffset;
          dst[dIndex++] = (mOffset >> 8);
          if (mLength >= mlMask) {
            for (n = mLength - mlMask; n >= 0xff; n -= 0xff) {
              dst[dIndex++] = 0xff;
            }
            dst[dIndex++] = n;
          }
          mAnchor = sIndex;
        }
      }
      if (mAnchor === 0) {
        return 0;
      }
      literalCount = sEnd - mAnchor;
      if (literalCount >= runMask) {
        dst[dIndex++] = (runMask << mlBits);
        for (n = literalCount - runMask; n >= 0xff; n -= 0xff) {
          dst[dIndex++] = 0xff;
        }
        dst[dIndex++] = n;
      } else {
        dst[dIndex++] = (literalCount << mlBits);
      }
      sIndex = mAnchor;
      while (sIndex < sEnd) {
        dst[dIndex++] = src[sIndex++];
      }
      return dIndex;
    };

    exports.decompressFrame = function decompressFrame (src, dst) {
      var useBlockSum, useContentSum, useContentSize, descriptor;
      var sIndex = 0;
      var dIndex = 0;
      if (util.readU32(src, sIndex) !== magicNum) {
        throw new Error('invalid magic number');
      }
      sIndex += 4;
      descriptor = src[sIndex++];
      if ((descriptor & fdVersionMask) !== fdVersion) {
        throw new Error('incompatible descriptor version');
      }
      useBlockSum = (descriptor & fdBlockChksum) !== 0;
      useContentSum = (descriptor & fdContentChksum) !== 0;
      useContentSize = (descriptor & fdContentSize) !== 0;
      var bsIdx = (src[sIndex++] >> bsShift) & bsMask;
      if (bsMap[bsIdx] === undefined) {
        throw new Error('invalid block size');
      }
      if (useContentSize) {
        sIndex += 8;
      }
      sIndex++;
      while (true) {
        var compSize;
        compSize = util.readU32(src, sIndex);
        sIndex += 4;
        if (compSize === 0) {
          break;
        }
        if (useBlockSum) {
          sIndex += 4;
        }
        if ((compSize & bsUncompressed) !== 0) {
          compSize &= ~bsUncompressed;
          for (var j = 0; j < compSize; j++) {
            dst[dIndex++] = src[sIndex++];
          }
        } else {
          dIndex = exports.decompressBlock(src, dst, sIndex, compSize, dIndex);
          sIndex += compSize;
        }
      }
      if (useContentSum) {
        sIndex += 4;
      }
      return dIndex;
    };

    exports.compressFrame = function compressFrame (src, dst) {
      var dIndex = 0;
      util.writeU32(dst, dIndex, magicNum);
      dIndex += 4;
      dst[dIndex++] = fdVersion;
      dst[dIndex++] = bsDefault << bsShift;
      dst[dIndex] = xxhash.hash(0, dst, 4, dIndex - 4) >> 8;
      dIndex++;
      var maxBlockSize = bsMap[bsDefault];
      var remaining = src.length;
      var sIndex = 0;
      clearHashTable(hashTable);
      while (remaining > 0) {
        var compSize = 0;
        var blockSize = remaining > maxBlockSize ? maxBlockSize : remaining;
        compSize = exports.compressBlock(src, blockBuf, sIndex, blockSize, hashTable);
        if (compSize > blockSize || compSize === 0) {
          util.writeU32(dst, dIndex, 0x80000000 | blockSize);
          dIndex += 4;
          for (var z = sIndex + blockSize; sIndex < z;) {
            dst[dIndex++] = src[sIndex++];
          }
          remaining -= blockSize;
        } else {
          util.writeU32(dst, dIndex, compSize);
          dIndex += 4;
          for (var j = 0; j < compSize;) {
            dst[dIndex++] = blockBuf[j++];
          }
          sIndex += blockSize;
          remaining -= blockSize;
        }
      }
      util.writeU32(dst, dIndex, 0);
      dIndex += 4;
      return dIndex;
    };

    exports.decompress = function decompress (src, maxSize) {
      var dst, size;
      if (maxSize === undefined) {
        maxSize = exports.decompressBound(src);
      }
      dst = exports.makeBuffer(maxSize);
      size = exports.decompressFrame(src, dst);
      if (size !== maxSize) {
        dst = sliceArray(dst, 0, size);
      }
      return dst;
    };

    exports.compress = function compress (src, maxSize) {
      var dst, size;
      if (maxSize === undefined) {
        maxSize = exports.compressBound(src.length);
      }
      dst = exports.makeBuffer(maxSize);
      size = exports.compressFrame(src, dst);
      if (size !== maxSize) {
        dst = sliceArray(dst, 0, size);
      }
      return dst;
    };

    return exports;
  })();

  global.lz4js = lz4;
})(this);
