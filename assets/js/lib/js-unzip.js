(function (GLOBAL) {
    var JSUnzip = function (fileContents) {
        this.fileContents = new JSUnzip.BigEndianBinaryStream(fileContents);
    }
    GLOBAL.JSUnzip = JSUnzip;
    JSUnzip.MAGIC_NUMBER = 0x04034b50;

    JSUnzip.prototype = {
        readEntries: function () {
            if (!this.isZipFile()) {
                throw new Error("File is not a Zip file.");
            }

            console.log('unzipping file');

            //TODO create temp folder, unzip to folder, save paths is this.entries
            var ret = _.Deferred();
            var e = new JSUnzip.ZipEntry(this.fileContents);
            var deferreds = [];
            var entries = [];
            while (typeof(e.data) === "string") {
                console.log(e);
                entries.push(e.fileName);
                deferreds[e.fileName] = _.Deferred();
                var data;
                if (e.compressionMethod === 0) {
                    data = e.data;
                } else if (e.compressionMethod === 8) {
                    data = JSInflate.inflate(e.data);
                } else {
                    throw new Error("Unknown compression method "
                        + e.compressionMethod
                        + " encountered.");
                }
                //console.log('uncompressed file', compressedFile.fileName, data);
//                asyncStorage.setItem(e.fileName, data, function(v, k){
//                    console.log(k);
//                    deferreds[k].resolve();
//                });


                e = new JSUnzip.ZipEntry(this.fileContents);
            }
            var arr = [];
            for( var i in deferreds ) {
                if (deferreds.hasOwnProperty(i)){
                    arr.push(deferreds[i]);
//                    deferreds[i].resolve();
                }
            }

            _.when(arr).always(function(){
//                console.log('everything done', entries);
                ret.resolve(entries);
            });

            return ret;
        },
        readPath: function (path) {
            var ret = _.Deferred();
            var self = this;

            //console.log('getting data from zip for '+path);

            if (!this.isZipFile()) {
                throw new Error("File is not a Zip file.");
            }

//            if(self.filesDone.indexOf(self.filename + path) !== -1) {
//                asyncStorage.getItem(self.filename + path, function(r){
//                    ret.resolve(r);
//                });
//                return ret;
//            }



            //TODO create temp folder, unzip to folder, save paths is this.entries
            setTimeout(function(){
                self.fileContents.resetByteIndex();
                var e = new JSUnzip.ZipEntry(self.fileContents);

                while (typeof e.data === 'string') {
//                    console.log(e);
                    if(e.fileName == path) {
                        var data;
                        if (e.compressionMethod === 0) {
                            data = e.data;
                        } else if (e.compressionMethod === 8) {
                            data = JSInflate.inflate(e.data);
                        } else {
                            throw new Error("Unknown compression method "
                                + e.compressionMethod
                                + " encountered.");
                        }
//                        self.filesDone.push(e.fileName);
//
//                        asyncStorage.setItem(self.filename + e.fileName, data, function(d){
                            ret.resolve(data);
//                        });

                    }

                    e = new JSUnzip.ZipEntry(self.fileContents);
                }
            }, 100);


            return ret;
        },
        isZipFile: function () {
            return this.fileContents.getByteRangeAsNumber(0, 4) === JSUnzip.MAGIC_NUMBER;
        }
    }

    JSUnzip.ZipEntry = function (binaryStream) {
        this.signature          = binaryStream.getNextBytesAsNumber(4);
        if (this.signature !== JSUnzip.MAGIC_NUMBER) {
            return;
        }

        this.versionNeeded      = binaryStream.getNextBytesAsNumber(2);
        this.bitFlag            = binaryStream.getNextBytesAsNumber(2);
        this.compressionMethod  = binaryStream.getNextBytesAsNumber(2);
        this.timeBlob           = binaryStream.getNextBytesAsNumber(4);

        if (this.isEncrypted()) {
            throw "File contains encrypted entry. Not supported.";
        }

        if (this.isUsingUtf8()) {
            throw "File is using UTF8. Not supported.";
        }

        this.crc32              = binaryStream.getNextBytesAsNumber(4);
        this.compressedSize     = binaryStream.getNextBytesAsNumber(4);
        this.uncompressedSize   = binaryStream.getNextBytesAsNumber(4);

        if (this.isUsingZip64()) {
            throw "File is using Zip64 (4gb+ file size). Not supported";
        }

        this.fileNameLength     = binaryStream.getNextBytesAsNumber(2);
        this.extraFieldLength   = binaryStream.getNextBytesAsNumber(2);

        this.fileName  = binaryStream.getNextBytesAsString(this.fileNameLength);
        this.extra     = binaryStream.getNextBytesAsString(this.extraFieldLength);
        this.data      = binaryStream.getNextBytesAsString(this.compressedSize);

        if (this.isUsingBit3TrailingDataDescriptor()) {
            if (typeof(console) !== "undefined") {
                console.log( "File is using bit 3 trailing data descriptor. Not supported.");
            }
            binaryStream.getNextBytesAsNumber(16);  //Skip the descriptor and move to beginning of next ZipEntry
        }
    }

    JSUnzip.ZipEntry.prototype = {
        isEncrypted: function () {
            return (this.bitFlag & 0x01) === 0x01;
        },

        isUsingUtf8: function () {
            return (this.bitFlag & 0x0800) === 0x0800;
        },

        isUsingBit3TrailingDataDescriptor: function () {
            return (this.bitFlag & 0x0008) === 0x0008;
        },

        isUsingZip64: function () {
            this.compressedSize === 0xFFFFFFFF ||
                this.uncompressedSize === 0xFFFFFFFF;
        }
    }

    JSUnzip.BigEndianBinaryStream = function (stream) {
        this.stream = stream;
        this.resetByteIndex();
    }

    JSUnzip.BigEndianBinaryStream.prototype = {
        // The index of the current byte, used when we step through the byte
        // with getNextBytesAs*.
        resetByteIndex: function () {
            this.currentByteIndex = 0;
        },

        getByteAt: function (index) {
            return this.stream.charCodeAt(index);
        },

        getNextBytesAsNumber: function (steps) {
            var res = this.getByteRangeAsNumber(this.currentByteIndex, steps);
            this.currentByteIndex += steps;
            return res;
        },

        getNextBytesAsString: function (steps) {
            var res = this.getByteRangeAsString(this.currentByteIndex, steps);
            this.currentByteIndex += steps;
            return res;
        },

        // Big endian, so we're going backwards.
        getByteRangeAsNumber: function (index, steps) {
            var result = 0;
            var i = index + steps - 1;
            while (i >= index) {
                result = (result << 8) + this.getByteAt(i);
                i--;
            }
            return result;
        },

        getByteRangeAsString: function (index, steps) {
            var result = "";
            var max = index + steps;
            var i = index;
            while (i < max) {
                var charCode = this.getByteAt(i);
                result += String.fromCharCode(charCode);
                // Accounting for multi-byte strings.
                max -= Math.floor(charCode / 0x100);
                i++;
            }
            return result;
        }
    }
}(this));
