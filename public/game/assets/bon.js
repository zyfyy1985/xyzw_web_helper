(function(global) {
    // BON Decoder (Binary Object Notation?)
    // Ported from internal/crypto/bon/decoder.go

    function DataReader(data) {
        this.data = new Uint8Array(data);
        this.view = new DataView(this.data.buffer, this.data.byteOffset, this.data.byteLength);
        this.position = 0;
    }

    DataReader.prototype.validate = function(size) {
        return (this.position + size <= this.data.length);
    };

    DataReader.prototype.readUInt8 = function() {
        if (!this.validate(1)) throw new Error("read eof");
        return this.data[this.position++];
    };

    DataReader.prototype.readInt32 = function() {
        if (!this.validate(4)) throw new Error("read eof");
        // Go implementation uses manual Little Endian shifting
        var val = this.view.getInt32(this.position, true); // true = Little Endian
        this.position += 4;
        return val;
    };

    DataReader.prototype.readInt64 = function() {
        // Go: ReadInt32() (low), ReadInt32() (high)
        var low = this.readInt32();
        var high = this.readInt32();
        
        // JS uses 53-bit safe integers for Number.
        // For full 64-bit support, use BigInt.
        var lowBig = BigInt(low >>> 0); // Treat as unsigned for combination
        var highBig = BigInt(high >>> 0);
        var val = lowBig + (highBig * 4294967296n);
        
        // Convert to Number if safe, otherwise return BigInt
        if (val <= Number.MAX_SAFE_INTEGER && val >= Number.MIN_SAFE_INTEGER) {
            return Number(val);
        }
        return val;
    };

    DataReader.prototype.readFloat32 = function() {
        if (!this.validate(4)) throw new Error("read eof");
        var val = this.view.getFloat32(this.position, true); // Little Endian
        this.position += 4;
        return val;
    };

    DataReader.prototype.readFloat64 = function() {
        if (!this.validate(8)) throw new Error("read eof");
        var val = this.view.getFloat64(this.position, true); // Little Endian
        this.position += 8;
        return val;
    };

    DataReader.prototype.read7BitInt = function() {
        var result = 0;
        var shift = 0;
        while (true) {
            if (shift >= 35) throw new Error("Format_Bad7BitInt32");
            var b = this.readUInt8();
            result |= (b & 0x7F) << shift;
            shift += 7;
            if ((b & 0x80) === 0) break;
        }
        return result;
    };

    DataReader.prototype.readUTF = function() {
        var length = this.read7BitInt();
        if (length === 0) return "";
        if (!this.validate(length)) throw new Error("read eof");
        
        var bytes = this.data.subarray(this.position, this.position + length);
        this.position += length;
        
        // TextDecoder is available in modern browsers and Node.js
        return new TextDecoder("utf-8").decode(bytes);
    };

    DataReader.prototype.readUint8Array = function(length) {
        if (!this.validate(length)) throw new Error("read eof");
        var result = new Uint8Array(this.data.subarray(this.position, this.position + length));
        this.position += length;
        return result;
    };

    function BonDecoder(data) {
        this.dr = new DataReader(data);
        this.strArr = [];
    }

    BonDecoder.prototype.decode = function() {
        var typeCode = this.dr.readUInt8();
        switch (typeCode) {
            case 0: // Null
                return null;
            case 1: // Int
                return this.dr.readInt32();
            case 2: // Long
                return this.dr.readInt64();
            case 3: // Float
                return this.dr.readFloat32();
            case 4: // Double
                return this.dr.readFloat64();
            case 5: // String
                var str = this.dr.readUTF();
                this.strArr.push(str);
                return str;
            case 6: // Boolean
                return this.dr.readUInt8() === 1;
            case 7: // Binary
                var len = this.dr.read7BitInt();
                return this.dr.readUint8Array(len);
            case 8: // Object/Map
                var count = this.dr.read7BitInt();
                var result = {};
                for (var i = 0; i < count; i++) {
                    var key = this.decode();
                    var value = this.decode();
                    // Ensure key is string
                    result[String(key)] = value;
                }
                return result;
            case 9: // Array
                var len = this.dr.read7BitInt();
                var arr = [];
                for (var i = 0; i < len; i++) {
                    arr.push(this.decode());
                }
                return arr;
            case 10: // DateTime
                var timestamp = this.dr.readInt64();
                // Timestamp is in milliseconds (Unix(0, timestamp * Millisecond))
                // Go's time.Unix takes seconds, nanoseconds.
                // Go implementation: time.Unix(0, timestamp*int64(time.Millisecond))
                // This means timestamp IS milliseconds.
                // Handle BigInt
                if (typeof timestamp === 'bigint') {
                    return new Date(Number(timestamp));
                }
                return new Date(timestamp);
            case 99: // String reference
                var index = this.dr.read7BitInt();
                if (index < 0 || index >= this.strArr.length) return "";
                return this.strArr[index];
            default:
                return null;
        }
    };

    var BON = {};
    BON.decode = function(data) {
        if (!data || data.length === 0) return null;
        var decoder = new BonDecoder(data);
        return decoder.decode();
    };

    // --- BON Encoder Implementation ---

    function DataWriter() {
        this.data = new Uint8Array(524288); // Initial size from Go code
        this.position = 0;
        this.view = new DataView(this.data.buffer);
    }

    DataWriter.prototype.ensureBuffer = function(size) {
        if (this.position + size > this.data.length) {
            var newSize = Math.floor(this.data.length * 1.2);
            if (newSize < this.position + size) {
                newSize = this.position + size;
            }
            var newData = new Uint8Array(newSize);
            newData.set(this.data);
            this.data = newData;
            this.view = new DataView(this.data.buffer);
        }
    };

    DataWriter.prototype.writeInt8 = function(val) {
        this.ensureBuffer(1);
        this.view.setInt8(this.position, val);
        this.position += 1;
    };

    DataWriter.prototype.writeInt32 = function(val) {
        this.ensureBuffer(4);
        this.view.setInt32(this.position, val, true); // Little Endian
        this.position += 4;
    };

    DataWriter.prototype.writeInt64 = function(val) {
        // Handle BigInt or Number
        var v = BigInt(val);
        var low = Number(v & 0xFFFFFFFFn);
        var high = Number(v >> 32n);
        
        // Go logic:
        // w.WriteInt32(int(val)) // low
        // if val < 0 { w.WriteInt32(^int(val / 4294967296)) } else { w.WriteInt32(int(val / 4294967296)) }
        // The Go logic for high bits looks a bit specific (handling negative division)
        // But essentially it writes low 32 bits then high 32 bits.
        
        this.writeInt32(low);
        this.writeInt32(high);
    };

    DataWriter.prototype.writeFloat32 = function(val) {
        this.ensureBuffer(4);
        this.view.setFloat32(this.position, val, true); // Little Endian
        this.position += 4;
    };

    DataWriter.prototype.writeFloat64 = function(val) {
        this.ensureBuffer(8);
        this.view.setFloat64(this.position, val, true); // Little Endian
        this.position += 8;
    };

    DataWriter.prototype.write7BitInt = function(val) {
        this.ensureBuffer(5);
        // Ensure unsigned for bitwise ops
        var v = val >>> 0; 
        while (v >= 128) {
            this.data[this.position++] = (v | 0x80);
            v >>>= 7;
        }
        this.data[this.position++] = v;
    };

    DataWriter.prototype.writeUTF = function(val) {
        if (!val || val.length === 0) {
            this.write7BitInt(0);
            return;
        }

        var encoder = new TextEncoder(); // UTF-8 encoder
        var bytes = encoder.encode(val);
        
        this.write7BitInt(bytes.length);
        this.ensureBuffer(bytes.length);
        this.data.set(bytes, this.position);
        this.position += bytes.length;
    };

    DataWriter.prototype.writeUint8Array = function(arr) {
        this.ensureBuffer(5 + arr.length);
        this.write7BitInt(arr.length); // 7: Binary -> writes length then bytes
        this.data.set(arr, this.position);
        this.position += arr.length;
    };

    DataWriter.prototype.getBytes = function() {
        return this.data.subarray(0, this.position);
    };

    function BonEncoder() {
        this.dw = new DataWriter();
        this.strMap = {}; // Map string -> index
        this.strCount = 0;
    }

    BonEncoder.prototype.reset = function() {
        this.dw = new DataWriter();
        this.strMap = {};
        this.strCount = 0;
    };

    BonEncoder.prototype.encode = function(val) {
        if (val === null || val === undefined) {
            return this.encodeNull();
        }

        var type = typeof val;

        if (type === 'number') {
            if (Number.isInteger(val)) {
                // Determine best int type
                // Go implementation uses Int(1) or Long(2) based on range or type
                // Here we simplify: if fits in 32 bit use Int(1), else Long(2)
                if (val >= -2147483648 && val <= 2147483647) {
                    return this.encodeInt(val);
                } else {
                    return this.encodeLong(val);
                }
            } else {
                // Float/Double
                return this.encodeDouble(val);
            }
        } else if (type === 'string') {
            return this.encodeString(val);
        } else if (type === 'boolean') {
            return this.encodeBoolean(val);
        } else if (type === 'bigint') {
            return this.encodeLong(val);
        } else if (type === 'object') {
            if (Array.isArray(val)) {
                return this.encodeArray(val);
            } else if (val instanceof Uint8Array) {
                return this.encodeBinary(val);
            } else if (val instanceof Date) {
                return this.encodeDateTime(val);
            } else {
                return this.encodeMap(val); // Treat object as Map
            }
        }
        
        return this.encodeNull();
    };

    BonEncoder.prototype.encodeNull = function() {
        this.dw.writeInt8(0);
    };

    BonEncoder.prototype.encodeInt = function(val) {
        this.dw.writeInt8(1);
        this.dw.writeInt32(val);
    };

    BonEncoder.prototype.encodeLong = function(val) {
        this.dw.writeInt8(2);
        this.dw.writeInt64(val);
    };

    BonEncoder.prototype.encodeDouble = function(val) {
        this.dw.writeInt8(4);
        this.dw.writeFloat64(val);
    };

    BonEncoder.prototype.encodeString = function(val) {
        if (this.strMap.hasOwnProperty(val)) {
            this.dw.writeInt8(99); // String reference
            this.dw.write7BitInt(this.strMap[val]);
        } else {
            this.dw.writeInt8(5); // String
            this.dw.writeUTF(val);
            this.strMap[val] = this.strCount++;
        }
    };

    BonEncoder.prototype.encodeBoolean = function(val) {
        this.dw.writeInt8(6);
        this.dw.writeInt8(val ? 1 : 0);
    };

    BonEncoder.prototype.encodeBinary = function(val) {
        this.dw.writeInt8(7); // Binary
        this.dw.write7BitInt(val.length);
        this.dw.ensureBuffer(val.length);
        this.dw.data.set(val, this.dw.position);
        this.dw.position += val.length;
    };

    BonEncoder.prototype.encodeArray = function(val) {
        this.dw.writeInt8(9); // Array
        this.dw.write7BitInt(val.length);
        for (var i = 0; i < val.length; i++) {
            this.encode(val[i]);
        }
    };

    BonEncoder.prototype.encodeMap = function(val) {
        this.dw.writeInt8(8); // Map/Object
        var keys = Object.keys(val);
        
        // Filter out $ keys and functions if necessary (matching Go structToMap)
        var validKeys = keys.filter(function(k) { return k[0] !== '$'; });
        
        this.dw.write7BitInt(validKeys.length);
        for (var i = 0; i < validKeys.length; i++) {
            var k = validKeys[i];
            this.encode(k);
            this.encode(val[k]);
        }
    };
    
    BonEncoder.prototype.encodeDateTime = function(val) {
        this.dw.writeInt8(10);
        // Go: val.UnixNano() / 1e6 => milliseconds
        this.dw.writeInt64(BigInt(val.getTime()));
    };

    BON.encode = function(val) {
        var encoder = new BonEncoder();
        encoder.encode(val);
        return encoder.dw.getBytes();
    };

    global.BON = BON;

})(this);
