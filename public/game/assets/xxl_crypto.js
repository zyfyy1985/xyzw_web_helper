/**
 * XXL Encryption/Decryption Library (JS Version)
 * Ported from internal/crypto/crypto.go
 * 
 * Dependencies:
 * This library requires an LZ4 implementation (lz4js) to work.
 * Please ensure lz4js is loaded before using this library.
 * Recommended: https://github.com/pierrec/lz4js
 */

(function(global) {
    var XXL = global.XXL || {};

    // Helper: min function
    function min(a, b) {
        return a < b ? a : b;
    }

    /**
     * Encrypt data using LX algorithm
     * @param {Uint8Array} data - The raw data to encrypt
     * @returns {Uint8Array} - The encrypted data
     */
    XXL.encryptLX = function(data) {
        if (!data || data.length === 0) {
            return new Uint8Array(0);
        }

        // 1. Compress using LZ4
        // Expecting lz4js to be available globally
        var compressed;
        if (global.lz4js && global.lz4js.compress) {
            try {
                compressed = global.lz4js.compress(data);
            } catch (e) {
                console.error("[XXL] LZ4 compression failed:", e);
                return data;
            }
        } else {
            console.error("[XXL] lz4js library not found! Cannot compress.");
            console.warn("Please load lz4js: https://github.com/pierrec/lz4js");
            return data;
        }

        // Ensure Uint8Array
        if (!(compressed instanceof Uint8Array)) {
            compressed = new Uint8Array(compressed);
        }

        // 2. Generate random key (2-250)
        var key = 2 + Math.floor(Math.random() * 248);

        // 3. XOR first 100 bytes
        var n = min(compressed.length, 100);
        for (var i = 0; i < n; i++) {
            compressed[i] ^= key;
        }

        // 4. Set header with embedded key
        if (compressed.length >= 4) {
            // Set 'pl' marker
            compressed[0] = 112; // 'p'
            compressed[1] = 108; // 'l'

            // Embed key into bytes 2 and 3
            // Go: compressed[2] = 170&compressed[2] | (key>>7&1)<<6 | (key>>6&1)<<4 | (key>>5&1)<<2 | (key>>4&1)<<0
            var c2 = compressed[2];
            compressed[2] = (170 & c2) | 
                            ((key >> 7 & 1) << 6) | 
                            ((key >> 6 & 1) << 4) | 
                            ((key >> 5 & 1) << 2) | 
                            ((key >> 4 & 1) << 0);

            // Go: compressed[3] = 170&compressed[3] | (key>>3&1)<<6 | (key>>2&1)<<4 | (key>>1&1)<<2 | (key>>0&1)<<0
            var c3 = compressed[3];
            compressed[3] = (170 & c3) | 
                            ((key >> 3 & 1) << 6) | 
                            ((key >> 2 & 1) << 4) | 
                            ((key >> 1 & 1) << 2) | 
                            ((key >> 0 & 1) << 0);
        }

        return compressed;
    };

    /**
     * Decrypt data using LX algorithm
     * @param {Uint8Array} data - The encrypted data
     * @returns {Uint8Array} - The decrypted data
     */
    XXL.decryptLX = function(data) {
        if (!data || data.length < 4) {
            return data;
        }

        // Clone data to avoid modifying original source
        var buf = new Uint8Array(data);

        // 1. Extract key from header
        // Go: key := ((data[2] >> 6 & 1) << 7) | ...
        var key = ((buf[2] >> 6 & 1) << 7) |
                  ((buf[2] >> 4 & 1) << 6) |
                  ((buf[2] >> 2 & 1) << 5) |
                  ((buf[2] >> 0 & 1) << 4) |
                  ((buf[3] >> 6 & 1) << 3) |
                  ((buf[3] >> 4 & 1) << 2) |
                  ((buf[3] >> 2 & 1) << 1) |
                  ((buf[3] >> 0 & 1) << 0);

        // 2. XOR first 100 bytes (starting from index 2)
        // Note: EncryptLX XORs 0..n, but overwrites 0 and 1.
        // DecryptLX XORs 2..n.
        var n = min(buf.length, 100);
        for (var i = 2; i < n; i++) {
            buf[i] ^= key;
        }

        // 3. Restore standard LZ4 header
        // 04 22 4D 18
        buf[0] = 4;
        buf[1] = 34;
        buf[2] = 77;
        buf[3] = 24;

        // 4. Decompress using LZ4
        if (global.lz4js && global.lz4js.decompress) {
            try {
                return global.lz4js.decompress(buf);
            } catch (e) {
                console.error("[XXL] LZ4 decompression failed:", e);
                return null;
            }
        } else {
            console.error("[XXL] lz4js library not found! Cannot decompress.");
            console.warn("Please load lz4js: https://github.com/pierrec/lz4js");
            return buf;
        }
    };

    global.XXL = XXL;
    console.log("[XXL] Crypto library loaded. Methods: encryptLX, decryptLX");

})(window);
