"use strict";
(() => {
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __commonJS = (cb, mod) => function __require() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };

  // (disabled):../../node_modules/path/path.js
  var require_path = __commonJS({
    "(disabled):../../node_modules/path/path.js"() {
    }
  });

  // (disabled):fs
  var require_fs = __commonJS({
    "(disabled):fs"() {
    }
  });

  // ../worker-utils/src/lib/node/worker_threads-browser.ts
  var parentPort = null;

  // ../worker-utils/src/lib/worker-utils/get-transfer-list.ts
  function getTransferList(object, recursive = true, transfers) {
    const transfersSet = transfers || /* @__PURE__ */ new Set();
    if (!object) {
    } else if (isTransferable(object)) {
      transfersSet.add(object);
    } else if (isTransferable(object.buffer)) {
      transfersSet.add(object.buffer);
    } else if (ArrayBuffer.isView(object)) {
    } else if (recursive && typeof object === "object") {
      for (const key in object) {
        getTransferList(object[key], recursive, transfersSet);
      }
    }
    return transfers === void 0 ? Array.from(transfersSet) : [];
  }
  function isTransferable(object) {
    if (!object) {
      return false;
    }
    if (object instanceof ArrayBuffer) {
      return true;
    }
    if (typeof MessagePort !== "undefined" && object instanceof MessagePort) {
      return true;
    }
    if (typeof ImageBitmap !== "undefined" && object instanceof ImageBitmap) {
      return true;
    }
    if (typeof OffscreenCanvas !== "undefined" && object instanceof OffscreenCanvas) {
      return true;
    }
    return false;
  }

  // ../worker-utils/src/lib/worker-farm/worker-body.ts
  async function getParentPort() {
    return parentPort;
  }
  var onMessageWrapperMap = /* @__PURE__ */ new Map();
  var WorkerBody = class {
    /** Check that we are actually in a worker thread */
    static async inWorkerThread() {
      return typeof self !== "undefined" || Boolean(await getParentPort());
    }
    /*
     * (type: WorkerMessageType, payload: WorkerMessagePayload) => any
     */
    static set onmessage(onMessage) {
      async function handleMessage(message) {
        const parentPort2 = await getParentPort();
        const { type, payload } = parentPort2 ? message : message.data;
        onMessage(type, payload);
      }
      getParentPort().then((parentPort2) => {
        if (parentPort2) {
          parentPort2.on("message", (message) => {
            handleMessage(message);
          });
          parentPort2.on("exit", () => console.debug("Node worker closing"));
        } else {
          globalThis.onmessage = handleMessage;
        }
      });
    }
    static async addEventListener(onMessage) {
      let onMessageWrapper = onMessageWrapperMap.get(onMessage);
      if (!onMessageWrapper) {
        onMessageWrapper = async (message) => {
          if (!isKnownMessage(message)) {
            return;
          }
          const parentPort3 = await getParentPort();
          const { type, payload } = parentPort3 ? message : message.data;
          onMessage(type, payload);
        };
      }
      const parentPort2 = await getParentPort();
      if (parentPort2) {
        console.error("not implemented");
      } else {
        globalThis.addEventListener("message", onMessageWrapper);
      }
    }
    static async removeEventListener(onMessage) {
      const onMessageWrapper = onMessageWrapperMap.get(onMessage);
      onMessageWrapperMap.delete(onMessage);
      const parentPort2 = await getParentPort();
      if (parentPort2) {
        console.error("not implemented");
      } else {
        globalThis.removeEventListener("message", onMessageWrapper);
      }
    }
    /**
     * Send a message from a worker to creating thread (main thread)
     * @param type
     * @param payload
     */
    static async postMessage(type, payload) {
      const data = { source: "loaders.gl", type, payload };
      const transferList = getTransferList(payload);
      const parentPort2 = await getParentPort();
      if (parentPort2) {
        parentPort2.postMessage(data, transferList);
      } else {
        globalThis.postMessage(data, transferList);
      }
    }
  };
  function isKnownMessage(message) {
    const { type, data } = message;
    return type === "message" && data && typeof data.source === "string" && data.source.startsWith("loaders.gl");
  }

  // ../loader-utils/src/lib/worker-loader-utils/create-loader-worker.ts
  var requestId = 0;
  async function createLoaderWorker(loader) {
    if (!await WorkerBody.inWorkerThread()) {
      return;
    }
    WorkerBody.onmessage = async (type, payload) => {
      switch (type) {
        case "process":
          try {
            const { input, options = {}, context = {} } = payload;
            const result = await parseData({
              loader,
              arrayBuffer: input,
              options,
              // @ts-expect-error fetch missing
              context: {
                ...context,
                _parse: parseOnMainThread
              }
            });
            WorkerBody.postMessage("done", { result });
          } catch (error) {
            const message = error instanceof Error ? error.message : "";
            WorkerBody.postMessage("error", { error: message });
          }
          break;
        default:
      }
    };
  }
  function parseOnMainThread(arrayBuffer, loader, options, context) {
    return new Promise((resolve, reject) => {
      const id = requestId++;
      const onMessage = (type, payload2) => {
        if (payload2.id !== id) {
          return;
        }
        switch (type) {
          case "done":
            WorkerBody.removeEventListener(onMessage);
            resolve(payload2.result);
            break;
          case "error":
            WorkerBody.removeEventListener(onMessage);
            reject(payload2.error);
            break;
          default:
        }
      };
      WorkerBody.addEventListener(onMessage);
      const payload = { id, input: arrayBuffer, options };
      WorkerBody.postMessage("process", payload);
    });
  }
  async function parseData({
    loader,
    arrayBuffer,
    options,
    context
  }) {
    let data;
    let parser;
    if (loader.parseSync || loader.parse) {
      data = arrayBuffer;
      parser = loader.parseSync || loader.parse;
    } else if (loader.parseTextSync) {
      const textDecoder = new TextDecoder();
      data = textDecoder.decode(arrayBuffer);
      parser = loader.parseTextSync;
    } else {
      throw new Error(`Could not load data with ${loader.name} loader`);
    }
    options = {
      ...options,
      modules: loader && loader.options && loader.options.modules || {},
      worker: false
    };
    return await parser(data, { ...options }, context, loader);
  }

  // src/las-loader.ts
  var VERSION = true ? "4.3.2" : "latest";
  var LASLoader = {
    dataType: null,
    batchType: null,
    name: "LAS",
    id: "las",
    module: "las",
    version: VERSION,
    worker: true,
    extensions: ["las", "laz"],
    // LAZ is the "compressed" flavor of LAS,
    mimeTypes: ["application/octet-stream"],
    // TODO - text version?
    text: true,
    binary: true,
    tests: ["LAS"],
    options: {
      las: {
        shape: "mesh",
        fp64: false,
        skip: 1,
        colorDepth: 8
      }
    }
  };

  // ../schema/src/lib/table/simple-table/data-type.ts
  function getDataTypeFromTypedArray(array) {
    switch (array.constructor) {
      case Int8Array:
        return "int8";
      case Uint8Array:
      case Uint8ClampedArray:
        return "uint8";
      case Int16Array:
        return "int16";
      case Uint16Array:
        return "uint16";
      case Int32Array:
        return "int32";
      case Uint32Array:
        return "uint32";
      case Float32Array:
        return "float32";
      case Float64Array:
        return "float64";
      default:
        return "null";
    }
  }

  // ../schema/src/lib/mesh/mesh-utils.ts
  function getMeshBoundingBox(attributes) {
    let minX = Infinity;
    let minY = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let maxZ = -Infinity;
    const positions = attributes.POSITION ? attributes.POSITION.value : [];
    const len = positions && positions.length;
    for (let i = 0; i < len; i += 3) {
      const x = positions[i];
      const y = positions[i + 1];
      const z = positions[i + 2];
      minX = x < minX ? x : minX;
      minY = y < minY ? y : minY;
      minZ = z < minZ ? z : minZ;
      maxX = x > maxX ? x : maxX;
      maxY = y > maxY ? y : maxY;
      maxZ = z > maxZ ? z : maxZ;
    }
    return [
      [minX, minY, minZ],
      [maxX, maxY, maxZ]
    ];
  }

  // ../schema/src/lib/mesh/deduce-mesh-schema.ts
  function deduceMeshSchema(attributes, metadata = {}) {
    const fields = deduceMeshFields(attributes);
    return { fields, metadata };
  }
  function deduceMeshField(name, attribute, optionalMetadata) {
    const type = getDataTypeFromTypedArray(attribute.value);
    const metadata = optionalMetadata ? optionalMetadata : makeMeshAttributeMetadata(attribute);
    return {
      name,
      type: { type: "fixed-size-list", listSize: attribute.size, children: [{ name: "value", type }] },
      nullable: false,
      metadata
    };
  }
  function deduceMeshFields(attributes) {
    const fields = [];
    for (const attributeName in attributes) {
      const attribute = attributes[attributeName];
      fields.push(deduceMeshField(attributeName, attribute));
    }
    return fields;
  }
  function makeMeshAttributeMetadata(attribute) {
    const result = {};
    if ("byteOffset" in attribute) {
      result.byteOffset = attribute.byteOffset.toString(10);
    }
    if ("byteStride" in attribute) {
      result.byteStride = attribute.byteStride.toString(10);
    }
    if ("normalized" in attribute) {
      result.normalized = attribute.normalized.toString();
    }
    return result;
  }

  // src/lib/libs/laz-perf.ts
  function getModule() {
    var Module2 = typeof Module2 !== "undefined" ? Module2 : {};
    var moduleOverrides = {};
    var key;
    for (key in Module2) {
      if (Module2.hasOwnProperty(key)) {
        moduleOverrides[key] = Module2[key];
      }
    }
    var arguments_ = [];
    var thisProgram = "./this.program";
    var quit_ = function(status, toThrow) {
      throw toThrow;
    };
    var ENVIRONMENT_IS_WEB = false;
    var ENVIRONMENT_IS_WORKER = false;
    var ENVIRONMENT_IS_NODE = false;
    var ENVIRONMENT_IS_SHELL = false;
    ENVIRONMENT_IS_WEB = typeof window === "object";
    ENVIRONMENT_IS_WORKER = typeof importScripts === "function";
    ENVIRONMENT_IS_NODE = typeof process === "object" && typeof process.versions === "object" && typeof process.versions.node === "string";
    ENVIRONMENT_IS_SHELL = !ENVIRONMENT_IS_WEB && !ENVIRONMENT_IS_NODE && !ENVIRONMENT_IS_WORKER;
    var scriptDirectory = "";
    function locateFile(path) {
      if (Module2["locateFile"]) {
        return Module2["locateFile"](path, scriptDirectory);
      }
      return scriptDirectory + path;
    }
    var read_, readAsync, readBinary, setWindowTitle;
    var nodeFS;
    var nodePath;
    if (ENVIRONMENT_IS_NODE) {
      if (ENVIRONMENT_IS_WORKER) {
        scriptDirectory = require_path().dirname(scriptDirectory) + "/";
      } else {
        const dirname = typeof __dirname !== "undefined" ? __dirname : "";
        scriptDirectory = dirname + "/";
      }
      read_ = function shell_read(filename, binary) {
        var ret = tryParseAsDataURI(filename);
        if (ret) {
          return binary ? ret : ret.toString();
        }
        if (!nodeFS)
          nodeFS = require_fs();
        if (!nodePath)
          nodePath = require_path();
        filename = nodePath["normalize"](filename);
        return nodeFS["readFileSync"](filename, binary ? null : "utf8");
      };
      readBinary = function readBinary2(filename) {
        var ret = read_(filename, true);
        if (!ret.buffer) {
          ret = new Uint8Array(ret);
        }
        assert(ret.buffer);
        return ret;
      };
      if (process["argv"].length > 1) {
        thisProgram = process["argv"][1].replace(/\\/g, "/");
      }
      arguments_ = process["argv"].slice(2);
      if (typeof module !== "undefined") {
        module["exports"] = Module2;
      }
      process["on"]("uncaughtException", function(ex) {
        if (!(ex instanceof ExitStatus)) {
          throw ex;
        }
      });
      process["on"]("unhandledRejection", abort);
      quit_ = function(status) {
        process["exit"](status);
      };
      Module2["inspect"] = function() {
        return "[Emscripten Module object]";
      };
    } else if (ENVIRONMENT_IS_SHELL) {
      if (typeof read != "undefined") {
        read_ = function shell_read(f) {
          var data2 = tryParseAsDataURI(f);
          if (data2) {
            return intArrayToString(data2);
          }
          return read(f);
        };
      }
      readBinary = function readBinary2(f) {
        var data2;
        data2 = tryParseAsDataURI(f);
        if (data2) {
          return data2;
        }
        if (typeof readbuffer === "function") {
          return new Uint8Array(readbuffer(f));
        }
        data2 = read(f, "binary");
        assert(typeof data2 === "object");
        return data2;
      };
      if (typeof scriptArgs != "undefined") {
        arguments_ = scriptArgs;
      } else if (typeof arguments != "undefined") {
        arguments_ = arguments;
      }
      if (typeof quit === "function") {
        quit_ = function(status) {
          quit(status);
        };
      }
      if (typeof print !== "undefined") {
        if (typeof console === "undefined")
          console = {};
        console.log = print;
        console.warn = console.error = typeof printErr !== "undefined" ? printErr : print;
      }
    } else if (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) {
      if (ENVIRONMENT_IS_WORKER) {
        scriptDirectory = self.location.href;
      } else if (document.currentScript) {
        scriptDirectory = document.currentScript.src;
      }
      if (scriptDirectory.indexOf("blob:") !== 0) {
        scriptDirectory = scriptDirectory.substr(0, scriptDirectory.lastIndexOf("/") + 1);
      } else {
        scriptDirectory = "";
      }
      {
        read_ = function shell_read(url) {
          try {
            var xhr = new XMLHttpRequest();
            xhr.open("GET", url, false);
            xhr.send(null);
            return xhr.responseText;
          } catch (err2) {
            var data2 = tryParseAsDataURI(url);
            if (data2) {
              return intArrayToString(data2);
            }
            throw err2;
          }
        };
        if (ENVIRONMENT_IS_WORKER) {
          readBinary = function readBinary2(url) {
            try {
              var xhr = new XMLHttpRequest();
              xhr.open("GET", url, false);
              xhr.responseType = "arraybuffer";
              xhr.send(null);
              return new Uint8Array(xhr.response);
            } catch (err2) {
              var data2 = tryParseAsDataURI(url);
              if (data2) {
                return data2;
              }
              throw err2;
            }
          };
        }
        readAsync = function readAsync2(url, onload, onerror) {
          var xhr = new XMLHttpRequest();
          xhr.open("GET", url, true);
          xhr.responseType = "arraybuffer";
          xhr.onload = function xhr_onload() {
            if (xhr.status == 200 || xhr.status == 0 && xhr.response) {
              onload(xhr.response);
              return;
            }
            var data2 = tryParseAsDataURI(url);
            if (data2) {
              onload(data2.buffer);
              return;
            }
            onerror();
          };
          xhr.onerror = onerror;
          xhr.send(null);
        };
      }
      setWindowTitle = function(title) {
        document.title = title;
      };
    } else {
    }
    var out = Module2["print"] || console.log.bind(console);
    var err = Module2["printErr"] || console.warn.bind(console);
    for (key in moduleOverrides) {
      if (moduleOverrides.hasOwnProperty(key)) {
        Module2[key] = moduleOverrides[key];
      }
    }
    moduleOverrides = null;
    if (Module2["arguments"])
      arguments_ = Module2["arguments"];
    if (Module2["thisProgram"])
      thisProgram = Module2["thisProgram"];
    if (Module2["quit"])
      quit_ = Module2["quit"];
    var STACK_ALIGN = 16;
    function dynamicAlloc(size) {
      var ret = HEAP32[DYNAMICTOP_PTR >> 2];
      var end = ret + size + 15 & -16;
      HEAP32[DYNAMICTOP_PTR >> 2] = end;
      return ret;
    }
    function getNativeTypeSize(type) {
      switch (type) {
        case "i1":
        case "i8":
          return 1;
        case "i16":
          return 2;
        case "i32":
          return 4;
        case "i64":
          return 8;
        case "float":
          return 4;
        case "double":
          return 8;
        default: {
          if (type[type.length - 1] === "*") {
            return 4;
          } else if (type[0] === "i") {
            var bits = Number(type.substr(1));
            assert(bits % 8 === 0, "getNativeTypeSize invalid bits " + bits + ", type " + type);
            return bits / 8;
          } else {
            return 0;
          }
        }
      }
    }
    function warnOnce(text) {
      if (!warnOnce.shown)
        warnOnce.shown = {};
      if (!warnOnce.shown[text]) {
        warnOnce.shown[text] = 1;
        err(text);
      }
    }
    var jsCallStartIndex = 1;
    var functionPointers = new Array(0);
    var funcWrappers = {};
    function dynCall(sig, ptr, args) {
      if (args && args.length) {
        return Module2["dynCall_" + sig].apply(null, [ptr].concat(args));
      } else {
        return Module2["dynCall_" + sig].call(null, ptr);
      }
    }
    var tempRet0 = 0;
    var setTempRet0 = function(value) {
      tempRet0 = value;
    };
    var getTempRet0 = function() {
      return tempRet0;
    };
    var GLOBAL_BASE = 8;
    var wasmBinary;
    if (Module2["wasmBinary"])
      wasmBinary = Module2["wasmBinary"];
    var noExitRuntime;
    if (Module2["noExitRuntime"])
      noExitRuntime = Module2["noExitRuntime"];
    function setValue(ptr, value, type, noSafe) {
      type = type || "i8";
      if (type.charAt(type.length - 1) === "*")
        type = "i32";
      switch (type) {
        case "i1":
          HEAP8[ptr >> 0] = value;
          break;
        case "i8":
          HEAP8[ptr >> 0] = value;
          break;
        case "i16":
          HEAP16[ptr >> 1] = value;
          break;
        case "i32":
          HEAP32[ptr >> 2] = value;
          break;
        case "i64":
          tempI64 = [
            value >>> 0,
            (tempDouble = value, +Math_abs(tempDouble) >= 1 ? tempDouble > 0 ? (Math_min(+Math_floor(tempDouble / 4294967296), 4294967295) | 0) >>> 0 : ~~+Math_ceil((tempDouble - +(~~tempDouble >>> 0)) / 4294967296) >>> 0 : 0)
          ], HEAP32[ptr >> 2] = tempI64[0], HEAP32[ptr + 4 >> 2] = tempI64[1];
          break;
        case "float":
          HEAPF32[ptr >> 2] = value;
          break;
        case "double":
          HEAPF64[ptr >> 3] = value;
          break;
        default:
          abort("invalid type for setValue: " + type);
      }
    }
    var ABORT = false;
    var EXITSTATUS = 0;
    function assert(condition, text) {
      if (!condition) {
        abort("Assertion failed: " + text);
      }
    }
    function getCFunc(ident) {
      var func = Module2["_" + ident];
      assert(func, "Cannot call unknown function " + ident + ", make sure it is exported");
      return func;
    }
    function ccall(ident, returnType, argTypes, args, opts) {
      var toC = {
        string: function(str) {
          var ret2 = 0;
          if (str !== null && str !== void 0 && str !== 0) {
            var len = (str.length << 2) + 1;
            ret2 = stackAlloc(len);
            stringToUTF8(str, ret2, len);
          }
          return ret2;
        },
        array: function(arr) {
          var ret2 = stackAlloc(arr.length);
          writeArrayToMemory(arr, ret2);
          return ret2;
        }
      };
      function convertReturnValue(ret2) {
        if (returnType === "string")
          return UTF8ToString(ret2);
        if (returnType === "boolean")
          return Boolean(ret2);
        return ret2;
      }
      var func = getCFunc(ident);
      var cArgs = [];
      var stack = 0;
      if (args) {
        for (var i = 0; i < args.length; i++) {
          var converter = toC[argTypes[i]];
          if (converter) {
            if (stack === 0)
              stack = stackSave();
            cArgs[i] = converter(args[i]);
          } else {
            cArgs[i] = args[i];
          }
        }
      }
      var ret = func.apply(null, cArgs);
      ret = convertReturnValue(ret);
      if (stack !== 0)
        stackRestore(stack);
      return ret;
    }
    var ALLOC_NONE = 3;
    var UTF8Decoder = typeof TextDecoder !== "undefined" ? new TextDecoder("utf8") : void 0;
    function UTF8ArrayToString(heap, idx, maxBytesToRead) {
      var endIdx = idx + maxBytesToRead;
      var endPtr = idx;
      while (heap[endPtr] && !(endPtr >= endIdx))
        ++endPtr;
      if (endPtr - idx > 16 && heap.subarray && UTF8Decoder) {
        return UTF8Decoder.decode(heap.subarray(idx, endPtr));
      } else {
        var str = "";
        while (idx < endPtr) {
          var u0 = heap[idx++];
          if (!(u0 & 128)) {
            str += String.fromCharCode(u0);
            continue;
          }
          var u1 = heap[idx++] & 63;
          if ((u0 & 224) == 192) {
            str += String.fromCharCode((u0 & 31) << 6 | u1);
            continue;
          }
          var u2 = heap[idx++] & 63;
          if ((u0 & 240) == 224) {
            u0 = (u0 & 15) << 12 | u1 << 6 | u2;
          } else {
            u0 = (u0 & 7) << 18 | u1 << 12 | u2 << 6 | heap[idx++] & 63;
          }
          if (u0 < 65536) {
            str += String.fromCharCode(u0);
          } else {
            var ch = u0 - 65536;
            str += String.fromCharCode(55296 | ch >> 10, 56320 | ch & 1023);
          }
        }
      }
      return str;
    }
    function UTF8ToString(ptr, maxBytesToRead) {
      return ptr ? UTF8ArrayToString(HEAPU8, ptr, maxBytesToRead) : "";
    }
    function stringToUTF8Array(str, heap, outIdx, maxBytesToWrite) {
      if (!(maxBytesToWrite > 0))
        return 0;
      var startIdx = outIdx;
      var endIdx = outIdx + maxBytesToWrite - 1;
      for (var i = 0; i < str.length; ++i) {
        var u = str.charCodeAt(i);
        if (u >= 55296 && u <= 57343) {
          var u1 = str.charCodeAt(++i);
          u = 65536 + ((u & 1023) << 10) | u1 & 1023;
        }
        if (u <= 127) {
          if (outIdx >= endIdx)
            break;
          heap[outIdx++] = u;
        } else if (u <= 2047) {
          if (outIdx + 1 >= endIdx)
            break;
          heap[outIdx++] = 192 | u >> 6;
          heap[outIdx++] = 128 | u & 63;
        } else if (u <= 65535) {
          if (outIdx + 2 >= endIdx)
            break;
          heap[outIdx++] = 224 | u >> 12;
          heap[outIdx++] = 128 | u >> 6 & 63;
          heap[outIdx++] = 128 | u & 63;
        } else {
          if (outIdx + 3 >= endIdx)
            break;
          heap[outIdx++] = 240 | u >> 18;
          heap[outIdx++] = 128 | u >> 12 & 63;
          heap[outIdx++] = 128 | u >> 6 & 63;
          heap[outIdx++] = 128 | u & 63;
        }
      }
      heap[outIdx] = 0;
      return outIdx - startIdx;
    }
    function stringToUTF8(str, outPtr, maxBytesToWrite) {
      return stringToUTF8Array(str, HEAPU8, outPtr, maxBytesToWrite);
    }
    function lengthBytesUTF8(str) {
      var len = 0;
      for (var i = 0; i < str.length; ++i) {
        var u = str.charCodeAt(i);
        if (u >= 55296 && u <= 57343)
          u = 65536 + ((u & 1023) << 10) | str.charCodeAt(++i) & 1023;
        if (u <= 127)
          ++len;
        else if (u <= 2047)
          len += 2;
        else if (u <= 65535)
          len += 3;
        else
          len += 4;
      }
      return len;
    }
    var UTF16Decoder = typeof TextDecoder !== "undefined" ? new TextDecoder("utf-16le") : void 0;
    function UTF16ToString(ptr, maxBytesToRead) {
      var endPtr = ptr;
      var idx = endPtr >> 1;
      var maxIdx = idx + maxBytesToRead / 2;
      while (!(idx >= maxIdx) && HEAPU16[idx])
        ++idx;
      endPtr = idx << 1;
      if (endPtr - ptr > 32 && UTF16Decoder) {
        return UTF16Decoder.decode(HEAPU8.subarray(ptr, endPtr));
      } else {
        var i = 0;
        var str = "";
        while (1) {
          var codeUnit = HEAP16[ptr + i * 2 >> 1];
          if (codeUnit == 0 || i == maxBytesToRead / 2)
            return str;
          ++i;
          str += String.fromCharCode(codeUnit);
        }
      }
    }
    function stringToUTF16(str, outPtr, maxBytesToWrite) {
      if (maxBytesToWrite === void 0) {
        maxBytesToWrite = 2147483647;
      }
      if (maxBytesToWrite < 2)
        return 0;
      maxBytesToWrite -= 2;
      var startPtr = outPtr;
      var numCharsToWrite = maxBytesToWrite < str.length * 2 ? maxBytesToWrite / 2 : str.length;
      for (var i = 0; i < numCharsToWrite; ++i) {
        var codeUnit = str.charCodeAt(i);
        HEAP16[outPtr >> 1] = codeUnit;
        outPtr += 2;
      }
      HEAP16[outPtr >> 1] = 0;
      return outPtr - startPtr;
    }
    function lengthBytesUTF16(str) {
      return str.length * 2;
    }
    function UTF32ToString(ptr, maxBytesToRead) {
      var i = 0;
      var str = "";
      while (!(i >= maxBytesToRead / 4)) {
        var utf32 = HEAP32[ptr + i * 4 >> 2];
        if (utf32 == 0)
          break;
        ++i;
        if (utf32 >= 65536) {
          var ch = utf32 - 65536;
          str += String.fromCharCode(55296 | ch >> 10, 56320 | ch & 1023);
        } else {
          str += String.fromCharCode(utf32);
        }
      }
      return str;
    }
    function stringToUTF32(str, outPtr, maxBytesToWrite) {
      if (maxBytesToWrite === void 0) {
        maxBytesToWrite = 2147483647;
      }
      if (maxBytesToWrite < 4)
        return 0;
      var startPtr = outPtr;
      var endPtr = startPtr + maxBytesToWrite - 4;
      for (var i = 0; i < str.length; ++i) {
        var codeUnit = str.charCodeAt(i);
        if (codeUnit >= 55296 && codeUnit <= 57343) {
          var trailSurrogate = str.charCodeAt(++i);
          codeUnit = 65536 + ((codeUnit & 1023) << 10) | trailSurrogate & 1023;
        }
        HEAP32[outPtr >> 2] = codeUnit;
        outPtr += 4;
        if (outPtr + 4 > endPtr)
          break;
      }
      HEAP32[outPtr >> 2] = 0;
      return outPtr - startPtr;
    }
    function lengthBytesUTF32(str) {
      var len = 0;
      for (var i = 0; i < str.length; ++i) {
        var codeUnit = str.charCodeAt(i);
        if (codeUnit >= 55296 && codeUnit <= 57343)
          ++i;
        len += 4;
      }
      return len;
    }
    function writeArrayToMemory(array, buffer2) {
      HEAP8.set(array, buffer2);
    }
    function writeAsciiToMemory(str, buffer2, dontAddNull) {
      for (var i = 0; i < str.length; ++i) {
        HEAP8[buffer2++ >> 0] = str.charCodeAt(i);
      }
      if (!dontAddNull)
        HEAP8[buffer2 >> 0] = 0;
    }
    var buffer, HEAP8, HEAPU8, HEAP16, HEAPU16, HEAP32, HEAPU32, HEAPF32, HEAPF64;
    function updateGlobalBufferAndViews(buf) {
      buffer = buf;
      Module2["HEAP8"] = HEAP8 = new Int8Array(buf);
      Module2["HEAP16"] = HEAP16 = new Int16Array(buf);
      Module2["HEAP32"] = HEAP32 = new Int32Array(buf);
      Module2["HEAPU8"] = HEAPU8 = new Uint8Array(buf);
      Module2["HEAPU16"] = HEAPU16 = new Uint16Array(buf);
      Module2["HEAPU32"] = HEAPU32 = new Uint32Array(buf);
      Module2["HEAPF32"] = HEAPF32 = new Float32Array(buf);
      Module2["HEAPF64"] = HEAPF64 = new Float64Array(buf);
    }
    var STACK_BASE = 22384, DYNAMIC_BASE = 5265264, DYNAMICTOP_PTR = 22176;
    var INITIAL_INITIAL_MEMORY = Module2["INITIAL_MEMORY"] || 167772160;
    if (Module2["buffer"]) {
      buffer = Module2["buffer"];
    } else {
      buffer = new ArrayBuffer(INITIAL_INITIAL_MEMORY);
    }
    INITIAL_INITIAL_MEMORY = buffer.byteLength;
    updateGlobalBufferAndViews(buffer);
    HEAP32[DYNAMICTOP_PTR >> 2] = DYNAMIC_BASE;
    function callRuntimeCallbacks(callbacks) {
      while (callbacks.length > 0) {
        var callback = callbacks.shift();
        if (typeof callback == "function") {
          callback(Module2);
          continue;
        }
        var func = callback.func;
        if (typeof func === "number") {
          if (callback.arg === void 0) {
            Module2["dynCall_v"](func);
          } else {
            Module2["dynCall_vi"](func, callback.arg);
          }
        } else {
          func(callback.arg === void 0 ? null : callback.arg);
        }
      }
    }
    var __ATPRERUN__ = [];
    var __ATINIT__ = [];
    var __ATMAIN__ = [];
    var __ATPOSTRUN__ = [];
    var runtimeInitialized = false;
    var runtimeExited = false;
    function preRun() {
      if (Module2["preRun"]) {
        if (typeof Module2["preRun"] == "function")
          Module2["preRun"] = [Module2["preRun"]];
        while (Module2["preRun"].length) {
          addOnPreRun(Module2["preRun"].shift());
        }
      }
      callRuntimeCallbacks(__ATPRERUN__);
    }
    function initRuntime() {
      runtimeInitialized = true;
      callRuntimeCallbacks(__ATINIT__);
    }
    function preMain() {
      callRuntimeCallbacks(__ATMAIN__);
    }
    function exitRuntime() {
      runtimeExited = true;
    }
    function postRun() {
      if (Module2["postRun"]) {
        if (typeof Module2["postRun"] == "function")
          Module2["postRun"] = [Module2["postRun"]];
        while (Module2["postRun"].length) {
          addOnPostRun(Module2["postRun"].shift());
        }
      }
      callRuntimeCallbacks(__ATPOSTRUN__);
    }
    function addOnPreRun(cb) {
      __ATPRERUN__.unshift(cb);
    }
    function addOnPostRun(cb) {
      __ATPOSTRUN__.unshift(cb);
    }
    var Math_abs = Math.abs;
    var Math_ceil = Math.ceil;
    var Math_floor = Math.floor;
    var Math_min = Math.min;
    var runDependencies = 0;
    var runDependencyWatcher = null;
    var dependenciesFulfilled = null;
    function addRunDependency(id) {
      runDependencies++;
      if (Module2["monitorRunDependencies"]) {
        Module2["monitorRunDependencies"](runDependencies);
      }
    }
    function removeRunDependency(id) {
      runDependencies--;
      if (Module2["monitorRunDependencies"]) {
        Module2["monitorRunDependencies"](runDependencies);
      }
      if (runDependencies == 0) {
        if (runDependencyWatcher !== null) {
          clearInterval(runDependencyWatcher);
          runDependencyWatcher = null;
        }
        if (dependenciesFulfilled) {
          var callback = dependenciesFulfilled;
          dependenciesFulfilled = null;
          callback();
        }
      }
    }
    Module2["preloadedImages"] = {};
    Module2["preloadedAudios"] = {};
    function abort(what) {
      if (Module2["onAbort"]) {
        Module2["onAbort"](what);
      }
      what += "";
      out(what);
      err(what);
      ABORT = true;
      EXITSTATUS = 1;
      what = "abort(" + what + "). Build with -s ASSERTIONS=1 for more info.";
      throw what;
    }
    var memoryInitializer = null;
    function hasPrefix(str, prefix) {
      return String.prototype.startsWith ? str.startsWith(prefix) : str.indexOf(prefix) === 0;
    }
    var dataURIPrefix = "data:application/octet-stream;base64,";
    function isDataURI(filename) {
      return hasPrefix(filename, dataURIPrefix);
    }
    var fileURIPrefix = "file://";
    var tempDouble;
    var tempI64;
    __ATINIT__.push({
      func: function() {
        globalCtors();
      }
    });
    memoryInitializer = "data:application/octet-stream;base64,AAAAAAAAAAAPDg0MCwoJCA4AAQMGCgoJDQECBAcLCwoMAwQFCAwMCwsGBwgJDQ0MCgoLDA0ODg0JCgsMDQ4PDggJCgsMDQ4PAAECAwQFBgcBAAECAwQFBgIBAAECAwQFAwIBAAECAwQEAwIBAAECAwUEAwIBAAECBgUEAwIBAAEHBgUEAwIBAMgPAAAoDQAAEBAAACAQAADIDwAAUA0AABAQAAAgEAAAEQAKABEREQAAAAAFAAAAAAAACQAAAAALAAAAAAAAAAARAA8KERERAwoHAAEACQsLAAAJBgsAAAsABhEAAAAREREAAAAAAAAAAAAAAAAAAAAACwAAAAAAAAAAEQAKChEREQAKAAACAAkLAAAACQALAAALAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwAAAAAAAAAAAAAAAwAAAAADAAAAAAJDAAAAAAADAAADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAOAAAAAAAAAAAAAAANAAAABA0AAAAACQ4AAAAAAA4AAA4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAADwAAAAAPAAAAAAkQAAAAAAAQAAAQAAASAAAAEhISAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABIAAAASEhIAAAAAAAAJAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAALAAAAAAAAAAAAAAAKAAAAAAoAAAAACQsAAAAAAAsAAAsAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADAAAAAAAAAAAAAAADAAAAAAMAAAAAAkMAAAAAAAMAAAMAAAwMTIzNDU2Nzg5QUJDREVGGRJEOwI/LEcUPTMwChsGRktFNw9JDo4XA0AdPGkrNh9KLRwBICUpIQgMFRYiLhA4Pgs0MRhkdHV2L0EJfzkRI0MyQomKiwUEJignDSoeNYwHGkiTE5SVAAAAAAAAAAAASWxsZWdhbCBieXRlIHNlcXVlbmNlAERvbWFpbiBlcnJvcgBSZXN1bHQgbm90IHJlcHJlc2VudGFibGUATm90IGEgdHR5AFBlcm1pc3Npb24gZGVuaWVkAE9wZXJhdGlvbiBub3QgcGVybWl0dGVkAE5vIHN1Y2ggZmlsZSBvciBkaXJlY3RvcnkATm8gc3VjaCBwcm9jZXNzAEZpbGUgZXhpc3RzAFZhbHVlIHRvbyBsYXJnZSBmb3IgZGF0YSB0eXBlAE5vIHNwYWNlIGxlZnQgb24gZGV2aWNlAE91dCBvZiBtZW1vcnkAUmVzb3VyY2UgYnVzeQBJbnRlcnJ1cHRlZCBzeXN0ZW0gY2FsbABSZXNvdXJjZSB0ZW1wb3JhcmlseSB1bmF2YWlsYWJsZQBJbnZhbGlkIHNlZWsAQ3Jvc3MtZGV2aWNlIGxpbmsAUmVhZC1vbmx5IGZpbGUgc3lzdGVtAERpcmVjdG9yeSBub3QgZW1wdHkAQ29ubmVjdGlvbiByZXNldCBieSBwZWVyAE9wZXJhdGlvbiB0aW1lZCBvdXQAQ29ubmVjdGlvbiByZWZ1c2VkAEhvc3QgaXMgZG93bgBIb3N0IGlzIHVucmVhY2hhYmxlAEFkZHJlc3MgaW4gdXNlAEJyb2tlbiBwaXBlAEkvTyBlcnJvcgBObyBzdWNoIGRldmljZSBvciBhZGRyZXNzAEJsb2NrIGRldmljZSByZXF1aXJlZABObyBzdWNoIGRldmljZQBOb3QgYSBkaXJlY3RvcnkASXMgYSBkaXJlY3RvcnkAVGV4dCBmaWxlIGJ1c3kARXhlYyBmb3JtYXQgZXJyb3IASW52YWxpZCBhcmd1bWVudABBcmd1bWVudCBsaXN0IHRvbyBsb25nAFN5bWJvbGljIGxpbmsgbG9vcABGaWxlbmFtZSB0b28gbG9uZwBUb28gbWFueSBvcGVuIGZpbGVzIGluIHN5c3RlbQBObyBmaWxlIGRlc2NyaXB0b3JzIGF2YWlsYWJsZQBCYWQgZmlsZSBkZXNjcmlwdG9yAE5vIGNoaWxkIHByb2Nlc3MAQmFkIGFkZHJlc3MARmlsZSB0b28gbGFyZ2UAVG9vIG1hbnkgbGlua3MATm8gbG9ja3MgYXZhaWxhYmxlAFJlc291cmNlIGRlYWRsb2NrIHdvdWxkIG9jY3VyAFN0YXRlIG5vdCByZWNvdmVyYWJsZQBQcmV2aW91cyBvd25lciBkaWVkAE9wZXJhdGlvbiBjYW5jZWxlZABGdW5jdGlvbiBub3QgaW1wbGVtZW50ZWQATm8gbWVzc2FnZSBvZiBkZXNpcmVkIHR5cGUASWRlbnRpZmllciByZW1vdmVkAERldmljZSBub3QgYSBzdHJlYW0ATm8gZGF0YSBhdmFpbGFibGUARGV2aWNlIHRpbWVvdXQAT3V0IG9mIHN0cmVhbXMgcmVzb3VyY2VzAExpbmsgaGFzIGJlZW4gc2V2ZXJlZABQcm90b2NvbCBlcnJvcgBCYWQgbWVzc2FnZQBGaWxlIGRlc2NyaXB0b3IgaW4gYmFkIHN0YXRlAE5vdCBhIHNvY2tldABEZXN0aW5hdGlvbiBhZGRyZXNzIHJlcXVpcmVkAE1lc3NhZ2UgdG9vIGxhcmdlAFByb3RvY29sIHdyb25nIHR5cGUgZm9yIHNvY2tldABQcm90b2NvbCBub3QgYXZhaWxhYmxlAFByb3RvY29sIG5vdCBzdXBwb3J0ZWQAU29ja2V0IHR5cGUgbm90IHN1cHBvcnRlZABOb3Qgc3VwcG9ydGVkAFByb3RvY29sIGZhbWlseSBub3Qgc3VwcG9ydGVkAEFkZHJlc3MgZmFtaWx5IG5vdCBzdXBwb3J0ZWQgYnkgcHJvdG9jb2wAQWRkcmVzcyBub3QgYXZhaWxhYmxlAE5ldHdvcmsgaXMgZG93bgBOZXR3b3JrIHVucmVhY2hhYmxlAENvbm5lY3Rpb24gcmVzZXQgYnkgbmV0d29yawBDb25uZWN0aW9uIGFib3J0ZWQATm8gYnVmZmVyIHNwYWNlIGF2YWlsYWJsZQBTb2NrZXQgaXMgY29ubmVjdGVkAFNvY2tldCBub3QgY29ubmVjdGVkAENhbm5vdCBzZW5kIGFmdGVyIHNvY2tldCBzaHV0ZG93bgBPcGVyYXRpb24gYWxyZWFkeSBpbiBwcm9ncmVzcwBPcGVyYXRpb24gaW4gcHJvZ3Jlc3MAU3RhbGUgZmlsZSBoYW5kbGUAUmVtb3RlIEkvTyBlcnJvcgBRdW90YSBleGNlZWRlZABObyBtZWRpdW0gZm91bmQAV3JvbmcgbWVkaXVtIHR5cGUATm8gZXJyb3IgaW5mb3JtYXRpb24AAAAAAADgFgAAmRgAAGAQAAAAAAAA4BYAAEIZAABgEAAAAAAAAOAWAAAqGgAASA8AAAAAAAC4FgAANBsAAOAWAACfGgAAMAoAAAAAAADgFgAAaRsAAEgPAAAAAAAA4BYAAIobAABIDwAAAAAAALgWAAAPHAAA4BYAAHwcAABIDwAAAAAAAOAWAACVHAAASA8AAAAAAADgFgAAHh0AAEgPAAAAAAAA4BYAAHcdAABIDwAAAAAAAOAWAACQHQAASA8AAAAAAADgFgAAQh4AAEgPAAAAAAAA4BYAAIceAABgEAAAAAAAAOAWAACkHwAASA8AAAAAAAC4FgAAZyAAAOAWAADkHwAA8AoAAAAAAADgFgAAjyAAAGAQAAAAAAAAuBYAAMMiAADgFgAAAiIAABgLAAAAAAAA4BYAAOEiAABgEAAAAAAAAOAWAADQJAAAGAsAAAAAAADgFgAAkSUAAGAQAAAAAAAA4BYAAIAnAAAYCwAAAAAAAOAWAAA9KAAAYBAAAAAAAADgFgAAJCoAABgLAAAAAAAA4BYAAOkqAABgEAAAAAAAAOAWAADgLAAA8AoAAAAAAADgFgAAui0AAGAQAAAAAAAA4BYAANsvAADwCgAAAAAAAOAWAADTMAAAYBAAAAAAAADgFgAAMDMAAPAKAAAAAAAA4BYAACQ0AABgEAAAAAAAAOAWAAB5NgAA8AoAAAAAAADgFgAAizcAAGAQAAAAAAAA4BYAABw6AABgEAAAAAAAAOAWAACdOgAAYBAAAAAAAADgFgAAXjsAAPAKAAAAAAAA4BYAALU7AABgEAAAAAAAAOAWAADMPAAAGAsAAAAAAADgFgAATz0AAGAQAAAAAAAA4BYAAL4+AAAYCwAAAAAAAOAWAABBPwAAYBAAAAAAAADgFgAAsEAAABgLAAAAAAAA4BYAADNBAABgEAAAAAAAAOAWAACiQgAAGAsAAAAAAADgFgAAJUMAAGAQAAAAAAAA4BYAAJREAAAYCwAAAAAAAOAWAAAXRQAAYBAAAAAAAADgFgAAhkYAABgLAAAAAAAA4BYAAAlHAABgEAAAAAAAALgWAAB4SAAAiBcAAIBIAAAAAAAAIA0AAIgXAACJSAAAAQAAACANAAC4FgAAqkgAAIgXAAC6SAAAAAAAAEgNAACIFwAAy0gAAAEAAABIDQAAuBYAABhMAAC4FgAAN0wAALgWAABWTAAAuBYAAHVMAAC4FgAAlEwAALgWAACzTAAAuBYAANJMAAC4FgAA8UwAALgWAAAQTQAAuBYAAC9NAAC4FgAATk0AALgWAABtTQAAuBYAAIxNAACkFwAAn00AAAAAAAABAAAA8A0AAAAAAAC4FgAA4U0AAKQXAAAHTgAAAAAAAAEAAADwDQAAAAAAAKQXAABJTgAAAAAAAAEAAADwDQAAAAAAAKQXAACITgAAAAAAAAEAAADwDQAAAAAAAKQXAADHTgAAAAAAAAEAAADwDQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP//////AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAALgWAADNTwAA4BYAAC1QAAAADwAAAAAAAOAWAADaTwAAEA8AAAAAAAC4FgAA+08AAOAWAAAIUAAA8A4AAAAAAADgFgAAhlAAAOgOAAAAAAAA4BYAAJNQAADoDgAAAAAAAOAWAACjUAAA6A4AAAAAAADgFgAAtVAAADgPAAAAAAAA4BYAAMZQAAA4DwAAAAAAAOAWAADXUAAAAA8AAAAAAADgFgAA+VAAAHgPAAAAAAAA4BYAAB1RAAAADwAAAAAAAOAWAABCUQAAeA8AAAAAAADgFgAAjlEAAAAPAAAAAAAAbBcAALZRAABsFwAAuFEAAGwXAAC7UQAAbBcAAL1RAABsFwAAv1EAAGwXAADBUQAAbBcAAMNRAABsFwAAxVEAAGwXAADHUQAAbBcAAMlRAABsFwAAy1EAAGwXAADNUQAAbBcAAM9RAABsFwAA0VEAAOAWAADTUQAA8A4AAAAAAADgFgAARlIAAOgOAAAAAAAAuBYAAGJSAACkFwAAe1IAAAAAAAABAAAAWBAAAAAAAADgFgAA9FIAAIgQAAAAAAAA4BYAABdTAACYEAAAAAAAALgWAAAuUwAA4BYAAHBTAACIEAAAAAAAAOAWAACSUwAASA8AAAAAAAAAAAAAAAoAAAEAAAACAAAAAwAAAAEAAAAEAAAAAAAAABAKAAABAAAABQAAAAYAAAACAAAABwAAAAAAAAAgCgAACAAAAAkAAAABAAAAAAAAADgKAAAKAAAACwAAAAIAAAABAAAADAAAAA0AAAACAAAAAwAAAAMAAAAAAAAASAoAAAgAAAAOAAAAAQAAAAAAAABYCgAACAAAAA8AAAABAAAAAAAAAIAKAAAIAAAAEAAAAAEAAAAAAAAAcAoAAAgAAAARAAAAAQAAAAAAAACQCgAACAAAABIAAAABAAAAAAAAAKAKAAAIAAAAEwAAAAEAAAAAAAAAsAoAAAgAAAAUAAAAAQAAAAAAAADACgAACAAAABUAAAABAAAAAAAAANAKAAABAAAAFgAAABcAAAAEAAAAGAAAAAAAAADgCgAACAAAABkAAAABAAAAAAAAAPgKAAAFAAAAGgAAABsAAAAAAAAA8AoAAAEAAAAcAAAAHQAAAAAAAAAICwAAAQAAAB4AAAAfAAAABgAAACAAAAAAAAAAIAsAACEAAAAiAAAABwAAAAgAAAAAAAAAGAsAACMAAAAkAAAABwAAAAkAAAAAAAAAMAsAAAEAAAAlAAAAJgAAAAoAAAAnAAAAAAAAAEALAAAoAAAAKQAAAAcAAAALAAAAAAAAAFALAAABAAAAKgAAACsAAAAMAAAALAAAAAAAAABgCwAALQAAAC4AAAAHAAAADQAAAAAAAABwCwAAAQAAAC8AAAAwAAAADgAAADEAAAAAAAAAgAsAADIAAAAzAAAABwAAAA8AAAAAAAAAkAsAAAEAAAA0AAAANQAAABAAAAA2AAAAAAAAAKALAAARAAAANwAAADgAAAAAAAAAsAsAAAEAAAA5AAAAOgAAABIAAAA7AAAAAAAAAMALAAATAAAAPAAAAD0AAAAAAAAA0AsAAAEAAAA+AAAAPwAAABQAAABAAAAAAAAAAOALAAAVAAAAQQAAAEIAAAAAAAAA8AsAAAEAAABDAAAARAAAABYAAABFAAAAAAAAAAAMAAAXAAAARgAAAEcAAAAAAAAAEAwAAAEAAABIAAAASQAAABgAAABKAAAAAAAAACAMAAABAAAASwAAAEwAAAAZAAAATQAAAAAAAAAwDAAAAQAAAE4AAABPAAAAGgAAAFAAAAAAAAAAQAwAABsAAABRAAAAUgAAAAAAAABQDAAAAQAAAFMAAABUAAAAHAAAAFUAAAAAAAAAYAwAAFYAAABXAAAABwAAAB0AAAAAAAAAcAwAAAEAAABYAAAAWQAAAB4AAABaAAAAAAAAAIAMAABbAAAAXAAAAAcAAAAfAAAAAAAAAJAMAAABAAAAXQAAAF4AAAAgAAAAXwAAAAAAAACgDAAAYAAAAGEAAAAHAAAAIQAAAAAAAACwDAAAAQAAAGIAAABjAAAAIgAAAGQAAAAAAAAAwAwAAGUAAABmAAAABwAAACMAAAAAAAAA0AwAAAEAAABnAAAAaAAAACQAAABpAAAAAAAAAOAMAABqAAAAawAAAAcAAAAlAAAAAAAAAPAMAAABAAAAbAAAAG0AAAAmAAAAbgAAAAAAAAAADQAAbwAAAHAAAAAHAAAAJwAAAAAAAAAQDQAAAQAAAHEAAAByAAAAKAAAAHMAAAAoDQAAyA8AACgNAAAIEAAAEBAAACgNAABQDQAAyA8AAFANAAAgEAAAyA8AAFANAAAIEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABsVAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADwDgAAdAAAAHUAAAB2AAAAdwAAAAIAAAABAAAAAQAAAAEAAAAAAAAAGA8AAHQAAAB4AAAAdgAAAHcAAAACAAAAAgAAAAIAAAACAAAAAAAAACgPAAB5AAAAegAAAAQAAAAAAAAAOA8AAHsAAAB8AAAABQAAAAAAAABIDwAACAAAAH0AAAABAAAAAAAAAFgPAAB7AAAAfgAAAAUAAAAAAAAAaA8AAHsAAAB/AAAABQAAAAAAAAC4DwAAdAAAAIAAAAB2AAAAdwAAAAMAAAAAAAAAiA8AAHQAAACBAAAAdgAAAHcAAAAEAAAAAAAAADgQAAB0AAAAggAAAHYAAAB3AAAAAgAAAAMAAAADAAAAAwAAAAAAAABIEAAAgwAAAIQAAAAGAAAAAAAAAHgQAACFAAAAhgAAAAcAAAABAAAABQAAAAYAAAACAAAAAAAAAKAQAACFAAAAhwAAAAgAAAADAAAABQAAAAYAAAAEAAAA4BcAAAQYAAAAAAAAsBAAAIgAAACJAAAAAQAAAExBU1ppcABvcGVuAGdldFBvaW50AGdldENvdW50AER5bmFtaWNMQVNaaXAAYWRkRmllbGRGbG9hdGluZwBhZGRGaWVsZFNpZ25lZABhZGRGaWVsZFVuc2lnbmVkAE5TdDNfXzIyMF9fc2hhcmVkX3B0cl9wb2ludGVySVBONmxhc3ppcDdzdHJlYW1zMTNtZW1vcnlfc3RyZWFtRU5TXzE0ZGVmYXVsdF9kZWxldGVJUzNfRUVOU185YWxsb2NhdG9ySVMzX0VFRUUATlN0M19fMjE0ZGVmYXVsdF9kZWxldGVJTjZsYXN6aXA3c3RyZWFtczEzbWVtb3J5X3N0cmVhbUVFRQBOU3QzX18yMjBfX3NoYXJlZF9wdHJfcG9pbnRlcklQTjZsYXN6aXAyaW82cmVhZGVyMTBiYXNpY19maWxlSU5TMV83c3RyZWFtczEzbWVtb3J5X3N0cmVhbUVFRU5TXzE0ZGVmYXVsdF9kZWxldGVJUzdfRUVOU185YWxsb2NhdG9ySVM3X0VFRUUATlN0M19fMjE0ZGVmYXVsdF9kZWxldGVJTjZsYXN6aXAyaW82cmVhZGVyMTBiYXNpY19maWxlSU5TMV83c3RyZWFtczEzbWVtb3J5X3N0cmVhbUVFRUVFAExBU0YATjZsYXN6aXAxM2ludmFsaWRfbWFnaWNFAGFsbG9jYXRvcjxUPjo6YWxsb2NhdGUoc2l6ZV90IG4pICduJyBleGNlZWRzIG1heGltdW0gc3VwcG9ydGVkIHNpemUARmlsZSBtYWdpYyBpcyBub3QgdmFsaWQATlN0M19fMjEwX19mdW5jdGlvbjZfX2Z1bmNJWk42bGFzemlwMmlvNnJlYWRlcjEwYmFzaWNfZmlsZUlOUzJfN3N0cmVhbXMxM21lbW9yeV9zdHJlYW1FRTExX3ZhbGlkYXRvcnNFdkVVbFJOUzNfNmhlYWRlckVFX05TXzlhbGxvY2F0b3JJU0JfRUVGdlNBX0VFRQBOU3QzX18yMTBfX2Z1bmN0aW9uNl9fYmFzZUlGdlJONmxhc3ppcDJpbzZoZWFkZXJFRUVFAE42bGFzemlwMjFvbGRfc3R5bGVfY29tcHJlc3Npb25FAE42bGFzemlwMTRub3RfY29tcHJlc3NlZEUAVGhlIGZpbGUgc2VlbXMgdG8gaGF2ZSBvbGQgc3R5bGUgY29tcHJlc3Npb24gd2hpY2ggaXMgbm90IHN1cHBvcnRlZABUaGUgZmlsZSBkb2Vzbid0IHNlZW0gdG8gYmUgY29tcHJlc3NlZABaTjZsYXN6aXAyaW82cmVhZGVyMTBiYXNpY19maWxlSU5TXzdzdHJlYW1zMTNtZW1vcnlfc3RyZWFtRUUxMV92YWxpZGF0b3JzRXZFVWxSTlMwXzZoZWFkZXJFRV8AbGFzemlwIGVuY29kZWQATjZsYXN6aXAxM25vX2xhc3ppcF92bHJFAE42bGFzemlwMjVsYXN6aXBfZm9ybWF0X3Vuc3VwcG9ydGVkRQBPbmx5IExBU3ppcCBQT0lOVFdJU0UgQ0hVTktFRCBkZWNvbXByZXNzb3IgaXMgc3VwcG9ydGVkAE5vIExBU3ppcCBWTFIgd2FzIGZvdW5kIGluIHRoZSBWTFJzIHNlY3Rpb24ATjZsYXN6aXAyMmNodW5rX3RhYmxlX3JlYWRfZXJyb3JFAENodW5rIHRhYmxlIG9mZnNldCA9PSAtMSBpcyBub3Qgc3VwcG9ydGVkIGF0IHRoaXMgdGltZQBONmxhc3ppcDEzbm90X3N1cHBvcnRlZEUATjZsYXN6aXAyNnVua25vd25fY2h1bmtfdGFibGVfZm9ybWF0RQBjaHVua19zaXplID09IHVpbnQubWF4IGlzIG5vdCBzdXBwb3J0ZWQgYXQgdGhpcyB0aW1lLgBUaGVyZSB3YXMgYSBwcm9ibGVtIHJlYWRpbmcgdGhlIGNodW5rIHRhYmxlAFRoZSBjaHVuayB0YWJsZSB2ZXJzaW9uIG51bWJlciBpcyB1bmtub3duAE42bGFzemlwMTFlbmRfb2ZfZmlsZUUAUmVhY2hlZCBFbmQgb2YgZmlsZQBJbnZhbGlkIG51bWJlciBvZiBzeW1ib2xzAE5TdDNfXzIyMF9fc2hhcmVkX3B0cl9wb2ludGVySVBONmxhc3ppcDhkZWNvZGVyczEwYXJpdGhtZXRpY0lOUzFfMmlvMThfX2lmc3RyZWFtX3dyYXBwZXJJTlMxXzdzdHJlYW1zMTNtZW1vcnlfc3RyZWFtRUVFRUVOU18xNGRlZmF1bHRfZGVsZXRlSVM5X0VFTlNfOWFsbG9jYXRvcklTOV9FRUVFAE5TdDNfXzIxNGRlZmF1bHRfZGVsZXRlSU42bGFzemlwOGRlY29kZXJzMTBhcml0aG1ldGljSU5TMV8yaW8xOF9faWZzdHJlYW1fd3JhcHBlcklOUzFfN3N0cmVhbXMxM21lbW9yeV9zdHJlYW1FRUVFRUVFAE42bGFzemlwMTl1bmtub3duX3NjaGVtYV90eXBlRQBUaGUgTEFaIHNjaGVtYSBpcyBub3QgcmVjb2duaXplZABONmxhc3ppcDdmb3JtYXRzMjZkeW5hbWljX2ZpZWxkX2RlY29tcHJlc3NvcklOU184ZGVjb2RlcnMxMGFyaXRobWV0aWNJTlNfMmlvMThfX2lmc3RyZWFtX3dyYXBwZXJJTlNfN3N0cmVhbXMxM21lbW9yeV9zdHJlYW1FRUVFRUVFAE42bGFzemlwN2Zvcm1hdHMyMGR5bmFtaWNfZGVjb21wcmVzc29yRQBOU3QzX18yMjBfX3NoYXJlZF9wdHJfcG9pbnRlcklQTjZsYXN6aXA3Zm9ybWF0czI2ZHluYW1pY19maWVsZF9kZWNvbXByZXNzb3JJTlMxXzhkZWNvZGVyczEwYXJpdGhtZXRpY0lOUzFfMmlvMThfX2lmc3RyZWFtX3dyYXBwZXJJTlMxXzdzdHJlYW1zMTNtZW1vcnlfc3RyZWFtRUVFRUVFRU5TXzE0ZGVmYXVsdF9kZWxldGVJU0NfRUVOU185YWxsb2NhdG9ySVNDX0VFRUUATlN0M19fMjE0ZGVmYXVsdF9kZWxldGVJTjZsYXN6aXA3Zm9ybWF0czI2ZHluYW1pY19maWVsZF9kZWNvbXByZXNzb3JJTlMxXzhkZWNvZGVyczEwYXJpdGhtZXRpY0lOUzFfMmlvMThfX2lmc3RyZWFtX3dyYXBwZXJJTlMxXzdzdHJlYW1zMTNtZW1vcnlfc3RyZWFtRUVFRUVFRUVFAE42bGFzemlwN2Zvcm1hdHMyNmR5bmFtaWNfZGVjb21wcmVzc29yX2ZpZWxkSU5TXzhkZWNvZGVyczEwYXJpdGhtZXRpY0lOU18yaW8xOF9faWZzdHJlYW1fd3JhcHBlcklOU183c3RyZWFtczEzbWVtb3J5X3N0cmVhbUVFRUVFTlMwXzVmaWVsZElOUzBfM2xhczdwb2ludDEwRU5TMF8yMHN0YW5kYXJkX2RpZmZfbWV0aG9kSVNDX0VFRUVFRQBONmxhc3ppcDdmb3JtYXRzMTBiYXNlX2ZpZWxkRQBOU3QzX18yMjBfX3NoYXJlZF9wdHJfcG9pbnRlcklQTjZsYXN6aXA3Zm9ybWF0czI2ZHluYW1pY19kZWNvbXByZXNzb3JfZmllbGRJTlMxXzhkZWNvZGVyczEwYXJpdGhtZXRpY0lOUzFfMmlvMThfX2lmc3RyZWFtX3dyYXBwZXJJTlMxXzdzdHJlYW1zMTNtZW1vcnlfc3RyZWFtRUVFRUVOUzJfNWZpZWxkSU5TMl8zbGFzN3BvaW50MTBFTlMyXzIwc3RhbmRhcmRfZGlmZl9tZXRob2RJU0VfRUVFRUVFTlNfMTRkZWZhdWx0X2RlbGV0ZUlTSV9FRU5TXzlhbGxvY2F0b3JJU0lfRUVFRQBOU3QzX18yMTRkZWZhdWx0X2RlbGV0ZUlONmxhc3ppcDdmb3JtYXRzMjZkeW5hbWljX2RlY29tcHJlc3Nvcl9maWVsZElOUzFfOGRlY29kZXJzMTBhcml0aG1ldGljSU5TMV8yaW8xOF9faWZzdHJlYW1fd3JhcHBlcklOUzFfN3N0cmVhbXMxM21lbW9yeV9zdHJlYW1FRUVFRU5TMl81ZmllbGRJTlMyXzNsYXM3cG9pbnQxMEVOUzJfMjBzdGFuZGFyZF9kaWZmX21ldGhvZElTRV9FRUVFRUVFRQBONmxhc3ppcDdmb3JtYXRzMjZkeW5hbWljX2RlY29tcHJlc3Nvcl9maWVsZElOU184ZGVjb2RlcnMxMGFyaXRobWV0aWNJTlNfMmlvMThfX2lmc3RyZWFtX3dyYXBwZXJJTlNfN3N0cmVhbXMxM21lbW9yeV9zdHJlYW1FRUVFRU5TMF81ZmllbGRJTlMwXzNsYXM3Z3BzdGltZUVOUzBfMjBzdGFuZGFyZF9kaWZmX21ldGhvZElTQ19FRUVFRUUATlN0M19fMjIwX19zaGFyZWRfcHRyX3BvaW50ZXJJUE42bGFzemlwN2Zvcm1hdHMyNmR5bmFtaWNfZGVjb21wcmVzc29yX2ZpZWxkSU5TMV84ZGVjb2RlcnMxMGFyaXRobWV0aWNJTlMxXzJpbzE4X19pZnN0cmVhbV93cmFwcGVySU5TMV83c3RyZWFtczEzbWVtb3J5X3N0cmVhbUVFRUVFTlMyXzVmaWVsZElOUzJfM2xhczdncHN0aW1lRU5TMl8yMHN0YW5kYXJkX2RpZmZfbWV0aG9kSVNFX0VFRUVFRU5TXzE0ZGVmYXVsdF9kZWxldGVJU0lfRUVOU185YWxsb2NhdG9ySVNJX0VFRUUATlN0M19fMjE0ZGVmYXVsdF9kZWxldGVJTjZsYXN6aXA3Zm9ybWF0czI2ZHluYW1pY19kZWNvbXByZXNzb3JfZmllbGRJTlMxXzhkZWNvZGVyczEwYXJpdGhtZXRpY0lOUzFfMmlvMThfX2lmc3RyZWFtX3dyYXBwZXJJTlMxXzdzdHJlYW1zMTNtZW1vcnlfc3RyZWFtRUVFRUVOUzJfNWZpZWxkSU5TMl8zbGFzN2dwc3RpbWVFTlMyXzIwc3RhbmRhcmRfZGlmZl9tZXRob2RJU0VfRUVFRUVFRUUATjZsYXN6aXA3Zm9ybWF0czI2ZHluYW1pY19kZWNvbXByZXNzb3JfZmllbGRJTlNfOGRlY29kZXJzMTBhcml0aG1ldGljSU5TXzJpbzE4X19pZnN0cmVhbV93cmFwcGVySU5TXzdzdHJlYW1zMTNtZW1vcnlfc3RyZWFtRUVFRUVOUzBfNWZpZWxkSU5TMF8zbGFzM3JnYkVOUzBfMjBzdGFuZGFyZF9kaWZmX21ldGhvZElTQ19FRUVFRUUATlN0M19fMjIwX19zaGFyZWRfcHRyX3BvaW50ZXJJUE42bGFzemlwN2Zvcm1hdHMyNmR5bmFtaWNfZGVjb21wcmVzc29yX2ZpZWxkSU5TMV84ZGVjb2RlcnMxMGFyaXRobWV0aWNJTlMxXzJpbzE4X19pZnN0cmVhbV93cmFwcGVySU5TMV83c3RyZWFtczEzbWVtb3J5X3N0cmVhbUVFRUVFTlMyXzVmaWVsZElOUzJfM2xhczNyZ2JFTlMyXzIwc3RhbmRhcmRfZGlmZl9tZXRob2RJU0VfRUVFRUVFTlNfMTRkZWZhdWx0X2RlbGV0ZUlTSV9FRU5TXzlhbGxvY2F0b3JJU0lfRUVFRQBOU3QzX18yMTRkZWZhdWx0X2RlbGV0ZUlONmxhc3ppcDdmb3JtYXRzMjZkeW5hbWljX2RlY29tcHJlc3Nvcl9maWVsZElOUzFfOGRlY29kZXJzMTBhcml0aG1ldGljSU5TMV8yaW8xOF9faWZzdHJlYW1fd3JhcHBlcklOUzFfN3N0cmVhbXMxM21lbW9yeV9zdHJlYW1FRUVFRU5TMl81ZmllbGRJTlMyXzNsYXMzcmdiRU5TMl8yMHN0YW5kYXJkX2RpZmZfbWV0aG9kSVNFX0VFRUVFRUVFAE42bGFzemlwN2Zvcm1hdHMyNmR5bmFtaWNfZGVjb21wcmVzc29yX2ZpZWxkSU5TXzhkZWNvZGVyczEwYXJpdGhtZXRpY0lOU18yaW8xOF9faWZzdHJlYW1fd3JhcHBlcklOU183c3RyZWFtczEzbWVtb3J5X3N0cmVhbUVFRUVFTlMwXzVmaWVsZElOUzBfM2xhczEwZXh0cmFieXRlc0VOUzBfMjBzdGFuZGFyZF9kaWZmX21ldGhvZElTQ19FRUVFRUUATlN0M19fMjIwX19zaGFyZWRfcHRyX3BvaW50ZXJJUE42bGFzemlwN2Zvcm1hdHMyNmR5bmFtaWNfZGVjb21wcmVzc29yX2ZpZWxkSU5TMV84ZGVjb2RlcnMxMGFyaXRobWV0aWNJTlMxXzJpbzE4X19pZnN0cmVhbV93cmFwcGVySU5TMV83c3RyZWFtczEzbWVtb3J5X3N0cmVhbUVFRUVFTlMyXzVmaWVsZElOUzJfM2xhczEwZXh0cmFieXRlc0VOUzJfMjBzdGFuZGFyZF9kaWZmX21ldGhvZElTRV9FRUVFRUVOU18xNGRlZmF1bHRfZGVsZXRlSVNJX0VFTlNfOWFsbG9jYXRvcklTSV9FRUVFAE5TdDNfXzIxNGRlZmF1bHRfZGVsZXRlSU42bGFzemlwN2Zvcm1hdHMyNmR5bmFtaWNfZGVjb21wcmVzc29yX2ZpZWxkSU5TMV84ZGVjb2RlcnMxMGFyaXRobWV0aWNJTlMxXzJpbzE4X19pZnN0cmVhbV93cmFwcGVySU5TMV83c3RyZWFtczEzbWVtb3J5X3N0cmVhbUVFRUVFTlMyXzVmaWVsZElOUzJfM2xhczEwZXh0cmFieXRlc0VOUzJfMjBzdGFuZGFyZF9kaWZmX21ldGhvZElTRV9FRUVFRUVFRQBONmxhc3ppcDdmb3JtYXRzMjFkeW5hbWljX2RlY29tcHJlc3NvcjFJTlNfOGRlY29kZXJzMTBhcml0aG1ldGljSU5TXzJpbzE4X19pZnN0cmVhbV93cmFwcGVySU5TXzdzdHJlYW1zMTNtZW1vcnlfc3RyZWFtRUVFRUVOUzBfMTlyZWNvcmRfZGVjb21wcmVzc29ySUpOUzBfNWZpZWxkSU5TMF8zbGFzN3BvaW50MTBFTlMwXzIwc3RhbmRhcmRfZGlmZl9tZXRob2RJU0RfRUVFRUVFRUVFAE5TdDNfXzIyMF9fc2hhcmVkX3B0cl9wb2ludGVySVBONmxhc3ppcDdmb3JtYXRzMjFkeW5hbWljX2RlY29tcHJlc3NvcjFJTlMxXzhkZWNvZGVyczEwYXJpdGhtZXRpY0lOUzFfMmlvMThfX2lmc3RyZWFtX3dyYXBwZXJJTlMxXzdzdHJlYW1zMTNtZW1vcnlfc3RyZWFtRUVFRUVOUzJfMTlyZWNvcmRfZGVjb21wcmVzc29ySUpOUzJfNWZpZWxkSU5TMl8zbGFzN3BvaW50MTBFTlMyXzIwc3RhbmRhcmRfZGlmZl9tZXRob2RJU0ZfRUVFRUVFRUVFTlNfMTRkZWZhdWx0X2RlbGV0ZUlTS19FRU5TXzlhbGxvY2F0b3JJU0tfRUVFRQBOU3QzX18yMTRkZWZhdWx0X2RlbGV0ZUlONmxhc3ppcDdmb3JtYXRzMjFkeW5hbWljX2RlY29tcHJlc3NvcjFJTlMxXzhkZWNvZGVyczEwYXJpdGhtZXRpY0lOUzFfMmlvMThfX2lmc3RyZWFtX3dyYXBwZXJJTlMxXzdzdHJlYW1zMTNtZW1vcnlfc3RyZWFtRUVFRUVOUzJfMTlyZWNvcmRfZGVjb21wcmVzc29ySUpOUzJfNWZpZWxkSU5TMl8zbGFzN3BvaW50MTBFTlMyXzIwc3RhbmRhcmRfZGlmZl9tZXRob2RJU0ZfRUVFRUVFRUVFRUUATjZsYXN6aXA3Zm9ybWF0czIxZHluYW1pY19kZWNvbXByZXNzb3IxSU5TXzhkZWNvZGVyczEwYXJpdGhtZXRpY0lOU18yaW8xOF9faWZzdHJlYW1fd3JhcHBlcklOU183c3RyZWFtczEzbWVtb3J5X3N0cmVhbUVFRUVFTlMwXzE5cmVjb3JkX2RlY29tcHJlc3NvcklKTlMwXzVmaWVsZElOUzBfM2xhczdwb2ludDEwRU5TMF8yMHN0YW5kYXJkX2RpZmZfbWV0aG9kSVNEX0VFRUVOU0JfSU5TQ183Z3BzdGltZUVOU0VfSVNIX0VFRUVFRUVFRQBOU3QzX18yMjBfX3NoYXJlZF9wdHJfcG9pbnRlcklQTjZsYXN6aXA3Zm9ybWF0czIxZHluYW1pY19kZWNvbXByZXNzb3IxSU5TMV84ZGVjb2RlcnMxMGFyaXRobWV0aWNJTlMxXzJpbzE4X19pZnN0cmVhbV93cmFwcGVySU5TMV83c3RyZWFtczEzbWVtb3J5X3N0cmVhbUVFRUVFTlMyXzE5cmVjb3JkX2RlY29tcHJlc3NvcklKTlMyXzVmaWVsZElOUzJfM2xhczdwb2ludDEwRU5TMl8yMHN0YW5kYXJkX2RpZmZfbWV0aG9kSVNGX0VFRUVOU0RfSU5TRV83Z3BzdGltZUVOU0dfSVNKX0VFRUVFRUVFRU5TXzE0ZGVmYXVsdF9kZWxldGVJU05fRUVOU185YWxsb2NhdG9ySVNOX0VFRUUATlN0M19fMjE0ZGVmYXVsdF9kZWxldGVJTjZsYXN6aXA3Zm9ybWF0czIxZHluYW1pY19kZWNvbXByZXNzb3IxSU5TMV84ZGVjb2RlcnMxMGFyaXRobWV0aWNJTlMxXzJpbzE4X19pZnN0cmVhbV93cmFwcGVySU5TMV83c3RyZWFtczEzbWVtb3J5X3N0cmVhbUVFRUVFTlMyXzE5cmVjb3JkX2RlY29tcHJlc3NvcklKTlMyXzVmaWVsZElOUzJfM2xhczdwb2ludDEwRU5TMl8yMHN0YW5kYXJkX2RpZmZfbWV0aG9kSVNGX0VFRUVOU0RfSU5TRV83Z3BzdGltZUVOU0dfSVNKX0VFRUVFRUVFRUVFAE42bGFzemlwN2Zvcm1hdHMyMWR5bmFtaWNfZGVjb21wcmVzc29yMUlOU184ZGVjb2RlcnMxMGFyaXRobWV0aWNJTlNfMmlvMThfX2lmc3RyZWFtX3dyYXBwZXJJTlNfN3N0cmVhbXMxM21lbW9yeV9zdHJlYW1FRUVFRU5TMF8xOXJlY29yZF9kZWNvbXByZXNzb3JJSk5TMF81ZmllbGRJTlMwXzNsYXM3cG9pbnQxMEVOUzBfMjBzdGFuZGFyZF9kaWZmX21ldGhvZElTRF9FRUVFTlNCX0lOU0NfM3JnYkVOU0VfSVNIX0VFRUVFRUVFRQBOU3QzX18yMjBfX3NoYXJlZF9wdHJfcG9pbnRlcklQTjZsYXN6aXA3Zm9ybWF0czIxZHluYW1pY19kZWNvbXByZXNzb3IxSU5TMV84ZGVjb2RlcnMxMGFyaXRobWV0aWNJTlMxXzJpbzE4X19pZnN0cmVhbV93cmFwcGVySU5TMV83c3RyZWFtczEzbWVtb3J5X3N0cmVhbUVFRUVFTlMyXzE5cmVjb3JkX2RlY29tcHJlc3NvcklKTlMyXzVmaWVsZElOUzJfM2xhczdwb2ludDEwRU5TMl8yMHN0YW5kYXJkX2RpZmZfbWV0aG9kSVNGX0VFRUVOU0RfSU5TRV8zcmdiRU5TR19JU0pfRUVFRUVFRUVFTlNfMTRkZWZhdWx0X2RlbGV0ZUlTTl9FRU5TXzlhbGxvY2F0b3JJU05fRUVFRQBOU3QzX18yMTRkZWZhdWx0X2RlbGV0ZUlONmxhc3ppcDdmb3JtYXRzMjFkeW5hbWljX2RlY29tcHJlc3NvcjFJTlMxXzhkZWNvZGVyczEwYXJpdGhtZXRpY0lOUzFfMmlvMThfX2lmc3RyZWFtX3dyYXBwZXJJTlMxXzdzdHJlYW1zMTNtZW1vcnlfc3RyZWFtRUVFRUVOUzJfMTlyZWNvcmRfZGVjb21wcmVzc29ySUpOUzJfNWZpZWxkSU5TMl8zbGFzN3BvaW50MTBFTlMyXzIwc3RhbmRhcmRfZGlmZl9tZXRob2RJU0ZfRUVFRU5TRF9JTlNFXzNyZ2JFTlNHX0lTSl9FRUVFRUVFRUVFRQBONmxhc3ppcDdmb3JtYXRzMjFkeW5hbWljX2RlY29tcHJlc3NvcjFJTlNfOGRlY29kZXJzMTBhcml0aG1ldGljSU5TXzJpbzE4X19pZnN0cmVhbV93cmFwcGVySU5TXzdzdHJlYW1zMTNtZW1vcnlfc3RyZWFtRUVFRUVOUzBfMTlyZWNvcmRfZGVjb21wcmVzc29ySUpOUzBfNWZpZWxkSU5TMF8zbGFzN3BvaW50MTBFTlMwXzIwc3RhbmRhcmRfZGlmZl9tZXRob2RJU0RfRUVFRU5TQl9JTlNDXzdncHN0aW1lRU5TRV9JU0hfRUVFRU5TQl9JTlNDXzNyZ2JFTlNFX0lTS19FRUVFRUVFRUUATlN0M19fMjIwX19zaGFyZWRfcHRyX3BvaW50ZXJJUE42bGFzemlwN2Zvcm1hdHMyMWR5bmFtaWNfZGVjb21wcmVzc29yMUlOUzFfOGRlY29kZXJzMTBhcml0aG1ldGljSU5TMV8yaW8xOF9faWZzdHJlYW1fd3JhcHBlcklOUzFfN3N0cmVhbXMxM21lbW9yeV9zdHJlYW1FRUVFRU5TMl8xOXJlY29yZF9kZWNvbXByZXNzb3JJSk5TMl81ZmllbGRJTlMyXzNsYXM3cG9pbnQxMEVOUzJfMjBzdGFuZGFyZF9kaWZmX21ldGhvZElTRl9FRUVFTlNEX0lOU0VfN2dwc3RpbWVFTlNHX0lTSl9FRUVFTlNEX0lOU0VfM3JnYkVOU0dfSVNNX0VFRUVFRUVFRU5TXzE0ZGVmYXVsdF9kZWxldGVJU1FfRUVOU185YWxsb2NhdG9ySVNRX0VFRUUATlN0M19fMjE0ZGVmYXVsdF9kZWxldGVJTjZsYXN6aXA3Zm9ybWF0czIxZHluYW1pY19kZWNvbXByZXNzb3IxSU5TMV84ZGVjb2RlcnMxMGFyaXRobWV0aWNJTlMxXzJpbzE4X19pZnN0cmVhbV93cmFwcGVySU5TMV83c3RyZWFtczEzbWVtb3J5X3N0cmVhbUVFRUVFTlMyXzE5cmVjb3JkX2RlY29tcHJlc3NvcklKTlMyXzVmaWVsZElOUzJfM2xhczdwb2ludDEwRU5TMl8yMHN0YW5kYXJkX2RpZmZfbWV0aG9kSVNGX0VFRUVOU0RfSU5TRV83Z3BzdGltZUVOU0dfSVNKX0VFRUVOU0RfSU5TRV8zcmdiRU5TR19JU01fRUVFRUVFRUVFRUUATlN0M19fMjIwX19zaGFyZWRfcHRyX3BvaW50ZXJJUDEwYnVmX3N0cmVhbU5TXzE0ZGVmYXVsdF9kZWxldGVJUzFfRUVOU185YWxsb2NhdG9ySVMxX0VFRUUATlN0M19fMjE0ZGVmYXVsdF9kZWxldGVJMTBidWZfc3RyZWFtRUUATlN0M19fMjIwX19zaGFyZWRfcHRyX3BvaW50ZXJJUE42bGFzemlwOGRlY29kZXJzMTBhcml0aG1ldGljSTEwYnVmX3N0cmVhbUVFTlNfMTRkZWZhdWx0X2RlbGV0ZUlTNV9FRU5TXzlhbGxvY2F0b3JJUzVfRUVFRQBOU3QzX18yMTRkZWZhdWx0X2RlbGV0ZUlONmxhc3ppcDhkZWNvZGVyczEwYXJpdGhtZXRpY0kxMGJ1Zl9zdHJlYW1FRUVFAE42bGFzemlwN2Zvcm1hdHMyNmR5bmFtaWNfZmllbGRfZGVjb21wcmVzc29ySU5TXzhkZWNvZGVyczEwYXJpdGhtZXRpY0kxMGJ1Zl9zdHJlYW1FRUVFAE5TdDNfXzIyMF9fc2hhcmVkX3B0cl9wb2ludGVySVBONmxhc3ppcDdmb3JtYXRzMjZkeW5hbWljX2ZpZWxkX2RlY29tcHJlc3NvcklOUzFfOGRlY29kZXJzMTBhcml0aG1ldGljSTEwYnVmX3N0cmVhbUVFRUVOU18xNGRlZmF1bHRfZGVsZXRlSVM4X0VFTlNfOWFsbG9jYXRvcklTOF9FRUVFAE5TdDNfXzIxNGRlZmF1bHRfZGVsZXRlSU42bGFzemlwN2Zvcm1hdHMyNmR5bmFtaWNfZmllbGRfZGVjb21wcmVzc29ySU5TMV84ZGVjb2RlcnMxMGFyaXRobWV0aWNJMTBidWZfc3RyZWFtRUVFRUVFAE42bGFzemlwN2Zvcm1hdHMyNmR5bmFtaWNfZGVjb21wcmVzc29yX2ZpZWxkSU5TXzhkZWNvZGVyczEwYXJpdGhtZXRpY0kxMGJ1Zl9zdHJlYW1FRU5TMF81ZmllbGRJaU5TMF8yMHN0YW5kYXJkX2RpZmZfbWV0aG9kSWlFRUVFRUUATlN0M19fMjIwX19zaGFyZWRfcHRyX3BvaW50ZXJJUE42bGFzemlwN2Zvcm1hdHMyNmR5bmFtaWNfZGVjb21wcmVzc29yX2ZpZWxkSU5TMV84ZGVjb2RlcnMxMGFyaXRobWV0aWNJMTBidWZfc3RyZWFtRUVOUzJfNWZpZWxkSWlOUzJfMjBzdGFuZGFyZF9kaWZmX21ldGhvZElpRUVFRUVFTlNfMTRkZWZhdWx0X2RlbGV0ZUlTQ19FRU5TXzlhbGxvY2F0b3JJU0NfRUVFRQBOU3QzX18yMTRkZWZhdWx0X2RlbGV0ZUlONmxhc3ppcDdmb3JtYXRzMjZkeW5hbWljX2RlY29tcHJlc3Nvcl9maWVsZElOUzFfOGRlY29kZXJzMTBhcml0aG1ldGljSTEwYnVmX3N0cmVhbUVFTlMyXzVmaWVsZElpTlMyXzIwc3RhbmRhcmRfZGlmZl9tZXRob2RJaUVFRUVFRUVFAE42bGFzemlwN2Zvcm1hdHMyNmR5bmFtaWNfZGVjb21wcmVzc29yX2ZpZWxkSU5TXzhkZWNvZGVyczEwYXJpdGhtZXRpY0kxMGJ1Zl9zdHJlYW1FRU5TMF81ZmllbGRJak5TMF8yMHN0YW5kYXJkX2RpZmZfbWV0aG9kSWpFRUVFRUUATlN0M19fMjIwX19zaGFyZWRfcHRyX3BvaW50ZXJJUE42bGFzemlwN2Zvcm1hdHMyNmR5bmFtaWNfZGVjb21wcmVzc29yX2ZpZWxkSU5TMV84ZGVjb2RlcnMxMGFyaXRobWV0aWNJMTBidWZfc3RyZWFtRUVOUzJfNWZpZWxkSWpOUzJfMjBzdGFuZGFyZF9kaWZmX21ldGhvZElqRUVFRUVFTlNfMTRkZWZhdWx0X2RlbGV0ZUlTQ19FRU5TXzlhbGxvY2F0b3JJU0NfRUVFRQBOU3QzX18yMTRkZWZhdWx0X2RlbGV0ZUlONmxhc3ppcDdmb3JtYXRzMjZkeW5hbWljX2RlY29tcHJlc3Nvcl9maWVsZElOUzFfOGRlY29kZXJzMTBhcml0aG1ldGljSTEwYnVmX3N0cmVhbUVFTlMyXzVmaWVsZElqTlMyXzIwc3RhbmRhcmRfZGlmZl9tZXRob2RJakVFRUVFRUVFAE42bGFzemlwN2Zvcm1hdHMyNmR5bmFtaWNfZGVjb21wcmVzc29yX2ZpZWxkSU5TXzhkZWNvZGVyczEwYXJpdGhtZXRpY0kxMGJ1Zl9zdHJlYW1FRU5TMF81ZmllbGRJYU5TMF8yMHN0YW5kYXJkX2RpZmZfbWV0aG9kSWFFRUVFRUUATlN0M19fMjIwX19zaGFyZWRfcHRyX3BvaW50ZXJJUE42bGFzemlwN2Zvcm1hdHMyNmR5bmFtaWNfZGVjb21wcmVzc29yX2ZpZWxkSU5TMV84ZGVjb2RlcnMxMGFyaXRobWV0aWNJMTBidWZfc3RyZWFtRUVOUzJfNWZpZWxkSWFOUzJfMjBzdGFuZGFyZF9kaWZmX21ldGhvZElhRUVFRUVFTlNfMTRkZWZhdWx0X2RlbGV0ZUlTQ19FRU5TXzlhbGxvY2F0b3JJU0NfRUVFRQBOU3QzX18yMTRkZWZhdWx0X2RlbGV0ZUlONmxhc3ppcDdmb3JtYXRzMjZkeW5hbWljX2RlY29tcHJlc3Nvcl9maWVsZElOUzFfOGRlY29kZXJzMTBhcml0aG1ldGljSTEwYnVmX3N0cmVhbUVFTlMyXzVmaWVsZElhTlMyXzIwc3RhbmRhcmRfZGlmZl9tZXRob2RJYUVFRUVFRUVFAE42bGFzemlwN2Zvcm1hdHMyNmR5bmFtaWNfZGVjb21wcmVzc29yX2ZpZWxkSU5TXzhkZWNvZGVyczEwYXJpdGhtZXRpY0kxMGJ1Zl9zdHJlYW1FRU5TMF81ZmllbGRJc05TMF8yMHN0YW5kYXJkX2RpZmZfbWV0aG9kSXNFRUVFRUUATlN0M19fMjIwX19zaGFyZWRfcHRyX3BvaW50ZXJJUE42bGFzemlwN2Zvcm1hdHMyNmR5bmFtaWNfZGVjb21wcmVzc29yX2ZpZWxkSU5TMV84ZGVjb2RlcnMxMGFyaXRobWV0aWNJMTBidWZfc3RyZWFtRUVOUzJfNWZpZWxkSXNOUzJfMjBzdGFuZGFyZF9kaWZmX21ldGhvZElzRUVFRUVFTlNfMTRkZWZhdWx0X2RlbGV0ZUlTQ19FRU5TXzlhbGxvY2F0b3JJU0NfRUVFRQBOU3QzX18yMTRkZWZhdWx0X2RlbGV0ZUlONmxhc3ppcDdmb3JtYXRzMjZkeW5hbWljX2RlY29tcHJlc3Nvcl9maWVsZElOUzFfOGRlY29kZXJzMTBhcml0aG1ldGljSTEwYnVmX3N0cmVhbUVFTlMyXzVmaWVsZElzTlMyXzIwc3RhbmRhcmRfZGlmZl9tZXRob2RJc0VFRUVFRUVFAE42bGFzemlwN2Zvcm1hdHMyNmR5bmFtaWNfZGVjb21wcmVzc29yX2ZpZWxkSU5TXzhkZWNvZGVyczEwYXJpdGhtZXRpY0kxMGJ1Zl9zdHJlYW1FRU5TMF81ZmllbGRJaE5TMF8yMHN0YW5kYXJkX2RpZmZfbWV0aG9kSWhFRUVFRUUATlN0M19fMjIwX19zaGFyZWRfcHRyX3BvaW50ZXJJUE42bGFzemlwN2Zvcm1hdHMyNmR5bmFtaWNfZGVjb21wcmVzc29yX2ZpZWxkSU5TMV84ZGVjb2RlcnMxMGFyaXRobWV0aWNJMTBidWZfc3RyZWFtRUVOUzJfNWZpZWxkSWhOUzJfMjBzdGFuZGFyZF9kaWZmX21ldGhvZEloRUVFRUVFTlNfMTRkZWZhdWx0X2RlbGV0ZUlTQ19FRU5TXzlhbGxvY2F0b3JJU0NfRUVFRQBOU3QzX18yMTRkZWZhdWx0X2RlbGV0ZUlONmxhc3ppcDdmb3JtYXRzMjZkeW5hbWljX2RlY29tcHJlc3Nvcl9maWVsZElOUzFfOGRlY29kZXJzMTBhcml0aG1ldGljSTEwYnVmX3N0cmVhbUVFTlMyXzVmaWVsZEloTlMyXzIwc3RhbmRhcmRfZGlmZl9tZXRob2RJaEVFRUVFRUVFAE42bGFzemlwN2Zvcm1hdHMyNmR5bmFtaWNfZGVjb21wcmVzc29yX2ZpZWxkSU5TXzhkZWNvZGVyczEwYXJpdGhtZXRpY0kxMGJ1Zl9zdHJlYW1FRU5TMF81ZmllbGRJdE5TMF8yMHN0YW5kYXJkX2RpZmZfbWV0aG9kSXRFRUVFRUUATlN0M19fMjIwX19zaGFyZWRfcHRyX3BvaW50ZXJJUE42bGFzemlwN2Zvcm1hdHMyNmR5bmFtaWNfZGVjb21wcmVzc29yX2ZpZWxkSU5TMV84ZGVjb2RlcnMxMGFyaXRobWV0aWNJMTBidWZfc3RyZWFtRUVOUzJfNWZpZWxkSXROUzJfMjBzdGFuZGFyZF9kaWZmX21ldGhvZEl0RUVFRUVFTlNfMTRkZWZhdWx0X2RlbGV0ZUlTQ19FRU5TXzlhbGxvY2F0b3JJU0NfRUVFRQBOU3QzX18yMTRkZWZhdWx0X2RlbGV0ZUlONmxhc3ppcDdmb3JtYXRzMjZkeW5hbWljX2RlY29tcHJlc3Nvcl9maWVsZElOUzFfOGRlY29kZXJzMTBhcml0aG1ldGljSTEwYnVmX3N0cmVhbUVFTlMyXzVmaWVsZEl0TlMyXzIwc3RhbmRhcmRfZGlmZl9tZXRob2RJdEVFRUVFRUVFADZMQVNaaXAAUDZMQVNaaXAAUEs2TEFTWmlwAGlpAHYAdmkAdmlpaWkAdmlpaQBpaWkAMTNEeW5hbWljTEFTWmlwAFAxM0R5bmFtaWNMQVNaaXAAUEsxM0R5bmFtaWNMQVNaaXAAdm9pZABib29sAGNoYXIAc2lnbmVkIGNoYXIAdW5zaWduZWQgY2hhcgBzaG9ydAB1bnNpZ25lZCBzaG9ydABpbnQAdW5zaWduZWQgaW50AGxvbmcAdW5zaWduZWQgbG9uZwBmbG9hdABkb3VibGUAc3RkOjpzdHJpbmcAc3RkOjpiYXNpY19zdHJpbmc8dW5zaWduZWQgY2hhcj4Ac3RkOjp3c3RyaW5nAHN0ZDo6dTE2c3RyaW5nAHN0ZDo6dTMyc3RyaW5nAGVtc2NyaXB0ZW46OnZhbABlbXNjcmlwdGVuOjptZW1vcnlfdmlldzxjaGFyPgBlbXNjcmlwdGVuOjptZW1vcnlfdmlldzxzaWduZWQgY2hhcj4AZW1zY3JpcHRlbjo6bWVtb3J5X3ZpZXc8dW5zaWduZWQgY2hhcj4AZW1zY3JpcHRlbjo6bWVtb3J5X3ZpZXc8c2hvcnQ+AGVtc2NyaXB0ZW46Om1lbW9yeV92aWV3PHVuc2lnbmVkIHNob3J0PgBlbXNjcmlwdGVuOjptZW1vcnlfdmlldzxpbnQ+AGVtc2NyaXB0ZW46Om1lbW9yeV92aWV3PHVuc2lnbmVkIGludD4AZW1zY3JpcHRlbjo6bWVtb3J5X3ZpZXc8bG9uZz4AZW1zY3JpcHRlbjo6bWVtb3J5X3ZpZXc8dW5zaWduZWQgbG9uZz4AZW1zY3JpcHRlbjo6bWVtb3J5X3ZpZXc8aW50OF90PgBlbXNjcmlwdGVuOjptZW1vcnlfdmlldzx1aW50OF90PgBlbXNjcmlwdGVuOjptZW1vcnlfdmlldzxpbnQxNl90PgBlbXNjcmlwdGVuOjptZW1vcnlfdmlldzx1aW50MTZfdD4AZW1zY3JpcHRlbjo6bWVtb3J5X3ZpZXc8aW50MzJfdD4AZW1zY3JpcHRlbjo6bWVtb3J5X3ZpZXc8dWludDMyX3Q+AGVtc2NyaXB0ZW46Om1lbW9yeV92aWV3PGZsb2F0PgBlbXNjcmlwdGVuOjptZW1vcnlfdmlldzxkb3VibGU+AGVtc2NyaXB0ZW46Om1lbW9yeV92aWV3PGxvbmcgZG91YmxlPgBOMTBlbXNjcmlwdGVuMTFtZW1vcnlfdmlld0llRUUATjEwZW1zY3JpcHRlbjExbWVtb3J5X3ZpZXdJZEVFAE4xMGVtc2NyaXB0ZW4xMW1lbW9yeV92aWV3SWZFRQBOMTBlbXNjcmlwdGVuMTFtZW1vcnlfdmlld0ltRUUATjEwZW1zY3JpcHRlbjExbWVtb3J5X3ZpZXdJbEVFAE4xMGVtc2NyaXB0ZW4xMW1lbW9yeV92aWV3SWpFRQBOMTBlbXNjcmlwdGVuMTFtZW1vcnlfdmlld0lpRUUATjEwZW1zY3JpcHRlbjExbWVtb3J5X3ZpZXdJdEVFAE4xMGVtc2NyaXB0ZW4xMW1lbW9yeV92aWV3SXNFRQBOMTBlbXNjcmlwdGVuMTFtZW1vcnlfdmlld0loRUUATjEwZW1zY3JpcHRlbjExbWVtb3J5X3ZpZXdJYUVFAE4xMGVtc2NyaXB0ZW4xMW1lbW9yeV92aWV3SWNFRQBOMTBlbXNjcmlwdGVuM3ZhbEUATlN0M19fMjEyYmFzaWNfc3RyaW5nSURpTlNfMTFjaGFyX3RyYWl0c0lEaUVFTlNfOWFsbG9jYXRvcklEaUVFRUUATlN0M19fMjIxX19iYXNpY19zdHJpbmdfY29tbW9uSUxiMUVFRQBOU3QzX18yMTJiYXNpY19zdHJpbmdJRHNOU18xMWNoYXJfdHJhaXRzSURzRUVOU185YWxsb2NhdG9ySURzRUVFRQBOU3QzX18yMTJiYXNpY19zdHJpbmdJd05TXzExY2hhcl90cmFpdHNJd0VFTlNfOWFsbG9jYXRvckl3RUVFRQBOU3QzX18yMTJiYXNpY19zdHJpbmdJaE5TXzExY2hhcl90cmFpdHNJaEVFTlNfOWFsbG9jYXRvckloRUVFRQBOU3QzX18yMTJiYXNpY19zdHJpbmdJY05TXzExY2hhcl90cmFpdHNJY0VFTlNfOWFsbG9jYXRvckljRUVFRQAtKyAgIDBYMHgAKG51bGwpAC0wWCswWCAwWC0weCsweCAweABpbmYASU5GAG5hbgBOQU4ALgB0ZXJtaW5hdGluZyB3aXRoICVzIGV4Y2VwdGlvbiBvZiB0eXBlICVzOiAlcwB0ZXJtaW5hdGluZyB3aXRoICVzIGV4Y2VwdGlvbiBvZiB0eXBlICVzAHRlcm1pbmF0aW5nIHdpdGggJXMgZm9yZWlnbiBleGNlcHRpb24AdGVybWluYXRpbmcAdW5jYXVnaHQAU3Q5ZXhjZXB0aW9uAE4xMF9fY3h4YWJpdjExNl9fc2hpbV90eXBlX2luZm9FAFN0OXR5cGVfaW5mbwBOMTBfX2N4eGFiaXYxMjBfX3NpX2NsYXNzX3R5cGVfaW5mb0UATjEwX19jeHhhYml2MTE3X19jbGFzc190eXBlX2luZm9FAHRlcm1pbmF0ZV9oYW5kbGVyIHVuZXhwZWN0ZWRseSByZXR1cm5lZABzdGQ6OmJhZF9hbGxvYwBTdDliYWRfYWxsb2MAU3QxMWxvZ2ljX2Vycm9yAFN0MTNydW50aW1lX2Vycm9yAFN0MTJsZW5ndGhfZXJyb3IAU3QxMm91dF9vZl9yYW5nZQBOMTBfX2N4eGFiaXYxMTdfX3BiYXNlX3R5cGVfaW5mb0UATjEwX19jeHhhYml2MTE5X19wb2ludGVyX3R5cGVfaW5mb0UATjEwX19jeHhhYml2MTIwX19mdW5jdGlvbl90eXBlX2luZm9FAE4xMF9fY3h4YWJpdjEyOV9fcG9pbnRlcl90b19tZW1iZXJfdHlwZV9pbmZvRQBQdXJlIHZpcnR1YWwgZnVuY3Rpb24gY2FsbGVkIQBOMTBfX2N4eGFiaXYxMjNfX2Z1bmRhbWVudGFsX3R5cGVfaW5mb0UAdgBEbgBiAGMAaABhAHMAdABpAGoAbABtAGYAZABOMTBfX2N4eGFiaXYxMjFfX3ZtaV9jbGFzc190eXBlX2luZm9FAF9fY3hhX2d1YXJkX2FjcXVpcmUgZGV0ZWN0ZWQgcmVjdXJzaXZlIGluaXRpYWxpemF0aW9uAHN0ZDo6YmFkX2Z1bmN0aW9uX2NhbGwATlN0M19fMjE3YmFkX2Z1bmN0aW9uX2NhbGxFAE5TdDNfXzIxNF9fc2hhcmVkX2NvdW50RQBOU3QzX18yMTlfX3NoYXJlZF93ZWFrX2NvdW50RQBtdXRleCBsb2NrIGZhaWxlZABiYXNpY19zdHJpbmcAdW5zcGVjaWZpZWQgZ2VuZXJpY19jYXRlZ29yeSBlcnJvcgBVbmtub3duIGVycm9yICVkAGdlbmVyaWMATlN0M19fMjI0X19nZW5lcmljX2Vycm9yX2NhdGVnb3J5RQBOU3QzX18yMTJfX2RvX21lc3NhZ2VFAE5TdDNfXzIxNGVycm9yX2NhdGVnb3J5RQB1bnNwZWNpZmllZCBzeXN0ZW1fY2F0ZWdvcnkgZXJyb3IAc3lzdGVtAE5TdDNfXzIyM19fc3lzdGVtX2Vycm9yX2NhdGVnb3J5RQBOU3QzX18yMTJzeXN0ZW1fZXJyb3JFADogAHZlY3Rvcg==";
    var tempDoublePtr = 22368;
    function demangle(func) {
      return func;
    }
    function demangleAll(text) {
      var regex = /\b__Z[\w\d_]+/g;
      return text.replace(regex, function(x) {
        var y = demangle(x);
        return x === y ? x : y + " [" + x + "]";
      });
    }
    function jsStackTrace() {
      var err2 = new Error();
      if (!err2.stack) {
        try {
          throw new Error();
        } catch (e) {
          err2 = e;
        }
        if (!err2.stack) {
          return "(no stack trace available)";
        }
      }
      return err2.stack.toString();
    }
    function ___cxa_allocate_exception(size) {
      return _malloc(size);
    }
    var ___exception_infos = {};
    var ___exception_caught = [];
    function ___exception_addRef(ptr) {
      if (!ptr)
        return;
      var info = ___exception_infos[ptr];
      info.refcount++;
    }
    function ___exception_deAdjust(adjusted) {
      if (!adjusted || ___exception_infos[adjusted])
        return adjusted;
      for (var key2 in ___exception_infos) {
        var ptr = +key2;
        var adj = ___exception_infos[ptr].adjusted;
        var len = adj.length;
        for (var i = 0; i < len; i++) {
          if (adj[i] === adjusted) {
            return ptr;
          }
        }
      }
      return adjusted;
    }
    function ___cxa_begin_catch(ptr) {
      var info = ___exception_infos[ptr];
      if (info && !info.caught) {
        info.caught = true;
        __ZSt18uncaught_exceptionv.uncaught_exceptions--;
      }
      if (info)
        info.rethrown = false;
      ___exception_caught.push(ptr);
      ___exception_addRef(___exception_deAdjust(ptr));
      return ptr;
    }
    var ___exception_last = 0;
    function ___cxa_throw(ptr, type, destructor) {
      ___exception_infos[ptr] = {
        ptr,
        adjusted: [ptr],
        type,
        destructor,
        refcount: 0,
        caught: false,
        rethrown: false
      };
      ___exception_last = ptr;
      if (!("uncaught_exception" in __ZSt18uncaught_exceptionv)) {
        __ZSt18uncaught_exceptionv.uncaught_exceptions = 1;
      } else {
        __ZSt18uncaught_exceptionv.uncaught_exceptions++;
      }
      throw ptr;
    }
    function ___cxa_uncaught_exceptions() {
      return __ZSt18uncaught_exceptionv.uncaught_exceptions;
    }
    function ___gxx_personality_v0() {
    }
    function getShiftFromSize(size) {
      switch (size) {
        case 1:
          return 0;
        case 2:
          return 1;
        case 4:
          return 2;
        case 8:
          return 3;
        default:
          throw new TypeError("Unknown type size: " + size);
      }
    }
    function embind_init_charCodes() {
      var codes = new Array(256);
      for (var i = 0; i < 256; ++i) {
        codes[i] = String.fromCharCode(i);
      }
      embind_charCodes = codes;
    }
    var embind_charCodes = void 0;
    function readLatin1String(ptr) {
      var ret = "";
      var c = ptr;
      while (HEAPU8[c]) {
        ret += embind_charCodes[HEAPU8[c++]];
      }
      return ret;
    }
    var awaitingDependencies = {};
    var registeredTypes = {};
    var typeDependencies = {};
    var char_0 = 48;
    var char_9 = 57;
    function makeLegalFunctionName(name) {
      if (void 0 === name) {
        return "_unknown";
      }
      name = name.replace(/[^a-zA-Z0-9_]/g, "$");
      var f = name.charCodeAt(0);
      if (f >= char_0 && f <= char_9) {
        return "_" + name;
      } else {
        return name;
      }
    }
    function createNamedFunction(name, body) {
      name = makeLegalFunctionName(name);
      return new Function(
        "body",
        "return function " + name + '() {\n    "use strict";    return body.apply(this, arguments);\n};\n'
      )(body);
    }
    function extendError(baseErrorType, errorName) {
      var errorClass = createNamedFunction(errorName, function(message) {
        this.name = errorName;
        this.message = message;
        var stack = new Error(message).stack;
        if (stack !== void 0) {
          this.stack = this.toString() + "\n" + stack.replace(/^Error(:[^\n]*)?\n/, "");
        }
      });
      errorClass.prototype = Object.create(baseErrorType.prototype);
      errorClass.prototype.constructor = errorClass;
      errorClass.prototype.toString = function() {
        if (this.message === void 0) {
          return this.name;
        } else {
          return this.name + ": " + this.message;
        }
      };
      return errorClass;
    }
    var BindingError = void 0;
    function throwBindingError(message) {
      throw new BindingError(message);
    }
    var InternalError = void 0;
    function throwInternalError(message) {
      throw new InternalError(message);
    }
    function whenDependentTypesAreResolved(myTypes, dependentTypes, getTypeConverters) {
      myTypes.forEach(function(type) {
        typeDependencies[type] = dependentTypes;
      });
      function onComplete(typeConverters2) {
        var myTypeConverters = getTypeConverters(typeConverters2);
        if (myTypeConverters.length !== myTypes.length) {
          throwInternalError("Mismatched type converter count");
        }
        for (var i = 0; i < myTypes.length; ++i) {
          registerType(myTypes[i], myTypeConverters[i]);
        }
      }
      var typeConverters = new Array(dependentTypes.length);
      var unregisteredTypes = [];
      var registered = 0;
      dependentTypes.forEach(function(dt, i) {
        if (registeredTypes.hasOwnProperty(dt)) {
          typeConverters[i] = registeredTypes[dt];
        } else {
          unregisteredTypes.push(dt);
          if (!awaitingDependencies.hasOwnProperty(dt)) {
            awaitingDependencies[dt] = [];
          }
          awaitingDependencies[dt].push(function() {
            typeConverters[i] = registeredTypes[dt];
            ++registered;
            if (registered === unregisteredTypes.length) {
              onComplete(typeConverters);
            }
          });
        }
      });
      if (0 === unregisteredTypes.length) {
        onComplete(typeConverters);
      }
    }
    function registerType(rawType, registeredInstance, options) {
      options = options || {};
      if (!("argPackAdvance" in registeredInstance)) {
        throw new TypeError("registerType registeredInstance requires argPackAdvance");
      }
      var name = registeredInstance.name;
      if (!rawType) {
        throwBindingError('type "' + name + '" must have a positive integer typeid pointer');
      }
      if (registeredTypes.hasOwnProperty(rawType)) {
        if (options.ignoreDuplicateRegistrations) {
          return;
        } else {
          throwBindingError("Cannot register type '" + name + "' twice");
        }
      }
      registeredTypes[rawType] = registeredInstance;
      delete typeDependencies[rawType];
      if (awaitingDependencies.hasOwnProperty(rawType)) {
        var callbacks = awaitingDependencies[rawType];
        delete awaitingDependencies[rawType];
        callbacks.forEach(function(cb) {
          cb();
        });
      }
    }
    function __embind_register_bool(rawType, name, size, trueValue, falseValue) {
      var shift = getShiftFromSize(size);
      name = readLatin1String(name);
      registerType(rawType, {
        name,
        fromWireType: function(wt) {
          return !!wt;
        },
        toWireType: function(destructors, o) {
          return o ? trueValue : falseValue;
        },
        argPackAdvance: 8,
        readValueFromPointer: function(pointer) {
          var heap;
          if (size === 1) {
            heap = HEAP8;
          } else if (size === 2) {
            heap = HEAP16;
          } else if (size === 4) {
            heap = HEAP32;
          } else {
            throw new TypeError("Unknown boolean type size: " + name);
          }
          return this["fromWireType"](heap[pointer >> shift]);
        },
        destructorFunction: null
      });
    }
    function ClassHandle_isAliasOf(other) {
      if (!(this instanceof ClassHandle)) {
        return false;
      }
      if (!(other instanceof ClassHandle)) {
        return false;
      }
      var leftClass = this.$$.ptrType.registeredClass;
      var left = this.$$.ptr;
      var rightClass = other.$$.ptrType.registeredClass;
      var right = other.$$.ptr;
      while (leftClass.baseClass) {
        left = leftClass.upcast(left);
        leftClass = leftClass.baseClass;
      }
      while (rightClass.baseClass) {
        right = rightClass.upcast(right);
        rightClass = rightClass.baseClass;
      }
      return leftClass === rightClass && left === right;
    }
    function shallowCopyInternalPointer(o) {
      return {
        count: o.count,
        deleteScheduled: o.deleteScheduled,
        preservePointerOnDelete: o.preservePointerOnDelete,
        ptr: o.ptr,
        ptrType: o.ptrType,
        smartPtr: o.smartPtr,
        smartPtrType: o.smartPtrType
      };
    }
    function throwInstanceAlreadyDeleted(obj) {
      function getInstanceTypeName(handle) {
        return handle.$$.ptrType.registeredClass.name;
      }
      throwBindingError(getInstanceTypeName(obj) + " instance already deleted");
    }
    var finalizationGroup = false;
    function detachFinalizer(handle) {
    }
    function runDestructor($$) {
      if ($$.smartPtr) {
        $$.smartPtrType.rawDestructor($$.smartPtr);
      } else {
        $$.ptrType.registeredClass.rawDestructor($$.ptr);
      }
    }
    function releaseClassHandle($$) {
      $$.count.value -= 1;
      var toDelete = 0 === $$.count.value;
      if (toDelete) {
        runDestructor($$);
      }
    }
    function attachFinalizer(handle) {
      if ("undefined" === typeof FinalizationGroup) {
        attachFinalizer = function(handle2) {
          return handle2;
        };
        return handle;
      }
      finalizationGroup = new FinalizationGroup(function(iter) {
        for (var result = iter.next(); !result.done; result = iter.next()) {
          var $$ = result.value;
          if (!$$.ptr) {
            console.warn("object already deleted: " + $$.ptr);
          } else {
            releaseClassHandle($$);
          }
        }
      });
      attachFinalizer = function(handle2) {
        finalizationGroup.register(handle2, handle2.$$, handle2.$$);
        return handle2;
      };
      detachFinalizer = function(handle2) {
        finalizationGroup.unregister(handle2.$$);
      };
      return attachFinalizer(handle);
    }
    function ClassHandle_clone() {
      if (!this.$$.ptr) {
        throwInstanceAlreadyDeleted(this);
      }
      if (this.$$.preservePointerOnDelete) {
        this.$$.count.value += 1;
        return this;
      } else {
        var clone = attachFinalizer(
          Object.create(Object.getPrototypeOf(this), {
            $$: {
              value: shallowCopyInternalPointer(this.$$)
            }
          })
        );
        clone.$$.count.value += 1;
        clone.$$.deleteScheduled = false;
        return clone;
      }
    }
    function ClassHandle_delete() {
      if (!this.$$.ptr) {
        throwInstanceAlreadyDeleted(this);
      }
      if (this.$$.deleteScheduled && !this.$$.preservePointerOnDelete) {
        throwBindingError("Object already scheduled for deletion");
      }
      detachFinalizer(this);
      releaseClassHandle(this.$$);
      if (!this.$$.preservePointerOnDelete) {
        this.$$.smartPtr = void 0;
        this.$$.ptr = void 0;
      }
    }
    function ClassHandle_isDeleted() {
      return !this.$$.ptr;
    }
    var delayFunction = void 0;
    var deletionQueue = [];
    function flushPendingDeletes() {
      while (deletionQueue.length) {
        var obj = deletionQueue.pop();
        obj.$$.deleteScheduled = false;
        obj["delete"]();
      }
    }
    function ClassHandle_deleteLater() {
      if (!this.$$.ptr) {
        throwInstanceAlreadyDeleted(this);
      }
      if (this.$$.deleteScheduled && !this.$$.preservePointerOnDelete) {
        throwBindingError("Object already scheduled for deletion");
      }
      deletionQueue.push(this);
      if (deletionQueue.length === 1 && delayFunction) {
        delayFunction(flushPendingDeletes);
      }
      this.$$.deleteScheduled = true;
      return this;
    }
    function init_ClassHandle() {
      ClassHandle.prototype["isAliasOf"] = ClassHandle_isAliasOf;
      ClassHandle.prototype["clone"] = ClassHandle_clone;
      ClassHandle.prototype["delete"] = ClassHandle_delete;
      ClassHandle.prototype["isDeleted"] = ClassHandle_isDeleted;
      ClassHandle.prototype["deleteLater"] = ClassHandle_deleteLater;
    }
    function ClassHandle() {
    }
    var registeredPointers = {};
    function ensureOverloadTable(proto, methodName, humanName) {
      if (void 0 === proto[methodName].overloadTable) {
        var prevFunc = proto[methodName];
        proto[methodName] = function() {
          if (!proto[methodName].overloadTable.hasOwnProperty(arguments.length)) {
            throwBindingError(
              "Function '" + humanName + "' called with an invalid number of arguments (" + arguments.length + ") - expects one of (" + proto[methodName].overloadTable + ")!"
            );
          }
          return proto[methodName].overloadTable[arguments.length].apply(this, arguments);
        };
        proto[methodName].overloadTable = [];
        proto[methodName].overloadTable[prevFunc.argCount] = prevFunc;
      }
    }
    function exposePublicSymbol(name, value, numArguments) {
      if (Module2.hasOwnProperty(name)) {
        if (void 0 === numArguments || void 0 !== Module2[name].overloadTable && void 0 !== Module2[name].overloadTable[numArguments]) {
          throwBindingError("Cannot register public name '" + name + "' twice");
        }
        ensureOverloadTable(Module2, name, name);
        if (Module2.hasOwnProperty(numArguments)) {
          throwBindingError(
            "Cannot register multiple overloads of a function with the same number of arguments (" + numArguments + ")!"
          );
        }
        Module2[name].overloadTable[numArguments] = value;
      } else {
        Module2[name] = value;
        if (void 0 !== numArguments) {
          Module2[name].numArguments = numArguments;
        }
      }
    }
    function RegisteredClass(name, constructor, instancePrototype, rawDestructor, baseClass, getActualType, upcast, downcast) {
      this.name = name;
      this.constructor = constructor;
      this.instancePrototype = instancePrototype;
      this.rawDestructor = rawDestructor;
      this.baseClass = baseClass;
      this.getActualType = getActualType;
      this.upcast = upcast;
      this.downcast = downcast;
      this.pureVirtualFunctions = [];
    }
    function upcastPointer(ptr, ptrClass, desiredClass) {
      while (ptrClass !== desiredClass) {
        if (!ptrClass.upcast) {
          throwBindingError(
            "Expected null or instance of " + desiredClass.name + ", got an instance of " + ptrClass.name
          );
        }
        ptr = ptrClass.upcast(ptr);
        ptrClass = ptrClass.baseClass;
      }
      return ptr;
    }
    function constNoSmartPtrRawPointerToWireType(destructors, handle) {
      if (handle === null) {
        if (this.isReference) {
          throwBindingError("null is not a valid " + this.name);
        }
        return 0;
      }
      if (!handle.$$) {
        throwBindingError('Cannot pass "' + _embind_repr(handle) + '" as a ' + this.name);
      }
      if (!handle.$$.ptr) {
        throwBindingError("Cannot pass deleted object as a pointer of type " + this.name);
      }
      var handleClass = handle.$$.ptrType.registeredClass;
      var ptr = upcastPointer(handle.$$.ptr, handleClass, this.registeredClass);
      return ptr;
    }
    function genericPointerToWireType(destructors, handle) {
      var ptr;
      if (handle === null) {
        if (this.isReference) {
          throwBindingError("null is not a valid " + this.name);
        }
        if (this.isSmartPointer) {
          ptr = this.rawConstructor();
          if (destructors !== null) {
            destructors.push(this.rawDestructor, ptr);
          }
          return ptr;
        } else {
          return 0;
        }
      }
      if (!handle.$$) {
        throwBindingError('Cannot pass "' + _embind_repr(handle) + '" as a ' + this.name);
      }
      if (!handle.$$.ptr) {
        throwBindingError("Cannot pass deleted object as a pointer of type " + this.name);
      }
      if (!this.isConst && handle.$$.ptrType.isConst) {
        throwBindingError(
          "Cannot convert argument of type " + (handle.$$.smartPtrType ? handle.$$.smartPtrType.name : handle.$$.ptrType.name) + " to parameter type " + this.name
        );
      }
      var handleClass = handle.$$.ptrType.registeredClass;
      ptr = upcastPointer(handle.$$.ptr, handleClass, this.registeredClass);
      if (this.isSmartPointer) {
        if (void 0 === handle.$$.smartPtr) {
          throwBindingError("Passing raw pointer to smart pointer is illegal");
        }
        switch (this.sharingPolicy) {
          case 0:
            if (handle.$$.smartPtrType === this) {
              ptr = handle.$$.smartPtr;
            } else {
              throwBindingError(
                "Cannot convert argument of type " + (handle.$$.smartPtrType ? handle.$$.smartPtrType.name : handle.$$.ptrType.name) + " to parameter type " + this.name
              );
            }
            break;
          case 1:
            ptr = handle.$$.smartPtr;
            break;
          case 2:
            if (handle.$$.smartPtrType === this) {
              ptr = handle.$$.smartPtr;
            } else {
              var clonedHandle = handle["clone"]();
              ptr = this.rawShare(
                ptr,
                __emval_register(function() {
                  clonedHandle["delete"]();
                })
              );
              if (destructors !== null) {
                destructors.push(this.rawDestructor, ptr);
              }
            }
            break;
          default:
            throwBindingError("Unsupporting sharing policy");
        }
      }
      return ptr;
    }
    function nonConstNoSmartPtrRawPointerToWireType(destructors, handle) {
      if (handle === null) {
        if (this.isReference) {
          throwBindingError("null is not a valid " + this.name);
        }
        return 0;
      }
      if (!handle.$$) {
        throwBindingError('Cannot pass "' + _embind_repr(handle) + '" as a ' + this.name);
      }
      if (!handle.$$.ptr) {
        throwBindingError("Cannot pass deleted object as a pointer of type " + this.name);
      }
      if (handle.$$.ptrType.isConst) {
        throwBindingError(
          "Cannot convert argument of type " + handle.$$.ptrType.name + " to parameter type " + this.name
        );
      }
      var handleClass = handle.$$.ptrType.registeredClass;
      var ptr = upcastPointer(handle.$$.ptr, handleClass, this.registeredClass);
      return ptr;
    }
    function simpleReadValueFromPointer(pointer) {
      return this["fromWireType"](HEAPU32[pointer >> 2]);
    }
    function RegisteredPointer_getPointee(ptr) {
      if (this.rawGetPointee) {
        ptr = this.rawGetPointee(ptr);
      }
      return ptr;
    }
    function RegisteredPointer_destructor(ptr) {
      if (this.rawDestructor) {
        this.rawDestructor(ptr);
      }
    }
    function RegisteredPointer_deleteObject(handle) {
      if (handle !== null) {
        handle["delete"]();
      }
    }
    function downcastPointer(ptr, ptrClass, desiredClass) {
      if (ptrClass === desiredClass) {
        return ptr;
      }
      if (void 0 === desiredClass.baseClass) {
        return null;
      }
      var rv = downcastPointer(ptr, ptrClass, desiredClass.baseClass);
      if (rv === null) {
        return null;
      }
      return desiredClass.downcast(rv);
    }
    function getInheritedInstanceCount() {
      return Object.keys(registeredInstances).length;
    }
    function getLiveInheritedInstances() {
      var rv = [];
      for (var k in registeredInstances) {
        if (registeredInstances.hasOwnProperty(k)) {
          rv.push(registeredInstances[k]);
        }
      }
      return rv;
    }
    function setDelayFunction(fn) {
      delayFunction = fn;
      if (deletionQueue.length && delayFunction) {
        delayFunction(flushPendingDeletes);
      }
    }
    function init_embind() {
      Module2["getInheritedInstanceCount"] = getInheritedInstanceCount;
      Module2["getLiveInheritedInstances"] = getLiveInheritedInstances;
      Module2["flushPendingDeletes"] = flushPendingDeletes;
      Module2["setDelayFunction"] = setDelayFunction;
    }
    var registeredInstances = {};
    function getBasestPointer(class_, ptr) {
      if (ptr === void 0) {
        throwBindingError("ptr should not be undefined");
      }
      while (class_.baseClass) {
        ptr = class_.upcast(ptr);
        class_ = class_.baseClass;
      }
      return ptr;
    }
    function getInheritedInstance(class_, ptr) {
      ptr = getBasestPointer(class_, ptr);
      return registeredInstances[ptr];
    }
    function makeClassHandle(prototype, record) {
      if (!record.ptrType || !record.ptr) {
        throwInternalError("makeClassHandle requires ptr and ptrType");
      }
      var hasSmartPtrType = !!record.smartPtrType;
      var hasSmartPtr = !!record.smartPtr;
      if (hasSmartPtrType !== hasSmartPtr) {
        throwInternalError("Both smartPtrType and smartPtr must be specified");
      }
      record.count = {
        value: 1
      };
      return attachFinalizer(
        Object.create(prototype, {
          $$: {
            value: record
          }
        })
      );
    }
    function RegisteredPointer_fromWireType(ptr) {
      var rawPointer = this.getPointee(ptr);
      if (!rawPointer) {
        this.destructor(ptr);
        return null;
      }
      var registeredInstance = getInheritedInstance(this.registeredClass, rawPointer);
      if (void 0 !== registeredInstance) {
        if (0 === registeredInstance.$$.count.value) {
          registeredInstance.$$.ptr = rawPointer;
          registeredInstance.$$.smartPtr = ptr;
          return registeredInstance["clone"]();
        } else {
          var rv = registeredInstance["clone"]();
          this.destructor(ptr);
          return rv;
        }
      }
      function makeDefaultHandle() {
        if (this.isSmartPointer) {
          return makeClassHandle(this.registeredClass.instancePrototype, {
            ptrType: this.pointeeType,
            ptr: rawPointer,
            smartPtrType: this,
            smartPtr: ptr
          });
        } else {
          return makeClassHandle(this.registeredClass.instancePrototype, {
            ptrType: this,
            ptr
          });
        }
      }
      var actualType = this.registeredClass.getActualType(rawPointer);
      var registeredPointerRecord = registeredPointers[actualType];
      if (!registeredPointerRecord) {
        return makeDefaultHandle.call(this);
      }
      var toType;
      if (this.isConst) {
        toType = registeredPointerRecord.constPointerType;
      } else {
        toType = registeredPointerRecord.pointerType;
      }
      var dp = downcastPointer(rawPointer, this.registeredClass, toType.registeredClass);
      if (dp === null) {
        return makeDefaultHandle.call(this);
      }
      if (this.isSmartPointer) {
        return makeClassHandle(toType.registeredClass.instancePrototype, {
          ptrType: toType,
          ptr: dp,
          smartPtrType: this,
          smartPtr: ptr
        });
      } else {
        return makeClassHandle(toType.registeredClass.instancePrototype, {
          ptrType: toType,
          ptr: dp
        });
      }
    }
    function init_RegisteredPointer() {
      RegisteredPointer.prototype.getPointee = RegisteredPointer_getPointee;
      RegisteredPointer.prototype.destructor = RegisteredPointer_destructor;
      RegisteredPointer.prototype["argPackAdvance"] = 8;
      RegisteredPointer.prototype["readValueFromPointer"] = simpleReadValueFromPointer;
      RegisteredPointer.prototype["deleteObject"] = RegisteredPointer_deleteObject;
      RegisteredPointer.prototype["fromWireType"] = RegisteredPointer_fromWireType;
    }
    function RegisteredPointer(name, registeredClass, isReference, isConst, isSmartPointer, pointeeType, sharingPolicy, rawGetPointee, rawConstructor, rawShare, rawDestructor) {
      this.name = name;
      this.registeredClass = registeredClass;
      this.isReference = isReference;
      this.isConst = isConst;
      this.isSmartPointer = isSmartPointer;
      this.pointeeType = pointeeType;
      this.sharingPolicy = sharingPolicy;
      this.rawGetPointee = rawGetPointee;
      this.rawConstructor = rawConstructor;
      this.rawShare = rawShare;
      this.rawDestructor = rawDestructor;
      if (!isSmartPointer && registeredClass.baseClass === void 0) {
        if (isConst) {
          this["toWireType"] = constNoSmartPtrRawPointerToWireType;
          this.destructorFunction = null;
        } else {
          this["toWireType"] = nonConstNoSmartPtrRawPointerToWireType;
          this.destructorFunction = null;
        }
      } else {
        this["toWireType"] = genericPointerToWireType;
      }
    }
    function replacePublicSymbol(name, value, numArguments) {
      if (!Module2.hasOwnProperty(name)) {
        throwInternalError("Replacing nonexistant public symbol");
      }
      if (void 0 !== Module2[name].overloadTable && void 0 !== numArguments) {
        Module2[name].overloadTable[numArguments] = value;
      } else {
        Module2[name] = value;
        Module2[name].argCount = numArguments;
      }
    }
    function embind__requireFunction(signature, rawFunction) {
      signature = readLatin1String(signature);
      function makeDynCaller(dynCall2) {
        var args = [];
        for (var i = 1; i < signature.length; ++i) {
          args.push("a" + i);
        }
        var name = "dynCall_" + signature + "_" + rawFunction;
        var body = "return function " + name + "(" + args.join(", ") + ") {\n";
        body += "    return dynCall(rawFunction" + (args.length ? ", " : "") + args.join(", ") + ");\n";
        body += "};\n";
        return new Function("dynCall", "rawFunction", body)(dynCall2, rawFunction);
      }
      var dc = Module2["dynCall_" + signature];
      var fp = makeDynCaller(dc);
      if (typeof fp !== "function") {
        throwBindingError(
          "unknown function pointer with signature " + signature + ": " + rawFunction
        );
      }
      return fp;
    }
    var UnboundTypeError = void 0;
    function getTypeName(type) {
      var ptr = ___getTypeName(type);
      var rv = readLatin1String(ptr);
      _free(ptr);
      return rv;
    }
    function throwUnboundTypeError(message, types) {
      var unboundTypes = [];
      var seen = {};
      function visit(type) {
        if (seen[type]) {
          return;
        }
        if (registeredTypes[type]) {
          return;
        }
        if (typeDependencies[type]) {
          typeDependencies[type].forEach(visit);
          return;
        }
        unboundTypes.push(type);
        seen[type] = true;
      }
      types.forEach(visit);
      throw new UnboundTypeError(message + ": " + unboundTypes.map(getTypeName).join([", "]));
    }
    function __embind_register_class(rawType, rawPointerType, rawConstPointerType, baseClassRawType, getActualTypeSignature, getActualType, upcastSignature, upcast, downcastSignature, downcast, name, destructorSignature, rawDestructor) {
      name = readLatin1String(name);
      getActualType = embind__requireFunction(getActualTypeSignature, getActualType);
      if (upcast) {
        upcast = embind__requireFunction(upcastSignature, upcast);
      }
      if (downcast) {
        downcast = embind__requireFunction(downcastSignature, downcast);
      }
      rawDestructor = embind__requireFunction(destructorSignature, rawDestructor);
      var legalFunctionName = makeLegalFunctionName(name);
      exposePublicSymbol(legalFunctionName, function() {
        throwUnboundTypeError("Cannot construct " + name + " due to unbound types", [
          baseClassRawType
        ]);
      });
      whenDependentTypesAreResolved(
        [rawType, rawPointerType, rawConstPointerType],
        baseClassRawType ? [baseClassRawType] : [],
        function(base) {
          base = base[0];
          var baseClass;
          var basePrototype;
          if (baseClassRawType) {
            baseClass = base.registeredClass;
            basePrototype = baseClass.instancePrototype;
          } else {
            basePrototype = ClassHandle.prototype;
          }
          var constructor = createNamedFunction(legalFunctionName, function() {
            if (Object.getPrototypeOf(this) !== instancePrototype) {
              throw new BindingError("Use 'new' to construct " + name);
            }
            if (void 0 === registeredClass.constructor_body) {
              throw new BindingError(name + " has no accessible constructor");
            }
            var body = registeredClass.constructor_body[arguments.length];
            if (void 0 === body) {
              throw new BindingError(
                "Tried to invoke ctor of " + name + " with invalid number of parameters (" + arguments.length + ") - expected (" + Object.keys(registeredClass.constructor_body).toString() + ") parameters instead!"
              );
            }
            return body.apply(this, arguments);
          });
          var instancePrototype = Object.create(basePrototype, {
            constructor: {
              value: constructor
            }
          });
          constructor.prototype = instancePrototype;
          var registeredClass = new RegisteredClass(
            name,
            constructor,
            instancePrototype,
            rawDestructor,
            baseClass,
            getActualType,
            upcast,
            downcast
          );
          var referenceConverter = new RegisteredPointer(name, registeredClass, true, false, false);
          var pointerConverter = new RegisteredPointer(
            name + "*",
            registeredClass,
            false,
            false,
            false
          );
          var constPointerConverter = new RegisteredPointer(
            name + " const*",
            registeredClass,
            false,
            true,
            false
          );
          registeredPointers[rawType] = {
            pointerType: pointerConverter,
            constPointerType: constPointerConverter
          };
          replacePublicSymbol(legalFunctionName, constructor);
          return [referenceConverter, pointerConverter, constPointerConverter];
        }
      );
    }
    function heap32VectorToArray(count, firstElement) {
      var array = [];
      for (var i = 0; i < count; i++) {
        array.push(HEAP32[(firstElement >> 2) + i]);
      }
      return array;
    }
    function runDestructors(destructors) {
      while (destructors.length) {
        var ptr = destructors.pop();
        var del = destructors.pop();
        del(ptr);
      }
    }
    function __embind_register_class_constructor(rawClassType, argCount, rawArgTypesAddr, invokerSignature, invoker, rawConstructor) {
      assert(argCount > 0);
      var rawArgTypes = heap32VectorToArray(argCount, rawArgTypesAddr);
      invoker = embind__requireFunction(invokerSignature, invoker);
      var args = [rawConstructor];
      var destructors = [];
      whenDependentTypesAreResolved([], [rawClassType], function(classType) {
        classType = classType[0];
        var humanName = "constructor " + classType.name;
        if (void 0 === classType.registeredClass.constructor_body) {
          classType.registeredClass.constructor_body = [];
        }
        if (void 0 !== classType.registeredClass.constructor_body[argCount - 1]) {
          throw new BindingError(
            "Cannot register multiple constructors with identical number of parameters (" + (argCount - 1) + ") for class '" + classType.name + "'! Overload resolution is currently only performed using the parameter count, not actual type info!"
          );
        }
        classType.registeredClass.constructor_body[argCount - 1] = function unboundTypeHandler() {
          throwUnboundTypeError(
            "Cannot construct " + classType.name + " due to unbound types",
            rawArgTypes
          );
        };
        whenDependentTypesAreResolved([], rawArgTypes, function(argTypes) {
          classType.registeredClass.constructor_body[argCount - 1] = function constructor_body() {
            if (arguments.length !== argCount - 1) {
              throwBindingError(
                humanName + " called with " + arguments.length + " arguments, expected " + (argCount - 1)
              );
            }
            destructors.length = 0;
            args.length = argCount;
            for (var i = 1; i < argCount; ++i) {
              args[i] = argTypes[i]["toWireType"](destructors, arguments[i - 1]);
            }
            var ptr = invoker.apply(null, args);
            runDestructors(destructors);
            return argTypes[0]["fromWireType"](ptr);
          };
          return [];
        });
        return [];
      });
    }
    function new_(constructor, argumentList) {
      if (!(constructor instanceof Function)) {
        throw new TypeError(
          "new_ called with constructor type " + typeof constructor + " which is not a function"
        );
      }
      var dummy = createNamedFunction(constructor.name || "unknownFunctionName", function() {
      });
      dummy.prototype = constructor.prototype;
      var obj = new dummy();
      var r = constructor.apply(obj, argumentList);
      return r instanceof Object ? r : obj;
    }
    function craftInvokerFunction(humanName, argTypes, classType, cppInvokerFunc, cppTargetFunc) {
      var argCount = argTypes.length;
      if (argCount < 2) {
        throwBindingError(
          "argTypes array size mismatch! Must at least get return value and 'this' types!"
        );
      }
      var isClassMethodFunc = argTypes[1] !== null && classType !== null;
      var needsDestructorStack = false;
      for (var i = 1; i < argTypes.length; ++i) {
        if (argTypes[i] !== null && argTypes[i].destructorFunction === void 0) {
          needsDestructorStack = true;
          break;
        }
      }
      var returns = argTypes[0].name !== "void";
      var argsList = "";
      var argsListWired = "";
      for (var i = 0; i < argCount - 2; ++i) {
        argsList += (i !== 0 ? ", " : "") + "arg" + i;
        argsListWired += (i !== 0 ? ", " : "") + "arg" + i + "Wired";
      }
      var invokerFnBody = "return function " + makeLegalFunctionName(humanName) + "(" + argsList + ") {\nif (arguments.length !== " + (argCount - 2) + ") {\nthrowBindingError('function " + humanName + " called with ' + arguments.length + ' arguments, expected " + (argCount - 2) + " args!');\n}\n";
      if (needsDestructorStack) {
        invokerFnBody += "var destructors = [];\n";
      }
      var dtorStack = needsDestructorStack ? "destructors" : "null";
      var args1 = ["throwBindingError", "invoker", "fn", "runDestructors", "retType", "classParam"];
      var args2 = [
        throwBindingError,
        cppInvokerFunc,
        cppTargetFunc,
        runDestructors,
        argTypes[0],
        argTypes[1]
      ];
      if (isClassMethodFunc) {
        invokerFnBody += "var thisWired = classParam.toWireType(" + dtorStack + ", this);\n";
      }
      for (var i = 0; i < argCount - 2; ++i) {
        invokerFnBody += "var arg" + i + "Wired = argType" + i + ".toWireType(" + dtorStack + ", arg" + i + "); // " + argTypes[i + 2].name + "\n";
        args1.push("argType" + i);
        args2.push(argTypes[i + 2]);
      }
      if (isClassMethodFunc) {
        argsListWired = "thisWired" + (argsListWired.length > 0 ? ", " : "") + argsListWired;
      }
      invokerFnBody += (returns ? "var rv = " : "") + "invoker(fn" + (argsListWired.length > 0 ? ", " : "") + argsListWired + ");\n";
      if (needsDestructorStack) {
        invokerFnBody += "runDestructors(destructors);\n";
      } else {
        for (var i = isClassMethodFunc ? 1 : 2; i < argTypes.length; ++i) {
          var paramName = i === 1 ? "thisWired" : "arg" + (i - 2) + "Wired";
          if (argTypes[i].destructorFunction !== null) {
            invokerFnBody += paramName + "_dtor(" + paramName + "); // " + argTypes[i].name + "\n";
            args1.push(paramName + "_dtor");
            args2.push(argTypes[i].destructorFunction);
          }
        }
      }
      if (returns) {
        invokerFnBody += "var ret = retType.fromWireType(rv);\nreturn ret;\n";
      } else {
      }
      invokerFnBody += "}\n";
      args1.push(invokerFnBody);
      var invokerFunction = new_(Function, args1).apply(null, args2);
      return invokerFunction;
    }
    function __embind_register_class_function(rawClassType, methodName, argCount, rawArgTypesAddr, invokerSignature, rawInvoker, context, isPureVirtual) {
      var rawArgTypes = heap32VectorToArray(argCount, rawArgTypesAddr);
      methodName = readLatin1String(methodName);
      rawInvoker = embind__requireFunction(invokerSignature, rawInvoker);
      whenDependentTypesAreResolved([], [rawClassType], function(classType) {
        classType = classType[0];
        var humanName = classType.name + "." + methodName;
        if (isPureVirtual) {
          classType.registeredClass.pureVirtualFunctions.push(methodName);
        }
        function unboundTypesHandler() {
          throwUnboundTypeError("Cannot call " + humanName + " due to unbound types", rawArgTypes);
        }
        var proto = classType.registeredClass.instancePrototype;
        var method = proto[methodName];
        if (void 0 === method || void 0 === method.overloadTable && method.className !== classType.name && method.argCount === argCount - 2) {
          unboundTypesHandler.argCount = argCount - 2;
          unboundTypesHandler.className = classType.name;
          proto[methodName] = unboundTypesHandler;
        } else {
          ensureOverloadTable(proto, methodName, humanName);
          proto[methodName].overloadTable[argCount - 2] = unboundTypesHandler;
        }
        whenDependentTypesAreResolved([], rawArgTypes, function(argTypes) {
          var memberFunction = craftInvokerFunction(
            humanName,
            argTypes,
            classType,
            rawInvoker,
            context
          );
          if (void 0 === proto[methodName].overloadTable) {
            memberFunction.argCount = argCount - 2;
            proto[methodName] = memberFunction;
          } else {
            proto[methodName].overloadTable[argCount - 2] = memberFunction;
          }
          return [];
        });
        return [];
      });
    }
    var emval_free_list = [];
    var emval_handle_array = [
      {},
      {
        value: void 0
      },
      {
        value: null
      },
      {
        value: true
      },
      {
        value: false
      }
    ];
    function __emval_decref(handle) {
      if (handle > 4 && 0 === --emval_handle_array[handle].refcount) {
        emval_handle_array[handle] = void 0;
        emval_free_list.push(handle);
      }
    }
    function count_emval_handles() {
      var count = 0;
      for (var i = 5; i < emval_handle_array.length; ++i) {
        if (emval_handle_array[i] !== void 0) {
          ++count;
        }
      }
      return count;
    }
    function get_first_emval() {
      for (var i = 5; i < emval_handle_array.length; ++i) {
        if (emval_handle_array[i] !== void 0) {
          return emval_handle_array[i];
        }
      }
      return null;
    }
    function init_emval() {
      Module2["count_emval_handles"] = count_emval_handles;
      Module2["get_first_emval"] = get_first_emval;
    }
    function __emval_register(value) {
      switch (value) {
        case void 0: {
          return 1;
        }
        case null: {
          return 2;
        }
        case true: {
          return 3;
        }
        case false: {
          return 4;
        }
        default: {
          var handle = emval_free_list.length ? emval_free_list.pop() : emval_handle_array.length;
          emval_handle_array[handle] = {
            refcount: 1,
            value
          };
          return handle;
        }
      }
    }
    function __embind_register_emval(rawType, name) {
      name = readLatin1String(name);
      registerType(rawType, {
        name,
        fromWireType: function(handle) {
          var rv = emval_handle_array[handle].value;
          __emval_decref(handle);
          return rv;
        },
        toWireType: function(destructors, value) {
          return __emval_register(value);
        },
        argPackAdvance: 8,
        readValueFromPointer: simpleReadValueFromPointer,
        destructorFunction: null
      });
    }
    function _embind_repr(v) {
      if (v === null) {
        return "null";
      }
      var t = typeof v;
      if (t === "object" || t === "array" || t === "function") {
        return v.toString();
      } else {
        return "" + v;
      }
    }
    function floatReadValueFromPointer(name, shift) {
      switch (shift) {
        case 2:
          return function(pointer) {
            return this["fromWireType"](HEAPF32[pointer >> 2]);
          };
        case 3:
          return function(pointer) {
            return this["fromWireType"](HEAPF64[pointer >> 3]);
          };
        default:
          throw new TypeError("Unknown float type: " + name);
      }
    }
    function __embind_register_float(rawType, name, size) {
      var shift = getShiftFromSize(size);
      name = readLatin1String(name);
      registerType(rawType, {
        name,
        fromWireType: function(value) {
          return value;
        },
        toWireType: function(destructors, value) {
          if (typeof value !== "number" && typeof value !== "boolean") {
            throw new TypeError('Cannot convert "' + _embind_repr(value) + '" to ' + this.name);
          }
          return value;
        },
        argPackAdvance: 8,
        readValueFromPointer: floatReadValueFromPointer(name, shift),
        destructorFunction: null
      });
    }
    function integerReadValueFromPointer(name, shift, signed) {
      switch (shift) {
        case 0:
          return signed ? function readS8FromPointer(pointer) {
            return HEAP8[pointer];
          } : function readU8FromPointer(pointer) {
            return HEAPU8[pointer];
          };
        case 1:
          return signed ? function readS16FromPointer(pointer) {
            return HEAP16[pointer >> 1];
          } : function readU16FromPointer(pointer) {
            return HEAPU16[pointer >> 1];
          };
        case 2:
          return signed ? function readS32FromPointer(pointer) {
            return HEAP32[pointer >> 2];
          } : function readU32FromPointer(pointer) {
            return HEAPU32[pointer >> 2];
          };
        default:
          throw new TypeError("Unknown integer type: " + name);
      }
    }
    function __embind_register_integer(primitiveType, name, size, minRange, maxRange) {
      name = readLatin1String(name);
      if (maxRange === -1) {
        maxRange = 4294967295;
      }
      var shift = getShiftFromSize(size);
      var fromWireType = function(value) {
        return value;
      };
      if (minRange === 0) {
        var bitshift = 32 - 8 * size;
        fromWireType = function(value) {
          return value << bitshift >>> bitshift;
        };
      }
      var isUnsignedType = name.indexOf("unsigned") != -1;
      registerType(primitiveType, {
        name,
        fromWireType,
        toWireType: function(destructors, value) {
          if (typeof value !== "number" && typeof value !== "boolean") {
            throw new TypeError('Cannot convert "' + _embind_repr(value) + '" to ' + this.name);
          }
          if (value < minRange || value > maxRange) {
            throw new TypeError(
              'Passing a number "' + _embind_repr(value) + '" from JS side to C/C++ side to an argument of type "' + name + '", which is outside the valid range [' + minRange + ", " + maxRange + "]!"
            );
          }
          return isUnsignedType ? value >>> 0 : value | 0;
        },
        argPackAdvance: 8,
        readValueFromPointer: integerReadValueFromPointer(name, shift, minRange !== 0),
        destructorFunction: null
      });
    }
    function __embind_register_memory_view(rawType, dataTypeIndex, name) {
      var typeMapping = [
        Int8Array,
        Uint8Array,
        Int16Array,
        Uint16Array,
        Int32Array,
        Uint32Array,
        Float32Array,
        Float64Array
      ];
      var TA = typeMapping[dataTypeIndex];
      function decodeMemoryView(handle) {
        handle = handle >> 2;
        var heap = HEAPU32;
        var size = heap[handle];
        var data2 = heap[handle + 1];
        return new TA(buffer, data2, size);
      }
      name = readLatin1String(name);
      registerType(
        rawType,
        {
          name,
          fromWireType: decodeMemoryView,
          argPackAdvance: 8,
          readValueFromPointer: decodeMemoryView
        },
        {
          ignoreDuplicateRegistrations: true
        }
      );
    }
    function __embind_register_std_string(rawType, name) {
      name = readLatin1String(name);
      var stdStringIsUTF8 = name === "std::string";
      registerType(rawType, {
        name,
        fromWireType: function(value) {
          var length = HEAPU32[value >> 2];
          var str;
          if (stdStringIsUTF8) {
            var decodeStartPtr = value + 4;
            for (var i = 0; i <= length; ++i) {
              var currentBytePtr = value + 4 + i;
              if (HEAPU8[currentBytePtr] == 0 || i == length) {
                var maxRead = currentBytePtr - decodeStartPtr;
                var stringSegment = UTF8ToString(decodeStartPtr, maxRead);
                if (str === void 0) {
                  str = stringSegment;
                } else {
                  str += String.fromCharCode(0);
                  str += stringSegment;
                }
                decodeStartPtr = currentBytePtr + 1;
              }
            }
          } else {
            var a = new Array(length);
            for (var i = 0; i < length; ++i) {
              a[i] = String.fromCharCode(HEAPU8[value + 4 + i]);
            }
            str = a.join("");
          }
          _free(value);
          return str;
        },
        toWireType: function(destructors, value) {
          if (value instanceof ArrayBuffer) {
            value = new Uint8Array(value);
          }
          var getLength;
          var valueIsOfTypeString = typeof value === "string";
          if (!(valueIsOfTypeString || value instanceof Uint8Array || value instanceof Uint8ClampedArray || value instanceof Int8Array)) {
            throwBindingError("Cannot pass non-string to std::string");
          }
          if (stdStringIsUTF8 && valueIsOfTypeString) {
            getLength = function() {
              return lengthBytesUTF8(value);
            };
          } else {
            getLength = function() {
              return value.length;
            };
          }
          var length = getLength();
          var ptr = _malloc(4 + length + 1);
          HEAPU32[ptr >> 2] = length;
          if (stdStringIsUTF8 && valueIsOfTypeString) {
            stringToUTF8(value, ptr + 4, length + 1);
          } else {
            if (valueIsOfTypeString) {
              for (var i = 0; i < length; ++i) {
                var charCode = value.charCodeAt(i);
                if (charCode > 255) {
                  _free(ptr);
                  throwBindingError("String has UTF-16 code units that do not fit in 8 bits");
                }
                HEAPU8[ptr + 4 + i] = charCode;
              }
            } else {
              for (var i = 0; i < length; ++i) {
                HEAPU8[ptr + 4 + i] = value[i];
              }
            }
          }
          if (destructors !== null) {
            destructors.push(_free, ptr);
          }
          return ptr;
        },
        argPackAdvance: 8,
        readValueFromPointer: simpleReadValueFromPointer,
        destructorFunction: function(ptr) {
          _free(ptr);
        }
      });
    }
    function __embind_register_std_wstring(rawType, charSize, name) {
      name = readLatin1String(name);
      var decodeString, encodeString, getHeap, lengthBytesUTF, shift;
      if (charSize === 2) {
        decodeString = UTF16ToString;
        encodeString = stringToUTF16;
        lengthBytesUTF = lengthBytesUTF16;
        getHeap = function() {
          return HEAPU16;
        };
        shift = 1;
      } else if (charSize === 4) {
        decodeString = UTF32ToString;
        encodeString = stringToUTF32;
        lengthBytesUTF = lengthBytesUTF32;
        getHeap = function() {
          return HEAPU32;
        };
        shift = 2;
      }
      registerType(rawType, {
        name,
        fromWireType: function(value) {
          var length = HEAPU32[value >> 2];
          var HEAP = getHeap();
          var str;
          var decodeStartPtr = value + 4;
          for (var i = 0; i <= length; ++i) {
            var currentBytePtr = value + 4 + i * charSize;
            if (HEAP[currentBytePtr >> shift] == 0 || i == length) {
              var maxReadBytes = currentBytePtr - decodeStartPtr;
              var stringSegment = decodeString(decodeStartPtr, maxReadBytes);
              if (str === void 0) {
                str = stringSegment;
              } else {
                str += String.fromCharCode(0);
                str += stringSegment;
              }
              decodeStartPtr = currentBytePtr + charSize;
            }
          }
          _free(value);
          return str;
        },
        toWireType: function(destructors, value) {
          if (!(typeof value === "string")) {
            throwBindingError("Cannot pass non-string to C++ string type " + name);
          }
          var length = lengthBytesUTF(value);
          var ptr = _malloc(4 + length + charSize);
          HEAPU32[ptr >> 2] = length >> shift;
          encodeString(value, ptr + 4, length + charSize);
          if (destructors !== null) {
            destructors.push(_free, ptr);
          }
          return ptr;
        },
        argPackAdvance: 8,
        readValueFromPointer: simpleReadValueFromPointer,
        destructorFunction: function(ptr) {
          _free(ptr);
        }
      });
    }
    function __embind_register_void(rawType, name) {
      name = readLatin1String(name);
      registerType(rawType, {
        isVoid: true,
        name,
        argPackAdvance: 0,
        fromWireType: function() {
          return void 0;
        },
        toWireType: function(destructors, o) {
          return void 0;
        }
      });
    }
    function _abort() {
      abort();
    }
    function _emscripten_get_heap_size() {
      return HEAPU8.length;
    }
    function abortOnCannotGrowMemory(requestedSize) {
      abort("OOM");
    }
    function _emscripten_resize_heap(requestedSize) {
      requestedSize = requestedSize >>> 0;
      abortOnCannotGrowMemory(requestedSize);
    }
    function _llvm_trap() {
      abort("trap!");
    }
    function _emscripten_memcpy_big(dest, src, num) {
      HEAPU8.copyWithin(dest, src, src + num);
    }
    embind_init_charCodes();
    BindingError = Module2["BindingError"] = extendError(Error, "BindingError");
    InternalError = Module2["InternalError"] = extendError(Error, "InternalError");
    init_ClassHandle();
    init_RegisteredPointer();
    init_embind();
    UnboundTypeError = Module2["UnboundTypeError"] = extendError(Error, "UnboundTypeError");
    init_emval();
    var ASSERTIONS = false;
    function intArrayToString(array) {
      var ret = [];
      for (var i = 0; i < array.length; i++) {
        var chr = array[i];
        if (chr > 255) {
          if (ASSERTIONS) {
            assert(
              false,
              "Character code " + chr + " (" + String.fromCharCode(chr) + ")  at offset " + i + " not in 0x00-0xFF."
            );
          }
          chr &= 255;
        }
        ret.push(String.fromCharCode(chr));
      }
      return ret.join("");
    }
    var decodeBase64 = typeof atob === "function" ? atob : function(input) {
      var keyStr = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
      var output = "";
      var chr1, chr2, chr3;
      var enc1, enc2, enc3, enc4;
      var i = 0;
      input = input.replace(/[^A-Za-z0-9\+\/\=]/g, "");
      do {
        enc1 = keyStr.indexOf(input.charAt(i++));
        enc2 = keyStr.indexOf(input.charAt(i++));
        enc3 = keyStr.indexOf(input.charAt(i++));
        enc4 = keyStr.indexOf(input.charAt(i++));
        chr1 = enc1 << 2 | enc2 >> 4;
        chr2 = (enc2 & 15) << 4 | enc3 >> 2;
        chr3 = (enc3 & 3) << 6 | enc4;
        output = output + String.fromCharCode(chr1);
        if (enc3 !== 64) {
          output = output + String.fromCharCode(chr2);
        }
        if (enc4 !== 64) {
          output = output + String.fromCharCode(chr3);
        }
      } while (i < input.length);
      return output;
    };
    function intArrayFromBase64(s) {
      if (typeof ENVIRONMENT_IS_NODE === "boolean" && ENVIRONMENT_IS_NODE) {
        var buf;
        try {
          buf = Buffer.from(s, "base64");
        } catch (_) {
          buf = new Buffer(s, "base64");
        }
        return new Uint8Array(buf["buffer"], buf["byteOffset"], buf["byteLength"]);
      }
      try {
        var decoded = decodeBase64(s);
        var bytes = new Uint8Array(decoded.length);
        for (var i = 0; i < decoded.length; ++i) {
          bytes[i] = decoded.charCodeAt(i);
        }
        return bytes;
      } catch (_) {
        throw new Error("Converting base64 string to bytes failed.");
      }
    }
    function tryParseAsDataURI(filename) {
      if (!isDataURI(filename)) {
        return;
      }
      return intArrayFromBase64(filename.slice(dataURIPrefix.length));
    }
    var asmGlobalArg = {
      Math,
      Int8Array,
      Int16Array,
      Int32Array,
      Uint8Array,
      Uint16Array,
      Float32Array,
      Float64Array
    };
    var asmLibraryArg = {
      A: _emscripten_memcpy_big,
      B: _emscripten_resize_heap,
      C: _llvm_trap,
      D: tempDoublePtr,
      a: abort,
      b: setTempRet0,
      c: getTempRet0,
      d: ___cxa_allocate_exception,
      e: ___cxa_begin_catch,
      f: ___cxa_throw,
      g: ___cxa_uncaught_exceptions,
      h: ___exception_addRef,
      i: ___exception_deAdjust,
      j: ___gxx_personality_v0,
      k: __embind_register_bool,
      l: __embind_register_class,
      m: __embind_register_class_constructor,
      n: __embind_register_class_function,
      o: __embind_register_emval,
      p: __embind_register_float,
      q: __embind_register_integer,
      r: __embind_register_memory_view,
      s: __embind_register_std_string,
      t: __embind_register_std_wstring,
      u: __embind_register_void,
      v: __emval_decref,
      w: __emval_register,
      x: _abort,
      y: _embind_repr,
      z: _emscripten_get_heap_size
    };
    var asm = (
      /** @suppress {uselessCode} */
      function(global, env, buffer2) {
        ;
        var a = new global.Int8Array(buffer2), b = new global.Int16Array(buffer2), c = new global.Int32Array(buffer2), d = new global.Uint8Array(buffer2), e = new global.Uint16Array(buffer2), f = new global.Float32Array(buffer2), g = new global.Float64Array(buffer2), h = env.D | 0, i = 0, j = 0, k = 0, l = 0, m = 0, n = 0, o = 0, p = 0, q = global.Math.imul, r = global.Math.clz32, s = env.a, t = env.b, u = env.c, v = env.d, w = env.e, x = env.f, y = env.g, z = env.h, A = env.i, B = env.j, C = env.k, D = env.l, E = env.m, F = env.n, G = env.o, H = env.p, I = env.q, J = env.r, K = env.s, L = env.t, M = env.u, N = env.v, O = env.w, P = env.x, Q = env.y, R = env.z, S = env.A, T = env.B, U = env.C, V = 22384, W = 5265264, X = 0;
        function ia() {
          em();
          fm();
        }
        function ja() {
          ka(0);
          return;
        }
        function ka(a2) {
          a2 = a2 | 0;
          var b2 = 0, d2 = 0, e2 = 0, f2 = 0, g2 = 0, h2 = 0, i2 = 0, j2 = 0, k2 = 0, l2 = 0, m2 = 0;
          a2 = V;
          V = V + 16 | 0;
          b2 = a2 + 8 | 0;
          d2 = a2;
          vk();
          m2 = xk() | 0;
          g2 = yk() | 0;
          f2 = Ak() | 0;
          h2 = Bk() | 0;
          i2 = Ck() | 0;
          j2 = Dk() | 0;
          k2 = Jk() | 0;
          l2 = Kk() | 0;
          e2 = Kk() | 0;
          D(f2 | 0, h2 | 0, i2 | 0, j2 | 0, k2 | 0, 9, l2 | 0, m2 | 0, e2 | 0, g2 | 0, 6204, Lk() | 0, 138);
          Nk(1);
          c[d2 >> 2] = 5;
          c[d2 + 4 >> 2] = 0;
          c[b2 >> 2] = c[d2 >> 2];
          c[b2 + 4 >> 2] = c[d2 + 4 >> 2];
          Uk(6211, b2);
          c[d2 >> 2] = 3;
          c[d2 + 4 >> 2] = 0;
          c[b2 >> 2] = c[d2 >> 2];
          c[b2 + 4 >> 2] = c[d2 + 4 >> 2];
          cl(6216, b2);
          c[d2 >> 2] = 10;
          c[d2 + 4 >> 2] = 0;
          c[b2 >> 2] = c[d2 >> 2];
          c[b2 + 4 >> 2] = c[d2 + 4 >> 2];
          kl(6225, b2);
          sl();
          g2 = ul() | 0;
          e2 = vl() | 0;
          m2 = xl() | 0;
          l2 = yl() | 0;
          k2 = zl() | 0;
          j2 = Dk() | 0;
          i2 = Jk() | 0;
          h2 = Kk() | 0;
          f2 = Kk() | 0;
          D(m2 | 0, l2 | 0, k2 | 0, j2 | 0, i2 | 0, 11, h2 | 0, g2 | 0, f2 | 0, e2 | 0, 6234, Lk() | 0, 139);
          Gl(2);
          c[d2 >> 2] = 6;
          c[d2 + 4 >> 2] = 0;
          c[b2 >> 2] = c[d2 >> 2];
          c[b2 + 4 >> 2] = c[d2 + 4 >> 2];
          Nl(6211, b2);
          c[d2 >> 2] = 4;
          c[d2 + 4 >> 2] = 0;
          c[b2 >> 2] = c[d2 >> 2];
          c[b2 + 4 >> 2] = c[d2 + 4 >> 2];
          Ul(6248, b2);
          c[d2 >> 2] = 5;
          c[d2 + 4 >> 2] = 0;
          c[b2 >> 2] = c[d2 >> 2];
          c[b2 + 4 >> 2] = c[d2 + 4 >> 2];
          Ul(6265, b2);
          c[d2 >> 2] = 6;
          c[d2 + 4 >> 2] = 0;
          c[b2 >> 2] = c[d2 >> 2];
          c[b2 + 4 >> 2] = c[d2 + 4 >> 2];
          Ul(6280, b2);
          c[d2 >> 2] = 7;
          c[d2 + 4 >> 2] = 0;
          c[b2 >> 2] = c[d2 >> 2];
          c[b2 + 4 >> 2] = c[d2 + 4 >> 2];
          _l(6216, b2);
          V = a2;
          return;
        }
        function la(a2, b2, d2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          d2 = d2 | 0;
          var e2 = 0, f2 = 0, g2 = 0, h2 = 0, i2 = 0;
          e2 = V;
          V = V + 32 | 0;
          h2 = e2 + 16 | 0;
          f2 = e2 + 8 | 0;
          i2 = e2;
          g2 = eq(20) | 0;
          ta(g2, b2, d2);
          c[i2 >> 2] = 0;
          c[h2 >> 2] = c[i2 >> 2];
          va(f2, g2, h2);
          b2 = c[f2 >> 2] | 0;
          c[f2 >> 2] = c[a2 >> 2];
          c[a2 >> 2] = b2;
          b2 = f2 + 4 | 0;
          d2 = a2 + 4 | 0;
          g2 = c[b2 >> 2] | 0;
          c[b2 >> 2] = c[d2 >> 2];
          c[d2 >> 2] = g2;
          wa(f2);
          d2 = eq(352) | 0;
          ua(d2, c[a2 >> 2] | 0);
          g2 = a2 + 8 | 0;
          c[i2 >> 2] = 0;
          c[h2 >> 2] = c[i2 >> 2];
          Fa(f2, d2, h2);
          d2 = c[f2 >> 2] | 0;
          c[f2 >> 2] = c[g2 >> 2];
          c[g2 >> 2] = d2;
          g2 = f2 + 4 | 0;
          d2 = a2 + 12 | 0;
          b2 = c[g2 >> 2] | 0;
          c[g2 >> 2] = c[d2 >> 2];
          c[d2 >> 2] = b2;
          Ga(f2);
          V = e2;
          return;
        }
        function ma(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          dd(c[a2 + 8 >> 2] | 0, b2);
          return;
        }
        function na(a2) {
          a2 = a2 | 0;
          a2 = (Qh(c[a2 + 8 >> 2] | 0) | 0) + 107 | 0;
          return d[a2 >> 0] | d[a2 + 1 >> 0] << 8 | d[a2 + 2 >> 0] << 16 | d[a2 + 3 >> 0] << 24 | 0;
        }
        function oa(a2, b2, d2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          d2 = d2 | 0;
          var e2 = 0, f2 = 0, g2 = 0, h2 = 0, i2 = 0;
          e2 = V;
          V = V + 32 | 0;
          g2 = e2 + 16 | 0;
          f2 = e2 + 8 | 0;
          h2 = e2;
          i2 = eq(12) | 0;
          Rh(i2, b2, d2);
          c[h2 >> 2] = 0;
          c[g2 >> 2] = c[h2 >> 2];
          Vh(f2, i2, g2);
          i2 = c[f2 >> 2] | 0;
          c[f2 >> 2] = c[a2 >> 2];
          c[a2 >> 2] = i2;
          i2 = f2 + 4 | 0;
          d2 = a2 + 4 | 0;
          b2 = c[i2 >> 2] | 0;
          c[i2 >> 2] = c[d2 >> 2];
          c[d2 >> 2] = b2;
          Wh(f2);
          d2 = a2 + 8 | 0;
          b2 = eq(12) | 0;
          Sh(b2, c[a2 >> 2] | 0);
          c[h2 >> 2] = 0;
          c[g2 >> 2] = c[h2 >> 2];
          ai(f2, b2, g2);
          b2 = c[f2 >> 2] | 0;
          c[f2 >> 2] = c[d2 >> 2];
          c[d2 >> 2] = b2;
          b2 = f2 + 4 | 0;
          h2 = a2 + 12 | 0;
          i2 = c[b2 >> 2] | 0;
          c[b2 >> 2] = c[h2 >> 2];
          c[h2 >> 2] = i2;
          bi(f2);
          Th(f2, c[d2 >> 2] | 0);
          d2 = a2 + 16 | 0;
          h2 = c[f2 >> 2] | 0;
          i2 = f2 + 4 | 0;
          b2 = c[i2 >> 2] | 0;
          c[f2 >> 2] = 0;
          c[i2 >> 2] = 0;
          c[g2 >> 2] = c[d2 >> 2];
          c[d2 >> 2] = h2;
          d2 = a2 + 20 | 0;
          c[g2 + 4 >> 2] = c[d2 >> 2];
          c[d2 >> 2] = b2;
          Uh(g2);
          Uh(f2);
          V = e2;
          return;
        }
        function pa(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          var d2 = 0;
          a2 = a2 + 16 | 0;
          d2 = c[a2 >> 2] | 0;
          a:
            do
              if (d2 | 0)
                switch (b2 | 0) {
                  case 4: {
                    ui(d2);
                    break a;
                  }
                  case 8: {
                    vi(d2);
                    vi(c[a2 >> 2] | 0);
                    break a;
                  }
                  default:
                    break a;
                }
            while (0);
          return;
        }
        function qa(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          var d2 = 0;
          d2 = a2 + 16 | 0;
          a2 = c[d2 >> 2] | 0;
          a:
            do
              if (a2 | 0) {
                switch (b2 | 0) {
                  case 1: {
                    hj(a2);
                    break a;
                  }
                  case 2: {
                    ij(a2);
                    break a;
                  }
                  case 8: {
                    ui(a2);
                    a2 = c[d2 >> 2] | 0;
                    break;
                  }
                  case 4:
                    break;
                  default:
                    break a;
                }
                ui(a2);
              }
            while (0);
          return;
        }
        function ra(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          var d2 = 0;
          d2 = a2 + 16 | 0;
          a2 = c[d2 >> 2] | 0;
          a:
            do
              if (a2 | 0) {
                switch (b2 | 0) {
                  case 1: {
                    Rj(a2);
                    break a;
                  }
                  case 2: {
                    Sj(a2);
                    break a;
                  }
                  case 8: {
                    vi(a2);
                    a2 = c[d2 >> 2] | 0;
                    break;
                  }
                  case 4:
                    break;
                  default:
                    break a;
                }
                vi(a2);
              }
            while (0);
          return;
        }
        function sa(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          a2 = c[a2 + 16 >> 2] | 0;
          if (a2 | 0)
            $[c[c[a2 >> 2] >> 2] & 63](a2, b2) | 0;
          return;
        }
        function ta(b2, d2, e2) {
          b2 = b2 | 0;
          d2 = d2 | 0;
          e2 = e2 | 0;
          c[b2 >> 2] = d2;
          c[b2 + 4 >> 2] = e2;
          c[b2 + 8 >> 2] = 0;
          a[b2 + 12 >> 0] = 0;
          a[b2 + 13 >> 0] = 0;
          c[b2 + 16 >> 2] = 0;
          return;
        }
        function ua(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          c[a2 >> 2] = b2;
          Va(a2 + 4 | 0, b2);
          Wa(a2 + 247 | 0);
          c[a2 + 288 >> 2] = 0;
          c[a2 + 292 >> 2] = 0;
          c[a2 + 296 >> 2] = 0;
          Xa(a2 + 300 | 0);
          b2 = a2 + 312 | 0;
          c[b2 >> 2] = 0;
          c[b2 + 4 >> 2] = 0;
          c[b2 + 8 >> 2] = 0;
          c[b2 + 12 >> 2] = 0;
          Ya(a2 + 328 | 0);
          Za(a2);
          return;
        }
        function va(a2, b2, d2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          d2 = d2 | 0;
          var e2 = 0, f2 = 0;
          d2 = V;
          V = V + 16 | 0;
          e2 = d2;
          c[a2 >> 2] = b2;
          f2 = eq(16) | 0;
          c[f2 + 4 >> 2] = 0;
          c[f2 + 8 >> 2] = 0;
          c[f2 >> 2] = 4296;
          c[f2 + 12 >> 2] = b2;
          c[a2 + 4 >> 2] = f2;
          c[e2 >> 2] = b2;
          c[e2 + 4 >> 2] = b2;
          xa(a2, e2);
          V = d2;
          return;
        }
        function wa(a2) {
          a2 = a2 | 0;
          var b2 = 0, d2 = 0;
          a2 = c[a2 + 4 >> 2] | 0;
          if (a2 | 0 ? (d2 = a2 + 4 | 0, b2 = c[d2 >> 2] | 0, c[d2 >> 2] = b2 + -1, (b2 | 0) == 0) : 0) {
            ca[c[(c[a2 >> 2] | 0) + 8 >> 2] & 255](a2);
            qq(a2);
          }
          return;
        }
        function xa(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          return;
        }
        function ya(a2) {
          a2 = a2 | 0;
          w(a2 | 0) | 0;
          lp();
        }
        function za(a2) {
          a2 = a2 | 0;
          pq(a2);
          jp(a2);
          return;
        }
        function Aa(a2) {
          a2 = a2 | 0;
          a2 = c[a2 + 12 >> 2] | 0;
          if (a2 | 0)
            jp(a2);
          return;
        }
        function Ba(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          return ((c[b2 + 4 >> 2] | 0) == 6407 ? a2 + 12 | 0 : 0) | 0;
        }
        function Ca(a2) {
          a2 = a2 | 0;
          Da(a2, 16);
          return;
        }
        function Da(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          Ea(a2);
          return;
        }
        function Ea(a2) {
          a2 = a2 | 0;
          jp(a2);
          return;
        }
        function Fa(a2, b2, d2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          d2 = d2 | 0;
          var e2 = 0, f2 = 0;
          d2 = V;
          V = V + 16 | 0;
          e2 = d2;
          c[a2 >> 2] = b2;
          f2 = eq(16) | 0;
          c[f2 + 4 >> 2] = 0;
          c[f2 + 8 >> 2] = 0;
          c[f2 >> 2] = 4324;
          c[f2 + 12 >> 2] = b2;
          c[a2 + 4 >> 2] = f2;
          c[e2 >> 2] = b2;
          c[e2 + 4 >> 2] = b2;
          Ha(a2, e2);
          V = d2;
          return;
        }
        function Ga(a2) {
          a2 = a2 | 0;
          var b2 = 0, d2 = 0;
          a2 = c[a2 + 4 >> 2] | 0;
          if (a2 | 0 ? (d2 = a2 + 4 | 0, b2 = c[d2 >> 2] | 0, c[d2 >> 2] = b2 + -1, (b2 | 0) == 0) : 0) {
            ca[c[(c[a2 >> 2] | 0) + 8 >> 2] & 255](a2);
            qq(a2);
          }
          return;
        }
        function Ha(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          return;
        }
        function Ia(a2) {
          a2 = a2 | 0;
          pq(a2);
          jp(a2);
          return;
        }
        function Ja(a2) {
          a2 = a2 | 0;
          a2 = c[a2 + 12 >> 2] | 0;
          if (a2 | 0) {
            Ma(a2);
            jp(a2);
          }
          return;
        }
        function Ka(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          return ((c[b2 + 4 >> 2] | 0) == 6605 ? a2 + 12 | 0 : 0) | 0;
        }
        function La(a2) {
          a2 = a2 | 0;
          Da(a2, 16);
          return;
        }
        function Ma(a2) {
          a2 = a2 | 0;
          Na(a2 + 320 | 0);
          Oa(a2 + 312 | 0);
          Pa(a2 + 300 | 0);
          Ta(a2 + 288 | 0);
          Qa(a2 + 247 | 0);
          Ra(a2 + 4 | 0);
          return;
        }
        function Na(a2) {
          a2 = a2 | 0;
          var b2 = 0, d2 = 0;
          a2 = c[a2 + 4 >> 2] | 0;
          if (a2 | 0 ? (d2 = a2 + 4 | 0, b2 = c[d2 >> 2] | 0, c[d2 >> 2] = b2 + -1, (b2 | 0) == 0) : 0) {
            ca[c[(c[a2 >> 2] | 0) + 8 >> 2] & 255](a2);
            qq(a2);
          }
          return;
        }
        function Oa(a2) {
          a2 = a2 | 0;
          var b2 = 0, d2 = 0;
          a2 = c[a2 + 4 >> 2] | 0;
          if (a2 | 0 ? (d2 = a2 + 4 | 0, b2 = c[d2 >> 2] | 0, c[d2 >> 2] = b2 + -1, (b2 | 0) == 0) : 0) {
            ca[c[(c[a2 >> 2] | 0) + 8 >> 2] & 255](a2);
            qq(a2);
          }
          return;
        }
        function Pa(a2) {
          a2 = a2 | 0;
          Sa(a2);
          return;
        }
        function Qa(a2) {
          a2 = a2 | 0;
          a2 = a2 + 34 | 0;
          a2 = d[a2 >> 0] | d[a2 + 1 >> 0] << 8 | d[a2 + 2 >> 0] << 16 | d[a2 + 3 >> 0] << 24;
          if (a2 | 0)
            gq(a2);
          return;
        }
        function Ra(a2) {
          a2 = a2 | 0;
          Ua(c[a2 + 12 >> 2] | 0);
          return;
        }
        function Sa(a2) {
          a2 = a2 | 0;
          var b2 = 0, d2 = 0;
          b2 = c[a2 >> 2] | 0;
          d2 = b2;
          if (b2 | 0) {
            c[a2 + 4 >> 2] = d2;
            Da(b2, (c[a2 + 8 >> 2] | 0) - d2 | 0);
          }
          return;
        }
        function Ta(a2) {
          a2 = a2 | 0;
          var b2 = 0, d2 = 0;
          b2 = c[a2 >> 2] | 0;
          d2 = b2;
          if (b2 | 0) {
            c[a2 + 4 >> 2] = d2;
            Da(b2, (c[a2 + 8 >> 2] | 0) - d2 | 0);
          }
          return;
        }
        function Ua(a2) {
          a2 = a2 | 0;
          er(c[a2 + -4 >> 2] | 0);
          return;
        }
        function Va(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          c[a2 >> 2] = b2;
          c[a2 + 4 >> 2] = 0;
          c[a2 + 8 >> 2] = 0;
          c[a2 + 12 >> 2] = _a(1048576) | 0;
          return;
        }
        function Wa(b2) {
          b2 = b2 | 0;
          var c2 = 0;
          c2 = b2 + 32 | 0;
          a[c2 >> 0] = 0;
          a[c2 + 1 >> 0] = 0;
          b2 = b2 + 34 | 0;
          a[b2 >> 0] = 0;
          a[b2 + 1 >> 0] = 0;
          a[b2 + 2 >> 0] = 0;
          a[b2 + 3 >> 0] = 0;
          return;
        }
        function Xa(a2) {
          a2 = a2 | 0;
          c[a2 >> 2] = 0;
          c[a2 + 4 >> 2] = 0;
          c[a2 + 8 >> 2] = 0;
          return;
        }
        function Ya(a2) {
          a2 = a2 | 0;
          c[a2 >> 2] = 0;
          c[a2 + 4 >> 2] = 0;
          c[a2 + 8 >> 2] = 0;
          c[a2 + 12 >> 2] = 0;
          a2 = a2 + 16 | 0;
          c[a2 >> 2] = -1;
          c[a2 + 4 >> 2] = -1;
          return;
        }
        function Za(b2) {
          b2 = b2 | 0;
          var d2 = 0, e2 = 0, f2 = 0, g2 = 0, h2 = 0, i2 = 0;
          i2 = V;
          V = V + 64 | 0;
          g2 = i2 + 32 | 0;
          e2 = i2 + 56 | 0;
          d2 = i2 + 16 | 0;
          h2 = i2;
          $a(c[b2 >> 2] | 0, e2, 4);
          mb(g2, e2, e2 + 4 | 0);
          e2 = lb(6693) | 0;
          f2 = a[g2 + 11 >> 0] | 0;
          if ((e2 | 0) == ((f2 << 24 >> 24 < 0 ? c[g2 + 4 >> 2] | 0 : f2 & 255) | 0)) {
            f2 = (Hq(g2, 0, -1, 6693, e2) | 0) == 0;
            Cq(g2);
            if (f2) {
              e2 = c[b2 >> 2] | 0;
              c[d2 >> 2] = 0;
              c[d2 + 4 >> 2] = 0;
              c[d2 + 8 >> 2] = 0;
              c[d2 + 12 >> 2] = 0;
              c[g2 >> 2] = c[d2 >> 2];
              c[g2 + 4 >> 2] = c[d2 + 4 >> 2];
              c[g2 + 8 >> 2] = c[d2 + 8 >> 2];
              c[g2 + 12 >> 2] = c[d2 + 12 >> 2];
              bb(e2, g2);
              e2 = b2 + 20 | 0;
              $a(c[b2 >> 2] | 0, e2, 227);
              cb(b2, e2);
              f2 = db() | 0;
              d2 = c[f2 >> 2] | 0;
              f2 = c[f2 + 4 >> 2] | 0;
              if ((d2 | 0) != (f2 | 0))
                do {
                  eb(g2, d2);
                  fb(g2, e2);
                  gb(g2);
                  d2 = d2 + 24 | 0;
                } while ((d2 | 0) != (f2 | 0));
              hb(b2);
              ib(b2);
              jb(c[b2 >> 2] | 0);
              f2 = c[b2 >> 2] | 0;
              d2 = (c[b2 + 116 >> 2] | 0) + 8 | 0;
              e2 = h2;
              c[e2 >> 2] = 0;
              c[e2 + 4 >> 2] = 0;
              e2 = h2 + 8 | 0;
              c[e2 >> 2] = d2;
              c[e2 + 4 >> 2] = 0;
              c[g2 >> 2] = c[h2 >> 2];
              c[g2 + 4 >> 2] = c[h2 + 4 >> 2];
              c[g2 + 8 >> 2] = c[h2 + 8 >> 2];
              c[g2 + 12 >> 2] = c[h2 + 12 >> 2];
              bb(f2, g2);
              kb(b2 + 4 | 0);
              V = i2;
              return;
            }
          } else
            Cq(g2);
          i2 = v(8) | 0;
          ab(i2);
          x(i2 | 0, 2592, 8);
        }
        function _a(a2) {
          a2 = a2 | 0;
          var b2 = 0;
          b2 = dr(a2 + 68 | 0) | 0;
          a2 = b2 + 68 & -64;
          c[a2 + -4 >> 2] = b2;
          return a2 | 0;
        }
        function $a(b2, d2, e2) {
          b2 = b2 | 0;
          d2 = d2 | 0;
          e2 = e2 | 0;
          var f2 = 0, g2 = 0, h2 = 0, i2 = 0, j2 = 0, k2 = 0;
          i2 = b2 + 13 | 0;
          if (!(a[i2 >> 0] | 0)) {
            h2 = b2 + 4 | 0;
            f2 = c[h2 >> 2] | 0;
            j2 = b2 + 8 | 0;
            g2 = c[j2 >> 2] | 0;
            k2 = f2 - g2 | 0;
            e2 = (k2 | 0) < (e2 | 0) ? k2 : e2;
            if (e2) {
              vr(d2 | 0, (c[b2 >> 2] | 0) + g2 | 0, e2 | 0) | 0;
              g2 = c[j2 >> 2] | 0;
              f2 = c[h2 >> 2] | 0;
            }
            k2 = g2 + e2 | 0;
            c[j2 >> 2] = k2;
            c[b2 + 16 >> 2] = e2;
            if ((k2 | 0) >= (f2 | 0))
              a[i2 >> 0] = 1;
          } else
            a[b2 + 12 >> 0] = 1;
          return;
        }
        function ab(a2) {
          a2 = a2 | 0;
          xq(a2, 6791);
          c[a2 >> 2] = 4352;
          return;
        }
        function bb(b2, d2) {
          b2 = b2 | 0;
          d2 = d2 | 0;
          var e2 = 0, f2 = 0, g2 = 0;
          g2 = d2 + 8 | 0;
          d2 = c[g2 >> 2] | 0;
          g2 = c[g2 + 4 >> 2] | 0;
          e2 = c[b2 + 4 >> 2] | 0;
          f2 = ((e2 | 0) < 0) << 31 >> 31;
          if ((g2 | 0) < (f2 | 0) | (g2 | 0) == (f2 | 0) & d2 >>> 0 < e2 >>> 0)
            c[b2 + 8 >> 2] = d2;
          else
            a[b2 + 12 >> 0] = 1;
          return;
        }
        function cb(b2, c2) {
          b2 = b2 | 0;
          c2 = c2 | 0;
          var d2 = 0, e2 = 0, f2 = 0, i2 = 0, j2 = 0, k2 = 0, l2 = 0, m2 = 0, n2 = 0, o2 = 0;
          n2 = c2 + 179 | 0;
          a[h >> 0] = a[n2 >> 0];
          a[h + 1 >> 0] = a[n2 + 1 >> 0];
          a[h + 2 >> 0] = a[n2 + 2 >> 0];
          a[h + 3 >> 0] = a[n2 + 3 >> 0];
          a[h + 4 >> 0] = a[n2 + 4 >> 0];
          a[h + 5 >> 0] = a[n2 + 5 >> 0];
          a[h + 6 >> 0] = a[n2 + 6 >> 0];
          a[h + 7 >> 0] = a[n2 + 7 >> 0];
          m2 = +g[h >> 3];
          j2 = c2 + 187 | 0;
          a[h >> 0] = a[j2 >> 0];
          a[h + 1 >> 0] = a[j2 + 1 >> 0];
          a[h + 2 >> 0] = a[j2 + 2 >> 0];
          a[h + 3 >> 0] = a[j2 + 3 >> 0];
          a[h + 4 >> 0] = a[j2 + 4 >> 0];
          a[h + 5 >> 0] = a[j2 + 5 >> 0];
          a[h + 6 >> 0] = a[j2 + 6 >> 0];
          a[h + 7 >> 0] = a[j2 + 7 >> 0];
          o2 = +g[h >> 3];
          b2 = c2 + 195 | 0;
          a[h >> 0] = a[b2 >> 0];
          a[h + 1 >> 0] = a[b2 + 1 >> 0];
          a[h + 2 >> 0] = a[b2 + 2 >> 0];
          a[h + 3 >> 0] = a[b2 + 3 >> 0];
          a[h + 4 >> 0] = a[b2 + 4 >> 0];
          a[h + 5 >> 0] = a[b2 + 5 >> 0];
          a[h + 6 >> 0] = a[b2 + 6 >> 0];
          a[h + 7 >> 0] = a[b2 + 7 >> 0];
          i2 = +g[h >> 3];
          l2 = c2 + 203 | 0;
          a[h >> 0] = a[l2 >> 0];
          a[h + 1 >> 0] = a[l2 + 1 >> 0];
          a[h + 2 >> 0] = a[l2 + 2 >> 0];
          a[h + 3 >> 0] = a[l2 + 3 >> 0];
          a[h + 4 >> 0] = a[l2 + 4 >> 0];
          a[h + 5 >> 0] = a[l2 + 5 >> 0];
          a[h + 6 >> 0] = a[l2 + 6 >> 0];
          a[h + 7 >> 0] = a[l2 + 7 >> 0];
          k2 = +g[h >> 3];
          f2 = c2 + 211 | 0;
          a[h >> 0] = a[f2 >> 0];
          a[h + 1 >> 0] = a[f2 + 1 >> 0];
          a[h + 2 >> 0] = a[f2 + 2 >> 0];
          a[h + 3 >> 0] = a[f2 + 3 >> 0];
          a[h + 4 >> 0] = a[f2 + 4 >> 0];
          a[h + 5 >> 0] = a[f2 + 5 >> 0];
          a[h + 6 >> 0] = a[f2 + 6 >> 0];
          a[h + 7 >> 0] = a[f2 + 7 >> 0];
          d2 = +g[h >> 3];
          c2 = c2 + 219 | 0;
          a[h >> 0] = a[c2 >> 0];
          a[h + 1 >> 0] = a[c2 + 1 >> 0];
          a[h + 2 >> 0] = a[c2 + 2 >> 0];
          a[h + 3 >> 0] = a[c2 + 3 >> 0];
          a[h + 4 >> 0] = a[c2 + 4 >> 0];
          a[h + 5 >> 0] = a[c2 + 5 >> 0];
          a[h + 6 >> 0] = a[c2 + 6 >> 0];
          a[h + 7 >> 0] = a[c2 + 7 >> 0];
          e2 = +g[h >> 3];
          g[h >> 3] = o2;
          a[n2 >> 0] = a[h >> 0];
          a[n2 + 1 >> 0] = a[h + 1 >> 0];
          a[n2 + 2 >> 0] = a[h + 2 >> 0];
          a[n2 + 3 >> 0] = a[h + 3 >> 0];
          a[n2 + 4 >> 0] = a[h + 4 >> 0];
          a[n2 + 5 >> 0] = a[h + 5 >> 0];
          a[n2 + 6 >> 0] = a[h + 6 >> 0];
          a[n2 + 7 >> 0] = a[h + 7 >> 0];
          g[h >> 3] = m2;
          a[l2 >> 0] = a[h >> 0];
          a[l2 + 1 >> 0] = a[h + 1 >> 0];
          a[l2 + 2 >> 0] = a[h + 2 >> 0];
          a[l2 + 3 >> 0] = a[h + 3 >> 0];
          a[l2 + 4 >> 0] = a[h + 4 >> 0];
          a[l2 + 5 >> 0] = a[h + 5 >> 0];
          a[l2 + 6 >> 0] = a[h + 6 >> 0];
          a[l2 + 7 >> 0] = a[h + 7 >> 0];
          g[h >> 3] = k2;
          a[j2 >> 0] = a[h >> 0];
          a[j2 + 1 >> 0] = a[h + 1 >> 0];
          a[j2 + 2 >> 0] = a[h + 2 >> 0];
          a[j2 + 3 >> 0] = a[h + 3 >> 0];
          a[j2 + 4 >> 0] = a[h + 4 >> 0];
          a[j2 + 5 >> 0] = a[h + 5 >> 0];
          a[j2 + 6 >> 0] = a[h + 6 >> 0];
          a[j2 + 7 >> 0] = a[h + 7 >> 0];
          g[h >> 3] = i2;
          a[f2 >> 0] = a[h >> 0];
          a[f2 + 1 >> 0] = a[h + 1 >> 0];
          a[f2 + 2 >> 0] = a[h + 2 >> 0];
          a[f2 + 3 >> 0] = a[h + 3 >> 0];
          a[f2 + 4 >> 0] = a[h + 4 >> 0];
          a[f2 + 5 >> 0] = a[h + 5 >> 0];
          a[f2 + 6 >> 0] = a[h + 6 >> 0];
          a[f2 + 7 >> 0] = a[h + 7 >> 0];
          g[h >> 3] = e2;
          a[b2 >> 0] = a[h >> 0];
          a[b2 + 1 >> 0] = a[h + 1 >> 0];
          a[b2 + 2 >> 0] = a[h + 2 >> 0];
          a[b2 + 3 >> 0] = a[h + 3 >> 0];
          a[b2 + 4 >> 0] = a[h + 4 >> 0];
          a[b2 + 5 >> 0] = a[h + 5 >> 0];
          a[b2 + 6 >> 0] = a[h + 6 >> 0];
          a[b2 + 7 >> 0] = a[h + 7 >> 0];
          g[h >> 3] = d2;
          a[c2 >> 0] = a[h >> 0];
          a[c2 + 1 >> 0] = a[h + 1 >> 0];
          a[c2 + 2 >> 0] = a[h + 2 >> 0];
          a[c2 + 3 >> 0] = a[h + 3 >> 0];
          a[c2 + 4 >> 0] = a[h + 4 >> 0];
          a[c2 + 5 >> 0] = a[h + 5 >> 0];
          a[c2 + 6 >> 0] = a[h + 6 >> 0];
          a[c2 + 7 >> 0] = a[h + 7 >> 0];
          return;
        }
        function db() {
          var b2 = 0, d2 = 0, e2 = 0, f2 = 0, g2 = 0, h2 = 0, i2 = 0, j2 = 0;
          g2 = V;
          V = V + 48 | 0;
          e2 = g2 + 24 | 0;
          f2 = g2;
          b2 = g2 + 44 | 0;
          if ((a[21440] | 0) == 0 ? Tp(21440) | 0 : 0) {
            c[5374] = 0;
            c[5375] = 0;
            c[5376] = 0;
            $p(21440);
          }
          if ((a[21448] | 0) == 0 ? Tp(21448) | 0 : 0)
            $p(21448);
          if ((c[5374] | 0) == (c[5375] | 0)) {
            rq(21508);
            if ((c[5374] | 0) == (c[5375] | 0)) {
              a[e2 >> 0] = a[b2 >> 0] | 0;
              pb(f2, e2);
              b2 = c[5375] | 0;
              do
                if (b2 >>> 0 >= (c[5376] | 0) >>> 0) {
                  b2 = ((b2 - (c[5374] | 0) | 0) / 24 | 0) + 1 | 0;
                  d2 = xb(21496) | 0;
                  if (d2 >>> 0 < b2 >>> 0)
                    cr(21496);
                  else {
                    h2 = c[5374] | 0;
                    j2 = ((c[5376] | 0) - h2 | 0) / 24 | 0;
                    i2 = j2 << 1;
                    ub(
                      e2,
                      j2 >>> 0 < d2 >>> 1 >>> 0 ? i2 >>> 0 < b2 >>> 0 ? b2 : i2 : d2,
                      ((c[5375] | 0) - h2 | 0) / 24 | 0,
                      21504
                    );
                    d2 = e2 + 8 | 0;
                    sb(c[d2 >> 2] | 0, f2);
                    c[d2 >> 2] = (c[d2 >> 2] | 0) + 24;
                    vb(21496, e2);
                    wb(e2);
                    break;
                  }
                } else {
                  qb(e2, 21496, 1);
                  j2 = e2 + 4 | 0;
                  sb(c[j2 >> 2] | 0, f2);
                  c[j2 >> 2] = (c[j2 >> 2] | 0) + 24;
                  rb(e2);
                }
              while (0);
              gb(f2);
            }
            sq(21508);
          }
          V = g2;
          return 21496;
        }
        function eb(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          var d2 = 0, e2 = 0;
          d2 = b2 + 16 | 0;
          e2 = c[d2 >> 2] | 0;
          do
            if (e2)
              if ((b2 | 0) == (e2 | 0)) {
                e2 = tb(a2) | 0;
                c[a2 + 16 >> 2] = e2;
                d2 = c[d2 >> 2] | 0;
                da[c[(c[d2 >> 2] | 0) + 12 >> 2] & 15](d2, e2);
                break;
              } else {
                c[a2 + 16 >> 2] = Z[c[(c[e2 >> 2] | 0) + 8 >> 2] & 15](e2) | 0;
                break;
              }
            else
              c[a2 + 16 >> 2] = 0;
          while (0);
          return;
        }
        function fb(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          a2 = c[a2 + 16 >> 2] | 0;
          if (!a2) {
            b2 = v(4) | 0;
            c[b2 >> 2] = 0;
            Nb(b2);
            x(b2 | 0, 4168, 131);
          } else {
            da[c[(c[a2 >> 2] | 0) + 24 >> 2] & 15](a2, b2);
            return;
          }
        }
        function gb(a2) {
          a2 = a2 | 0;
          var b2 = 0;
          b2 = c[a2 + 16 >> 2] | 0;
          if ((a2 | 0) != (b2 | 0)) {
            if (b2 | 0)
              ca[c[(c[b2 >> 2] | 0) + 20 >> 2] & 255](b2);
          } else
            ca[c[(c[b2 >> 2] | 0) + 16 >> 2] & 255](b2);
          return;
        }
        function hb(b2) {
          b2 = b2 | 0;
          var f2 = 0, g2 = 0, h2 = 0, i2 = 0, j2 = 0, k2 = 0, l2 = 0, m2 = 0, n2 = 0, o2 = 0, p2 = 0, q2 = 0;
          q2 = V;
          V = V + 96 | 0;
          i2 = q2 + 16 | 0;
          o2 = q2;
          l2 = q2 + 72 | 0;
          j2 = c[b2 >> 2] | 0;
          m2 = e[b2 + 114 >> 1] | 0;
          n2 = o2;
          c[n2 >> 2] = 0;
          c[n2 + 4 >> 2] = 0;
          n2 = o2 + 8 | 0;
          c[n2 >> 2] = m2;
          c[n2 + 4 >> 2] = 0;
          c[i2 >> 2] = c[o2 >> 2];
          c[i2 + 4 >> 2] = c[o2 + 4 >> 2];
          c[i2 + 8 >> 2] = c[o2 + 8 >> 2];
          c[i2 + 12 >> 2] = c[o2 + 12 >> 2];
          bb(j2, i2);
          j2 = b2 + 120 | 0;
          a:
            do
              if (c[j2 >> 2] | 0) {
                k2 = i2 + 2 | 0;
                m2 = i2 + 16 | 0;
                n2 = i2 + 20 | 0;
                o2 = i2 + 18 | 0;
                g2 = 0;
                while (1) {
                  if (!(Ob(c[b2 >> 2] | 0) | 0))
                    break a;
                  if (Pb(c[b2 >> 2] | 0) | 0)
                    break a;
                  $a(c[b2 >> 2] | 0, i2, 54);
                  f2 = 7277;
                  h2 = k2;
                  while (1) {
                    if ((a[h2 >> 0] | 0) != (a[f2 >> 0] | 0))
                      break;
                    h2 = h2 + 1 | 0;
                    if ((h2 | 0) == (m2 | 0)) {
                      p2 = 8;
                      break;
                    } else
                      f2 = f2 + 1 | 0;
                  }
                  if ((p2 | 0) == 8 ? (p2 = 0, (d[o2 >> 0] | d[o2 + 1 >> 0] << 8) << 16 >> 16 == 22204) : 0)
                    break;
                  Rb(c[b2 >> 2] | 0, (d[n2 >> 0] | d[n2 + 1 >> 0] << 8) & 65535, 0, 1);
                  g2 = g2 + 1 | 0;
                  if (g2 >>> 0 >= (c[j2 >> 2] | 0) >>> 0)
                    break a;
                }
                o2 = (d[n2 >> 0] | d[n2 + 1 >> 0] << 8) & 65535;
                p2 = fq(o2) | 0;
                $a(c[b2 >> 2] | 0, p2, o2);
                Qb(b2, p2);
                jp(p2);
                p2 = b2 + 125 | 0;
                Tb(l2, b2 + 247 | 0, (d[p2 >> 0] | d[p2 + 1 >> 0] << 8) & 65535);
                Ub(b2 + 300 | 0, l2) | 0;
                Pa(l2);
                V = q2;
                return;
              }
            while (0);
          q2 = v(8) | 0;
          Sb(q2);
          x(q2 | 0, 2672, 8);
        }
        function ib(a2) {
          a2 = a2 | 0;
          var b2 = 0, e2 = 0, f2 = 0, g2 = 0, h2 = 0, i2 = 0, j2 = 0, k2 = 0, l2 = 0, m2 = 0, n2 = 0, o2 = 0;
          n2 = V;
          V = V + 176 | 0;
          g2 = n2 + 40 | 0;
          h2 = n2 + 24 | 0;
          b2 = n2 + 16 | 0;
          f2 = n2;
          k2 = n2 + 152 | 0;
          l2 = n2 + 136 | 0;
          m2 = n2 + 56 | 0;
          j2 = c[a2 >> 2] | 0;
          i2 = a2 + 116 | 0;
          o2 = c[i2 >> 2] | 0;
          e2 = h2;
          c[e2 >> 2] = 0;
          c[e2 + 4 >> 2] = 0;
          e2 = h2 + 8 | 0;
          c[e2 >> 2] = o2;
          c[e2 + 4 >> 2] = 0;
          c[g2 >> 2] = c[h2 >> 2];
          c[g2 + 4 >> 2] = c[h2 + 4 >> 2];
          c[g2 + 8 >> 2] = c[h2 + 8 >> 2];
          c[g2 + 12 >> 2] = c[h2 + 12 >> 2];
          bb(j2, g2);
          j2 = b2;
          c[j2 >> 2] = 0;
          c[j2 + 4 >> 2] = 0;
          $a(c[a2 >> 2] | 0, b2, 8);
          if (!(Ob(c[a2 >> 2] | 0) | 0)) {
            o2 = v(8) | 0;
            hc(o2);
            x(o2 | 0, 2704, 8);
          }
          e2 = b2;
          b2 = c[e2 >> 2] | 0;
          e2 = c[e2 + 4 >> 2] | 0;
          if ((b2 | 0) == -1 & (e2 | 0) == -1) {
            o2 = v(8) | 0;
            ic(o2, 7488);
            x(o2 | 0, 2720, 8);
          }
          o2 = c[a2 >> 2] | 0;
          j2 = f2;
          c[j2 >> 2] = 0;
          c[j2 + 4 >> 2] = 0;
          j2 = f2 + 8 | 0;
          c[j2 >> 2] = b2;
          c[j2 + 4 >> 2] = e2;
          c[g2 >> 2] = c[f2 >> 2];
          c[g2 + 4 >> 2] = c[f2 + 4 >> 2];
          c[g2 + 8 >> 2] = c[f2 + 8 >> 2];
          c[g2 + 12 >> 2] = c[f2 + 12 >> 2];
          bb(o2, g2);
          if (!(Ob(c[a2 >> 2] | 0) | 0)) {
            o2 = v(8) | 0;
            hc(o2);
            x(o2 | 0, 2704, 8);
          }
          $a(c[a2 >> 2] | 0, g2, 8);
          if (!(Ob(c[a2 >> 2] | 0) | 0)) {
            o2 = v(8) | 0;
            hc(o2);
            x(o2 | 0, 2704, 8);
          }
          if (c[g2 >> 2] | 0) {
            o2 = v(8) | 0;
            jc(o2);
            x(o2 | 0, 2736, 8);
          }
          h2 = a2 + 288 | 0;
          j2 = a2 + 292 | 0;
          c[j2 >> 2] = c[h2 >> 2];
          o2 = a2 + 259 | 0;
          if ((d[o2 >> 0] | d[o2 + 1 >> 0] << 8 | d[o2 + 2 >> 0] << 16 | d[o2 + 3 >> 0] << 24 | 0) == -1) {
            o2 = v(8) | 0;
            ic(o2, 7606);
            x(o2 | 0, 2720, 8);
          }
          f2 = g2 + 4 | 0;
          kc(h2, (c[f2 >> 2] | 0) + 1 | 0);
          o2 = c[h2 >> 2] | 0;
          c[o2 >> 2] = (c[i2 >> 2] | 0) + 8;
          c[o2 + 4 >> 2] = 0;
          if ((c[f2 >> 2] | 0) >>> 0 > 1) {
            Va(k2, c[a2 >> 2] | 0);
            lc(l2, k2);
            mc(m2, 32, 2, 8, 0);
            nc(l2);
            oc(m2);
            if (!(c[f2 >> 2] | 0)) {
              h2 = c[h2 >> 2] | 0;
              e2 = h2;
            } else {
              e2 = 1;
              do {
                if (e2 >>> 0 > 1)
                  b2 = c[(c[h2 >> 2] | 0) + (e2 + -1 << 3) >> 2] | 0;
                else
                  b2 = 0;
                i2 = pc(m2, l2, b2, 1) | 0;
                b2 = c[h2 >> 2] | 0;
                o2 = b2 + (e2 << 3) | 0;
                c[o2 >> 2] = i2;
                c[o2 + 4 >> 2] = ((i2 | 0) < 0) << 31 >> 31;
                e2 = e2 + 1 | 0;
              } while (e2 >>> 0 <= (c[f2 >> 2] | 0) >>> 0);
              e2 = b2;
              h2 = b2;
            }
            b2 = c[j2 >> 2] | 0;
            if (b2 - e2 >> 3 >>> 0 > 1) {
              g2 = b2 - h2 >> 3;
              f2 = h2;
              b2 = 1;
              e2 = c[f2 >> 2] | 0;
              f2 = c[f2 + 4 >> 2] | 0;
              do {
                o2 = h2 + (b2 << 3) | 0;
                j2 = o2;
                e2 = lr(c[j2 >> 2] | 0, c[j2 + 4 >> 2] | 0, e2 | 0, f2 | 0) | 0;
                f2 = u() | 0;
                c[o2 >> 2] = e2;
                c[o2 + 4 >> 2] = f2;
                b2 = b2 + 1 | 0;
              } while (b2 >>> 0 < g2 >>> 0);
            }
            qc(m2);
            rc(l2);
            Ra(k2);
          }
          V = n2;
          return;
        }
        function jb(b2) {
          b2 = b2 | 0;
          a[b2 + 12 >> 0] = 0;
          a[b2 + 13 >> 0] = 0;
          return;
        }
        function kb(a2) {
          a2 = a2 | 0;
          c[a2 + 8 >> 2] = 0;
          c[a2 + 4 >> 2] = 0;
          return;
        }
        function lb(a2) {
          a2 = a2 | 0;
          return fo(a2) | 0;
        }
        function mb(b2, d2, e2) {
          b2 = b2 | 0;
          d2 = d2 | 0;
          e2 = e2 | 0;
          var f2 = 0, g2 = 0, h2 = 0, i2 = 0, j2 = 0, k2 = 0;
          i2 = V;
          V = V + 16 | 0;
          g2 = d2;
          h2 = i2;
          f2 = e2 - g2 | 0;
          if (f2 >>> 0 > 4294967279)
            yq(b2);
          if (f2 >>> 0 < 11)
            a[b2 + 11 >> 0] = f2;
          else {
            k2 = f2 + 16 & -16;
            j2 = eq(k2) | 0;
            c[b2 >> 2] = j2;
            c[b2 + 8 >> 2] = k2 | -2147483648;
            c[b2 + 4 >> 2] = f2;
            b2 = j2;
          }
          if ((d2 | 0) != (e2 | 0)) {
            g2 = e2 - g2 | 0;
            f2 = b2;
            while (1) {
              nb(f2, d2);
              d2 = d2 + 1 | 0;
              if ((d2 | 0) == (e2 | 0))
                break;
              else
                f2 = f2 + 1 | 0;
            }
            b2 = b2 + g2 | 0;
          }
          a[h2 >> 0] = 0;
          nb(b2, h2);
          V = i2;
          return;
        }
        function nb(b2, c2) {
          b2 = b2 | 0;
          c2 = c2 | 0;
          a[b2 >> 0] = a[c2 >> 0] | 0;
          return;
        }
        function ob(a2) {
          a2 = a2 | 0;
          yp(a2);
          jp(a2);
          return;
        }
        function pb(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          c[a2 >> 2] = 4372;
          c[a2 + 16 >> 2] = a2;
          return;
        }
        function qb(a2, b2, d2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          d2 = d2 | 0;
          c[a2 >> 2] = b2;
          b2 = c[b2 + 4 >> 2] | 0;
          c[a2 + 4 >> 2] = b2;
          c[a2 + 8 >> 2] = b2 + (d2 * 24 | 0);
          return;
        }
        function rb(a2) {
          a2 = a2 | 0;
          c[(c[a2 >> 2] | 0) + 4 >> 2] = c[a2 + 4 >> 2];
          return;
        }
        function sb(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          var d2 = 0, e2 = 0;
          d2 = b2 + 16 | 0;
          e2 = c[d2 >> 2] | 0;
          do
            if (e2)
              if ((b2 | 0) == (e2 | 0)) {
                e2 = tb(a2) | 0;
                c[a2 + 16 >> 2] = e2;
                d2 = c[d2 >> 2] | 0;
                da[c[(c[d2 >> 2] | 0) + 12 >> 2] & 15](d2, e2);
                break;
              } else {
                c[a2 + 16 >> 2] = e2;
                c[d2 >> 2] = 0;
                break;
              }
            else
              c[a2 + 16 >> 2] = 0;
          while (0);
          return;
        }
        function tb(a2) {
          a2 = a2 | 0;
          return a2 | 0;
        }
        function ub(a2, b2, d2, e2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          d2 = d2 | 0;
          e2 = e2 | 0;
          var f2 = 0;
          f2 = a2 + 12 | 0;
          c[f2 >> 2] = 0;
          c[a2 + 16 >> 2] = e2;
          do
            if (b2)
              if (b2 >>> 0 > 178956970) {
                f2 = v(8) | 0;
                vq(f2, 6723);
                c[f2 >> 2] = 5956;
                x(f2 | 0, 3928, 123);
              } else {
                e2 = eq(b2 * 24 | 0) | 0;
                break;
              }
            else
              e2 = 0;
          while (0);
          c[a2 >> 2] = e2;
          d2 = e2 + (d2 * 24 | 0) | 0;
          c[a2 + 8 >> 2] = d2;
          c[a2 + 4 >> 2] = d2;
          c[f2 >> 2] = e2 + (b2 * 24 | 0);
          return;
        }
        function vb(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          var d2 = 0, e2 = 0, f2 = 0, g2 = 0, h2 = 0, i2 = 0, j2 = 0;
          i2 = c[a2 >> 2] | 0;
          j2 = a2 + 4 | 0;
          d2 = c[j2 >> 2] | 0;
          h2 = b2 + 4 | 0;
          if ((d2 | 0) == (i2 | 0)) {
            f2 = h2;
            g2 = a2;
            e2 = c[h2 >> 2] | 0;
            d2 = i2;
          } else {
            e2 = c[h2 >> 2] | 0;
            do {
              d2 = d2 + -24 | 0;
              sb(e2 + -24 | 0, d2);
              e2 = (c[h2 >> 2] | 0) + -24 | 0;
              c[h2 >> 2] = e2;
            } while ((d2 | 0) != (i2 | 0));
            f2 = h2;
            g2 = a2;
            d2 = c[a2 >> 2] | 0;
          }
          c[g2 >> 2] = e2;
          c[f2 >> 2] = d2;
          i2 = b2 + 8 | 0;
          h2 = c[j2 >> 2] | 0;
          c[j2 >> 2] = c[i2 >> 2];
          c[i2 >> 2] = h2;
          i2 = a2 + 8 | 0;
          j2 = b2 + 12 | 0;
          a2 = c[i2 >> 2] | 0;
          c[i2 >> 2] = c[j2 >> 2];
          c[j2 >> 2] = a2;
          c[b2 >> 2] = c[f2 >> 2];
          return;
        }
        function wb(a2) {
          a2 = a2 | 0;
          var b2 = 0, d2 = 0, e2 = 0, f2 = 0;
          d2 = c[a2 + 4 >> 2] | 0;
          e2 = a2 + 8 | 0;
          b2 = c[e2 >> 2] | 0;
          if ((b2 | 0) != (d2 | 0))
            do {
              f2 = b2 + -24 | 0;
              c[e2 >> 2] = f2;
              gb(f2);
              b2 = c[e2 >> 2] | 0;
            } while ((b2 | 0) != (d2 | 0));
          b2 = c[a2 >> 2] | 0;
          if (b2 | 0)
            Da(b2, (c[a2 + 12 >> 2] | 0) - b2 | 0);
          return;
        }
        function xb(a2) {
          a2 = a2 | 0;
          return 178956970;
        }
        function yb(a2) {
          a2 = a2 | 0;
          jp(a2);
          return;
        }
        function zb(a2) {
          a2 = a2 | 0;
          a2 = eq(8) | 0;
          c[a2 >> 2] = 4372;
          return a2 | 0;
        }
        function Ab(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          c[b2 >> 2] = 4372;
          return;
        }
        function Bb(a2) {
          a2 = a2 | 0;
          return;
        }
        function Cb(a2) {
          a2 = a2 | 0;
          Da(a2, 8);
          return;
        }
        function Db(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          Hb(a2 + 4 | 0, b2);
          return;
        }
        function Eb(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          return ((c[b2 + 4 >> 2] | 0) == 7183 ? a2 + 4 | 0 : 0) | 0;
        }
        function Fb(a2) {
          a2 = a2 | 0;
          return 2664;
        }
        function Gb(a2) {
          a2 = a2 | 0;
          return;
        }
        function Hb(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          Ib(a2, b2);
          return;
        }
        function Ib(b2, c2) {
          b2 = b2 | 0;
          c2 = c2 | 0;
          var e2 = 0, f2 = 0;
          b2 = c2 + 104 | 0;
          c2 = d[b2 >> 0] | 0;
          e2 = c2 >>> 7;
          f2 = c2 >>> 6 & 1;
          if ((e2 | 0) == 1 & (f2 | 0) != 0) {
            f2 = v(8) | 0;
            Jb(f2);
            x(f2 | 0, 2632, 8);
          }
          if ((e2 | 0) == (f2 | 0)) {
            f2 = v(8) | 0;
            Kb(f2);
            x(f2 | 0, 2648, 8);
          } else {
            a[b2 >> 0] = c2 & 63;
            return;
          }
        }
        function Jb(a2) {
          a2 = a2 | 0;
          xq(a2, 7076);
          c[a2 >> 2] = 4416;
          return;
        }
        function Kb(a2) {
          a2 = a2 | 0;
          xq(a2, 7144);
          c[a2 >> 2] = 4436;
          return;
        }
        function Lb(a2) {
          a2 = a2 | 0;
          yp(a2);
          jp(a2);
          return;
        }
        function Mb(a2) {
          a2 = a2 | 0;
          yp(a2);
          jp(a2);
          return;
        }
        function Nb(a2) {
          a2 = a2 | 0;
          c[a2 >> 2] = 6092;
          return;
        }
        function Ob(b2) {
          b2 = b2 | 0;
          var c2 = 0;
          c2 = b2 + 12 | 0;
          b2 = (a[c2 >> 0] | 0) == 0;
          a[c2 >> 0] = 0;
          return b2 | 0;
        }
        function Pb(b2) {
          b2 = b2 | 0;
          return (a[b2 + 13 >> 0] | 0) != 0 | 0;
        }
        function Qb(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          a2 = a2 + 247 | 0;
          Vb(a2, b2);
          if ((d[a2 >> 0] | d[a2 + 1 >> 0] << 8) << 16 >> 16 == 2)
            return;
          else {
            b2 = v(8) | 0;
            Wb(b2);
            x(b2 | 0, 2688, 8);
          }
        }
        function Rb(b2, d2, e2, f2) {
          b2 = b2 | 0;
          d2 = d2 | 0;
          e2 = e2 | 0;
          f2 = f2 | 0;
          var g2 = 0, h2 = 0;
          switch (f2 | 0) {
            case 0:
              break;
            case 2: {
              f2 = c[b2 + 4 >> 2] | 0;
              d2 = lr(lr(d2 | 0, e2 | 0, -1, -1) | 0, u() | 0, f2 | 0, ((f2 | 0) < 0) << 31 >> 31 | 0) | 0;
              e2 = u() | 0;
              break;
            }
            case 1: {
              f2 = c[b2 + 8 >> 2] | 0;
              d2 = lr(f2 | 0, ((f2 | 0) < 0) << 31 >> 31 | 0, d2 | 0, e2 | 0) | 0;
              e2 = u() | 0;
              break;
            }
            default: {
              e2 = 0;
              d2 = 0;
            }
          }
          g2 = c[b2 + 4 >> 2] | 0;
          h2 = ((g2 | 0) < 0) << 31 >> 31;
          f2 = b2 + 12 | 0;
          if ((e2 | 0) < 0 | ((e2 | 0) > (h2 | 0) | (e2 | 0) == (h2 | 0) & d2 >>> 0 >= g2 >>> 0))
            a[f2 >> 0] = 1;
          else {
            a[f2 >> 0] = 0;
            c[b2 + 8 >> 2] = d2;
          }
          return;
        }
        function Sb(a2) {
          a2 = a2 | 0;
          xq(a2, 7410);
          c[a2 >> 2] = 4476;
          return;
        }
        function Tb(a2, b2, c2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          c2 = c2 | 0;
          var e2 = 0, f2 = 0, g2 = 0, h2 = 0, i2 = 0, j2 = 0, k2 = 0;
          h2 = V;
          V = V + 16 | 0;
          g2 = h2;
          Xa(a2);
          f2 = b2 + 32 | 0;
          if ((d[f2 >> 0] | d[f2 + 1 >> 0] << 8) << 16 >> 16) {
            e2 = b2 + 34 | 0;
            b2 = 0;
            do {
              j2 = d[e2 >> 0] | d[e2 + 1 >> 0] << 8 | d[e2 + 2 >> 0] << 16 | d[e2 + 3 >> 0] << 24;
              k2 = j2 + (b2 * 6 | 0) | 0;
              i2 = j2 + (b2 * 6 | 0) + 2 | 0;
              j2 = j2 + (b2 * 6 | 0) + 4 | 0;
              _b(
                g2,
                (d[k2 >> 0] | d[k2 + 1 >> 0] << 8) & 65535,
                (d[i2 >> 0] | d[i2 + 1 >> 0] << 8) & 65535,
                (d[j2 >> 0] | d[j2 + 1 >> 0] << 8) & 65535
              );
              Zb(a2, g2);
              c2 = c2 - ((d[i2 >> 0] | d[i2 + 1 >> 0] << 8) & 65535) | 0;
              b2 = b2 + 1 | 0;
            } while (b2 >>> 0 < ((d[f2 >> 0] | d[f2 + 1 >> 0] << 8) & 65535) >>> 0);
          }
          if ((c2 | 0) < 0) {
            k2 = v(8) | 0;
            Wb(k2);
            x(k2 | 0, 2688, 8);
          }
          if (c2 | 0) {
            _b(g2, 0, c2, 2);
            Zb(a2, g2);
          }
          V = h2;
          return;
        }
        function Ub(b2, c2) {
          b2 = b2 | 0;
          c2 = c2 | 0;
          var d2 = 0, e2 = 0;
          d2 = V;
          V = V + 16 | 0;
          e2 = d2 + 1 | 0;
          a[e2 >> 0] = a[d2 >> 0] | 0;
          fc(b2, c2, e2);
          V = d2;
          return b2 | 0;
        }
        function Vb(b2, c2) {
          b2 = b2 | 0;
          c2 = c2 | 0;
          var e2 = 0, f2 = 0, g2 = 0, h2 = 0, i2 = 0, j2 = 0, k2 = 0;
          f2 = c2 + 2 | 0;
          h2 = d[c2 >> 0] | d[c2 + 1 >> 0] << 8;
          a[b2 >> 0] = h2;
          a[b2 + 1 >> 0] = h2 >> 8;
          h2 = b2 + 2 | 0;
          f2 = d[f2 >> 0] | d[f2 + 1 >> 0] << 8;
          a[h2 >> 0] = f2;
          a[h2 + 1 >> 0] = f2 >> 8;
          a[b2 + 4 >> 0] = a[c2 + 4 >> 0] | 0;
          h2 = c2 + 6 | 0;
          a[b2 + 5 >> 0] = a[c2 + 5 >> 0] | 0;
          f2 = c2 + 8 | 0;
          e2 = b2 + 6 | 0;
          h2 = d[h2 >> 0] | d[h2 + 1 >> 0] << 8;
          a[e2 >> 0] = h2;
          a[e2 + 1 >> 0] = h2 >> 8;
          e2 = c2 + 12 | 0;
          h2 = b2 + 8 | 0;
          f2 = d[f2 >> 0] | d[f2 + 1 >> 0] << 8 | d[f2 + 2 >> 0] << 16 | d[f2 + 3 >> 0] << 24;
          a[h2 >> 0] = f2;
          a[h2 + 1 >> 0] = f2 >> 8;
          a[h2 + 2 >> 0] = f2 >> 16;
          a[h2 + 3 >> 0] = f2 >> 24;
          h2 = b2 + 12 | 0;
          e2 = d[e2 >> 0] | d[e2 + 1 >> 0] << 8 | d[e2 + 2 >> 0] << 16 | d[e2 + 3 >> 0] << 24;
          a[h2 >> 0] = e2;
          a[h2 + 1 >> 0] = e2 >> 8;
          a[h2 + 2 >> 0] = e2 >> 16;
          a[h2 + 3 >> 0] = e2 >> 24;
          h2 = c2 + 16 | 0;
          e2 = h2;
          e2 = d[e2 >> 0] | d[e2 + 1 >> 0] << 8 | d[e2 + 2 >> 0] << 16 | d[e2 + 3 >> 0] << 24;
          h2 = h2 + 4 | 0;
          h2 = d[h2 >> 0] | d[h2 + 1 >> 0] << 8 | d[h2 + 2 >> 0] << 16 | d[h2 + 3 >> 0] << 24;
          f2 = b2 + 16 | 0;
          i2 = f2;
          a[i2 >> 0] = e2;
          a[i2 + 1 >> 0] = e2 >> 8;
          a[i2 + 2 >> 0] = e2 >> 16;
          a[i2 + 3 >> 0] = e2 >> 24;
          f2 = f2 + 4 | 0;
          a[f2 >> 0] = h2;
          a[f2 + 1 >> 0] = h2 >> 8;
          a[f2 + 2 >> 0] = h2 >> 16;
          a[f2 + 3 >> 0] = h2 >> 24;
          f2 = c2 + 32 | 0;
          h2 = c2 + 24 | 0;
          i2 = h2;
          i2 = d[i2 >> 0] | d[i2 + 1 >> 0] << 8 | d[i2 + 2 >> 0] << 16 | d[i2 + 3 >> 0] << 24;
          h2 = h2 + 4 | 0;
          h2 = d[h2 >> 0] | d[h2 + 1 >> 0] << 8 | d[h2 + 2 >> 0] << 16 | d[h2 + 3 >> 0] << 24;
          e2 = b2 + 24 | 0;
          g2 = e2;
          a[g2 >> 0] = i2;
          a[g2 + 1 >> 0] = i2 >> 8;
          a[g2 + 2 >> 0] = i2 >> 16;
          a[g2 + 3 >> 0] = i2 >> 24;
          e2 = e2 + 4 | 0;
          a[e2 >> 0] = h2;
          a[e2 + 1 >> 0] = h2 >> 8;
          a[e2 + 2 >> 0] = h2 >> 16;
          a[e2 + 3 >> 0] = h2 >> 24;
          e2 = c2 + 34 | 0;
          h2 = b2 + 32 | 0;
          f2 = d[f2 >> 0] | d[f2 + 1 >> 0] << 8;
          a[h2 >> 0] = f2;
          a[h2 + 1 >> 0] = f2 >> 8;
          g2 = b2 + 34 | 0;
          b2 = d[g2 >> 0] | d[g2 + 1 >> 0] << 8 | d[g2 + 2 >> 0] << 16 | d[g2 + 3 >> 0] << 24;
          if (!b2)
            b2 = f2;
          else {
            gq(b2);
            b2 = d[h2 >> 0] | d[h2 + 1 >> 0] << 8;
          }
          f2 = fq((b2 & 65535) * 6 | 0) | 0;
          a[g2 >> 0] = f2;
          a[g2 + 1 >> 0] = f2 >> 8;
          a[g2 + 2 >> 0] = f2 >> 16;
          a[g2 + 3 >> 0] = f2 >> 24;
          if (b2 << 16 >> 16 ? (b2 = c2 + 36 | 0, i2 = d[e2 >> 0] | d[e2 + 1 >> 0] << 8, a[f2 >> 0] = i2, a[f2 + 1 >> 0] = i2 >> 8, c2 = c2 + 38 | 0, i2 = f2 + 2 | 0, b2 = d[b2 >> 0] | d[b2 + 1 >> 0] << 8, a[i2 >> 0] = b2, a[i2 + 1 >> 0] = b2 >> 8, i2 = f2 + 4 | 0, c2 = d[c2 >> 0] | d[c2 + 1 >> 0] << 8, a[i2 >> 0] = c2, a[i2 + 1 >> 0] = c2 >> 8, ((d[h2 >> 0] | d[h2 + 1 >> 0] << 8) & 65535) > 1) : 0) {
            b2 = 1;
            do {
              c2 = e2;
              e2 = e2 + 6 | 0;
              i2 = d[g2 >> 0] | d[g2 + 1 >> 0] << 8 | d[g2 + 2 >> 0] << 16 | d[g2 + 3 >> 0] << 24;
              j2 = c2 + 8 | 0;
              f2 = i2 + (b2 * 6 | 0) | 0;
              k2 = d[e2 >> 0] | d[e2 + 1 >> 0] << 8;
              a[f2 >> 0] = k2;
              a[f2 + 1 >> 0] = k2 >> 8;
              c2 = c2 + 10 | 0;
              f2 = i2 + (b2 * 6 | 0) + 2 | 0;
              j2 = d[j2 >> 0] | d[j2 + 1 >> 0] << 8;
              a[f2 >> 0] = j2;
              a[f2 + 1 >> 0] = j2 >> 8;
              i2 = i2 + (b2 * 6 | 0) + 4 | 0;
              c2 = d[c2 >> 0] | d[c2 + 1 >> 0] << 8;
              a[i2 >> 0] = c2;
              a[i2 + 1 >> 0] = c2 >> 8;
              b2 = b2 + 1 | 0;
            } while (b2 >>> 0 < ((d[h2 >> 0] | d[h2 + 1 >> 0] << 8) & 65535) >>> 0);
          }
          return;
        }
        function Wb(a2) {
          a2 = a2 | 0;
          xq(a2, 7354);
          c[a2 >> 2] = 4456;
          return;
        }
        function Xb(a2) {
          a2 = a2 | 0;
          yp(a2);
          jp(a2);
          return;
        }
        function Yb(a2) {
          a2 = a2 | 0;
          yp(a2);
          jp(a2);
          return;
        }
        function Zb(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          var d2 = 0, e2 = 0, f2 = 0, g2 = 0, h2 = 0, i2 = 0, j2 = 0, k2 = 0;
          i2 = V;
          V = V + 32 | 0;
          f2 = i2;
          g2 = a2 + 4 | 0;
          d2 = c[g2 >> 2] | 0;
          h2 = a2 + 8 | 0;
          do
            if ((d2 | 0) == (c[h2 >> 2] | 0)) {
              d2 = ((d2 - (c[a2 >> 2] | 0) | 0) / 12 | 0) + 1 | 0;
              e2 = ec(a2) | 0;
              if (e2 >>> 0 < d2 >>> 0)
                cr(a2);
              else {
                j2 = c[a2 >> 2] | 0;
                k2 = ((c[h2 >> 2] | 0) - j2 | 0) / 12 | 0;
                h2 = k2 << 1;
                bc(
                  f2,
                  k2 >>> 0 < e2 >>> 1 >>> 0 ? h2 >>> 0 < d2 >>> 0 ? d2 : h2 : e2,
                  ((c[g2 >> 2] | 0) - j2 | 0) / 12 | 0,
                  a2 + 8 | 0
                );
                h2 = f2 + 8 | 0;
                g2 = c[h2 >> 2] | 0;
                c[g2 >> 2] = c[b2 >> 2];
                c[g2 + 4 >> 2] = c[b2 + 4 >> 2];
                c[g2 + 8 >> 2] = c[b2 + 8 >> 2];
                c[h2 >> 2] = (c[h2 >> 2] | 0) + 12;
                cc(a2, f2);
                dc(f2);
                break;
              }
            } else {
              $b(f2, a2, 1);
              k2 = f2 + 4 | 0;
              j2 = c[k2 >> 2] | 0;
              c[j2 >> 2] = c[b2 >> 2];
              c[j2 + 4 >> 2] = c[b2 + 4 >> 2];
              c[j2 + 8 >> 2] = c[b2 + 8 >> 2];
              c[k2 >> 2] = (c[k2 >> 2] | 0) + 12;
              ac(f2);
            }
          while (0);
          V = i2;
          return;
        }
        function _b(a2, b2, d2, e2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          d2 = d2 | 0;
          e2 = e2 | 0;
          c[a2 >> 2] = b2;
          c[a2 + 4 >> 2] = d2;
          c[a2 + 8 >> 2] = e2;
          return;
        }
        function $b(a2, b2, d2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          d2 = d2 | 0;
          c[a2 >> 2] = b2;
          b2 = c[b2 + 4 >> 2] | 0;
          c[a2 + 4 >> 2] = b2;
          c[a2 + 8 >> 2] = b2 + (d2 * 12 | 0);
          return;
        }
        function ac(a2) {
          a2 = a2 | 0;
          c[(c[a2 >> 2] | 0) + 4 >> 2] = c[a2 + 4 >> 2];
          return;
        }
        function bc(a2, b2, d2, e2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          d2 = d2 | 0;
          e2 = e2 | 0;
          var f2 = 0;
          f2 = a2 + 12 | 0;
          c[f2 >> 2] = 0;
          c[a2 + 16 >> 2] = e2;
          do
            if (b2)
              if (b2 >>> 0 > 357913941) {
                f2 = v(8) | 0;
                vq(f2, 6723);
                c[f2 >> 2] = 5956;
                x(f2 | 0, 3928, 123);
              } else {
                e2 = eq(b2 * 12 | 0) | 0;
                break;
              }
            else
              e2 = 0;
          while (0);
          c[a2 >> 2] = e2;
          d2 = e2 + (d2 * 12 | 0) | 0;
          c[a2 + 8 >> 2] = d2;
          c[a2 + 4 >> 2] = d2;
          c[f2 >> 2] = e2 + (b2 * 12 | 0);
          return;
        }
        function cc(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          var d2 = 0, e2 = 0, f2 = 0, g2 = 0, h2 = 0;
          e2 = c[a2 >> 2] | 0;
          h2 = a2 + 4 | 0;
          g2 = b2 + 4 | 0;
          f2 = (c[h2 >> 2] | 0) - e2 | 0;
          d2 = (c[g2 >> 2] | 0) + (((f2 | 0) / -12 | 0) * 12 | 0) | 0;
          c[g2 >> 2] = d2;
          if ((f2 | 0) > 0) {
            ur(d2 | 0, e2 | 0, f2 | 0) | 0;
            e2 = g2;
            d2 = c[g2 >> 2] | 0;
          } else
            e2 = g2;
          g2 = c[a2 >> 2] | 0;
          c[a2 >> 2] = d2;
          c[e2 >> 2] = g2;
          g2 = b2 + 8 | 0;
          f2 = c[h2 >> 2] | 0;
          c[h2 >> 2] = c[g2 >> 2];
          c[g2 >> 2] = f2;
          g2 = a2 + 8 | 0;
          h2 = b2 + 12 | 0;
          a2 = c[g2 >> 2] | 0;
          c[g2 >> 2] = c[h2 >> 2];
          c[h2 >> 2] = a2;
          c[b2 >> 2] = c[e2 >> 2];
          return;
        }
        function dc(a2) {
          a2 = a2 | 0;
          var b2 = 0, d2 = 0, e2 = 0;
          b2 = c[a2 + 4 >> 2] | 0;
          d2 = a2 + 8 | 0;
          e2 = c[d2 >> 2] | 0;
          if ((e2 | 0) != (b2 | 0))
            c[d2 >> 2] = e2 + (~(((e2 + -12 - b2 | 0) >>> 0) / 12 | 0) * 12 | 0);
          b2 = c[a2 >> 2] | 0;
          if (b2 | 0)
            Da(b2, (c[a2 + 12 >> 2] | 0) - b2 | 0);
          return;
        }
        function ec(a2) {
          a2 = a2 | 0;
          return 357913941;
        }
        function fc(a2, b2, d2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          d2 = d2 | 0;
          var e2 = 0;
          gc(a2);
          c[a2 >> 2] = c[b2 >> 2];
          d2 = b2 + 4 | 0;
          c[a2 + 4 >> 2] = c[d2 >> 2];
          e2 = b2 + 8 | 0;
          c[a2 + 8 >> 2] = c[e2 >> 2];
          c[e2 >> 2] = 0;
          c[d2 >> 2] = 0;
          c[b2 >> 2] = 0;
          return;
        }
        function gc(a2) {
          a2 = a2 | 0;
          var b2 = 0, d2 = 0, e2 = 0, f2 = 0;
          b2 = c[a2 >> 2] | 0;
          d2 = b2;
          if (b2 | 0) {
            e2 = a2 + 4 | 0;
            c[e2 >> 2] = d2;
            f2 = a2 + 8 | 0;
            Da(b2, (c[f2 >> 2] | 0) - d2 | 0);
            c[f2 >> 2] = 0;
            c[e2 >> 2] = 0;
            c[a2 >> 2] = 0;
          }
          return;
        }
        function hc(a2) {
          a2 = a2 | 0;
          xq(a2, 7660);
          c[a2 >> 2] = 4496;
          return;
        }
        function ic(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          xq(a2, b2);
          c[a2 >> 2] = 4516;
          return;
        }
        function jc(a2) {
          a2 = a2 | 0;
          xq(a2, 7704);
          c[a2 >> 2] = 4536;
          return;
        }
        function kc(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          var d2 = 0, e2 = 0, f2 = 0;
          d2 = a2 + 4 | 0;
          f2 = c[a2 >> 2] | 0;
          e2 = (c[d2 >> 2] | 0) - f2 >> 3;
          if (e2 >>> 0 >= b2 >>> 0) {
            if (e2 >>> 0 > b2 >>> 0)
              c[d2 >> 2] = f2 + (b2 << 3);
          } else
            vc(a2, b2 - e2 | 0);
          return;
        }
        function lc(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          c[a2 >> 2] = b2;
          c[a2 + 4 >> 2] = 0;
          c[a2 + 8 >> 2] = -1;
          return;
        }
        function mc(a2, b2, d2, e2, f2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          d2 = d2 | 0;
          e2 = e2 | 0;
          f2 = f2 | 0;
          var g2 = 0;
          c[a2 + 4 >> 2] = b2;
          c[a2 + 8 >> 2] = d2;
          c[a2 + 12 >> 2] = e2;
          c[a2 + 16 >> 2] = f2;
          c[a2 + 36 >> 2] = 0;
          c[a2 + 40 >> 2] = 0;
          c[a2 + 44 >> 2] = 0;
          Gc(a2 + 48 | 0);
          c[a2 + 68 >> 2] = 0;
          c[a2 + 72 >> 2] = 0;
          c[a2 + 76 >> 2] = 0;
          do
            if (!f2) {
              d2 = a2 + 20 | 0;
              if ((b2 + -1 | 0) >>> 0 < 31) {
                c[d2 >> 2] = b2;
                f2 = 1 << b2;
                c[a2 + 24 >> 2] = f2;
                d2 = f2 >>> 1;
                c[a2 + 28 >> 2] = 0 - d2;
                d2 = f2 + -1 - d2 | 0;
                break;
              } else {
                c[d2 >> 2] = 32;
                c[a2 + 24 >> 2] = 0;
                c[a2 + 28 >> 2] = -2147483648;
                d2 = 2147483647;
                break;
              }
            } else {
              e2 = a2 + 20 | 0;
              c[e2 >> 2] = 0;
              c[a2 + 24 >> 2] = f2;
              d2 = f2;
              g2 = 0;
              while (1) {
                d2 = d2 >>> 1;
                b2 = g2 + 1 | 0;
                if (!d2)
                  break;
                else
                  g2 = b2;
              }
              c[e2 >> 2] = (1 << g2 | 0) == (f2 | 0) ? g2 : b2;
              d2 = f2 >>> 1;
              c[a2 + 28 >> 2] = 0 - d2;
              d2 = f2 + -1 - d2 | 0;
            }
          while (0);
          c[a2 + 32 >> 2] = d2;
          c[a2 >> 2] = 0;
          return;
        }
        function nc(a2) {
          a2 = a2 | 0;
          var b2 = 0;
          b2 = ((Jc(c[a2 >> 2] | 0) | 0) & 255) << 24;
          b2 = ((Jc(c[a2 >> 2] | 0) | 0) & 255) << 16 | b2;
          b2 = b2 | ((Jc(c[a2 >> 2] | 0) | 0) & 255) << 8;
          c[a2 + 4 >> 2] = b2 | (Jc(c[a2 >> 2] | 0) | 0) & 255;
          return;
        }
        function oc(a2) {
          a2 = a2 | 0;
          var b2 = 0, d2 = 0, e2 = 0, f2 = 0, g2 = 0, h2 = 0, i2 = 0, j2 = 0, k2 = 0, l2 = 0, m2 = 0, n2 = 0, o2 = 0, p2 = 0, q2 = 0, r2 = 0, s2 = 0, t2 = 0;
          q2 = V;
          V = V + 64 | 0;
          o2 = q2 + 44 | 0;
          p2 = q2;
          k2 = a2 + 36 | 0;
          l2 = a2 + 40 | 0;
          a:
            do
              if ((c[k2 >> 2] | 0) == (c[l2 >> 2] | 0)) {
                m2 = a2 + 8 | 0;
                b:
                  do
                    if (!(c[m2 >> 2] | 0))
                      n2 = a2 + 20 | 0;
                    else {
                      f2 = a2 + 20 | 0;
                      g2 = a2 + 44 | 0;
                      h2 = o2 + 4 | 0;
                      i2 = a2 + 44 | 0;
                      j2 = o2 + 8 | 0;
                      e2 = 0;
                      while (1) {
                        Oc(p2, (c[f2 >> 2] | 0) + 1 | 0, 0, 0);
                        b2 = c[l2 >> 2] | 0;
                        if (b2 >>> 0 < (c[g2 >> 2] | 0) >>> 0) {
                          Pc(o2, k2, 1);
                          Rc(c[h2 >> 2] | 0, p2);
                          c[h2 >> 2] = (c[h2 >> 2] | 0) + 44;
                          Qc(o2);
                        } else {
                          b2 = ((b2 - (c[k2 >> 2] | 0) | 0) / 44 | 0) + 1 | 0;
                          d2 = Vc(k2) | 0;
                          if (d2 >>> 0 < b2 >>> 0)
                            break;
                          r2 = c[k2 >> 2] | 0;
                          t2 = ((c[g2 >> 2] | 0) - r2 | 0) / 44 | 0;
                          s2 = t2 << 1;
                          Sc(
                            o2,
                            t2 >>> 0 < d2 >>> 1 >>> 0 ? s2 >>> 0 < b2 >>> 0 ? b2 : s2 : d2,
                            ((c[l2 >> 2] | 0) - r2 | 0) / 44 | 0,
                            i2
                          );
                          Rc(c[j2 >> 2] | 0, p2);
                          c[j2 >> 2] = (c[j2 >> 2] | 0) + 44;
                          Tc(k2, o2);
                          Uc(o2);
                        }
                        Ic(p2);
                        e2 = e2 + 1 | 0;
                        if (e2 >>> 0 >= (c[m2 >> 2] | 0) >>> 0) {
                          n2 = f2;
                          break b;
                        }
                      }
                      cr(k2);
                    }
                  while (0);
                if (c[n2 >> 2] | 0) {
                  h2 = a2 + 12 | 0;
                  i2 = a2 + 68 | 0;
                  j2 = a2 + 72 | 0;
                  k2 = a2 + 76 | 0;
                  l2 = o2 + 4 | 0;
                  f2 = a2 + 76 | 0;
                  g2 = o2 + 8 | 0;
                  e2 = 1;
                  while (1) {
                    b2 = c[h2 >> 2] | 0;
                    Oc(p2, 1 << (e2 >>> 0 > b2 >>> 0 ? b2 : e2), 0, 0);
                    b2 = c[j2 >> 2] | 0;
                    if (b2 >>> 0 < (c[k2 >> 2] | 0) >>> 0) {
                      Pc(o2, i2, 1);
                      Rc(c[l2 >> 2] | 0, p2);
                      c[l2 >> 2] = (c[l2 >> 2] | 0) + 44;
                      Qc(o2);
                    } else {
                      b2 = ((b2 - (c[i2 >> 2] | 0) | 0) / 44 | 0) + 1 | 0;
                      d2 = Vc(i2) | 0;
                      if (d2 >>> 0 < b2 >>> 0)
                        break;
                      t2 = c[i2 >> 2] | 0;
                      r2 = ((c[k2 >> 2] | 0) - t2 | 0) / 44 | 0;
                      s2 = r2 << 1;
                      Sc(
                        o2,
                        r2 >>> 0 < d2 >>> 1 >>> 0 ? s2 >>> 0 < b2 >>> 0 ? b2 : s2 : d2,
                        ((c[j2 >> 2] | 0) - t2 | 0) / 44 | 0,
                        f2
                      );
                      Rc(c[g2 >> 2] | 0, p2);
                      c[g2 >> 2] = (c[g2 >> 2] | 0) + 44;
                      Tc(i2, o2);
                      Uc(o2);
                    }
                    Ic(p2);
                    e2 = e2 + 1 | 0;
                    if (e2 >>> 0 > (c[n2 >> 2] | 0) >>> 0)
                      break a;
                  }
                  cr(i2);
                }
              }
            while (0);
          V = q2;
          return;
        }
        function pc(a2, b2, d2, e2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          d2 = d2 | 0;
          e2 = e2 | 0;
          d2 = (Yc(a2, b2, (c[a2 + 36 >> 2] | 0) + (e2 * 44 | 0) | 0) | 0) + d2 | 0;
          b2 = c[a2 + 24 >> 2] | 0;
          if ((d2 | 0) < 0)
            return d2 + b2 | 0;
          else
            return d2 - (d2 >>> 0 < b2 >>> 0 ? 0 : b2) | 0;
          return 0;
        }
        function qc(a2) {
          a2 = a2 | 0;
          Hc(a2 + 68 | 0);
          Hc(a2 + 36 | 0);
          return;
        }
        function rc(a2) {
          a2 = a2 | 0;
          return;
        }
        function sc(a2) {
          a2 = a2 | 0;
          yp(a2);
          jp(a2);
          return;
        }
        function tc(a2) {
          a2 = a2 | 0;
          yp(a2);
          jp(a2);
          return;
        }
        function uc(a2) {
          a2 = a2 | 0;
          yp(a2);
          jp(a2);
          return;
        }
        function vc(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          var d2 = 0, e2 = 0, f2 = 0, g2 = 0, h2 = 0, i2 = 0, j2 = 0, k2 = 0;
          i2 = V;
          V = V + 32 | 0;
          f2 = i2;
          g2 = a2 + 8 | 0;
          h2 = a2 + 4 | 0;
          d2 = c[h2 >> 2] | 0;
          do
            if ((c[g2 >> 2] | 0) - d2 >> 3 >>> 0 < b2 >>> 0) {
              d2 = (d2 - (c[a2 >> 2] | 0) >> 3) + b2 | 0;
              e2 = Dc(a2) | 0;
              if (e2 >>> 0 < d2 >>> 0)
                cr(a2);
              else {
                j2 = c[a2 >> 2] | 0;
                k2 = (c[g2 >> 2] | 0) - j2 | 0;
                g2 = k2 >> 2;
                xc(
                  f2,
                  k2 >> 3 >>> 0 < e2 >>> 1 >>> 0 ? g2 >>> 0 < d2 >>> 0 ? d2 : g2 : e2,
                  (c[h2 >> 2] | 0) - j2 >> 3,
                  a2 + 8 | 0
                );
                yc(f2, b2);
                zc(a2, f2);
                Ac(f2);
                break;
              }
            } else
              wc(a2, b2);
          while (0);
          V = i2;
          return;
        }
        function wc(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          var d2 = 0, e2 = 0, f2 = 0;
          f2 = V;
          V = V + 16 | 0;
          e2 = f2;
          Bc(e2, a2, b2);
          a2 = e2 + 4 | 0;
          b2 = c[a2 >> 2] | 0;
          d2 = c[e2 + 8 >> 2] | 0;
          if ((b2 | 0) != (d2 | 0)) {
            d2 = d2 + -8 - b2 | 0;
            wr(b2 | 0, 0, d2 + 8 & -8 | 0) | 0;
            c[a2 >> 2] = b2 + ((d2 >>> 3) + 1 << 3);
          }
          Cc(e2);
          V = f2;
          return;
        }
        function xc(a2, b2, d2, e2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          d2 = d2 | 0;
          e2 = e2 | 0;
          var f2 = 0;
          f2 = a2 + 12 | 0;
          c[f2 >> 2] = 0;
          c[a2 + 16 >> 2] = e2;
          do
            if (b2)
              if (b2 >>> 0 > 536870911) {
                f2 = v(8) | 0;
                vq(f2, 6723);
                c[f2 >> 2] = 5956;
                x(f2 | 0, 3928, 123);
              } else {
                e2 = eq(b2 << 3) | 0;
                break;
              }
            else
              e2 = 0;
          while (0);
          c[a2 >> 2] = e2;
          d2 = e2 + (d2 << 3) | 0;
          c[a2 + 8 >> 2] = d2;
          c[a2 + 4 >> 2] = d2;
          c[f2 >> 2] = e2 + (b2 << 3);
          return;
        }
        function yc(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          var d2 = 0, e2 = 0;
          e2 = V;
          V = V + 16 | 0;
          d2 = e2;
          Ec(d2, a2 + 8 | 0, b2);
          a2 = c[d2 >> 2] | 0;
          b2 = c[d2 + 4 >> 2] | 0;
          if ((a2 | 0) != (b2 | 0)) {
            b2 = b2 + -8 - a2 | 0;
            wr(a2 | 0, 0, b2 + 8 & -8 | 0) | 0;
            c[d2 >> 2] = a2 + ((b2 >>> 3) + 1 << 3);
          }
          Fc(d2);
          V = e2;
          return;
        }
        function zc(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          var d2 = 0, e2 = 0, f2 = 0, g2 = 0, h2 = 0;
          e2 = c[a2 >> 2] | 0;
          h2 = a2 + 4 | 0;
          g2 = b2 + 4 | 0;
          f2 = (c[h2 >> 2] | 0) - e2 | 0;
          d2 = (c[g2 >> 2] | 0) + (0 - (f2 >> 3) << 3) | 0;
          c[g2 >> 2] = d2;
          if ((f2 | 0) > 0) {
            ur(d2 | 0, e2 | 0, f2 | 0) | 0;
            e2 = g2;
            d2 = c[g2 >> 2] | 0;
          } else
            e2 = g2;
          g2 = c[a2 >> 2] | 0;
          c[a2 >> 2] = d2;
          c[e2 >> 2] = g2;
          g2 = b2 + 8 | 0;
          f2 = c[h2 >> 2] | 0;
          c[h2 >> 2] = c[g2 >> 2];
          c[g2 >> 2] = f2;
          g2 = a2 + 8 | 0;
          h2 = b2 + 12 | 0;
          a2 = c[g2 >> 2] | 0;
          c[g2 >> 2] = c[h2 >> 2];
          c[h2 >> 2] = a2;
          c[b2 >> 2] = c[e2 >> 2];
          return;
        }
        function Ac(a2) {
          a2 = a2 | 0;
          var b2 = 0, d2 = 0, e2 = 0;
          b2 = c[a2 + 4 >> 2] | 0;
          d2 = a2 + 8 | 0;
          e2 = c[d2 >> 2] | 0;
          if ((e2 | 0) != (b2 | 0))
            c[d2 >> 2] = e2 + (~((e2 + -8 - b2 | 0) >>> 3) << 3);
          b2 = c[a2 >> 2] | 0;
          if (b2 | 0)
            Da(b2, (c[a2 + 12 >> 2] | 0) - b2 | 0);
          return;
        }
        function Bc(a2, b2, d2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          d2 = d2 | 0;
          c[a2 >> 2] = b2;
          b2 = c[b2 + 4 >> 2] | 0;
          c[a2 + 4 >> 2] = b2;
          c[a2 + 8 >> 2] = b2 + (d2 << 3);
          return;
        }
        function Cc(a2) {
          a2 = a2 | 0;
          c[(c[a2 >> 2] | 0) + 4 >> 2] = c[a2 + 4 >> 2];
          return;
        }
        function Dc(a2) {
          a2 = a2 | 0;
          return 536870911;
        }
        function Ec(a2, b2, d2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          d2 = d2 | 0;
          c[a2 >> 2] = c[b2 >> 2];
          c[a2 + 4 >> 2] = (c[b2 >> 2] | 0) + (d2 << 3);
          c[a2 + 8 >> 2] = b2;
          return;
        }
        function Fc(a2) {
          a2 = a2 | 0;
          c[c[a2 + 8 >> 2] >> 2] = c[a2 >> 2];
          return;
        }
        function Gc(a2) {
          a2 = a2 | 0;
          c[a2 + 12 >> 2] = 1;
          c[a2 + 16 >> 2] = 2;
          c[a2 + 8 >> 2] = 4096;
          c[a2 + 4 >> 2] = 4;
          c[a2 >> 2] = 4;
          return;
        }
        function Hc(a2) {
          a2 = a2 | 0;
          var b2 = 0, d2 = 0, e2 = 0;
          d2 = c[a2 >> 2] | 0;
          if (d2 | 0) {
            e2 = a2 + 4 | 0;
            b2 = c[e2 >> 2] | 0;
            if ((b2 | 0) == (d2 | 0))
              b2 = d2;
            else {
              do {
                b2 = b2 + -44 | 0;
                Ic(b2);
              } while ((b2 | 0) != (d2 | 0));
              b2 = c[a2 >> 2] | 0;
            }
            c[e2 >> 2] = d2;
            Da(b2, (c[a2 + 8 >> 2] | 0) - b2 | 0);
          }
          return;
        }
        function Ic(a2) {
          a2 = a2 | 0;
          var b2 = 0;
          b2 = c[a2 + 8 >> 2] | 0;
          if (b2 | 0)
            Ua(b2);
          b2 = c[a2 + 12 >> 2] | 0;
          if (b2 | 0)
            Ua(b2);
          b2 = c[a2 + 16 >> 2] | 0;
          if (b2 | 0)
            Ua(b2);
          return;
        }
        function Jc(b2) {
          b2 = b2 | 0;
          var d2 = 0, e2 = 0;
          e2 = b2 + 4 | 0;
          d2 = c[e2 >> 2] | 0;
          if ((d2 | 0) >= (c[b2 + 8 >> 2] | 0)) {
            Kc(b2);
            d2 = c[e2 >> 2] | 0;
          }
          b2 = c[b2 + 12 >> 2] | 0;
          c[e2 >> 2] = d2 + 1;
          return a[b2 + d2 >> 0] | 0;
        }
        function Kc(a2) {
          a2 = a2 | 0;
          var b2 = 0;
          c[a2 + 4 >> 2] = 0;
          $a(c[a2 >> 2] | 0, c[a2 + 12 >> 2] | 0, 1048576);
          b2 = Lc(c[a2 >> 2] | 0) | 0;
          c[a2 + 8 >> 2] = b2;
          if (!b2) {
            b2 = v(8) | 0;
            Mc(b2);
            x(b2 | 0, 2752, 8);
          } else
            return;
        }
        function Lc(a2) {
          a2 = a2 | 0;
          return c[a2 + 16 >> 2] | 0;
        }
        function Mc(a2) {
          a2 = a2 | 0;
          xq(a2, 7769);
          c[a2 >> 2] = 4556;
          return;
        }
        function Nc(a2) {
          a2 = a2 | 0;
          yp(a2);
          jp(a2);
          return;
        }
        function Oc(b2, d2, e2, f2) {
          b2 = b2 | 0;
          d2 = d2 | 0;
          e2 = e2 | 0;
          f2 = f2 | 0;
          var g2 = 0, h2 = 0, i2 = 0;
          c[b2 >> 2] = d2;
          a[b2 + 4 >> 0] = e2 & 1;
          h2 = b2 + 8 | 0;
          c[h2 >> 2] = 0;
          i2 = b2 + 12 | 0;
          c[i2 >> 2] = 0;
          g2 = b2 + 16 | 0;
          c[g2 >> 2] = 0;
          if ((d2 + -2 | 0) >>> 0 > 2046) {
            b2 = v(8) | 0;
            xq(b2, 7789);
            x(b2 | 0, 3912, 8);
          }
          c[b2 + 32 >> 2] = d2 + -1;
          if (d2 >>> 0 > 16 & (e2 ^ 1)) {
            e2 = 3;
            while (1)
              if (1 << e2 + 2 >>> 0 < d2 >>> 0)
                e2 = e2 + 1 | 0;
              else
                break;
            d2 = 1 << e2;
            c[b2 + 36 >> 2] = d2;
            c[b2 + 40 >> 2] = 15 - e2;
            c[g2 >> 2] = _a((d2 << 2) + 8 | 0) | 0;
            d2 = c[b2 >> 2] | 0;
          } else {
            c[g2 >> 2] = 0;
            c[b2 + 40 >> 2] = 0;
            c[b2 + 36 >> 2] = 0;
          }
          c[h2 >> 2] = _a(d2 << 2) | 0;
          g2 = _a(c[b2 >> 2] << 2) | 0;
          c[i2 >> 2] = g2;
          c[b2 + 20 >> 2] = 0;
          d2 = c[b2 >> 2] | 0;
          e2 = b2 + 24 | 0;
          c[e2 >> 2] = d2;
          d2 = (d2 | 0) != 0;
          if (!f2) {
            if (d2) {
              d2 = 0;
              do {
                c[g2 + (d2 << 2) >> 2] = 1;
                d2 = d2 + 1 | 0;
              } while (d2 >>> 0 < (c[b2 >> 2] | 0) >>> 0);
            }
          } else if (d2) {
            d2 = 0;
            do {
              c[g2 + (d2 << 2) >> 2] = c[f2 + (d2 << 2) >> 2];
              d2 = d2 + 1 | 0;
            } while (d2 >>> 0 < (c[b2 >> 2] | 0) >>> 0);
          }
          Xc(b2);
          f2 = ((c[b2 >> 2] | 0) + 6 | 0) >>> 1;
          c[e2 >> 2] = f2;
          c[b2 + 28 >> 2] = f2;
          return;
        }
        function Pc(a2, b2, d2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          d2 = d2 | 0;
          c[a2 >> 2] = b2;
          b2 = c[b2 + 4 >> 2] | 0;
          c[a2 + 4 >> 2] = b2;
          c[a2 + 8 >> 2] = b2 + (d2 * 44 | 0);
          return;
        }
        function Qc(a2) {
          a2 = a2 | 0;
          c[(c[a2 >> 2] | 0) + 4 >> 2] = c[a2 + 4 >> 2];
          return;
        }
        function Rc(b2, d2) {
          b2 = b2 | 0;
          d2 = d2 | 0;
          var e2 = 0;
          c[b2 >> 2] = c[d2 >> 2];
          a[b2 + 4 >> 0] = a[d2 + 4 >> 0] | 0;
          e2 = d2 + 8 | 0;
          c[b2 + 8 >> 2] = c[e2 >> 2];
          c[b2 + 12 >> 2] = c[d2 + 12 >> 2];
          c[b2 + 16 >> 2] = c[d2 + 16 >> 2];
          c[b2 + 20 >> 2] = c[d2 + 20 >> 2];
          c[b2 + 24 >> 2] = c[d2 + 24 >> 2];
          c[b2 + 28 >> 2] = c[d2 + 28 >> 2];
          c[b2 + 32 >> 2] = c[d2 + 32 >> 2];
          c[b2 + 36 >> 2] = c[d2 + 36 >> 2];
          c[b2 + 40 >> 2] = c[d2 + 40 >> 2];
          c[e2 >> 2] = 0;
          c[e2 + 4 >> 2] = 0;
          c[e2 + 8 >> 2] = 0;
          return;
        }
        function Sc(a2, b2, d2, e2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          d2 = d2 | 0;
          e2 = e2 | 0;
          var f2 = 0;
          f2 = a2 + 12 | 0;
          c[f2 >> 2] = 0;
          c[a2 + 16 >> 2] = e2;
          do
            if (b2)
              if (b2 >>> 0 > 97612893) {
                f2 = v(8) | 0;
                vq(f2, 6723);
                c[f2 >> 2] = 5956;
                x(f2 | 0, 3928, 123);
              } else {
                e2 = eq(b2 * 44 | 0) | 0;
                break;
              }
            else
              e2 = 0;
          while (0);
          c[a2 >> 2] = e2;
          d2 = e2 + (d2 * 44 | 0) | 0;
          c[a2 + 8 >> 2] = d2;
          c[a2 + 4 >> 2] = d2;
          c[f2 >> 2] = e2 + (b2 * 44 | 0);
          return;
        }
        function Tc(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          var d2 = 0, e2 = 0, f2 = 0, g2 = 0, h2 = 0, i2 = 0, j2 = 0;
          i2 = c[a2 >> 2] | 0;
          j2 = a2 + 4 | 0;
          d2 = c[j2 >> 2] | 0;
          h2 = b2 + 4 | 0;
          if ((d2 | 0) == (i2 | 0)) {
            f2 = h2;
            g2 = a2;
            e2 = c[h2 >> 2] | 0;
            d2 = i2;
          } else {
            e2 = c[h2 >> 2] | 0;
            do {
              d2 = d2 + -44 | 0;
              Wc(e2 + -44 | 0, d2);
              e2 = (c[h2 >> 2] | 0) + -44 | 0;
              c[h2 >> 2] = e2;
            } while ((d2 | 0) != (i2 | 0));
            f2 = h2;
            g2 = a2;
            d2 = c[a2 >> 2] | 0;
          }
          c[g2 >> 2] = e2;
          c[f2 >> 2] = d2;
          i2 = b2 + 8 | 0;
          h2 = c[j2 >> 2] | 0;
          c[j2 >> 2] = c[i2 >> 2];
          c[i2 >> 2] = h2;
          i2 = a2 + 8 | 0;
          j2 = b2 + 12 | 0;
          a2 = c[i2 >> 2] | 0;
          c[i2 >> 2] = c[j2 >> 2];
          c[j2 >> 2] = a2;
          c[b2 >> 2] = c[f2 >> 2];
          return;
        }
        function Uc(a2) {
          a2 = a2 | 0;
          var b2 = 0, d2 = 0, e2 = 0, f2 = 0;
          d2 = c[a2 + 4 >> 2] | 0;
          e2 = a2 + 8 | 0;
          b2 = c[e2 >> 2] | 0;
          if ((b2 | 0) != (d2 | 0))
            do {
              f2 = b2 + -44 | 0;
              c[e2 >> 2] = f2;
              Ic(f2);
              b2 = c[e2 >> 2] | 0;
            } while ((b2 | 0) != (d2 | 0));
          b2 = c[a2 >> 2] | 0;
          if (b2 | 0)
            Da(b2, (c[a2 + 12 >> 2] | 0) - b2 | 0);
          return;
        }
        function Vc(a2) {
          a2 = a2 | 0;
          return 97612893;
        }
        function Wc(b2, d2) {
          b2 = b2 | 0;
          d2 = d2 | 0;
          var e2 = 0, f2 = 0, g2 = 0, h2 = 0;
          e2 = c[d2 >> 2] | 0;
          c[b2 >> 2] = e2;
          a[b2 + 4 >> 0] = a[d2 + 4 >> 0] | 0;
          c[b2 + 20 >> 2] = c[d2 + 20 >> 2];
          c[b2 + 24 >> 2] = c[d2 + 24 >> 2];
          c[b2 + 28 >> 2] = c[d2 + 28 >> 2];
          c[b2 + 32 >> 2] = c[d2 + 32 >> 2];
          h2 = b2 + 36 | 0;
          c[h2 >> 2] = c[d2 + 36 >> 2];
          c[b2 + 40 >> 2] = c[d2 + 40 >> 2];
          e2 = e2 << 2;
          f2 = _a(e2) | 0;
          c[b2 + 8 >> 2] = f2;
          g2 = c[b2 >> 2] | 0;
          if (g2 | 0)
            vr(f2 | 0, c[d2 + 8 >> 2] | 0, g2 << 2 | 0) | 0;
          e2 = _a(e2) | 0;
          c[b2 + 12 >> 2] = e2;
          f2 = c[b2 >> 2] | 0;
          if (f2 | 0)
            vr(e2 | 0, c[d2 + 12 >> 2] | 0, f2 << 2 | 0) | 0;
          e2 = c[h2 >> 2] | 0;
          if (e2) {
            f2 = _a((e2 << 2) + 8 | 0) | 0;
            c[b2 + 16 >> 2] = f2;
            e2 = (c[h2 >> 2] << 2) + 8 | 0;
            if (e2 | 0)
              vr(f2 | 0, c[d2 + 16 >> 2] | 0, e2 | 0) | 0;
          } else
            c[b2 + 16 >> 2] = 0;
          return;
        }
        function Xc(b2) {
          b2 = b2 | 0;
          var d2 = 0, e2 = 0, f2 = 0, g2 = 0, h2 = 0, i2 = 0, j2 = 0, k2 = 0, l2 = 0, m2 = 0, n2 = 0, o2 = 0, p2 = 0, r2 = 0;
          r2 = b2 + 24 | 0;
          g2 = b2 + 20 | 0;
          d2 = (c[g2 >> 2] | 0) + (c[r2 >> 2] | 0) | 0;
          c[g2 >> 2] = d2;
          if (d2 >>> 0 > 32768) {
            c[g2 >> 2] = 0;
            if (!(c[b2 >> 2] | 0))
              d2 = 0;
            else {
              f2 = c[b2 + 12 >> 2] | 0;
              e2 = 0;
              do {
                n2 = f2 + (e2 << 2) | 0;
                d2 = ((c[n2 >> 2] | 0) + 1 | 0) >>> 1;
                c[n2 >> 2] = d2;
                d2 = (c[g2 >> 2] | 0) + d2 | 0;
                c[g2 >> 2] = d2;
                e2 = e2 + 1 | 0;
              } while (e2 >>> 0 < (c[b2 >> 2] | 0) >>> 0);
            }
          }
          n2 = 2147483648 / (d2 >>> 0) | 0;
          do
            if ((a[b2 + 4 >> 0] | 0) == 0 ? (o2 = b2 + 36 | 0, (c[o2 >> 2] | 0) != 0) : 0) {
              if (c[b2 >> 2] | 0) {
                j2 = c[b2 + 8 >> 2] | 0;
                k2 = c[b2 + 12 >> 2] | 0;
                l2 = b2 + 40 | 0;
                m2 = b2 + 16 | 0;
                d2 = 0;
                h2 = 0;
                i2 = 0;
                do {
                  e2 = (q(h2, n2) | 0) >>> 16;
                  c[j2 + (i2 << 2) >> 2] = e2;
                  h2 = (c[k2 + (i2 << 2) >> 2] | 0) + h2 | 0;
                  e2 = e2 >>> (c[l2 >> 2] | 0);
                  if (d2 >>> 0 < e2 >>> 0) {
                    f2 = i2 + -1 | 0;
                    g2 = c[m2 >> 2] | 0;
                    do {
                      d2 = d2 + 1 | 0;
                      c[g2 + (d2 << 2) >> 2] = f2;
                    } while ((d2 | 0) != (e2 | 0));
                    d2 = e2;
                  }
                  i2 = i2 + 1 | 0;
                } while (i2 >>> 0 < (c[b2 >> 2] | 0) >>> 0);
                e2 = c[m2 >> 2] | 0;
                c[e2 >> 2] = 0;
                if (d2 >>> 0 > (c[o2 >> 2] | 0) >>> 0) {
                  d2 = b2;
                  break;
                }
              } else {
                e2 = c[b2 + 16 >> 2] | 0;
                c[e2 >> 2] = 0;
                d2 = 0;
              }
              do {
                d2 = d2 + 1 | 0;
                c[e2 + (d2 << 2) >> 2] = (c[b2 >> 2] | 0) + -1;
              } while (d2 >>> 0 <= (c[o2 >> 2] | 0) >>> 0);
              d2 = b2;
            } else
              p2 = 7;
          while (0);
          if ((p2 | 0) == 7)
            if (!(c[b2 >> 2] | 0))
              d2 = b2;
            else {
              f2 = c[b2 + 8 >> 2] | 0;
              g2 = c[b2 + 12 >> 2] | 0;
              d2 = 0;
              e2 = 0;
              do {
                c[f2 + (d2 << 2) >> 2] = (q(e2, n2) | 0) >>> 16;
                e2 = (c[g2 + (d2 << 2) >> 2] | 0) + e2 | 0;
                d2 = d2 + 1 | 0;
              } while (d2 >>> 0 < (c[b2 >> 2] | 0) >>> 0);
              d2 = b2;
            }
          p2 = ((c[r2 >> 2] | 0) * 5 | 0) >>> 2;
          o2 = (c[d2 >> 2] << 3) + 48 | 0;
          p2 = p2 >>> 0 > o2 >>> 0 ? o2 : p2;
          c[r2 >> 2] = p2;
          c[b2 + 28 >> 2] = p2;
          return;
        }
        function Yc(a2, b2, d2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          d2 = d2 | 0;
          var e2 = 0;
          d2 = Zc(b2, d2) | 0;
          c[a2 >> 2] = d2;
          do
            if (d2) {
              if (d2 >>> 0 >= 32) {
                d2 = c[a2 + 28 >> 2] | 0;
                break;
              }
              e2 = c[a2 + 12 >> 2] | 0;
              if (d2 >>> 0 > e2 >>> 0) {
                e2 = d2 - e2 | 0;
                d2 = Zc(b2, (c[a2 + 68 >> 2] | 0) + ((d2 + -1 | 0) * 44 | 0) | 0) | 0;
                e2 = d2 << e2 | (_c(b2, e2) | 0);
              } else
                e2 = Zc(b2, (c[a2 + 68 >> 2] | 0) + ((d2 + -1 | 0) * 44 | 0) | 0) | 0;
              d2 = c[a2 >> 2] | 0;
              if ((e2 | 0) < (1 << d2 + -1 | 0)) {
                d2 = e2 + 1 + (-1 << d2) | 0;
                break;
              } else {
                d2 = e2 + 1 | 0;
                break;
              }
            } else
              d2 = $c(b2, a2 + 48 | 0) | 0;
          while (0);
          return d2 | 0;
        }
        function Zc(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          var d2 = 0, e2 = 0, f2 = 0, g2 = 0, h2 = 0, i2 = 0, j2 = 0, k2 = 0, l2 = 0, m2 = 0, n2 = 0, o2 = 0;
          n2 = a2 + 8 | 0;
          m2 = c[n2 >> 2] | 0;
          f2 = c[b2 + 16 >> 2] | 0;
          if (f2) {
            e2 = a2 + 4 | 0;
            d2 = c[e2 >> 2] | 0;
            l2 = m2 >>> 15;
            c[n2 >> 2] = l2;
            j2 = (d2 >>> 0) / (l2 >>> 0) | 0;
            i2 = j2 >>> (c[b2 + 40 >> 2] | 0);
            g2 = c[f2 + (i2 << 2) >> 2] | 0;
            i2 = (c[f2 + (i2 + 1 << 2) >> 2] | 0) + 1 | 0;
            h2 = g2 + 1 | 0;
            k2 = c[b2 + 8 >> 2] | 0;
            if (i2 >>> 0 > h2 >>> 0) {
              f2 = g2;
              g2 = i2;
              do {
                h2 = (g2 + f2 | 0) >>> 1;
                i2 = (c[k2 + (h2 << 2) >> 2] | 0) >>> 0 > j2 >>> 0;
                f2 = i2 ? f2 : h2;
                g2 = i2 ? h2 : g2;
                h2 = f2 + 1 | 0;
              } while (g2 >>> 0 > h2 >>> 0);
              g2 = f2;
            }
            f2 = q(c[k2 + (g2 << 2) >> 2] | 0, l2) | 0;
            if ((g2 | 0) == (c[b2 + 32 >> 2] | 0))
              h2 = m2;
            else
              h2 = q(c[k2 + (h2 << 2) >> 2] | 0, l2) | 0;
          } else {
            k2 = m2 >>> 15;
            c[n2 >> 2] = k2;
            i2 = c[b2 >> 2] | 0;
            l2 = c[b2 + 8 >> 2] | 0;
            e2 = a2 + 4 | 0;
            d2 = c[e2 >> 2] | 0;
            j2 = i2 >>> 1;
            f2 = 0;
            h2 = m2;
            g2 = 0;
            do {
              o2 = q(c[l2 + (j2 << 2) >> 2] | 0, k2) | 0;
              m2 = o2 >>> 0 > d2 >>> 0;
              h2 = m2 ? o2 : h2;
              f2 = m2 ? f2 : o2;
              g2 = m2 ? g2 : j2;
              i2 = m2 ? j2 : i2;
              j2 = (g2 + i2 | 0) >>> 1;
            } while ((j2 | 0) != (g2 | 0));
          }
          c[e2 >> 2] = d2 - f2;
          o2 = h2 - f2 | 0;
          c[n2 >> 2] = o2;
          if (o2 >>> 0 < 16777216)
            ad(a2);
          n2 = (c[b2 + 12 >> 2] | 0) + (g2 << 2) | 0;
          c[n2 >> 2] = (c[n2 >> 2] | 0) + 1;
          n2 = b2 + 28 | 0;
          o2 = (c[n2 >> 2] | 0) + -1 | 0;
          c[n2 >> 2] = o2;
          if (!o2)
            Xc(b2);
          return g2 | 0;
        }
        function _c(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          var d2 = 0, e2 = 0, f2 = 0, g2 = 0;
          if (b2 >>> 0 > 19) {
            d2 = (bd(a2) | 0) & 65535;
            return (_c(a2, b2 + -16 | 0) | 0) << 16 | d2 | 0;
          }
          e2 = a2 + 4 | 0;
          f2 = c[e2 >> 2] | 0;
          g2 = a2 + 8 | 0;
          d2 = (c[g2 >> 2] | 0) >>> b2;
          c[g2 >> 2] = d2;
          b2 = (f2 >>> 0) / (d2 >>> 0) | 0;
          c[e2 >> 2] = f2 - (q(b2, d2) | 0);
          if (d2 >>> 0 < 16777216)
            ad(a2);
          return b2 | 0;
        }
        function $c(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          var d2 = 0, e2 = 0, f2 = 0, g2 = 0, h2 = 0, i2 = 0;
          e2 = a2 + 8 | 0;
          f2 = c[e2 >> 2] | 0;
          d2 = q(f2 >>> 13, c[b2 + 8 >> 2] | 0) | 0;
          g2 = a2 + 4 | 0;
          h2 = c[g2 >> 2] | 0;
          i2 = h2 >>> 0 >= d2 >>> 0;
          if (i2) {
            c[g2 >> 2] = h2 - d2;
            d2 = f2 - d2 | 0;
            c[e2 >> 2] = d2;
          } else {
            c[e2 >> 2] = d2;
            h2 = b2 + 12 | 0;
            c[h2 >> 2] = (c[h2 >> 2] | 0) + 1;
          }
          if (d2 >>> 0 < 16777216)
            ad(a2);
          h2 = b2 + 4 | 0;
          a2 = (c[h2 >> 2] | 0) + -1 | 0;
          c[h2 >> 2] = a2;
          if (!a2)
            cd(b2);
          return i2 & 1 | 0;
        }
        function ad(a2) {
          a2 = a2 | 0;
          var b2 = 0, d2 = 0, e2 = 0, f2 = 0;
          b2 = a2 + 4 | 0;
          d2 = a2 + 8 | 0;
          e2 = c[b2 >> 2] | 0;
          do {
            e2 = e2 << 8 | (Jc(c[a2 >> 2] | 0) | 0) & 255;
            c[b2 >> 2] = e2;
            f2 = c[d2 >> 2] << 8;
            c[d2 >> 2] = f2;
          } while (f2 >>> 0 < 16777216);
          return;
        }
        function bd(a2) {
          a2 = a2 | 0;
          var b2 = 0, d2 = 0, e2 = 0, f2 = 0;
          d2 = a2 + 4 | 0;
          f2 = c[d2 >> 2] | 0;
          b2 = a2 + 8 | 0;
          e2 = (c[b2 >> 2] | 0) >>> 16;
          c[b2 >> 2] = e2;
          b2 = (f2 >>> 0) / (e2 >>> 0) | 0;
          c[d2 >> 2] = f2 - (q(b2, e2) | 0);
          ad(a2);
          return b2 & 65535 | 0;
        }
        function cd(a2) {
          a2 = a2 | 0;
          var b2 = 0, d2 = 0, e2 = 0, f2 = 0, g2 = 0;
          f2 = c[a2 >> 2] | 0;
          d2 = a2 + 16 | 0;
          b2 = (c[d2 >> 2] | 0) + f2 | 0;
          c[d2 >> 2] = b2;
          if (b2 >>> 0 > 8192) {
            e2 = (b2 + 1 | 0) >>> 1;
            c[d2 >> 2] = e2;
            g2 = a2 + 12 | 0;
            b2 = ((c[g2 >> 2] | 0) + 1 | 0) >>> 1;
            c[g2 >> 2] = b2;
            if ((b2 | 0) == (e2 | 0)) {
              b2 = e2 + 1 | 0;
              c[d2 >> 2] = b2;
              d2 = b2;
              b2 = e2;
            } else
              d2 = e2;
          } else {
            d2 = b2;
            b2 = c[a2 + 12 >> 2] | 0;
          }
          c[a2 + 8 >> 2] = (q(b2, 2147483648 / (d2 >>> 0) | 0) | 0) >>> 18;
          g2 = f2 * 5 | 0;
          g2 = g2 >>> 0 > 259 ? 64 : g2 >>> 2;
          c[a2 >> 2] = g2;
          c[a2 + 4 >> 2] = g2;
          return;
        }
        function dd(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          var e2 = 0, f2 = 0, g2 = 0, h2 = 0, i2 = 0, j2 = 0, k2 = 0, l2 = 0, m2 = 0, n2 = 0, o2 = 0;
          m2 = V;
          V = V + 32 | 0;
          h2 = m2 + 16 | 0;
          i2 = m2 + 8 | 0;
          j2 = m2;
          k2 = a2 + 336 | 0;
          f2 = k2;
          g2 = a2 + 259 | 0;
          if (!((c[f2 + 4 >> 2] | 0) == 0 ? (c[f2 >> 2] | 0) == (d[g2 >> 0] | d[g2 + 1 >> 0] << 8 | d[g2 + 2 >> 0] << 16 | d[g2 + 3 >> 0] << 24 | 0) : 0)) {
            f2 = a2 + 320 | 0;
            e2 = c[f2 >> 2] | 0;
            g2 = e2;
            if (!((e2 | 0) != 0 ? (c[a2 + 312 >> 2] | 0) != 0 : 0)) {
              e2 = g2;
              l2 = 5;
            }
          } else {
            f2 = a2 + 320 | 0;
            e2 = c[a2 + 320 >> 2] | 0;
            l2 = 5;
          }
          if ((l2 | 0) == 5) {
            l2 = a2 + 320 | 0;
            c[h2 >> 2] = e2;
            c[l2 >> 2] = 0;
            e2 = a2 + 324 | 0;
            c[h2 + 4 >> 2] = c[e2 >> 2];
            c[e2 >> 2] = 0;
            Na(h2);
            g2 = a2 + 312 | 0;
            c[h2 >> 2] = c[g2 >> 2];
            c[g2 >> 2] = 0;
            n2 = a2 + 316 | 0;
            c[h2 + 4 >> 2] = c[n2 >> 2];
            c[n2 >> 2] = 0;
            Oa(h2);
            o2 = eq(12) | 0;
            lc(o2, a2 + 4 | 0);
            c[j2 >> 2] = 0;
            c[h2 >> 2] = c[j2 >> 2];
            fd(i2, o2, h2);
            o2 = c[i2 >> 2] | 0;
            c[i2 >> 2] = c[g2 >> 2];
            c[g2 >> 2] = o2;
            o2 = i2 + 4 | 0;
            j2 = c[o2 >> 2] | 0;
            c[o2 >> 2] = c[n2 >> 2];
            c[n2 >> 2] = j2;
            Oa(i2);
            ed(i2, c[g2 >> 2] | 0, a2 + 300 | 0);
            g2 = c[i2 >> 2] | 0;
            n2 = i2 + 4 | 0;
            j2 = c[n2 >> 2] | 0;
            c[i2 >> 2] = 0;
            c[n2 >> 2] = 0;
            c[h2 >> 2] = c[l2 >> 2];
            c[l2 >> 2] = g2;
            c[h2 + 4 >> 2] = c[e2 >> 2];
            c[e2 >> 2] = j2;
            Na(h2);
            Na(i2);
            e2 = a2 + 328 | 0;
            j2 = e2;
            j2 = lr(c[j2 >> 2] | 0, c[j2 + 4 >> 2] | 0, 1, 0) | 0;
            l2 = u() | 0;
            c[e2 >> 2] = j2;
            c[e2 + 4 >> 2] = l2;
            e2 = k2;
            c[e2 >> 2] = 0;
            c[e2 + 4 >> 2] = 0;
            e2 = c[f2 >> 2] | 0;
          }
          $[c[c[e2 >> 2] >> 2] & 63](e2, b2) | 0;
          l2 = k2;
          l2 = lr(c[l2 >> 2] | 0, c[l2 + 4 >> 2] | 0, 1, 0) | 0;
          n2 = u() | 0;
          o2 = k2;
          c[o2 >> 2] = l2;
          c[o2 + 4 >> 2] = n2;
          V = m2;
          return;
        }
        function ed(a2, b2, d2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          d2 = d2 | 0;
          var e2 = 0, f2 = 0, g2 = 0, h2 = 0;
          h2 = V;
          V = V + 64 | 0;
          e2 = h2 + 56 | 0;
          f2 = h2;
          g2 = ld(d2) | 0;
          if ((g2 | 0) == -1) {
            h2 = v(8) | 0;
            md(h2);
            x(h2 | 0, 2784, 8);
          }
          d2 = nd(d2) | 0;
          a:
            do
              if (!d2)
                switch (g2 | 0) {
                  case 0: {
                    g2 = eq(4788) | 0;
                    xd(g2);
                    wd(a2, b2, g2);
                    break a;
                  }
                  case 1: {
                    g2 = eq(5116) | 0;
                    zd(g2);
                    yd(a2, b2, g2);
                    break a;
                  }
                  case 2: {
                    g2 = eq(5104) | 0;
                    Bd(g2);
                    Ad(a2, b2, g2);
                    break a;
                  }
                  case 3: {
                    g2 = eq(5432) | 0;
                    Dd(g2);
                    Cd(a2, b2, g2);
                    break a;
                  }
                  default: {
                    c[a2 >> 2] = 0;
                    c[a2 + 4 >> 2] = 0;
                    break a;
                  }
                }
              else {
                od(e2, b2);
                pd(c[e2 >> 2] | 0);
                if ((g2 | 2 | 0) == 3)
                  qd(c[e2 >> 2] | 0);
                if ((g2 | 1 | 0) == 3)
                  rd(c[e2 >> 2] | 0);
                g2 = c[e2 >> 2] | 0;
                td(f2, d2);
                sd(g2, f2);
                ud(f2);
                c[a2 >> 2] = c[e2 >> 2];
                g2 = e2 + 4 | 0;
                c[a2 + 4 >> 2] = c[g2 >> 2];
                c[e2 >> 2] = 0;
                c[g2 >> 2] = 0;
                vd(e2);
              }
            while (0);
          V = h2;
          return;
        }
        function fd(a2, b2, d2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          d2 = d2 | 0;
          var e2 = 0, f2 = 0;
          d2 = V;
          V = V + 16 | 0;
          e2 = d2;
          c[a2 >> 2] = b2;
          f2 = eq(16) | 0;
          c[f2 + 4 >> 2] = 0;
          c[f2 + 8 >> 2] = 0;
          c[f2 >> 2] = 4576;
          c[f2 + 12 >> 2] = b2;
          c[a2 + 4 >> 2] = f2;
          c[e2 >> 2] = b2;
          c[e2 + 4 >> 2] = b2;
          gd(a2, e2);
          V = d2;
          return;
        }
        function gd(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          return;
        }
        function hd(a2) {
          a2 = a2 | 0;
          pq(a2);
          jp(a2);
          return;
        }
        function id(a2) {
          a2 = a2 | 0;
          a2 = c[a2 + 12 >> 2] | 0;
          if (a2 | 0) {
            rc(a2);
            jp(a2);
          }
          return;
        }
        function jd(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          return ((c[b2 + 4 >> 2] | 0) == 7983 ? a2 + 12 | 0 : 0) | 0;
        }
        function kd(a2) {
          a2 = a2 | 0;
          Da(a2, 16);
          return;
        }
        function ld(a2) {
          a2 = a2 | 0;
          var b2 = 0, d2 = 0;
          b2 = (c[a2 + 4 >> 2] | 0) - (c[a2 >> 2] | 0) | 0;
          a:
            do
              if (((b2 | 0) != 0 ? (d2 = ((b2 | 0) / 12 | 0) + (((nd(a2) | 0) != 0) << 31 >> 31) | 0, (d2 | 0) != 0) : 0) ? (b2 = c[a2 >> 2] | 0, !(Ed(b2, Fd() | 0) | 0)) : 0) {
                switch (d2 | 0) {
                  case 1: {
                    a2 = 0;
                    break a;
                  }
                  case 2: {
                    if (Gd((c[a2 >> 2] | 0) + 12 | 0, Hd() | 0) | 0) {
                      a2 = 1;
                      break a;
                    }
                    if (Gd((c[a2 >> 2] | 0) + 12 | 0, Id() | 0) | 0) {
                      a2 = 2;
                      break a;
                    }
                    break;
                  }
                  case 3: {
                    if (Gd((c[a2 >> 2] | 0) + 12 | 0, Hd() | 0) | 0 ? (d2 = (c[a2 >> 2] | 0) + 24 | 0, Gd(d2, Id() | 0) | 0) : 0) {
                      a2 = 3;
                      break a;
                    }
                    break;
                  }
                  default: {
                  }
                }
                a2 = -1;
              } else
                a2 = -1;
            while (0);
          return a2 | 0;
        }
        function md(a2) {
          a2 = a2 | 0;
          xq(a2, 8131);
          c[a2 >> 2] = 4604;
          return;
        }
        function nd(a2) {
          a2 = a2 | 0;
          var b2 = 0, d2 = 0;
          b2 = c[a2 + 4 >> 2] | 0;
          if (((b2 | 0) != (c[a2 >> 2] | 0) ? (d2 = b2, (c[d2 + -12 >> 2] | 0) == 0) : 0) ? (c[d2 + -4 >> 2] | 0) == 2 : 0)
            a2 = c[d2 + -8 >> 2] | 0;
          else
            a2 = 0;
          return a2 | 0;
        }
        function od(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          var d2 = 0, e2 = 0, f2 = 0, g2 = 0;
          d2 = V;
          V = V + 16 | 0;
          e2 = d2 + 4 | 0;
          g2 = d2;
          f2 = eq(24) | 0;
          Kd(f2, b2);
          c[g2 >> 2] = 0;
          c[e2 >> 2] = c[g2 >> 2];
          Ld(a2, f2, e2);
          V = d2;
          return;
        }
        function pd(a2) {
          a2 = a2 | 0;
          var b2 = 0, d2 = 0, e2 = 0, f2 = 0, g2 = 0, h2 = 0, i2 = 0, j2 = 0, k2 = 0, l2 = 0;
          j2 = V;
          V = V + 32 | 0;
          e2 = j2 + 12 | 0;
          f2 = j2;
          b2 = j2 + 8 | 0;
          h2 = eq(4792) | 0;
          Zd(h2, c[a2 + 4 >> 2] | 0);
          g2 = a2 + 8 | 0;
          c[b2 >> 2] = 0;
          c[e2 >> 2] = c[b2 >> 2];
          _d(f2, h2, e2);
          h2 = a2 + 12 | 0;
          b2 = c[h2 >> 2] | 0;
          i2 = a2 + 16 | 0;
          do
            if (b2 >>> 0 >= (c[i2 >> 2] | 0) >>> 0) {
              b2 = (b2 - (c[g2 >> 2] | 0) >> 3) + 1 | 0;
              d2 = ee(g2) | 0;
              if (d2 >>> 0 < b2 >>> 0)
                cr(g2);
              else {
                k2 = c[g2 >> 2] | 0;
                l2 = (c[i2 >> 2] | 0) - k2 | 0;
                i2 = l2 >> 2;
                be(
                  e2,
                  l2 >> 3 >>> 0 < d2 >>> 1 >>> 0 ? i2 >>> 0 < b2 >>> 0 ? b2 : i2 : d2,
                  (c[h2 >> 2] | 0) - k2 >> 3,
                  a2 + 16 | 0
                );
                i2 = e2 + 8 | 0;
                h2 = c[i2 >> 2] | 0;
                c[h2 >> 2] = c[f2 >> 2];
                a2 = f2 + 4 | 0;
                c[h2 + 4 >> 2] = c[a2 >> 2];
                c[f2 >> 2] = 0;
                c[a2 >> 2] = 0;
                c[i2 >> 2] = h2 + 8;
                ce(g2, e2);
                de(e2);
                break;
              }
            } else {
              $d(e2, g2, 1);
              l2 = e2 + 4 | 0;
              k2 = c[l2 >> 2] | 0;
              c[k2 >> 2] = c[f2 >> 2];
              i2 = f2 + 4 | 0;
              c[k2 + 4 >> 2] = c[i2 >> 2];
              c[f2 >> 2] = 0;
              c[i2 >> 2] = 0;
              c[l2 >> 2] = k2 + 8;
              ae(e2);
            }
          while (0);
          Sd(f2);
          V = j2;
          return;
        }
        function qd(a2) {
          a2 = a2 | 0;
          var b2 = 0, d2 = 0, e2 = 0, f2 = 0, g2 = 0, h2 = 0, i2 = 0, j2 = 0, k2 = 0, l2 = 0;
          j2 = V;
          V = V + 32 | 0;
          e2 = j2 + 12 | 0;
          f2 = j2;
          b2 = j2 + 8 | 0;
          h2 = eq(336) | 0;
          af(h2, c[a2 + 4 >> 2] | 0);
          g2 = a2 + 8 | 0;
          c[b2 >> 2] = 0;
          c[e2 >> 2] = c[b2 >> 2];
          bf(f2, h2, e2);
          h2 = a2 + 12 | 0;
          b2 = c[h2 >> 2] | 0;
          i2 = a2 + 16 | 0;
          do
            if (b2 >>> 0 >= (c[i2 >> 2] | 0) >>> 0) {
              b2 = (b2 - (c[g2 >> 2] | 0) >> 3) + 1 | 0;
              d2 = ee(g2) | 0;
              if (d2 >>> 0 < b2 >>> 0)
                cr(g2);
              else {
                k2 = c[g2 >> 2] | 0;
                l2 = (c[i2 >> 2] | 0) - k2 | 0;
                i2 = l2 >> 2;
                be(
                  e2,
                  l2 >> 3 >>> 0 < d2 >>> 1 >>> 0 ? i2 >>> 0 < b2 >>> 0 ? b2 : i2 : d2,
                  (c[h2 >> 2] | 0) - k2 >> 3,
                  a2 + 16 | 0
                );
                i2 = e2 + 8 | 0;
                h2 = c[i2 >> 2] | 0;
                c[h2 >> 2] = c[f2 >> 2];
                a2 = f2 + 4 | 0;
                c[h2 + 4 >> 2] = c[a2 >> 2];
                c[f2 >> 2] = 0;
                c[a2 >> 2] = 0;
                c[i2 >> 2] = h2 + 8;
                ce(g2, e2);
                de(e2);
                break;
              }
            } else {
              $d(e2, g2, 1);
              l2 = e2 + 4 | 0;
              k2 = c[l2 >> 2] | 0;
              c[k2 >> 2] = c[f2 >> 2];
              i2 = f2 + 4 | 0;
              c[k2 + 4 >> 2] = c[i2 >> 2];
              c[f2 >> 2] = 0;
              c[i2 >> 2] = 0;
              c[l2 >> 2] = k2 + 8;
              ae(e2);
            }
          while (0);
          Sd(f2);
          V = j2;
          return;
        }
        function rd(a2) {
          a2 = a2 | 0;
          var b2 = 0, d2 = 0, e2 = 0, f2 = 0, g2 = 0, h2 = 0, i2 = 0, j2 = 0, k2 = 0, l2 = 0;
          j2 = V;
          V = V + 32 | 0;
          e2 = j2 + 12 | 0;
          f2 = j2;
          b2 = j2 + 8 | 0;
          h2 = eq(324) | 0;
          Af(h2, c[a2 + 4 >> 2] | 0);
          g2 = a2 + 8 | 0;
          c[b2 >> 2] = 0;
          c[e2 >> 2] = c[b2 >> 2];
          Bf(f2, h2, e2);
          h2 = a2 + 12 | 0;
          b2 = c[h2 >> 2] | 0;
          i2 = a2 + 16 | 0;
          do
            if (b2 >>> 0 >= (c[i2 >> 2] | 0) >>> 0) {
              b2 = (b2 - (c[g2 >> 2] | 0) >> 3) + 1 | 0;
              d2 = ee(g2) | 0;
              if (d2 >>> 0 < b2 >>> 0)
                cr(g2);
              else {
                k2 = c[g2 >> 2] | 0;
                l2 = (c[i2 >> 2] | 0) - k2 | 0;
                i2 = l2 >> 2;
                be(
                  e2,
                  l2 >> 3 >>> 0 < d2 >>> 1 >>> 0 ? i2 >>> 0 < b2 >>> 0 ? b2 : i2 : d2,
                  (c[h2 >> 2] | 0) - k2 >> 3,
                  a2 + 16 | 0
                );
                i2 = e2 + 8 | 0;
                h2 = c[i2 >> 2] | 0;
                c[h2 >> 2] = c[f2 >> 2];
                a2 = f2 + 4 | 0;
                c[h2 + 4 >> 2] = c[a2 >> 2];
                c[f2 >> 2] = 0;
                c[a2 >> 2] = 0;
                c[i2 >> 2] = h2 + 8;
                ce(g2, e2);
                de(e2);
                break;
              }
            } else {
              $d(e2, g2, 1);
              l2 = e2 + 4 | 0;
              k2 = c[l2 >> 2] | 0;
              c[k2 >> 2] = c[f2 >> 2];
              i2 = f2 + 4 | 0;
              c[k2 + 4 >> 2] = c[i2 >> 2];
              c[f2 >> 2] = 0;
              c[i2 >> 2] = 0;
              c[l2 >> 2] = k2 + 8;
              ae(e2);
            }
          while (0);
          Sd(f2);
          V = j2;
          return;
        }
        function sd(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          var d2 = 0, e2 = 0, f2 = 0, g2 = 0, h2 = 0, i2 = 0, j2 = 0, k2 = 0, l2 = 0;
          j2 = V;
          V = V + 32 | 0;
          h2 = j2 + 12 | 0;
          i2 = j2;
          e2 = j2 + 8 | 0;
          g2 = eq(64) | 0;
          Qf(g2, c[a2 + 4 >> 2] | 0, b2);
          f2 = a2 + 8 | 0;
          c[e2 >> 2] = 0;
          c[h2 >> 2] = c[e2 >> 2];
          Rf(i2, g2, h2);
          g2 = a2 + 12 | 0;
          b2 = c[g2 >> 2] | 0;
          e2 = a2 + 16 | 0;
          do
            if (b2 >>> 0 >= (c[e2 >> 2] | 0) >>> 0) {
              b2 = (b2 - (c[f2 >> 2] | 0) >> 3) + 1 | 0;
              d2 = ee(f2) | 0;
              if (d2 >>> 0 < b2 >>> 0)
                cr(f2);
              else {
                k2 = c[f2 >> 2] | 0;
                l2 = (c[e2 >> 2] | 0) - k2 | 0;
                e2 = l2 >> 2;
                be(
                  h2,
                  l2 >> 3 >>> 0 < d2 >>> 1 >>> 0 ? e2 >>> 0 < b2 >>> 0 ? b2 : e2 : d2,
                  (c[g2 >> 2] | 0) - k2 >> 3,
                  a2 + 16 | 0
                );
                a2 = h2 + 8 | 0;
                g2 = c[a2 >> 2] | 0;
                c[g2 >> 2] = c[i2 >> 2];
                e2 = i2 + 4 | 0;
                c[g2 + 4 >> 2] = c[e2 >> 2];
                c[i2 >> 2] = 0;
                c[e2 >> 2] = 0;
                c[a2 >> 2] = g2 + 8;
                ce(f2, h2);
                de(h2);
                break;
              }
            } else {
              $d(h2, f2, 1);
              l2 = h2 + 4 | 0;
              k2 = c[l2 >> 2] | 0;
              c[k2 >> 2] = c[i2 >> 2];
              a2 = i2 + 4 | 0;
              c[k2 + 4 >> 2] = c[a2 >> 2];
              c[i2 >> 2] = 0;
              c[a2 >> 2] = 0;
              c[l2 >> 2] = k2 + 8;
              ae(h2);
            }
          while (0);
          Sd(i2);
          V = j2;
          return;
        }
        function td(b2, d2) {
          b2 = b2 | 0;
          d2 = d2 | 0;
          var e2 = 0, f2 = 0;
          e2 = V;
          V = V + 48 | 0;
          f2 = e2;
          c[b2 >> 2] = d2;
          a[b2 + 4 >> 0] = 0;
          Jg(b2 + 8 | 0, d2);
          Jg(b2 + 20 | 0, d2);
          Oc(f2, 256, 0, 0);
          Kg(b2 + 32 | 0, d2, f2);
          Ic(f2);
          V = e2;
          return;
        }
        function ud(a2) {
          a2 = a2 | 0;
          Ng(a2 + 32 | 0);
          _f(a2 + 20 | 0);
          _f(a2 + 8 | 0);
          return;
        }
        function vd(a2) {
          a2 = a2 | 0;
          var b2 = 0, d2 = 0;
          a2 = c[a2 + 4 >> 2] | 0;
          if (a2 | 0 ? (d2 = a2 + 4 | 0, b2 = c[d2 >> 2] | 0, c[d2 >> 2] = b2 + -1, (b2 | 0) == 0) : 0) {
            ca[c[(c[a2 >> 2] | 0) + 8 >> 2] & 255](a2);
            qq(a2);
          }
          return;
        }
        function wd(a2, b2, d2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          d2 = d2 | 0;
          var e2 = 0, f2 = 0, g2 = 0, h2 = 0;
          e2 = V;
          V = V + 16 | 0;
          f2 = e2 + 4 | 0;
          h2 = e2;
          g2 = eq(12) | 0;
          Og(g2, b2, d2);
          c[h2 >> 2] = 0;
          c[f2 >> 2] = c[h2 >> 2];
          Pg(a2, g2, f2);
          V = e2;
          return;
        }
        function xd(a2) {
          a2 = a2 | 0;
          ge(a2);
          $g(a2 + 4784 | 0);
          return;
        }
        function yd(a2, b2, d2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          d2 = d2 | 0;
          var e2 = 0, f2 = 0, g2 = 0, h2 = 0;
          e2 = V;
          V = V + 16 | 0;
          f2 = e2 + 4 | 0;
          h2 = e2;
          g2 = eq(12) | 0;
          ah(g2, b2, d2);
          c[h2 >> 2] = 0;
          c[f2 >> 2] = c[h2 >> 2];
          bh(a2, g2, f2);
          V = e2;
          return;
        }
        function zd(a2) {
          a2 = a2 | 0;
          ge(a2);
          nh(a2 + 4784 | 0);
          return;
        }
        function Ad(a2, b2, d2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          d2 = d2 | 0;
          var e2 = 0, f2 = 0, g2 = 0, h2 = 0;
          e2 = V;
          V = V + 16 | 0;
          f2 = e2 + 4 | 0;
          h2 = e2;
          g2 = eq(12) | 0;
          oh(g2, b2, d2);
          c[h2 >> 2] = 0;
          c[f2 >> 2] = c[h2 >> 2];
          ph(a2, g2, f2);
          V = e2;
          return;
        }
        function Bd(a2) {
          a2 = a2 | 0;
          ge(a2);
          Bh(a2 + 4784 | 0);
          return;
        }
        function Cd(a2, b2, d2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          d2 = d2 | 0;
          var e2 = 0, f2 = 0, g2 = 0, h2 = 0;
          e2 = V;
          V = V + 16 | 0;
          f2 = e2 + 4 | 0;
          h2 = e2;
          g2 = eq(12) | 0;
          Ch(g2, b2, d2);
          c[h2 >> 2] = 0;
          c[f2 >> 2] = c[h2 >> 2];
          Dh(a2, g2, f2);
          V = e2;
          return;
        }
        function Dd(a2) {
          a2 = a2 | 0;
          ge(a2);
          Ph(a2 + 4784 | 0);
          return;
        }
        function Ed(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          return (Gd(a2, b2) | 0) ^ 1 | 0;
        }
        function Fd() {
          if ((a[21456] | 0) == 0 ? Tp(21456) | 0 : 0) {
            _b(21536, 6, 20, 2);
            $p(21456);
          }
          return 21536;
        }
        function Gd(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          if ((c[a2 >> 2] | 0) == (c[b2 >> 2] | 0) ? (c[a2 + 8 >> 2] | 0) == (c[b2 + 8 >> 2] | 0) : 0)
            a2 = (c[a2 + 4 >> 2] | 0) == (c[b2 + 4 >> 2] | 0);
          else
            a2 = 0;
          return a2 | 0;
        }
        function Hd() {
          if ((a[21464] | 0) == 0 ? Tp(21464) | 0 : 0) {
            _b(21548, 7, 8, 2);
            $p(21464);
          }
          return 21548;
        }
        function Id() {
          if ((a[21472] | 0) == 0 ? Tp(21472) | 0 : 0) {
            _b(21560, 8, 6, 2);
            $p(21472);
          }
          return 21560;
        }
        function Jd(a2) {
          a2 = a2 | 0;
          yp(a2);
          jp(a2);
          return;
        }
        function Kd(b2, d2) {
          b2 = b2 | 0;
          d2 = d2 | 0;
          Md(b2);
          c[b2 >> 2] = 4624;
          c[b2 + 4 >> 2] = d2;
          c[b2 + 8 >> 2] = 0;
          c[b2 + 12 >> 2] = 0;
          c[b2 + 16 >> 2] = 0;
          a[b2 + 20 >> 0] = 1;
          return;
        }
        function Ld(a2, b2, d2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          d2 = d2 | 0;
          var e2 = 0, f2 = 0;
          d2 = V;
          V = V + 16 | 0;
          e2 = d2;
          c[a2 >> 2] = b2;
          f2 = eq(16) | 0;
          c[f2 + 4 >> 2] = 0;
          c[f2 + 8 >> 2] = 0;
          c[f2 >> 2] = 4664;
          c[f2 + 12 >> 2] = b2;
          c[a2 + 4 >> 2] = f2;
          c[e2 >> 2] = b2;
          c[e2 + 4 >> 2] = b2;
          Ud(a2, e2);
          V = d2;
          return;
        }
        function Md(a2) {
          a2 = a2 | 0;
          c[a2 >> 2] = 4644;
          return;
        }
        function Nd(b2, d2) {
          b2 = b2 | 0;
          d2 = d2 | 0;
          var e2 = 0, f2 = 0, g2 = 0, h2 = 0, i2 = 0, j2 = 0, k2 = 0;
          k2 = V;
          V = V + 16 | 0;
          h2 = k2;
          e2 = c[b2 + 8 >> 2] | 0;
          i2 = c[b2 + 12 >> 2] | 0;
          if ((e2 | 0) != (i2 | 0)) {
            j2 = h2 + 4 | 0;
            do {
              f2 = c[e2 >> 2] | 0;
              c[h2 >> 2] = f2;
              g2 = c[e2 + 4 >> 2] | 0;
              c[j2 >> 2] = g2;
              if (g2 | 0) {
                g2 = g2 + 4 | 0;
                c[g2 >> 2] = (c[g2 >> 2] | 0) + 1;
              }
              d2 = $[c[(c[f2 >> 2] | 0) + 12 >> 2] & 63](f2, d2) | 0;
              Sd(h2);
              e2 = e2 + 8 | 0;
            } while ((e2 | 0) != (i2 | 0));
          }
          e2 = b2 + 20 | 0;
          if (a[e2 >> 0] | 0) {
            a[e2 >> 0] = 0;
            nc(c[b2 + 4 >> 2] | 0);
          }
          V = k2;
          return d2 | 0;
        }
        function Od(a2) {
          a2 = a2 | 0;
          c[a2 >> 2] = 4624;
          Td(a2 + 8 | 0);
          Qd(a2);
          return;
        }
        function Pd(a2) {
          a2 = a2 | 0;
          Od(a2);
          jp(a2);
          return;
        }
        function Qd(a2) {
          a2 = a2 | 0;
          return;
        }
        function Rd(a2) {
          a2 = a2 | 0;
          U();
        }
        function Sd(a2) {
          a2 = a2 | 0;
          var b2 = 0, d2 = 0;
          a2 = c[a2 + 4 >> 2] | 0;
          if (a2 | 0 ? (d2 = a2 + 4 | 0, b2 = c[d2 >> 2] | 0, c[d2 >> 2] = b2 + -1, (b2 | 0) == 0) : 0) {
            ca[c[(c[a2 >> 2] | 0) + 8 >> 2] & 255](a2);
            qq(a2);
          }
          return;
        }
        function Td(a2) {
          a2 = a2 | 0;
          var b2 = 0, d2 = 0, e2 = 0;
          d2 = c[a2 >> 2] | 0;
          if (d2 | 0) {
            e2 = a2 + 4 | 0;
            b2 = c[e2 >> 2] | 0;
            if ((b2 | 0) == (d2 | 0))
              b2 = d2;
            else {
              do {
                b2 = b2 + -8 | 0;
                Sd(b2);
              } while ((b2 | 0) != (d2 | 0));
              b2 = c[a2 >> 2] | 0;
            }
            c[e2 >> 2] = d2;
            Da(b2, (c[a2 + 8 >> 2] | 0) - b2 | 0);
          }
          return;
        }
        function Ud(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          return;
        }
        function Vd(a2) {
          a2 = a2 | 0;
          pq(a2);
          jp(a2);
          return;
        }
        function Wd(a2) {
          a2 = a2 | 0;
          a2 = c[a2 + 12 >> 2] | 0;
          if (a2 | 0)
            ca[c[(c[a2 >> 2] | 0) + 8 >> 2] & 255](a2);
          return;
        }
        function Xd(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          return ((c[b2 + 4 >> 2] | 0) == 8546 ? a2 + 12 | 0 : 0) | 0;
        }
        function Yd(a2) {
          a2 = a2 | 0;
          Da(a2, 16);
          return;
        }
        function Zd(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          fe(a2);
          c[a2 >> 2] = 4692;
          c[a2 + 4 >> 2] = b2;
          ge(a2 + 8 | 0);
          return;
        }
        function _d(a2, b2, d2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          d2 = d2 | 0;
          var e2 = 0, f2 = 0;
          d2 = V;
          V = V + 16 | 0;
          e2 = d2;
          c[a2 >> 2] = b2;
          f2 = eq(16) | 0;
          c[f2 + 4 >> 2] = 0;
          c[f2 + 8 >> 2] = 0;
          c[f2 >> 2] = 4740;
          c[f2 + 12 >> 2] = b2;
          c[a2 + 4 >> 2] = f2;
          c[e2 >> 2] = b2;
          c[e2 + 4 >> 2] = b2;
          Xe(a2, e2);
          V = d2;
          return;
        }
        function $d(a2, b2, d2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          d2 = d2 | 0;
          c[a2 >> 2] = b2;
          b2 = c[b2 + 4 >> 2] | 0;
          c[a2 + 4 >> 2] = b2;
          c[a2 + 8 >> 2] = b2 + (d2 << 3);
          return;
        }
        function ae(a2) {
          a2 = a2 | 0;
          c[(c[a2 >> 2] | 0) + 4 >> 2] = c[a2 + 4 >> 2];
          return;
        }
        function be(a2, b2, d2, e2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          d2 = d2 | 0;
          e2 = e2 | 0;
          var f2 = 0;
          f2 = a2 + 12 | 0;
          c[f2 >> 2] = 0;
          c[a2 + 16 >> 2] = e2;
          do
            if (b2)
              if (b2 >>> 0 > 536870911) {
                f2 = v(8) | 0;
                vq(f2, 6723);
                c[f2 >> 2] = 5956;
                x(f2 | 0, 3928, 123);
              } else {
                e2 = eq(b2 << 3) | 0;
                break;
              }
            else
              e2 = 0;
          while (0);
          c[a2 >> 2] = e2;
          d2 = e2 + (d2 << 3) | 0;
          c[a2 + 8 >> 2] = d2;
          c[a2 + 4 >> 2] = d2;
          c[f2 >> 2] = e2 + (b2 << 3);
          return;
        }
        function ce(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          var d2 = 0, e2 = 0, f2 = 0, g2 = 0, h2 = 0, i2 = 0, j2 = 0;
          i2 = c[a2 >> 2] | 0;
          j2 = a2 + 4 | 0;
          d2 = c[j2 >> 2] | 0;
          h2 = b2 + 4 | 0;
          if ((d2 | 0) == (i2 | 0)) {
            f2 = h2;
            g2 = a2;
            e2 = c[h2 >> 2] | 0;
            d2 = i2;
          } else {
            e2 = c[h2 >> 2] | 0;
            do {
              g2 = d2;
              d2 = d2 + -8 | 0;
              c[e2 + -8 >> 2] = c[d2 >> 2];
              g2 = g2 + -4 | 0;
              c[e2 + -4 >> 2] = c[g2 >> 2];
              c[d2 >> 2] = 0;
              c[g2 >> 2] = 0;
              e2 = (c[h2 >> 2] | 0) + -8 | 0;
              c[h2 >> 2] = e2;
            } while ((d2 | 0) != (i2 | 0));
            f2 = h2;
            g2 = a2;
            d2 = c[a2 >> 2] | 0;
          }
          c[g2 >> 2] = e2;
          c[f2 >> 2] = d2;
          i2 = b2 + 8 | 0;
          h2 = c[j2 >> 2] | 0;
          c[j2 >> 2] = c[i2 >> 2];
          c[i2 >> 2] = h2;
          i2 = a2 + 8 | 0;
          j2 = b2 + 12 | 0;
          a2 = c[i2 >> 2] | 0;
          c[i2 >> 2] = c[j2 >> 2];
          c[j2 >> 2] = a2;
          c[b2 >> 2] = c[f2 >> 2];
          return;
        }
        function de(a2) {
          a2 = a2 | 0;
          var b2 = 0, d2 = 0, e2 = 0, f2 = 0;
          d2 = c[a2 + 4 >> 2] | 0;
          e2 = a2 + 8 | 0;
          b2 = c[e2 >> 2] | 0;
          if ((b2 | 0) != (d2 | 0))
            do {
              f2 = b2 + -8 | 0;
              c[e2 >> 2] = f2;
              Sd(f2);
              b2 = c[e2 >> 2] | 0;
            } while ((b2 | 0) != (d2 | 0));
          b2 = c[a2 >> 2] | 0;
          if (b2 | 0)
            Da(b2, (c[a2 + 12 >> 2] | 0) - b2 | 0);
          return;
        }
        function ee(a2) {
          a2 = a2 | 0;
          return 536870911;
        }
        function fe(a2) {
          a2 = a2 | 0;
          c[a2 >> 2] = 4716;
          return;
        }
        function ge(b2) {
          b2 = b2 | 0;
          oe(b2);
          pe(b2 + 3980 | 0);
          qe(b2 + 4380 | 0);
          a[b2 + 4780 >> 0] = 0;
          a[b2 + 4781 >> 0] = 0;
          return;
        }
        function he(a2) {
          a2 = a2 | 0;
          c[a2 >> 2] = 4692;
          ze(a2 + 8 | 0);
          le(a2);
          return;
        }
        function ie(a2) {
          a2 = a2 | 0;
          he(a2);
          jp(a2);
          return;
        }
        function je(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          return b2 | 0;
        }
        function ke(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          return Be(a2 + 8 | 0, c[a2 + 4 >> 2] | 0, b2) | 0;
        }
        function le(a2) {
          a2 = a2 | 0;
          return;
        }
        function me(a2) {
          a2 = a2 | 0;
          le(a2);
          jp(a2);
          return;
        }
        function ne(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          return b2 | 0;
        }
        function oe(d2) {
          d2 = d2 | 0;
          var e2 = 0, f2 = 0;
          te(d2);
          ue(d2 + 52 | 0);
          ue(d2 + 436 | 0);
          Oc(d2 + 852 | 0, 64, 0, 0);
          a[d2 + 3976 >> 0] = 0;
          e2 = d2 + 20 | 0;
          f2 = e2 + 32 | 0;
          do {
            b[e2 >> 1] = 0;
            e2 = e2 + 2 | 0;
          } while ((e2 | 0) < (f2 | 0));
          e2 = eq(44) | 0;
          Oc(e2, 256, 0, 0);
          c[d2 + 896 >> 2] = e2;
          e2 = eq(44) | 0;
          Oc(e2, 256, 0, 0);
          c[d2 + 900 >> 2] = e2;
          e2 = d2 + 820 | 0;
          c[e2 >> 2] = 0;
          c[e2 + 4 >> 2] = 0;
          c[e2 + 8 >> 2] = 0;
          c[e2 + 12 >> 2] = 0;
          c[e2 + 16 >> 2] = 0;
          c[e2 + 20 >> 2] = 0;
          c[e2 + 24 >> 2] = 0;
          c[e2 + 28 >> 2] = 0;
          e2 = 0;
          do {
            f2 = eq(44) | 0;
            Oc(f2, 256, 0, 0);
            c[d2 + 904 + (e2 << 2) >> 2] = f2;
            f2 = eq(44) | 0;
            Oc(f2, 256, 0, 0);
            c[d2 + 1928 + (e2 << 2) >> 2] = f2;
            f2 = eq(44) | 0;
            Oc(f2, 256, 0, 0);
            c[d2 + 2952 + (e2 << 2) >> 2] = f2;
            e2 = e2 + 1 | 0;
          } while (e2 >>> 0 < 256);
          return;
        }
        function pe(a2) {
          a2 = a2 | 0;
          xe(a2, 16, 4, 8, 0);
          xe(a2 + 80 | 0, 16, 1, 8, 0);
          xe(a2 + 160 | 0, 32, 2, 8, 0);
          xe(a2 + 240 | 0, 32, 22, 8, 0);
          xe(a2 + 320 | 0, 32, 20, 8, 0);
          return;
        }
        function qe(a2) {
          a2 = a2 | 0;
          mc(a2, 16, 4, 8, 0);
          mc(a2 + 80 | 0, 16, 1, 8, 0);
          mc(a2 + 160 | 0, 32, 2, 8, 0);
          mc(a2 + 240 | 0, 32, 22, 8, 0);
          mc(a2 + 320 | 0, 32, 20, 8, 0);
          return;
        }
        function re(a2) {
          a2 = a2 | 0;
          ye(a2 + 320 | 0);
          ye(a2 + 240 | 0);
          ye(a2 + 160 | 0);
          ye(a2 + 80 | 0);
          ye(a2);
          return;
        }
        function se(a2) {
          a2 = a2 | 0;
          var b2 = 0, d2 = 0;
          b2 = c[a2 + 896 >> 2] | 0;
          if (b2 | 0) {
            Ic(b2);
            jp(b2);
          }
          b2 = c[a2 + 900 >> 2] | 0;
          if (b2 | 0) {
            Ic(b2);
            jp(b2);
          }
          d2 = 0;
          do {
            b2 = c[a2 + 904 + (d2 << 2) >> 2] | 0;
            if (b2 | 0) {
              Ic(b2);
              jp(b2);
            }
            b2 = c[a2 + 1928 + (d2 << 2) >> 2] | 0;
            if (b2 | 0) {
              Ic(b2);
              jp(b2);
            }
            b2 = c[a2 + 2952 + (d2 << 2) >> 2] | 0;
            if (b2 | 0) {
              Ic(b2);
              jp(b2);
            }
            d2 = d2 + 1 | 0;
          } while ((d2 | 0) != 256);
          Ic(a2 + 852 | 0);
          return;
        }
        function te(b2) {
          b2 = b2 | 0;
          var c2 = 0;
          a[b2 >> 0] = 0;
          a[b2 + 1 >> 0] = 0;
          a[b2 + 2 >> 0] = 0;
          a[b2 + 3 >> 0] = 0;
          c2 = b2 + 4 | 0;
          a[c2 >> 0] = 0;
          a[c2 + 1 >> 0] = 0;
          a[c2 + 2 >> 0] = 0;
          a[c2 + 3 >> 0] = 0;
          b2 = b2 + 12 | 0;
          c2 = b2;
          a[c2 >> 0] = 0;
          a[c2 + 1 >> 0] = 0;
          a[c2 + 2 >> 0] = 0;
          a[c2 + 3 >> 0] = 0;
          b2 = b2 + 4 | 0;
          a[b2 >> 0] = 0;
          a[b2 + 1 >> 0] = 0;
          a[b2 + 2 >> 0] = 0;
          a[b2 + 3 >> 0] = 0;
          return;
        }
        function ue(a2) {
          a2 = a2 | 0;
          var b2 = 0;
          b2 = a2 + 384 | 0;
          do {
            ve(a2);
            a2 = a2 + 24 | 0;
          } while ((a2 | 0) != (b2 | 0));
          return;
        }
        function ve(a2) {
          a2 = a2 | 0;
          we(a2);
          return;
        }
        function we(b2) {
          b2 = b2 | 0;
          c[b2 >> 2] = 0;
          c[b2 + 4 >> 2] = 0;
          c[b2 + 8 >> 2] = 0;
          c[b2 + 12 >> 2] = 0;
          c[b2 + 16 >> 2] = 0;
          a[b2 + 20 >> 0] = 1;
          return;
        }
        function xe(a2, b2, d2, e2, f2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          d2 = d2 | 0;
          e2 = e2 | 0;
          f2 = f2 | 0;
          var g2 = 0;
          c[a2 + 4 >> 2] = b2;
          c[a2 + 8 >> 2] = d2;
          c[a2 + 12 >> 2] = e2;
          c[a2 + 16 >> 2] = f2;
          c[a2 + 36 >> 2] = 0;
          c[a2 + 40 >> 2] = 0;
          c[a2 + 44 >> 2] = 0;
          Gc(a2 + 48 | 0);
          c[a2 + 68 >> 2] = 0;
          c[a2 + 72 >> 2] = 0;
          c[a2 + 76 >> 2] = 0;
          do
            if (!f2) {
              d2 = a2 + 20 | 0;
              if ((b2 + -1 | 0) >>> 0 < 31) {
                c[d2 >> 2] = b2;
                f2 = 1 << b2;
                c[a2 + 24 >> 2] = f2;
                d2 = f2 >>> 1;
                c[a2 + 28 >> 2] = 0 - d2;
                d2 = f2 + -1 - d2 | 0;
                break;
              } else {
                c[d2 >> 2] = 32;
                c[a2 + 24 >> 2] = 0;
                c[a2 + 28 >> 2] = -2147483648;
                d2 = 2147483647;
                break;
              }
            } else {
              e2 = a2 + 20 | 0;
              c[e2 >> 2] = 0;
              c[a2 + 24 >> 2] = f2;
              d2 = f2;
              g2 = 0;
              while (1) {
                d2 = d2 >>> 1;
                b2 = g2 + 1 | 0;
                if (!d2)
                  break;
                else
                  g2 = b2;
              }
              c[e2 >> 2] = (1 << g2 | 0) == (f2 | 0) ? g2 : b2;
              d2 = f2 >>> 1;
              c[a2 + 28 >> 2] = 0 - d2;
              d2 = f2 + -1 - d2 | 0;
            }
          while (0);
          c[a2 + 32 >> 2] = d2;
          c[a2 >> 2] = 0;
          return;
        }
        function ye(a2) {
          a2 = a2 | 0;
          var b2 = 0, d2 = 0, e2 = 0, f2 = 0, g2 = 0;
          g2 = a2 + 36 | 0;
          d2 = c[g2 >> 2] | 0;
          e2 = a2 + 40 | 0;
          b2 = c[e2 >> 2] | 0;
          if ((b2 | 0) != (d2 | 0))
            do {
              b2 = b2 + -44 | 0;
              Ic(b2);
            } while ((b2 | 0) != (d2 | 0));
          c[e2 >> 2] = d2;
          e2 = a2 + 68 | 0;
          f2 = c[e2 >> 2] | 0;
          d2 = a2 + 72 | 0;
          b2 = c[d2 >> 2] | 0;
          if ((b2 | 0) != (f2 | 0))
            do {
              b2 = b2 + -44 | 0;
              Ic(b2);
            } while ((b2 | 0) != (f2 | 0));
          c[d2 >> 2] = f2;
          Hc(e2);
          Hc(g2);
          return;
        }
        function ze(a2) {
          a2 = a2 | 0;
          Ae(a2 + 4380 | 0);
          re(a2 + 3980 | 0);
          se(a2);
          return;
        }
        function Ae(a2) {
          a2 = a2 | 0;
          qc(a2 + 320 | 0);
          qc(a2 + 240 | 0);
          qc(a2 + 160 | 0);
          qc(a2 + 80 | 0);
          qc(a2);
          return;
        }
        function Be(f2, g2, h2) {
          f2 = f2 | 0;
          g2 = g2 | 0;
          h2 = h2 | 0;
          var i2 = 0, j2 = 0, k2 = 0, l2 = 0, m2 = 0, n2 = 0, o2 = 0, p2 = 0, q2 = 0;
          p2 = V;
          V = V + 32 | 0;
          o2 = p2;
          i2 = f2 + 4781 | 0;
          if (!(a[i2 >> 0] | 0)) {
            Ce(f2 + 4380 | 0);
            a[i2 >> 0] = 1;
          }
          i2 = f2 + 3976 | 0;
          if (!(a[i2 >> 0] | 0)) {
            a[i2 >> 0] = 1;
            Ee(De(g2) | 0, h2, 20);
            Fe(o2, h2);
            k2 = f2;
            i2 = o2;
            j2 = k2 + 20 | 0;
            do {
              a[k2 >> 0] = a[i2 >> 0] | 0;
              k2 = k2 + 1 | 0;
              i2 = i2 + 1 | 0;
            } while ((k2 | 0) < (j2 | 0));
            b[f2 + 12 >> 1] = 0;
          } else {
            m2 = Zc(g2, f2 + 852 | 0) | 0;
            if (m2) {
              if (m2 & 32 | 0)
                He((Zc(g2, c[f2 + 904 + (((Ge(f2) | 0) & 255) << 2) >> 2] | 0) | 0) & 255, f2);
              n2 = f2 + 14 | 0;
              k2 = a[n2 >> 0] | 0;
              i2 = k2 & 7;
              k2 = (k2 & 255) >>> 3 & 7;
              j2 = d[16 + (k2 << 3) + i2 >> 0] | 0;
              i2 = d[80 + (k2 << 3) + i2 >> 0] | 0;
              if (!(m2 & 16))
                l2 = b[f2 + 20 + (j2 << 1) >> 1] | 0;
              else {
                q2 = f2 + 20 + (j2 << 1) | 0;
                l2 = (pc(f2 + 4380 | 0, g2, e[q2 >> 1] | 0, j2 >>> 0 < 3 ? j2 : 3) | 0) & 65535;
                b[q2 >> 1] = l2;
              }
              b[f2 + 12 >> 1] = l2;
              if (m2 & 8 | 0) {
                q2 = f2 + 15 | 0;
                a[q2 >> 0] = Zc(g2, c[f2 + 1928 + (d[q2 >> 0] << 2) >> 2] | 0) | 0;
              }
              if (m2 & 4 | 0) {
                n2 = Zc(g2, c[f2 + 896 + (((d[n2 >> 0] | 0) >>> 6 & 1) << 2) >> 2] | 0) | 0;
                q2 = f2 + 16 | 0;
                a[q2 >> 0] = Ie(n2 + (a[q2 >> 0] | 0) | 0) | 0;
              }
              if (m2 & 2 | 0) {
                q2 = f2 + 17 | 0;
                a[q2 >> 0] = Zc(g2, c[f2 + 2952 + (d[q2 >> 0] << 2) >> 2] | 0) | 0;
              }
              if (m2 & 1) {
                q2 = f2 + 18 | 0;
                b[q2 >> 1] = pc(f2 + 4460 | 0, g2, e[q2 >> 1] | 0, 0) | 0;
              }
            } else {
              q2 = a[f2 + 14 >> 0] | 0;
              i2 = q2 & 7;
              q2 = (q2 & 255) >>> 3 & 7;
              k2 = q2;
              j2 = d[16 + (q2 << 3) + i2 >> 0] | 0;
              i2 = d[80 + (q2 << 3) + i2 >> 0] | 0;
            }
            l2 = f2 + 52 + (j2 * 24 | 0) | 0;
            m2 = f2 + 4540 | 0;
            n2 = (k2 | 0) == 1 & 1;
            k2 = pc(m2, g2, Je(l2) | 0, n2) | 0;
            c[o2 >> 2] = k2;
            c[f2 >> 2] = (c[f2 >> 2] | 0) + k2;
            Ke(l2, o2);
            l2 = f2 + 436 + (j2 * 24 | 0) | 0;
            k2 = Je(l2) | 0;
            j2 = Le(m2) | 0;
            q2 = f2 + 4620 | 0;
            j2 = pc(q2, g2, k2, (j2 >>> 0 < 20 ? j2 & -2 : 20) | n2) | 0;
            c[o2 >> 2] = j2;
            k2 = f2 + 4 | 0;
            c[k2 >> 2] = (c[k2 >> 2] | 0) + j2;
            Ke(l2, o2);
            o2 = Le(m2) | 0;
            o2 = (Le(q2) | 0) + o2 | 0;
            q2 = f2 + 820 + (i2 << 2) | 0;
            o2 = pc(f2 + 4700 | 0, g2, c[q2 >> 2] | 0, (o2 >>> 0 < 36 ? o2 >>> 1 & 2147483646 : 18) | n2) | 0;
            c[f2 + 8 >> 2] = o2;
            c[q2 >> 2] = o2;
            Me(f2, h2);
          }
          V = p2;
          return h2 + 20 | 0;
        }
        function Ce(a2) {
          a2 = a2 | 0;
          oc(a2);
          oc(a2 + 80 | 0);
          oc(a2 + 160 | 0);
          oc(a2 + 240 | 0);
          oc(a2 + 320 | 0);
          return;
        }
        function De(a2) {
          a2 = a2 | 0;
          return c[a2 >> 2] | 0;
        }
        function Ee(b2, d2, e2) {
          b2 = b2 | 0;
          d2 = d2 | 0;
          e2 = e2 | 0;
          var f2 = 0, g2 = 0, h2 = 0, i2 = 0, j2 = 0, k2 = 0;
          k2 = b2 + 4 | 0;
          f2 = c[k2 >> 2] | 0;
          j2 = (c[b2 + 8 >> 2] | 0) - f2 | 0;
          j2 = j2 >>> 0 > e2 >>> 0 ? e2 : j2;
          i2 = b2 + 12 | 0;
          g2 = (c[i2 >> 2] | 0) + f2 | 0;
          h2 = g2 + j2 | 0;
          if (j2) {
            f2 = g2;
            g2 = d2;
            while (1) {
              a[g2 >> 0] = a[f2 >> 0] | 0;
              f2 = f2 + 1 | 0;
              if ((f2 | 0) == (h2 | 0))
                break;
              else
                g2 = g2 + 1 | 0;
            }
            f2 = c[k2 >> 2] | 0;
          }
          c[k2 >> 2] = f2 + j2;
          e2 = e2 - j2 | 0;
          if (e2 | 0) {
            Kc(b2);
            g2 = (c[i2 >> 2] | 0) + (c[k2 >> 2] | 0) | 0;
            h2 = g2 + e2 | 0;
            f2 = d2 + j2 | 0;
            while (1) {
              a[f2 >> 0] = a[g2 >> 0] | 0;
              g2 = g2 + 1 | 0;
              if ((g2 | 0) == (h2 | 0))
                break;
              else
                f2 = f2 + 1 | 0;
            }
            c[k2 >> 2] = (c[k2 >> 2] | 0) + e2;
          }
          return;
        }
        function Fe(d2, e2) {
          d2 = d2 | 0;
          e2 = e2 | 0;
          te(d2);
          c[d2 >> 2] = Ne(e2) | 0;
          c[d2 + 4 >> 2] = Ne(e2 + 4 | 0) | 0;
          c[d2 + 8 >> 2] = Ne(e2 + 8 | 0) | 0;
          b[d2 + 12 >> 1] = Oe(e2 + 12 | 0) | 0;
          He(Pe(e2 + 14 | 0) | 0, d2);
          a[d2 + 15 >> 0] = Pe(e2 + 15 | 0) | 0;
          a[d2 + 16 >> 0] = Qe(e2 + 16 | 0) | 0;
          a[d2 + 17 >> 0] = Qe(e2 + 17 | 0) | 0;
          b[d2 + 18 >> 1] = Oe(e2 + 18 | 0) | 0;
          return;
        }
        function Ge(b2) {
          b2 = b2 | 0;
          return a[b2 + 14 >> 0] | 0;
        }
        function He(b2, c2) {
          b2 = b2 | 0;
          c2 = c2 | 0;
          a[c2 + 14 >> 0] = b2;
          return;
        }
        function Ie(a2) {
          a2 = a2 | 0;
          return a2 & 255 | 0;
        }
        function Je(a2) {
          a2 = a2 | 0;
          return c[a2 + 8 >> 2] | 0;
        }
        function Ke(b2, d2) {
          b2 = b2 | 0;
          d2 = d2 | 0;
          var e2 = 0, f2 = 0, g2 = 0, h2 = 0, i2 = 0, j2 = 0, k2 = 0;
          k2 = b2 + 20 | 0;
          do
            if (!(a[k2 >> 0] | 0)) {
              j2 = b2 + 8 | 0;
              e2 = c[j2 >> 2] | 0;
              f2 = c[d2 >> 2] | 0;
              g2 = b2 + 4 | 0;
              h2 = c[g2 >> 2] | 0;
              if ((e2 | 0) >= (f2 | 0)) {
                if ((h2 | 0) < (f2 | 0)) {
                  c[b2 >> 2] = h2;
                  c[g2 >> 2] = c[d2 >> 2];
                } else
                  c[b2 >> 2] = f2;
                a[k2 >> 0] = 1;
                break;
              }
              c[b2 >> 2] = h2;
              c[g2 >> 2] = e2;
              g2 = b2 + 16 | 0;
              h2 = c[g2 >> 2] | 0;
              i2 = c[d2 >> 2] | 0;
              e2 = b2 + 12 | 0;
              f2 = c[e2 >> 2] | 0;
              if ((h2 | 0) < (i2 | 0)) {
                c[j2 >> 2] = f2;
                c[e2 >> 2] = h2;
                c[g2 >> 2] = c[d2 >> 2];
                break;
              }
              if ((f2 | 0) < (i2 | 0)) {
                c[j2 >> 2] = f2;
                c[e2 >> 2] = c[d2 >> 2];
                break;
              } else {
                c[j2 >> 2] = i2;
                break;
              }
            } else {
              g2 = c[d2 >> 2] | 0;
              i2 = b2 + 8 | 0;
              e2 = c[i2 >> 2] | 0;
              h2 = b2 + 12 | 0;
              f2 = c[h2 >> 2] | 0;
              if ((g2 | 0) >= (e2 | 0)) {
                e2 = b2 + 16 | 0;
                if ((g2 | 0) < (f2 | 0)) {
                  c[e2 >> 2] = f2;
                  c[h2 >> 2] = c[d2 >> 2];
                } else
                  c[e2 >> 2] = g2;
                a[k2 >> 0] = 0;
                break;
              }
              c[b2 + 16 >> 2] = f2;
              c[h2 >> 2] = e2;
              e2 = c[d2 >> 2] | 0;
              f2 = c[b2 >> 2] | 0;
              g2 = b2 + 4 | 0;
              h2 = c[g2 >> 2] | 0;
              if ((e2 | 0) < (f2 | 0)) {
                c[i2 >> 2] = h2;
                c[g2 >> 2] = f2;
                c[b2 >> 2] = c[d2 >> 2];
                break;
              }
              if ((e2 | 0) < (h2 | 0)) {
                c[i2 >> 2] = h2;
                c[g2 >> 2] = c[d2 >> 2];
                break;
              } else {
                c[i2 >> 2] = e2;
                break;
              }
            }
          while (0);
          return;
        }
        function Le(a2) {
          a2 = a2 | 0;
          return c[a2 >> 2] | 0;
        }
        function Me(b2, c2) {
          b2 = b2 | 0;
          c2 = c2 | 0;
          var e2 = 0;
          Se(d[b2 >> 0] | d[b2 + 1 >> 0] << 8 | d[b2 + 2 >> 0] << 16 | d[b2 + 3 >> 0] << 24, c2);
          e2 = b2 + 4 | 0;
          Se(
            d[e2 >> 0] | d[e2 + 1 >> 0] << 8 | d[e2 + 2 >> 0] << 16 | d[e2 + 3 >> 0] << 24,
            c2 + 4 | 0
          );
          e2 = b2 + 8 | 0;
          Se(
            d[e2 >> 0] | d[e2 + 1 >> 0] << 8 | d[e2 + 2 >> 0] << 16 | d[e2 + 3 >> 0] << 24,
            c2 + 8 | 0
          );
          e2 = b2 + 12 | 0;
          Te(d[e2 >> 0] | d[e2 + 1 >> 0] << 8, c2 + 12 | 0);
          Ue(Ge(b2) | 0, c2 + 14 | 0);
          Ue(a[b2 + 15 >> 0] | 0, c2 + 15 | 0);
          Ve(a[b2 + 16 >> 0] | 0, c2 + 16 | 0);
          Ve(a[b2 + 17 >> 0] | 0, c2 + 17 | 0);
          b2 = b2 + 18 | 0;
          Te(d[b2 >> 0] | d[b2 + 1 >> 0] << 8, c2 + 18 | 0);
          return;
        }
        function Ne(a2) {
          a2 = a2 | 0;
          return Re(a2) | 0;
        }
        function Oe(b2) {
          b2 = b2 | 0;
          return (a[b2 + 1 >> 0] << 8 | d[b2 >> 0]) & 65535 | 0;
        }
        function Pe(b2) {
          b2 = b2 | 0;
          return a[b2 >> 0] | 0;
        }
        function Qe(b2) {
          b2 = b2 | 0;
          return a[b2 >> 0] | 0;
        }
        function Re(a2) {
          a2 = a2 | 0;
          return (d[a2 + 1 >> 0] | 0) << 8 | (d[a2 >> 0] | 0) | (d[a2 + 2 >> 0] | 0) << 16 | (d[a2 + 3 >> 0] | 0) << 24 | 0;
        }
        function Se(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          We(a2, b2);
          return;
        }
        function Te(b2, c2) {
          b2 = b2 | 0;
          c2 = c2 | 0;
          a[c2 + 1 >> 0] = (b2 & 65535) >>> 8;
          a[c2 >> 0] = b2;
          return;
        }
        function Ue(b2, c2) {
          b2 = b2 | 0;
          c2 = c2 | 0;
          a[c2 >> 0] = b2;
          return;
        }
        function Ve(b2, c2) {
          b2 = b2 | 0;
          c2 = c2 | 0;
          a[c2 >> 0] = b2;
          return;
        }
        function We(b2, c2) {
          b2 = b2 | 0;
          c2 = c2 | 0;
          a[c2 + 3 >> 0] = b2 >>> 24;
          a[c2 + 2 >> 0] = b2 >>> 16;
          a[c2 + 1 >> 0] = b2 >>> 8;
          a[c2 >> 0] = b2;
          return;
        }
        function Xe(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          return;
        }
        function Ye(a2) {
          a2 = a2 | 0;
          pq(a2);
          jp(a2);
          return;
        }
        function Ze(a2) {
          a2 = a2 | 0;
          a2 = c[a2 + 12 >> 2] | 0;
          if (a2 | 0)
            ca[c[(c[a2 >> 2] | 0) + 4 >> 2] & 255](a2);
          return;
        }
        function _e(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          return ((c[b2 + 4 >> 2] | 0) == 9202 ? a2 + 12 | 0 : 0) | 0;
        }
        function $e(a2) {
          a2 = a2 | 0;
          Da(a2, 16);
          return;
        }
        function af(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          fe(a2);
          c[a2 >> 2] = 4768;
          c[a2 + 4 >> 2] = b2;
          cf(a2 + 8 | 0);
          return;
        }
        function bf(a2, b2, d2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          d2 = d2 | 0;
          var e2 = 0, f2 = 0;
          d2 = V;
          V = V + 16 | 0;
          e2 = d2;
          c[a2 >> 2] = b2;
          f2 = eq(16) | 0;
          c[f2 + 4 >> 2] = 0;
          c[f2 + 8 >> 2] = 0;
          c[f2 >> 2] = 4792;
          c[f2 + 12 >> 2] = b2;
          c[a2 + 4 >> 2] = f2;
          c[e2 >> 2] = b2;
          c[e2 + 4 >> 2] = b2;
          Xe(a2, e2);
          V = d2;
          return;
        }
        function cf(b2) {
          b2 = b2 | 0;
          gf(b2);
          hf(b2 + 164 | 0);
          jf(b2 + 244 | 0);
          a[b2 + 324 >> 0] = 0;
          a[b2 + 325 >> 0] = 0;
          return;
        }
        function df(a2) {
          a2 = a2 | 0;
          c[a2 >> 2] = 4768;
          of(a2 + 8 | 0);
          le(a2);
          return;
        }
        function ef(a2) {
          a2 = a2 | 0;
          df(a2);
          jp(a2);
          return;
        }
        function ff(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          return qf(a2 + 8 | 0, c[a2 + 4 >> 2] | 0, b2) | 0;
        }
        function gf(b2) {
          b2 = b2 | 0;
          var d2 = 0, e2 = 0, f2 = 0, g2 = 0, h2 = 0, i2 = 0, j2 = 0;
          h2 = V;
          V = V + 16 | 0;
          f2 = h2;
          a[b2 >> 0] = 0;
          Oc(b2 + 4 | 0, 516, 0, 0);
          Oc(b2 + 48 | 0, 6, 0, 0);
          c[b2 + 92 >> 2] = 0;
          c[b2 + 96 >> 2] = 0;
          e2 = b2 + 100 | 0;
          mf(e2);
          nf(f2);
          g2 = c[f2 >> 2] | 0;
          f2 = c[f2 + 4 >> 2] | 0;
          d2 = 4;
          while (1) {
            i2 = e2;
            j2 = i2;
            a[j2 >> 0] = g2;
            a[j2 + 1 >> 0] = g2 >> 8;
            a[j2 + 2 >> 0] = g2 >> 16;
            a[j2 + 3 >> 0] = g2 >> 24;
            i2 = i2 + 4 | 0;
            a[i2 >> 0] = f2;
            a[i2 + 1 >> 0] = f2 >> 8;
            a[i2 + 2 >> 0] = f2 >> 16;
            a[i2 + 3 >> 0] = f2 >> 24;
            d2 = d2 + -1 | 0;
            if (!d2)
              break;
            else
              e2 = e2 + 8 | 0;
          }
          j2 = b2 + 132 | 0;
          c[j2 >> 2] = 0;
          c[j2 + 4 >> 2] = 0;
          c[j2 + 8 >> 2] = 0;
          c[j2 + 12 >> 2] = 0;
          c[j2 + 16 >> 2] = 0;
          c[j2 + 20 >> 2] = 0;
          c[j2 + 24 >> 2] = 0;
          c[j2 + 28 >> 2] = 0;
          V = h2;
          return;
        }
        function hf(a2) {
          a2 = a2 | 0;
          xe(a2, 32, 9, 8, 0);
          return;
        }
        function jf(a2) {
          a2 = a2 | 0;
          mc(a2, 32, 9, 8, 0);
          return;
        }
        function kf(a2) {
          a2 = a2 | 0;
          ye(a2);
          return;
        }
        function lf(a2) {
          a2 = a2 | 0;
          Ic(a2 + 48 | 0);
          Ic(a2 + 4 | 0);
          return;
        }
        function mf(a2) {
          a2 = a2 | 0;
          var b2 = 0;
          b2 = a2 + 32 | 0;
          do {
            nf(a2);
            a2 = a2 + 8 | 0;
          } while ((a2 | 0) != (b2 | 0));
          return;
        }
        function nf(b2) {
          b2 = b2 | 0;
          var c2 = 0;
          c2 = b2;
          a[c2 >> 0] = 0;
          a[c2 + 1 >> 0] = 0;
          a[c2 + 2 >> 0] = 0;
          a[c2 + 3 >> 0] = 0;
          b2 = b2 + 4 | 0;
          a[b2 >> 0] = 0;
          a[b2 + 1 >> 0] = 0;
          a[b2 + 2 >> 0] = 0;
          a[b2 + 3 >> 0] = 0;
          return;
        }
        function of(a2) {
          a2 = a2 | 0;
          pf(a2 + 244 | 0);
          kf(a2 + 164 | 0);
          lf(a2);
          return;
        }
        function pf(a2) {
          a2 = a2 | 0;
          qc(a2);
          return;
        }
        function qf(b2, e2, f2) {
          b2 = b2 | 0;
          e2 = e2 | 0;
          f2 = f2 | 0;
          var g2 = 0, h2 = 0, i2 = 0, j2 = 0, k2 = 0;
          g2 = b2 + 325 | 0;
          if (!(a[g2 >> 0] | 0)) {
            rf(b2 + 244 | 0);
            a[g2 >> 0] = 1;
          }
          if (!(a[b2 >> 0] | 0)) {
            a[b2 >> 0] = 1;
            Ee(De(e2) | 0, f2, 8);
            i2 = sf(f2) | 0;
            j2 = u() | 0;
            b2 = b2 + 100 | 0;
            e2 = b2;
            a[e2 >> 0] = i2;
            a[e2 + 1 >> 0] = i2 >> 8;
            a[e2 + 2 >> 0] = i2 >> 16;
            a[e2 + 3 >> 0] = i2 >> 24;
            b2 = b2 + 4 | 0;
            a[b2 >> 0] = j2;
            a[b2 + 1 >> 0] = j2 >> 8;
            a[b2 + 2 >> 0] = j2 >> 16;
            a[b2 + 3 >> 0] = j2 >> 24;
          } else {
            j2 = b2 + 92 | 0;
            a:
              do
                if (!(c[b2 + 132 + (c[j2 >> 2] << 2) >> 2] | 0)) {
                  g2 = Zc(e2, b2 + 48 | 0) | 0;
                  switch (g2 | 0) {
                    case 1: {
                      e2 = pc(b2 + 244 | 0, e2, 0, 0) | 0;
                      c[b2 + 132 + (c[j2 >> 2] << 2) >> 2] = e2;
                      e2 = c[j2 >> 2] | 0;
                      k2 = c[b2 + 132 + (e2 << 2) >> 2] | 0;
                      i2 = b2 + 100 + (e2 << 3) | 0;
                      h2 = i2;
                      g2 = h2;
                      h2 = h2 + 4 | 0;
                      k2 = lr(
                        d[g2 >> 0] | d[g2 + 1 >> 0] << 8 | d[g2 + 2 >> 0] << 16 | d[g2 + 3 >> 0] << 24 | 0,
                        d[h2 >> 0] | d[h2 + 1 >> 0] << 8 | d[h2 + 2 >> 0] << 16 | d[h2 + 3 >> 0] << 24 | 0,
                        k2 | 0,
                        ((k2 | 0) < 0) << 31 >> 31 | 0
                      ) | 0;
                      h2 = u() | 0;
                      g2 = i2;
                      a[g2 >> 0] = k2;
                      a[g2 + 1 >> 0] = k2 >> 8;
                      a[g2 + 2 >> 0] = k2 >> 16;
                      a[g2 + 3 >> 0] = k2 >> 24;
                      i2 = i2 + 4 | 0;
                      a[i2 >> 0] = h2;
                      a[i2 + 1 >> 0] = h2 >> 8;
                      a[i2 + 2 >> 0] = h2 >> 16;
                      a[i2 + 3 >> 0] = h2 >> 24;
                      c[b2 + 148 + (e2 << 2) >> 2] = 0;
                      break a;
                    }
                    case 2: {
                      k2 = b2 + 96 | 0;
                      c[k2 >> 2] = (c[k2 >> 2] | 0) + 1 & 3;
                      i2 = b2 + 100 + (c[j2 >> 2] << 3) + 4 | 0;
                      i2 = pc(
                        b2 + 244 | 0,
                        e2,
                        d[i2 >> 0] | d[i2 + 1 >> 0] << 8 | d[i2 + 2 >> 0] << 16 | d[i2 + 3 >> 0] << 24,
                        8
                      ) | 0;
                      g2 = b2 + 100 + (c[k2 >> 2] << 3) | 0;
                      h2 = g2;
                      a[h2 >> 0] = 0;
                      a[h2 + 1 >> 0] = 0;
                      a[h2 + 2 >> 0] = 0;
                      a[h2 + 3 >> 0] = 0;
                      g2 = g2 + 4 | 0;
                      a[g2 >> 0] = i2;
                      a[g2 + 1 >> 0] = i2 >> 8;
                      a[g2 + 2 >> 0] = i2 >> 16;
                      a[g2 + 3 >> 0] = i2 >> 24;
                      g2 = tf(e2) | 0;
                      k2 = c[k2 >> 2] | 0;
                      e2 = b2 + 100 + (k2 << 3) | 0;
                      i2 = e2;
                      h2 = i2;
                      i2 = i2 + 4 | 0;
                      i2 = d[i2 >> 0] | d[i2 + 1 >> 0] << 8 | d[i2 + 2 >> 0] << 16 | d[i2 + 3 >> 0] << 24;
                      g2 = d[h2 >> 0] | d[h2 + 1 >> 0] << 8 | d[h2 + 2 >> 0] << 16 | d[h2 + 3 >> 0] << 24 | g2;
                      h2 = e2;
                      a[h2 >> 0] = g2;
                      a[h2 + 1 >> 0] = g2 >> 8;
                      a[h2 + 2 >> 0] = g2 >> 16;
                      a[h2 + 3 >> 0] = g2 >> 24;
                      e2 = e2 + 4 | 0;
                      a[e2 >> 0] = i2;
                      a[e2 + 1 >> 0] = i2 >> 8;
                      a[e2 + 2 >> 0] = i2 >> 16;
                      a[e2 + 3 >> 0] = i2 >> 24;
                      c[j2 >> 2] = k2;
                      c[b2 + 132 + (k2 << 2) >> 2] = 0;
                      c[b2 + 148 + (c[j2 >> 2] << 2) >> 2] = 0;
                      break a;
                    }
                    default: {
                      if ((g2 | 0) <= 2)
                        break a;
                      c[j2 >> 2] = g2 + 2 + (c[j2 >> 2] | 0) & 3;
                      qf(b2, e2, f2) | 0;
                      break a;
                    }
                  }
                } else {
                  i2 = Zc(e2, b2 + 4 | 0) | 0;
                  if ((i2 | 0) == 1) {
                    g2 = pc(b2 + 244 | 0, e2, c[b2 + 132 + (c[j2 >> 2] << 2) >> 2] | 0, 1) | 0;
                    k2 = c[j2 >> 2] | 0;
                    e2 = b2 + 100 + (k2 << 3) | 0;
                    i2 = e2;
                    h2 = i2;
                    i2 = i2 + 4 | 0;
                    g2 = lr(
                      d[h2 >> 0] | d[h2 + 1 >> 0] << 8 | d[h2 + 2 >> 0] << 16 | d[h2 + 3 >> 0] << 24 | 0,
                      d[i2 >> 0] | d[i2 + 1 >> 0] << 8 | d[i2 + 2 >> 0] << 16 | d[i2 + 3 >> 0] << 24 | 0,
                      g2 | 0,
                      ((g2 | 0) < 0) << 31 >> 31 | 0
                    ) | 0;
                    i2 = u() | 0;
                    h2 = e2;
                    a[h2 >> 0] = g2;
                    a[h2 + 1 >> 0] = g2 >> 8;
                    a[h2 + 2 >> 0] = g2 >> 16;
                    a[h2 + 3 >> 0] = g2 >> 24;
                    e2 = e2 + 4 | 0;
                    a[e2 >> 0] = i2;
                    a[e2 + 1 >> 0] = i2 >> 8;
                    a[e2 + 2 >> 0] = i2 >> 16;
                    a[e2 + 3 >> 0] = i2 >> 24;
                    c[b2 + 148 + (k2 << 2) >> 2] = 0;
                    break;
                  }
                  if ((i2 | 0) >= 511) {
                    if ((i2 | 0) == 512) {
                      k2 = b2 + 96 | 0;
                      c[k2 >> 2] = (c[k2 >> 2] | 0) + 1 & 3;
                      i2 = b2 + 100 + (c[j2 >> 2] << 3) + 4 | 0;
                      i2 = pc(
                        b2 + 244 | 0,
                        e2,
                        d[i2 >> 0] | d[i2 + 1 >> 0] << 8 | d[i2 + 2 >> 0] << 16 | d[i2 + 3 >> 0] << 24,
                        8
                      ) | 0;
                      g2 = b2 + 100 + (c[k2 >> 2] << 3) | 0;
                      h2 = g2;
                      a[h2 >> 0] = 0;
                      a[h2 + 1 >> 0] = 0;
                      a[h2 + 2 >> 0] = 0;
                      a[h2 + 3 >> 0] = 0;
                      g2 = g2 + 4 | 0;
                      a[g2 >> 0] = i2;
                      a[g2 + 1 >> 0] = i2 >> 8;
                      a[g2 + 2 >> 0] = i2 >> 16;
                      a[g2 + 3 >> 0] = i2 >> 24;
                      g2 = tf(e2) | 0;
                      k2 = c[k2 >> 2] | 0;
                      e2 = b2 + 100 + (k2 << 3) | 0;
                      i2 = e2;
                      h2 = i2;
                      i2 = i2 + 4 | 0;
                      i2 = d[i2 >> 0] | d[i2 + 1 >> 0] << 8 | d[i2 + 2 >> 0] << 16 | d[i2 + 3 >> 0] << 24;
                      g2 = d[h2 >> 0] | d[h2 + 1 >> 0] << 8 | d[h2 + 2 >> 0] << 16 | d[h2 + 3 >> 0] << 24 | g2;
                      h2 = e2;
                      a[h2 >> 0] = g2;
                      a[h2 + 1 >> 0] = g2 >> 8;
                      a[h2 + 2 >> 0] = g2 >> 16;
                      a[h2 + 3 >> 0] = g2 >> 24;
                      e2 = e2 + 4 | 0;
                      a[e2 >> 0] = i2;
                      a[e2 + 1 >> 0] = i2 >> 8;
                      a[e2 + 2 >> 0] = i2 >> 16;
                      a[e2 + 3 >> 0] = i2 >> 24;
                      c[j2 >> 2] = k2;
                      c[b2 + 132 + (k2 << 2) >> 2] = 0;
                      c[b2 + 148 + (c[j2 >> 2] << 2) >> 2] = 0;
                      break;
                    }
                    if ((i2 | 0) <= 511)
                      break;
                    c[j2 >> 2] = (c[j2 >> 2] | 0) + i2 & 3;
                    qf(b2, e2, f2) | 0;
                    break;
                  }
                  do
                    if (!i2) {
                      g2 = pc(b2 + 244 | 0, e2, 0, 7) | 0;
                      h2 = b2 + 148 + (c[j2 >> 2] << 2) | 0;
                      c[h2 >> 2] = (c[h2 >> 2] | 0) + 1;
                      h2 = c[j2 >> 2] | 0;
                      if ((c[b2 + 148 + (h2 << 2) >> 2] | 0) > 3) {
                        c[b2 + 132 + (h2 << 2) >> 2] = g2;
                        c[b2 + 148 + (c[j2 >> 2] << 2) >> 2] = 0;
                      }
                    } else {
                      if ((i2 | 0) < 500) {
                        g2 = b2 + 244 | 0;
                        h2 = q(c[b2 + 132 + (c[j2 >> 2] << 2) >> 2] | 0, i2) | 0;
                        if ((i2 | 0) < 10) {
                          g2 = pc(g2, e2, h2, 2) | 0;
                          break;
                        } else {
                          g2 = pc(g2, e2, h2, 3) | 0;
                          break;
                        }
                      }
                      if ((i2 | 0) == 500) {
                        g2 = pc(
                          b2 + 244 | 0,
                          e2,
                          (c[b2 + 132 + (c[j2 >> 2] << 2) >> 2] | 0) * 500 | 0,
                          4
                        ) | 0;
                        h2 = b2 + 148 + (c[j2 >> 2] << 2) | 0;
                        c[h2 >> 2] = (c[h2 >> 2] | 0) + 1;
                        h2 = c[j2 >> 2] | 0;
                        if ((c[b2 + 148 + (h2 << 2) >> 2] | 0) <= 3)
                          break;
                        c[b2 + 132 + (h2 << 2) >> 2] = g2;
                        c[b2 + 148 + (c[j2 >> 2] << 2) >> 2] = 0;
                        break;
                      }
                      g2 = 500 - i2 | 0;
                      h2 = b2 + 244 | 0;
                      i2 = c[b2 + 132 + (c[j2 >> 2] << 2) >> 2] | 0;
                      if ((g2 | 0) > -10) {
                        g2 = pc(h2, e2, q(i2, g2) | 0, 5) | 0;
                        break;
                      }
                      g2 = pc(h2, e2, q(i2, -10) | 0, 6) | 0;
                      h2 = b2 + 148 + (c[j2 >> 2] << 2) | 0;
                      c[h2 >> 2] = (c[h2 >> 2] | 0) + 1;
                      h2 = c[j2 >> 2] | 0;
                      if ((c[b2 + 148 + (h2 << 2) >> 2] | 0) > 3) {
                        c[b2 + 132 + (h2 << 2) >> 2] = g2;
                        c[b2 + 148 + (c[j2 >> 2] << 2) >> 2] = 0;
                      }
                    }
                  while (0);
                  k2 = b2 + 100 + (c[j2 >> 2] << 3) | 0;
                  h2 = k2;
                  e2 = h2;
                  h2 = h2 + 4 | 0;
                  h2 = lr(
                    d[e2 >> 0] | d[e2 + 1 >> 0] << 8 | d[e2 + 2 >> 0] << 16 | d[e2 + 3 >> 0] << 24 | 0,
                    d[h2 >> 0] | d[h2 + 1 >> 0] << 8 | d[h2 + 2 >> 0] << 16 | d[h2 + 3 >> 0] << 24 | 0,
                    g2 | 0,
                    ((g2 | 0) < 0) << 31 >> 31 | 0
                  ) | 0;
                  e2 = u() | 0;
                  i2 = k2;
                  a[i2 >> 0] = h2;
                  a[i2 + 1 >> 0] = h2 >> 8;
                  a[i2 + 2 >> 0] = h2 >> 16;
                  a[i2 + 3 >> 0] = h2 >> 24;
                  k2 = k2 + 4 | 0;
                  a[k2 >> 0] = e2;
                  a[k2 + 1 >> 0] = e2 >> 8;
                  a[k2 + 2 >> 0] = e2 >> 16;
                  a[k2 + 3 >> 0] = e2 >> 24;
                }
              while (0);
            uf(b2 + 100 + (c[j2 >> 2] << 3) | 0, f2);
          }
          return f2 + 8 | 0;
        }
        function rf(a2) {
          a2 = a2 | 0;
          oc(a2);
          return;
        }
        function sf(a2) {
          a2 = a2 | 0;
          var b2 = 0, d2 = 0, e2 = 0;
          b2 = V;
          V = V + 16 | 0;
          d2 = b2;
          e2 = Re(a2) | 0;
          vf(d2, e2, Re(a2 + 4 | 0) | 0);
          a2 = c[d2 >> 2] | 0;
          t(c[d2 + 4 >> 2] | 0);
          V = b2;
          return a2 | 0;
        }
        function tf(a2) {
          a2 = a2 | 0;
          var b2 = 0;
          b2 = (bd(a2) | 0) & 65535;
          return ((bd(a2) | 0) & 65535) << 16 | b2 | 0;
        }
        function uf(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          var c2 = 0;
          c2 = a2;
          We(d[c2 >> 0] | d[c2 + 1 >> 0] << 8 | d[c2 + 2 >> 0] << 16 | d[c2 + 3 >> 0] << 24, b2);
          a2 = a2 + 4 | 0;
          We(
            d[a2 >> 0] | d[a2 + 1 >> 0] << 8 | d[a2 + 2 >> 0] << 16 | d[a2 + 3 >> 0] << 24,
            b2 + 4 | 0
          );
          return;
        }
        function vf(b2, c2, d2) {
          b2 = b2 | 0;
          c2 = c2 | 0;
          d2 = d2 | 0;
          var e2 = 0;
          e2 = b2;
          a[e2 >> 0] = c2;
          a[e2 + 1 >> 0] = c2 >> 8;
          a[e2 + 2 >> 0] = c2 >> 16;
          a[e2 + 3 >> 0] = c2 >> 24;
          c2 = b2 + 4 | 0;
          a[c2 >> 0] = d2;
          a[c2 + 1 >> 0] = d2 >> 8;
          a[c2 + 2 >> 0] = d2 >> 16;
          a[c2 + 3 >> 0] = d2 >> 24;
          return;
        }
        function wf(a2) {
          a2 = a2 | 0;
          pq(a2);
          jp(a2);
          return;
        }
        function xf(a2) {
          a2 = a2 | 0;
          a2 = c[a2 + 12 >> 2] | 0;
          if (a2 | 0)
            ca[c[(c[a2 >> 2] | 0) + 4 >> 2] & 255](a2);
          return;
        }
        function yf(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          return ((c[b2 + 4 >> 2] | 0) == 9890 ? a2 + 12 | 0 : 0) | 0;
        }
        function zf(a2) {
          a2 = a2 | 0;
          Da(a2, 16);
          return;
        }
        function Af(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          fe(a2);
          c[a2 >> 2] = 4820;
          c[a2 + 4 >> 2] = b2;
          Cf(a2 + 8 | 0);
          return;
        }
        function Bf(a2, b2, d2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          d2 = d2 | 0;
          var e2 = 0, f2 = 0;
          d2 = V;
          V = V + 16 | 0;
          e2 = d2;
          c[a2 >> 2] = b2;
          f2 = eq(16) | 0;
          c[f2 + 4 >> 2] = 0;
          c[f2 + 8 >> 2] = 0;
          c[f2 >> 2] = 4844;
          c[f2 + 12 >> 2] = b2;
          c[a2 + 4 >> 2] = f2;
          c[e2 >> 2] = b2;
          c[e2 + 4 >> 2] = b2;
          Xe(a2, e2);
          V = d2;
          return;
        }
        function Cf(b2) {
          b2 = b2 | 0;
          a[b2 >> 0] = 0;
          Gf(b2 + 1 | 0);
          Oc(b2 + 8 | 0, 128, 0, 0);
          Oc(b2 + 52 | 0, 256, 0, 0);
          Oc(b2 + 96 | 0, 256, 0, 0);
          Oc(b2 + 140 | 0, 256, 0, 0);
          Oc(b2 + 184 | 0, 256, 0, 0);
          Oc(b2 + 228 | 0, 256, 0, 0);
          Oc(b2 + 272 | 0, 256, 0, 0);
          return;
        }
        function Df(a2) {
          a2 = a2 | 0;
          c[a2 >> 2] = 4820;
          Hf(a2 + 8 | 0);
          le(a2);
          return;
        }
        function Ef(a2) {
          a2 = a2 | 0;
          Df(a2);
          jp(a2);
          return;
        }
        function Ff(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          return If(a2 + 8 | 0, c[a2 + 4 >> 2] | 0, b2) | 0;
        }
        function Gf(b2) {
          b2 = b2 | 0;
          var c2 = 0;
          a[b2 >> 0] = 0;
          a[b2 + 1 >> 0] = 0;
          c2 = b2 + 2 | 0;
          a[c2 >> 0] = 0;
          a[c2 + 1 >> 0] = 0;
          b2 = b2 + 4 | 0;
          a[b2 >> 0] = 0;
          a[b2 + 1 >> 0] = 0;
          return;
        }
        function Hf(a2) {
          a2 = a2 | 0;
          Ic(a2 + 272 | 0);
          Ic(a2 + 228 | 0);
          Ic(a2 + 184 | 0);
          Ic(a2 + 140 | 0);
          Ic(a2 + 96 | 0);
          Ic(a2 + 52 | 0);
          Ic(a2 + 8 | 0);
          return;
        }
        function If(c2, f2, g2) {
          c2 = c2 | 0;
          f2 = f2 | 0;
          g2 = g2 | 0;
          var h2 = 0, i2 = 0, j2 = 0, k2 = 0, l2 = 0, m2 = 0, n2 = 0, o2 = 0, p2 = 0;
          o2 = V;
          V = V + 16 | 0;
          m2 = o2;
          if (!(a[c2 >> 0] | 0)) {
            a[c2 >> 0] = 1;
            Ee(De(f2) | 0, g2, 6);
            Jf(m2, g2);
            n2 = c2 + 1 | 0;
            a[n2 >> 0] = a[m2 >> 0] | 0;
            a[n2 + 1 >> 0] = a[m2 + 1 >> 0] | 0;
            a[n2 + 2 >> 0] = a[m2 + 2 >> 0] | 0;
            a[n2 + 3 >> 0] = a[m2 + 3 >> 0] | 0;
            a[n2 + 4 >> 0] = a[m2 + 4 >> 0] | 0;
            a[n2 + 5 >> 0] = a[m2 + 5 >> 0] | 0;
          } else {
            n2 = Zc(f2, c2 + 8 | 0) | 0;
            Gf(m2);
            if (!(n2 & 1)) {
              h2 = c2 + 1 | 0;
              h2 = (d[h2 >> 0] | d[h2 + 1 >> 0] << 8) & 255;
            } else {
              l2 = (Zc(f2, c2 + 52 | 0) | 0) & 255;
              h2 = c2 + 1 | 0;
              h2 = (Ie(l2 + ((d[h2 >> 0] | d[h2 + 1 >> 0] << 8) & 255) | 0) | 0) & 255;
            }
            b[m2 >> 1] = h2;
            if (!(n2 & 2)) {
              l2 = c2 + 1 | 0;
              h2 = h2 | (d[l2 >> 0] | d[l2 + 1 >> 0] << 8) & -256;
            } else {
              h2 = (Zc(f2, c2 + 96 | 0) | 0) & 255;
              l2 = c2 + 1 | 0;
              h2 = ((Ie((((d[l2 >> 0] | d[l2 + 1 >> 0] << 8) & 65535) >>> 8) + h2 | 0) | 0) & 255) << 8;
              h2 = (h2 | e[m2 >> 1]) & 65535;
            }
            b[m2 >> 1] = h2;
            do
              if (n2 & 64) {
                k2 = c2 + 1 | 0;
                i2 = (h2 & 255) - ((d[k2 >> 0] | d[k2 + 1 >> 0] << 8) & 255) | 0;
                if (!(n2 & 4)) {
                  h2 = c2 + 3 | 0;
                  h2 = (d[h2 >> 0] | d[h2 + 1 >> 0] << 8) & 255;
                } else {
                  h2 = (Zc(f2, c2 + 140 | 0) | 0) & 255;
                  l2 = c2 + 3 | 0;
                  l2 = i2 + ((d[l2 >> 0] | d[l2 + 1 >> 0] << 8) & 255) | 0;
                  h2 = (Ie(((l2 | 0) < 1 ? 0 : (l2 | 0) > 254 ? 255 : l2 & 255) + h2 | 0) | 0) & 255;
                }
                l2 = m2 + 2 | 0;
                b[l2 >> 1] = h2;
                if (!(n2 & 16)) {
                  h2 = c2 + 5 | 0;
                  h2 = (d[h2 >> 0] | d[h2 + 1 >> 0] << 8) & 255;
                } else {
                  h2 = Zc(f2, c2 + 228 | 0) | 0;
                  p2 = c2 + 3 | 0;
                  j2 = c2 + 5 | 0;
                  j2 = ((i2 + (b[l2 >> 1] & 255) - ((d[p2 >> 0] | d[p2 + 1 >> 0] << 8) & 255) | 0) / 2 | 0) + ((d[j2 >> 0] | d[j2 + 1 >> 0] << 8) & 255) | 0;
                  h2 = (Ie(((j2 | 0) < 1 ? 0 : (j2 | 0) > 254 ? 255 : j2 & 255) + (h2 & 255) | 0) | 0) & 255;
                }
                j2 = m2 + 4 | 0;
                b[j2 >> 1] = h2;
                h2 = ((e[m2 >> 1] | 0) >>> 8) - (((d[k2 >> 0] | d[k2 + 1 >> 0] << 8) & 65535) >>> 8) | 0;
                if (!(n2 & 8)) {
                  i2 = c2 + 3 | 0;
                  i2 = b[l2 >> 1] | (d[i2 >> 0] | d[i2 + 1 >> 0] << 8) & -256;
                } else {
                  i2 = (Zc(f2, c2 + 184 | 0) | 0) & 255;
                  p2 = c2 + 3 | 0;
                  p2 = (((d[p2 >> 0] | d[p2 + 1 >> 0] << 8) & 65535) >>> 8) + h2 | 0;
                  i2 = ((Ie(((p2 | 0) < 1 ? 0 : (p2 | 0) > 254 ? 255 : p2 & 255) + i2 | 0) | 0) & 255) << 8;
                  i2 = (i2 | e[l2 >> 1]) & 65535;
                }
                b[l2 >> 1] = i2;
                if (!(n2 & 32)) {
                  p2 = c2 + 5 | 0;
                  b[j2 >> 1] = b[j2 >> 1] | (d[p2 >> 0] | d[p2 + 1 >> 0] << 8) & -256;
                  break;
                } else {
                  p2 = Zc(f2, c2 + 272 | 0) | 0;
                  f2 = c2 + 3 | 0;
                  n2 = c2 + 5 | 0;
                  n2 = ((((e[l2 >> 1] | 0) >>> 8) + h2 - (((d[f2 >> 0] | d[f2 + 1 >> 0] << 8) & 65535) >>> 8) | 0) / 2 | 0) + (((d[n2 >> 0] | d[n2 + 1 >> 0] << 8) & 65535) >>> 8) | 0;
                  p2 = ((Ie(((n2 | 0) < 1 ? 0 : (n2 | 0) > 254 ? 255 : n2 & 255) + (p2 & 255) | 0) | 0) & 255) << 8;
                  b[j2 >> 1] = p2 | e[j2 >> 1];
                  break;
                }
              } else {
                b[m2 + 2 >> 1] = h2;
                b[m2 + 4 >> 1] = h2;
              }
            while (0);
            p2 = c2 + 1 | 0;
            a[p2 >> 0] = a[m2 >> 0] | 0;
            a[p2 + 1 >> 0] = a[m2 + 1 >> 0] | 0;
            a[p2 + 2 >> 0] = a[m2 + 2 >> 0] | 0;
            a[p2 + 3 >> 0] = a[m2 + 3 >> 0] | 0;
            a[p2 + 4 >> 0] = a[m2 + 4 >> 0] | 0;
            a[p2 + 5 >> 0] = a[m2 + 5 >> 0] | 0;
            Kf(p2, g2);
          }
          V = o2;
          return g2 + 6 | 0;
        }
        function Jf(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          var c2 = 0, d2 = 0;
          d2 = Oe(b2) | 0;
          c2 = Oe(b2 + 2 | 0) | 0;
          Lf(a2, d2, c2, Oe(b2 + 4 | 0) | 0);
          return;
        }
        function Kf(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          var c2 = 0;
          Te(d[a2 >> 0] | d[a2 + 1 >> 0] << 8, b2);
          c2 = a2 + 2 | 0;
          Te(d[c2 >> 0] | d[c2 + 1 >> 0] << 8, b2 + 2 | 0);
          a2 = a2 + 4 | 0;
          Te(d[a2 >> 0] | d[a2 + 1 >> 0] << 8, b2 + 4 | 0);
          return;
        }
        function Lf(b2, c2, d2, e2) {
          b2 = b2 | 0;
          c2 = c2 | 0;
          d2 = d2 | 0;
          e2 = e2 | 0;
          a[b2 >> 0] = c2;
          a[b2 + 1 >> 0] = c2 >> 8;
          c2 = b2 + 2 | 0;
          a[c2 >> 0] = d2;
          a[c2 + 1 >> 0] = d2 >> 8;
          d2 = b2 + 4 | 0;
          a[d2 >> 0] = e2;
          a[d2 + 1 >> 0] = e2 >> 8;
          return;
        }
        function Mf(a2) {
          a2 = a2 | 0;
          pq(a2);
          jp(a2);
          return;
        }
        function Nf(a2) {
          a2 = a2 | 0;
          a2 = c[a2 + 12 >> 2] | 0;
          if (a2 | 0)
            ca[c[(c[a2 >> 2] | 0) + 4 >> 2] & 255](a2);
          return;
        }
        function Of(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          return ((c[b2 + 4 >> 2] | 0) == 10570 ? a2 + 12 | 0 : 0) | 0;
        }
        function Pf(a2) {
          a2 = a2 | 0;
          Da(a2, 16);
          return;
        }
        function Qf(a2, b2, d2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          d2 = d2 | 0;
          fe(a2);
          c[a2 >> 2] = 4872;
          c[a2 + 4 >> 2] = b2;
          Sf(a2 + 8 | 0, d2);
          return;
        }
        function Rf(a2, b2, d2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          d2 = d2 | 0;
          var e2 = 0, f2 = 0;
          d2 = V;
          V = V + 16 | 0;
          e2 = d2;
          c[a2 >> 2] = b2;
          f2 = eq(16) | 0;
          c[f2 + 4 >> 2] = 0;
          c[f2 + 8 >> 2] = 0;
          c[f2 >> 2] = 4896;
          c[f2 + 12 >> 2] = b2;
          c[a2 + 4 >> 2] = f2;
          c[e2 >> 2] = b2;
          c[e2 + 4 >> 2] = b2;
          Xe(a2, e2);
          V = d2;
          return;
        }
        function Sf(b2, d2) {
          b2 = b2 | 0;
          d2 = d2 | 0;
          c[b2 >> 2] = c[d2 >> 2];
          a[b2 + 4 >> 0] = a[d2 + 4 >> 0] | 0;
          Wf(b2 + 8 | 0, d2 + 8 | 0);
          Wf(b2 + 20 | 0, d2 + 20 | 0);
          Xf(b2 + 32 | 0, d2 + 32 | 0);
          return;
        }
        function Tf(a2) {
          a2 = a2 | 0;
          c[a2 >> 2] = 4872;
          ud(a2 + 8 | 0);
          le(a2);
          return;
        }
        function Uf(a2) {
          a2 = a2 | 0;
          Tf(a2);
          jp(a2);
          return;
        }
        function Vf(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          return Dg(a2 + 8 | 0, c[a2 + 4 >> 2] | 0, b2) | 0;
        }
        function Wf(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          var d2 = 0, e2 = 0;
          c[a2 >> 2] = 0;
          c[a2 + 4 >> 2] = 0;
          c[a2 + 8 >> 2] = 0;
          d2 = b2 + 4 | 0;
          e2 = (c[d2 >> 2] | 0) - (c[b2 >> 2] | 0) | 0;
          if (e2 | 0) {
            Yf(a2, e2);
            Zf(a2, c[b2 >> 2] | 0, c[d2 >> 2] | 0, e2);
          }
          return;
        }
        function Xf(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          var d2 = 0, e2 = 0, f2 = 0, g2 = 0, h2 = 0;
          d2 = V;
          V = V + 32 | 0;
          e2 = d2 + 24 | 0;
          f2 = d2 + 16 | 0;
          h2 = d2 + 8 | 0;
          g2 = d2;
          c[a2 >> 2] = 0;
          c[a2 + 4 >> 2] = 0;
          c[a2 + 8 >> 2] = 0;
          c[a2 + 12 >> 2] = 0;
          c[a2 + 16 >> 2] = 0;
          c[a2 + 20 >> 2] = 0;
          zg(h2, b2);
          Ag(g2, b2);
          c[f2 >> 2] = c[h2 >> 2];
          c[f2 + 4 >> 2] = c[h2 + 4 >> 2];
          c[e2 >> 2] = c[g2 >> 2];
          c[e2 + 4 >> 2] = c[g2 + 4 >> 2];
          cg(a2, f2, e2, 0);
          V = d2;
          return;
        }
        function Yf(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          var d2 = 0;
          if (($f(a2) | 0) >>> 0 < b2 >>> 0)
            cr(a2);
          else {
            d2 = eq(b2) | 0;
            c[a2 + 4 >> 2] = d2;
            c[a2 >> 2] = d2;
            c[a2 + 8 >> 2] = d2 + b2;
            return;
          }
        }
        function Zf(a2, b2, d2, e2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          d2 = d2 | 0;
          e2 = e2 | 0;
          var f2 = 0, g2 = 0;
          g2 = V;
          V = V + 16 | 0;
          f2 = g2;
          ag(f2, a2, e2);
          e2 = f2 + 4 | 0;
          a2 = d2 - b2 | 0;
          if ((a2 | 0) > 0) {
            ur(c[e2 >> 2] | 0, b2 | 0, a2 | 0) | 0;
            c[e2 >> 2] = (c[e2 >> 2] | 0) + a2;
          }
          bg(f2);
          V = g2;
          return;
        }
        function _f(a2) {
          a2 = a2 | 0;
          var b2 = 0, d2 = 0;
          b2 = c[a2 >> 2] | 0;
          d2 = b2;
          if (b2 | 0) {
            c[a2 + 4 >> 2] = d2;
            Da(b2, (c[a2 + 8 >> 2] | 0) - d2 | 0);
          }
          return;
        }
        function $f(a2) {
          a2 = a2 | 0;
          return 2147483647;
        }
        function ag(a2, b2, d2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          d2 = d2 | 0;
          c[a2 >> 2] = b2;
          b2 = c[b2 + 4 >> 2] | 0;
          c[a2 + 4 >> 2] = b2;
          c[a2 + 8 >> 2] = b2 + d2;
          return;
        }
        function bg(a2) {
          a2 = a2 | 0;
          c[(c[a2 >> 2] | 0) + 4 >> 2] = c[a2 + 4 >> 2];
          return;
        }
        function cg(a2, b2, d2, e2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          d2 = d2 | 0;
          e2 = e2 | 0;
          var f2 = 0, g2 = 0, h2 = 0, i2 = 0, j2 = 0, k2 = 0, l2 = 0, m2 = 0, n2 = 0, o2 = 0, p2 = 0, q2 = 0;
          q2 = V;
          V = V + 96 | 0;
          p2 = q2 + 80 | 0;
          m2 = q2 + 64 | 0;
          j2 = q2 + 48 | 0;
          k2 = q2 + 40 | 0;
          l2 = q2 + 8 | 0;
          i2 = q2;
          n2 = q2 + 32 | 0;
          o2 = q2 + 16 | 0;
          h2 = b2;
          g2 = c[h2 >> 2] | 0;
          h2 = c[h2 + 4 >> 2] | 0;
          f2 = d2;
          d2 = c[f2 >> 2] | 0;
          f2 = c[f2 + 4 >> 2] | 0;
          e2 = g2;
          if ((f2 | 0) == (h2 | 0))
            h2 = 0;
          else
            h2 = ((f2 - (c[d2 >> 2] | 0) | 0) / 44 | 0) + ((d2 - g2 >> 2) * 93 | 0) + ((h2 - (c[g2 >> 2] | 0) | 0) / -44 | 0) | 0;
          d2 = (c[a2 + 8 >> 2] | 0) - (c[a2 + 4 >> 2] | 0) | 0;
          d2 = ((d2 | 0) == 0 ? 0 : ((d2 >> 2) * 93 | 0) + -1 | 0) - ((c[a2 + 20 >> 2] | 0) + (c[a2 + 16 >> 2] | 0)) | 0;
          if (h2 >>> 0 > d2 >>> 0)
            eg(a2, h2 - d2 | 0);
          fg(k2, a2);
          fg(i2, a2);
          f2 = i2;
          d2 = c[f2 >> 2] | 0;
          f2 = c[f2 + 4 >> 2] | 0;
          g2 = l2;
          c[g2 >> 2] = d2;
          c[g2 + 4 >> 2] = f2;
          g2 = d2;
          if (h2 | 0) {
            d2 = ((f2 - (c[d2 >> 2] | 0) | 0) / 44 | 0) + h2 | 0;
            if ((d2 | 0) > 0) {
              i2 = (d2 >>> 0) / 93 | 0;
              h2 = g2 + (i2 << 2) | 0;
              c[l2 >> 2] = h2;
              d2 = (c[h2 >> 2] | 0) + ((d2 - (i2 * 93 | 0) | 0) * 44 | 0) | 0;
            } else {
              d2 = 92 - d2 | 0;
              i2 = g2 + (((d2 | 0) / -93 | 0) << 2) | 0;
              c[l2 >> 2] = i2;
              d2 = (c[i2 >> 2] | 0) + ((92 - ((d2 | 0) % 93 | 0) | 0) * 44 | 0) | 0;
            }
            c[l2 + 4 >> 2] = d2;
          }
          c[m2 >> 2] = c[k2 >> 2];
          c[m2 + 4 >> 2] = c[k2 + 4 >> 2];
          c[p2 >> 2] = c[l2 >> 2];
          c[p2 + 4 >> 2] = c[l2 + 4 >> 2];
          gg(j2, m2, p2);
          hg(p2, j2);
          ig(m2, j2);
          if (jg(p2, m2) | 0) {
            g2 = o2 + 4 | 0;
            h2 = b2 + 4 | 0;
            do {
              kg(n2, p2);
              lg(o2, a2, n2);
              d2 = c[o2 >> 2] | 0;
              if ((d2 | 0) != (c[g2 >> 2] | 0)) {
                f2 = c[h2 >> 2] | 0;
                do {
                  Wc(d2, f2);
                  d2 = (c[o2 >> 2] | 0) + 44 | 0;
                  c[o2 >> 2] = d2;
                  f2 = f2 + 44 | 0;
                  c[h2 >> 2] = f2;
                  if ((f2 - (c[e2 >> 2] | 0) | 0) == 4092) {
                    e2 = e2 + 4 | 0;
                    c[b2 >> 2] = e2;
                    f2 = c[e2 >> 2] | 0;
                    c[h2 >> 2] = f2;
                  }
                } while ((d2 | 0) != (c[g2 >> 2] | 0));
              }
              mg(o2);
              ng(p2) | 0;
            } while (jg(p2, m2) | 0);
          }
          V = q2;
          return;
        }
        function dg(a2) {
          a2 = a2 | 0;
          var b2 = 0, d2 = 0, e2 = 0;
          b2 = c[a2 + 4 >> 2] | 0;
          d2 = a2 + 8 | 0;
          e2 = c[d2 >> 2] | 0;
          if ((e2 | 0) != (b2 | 0))
            c[d2 >> 2] = e2 + (~((e2 + -4 - b2 | 0) >>> 2) << 2);
          b2 = c[a2 >> 2] | 0;
          if (b2 | 0)
            Da(b2, (c[a2 + 12 >> 2] | 0) - b2 | 0);
          return;
        }
        function eg(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          var d2 = 0, e2 = 0, f2 = 0, g2 = 0, h2 = 0, i2 = 0, j2 = 0, k2 = 0, l2 = 0, m2 = 0, n2 = 0, o2 = 0, p2 = 0, r2 = 0, s2 = 0, t2 = 0, u2 = 0, v2 = 0, w2 = 0, x2 = 0, y2 = 0, z2 = 0, A2 = 0, B2 = 0, C2 = 0;
          B2 = V;
          V = V + 64 | 0;
          v2 = B2 + 52 | 0;
          u2 = B2 + 48 | 0;
          w2 = B2 + 28 | 0;
          x2 = B2 + 24 | 0;
          y2 = B2 + 20 | 0;
          p2 = B2;
          z2 = a2 + 8 | 0;
          d2 = c[z2 >> 2] | 0;
          A2 = a2 + 4 | 0;
          j2 = c[A2 >> 2] | 0;
          s2 = ((d2 | 0) == (j2 | 0) & 1) + b2 | 0;
          h2 = (s2 >>> 0) / 93 | 0;
          h2 = h2 + ((s2 - (h2 * 93 | 0) | 0) != 0 & 1) | 0;
          s2 = a2 + 16 | 0;
          e2 = c[s2 >> 2] | 0;
          i2 = (e2 >>> 0) / 93 | 0;
          r2 = h2 >>> 0 < i2 >>> 0 ? h2 : i2;
          b2 = h2 - r2 | 0;
          g2 = d2;
          a:
            do
              if (!b2) {
                c[s2 >> 2] = (q(r2, -93) | 0) + e2;
                if (r2 | 0) {
                  i2 = a2 + 12 | 0;
                  k2 = a2 + 12 | 0;
                  l2 = w2 + 4 | 0;
                  m2 = w2 + 8 | 0;
                  n2 = w2 + 12 | 0;
                  b2 = r2;
                  e2 = j2;
                  while (1) {
                    h2 = c[e2 >> 2] | 0;
                    g2 = e2 + 4 | 0;
                    c[A2 >> 2] = g2;
                    t2 = c[i2 >> 2] | 0;
                    e2 = t2;
                    do
                      if ((d2 | 0) == (t2 | 0)) {
                        t2 = c[a2 >> 2] | 0;
                        d2 = t2;
                        if (g2 >>> 0 <= t2 >>> 0) {
                          d2 = e2 - d2 | 0;
                          d2 = (d2 | 0) == 0 ? 1 : d2 >> 1;
                          qg(w2, d2, d2 >>> 2, k2);
                          c[x2 >> 2] = c[A2 >> 2];
                          c[y2 >> 2] = c[z2 >> 2];
                          c[u2 >> 2] = c[x2 >> 2];
                          c[v2 >> 2] = c[y2 >> 2];
                          ug(w2, u2, v2);
                          d2 = c[a2 >> 2] | 0;
                          c[a2 >> 2] = c[w2 >> 2];
                          c[w2 >> 2] = d2;
                          d2 = c[A2 >> 2] | 0;
                          c[A2 >> 2] = c[l2 >> 2];
                          c[l2 >> 2] = d2;
                          d2 = c[z2 >> 2] | 0;
                          c[z2 >> 2] = c[m2 >> 2];
                          c[m2 >> 2] = d2;
                          d2 = c[i2 >> 2] | 0;
                          c[i2 >> 2] = c[n2 >> 2];
                          c[n2 >> 2] = d2;
                          tg(w2);
                          d2 = c[z2 >> 2] | 0;
                          break;
                        }
                        t2 = g2;
                        d2 = ((t2 - d2 >> 2) + 1 | 0) / -2 | 0;
                        f2 = g2 + (d2 << 2) | 0;
                        e2 = e2 - t2 | 0;
                        if (!e2)
                          d2 = f2;
                        else {
                          vr(f2 | 0, g2 | 0, e2 | 0) | 0;
                          d2 = (c[A2 >> 2] | 0) + (d2 << 2) | 0;
                        }
                        t2 = f2 + (e2 >> 2 << 2) | 0;
                        c[z2 >> 2] = t2;
                        c[A2 >> 2] = d2;
                        d2 = t2;
                      }
                    while (0);
                    c[d2 >> 2] = h2;
                    d2 = (c[z2 >> 2] | 0) + 4 | 0;
                    c[z2 >> 2] = d2;
                    b2 = b2 + -1 | 0;
                    if (!b2)
                      break a;
                    e2 = c[A2 >> 2] | 0;
                  }
                }
              } else {
                t2 = a2 + 12 | 0;
                e2 = c[t2 >> 2] | 0;
                f2 = e2 - (c[a2 >> 2] | 0) | 0;
                d2 = g2 - j2 >> 2;
                if (b2 >>> 0 > ((f2 >> 2) - d2 | 0) >>> 0) {
                  o2 = f2 >> 1;
                  n2 = d2 + b2 | 0;
                  qg(p2, o2 >>> 0 < n2 >>> 0 ? n2 : o2, d2 - r2 | 0, a2 + 12 | 0);
                  do {
                    c[v2 >> 2] = eq(4092) | 0;
                    rg(p2, v2);
                    b2 = b2 + -1 | 0;
                  } while ((b2 | 0) != 0);
                  if (!r2)
                    d2 = c[A2 >> 2] | 0;
                  else {
                    i2 = p2 + 8 | 0;
                    j2 = p2 + 12 | 0;
                    k2 = p2 + 4 | 0;
                    l2 = p2 + 16 | 0;
                    m2 = w2 + 4 | 0;
                    n2 = w2 + 8 | 0;
                    o2 = w2 + 12 | 0;
                    h2 = r2;
                    b2 = c[i2 >> 2] | 0;
                    d2 = c[A2 >> 2] | 0;
                    do {
                      g2 = c[j2 >> 2] | 0;
                      e2 = g2;
                      do
                        if ((b2 | 0) == (g2 | 0)) {
                          f2 = c[k2 >> 2] | 0;
                          g2 = c[p2 >> 2] | 0;
                          b2 = g2;
                          if (f2 >>> 0 <= g2 >>> 0) {
                            b2 = e2 - b2 | 0;
                            b2 = (b2 | 0) == 0 ? 1 : b2 >> 1;
                            qg(w2, b2, b2 >>> 2, c[l2 >> 2] | 0);
                            c[x2 >> 2] = c[k2 >> 2];
                            c[y2 >> 2] = c[i2 >> 2];
                            c[u2 >> 2] = c[x2 >> 2];
                            c[v2 >> 2] = c[y2 >> 2];
                            ug(w2, u2, v2);
                            b2 = c[p2 >> 2] | 0;
                            c[p2 >> 2] = c[w2 >> 2];
                            c[w2 >> 2] = b2;
                            b2 = c[k2 >> 2] | 0;
                            c[k2 >> 2] = c[m2 >> 2];
                            c[m2 >> 2] = b2;
                            b2 = c[i2 >> 2] | 0;
                            c[i2 >> 2] = c[n2 >> 2];
                            c[n2 >> 2] = b2;
                            b2 = c[j2 >> 2] | 0;
                            c[j2 >> 2] = c[o2 >> 2];
                            c[o2 >> 2] = b2;
                            tg(w2);
                            b2 = c[i2 >> 2] | 0;
                            break;
                          }
                          C2 = f2;
                          b2 = ((C2 - b2 >> 2) + 1 | 0) / -2 | 0;
                          g2 = f2 + (b2 << 2) | 0;
                          e2 = e2 - C2 | 0;
                          if (!e2)
                            b2 = g2;
                          else {
                            vr(g2 | 0, f2 | 0, e2 | 0) | 0;
                            b2 = (c[k2 >> 2] | 0) + (b2 << 2) | 0;
                          }
                          C2 = g2 + (e2 >> 2 << 2) | 0;
                          c[i2 >> 2] = C2;
                          c[k2 >> 2] = b2;
                          b2 = C2;
                        }
                      while (0);
                      c[b2 >> 2] = c[d2 >> 2];
                      b2 = (c[i2 >> 2] | 0) + 4 | 0;
                      c[i2 >> 2] = b2;
                      d2 = (c[A2 >> 2] | 0) + 4 | 0;
                      c[A2 >> 2] = d2;
                      h2 = h2 + -1 | 0;
                    } while ((h2 | 0) != 0);
                  }
                  b2 = c[z2 >> 2] | 0;
                  if ((b2 | 0) != (d2 | 0)) {
                    do {
                      b2 = b2 + -4 | 0;
                      sg(p2, b2);
                      d2 = c[A2 >> 2] | 0;
                    } while ((b2 | 0) != (d2 | 0));
                    b2 = c[z2 >> 2] | 0;
                  }
                  C2 = c[a2 >> 2] | 0;
                  c[a2 >> 2] = c[p2 >> 2];
                  c[p2 >> 2] = C2;
                  C2 = p2 + 4 | 0;
                  c[A2 >> 2] = c[C2 >> 2];
                  c[C2 >> 2] = d2;
                  C2 = p2 + 8 | 0;
                  c[z2 >> 2] = c[C2 >> 2];
                  c[C2 >> 2] = b2;
                  C2 = p2 + 12 | 0;
                  A2 = c[t2 >> 2] | 0;
                  c[t2 >> 2] = c[C2 >> 2];
                  c[C2 >> 2] = A2;
                  c[s2 >> 2] = (c[s2 >> 2] | 0) + (q(r2, -93) | 0);
                  tg(p2);
                  break;
                } else {
                  b:
                    do
                      if ((e2 | 0) == (g2 | 0))
                        k2 = 18;
                      else {
                        while (1) {
                          c[v2 >> 2] = eq(4092) | 0;
                          og(a2, v2);
                          b2 = b2 + -1 | 0;
                          if (!b2)
                            break;
                          if ((c[t2 >> 2] | 0) == (c[z2 >> 2] | 0)) {
                            k2 = 18;
                            break b;
                          }
                        }
                        d2 = r2;
                        b2 = c[s2 >> 2] | 0;
                      }
                    while (0);
                  if ((k2 | 0) == 18) {
                    e2 = ~(h2 >>> 0 > i2 >>> 0 ? i2 : h2);
                    d2 = b2;
                    do {
                      c[v2 >> 2] = eq(4092) | 0;
                      pg(a2, v2);
                      d2 = d2 + -1 | 0;
                      f2 = (((c[z2 >> 2] | 0) - (c[A2 >> 2] | 0) | 0) == 4 ? 92 : 93) + (c[s2 >> 2] | 0) | 0;
                      c[s2 >> 2] = f2;
                    } while ((d2 | 0) != 0);
                    d2 = b2 + -1 - e2 | 0;
                    b2 = f2;
                  }
                  c[s2 >> 2] = b2 + (q(d2, -93) | 0);
                  if (!d2)
                    break;
                  i2 = a2 + 12 | 0;
                  j2 = w2 + 4 | 0;
                  k2 = w2 + 8 | 0;
                  l2 = w2 + 12 | 0;
                  b2 = c[z2 >> 2] | 0;
                  do {
                    g2 = c[A2 >> 2] | 0;
                    h2 = c[g2 >> 2] | 0;
                    g2 = g2 + 4 | 0;
                    c[A2 >> 2] = g2;
                    C2 = c[t2 >> 2] | 0;
                    e2 = C2;
                    do
                      if ((b2 | 0) == (C2 | 0)) {
                        C2 = c[a2 >> 2] | 0;
                        b2 = C2;
                        if (g2 >>> 0 <= C2 >>> 0) {
                          b2 = e2 - b2 | 0;
                          b2 = (b2 | 0) == 0 ? 1 : b2 >> 1;
                          qg(w2, b2, b2 >>> 2, i2);
                          c[x2 >> 2] = c[A2 >> 2];
                          c[y2 >> 2] = c[z2 >> 2];
                          c[u2 >> 2] = c[x2 >> 2];
                          c[v2 >> 2] = c[y2 >> 2];
                          ug(w2, u2, v2);
                          b2 = c[a2 >> 2] | 0;
                          c[a2 >> 2] = c[w2 >> 2];
                          c[w2 >> 2] = b2;
                          b2 = c[A2 >> 2] | 0;
                          c[A2 >> 2] = c[j2 >> 2];
                          c[j2 >> 2] = b2;
                          b2 = c[z2 >> 2] | 0;
                          c[z2 >> 2] = c[k2 >> 2];
                          c[k2 >> 2] = b2;
                          b2 = c[t2 >> 2] | 0;
                          c[t2 >> 2] = c[l2 >> 2];
                          c[l2 >> 2] = b2;
                          tg(w2);
                          b2 = c[z2 >> 2] | 0;
                          break;
                        }
                        C2 = g2;
                        b2 = ((C2 - b2 >> 2) + 1 | 0) / -2 | 0;
                        f2 = g2 + (b2 << 2) | 0;
                        e2 = e2 - C2 | 0;
                        if (!e2)
                          b2 = f2;
                        else {
                          vr(f2 | 0, g2 | 0, e2 | 0) | 0;
                          b2 = (c[A2 >> 2] | 0) + (b2 << 2) | 0;
                        }
                        C2 = f2 + (e2 >> 2 << 2) | 0;
                        c[z2 >> 2] = C2;
                        c[A2 >> 2] = b2;
                        b2 = C2;
                      }
                    while (0);
                    c[b2 >> 2] = h2;
                    b2 = (c[z2 >> 2] | 0) + 4 | 0;
                    c[z2 >> 2] = b2;
                    d2 = d2 + -1 | 0;
                  } while ((d2 | 0) != 0);
                }
              }
            while (0);
          V = B2;
          return;
        }
        function fg(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          var d2 = 0, e2 = 0, f2 = 0, g2 = 0;
          d2 = (c[b2 + 16 >> 2] | 0) + (c[b2 + 20 >> 2] | 0) | 0;
          g2 = c[b2 + 4 >> 2] | 0;
          e2 = (d2 >>> 0) / 93 | 0;
          f2 = g2 + (e2 << 2) | 0;
          if ((c[b2 + 8 >> 2] | 0) == (g2 | 0))
            b2 = 0;
          else
            b2 = (c[f2 >> 2] | 0) + ((d2 - (e2 * 93 | 0) | 0) * 44 | 0) | 0;
          c[a2 >> 2] = f2;
          c[a2 + 4 >> 2] = b2;
          return;
        }
        function gg(a2, b2, d2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          d2 = d2 | 0;
          var e2 = 0, f2 = 0;
          f2 = b2;
          b2 = c[f2 + 4 >> 2] | 0;
          e2 = a2;
          c[e2 >> 2] = c[f2 >> 2];
          c[e2 + 4 >> 2] = b2;
          e2 = d2;
          b2 = c[e2 + 4 >> 2] | 0;
          d2 = a2 + 8 | 0;
          c[d2 >> 2] = c[e2 >> 2];
          c[d2 + 4 >> 2] = b2;
          return;
        }
        function hg(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          c[a2 >> 2] = c[b2 >> 2];
          c[a2 + 4 >> 2] = c[b2 + 4 >> 2];
          c[a2 + 8 >> 2] = c[b2 + 8 >> 2];
          c[a2 + 12 >> 2] = c[b2 + 12 >> 2];
          return;
        }
        function ig(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          var d2 = 0, e2 = 0, f2 = 0, g2 = 0, h2 = 0, i2 = 0, j2 = 0;
          d2 = V;
          V = V + 32 | 0;
          e2 = d2 + 24 | 0;
          f2 = d2 + 16 | 0;
          h2 = d2 + 8 | 0;
          g2 = d2;
          i2 = b2 + 8 | 0;
          j2 = c[i2 >> 2] | 0;
          i2 = c[i2 + 4 >> 2] | 0;
          b2 = h2;
          c[b2 >> 2] = j2;
          c[b2 + 4 >> 2] = i2;
          b2 = g2;
          c[b2 >> 2] = j2;
          c[b2 + 4 >> 2] = i2;
          c[f2 >> 2] = c[h2 >> 2];
          c[f2 + 4 >> 2] = c[h2 + 4 >> 2];
          c[e2 >> 2] = c[g2 >> 2];
          c[e2 + 4 >> 2] = c[g2 + 4 >> 2];
          gg(a2, f2, e2);
          V = d2;
          return;
        }
        function jg(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          return (xg(a2, b2) | 0) ^ 1 | 0;
        }
        function kg(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          var d2 = 0, e2 = 0;
          d2 = c[b2 >> 2] | 0;
          e2 = c[b2 + 4 >> 2] | 0;
          if ((d2 | 0) == (c[b2 + 8 >> 2] | 0))
            yg(a2, e2, c[b2 + 12 >> 2] | 0);
          else
            yg(a2, e2, (c[d2 >> 2] | 0) + 4092 | 0);
          return;
        }
        function lg(a2, b2, d2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          d2 = d2 | 0;
          var e2 = 0;
          e2 = c[d2 >> 2] | 0;
          c[a2 >> 2] = e2;
          c[a2 + 4 >> 2] = c[d2 + 4 >> 2];
          c[a2 + 8 >> 2] = e2;
          c[a2 + 12 >> 2] = b2;
          return;
        }
        function mg(a2) {
          a2 = a2 | 0;
          var b2 = 0;
          b2 = (c[a2 + 12 >> 2] | 0) + 20 | 0;
          c[b2 >> 2] = (c[b2 >> 2] | 0) + (((c[a2 >> 2] | 0) - (c[a2 + 8 >> 2] | 0) | 0) / 44 | 0);
          return;
        }
        function ng(a2) {
          a2 = a2 | 0;
          var b2 = 0, d2 = 0, e2 = 0;
          b2 = c[a2 >> 2] | 0;
          d2 = a2 + 8 | 0;
          if ((b2 | 0) == (c[d2 >> 2] | 0)) {
            e2 = d2;
            b2 = c[e2 + 4 >> 2] | 0;
            d2 = a2;
            c[d2 >> 2] = c[e2 >> 2];
            c[d2 + 4 >> 2] = b2;
          } else {
            e2 = b2 + 4 | 0;
            c[a2 >> 2] = e2;
            c[a2 + 4 >> 2] = c[e2 >> 2];
          }
          return a2 | 0;
        }
        function og(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          var d2 = 0, e2 = 0, f2 = 0, g2 = 0, h2 = 0, i2 = 0, j2 = 0, k2 = 0, l2 = 0, m2 = 0, n2 = 0, o2 = 0, p2 = 0, q2 = 0;
          p2 = V;
          V = V + 48 | 0;
          f2 = p2 + 32 | 0;
          e2 = p2 + 28 | 0;
          i2 = p2 + 8 | 0;
          j2 = p2 + 4 | 0;
          k2 = p2;
          o2 = a2 + 8 | 0;
          d2 = c[o2 >> 2] | 0;
          l2 = a2 + 12 | 0;
          n2 = c[l2 >> 2] | 0;
          g2 = n2;
          do
            if ((d2 | 0) == (n2 | 0)) {
              n2 = a2 + 4 | 0;
              m2 = c[n2 >> 2] | 0;
              q2 = c[a2 >> 2] | 0;
              h2 = q2;
              if (m2 >>> 0 <= q2 >>> 0) {
                d2 = g2 - h2 | 0;
                d2 = (d2 | 0) == 0 ? 1 : d2 >> 1;
                qg(i2, d2, d2 >>> 2, a2 + 12 | 0);
                c[j2 >> 2] = c[n2 >> 2];
                c[k2 >> 2] = c[o2 >> 2];
                c[e2 >> 2] = c[j2 >> 2];
                c[f2 >> 2] = c[k2 >> 2];
                ug(i2, e2, f2);
                d2 = c[a2 >> 2] | 0;
                c[a2 >> 2] = c[i2 >> 2];
                c[i2 >> 2] = d2;
                d2 = i2 + 4 | 0;
                q2 = c[n2 >> 2] | 0;
                c[n2 >> 2] = c[d2 >> 2];
                c[d2 >> 2] = q2;
                d2 = i2 + 8 | 0;
                q2 = c[o2 >> 2] | 0;
                c[o2 >> 2] = c[d2 >> 2];
                c[d2 >> 2] = q2;
                d2 = i2 + 12 | 0;
                q2 = c[l2 >> 2] | 0;
                c[l2 >> 2] = c[d2 >> 2];
                c[d2 >> 2] = q2;
                tg(i2);
                d2 = c[o2 >> 2] | 0;
                break;
              }
              f2 = m2;
              e2 = ((f2 - h2 >> 2) + 1 | 0) / -2 | 0;
              a2 = m2 + (e2 << 2) | 0;
              f2 = d2 - f2 | 0;
              if (!f2)
                d2 = a2;
              else {
                vr(a2 | 0, m2 | 0, f2 | 0) | 0;
                d2 = (c[n2 >> 2] | 0) + (e2 << 2) | 0;
              }
              q2 = a2 + (f2 >> 2 << 2) | 0;
              c[o2 >> 2] = q2;
              c[n2 >> 2] = d2;
              d2 = q2;
            }
          while (0);
          c[d2 >> 2] = c[b2 >> 2];
          c[o2 >> 2] = (c[o2 >> 2] | 0) + 4;
          V = p2;
          return;
        }
        function pg(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          var d2 = 0, e2 = 0, f2 = 0, g2 = 0, h2 = 0, i2 = 0, j2 = 0, k2 = 0, l2 = 0, m2 = 0, n2 = 0, o2 = 0, p2 = 0, q2 = 0;
          p2 = V;
          V = V + 48 | 0;
          e2 = p2 + 32 | 0;
          d2 = p2 + 28 | 0;
          h2 = p2 + 8 | 0;
          i2 = p2 + 4 | 0;
          j2 = p2;
          o2 = a2 + 4 | 0;
          m2 = c[o2 >> 2] | 0;
          n2 = c[a2 >> 2] | 0;
          k2 = n2;
          do
            if ((m2 | 0) == (n2 | 0)) {
              n2 = a2 + 8 | 0;
              l2 = c[n2 >> 2] | 0;
              g2 = a2 + 12 | 0;
              q2 = c[g2 >> 2] | 0;
              f2 = q2;
              if (l2 >>> 0 >= q2 >>> 0) {
                q2 = f2 - k2 | 0;
                q2 = (q2 | 0) == 0 ? 1 : q2 >> 1;
                qg(h2, q2, (q2 + 3 | 0) >>> 2, a2 + 12 | 0);
                c[i2 >> 2] = c[o2 >> 2];
                c[j2 >> 2] = c[n2 >> 2];
                c[d2 >> 2] = c[i2 >> 2];
                c[e2 >> 2] = c[j2 >> 2];
                ug(h2, d2, e2);
                d2 = c[a2 >> 2] | 0;
                c[a2 >> 2] = c[h2 >> 2];
                c[h2 >> 2] = d2;
                d2 = h2 + 4 | 0;
                q2 = c[o2 >> 2] | 0;
                c[o2 >> 2] = c[d2 >> 2];
                c[d2 >> 2] = q2;
                d2 = h2 + 8 | 0;
                q2 = c[n2 >> 2] | 0;
                c[n2 >> 2] = c[d2 >> 2];
                c[d2 >> 2] = q2;
                d2 = h2 + 12 | 0;
                q2 = c[g2 >> 2] | 0;
                c[g2 >> 2] = c[d2 >> 2];
                c[d2 >> 2] = q2;
                tg(h2);
                d2 = c[o2 >> 2] | 0;
                break;
              }
              e2 = l2;
              a2 = ((f2 - e2 >> 2) + 1 | 0) / 2 | 0;
              f2 = l2 + (a2 << 2) | 0;
              e2 = e2 - m2 | 0;
              d2 = f2 + (0 - (e2 >> 2) << 2) | 0;
              if (!e2) {
                d2 = f2;
                e2 = f2;
              } else {
                vr(d2 | 0, m2 | 0, e2 | 0) | 0;
                e2 = (c[n2 >> 2] | 0) + (a2 << 2) | 0;
              }
              c[o2 >> 2] = d2;
              c[n2 >> 2] = e2;
            } else
              d2 = m2;
          while (0);
          c[d2 + -4 >> 2] = c[b2 >> 2];
          c[o2 >> 2] = (c[o2 >> 2] | 0) + -4;
          V = p2;
          return;
        }
        function qg(a2, b2, d2, e2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          d2 = d2 | 0;
          e2 = e2 | 0;
          var f2 = 0;
          f2 = a2 + 12 | 0;
          c[f2 >> 2] = 0;
          c[a2 + 16 >> 2] = e2;
          do
            if (b2)
              if (b2 >>> 0 > 1073741823) {
                f2 = v(8) | 0;
                vq(f2, 6723);
                c[f2 >> 2] = 5956;
                x(f2 | 0, 3928, 123);
              } else {
                e2 = eq(b2 << 2) | 0;
                break;
              }
            else
              e2 = 0;
          while (0);
          c[a2 >> 2] = e2;
          d2 = e2 + (d2 << 2) | 0;
          c[a2 + 8 >> 2] = d2;
          c[a2 + 4 >> 2] = d2;
          c[f2 >> 2] = e2 + (b2 << 2);
          return;
        }
        function rg(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          var d2 = 0, e2 = 0, f2 = 0, g2 = 0, h2 = 0, i2 = 0, j2 = 0, k2 = 0, l2 = 0, m2 = 0, n2 = 0, o2 = 0, p2 = 0, q2 = 0;
          p2 = V;
          V = V + 48 | 0;
          f2 = p2 + 32 | 0;
          e2 = p2 + 28 | 0;
          i2 = p2 + 8 | 0;
          j2 = p2 + 4 | 0;
          k2 = p2;
          o2 = a2 + 8 | 0;
          d2 = c[o2 >> 2] | 0;
          l2 = a2 + 12 | 0;
          n2 = c[l2 >> 2] | 0;
          g2 = n2;
          do
            if ((d2 | 0) == (n2 | 0)) {
              n2 = a2 + 4 | 0;
              m2 = c[n2 >> 2] | 0;
              q2 = c[a2 >> 2] | 0;
              h2 = q2;
              if (m2 >>> 0 <= q2 >>> 0) {
                d2 = g2 - h2 | 0;
                d2 = (d2 | 0) == 0 ? 1 : d2 >> 1;
                qg(i2, d2, d2 >>> 2, c[a2 + 16 >> 2] | 0);
                c[j2 >> 2] = c[n2 >> 2];
                c[k2 >> 2] = c[o2 >> 2];
                c[e2 >> 2] = c[j2 >> 2];
                c[f2 >> 2] = c[k2 >> 2];
                ug(i2, e2, f2);
                d2 = c[a2 >> 2] | 0;
                c[a2 >> 2] = c[i2 >> 2];
                c[i2 >> 2] = d2;
                d2 = i2 + 4 | 0;
                q2 = c[n2 >> 2] | 0;
                c[n2 >> 2] = c[d2 >> 2];
                c[d2 >> 2] = q2;
                d2 = i2 + 8 | 0;
                q2 = c[o2 >> 2] | 0;
                c[o2 >> 2] = c[d2 >> 2];
                c[d2 >> 2] = q2;
                d2 = i2 + 12 | 0;
                q2 = c[l2 >> 2] | 0;
                c[l2 >> 2] = c[d2 >> 2];
                c[d2 >> 2] = q2;
                tg(i2);
                d2 = c[o2 >> 2] | 0;
                break;
              }
              f2 = m2;
              e2 = ((f2 - h2 >> 2) + 1 | 0) / -2 | 0;
              a2 = m2 + (e2 << 2) | 0;
              f2 = d2 - f2 | 0;
              if (!f2)
                d2 = a2;
              else {
                vr(a2 | 0, m2 | 0, f2 | 0) | 0;
                d2 = (c[n2 >> 2] | 0) + (e2 << 2) | 0;
              }
              q2 = a2 + (f2 >> 2 << 2) | 0;
              c[o2 >> 2] = q2;
              c[n2 >> 2] = d2;
              d2 = q2;
            }
          while (0);
          c[d2 >> 2] = c[b2 >> 2];
          c[o2 >> 2] = (c[o2 >> 2] | 0) + 4;
          V = p2;
          return;
        }
        function sg(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          var d2 = 0, e2 = 0, f2 = 0, g2 = 0, h2 = 0, i2 = 0, j2 = 0, k2 = 0, l2 = 0, m2 = 0, n2 = 0, o2 = 0, p2 = 0, q2 = 0;
          p2 = V;
          V = V + 48 | 0;
          e2 = p2 + 32 | 0;
          d2 = p2 + 28 | 0;
          h2 = p2 + 8 | 0;
          i2 = p2 + 4 | 0;
          j2 = p2;
          o2 = a2 + 4 | 0;
          m2 = c[o2 >> 2] | 0;
          n2 = c[a2 >> 2] | 0;
          k2 = n2;
          do
            if ((m2 | 0) == (n2 | 0)) {
              n2 = a2 + 8 | 0;
              l2 = c[n2 >> 2] | 0;
              g2 = a2 + 12 | 0;
              q2 = c[g2 >> 2] | 0;
              f2 = q2;
              if (l2 >>> 0 >= q2 >>> 0) {
                q2 = f2 - k2 | 0;
                q2 = (q2 | 0) == 0 ? 1 : q2 >> 1;
                qg(h2, q2, (q2 + 3 | 0) >>> 2, c[a2 + 16 >> 2] | 0);
                c[i2 >> 2] = c[o2 >> 2];
                c[j2 >> 2] = c[n2 >> 2];
                c[d2 >> 2] = c[i2 >> 2];
                c[e2 >> 2] = c[j2 >> 2];
                ug(h2, d2, e2);
                d2 = c[a2 >> 2] | 0;
                c[a2 >> 2] = c[h2 >> 2];
                c[h2 >> 2] = d2;
                d2 = h2 + 4 | 0;
                q2 = c[o2 >> 2] | 0;
                c[o2 >> 2] = c[d2 >> 2];
                c[d2 >> 2] = q2;
                d2 = h2 + 8 | 0;
                q2 = c[n2 >> 2] | 0;
                c[n2 >> 2] = c[d2 >> 2];
                c[d2 >> 2] = q2;
                d2 = h2 + 12 | 0;
                q2 = c[g2 >> 2] | 0;
                c[g2 >> 2] = c[d2 >> 2];
                c[d2 >> 2] = q2;
                tg(h2);
                d2 = c[o2 >> 2] | 0;
                break;
              }
              e2 = l2;
              a2 = ((f2 - e2 >> 2) + 1 | 0) / 2 | 0;
              f2 = l2 + (a2 << 2) | 0;
              e2 = e2 - m2 | 0;
              d2 = f2 + (0 - (e2 >> 2) << 2) | 0;
              if (!e2) {
                d2 = f2;
                e2 = f2;
              } else {
                vr(d2 | 0, m2 | 0, e2 | 0) | 0;
                e2 = (c[n2 >> 2] | 0) + (a2 << 2) | 0;
              }
              c[o2 >> 2] = d2;
              c[n2 >> 2] = e2;
            } else
              d2 = m2;
          while (0);
          c[d2 + -4 >> 2] = c[b2 >> 2];
          c[o2 >> 2] = (c[o2 >> 2] | 0) + -4;
          V = p2;
          return;
        }
        function tg(a2) {
          a2 = a2 | 0;
          var b2 = 0, d2 = 0, e2 = 0;
          b2 = c[a2 + 4 >> 2] | 0;
          d2 = a2 + 8 | 0;
          e2 = c[d2 >> 2] | 0;
          if ((e2 | 0) != (b2 | 0))
            c[d2 >> 2] = e2 + (~((e2 + -4 - b2 | 0) >>> 2) << 2);
          b2 = c[a2 >> 2] | 0;
          if (b2 | 0)
            Da(b2, (c[a2 + 12 >> 2] | 0) - b2 | 0);
          return;
        }
        function ug(a2, b2, d2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          d2 = d2 | 0;
          var e2 = 0, f2 = 0, g2 = 0, h2 = 0;
          h2 = V;
          V = V + 16 | 0;
          g2 = h2;
          f2 = c[b2 >> 2] | 0;
          vg(g2, a2 + 8 | 0, (c[d2 >> 2] | 0) - f2 >> 2);
          a2 = c[g2 >> 2] | 0;
          e2 = g2 + 4 | 0;
          if ((a2 | 0) != (c[e2 >> 2] | 0)) {
            d2 = f2;
            do {
              c[a2 >> 2] = c[d2 >> 2];
              a2 = (c[g2 >> 2] | 0) + 4 | 0;
              c[g2 >> 2] = a2;
              d2 = d2 + 4 | 0;
            } while ((a2 | 0) != (c[e2 >> 2] | 0));
            c[b2 >> 2] = d2;
          }
          wg(g2);
          V = h2;
          return;
        }
        function vg(a2, b2, d2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          d2 = d2 | 0;
          c[a2 >> 2] = c[b2 >> 2];
          c[a2 + 4 >> 2] = (c[b2 >> 2] | 0) + (d2 << 2);
          c[a2 + 8 >> 2] = b2;
          return;
        }
        function wg(a2) {
          a2 = a2 | 0;
          c[c[a2 + 8 >> 2] >> 2] = c[a2 >> 2];
          return;
        }
        function xg(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          return (c[a2 + 4 >> 2] | 0) == (c[b2 + 4 >> 2] | 0) | 0;
        }
        function yg(a2, b2, d2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          d2 = d2 | 0;
          c[a2 >> 2] = b2;
          c[a2 + 4 >> 2] = d2;
          return;
        }
        function zg(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          var d2 = 0, e2 = 0, f2 = 0, g2 = 0;
          g2 = c[b2 + 4 >> 2] | 0;
          d2 = c[b2 + 16 >> 2] | 0;
          e2 = (d2 >>> 0) / 93 | 0;
          f2 = g2 + (e2 << 2) | 0;
          if ((c[b2 + 8 >> 2] | 0) == (g2 | 0))
            b2 = 0;
          else
            b2 = (c[f2 >> 2] | 0) + ((d2 - (e2 * 93 | 0) | 0) * 44 | 0) | 0;
          c[a2 >> 2] = f2;
          c[a2 + 4 >> 2] = b2;
          return;
        }
        function Ag(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          var d2 = 0, e2 = 0, f2 = 0, g2 = 0;
          d2 = (c[b2 + 16 >> 2] | 0) + (c[b2 + 20 >> 2] | 0) | 0;
          g2 = c[b2 + 4 >> 2] | 0;
          e2 = (d2 >>> 0) / 93 | 0;
          f2 = g2 + (e2 << 2) | 0;
          if ((c[b2 + 8 >> 2] | 0) == (g2 | 0))
            b2 = 0;
          else
            b2 = (c[f2 >> 2] | 0) + ((d2 - (e2 * 93 | 0) | 0) * 44 | 0) | 0;
          c[a2 >> 2] = f2;
          c[a2 + 4 >> 2] = b2;
          return;
        }
        function Bg(a2) {
          a2 = a2 | 0;
          var b2 = 0, d2 = 0, e2 = 0, f2 = 0, g2 = 0, h2 = 0, i2 = 0;
          i2 = V;
          V = V + 16 | 0;
          e2 = i2 + 8 | 0;
          g2 = i2;
          Cg(e2, a2);
          fg(g2, a2);
          f2 = e2 + 4 | 0;
          b2 = c[f2 >> 2] | 0;
          g2 = g2 + 4 | 0;
          if ((b2 | 0) != (c[g2 >> 2] | 0))
            do {
              Ic(b2);
              b2 = (c[f2 >> 2] | 0) + 44 | 0;
              c[f2 >> 2] = b2;
              d2 = c[e2 >> 2] | 0;
              if ((b2 - (c[d2 >> 2] | 0) | 0) == 4092) {
                b2 = d2 + 4 | 0;
                c[e2 >> 2] = b2;
                b2 = c[b2 >> 2] | 0;
                c[f2 >> 2] = b2;
              }
            } while ((b2 | 0) != (c[g2 >> 2] | 0));
          c[a2 + 20 >> 2] = 0;
          f2 = a2 + 8 | 0;
          e2 = a2 + 4 | 0;
          d2 = c[e2 >> 2] | 0;
          b2 = (c[f2 >> 2] | 0) - d2 >> 2;
          if (b2 >>> 0 > 2)
            do {
              Da(c[d2 >> 2] | 0, 4092);
              d2 = (c[e2 >> 2] | 0) + 4 | 0;
              c[e2 >> 2] = d2;
              b2 = (c[f2 >> 2] | 0) - d2 >> 2;
            } while (b2 >>> 0 > 2);
          switch (b2 | 0) {
            case 1: {
              b2 = 46;
              h2 = 11;
              break;
            }
            case 2: {
              b2 = 93;
              h2 = 11;
              break;
            }
            default: {
            }
          }
          if ((h2 | 0) == 11)
            c[a2 + 16 >> 2] = b2;
          V = i2;
          return;
        }
        function Cg(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          var d2 = 0, e2 = 0, f2 = 0, g2 = 0;
          g2 = c[b2 + 4 >> 2] | 0;
          d2 = c[b2 + 16 >> 2] | 0;
          e2 = (d2 >>> 0) / 93 | 0;
          f2 = g2 + (e2 << 2) | 0;
          if ((c[b2 + 8 >> 2] | 0) == (g2 | 0))
            b2 = 0;
          else
            b2 = (c[f2 >> 2] | 0) + ((d2 - (e2 * 93 | 0) | 0) * 44 | 0) | 0;
          c[a2 >> 2] = f2;
          c[a2 + 4 >> 2] = b2;
          return;
        }
        function Dg(b2, e2, f2) {
          b2 = b2 | 0;
          e2 = e2 | 0;
          f2 = f2 | 0;
          var g2 = 0, h2 = 0, i2 = 0, j2 = 0, k2 = 0, l2 = 0, m2 = 0;
          m2 = V;
          V = V + 16 | 0;
          l2 = m2;
          j2 = b2 + 4 | 0;
          if (!(a[j2 >> 0] | 0)) {
            l2 = De(e2) | 0;
            Ee(l2, f2, c[b2 >> 2] | 0);
            l2 = c[b2 >> 2] | 0;
            i2 = f2 + l2 | 0;
            if (!l2)
              g2 = 0;
            else {
              g2 = f2;
              h2 = c[b2 + 8 >> 2] | 0;
              while (1) {
                a[h2 >> 0] = a[g2 >> 0] | 0;
                g2 = g2 + 1 | 0;
                if ((g2 | 0) == (i2 | 0))
                  break;
                else
                  h2 = h2 + 1 | 0;
              }
              g2 = c[b2 >> 2] | 0;
            }
            a[j2 >> 0] = 1;
            f2 = f2 + g2 | 0;
          } else {
            h2 = c[b2 + 20 >> 2] | 0;
            g2 = c[b2 + 8 >> 2] | 0;
            Cg(l2, b2 + 32 | 0);
            b2 = b2 + 12 | 0;
            if ((g2 | 0) != (c[b2 >> 2] | 0)) {
              k2 = l2 + 4 | 0;
              j2 = g2;
              i2 = h2;
              g2 = c[k2 >> 2] | 0;
              while (1) {
                h2 = d[j2 >> 0] | 0;
                h2 = Eg((Zc(e2, g2) | 0) + h2 | 0) | 0;
                a[i2 >> 0] = h2;
                a[f2 >> 0] = h2;
                a[j2 >> 0] = h2;
                j2 = j2 + 1 | 0;
                f2 = f2 + 1 | 0;
                h2 = c[l2 >> 2] | 0;
                g2 = (c[k2 >> 2] | 0) + 44 | 0;
                c[k2 >> 2] = g2;
                if ((g2 - (c[h2 >> 2] | 0) | 0) == 4092) {
                  g2 = h2 + 4 | 0;
                  c[l2 >> 2] = g2;
                  g2 = c[g2 >> 2] | 0;
                  c[k2 >> 2] = g2;
                }
                if ((j2 | 0) == (c[b2 >> 2] | 0))
                  break;
                else
                  i2 = i2 + 1 | 0;
              }
            }
          }
          V = m2;
          return f2 | 0;
        }
        function Eg(a2) {
          a2 = a2 | 0;
          return a2 & 255 | 0;
        }
        function Fg(a2) {
          a2 = a2 | 0;
          pq(a2);
          jp(a2);
          return;
        }
        function Gg(a2) {
          a2 = a2 | 0;
          a2 = c[a2 + 12 >> 2] | 0;
          if (a2 | 0)
            ca[c[(c[a2 >> 2] | 0) + 4 >> 2] & 255](a2);
          return;
        }
        function Hg(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          return ((c[b2 + 4 >> 2] | 0) == 11262 ? a2 + 12 | 0 : 0) | 0;
        }
        function Ig(a2) {
          a2 = a2 | 0;
          Da(a2, 16);
          return;
        }
        function Jg(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          c[a2 >> 2] = 0;
          c[a2 + 4 >> 2] = 0;
          c[a2 + 8 >> 2] = 0;
          if (b2 | 0) {
            Yf(a2, b2);
            Lg(a2, b2);
          }
          return;
        }
        function Kg(a2, b2, d2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          d2 = d2 | 0;
          c[a2 >> 2] = 0;
          c[a2 + 4 >> 2] = 0;
          c[a2 + 8 >> 2] = 0;
          c[a2 + 12 >> 2] = 0;
          c[a2 + 16 >> 2] = 0;
          c[a2 + 20 >> 2] = 0;
          if (b2 | 0)
            Mg(a2, b2, d2);
          return;
        }
        function Lg(b2, d2) {
          b2 = b2 | 0;
          d2 = d2 | 0;
          var e2 = 0, f2 = 0, g2 = 0;
          g2 = V;
          V = V + 16 | 0;
          f2 = g2;
          ag(f2, b2, d2);
          d2 = f2 + 4 | 0;
          b2 = c[d2 >> 2] | 0;
          e2 = f2 + 8 | 0;
          if ((b2 | 0) != (c[e2 >> 2] | 0))
            do {
              a[b2 >> 0] = 0;
              b2 = (c[d2 >> 2] | 0) + 1 | 0;
              c[d2 >> 2] = b2;
            } while ((b2 | 0) != (c[e2 >> 2] | 0));
          bg(f2);
          V = g2;
          return;
        }
        function Mg(a2, b2, d2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          d2 = d2 | 0;
          var e2 = 0, f2 = 0, g2 = 0, h2 = 0, i2 = 0, j2 = 0, k2 = 0, l2 = 0, m2 = 0, n2 = 0, o2 = 0;
          o2 = V;
          V = V + 96 | 0;
          n2 = o2 + 80 | 0;
          k2 = o2 + 64 | 0;
          h2 = o2 + 48 | 0;
          i2 = o2 + 40 | 0;
          j2 = o2 + 8 | 0;
          f2 = o2;
          l2 = o2 + 32 | 0;
          m2 = o2 + 16 | 0;
          e2 = (c[a2 + 8 >> 2] | 0) - (c[a2 + 4 >> 2] | 0) | 0;
          e2 = ((e2 | 0) == 0 ? 0 : ((e2 >> 2) * 93 | 0) + -1 | 0) - ((c[a2 + 20 >> 2] | 0) + (c[a2 + 16 >> 2] | 0)) | 0;
          if (e2 >>> 0 < b2 >>> 0)
            eg(a2, b2 - e2 | 0);
          fg(i2, a2);
          fg(f2, a2);
          e2 = c[f2 >> 2] | 0;
          f2 = c[f2 + 4 >> 2] | 0;
          g2 = j2;
          c[g2 >> 2] = e2;
          c[g2 + 4 >> 2] = f2;
          g2 = e2;
          if (b2 | 0) {
            e2 = ((f2 - (c[e2 >> 2] | 0) | 0) / 44 | 0) + b2 | 0;
            if ((e2 | 0) > 0) {
              b2 = (e2 >>> 0) / 93 | 0;
              g2 = g2 + (b2 << 2) | 0;
              c[j2 >> 2] = g2;
              e2 = (c[g2 >> 2] | 0) + ((e2 - (b2 * 93 | 0) | 0) * 44 | 0) | 0;
            } else {
              e2 = 92 - e2 | 0;
              b2 = g2 + (((e2 | 0) / -93 | 0) << 2) | 0;
              c[j2 >> 2] = b2;
              e2 = (c[b2 >> 2] | 0) + ((92 - ((e2 | 0) % 93 | 0) | 0) * 44 | 0) | 0;
            }
            c[j2 + 4 >> 2] = e2;
          }
          c[k2 >> 2] = c[i2 >> 2];
          c[k2 + 4 >> 2] = c[i2 + 4 >> 2];
          c[n2 >> 2] = c[j2 >> 2];
          c[n2 + 4 >> 2] = c[j2 + 4 >> 2];
          gg(h2, k2, n2);
          hg(n2, h2);
          ig(k2, h2);
          if (jg(n2, k2) | 0) {
            f2 = m2 + 4 | 0;
            do {
              kg(l2, n2);
              lg(m2, a2, l2);
              e2 = c[m2 >> 2] | 0;
              if ((e2 | 0) != (c[f2 >> 2] | 0))
                do {
                  Wc(e2, d2);
                  e2 = (c[m2 >> 2] | 0) + 44 | 0;
                  c[m2 >> 2] = e2;
                } while ((e2 | 0) != (c[f2 >> 2] | 0));
              mg(m2);
              ng(n2) | 0;
            } while (jg(n2, k2) | 0);
          }
          V = o2;
          return;
        }
        function Ng(a2) {
          a2 = a2 | 0;
          var b2 = 0, d2 = 0;
          Bg(a2);
          b2 = c[a2 + 4 >> 2] | 0;
          d2 = c[a2 + 8 >> 2] | 0;
          if ((b2 | 0) != (d2 | 0))
            do {
              Da(c[b2 >> 2] | 0, 4092);
              b2 = b2 + 4 | 0;
            } while ((b2 | 0) != (d2 | 0));
          dg(a2);
          return;
        }
        function Og(a2, b2, d2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          d2 = d2 | 0;
          Md(a2);
          c[a2 >> 2] = 4924;
          c[a2 + 4 >> 2] = b2;
          c[a2 + 8 >> 2] = d2;
          return;
        }
        function Pg(a2, b2, d2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          d2 = d2 | 0;
          var e2 = 0, f2 = 0;
          d2 = V;
          V = V + 16 | 0;
          e2 = d2;
          c[a2 >> 2] = b2;
          f2 = eq(16) | 0;
          c[f2 + 4 >> 2] = 0;
          c[f2 + 8 >> 2] = 0;
          c[f2 >> 2] = 4944;
          c[f2 + 12 >> 2] = b2;
          c[a2 + 4 >> 2] = f2;
          c[e2 >> 2] = b2;
          c[e2 + 4 >> 2] = b2;
          Wg(a2, e2);
          V = d2;
          return;
        }
        function Qg(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          return Tg(c[a2 + 8 >> 2] | 0, c[a2 + 4 >> 2] | 0, b2) | 0;
        }
        function Rg(a2) {
          a2 = a2 | 0;
          var b2 = 0, d2 = 0;
          c[a2 >> 2] = 4924;
          d2 = a2 + 8 | 0;
          b2 = c[d2 >> 2] | 0;
          c[d2 >> 2] = 0;
          if (b2 | 0) {
            Vg(b2);
            jp(b2);
          }
          Qd(a2);
          return;
        }
        function Sg(a2) {
          a2 = a2 | 0;
          Rg(a2);
          jp(a2);
          return;
        }
        function Tg(a2, b2, c2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          c2 = c2 | 0;
          return Ug(a2 + 4784 | 0, b2, Be(a2, b2, c2) | 0) | 0;
        }
        function Ug(b2, c2, d2) {
          b2 = b2 | 0;
          c2 = c2 | 0;
          d2 = d2 | 0;
          if (a[b2 >> 0] | 0) {
            nc(c2);
            a[b2 >> 0] = 0;
          }
          return d2 | 0;
        }
        function Vg(a2) {
          a2 = a2 | 0;
          ze(a2);
          return;
        }
        function Wg(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          return;
        }
        function Xg(a2) {
          a2 = a2 | 0;
          pq(a2);
          jp(a2);
          return;
        }
        function Yg(a2) {
          a2 = a2 | 0;
          a2 = c[a2 + 12 >> 2] | 0;
          if (a2 | 0)
            ca[c[(c[a2 >> 2] | 0) + 8 >> 2] & 255](a2);
          return;
        }
        function Zg(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          return ((c[b2 + 4 >> 2] | 0) == 12004 ? a2 + 12 | 0 : 0) | 0;
        }
        function _g(a2) {
          a2 = a2 | 0;
          Da(a2, 16);
          return;
        }
        function $g(b2) {
          b2 = b2 | 0;
          a[b2 >> 0] = 1;
          return;
        }
        function ah(a2, b2, d2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          d2 = d2 | 0;
          Md(a2);
          c[a2 >> 2] = 4972;
          c[a2 + 4 >> 2] = b2;
          c[a2 + 8 >> 2] = d2;
          return;
        }
        function bh(a2, b2, d2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          d2 = d2 | 0;
          var e2 = 0, f2 = 0;
          d2 = V;
          V = V + 16 | 0;
          e2 = d2;
          c[a2 >> 2] = b2;
          f2 = eq(16) | 0;
          c[f2 + 4 >> 2] = 0;
          c[f2 + 8 >> 2] = 0;
          c[f2 >> 2] = 4992;
          c[f2 + 12 >> 2] = b2;
          c[a2 + 4 >> 2] = f2;
          c[e2 >> 2] = b2;
          c[e2 + 4 >> 2] = b2;
          Wg(a2, e2);
          V = d2;
          return;
        }
        function ch(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          return fh(c[a2 + 8 >> 2] | 0, c[a2 + 4 >> 2] | 0, b2) | 0;
        }
        function dh(a2) {
          a2 = a2 | 0;
          var b2 = 0, d2 = 0;
          c[a2 >> 2] = 4972;
          d2 = a2 + 8 | 0;
          b2 = c[d2 >> 2] | 0;
          c[d2 >> 2] = 0;
          if (b2 | 0) {
            hh(b2);
            jp(b2);
          }
          Qd(a2);
          return;
        }
        function eh(a2) {
          a2 = a2 | 0;
          dh(a2);
          jp(a2);
          return;
        }
        function fh(a2, b2, c2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          c2 = c2 | 0;
          return gh(a2 + 4784 | 0, b2, Be(a2, b2, c2) | 0) | 0;
        }
        function gh(a2, b2, c2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          c2 = c2 | 0;
          return Ug(a2 + 328 | 0, b2, qf(a2, b2, c2) | 0) | 0;
        }
        function hh(a2) {
          a2 = a2 | 0;
          ih(a2 + 4784 | 0);
          ze(a2);
          return;
        }
        function ih(a2) {
          a2 = a2 | 0;
          of(a2);
          return;
        }
        function jh(a2) {
          a2 = a2 | 0;
          pq(a2);
          jp(a2);
          return;
        }
        function kh(a2) {
          a2 = a2 | 0;
          a2 = c[a2 + 12 >> 2] | 0;
          if (a2 | 0)
            ca[c[(c[a2 >> 2] | 0) + 8 >> 2] & 255](a2);
          return;
        }
        function lh(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          return ((c[b2 + 4 >> 2] | 0) == 12827 ? a2 + 12 | 0 : 0) | 0;
        }
        function mh(a2) {
          a2 = a2 | 0;
          Da(a2, 16);
          return;
        }
        function nh(a2) {
          a2 = a2 | 0;
          cf(a2);
          $g(a2 + 328 | 0);
          return;
        }
        function oh(a2, b2, d2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          d2 = d2 | 0;
          Md(a2);
          c[a2 >> 2] = 5020;
          c[a2 + 4 >> 2] = b2;
          c[a2 + 8 >> 2] = d2;
          return;
        }
        function ph(a2, b2, d2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          d2 = d2 | 0;
          var e2 = 0, f2 = 0;
          d2 = V;
          V = V + 16 | 0;
          e2 = d2;
          c[a2 >> 2] = b2;
          f2 = eq(16) | 0;
          c[f2 + 4 >> 2] = 0;
          c[f2 + 8 >> 2] = 0;
          c[f2 >> 2] = 5040;
          c[f2 + 12 >> 2] = b2;
          c[a2 + 4 >> 2] = f2;
          c[e2 >> 2] = b2;
          c[e2 + 4 >> 2] = b2;
          Wg(a2, e2);
          V = d2;
          return;
        }
        function qh(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          return th(c[a2 + 8 >> 2] | 0, c[a2 + 4 >> 2] | 0, b2) | 0;
        }
        function rh(a2) {
          a2 = a2 | 0;
          var b2 = 0, d2 = 0;
          c[a2 >> 2] = 5020;
          d2 = a2 + 8 | 0;
          b2 = c[d2 >> 2] | 0;
          c[d2 >> 2] = 0;
          if (b2 | 0) {
            vh(b2);
            jp(b2);
          }
          Qd(a2);
          return;
        }
        function sh(a2) {
          a2 = a2 | 0;
          rh(a2);
          jp(a2);
          return;
        }
        function th(a2, b2, c2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          c2 = c2 | 0;
          return uh(a2 + 4784 | 0, b2, Be(a2, b2, c2) | 0) | 0;
        }
        function uh(a2, b2, c2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          c2 = c2 | 0;
          return Ug(a2 + 316 | 0, b2, If(a2, b2, c2) | 0) | 0;
        }
        function vh(a2) {
          a2 = a2 | 0;
          wh(a2 + 4784 | 0);
          ze(a2);
          return;
        }
        function wh(a2) {
          a2 = a2 | 0;
          Hf(a2);
          return;
        }
        function xh(a2) {
          a2 = a2 | 0;
          pq(a2);
          jp(a2);
          return;
        }
        function yh(a2) {
          a2 = a2 | 0;
          a2 = c[a2 + 12 >> 2] | 0;
          if (a2 | 0)
            ca[c[(c[a2 >> 2] | 0) + 8 >> 2] & 255](a2);
          return;
        }
        function zh(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          return ((c[b2 + 4 >> 2] | 0) == 13672 ? a2 + 12 | 0 : 0) | 0;
        }
        function Ah(a2) {
          a2 = a2 | 0;
          Da(a2, 16);
          return;
        }
        function Bh(a2) {
          a2 = a2 | 0;
          Cf(a2);
          $g(a2 + 316 | 0);
          return;
        }
        function Ch(a2, b2, d2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          d2 = d2 | 0;
          Md(a2);
          c[a2 >> 2] = 5068;
          c[a2 + 4 >> 2] = b2;
          c[a2 + 8 >> 2] = d2;
          return;
        }
        function Dh(a2, b2, d2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          d2 = d2 | 0;
          var e2 = 0, f2 = 0;
          d2 = V;
          V = V + 16 | 0;
          e2 = d2;
          c[a2 >> 2] = b2;
          f2 = eq(16) | 0;
          c[f2 + 4 >> 2] = 0;
          c[f2 + 8 >> 2] = 0;
          c[f2 >> 2] = 5088;
          c[f2 + 12 >> 2] = b2;
          c[a2 + 4 >> 2] = f2;
          c[e2 >> 2] = b2;
          c[e2 + 4 >> 2] = b2;
          Wg(a2, e2);
          V = d2;
          return;
        }
        function Eh(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          return Hh(c[a2 + 8 >> 2] | 0, c[a2 + 4 >> 2] | 0, b2) | 0;
        }
        function Fh(a2) {
          a2 = a2 | 0;
          var b2 = 0, d2 = 0;
          c[a2 >> 2] = 5068;
          d2 = a2 + 8 | 0;
          b2 = c[d2 >> 2] | 0;
          c[d2 >> 2] = 0;
          if (b2 | 0) {
            Jh(b2);
            jp(b2);
          }
          Qd(a2);
          return;
        }
        function Gh(a2) {
          a2 = a2 | 0;
          Fh(a2);
          jp(a2);
          return;
        }
        function Hh(a2, b2, c2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          c2 = c2 | 0;
          return Ih(a2 + 4784 | 0, b2, Be(a2, b2, c2) | 0) | 0;
        }
        function Ih(a2, b2, c2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          c2 = c2 | 0;
          return uh(a2 + 328 | 0, b2, qf(a2, b2, c2) | 0) | 0;
        }
        function Jh(a2) {
          a2 = a2 | 0;
          Kh(a2 + 4784 | 0);
          ze(a2);
          return;
        }
        function Kh(a2) {
          a2 = a2 | 0;
          wh(a2 + 328 | 0);
          of(a2);
          return;
        }
        function Lh(a2) {
          a2 = a2 | 0;
          pq(a2);
          jp(a2);
          return;
        }
        function Mh(a2) {
          a2 = a2 | 0;
          a2 = c[a2 + 12 >> 2] | 0;
          if (a2 | 0)
            ca[c[(c[a2 >> 2] | 0) + 8 >> 2] & 255](a2);
          return;
        }
        function Nh(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          return ((c[b2 + 4 >> 2] | 0) == 14573 ? a2 + 12 | 0 : 0) | 0;
        }
        function Oh(a2) {
          a2 = a2 | 0;
          Da(a2, 16);
          return;
        }
        function Ph(a2) {
          a2 = a2 | 0;
          cf(a2);
          Bh(a2 + 328 | 0);
          return;
        }
        function Qh(a2) {
          a2 = a2 | 0;
          return a2 + 20 | 0;
        }
        function Rh(a2, b2, d2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          d2 = d2 | 0;
          c[a2 >> 2] = b2;
          c[a2 + 4 >> 2] = d2;
          c[a2 + 8 >> 2] = 0;
          return;
        }
        function Sh(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          c[a2 >> 2] = b2;
          c[a2 + 4 >> 2] = 0;
          c[a2 + 8 >> 2] = -1;
          return;
        }
        function Th(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          var d2 = 0, e2 = 0, f2 = 0, g2 = 0;
          d2 = V;
          V = V + 16 | 0;
          e2 = d2 + 4 | 0;
          g2 = d2;
          f2 = eq(24) | 0;
          ii(f2, b2);
          c[g2 >> 2] = 0;
          c[e2 >> 2] = c[g2 >> 2];
          ji(a2, f2, e2);
          V = d2;
          return;
        }
        function Uh(a2) {
          a2 = a2 | 0;
          var b2 = 0, d2 = 0;
          a2 = c[a2 + 4 >> 2] | 0;
          if (a2 | 0 ? (d2 = a2 + 4 | 0, b2 = c[d2 >> 2] | 0, c[d2 >> 2] = b2 + -1, (b2 | 0) == 0) : 0) {
            ca[c[(c[a2 >> 2] | 0) + 8 >> 2] & 255](a2);
            qq(a2);
          }
          return;
        }
        function Vh(a2, b2, d2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          d2 = d2 | 0;
          var e2 = 0, f2 = 0;
          d2 = V;
          V = V + 16 | 0;
          e2 = d2;
          c[a2 >> 2] = b2;
          f2 = eq(16) | 0;
          c[f2 + 4 >> 2] = 0;
          c[f2 + 8 >> 2] = 0;
          c[f2 >> 2] = 5116;
          c[f2 + 12 >> 2] = b2;
          c[a2 + 4 >> 2] = f2;
          c[e2 >> 2] = b2;
          c[e2 + 4 >> 2] = b2;
          Xh(a2, e2);
          V = d2;
          return;
        }
        function Wh(a2) {
          a2 = a2 | 0;
          var b2 = 0, d2 = 0;
          a2 = c[a2 + 4 >> 2] | 0;
          if (a2 | 0 ? (d2 = a2 + 4 | 0, b2 = c[d2 >> 2] | 0, c[d2 >> 2] = b2 + -1, (b2 | 0) == 0) : 0) {
            ca[c[(c[a2 >> 2] | 0) + 8 >> 2] & 255](a2);
            qq(a2);
          }
          return;
        }
        function Xh(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          return;
        }
        function Yh(a2) {
          a2 = a2 | 0;
          pq(a2);
          jp(a2);
          return;
        }
        function Zh(a2) {
          a2 = a2 | 0;
          a2 = c[a2 + 12 >> 2] | 0;
          if (a2 | 0)
            jp(a2);
          return;
        }
        function _h(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          return ((c[b2 + 4 >> 2] | 0) == 14966 ? a2 + 12 | 0 : 0) | 0;
        }
        function $h(a2) {
          a2 = a2 | 0;
          Da(a2, 16);
          return;
        }
        function ai(a2, b2, d2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          d2 = d2 | 0;
          var e2 = 0, f2 = 0;
          d2 = V;
          V = V + 16 | 0;
          e2 = d2;
          c[a2 >> 2] = b2;
          f2 = eq(16) | 0;
          c[f2 + 4 >> 2] = 0;
          c[f2 + 8 >> 2] = 0;
          c[f2 >> 2] = 5144;
          c[f2 + 12 >> 2] = b2;
          c[a2 + 4 >> 2] = f2;
          c[e2 >> 2] = b2;
          c[e2 + 4 >> 2] = b2;
          ci(a2, e2);
          V = d2;
          return;
        }
        function bi(a2) {
          a2 = a2 | 0;
          var b2 = 0, d2 = 0;
          a2 = c[a2 + 4 >> 2] | 0;
          if (a2 | 0 ? (d2 = a2 + 4 | 0, b2 = c[d2 >> 2] | 0, c[d2 >> 2] = b2 + -1, (b2 | 0) == 0) : 0) {
            ca[c[(c[a2 >> 2] | 0) + 8 >> 2] & 255](a2);
            qq(a2);
          }
          return;
        }
        function ci(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          return;
        }
        function di(a2) {
          a2 = a2 | 0;
          pq(a2);
          jp(a2);
          return;
        }
        function ei(a2) {
          a2 = a2 | 0;
          a2 = c[a2 + 12 >> 2] | 0;
          if (a2 | 0) {
            hi(a2);
            jp(a2);
          }
          return;
        }
        function fi(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          return ((c[b2 + 4 >> 2] | 0) == 15127 ? a2 + 12 | 0 : 0) | 0;
        }
        function gi(a2) {
          a2 = a2 | 0;
          Da(a2, 16);
          return;
        }
        function hi(a2) {
          a2 = a2 | 0;
          return;
        }
        function ii(b2, d2) {
          b2 = b2 | 0;
          d2 = d2 | 0;
          Md(b2);
          c[b2 >> 2] = 5172;
          c[b2 + 4 >> 2] = d2;
          c[b2 + 8 >> 2] = 0;
          c[b2 + 12 >> 2] = 0;
          c[b2 + 16 >> 2] = 0;
          a[b2 + 20 >> 0] = 1;
          return;
        }
        function ji(a2, b2, d2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          d2 = d2 | 0;
          var e2 = 0, f2 = 0;
          d2 = V;
          V = V + 16 | 0;
          e2 = d2;
          c[a2 >> 2] = b2;
          f2 = eq(16) | 0;
          c[f2 + 4 >> 2] = 0;
          c[f2 + 8 >> 2] = 0;
          c[f2 >> 2] = 5192;
          c[f2 + 12 >> 2] = b2;
          c[a2 + 4 >> 2] = f2;
          c[e2 >> 2] = b2;
          c[e2 + 4 >> 2] = b2;
          pi(a2, e2);
          V = d2;
          return;
        }
        function ki(b2, d2) {
          b2 = b2 | 0;
          d2 = d2 | 0;
          var e2 = 0, f2 = 0, g2 = 0, h2 = 0, i2 = 0, j2 = 0, k2 = 0;
          k2 = V;
          V = V + 16 | 0;
          h2 = k2;
          e2 = c[b2 + 8 >> 2] | 0;
          i2 = c[b2 + 12 >> 2] | 0;
          if ((e2 | 0) != (i2 | 0)) {
            j2 = h2 + 4 | 0;
            do {
              f2 = c[e2 >> 2] | 0;
              c[h2 >> 2] = f2;
              g2 = c[e2 + 4 >> 2] | 0;
              c[j2 >> 2] = g2;
              if (g2 | 0) {
                g2 = g2 + 4 | 0;
                c[g2 >> 2] = (c[g2 >> 2] | 0) + 1;
              }
              d2 = $[c[(c[f2 >> 2] | 0) + 12 >> 2] & 63](f2, d2) | 0;
              Sd(h2);
              e2 = e2 + 8 | 0;
            } while ((e2 | 0) != (i2 | 0));
          }
          e2 = b2 + 20 | 0;
          if (a[e2 >> 0] | 0) {
            a[e2 >> 0] = 0;
            ni(c[b2 + 4 >> 2] | 0);
          }
          V = k2;
          return d2 | 0;
        }
        function li(a2) {
          a2 = a2 | 0;
          c[a2 >> 2] = 5172;
          Td(a2 + 8 | 0);
          Qd(a2);
          return;
        }
        function mi(a2) {
          a2 = a2 | 0;
          li(a2);
          jp(a2);
          return;
        }
        function ni(a2) {
          a2 = a2 | 0;
          var b2 = 0;
          b2 = ((oi(c[a2 >> 2] | 0) | 0) & 255) << 24;
          b2 = ((oi(c[a2 >> 2] | 0) | 0) & 255) << 16 | b2;
          b2 = b2 | ((oi(c[a2 >> 2] | 0) | 0) & 255) << 8;
          c[a2 + 4 >> 2] = b2 | (oi(c[a2 >> 2] | 0) | 0) & 255;
          return;
        }
        function oi(b2) {
          b2 = b2 | 0;
          var d2 = 0, e2 = 0;
          d2 = c[b2 >> 2] | 0;
          e2 = b2 + 8 | 0;
          b2 = c[e2 >> 2] | 0;
          c[e2 >> 2] = b2 + 1;
          return a[d2 + b2 >> 0] | 0;
        }
        function pi(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          return;
        }
        function qi(a2) {
          a2 = a2 | 0;
          pq(a2);
          jp(a2);
          return;
        }
        function ri(a2) {
          a2 = a2 | 0;
          a2 = c[a2 + 12 >> 2] | 0;
          if (a2 | 0)
            ca[c[(c[a2 >> 2] | 0) + 8 >> 2] & 255](a2);
          return;
        }
        function si(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          return ((c[b2 + 4 >> 2] | 0) == 15450 ? a2 + 12 | 0 : 0) | 0;
        }
        function ti(a2) {
          a2 = a2 | 0;
          Da(a2, 16);
          return;
        }
        function ui(a2) {
          a2 = a2 | 0;
          var b2 = 0, d2 = 0, e2 = 0, f2 = 0, g2 = 0, h2 = 0, i2 = 0, j2 = 0, k2 = 0, l2 = 0;
          j2 = V;
          V = V + 32 | 0;
          e2 = j2 + 12 | 0;
          f2 = j2;
          b2 = j2 + 8 | 0;
          h2 = eq(180) | 0;
          wi(h2, c[a2 + 4 >> 2] | 0);
          g2 = a2 + 8 | 0;
          c[b2 >> 2] = 0;
          c[e2 >> 2] = c[b2 >> 2];
          xi(f2, h2, e2);
          h2 = a2 + 12 | 0;
          b2 = c[h2 >> 2] | 0;
          i2 = a2 + 16 | 0;
          do
            if (b2 >>> 0 >= (c[i2 >> 2] | 0) >>> 0) {
              b2 = (b2 - (c[g2 >> 2] | 0) >> 3) + 1 | 0;
              d2 = ee(g2) | 0;
              if (d2 >>> 0 < b2 >>> 0)
                cr(g2);
              else {
                k2 = c[g2 >> 2] | 0;
                l2 = (c[i2 >> 2] | 0) - k2 | 0;
                i2 = l2 >> 2;
                be(
                  e2,
                  l2 >> 3 >>> 0 < d2 >>> 1 >>> 0 ? i2 >>> 0 < b2 >>> 0 ? b2 : i2 : d2,
                  (c[h2 >> 2] | 0) - k2 >> 3,
                  a2 + 16 | 0
                );
                i2 = e2 + 8 | 0;
                h2 = c[i2 >> 2] | 0;
                c[h2 >> 2] = c[f2 >> 2];
                a2 = f2 + 4 | 0;
                c[h2 + 4 >> 2] = c[a2 >> 2];
                c[f2 >> 2] = 0;
                c[a2 >> 2] = 0;
                c[i2 >> 2] = h2 + 8;
                ce(g2, e2);
                de(e2);
                break;
              }
            } else {
              $d(e2, g2, 1);
              l2 = e2 + 4 | 0;
              k2 = c[l2 >> 2] | 0;
              c[k2 >> 2] = c[f2 >> 2];
              i2 = f2 + 4 | 0;
              c[k2 + 4 >> 2] = c[i2 >> 2];
              c[f2 >> 2] = 0;
              c[i2 >> 2] = 0;
              c[l2 >> 2] = k2 + 8;
              ae(e2);
            }
          while (0);
          Sd(f2);
          V = j2;
          return;
        }
        function vi(a2) {
          a2 = a2 | 0;
          var b2 = 0, d2 = 0, e2 = 0, f2 = 0, g2 = 0, h2 = 0, i2 = 0, j2 = 0, k2 = 0, l2 = 0;
          j2 = V;
          V = V + 32 | 0;
          e2 = j2 + 12 | 0;
          f2 = j2;
          b2 = j2 + 8 | 0;
          h2 = eq(180) | 0;
          Ui(h2, c[a2 + 4 >> 2] | 0);
          g2 = a2 + 8 | 0;
          c[b2 >> 2] = 0;
          c[e2 >> 2] = c[b2 >> 2];
          Vi(f2, h2, e2);
          h2 = a2 + 12 | 0;
          b2 = c[h2 >> 2] | 0;
          i2 = a2 + 16 | 0;
          do
            if (b2 >>> 0 >= (c[i2 >> 2] | 0) >>> 0) {
              b2 = (b2 - (c[g2 >> 2] | 0) >> 3) + 1 | 0;
              d2 = ee(g2) | 0;
              if (d2 >>> 0 < b2 >>> 0)
                cr(g2);
              else {
                k2 = c[g2 >> 2] | 0;
                l2 = (c[i2 >> 2] | 0) - k2 | 0;
                i2 = l2 >> 2;
                be(
                  e2,
                  l2 >> 3 >>> 0 < d2 >>> 1 >>> 0 ? i2 >>> 0 < b2 >>> 0 ? b2 : i2 : d2,
                  (c[h2 >> 2] | 0) - k2 >> 3,
                  a2 + 16 | 0
                );
                i2 = e2 + 8 | 0;
                h2 = c[i2 >> 2] | 0;
                c[h2 >> 2] = c[f2 >> 2];
                a2 = f2 + 4 | 0;
                c[h2 + 4 >> 2] = c[a2 >> 2];
                c[f2 >> 2] = 0;
                c[a2 >> 2] = 0;
                c[i2 >> 2] = h2 + 8;
                ce(g2, e2);
                de(e2);
                break;
              }
            } else {
              $d(e2, g2, 1);
              l2 = e2 + 4 | 0;
              k2 = c[l2 >> 2] | 0;
              c[k2 >> 2] = c[f2 >> 2];
              i2 = f2 + 4 | 0;
              c[k2 + 4 >> 2] = c[i2 >> 2];
              c[f2 >> 2] = 0;
              c[i2 >> 2] = 0;
              c[l2 >> 2] = k2 + 8;
              ae(e2);
            }
          while (0);
          Sd(f2);
          V = j2;
          return;
        }
        function wi(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          fe(a2);
          c[a2 >> 2] = 5220;
          c[a2 + 4 >> 2] = b2;
          yi(a2 + 8 | 0);
          return;
        }
        function xi(a2, b2, d2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          d2 = d2 | 0;
          var e2 = 0, f2 = 0;
          d2 = V;
          V = V + 16 | 0;
          e2 = d2;
          c[a2 >> 2] = b2;
          f2 = eq(16) | 0;
          c[f2 + 4 >> 2] = 0;
          c[f2 + 8 >> 2] = 0;
          c[f2 >> 2] = 5244;
          c[f2 + 12 >> 2] = b2;
          c[a2 + 4 >> 2] = f2;
          c[e2 >> 2] = b2;
          c[e2 + 4 >> 2] = b2;
          Xe(a2, e2);
          V = d2;
          return;
        }
        function yi(b2) {
          b2 = b2 | 0;
          xe(b2, 32, 1, 8, 0);
          mc(b2 + 80 | 0, 32, 1, 8, 0);
          a[b2 + 160 >> 0] = 0;
          a[b2 + 161 >> 0] = 0;
          Ci(b2 + 164 | 0);
          return;
        }
        function zi(a2) {
          a2 = a2 | 0;
          c[a2 >> 2] = 5220;
          Di(a2 + 8 | 0);
          le(a2);
          return;
        }
        function Ai(a2) {
          a2 = a2 | 0;
          zi(a2);
          jp(a2);
          return;
        }
        function Bi(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          return Ei(a2 + 8 | 0, c[a2 + 4 >> 2] | 0, b2) | 0;
        }
        function Ci(b2) {
          b2 = b2 | 0;
          a[b2 + 4 >> 0] = 0;
          return;
        }
        function Di(a2) {
          a2 = a2 | 0;
          qc(a2 + 80 | 0);
          ye(a2);
          return;
        }
        function Ei(b2, d2, e2) {
          b2 = b2 | 0;
          d2 = d2 | 0;
          e2 = e2 | 0;
          var f2 = 0, g2 = 0, h2 = 0;
          h2 = V;
          V = V + 16 | 0;
          f2 = h2;
          if (!(a[b2 + 161 >> 0] | 0))
            oc(b2 + 80 | 0);
          g2 = b2 + 164 | 0;
          if (Fi(g2) | 0) {
            d2 = Gi(b2 + 80 | 0, d2, c[g2 >> 2] | 0, 0) | 0;
            c[f2 >> 2] = d2;
            Se(d2, e2);
          } else {
            Ii(Hi(d2) | 0, e2, 4);
            c[f2 >> 2] = Ne(e2) | 0;
          }
          Ji(g2, f2);
          V = h2;
          return e2 + 4 | 0;
        }
        function Fi(b2) {
          b2 = b2 | 0;
          return (a[b2 + 4 >> 0] | 0) != 0 | 0;
        }
        function Gi(a2, b2, d2, e2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          d2 = d2 | 0;
          e2 = e2 | 0;
          d2 = (Ki(a2, b2, (c[a2 + 36 >> 2] | 0) + (e2 * 44 | 0) | 0) | 0) + d2 | 0;
          b2 = c[a2 + 24 >> 2] | 0;
          if ((d2 | 0) < 0)
            return d2 + b2 | 0;
          else
            return d2 - (d2 >>> 0 < b2 >>> 0 ? 0 : b2) | 0;
          return 0;
        }
        function Hi(a2) {
          a2 = a2 | 0;
          return c[a2 >> 2] | 0;
        }
        function Ii(b2, c2, d2) {
          b2 = b2 | 0;
          c2 = c2 | 0;
          d2 = d2 | 0;
          var e2 = 0;
          if ((d2 | 0) > 0) {
            e2 = 0;
            do {
              a[c2 + e2 >> 0] = oi(b2) | 0;
              e2 = e2 + 1 | 0;
            } while ((e2 | 0) != (d2 | 0));
          }
          return;
        }
        function Ji(b2, d2) {
          b2 = b2 | 0;
          d2 = d2 | 0;
          var e2 = 0;
          e2 = b2 + 4 | 0;
          if (!(a[e2 >> 0] | 0))
            a[e2 >> 0] = 1;
          c[b2 >> 2] = c[d2 >> 2];
          return;
        }
        function Ki(a2, b2, d2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          d2 = d2 | 0;
          var e2 = 0;
          d2 = Li(b2, d2) | 0;
          c[a2 >> 2] = d2;
          do
            if (d2) {
              if (d2 >>> 0 >= 32) {
                d2 = c[a2 + 28 >> 2] | 0;
                break;
              }
              e2 = c[a2 + 12 >> 2] | 0;
              if (d2 >>> 0 > e2 >>> 0) {
                e2 = d2 - e2 | 0;
                d2 = Li(b2, (c[a2 + 68 >> 2] | 0) + ((d2 + -1 | 0) * 44 | 0) | 0) | 0;
                e2 = d2 << e2 | (Mi(b2, e2) | 0);
              } else
                e2 = Li(b2, (c[a2 + 68 >> 2] | 0) + ((d2 + -1 | 0) * 44 | 0) | 0) | 0;
              d2 = c[a2 >> 2] | 0;
              if ((e2 | 0) < (1 << d2 + -1 | 0)) {
                d2 = e2 + 1 + (-1 << d2) | 0;
                break;
              } else {
                d2 = e2 + 1 | 0;
                break;
              }
            } else
              d2 = Ni(b2, a2 + 48 | 0) | 0;
          while (0);
          return d2 | 0;
        }
        function Li(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          var d2 = 0, e2 = 0, f2 = 0, g2 = 0, h2 = 0, i2 = 0, j2 = 0, k2 = 0, l2 = 0, m2 = 0, n2 = 0, o2 = 0;
          n2 = a2 + 8 | 0;
          m2 = c[n2 >> 2] | 0;
          f2 = c[b2 + 16 >> 2] | 0;
          if (f2) {
            e2 = a2 + 4 | 0;
            d2 = c[e2 >> 2] | 0;
            l2 = m2 >>> 15;
            c[n2 >> 2] = l2;
            j2 = (d2 >>> 0) / (l2 >>> 0) | 0;
            i2 = j2 >>> (c[b2 + 40 >> 2] | 0);
            g2 = c[f2 + (i2 << 2) >> 2] | 0;
            i2 = (c[f2 + (i2 + 1 << 2) >> 2] | 0) + 1 | 0;
            h2 = g2 + 1 | 0;
            k2 = c[b2 + 8 >> 2] | 0;
            if (i2 >>> 0 > h2 >>> 0) {
              f2 = g2;
              g2 = i2;
              do {
                h2 = (g2 + f2 | 0) >>> 1;
                i2 = (c[k2 + (h2 << 2) >> 2] | 0) >>> 0 > j2 >>> 0;
                f2 = i2 ? f2 : h2;
                g2 = i2 ? h2 : g2;
                h2 = f2 + 1 | 0;
              } while (g2 >>> 0 > h2 >>> 0);
              g2 = f2;
            }
            f2 = q(c[k2 + (g2 << 2) >> 2] | 0, l2) | 0;
            if ((g2 | 0) == (c[b2 + 32 >> 2] | 0))
              h2 = m2;
            else
              h2 = q(c[k2 + (h2 << 2) >> 2] | 0, l2) | 0;
          } else {
            k2 = m2 >>> 15;
            c[n2 >> 2] = k2;
            i2 = c[b2 >> 2] | 0;
            l2 = c[b2 + 8 >> 2] | 0;
            e2 = a2 + 4 | 0;
            d2 = c[e2 >> 2] | 0;
            j2 = i2 >>> 1;
            f2 = 0;
            h2 = m2;
            g2 = 0;
            do {
              o2 = q(c[l2 + (j2 << 2) >> 2] | 0, k2) | 0;
              m2 = o2 >>> 0 > d2 >>> 0;
              h2 = m2 ? o2 : h2;
              f2 = m2 ? f2 : o2;
              g2 = m2 ? g2 : j2;
              i2 = m2 ? j2 : i2;
              j2 = (g2 + i2 | 0) >>> 1;
            } while ((j2 | 0) != (g2 | 0));
          }
          c[e2 >> 2] = d2 - f2;
          o2 = h2 - f2 | 0;
          c[n2 >> 2] = o2;
          if (o2 >>> 0 < 16777216)
            Oi(a2);
          n2 = (c[b2 + 12 >> 2] | 0) + (g2 << 2) | 0;
          c[n2 >> 2] = (c[n2 >> 2] | 0) + 1;
          n2 = b2 + 28 | 0;
          o2 = (c[n2 >> 2] | 0) + -1 | 0;
          c[n2 >> 2] = o2;
          if (!o2)
            Xc(b2);
          return g2 | 0;
        }
        function Mi(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          var d2 = 0, e2 = 0, f2 = 0, g2 = 0;
          if (b2 >>> 0 > 19) {
            d2 = (Pi(a2) | 0) & 65535;
            return (Mi(a2, b2 + -16 | 0) | 0) << 16 | d2 | 0;
          }
          e2 = a2 + 4 | 0;
          f2 = c[e2 >> 2] | 0;
          g2 = a2 + 8 | 0;
          d2 = (c[g2 >> 2] | 0) >>> b2;
          c[g2 >> 2] = d2;
          b2 = (f2 >>> 0) / (d2 >>> 0) | 0;
          c[e2 >> 2] = f2 - (q(b2, d2) | 0);
          if (d2 >>> 0 < 16777216)
            Oi(a2);
          return b2 | 0;
        }
        function Ni(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          var d2 = 0, e2 = 0, f2 = 0, g2 = 0, h2 = 0, i2 = 0;
          e2 = a2 + 8 | 0;
          f2 = c[e2 >> 2] | 0;
          d2 = q(f2 >>> 13, c[b2 + 8 >> 2] | 0) | 0;
          g2 = a2 + 4 | 0;
          h2 = c[g2 >> 2] | 0;
          i2 = h2 >>> 0 >= d2 >>> 0;
          if (i2) {
            c[g2 >> 2] = h2 - d2;
            d2 = f2 - d2 | 0;
            c[e2 >> 2] = d2;
          } else {
            c[e2 >> 2] = d2;
            h2 = b2 + 12 | 0;
            c[h2 >> 2] = (c[h2 >> 2] | 0) + 1;
          }
          if (d2 >>> 0 < 16777216)
            Oi(a2);
          h2 = b2 + 4 | 0;
          a2 = (c[h2 >> 2] | 0) + -1 | 0;
          c[h2 >> 2] = a2;
          if (!a2)
            cd(b2);
          return i2 & 1 | 0;
        }
        function Oi(a2) {
          a2 = a2 | 0;
          var b2 = 0, d2 = 0, e2 = 0, f2 = 0;
          b2 = a2 + 4 | 0;
          d2 = a2 + 8 | 0;
          e2 = c[b2 >> 2] | 0;
          do {
            e2 = e2 << 8 | (oi(c[a2 >> 2] | 0) | 0) & 255;
            c[b2 >> 2] = e2;
            f2 = c[d2 >> 2] << 8;
            c[d2 >> 2] = f2;
          } while (f2 >>> 0 < 16777216);
          return;
        }
        function Pi(a2) {
          a2 = a2 | 0;
          var b2 = 0, d2 = 0, e2 = 0, f2 = 0;
          d2 = a2 + 4 | 0;
          f2 = c[d2 >> 2] | 0;
          b2 = a2 + 8 | 0;
          e2 = (c[b2 >> 2] | 0) >>> 16;
          c[b2 >> 2] = e2;
          b2 = (f2 >>> 0) / (e2 >>> 0) | 0;
          c[d2 >> 2] = f2 - (q(b2, e2) | 0);
          Oi(a2);
          return b2 & 65535 | 0;
        }
        function Qi(a2) {
          a2 = a2 | 0;
          pq(a2);
          jp(a2);
          return;
        }
        function Ri(a2) {
          a2 = a2 | 0;
          a2 = c[a2 + 12 >> 2] | 0;
          if (a2 | 0)
            ca[c[(c[a2 >> 2] | 0) + 4 >> 2] & 255](a2);
          return;
        }
        function Si(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          return ((c[b2 + 4 >> 2] | 0) == 15904 ? a2 + 12 | 0 : 0) | 0;
        }
        function Ti(a2) {
          a2 = a2 | 0;
          Da(a2, 16);
          return;
        }
        function Ui(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          fe(a2);
          c[a2 >> 2] = 5272;
          c[a2 + 4 >> 2] = b2;
          Wi(a2 + 8 | 0);
          return;
        }
        function Vi(a2, b2, d2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          d2 = d2 | 0;
          var e2 = 0, f2 = 0;
          d2 = V;
          V = V + 16 | 0;
          e2 = d2;
          c[a2 >> 2] = b2;
          f2 = eq(16) | 0;
          c[f2 + 4 >> 2] = 0;
          c[f2 + 8 >> 2] = 0;
          c[f2 >> 2] = 5296;
          c[f2 + 12 >> 2] = b2;
          c[a2 + 4 >> 2] = f2;
          c[e2 >> 2] = b2;
          c[e2 + 4 >> 2] = b2;
          Xe(a2, e2);
          V = d2;
          return;
        }
        function Wi(b2) {
          b2 = b2 | 0;
          xe(b2, 32, 1, 8, 0);
          mc(b2 + 80 | 0, 32, 1, 8, 0);
          a[b2 + 160 >> 0] = 0;
          a[b2 + 161 >> 0] = 0;
          _i(b2 + 164 | 0);
          return;
        }
        function Xi(a2) {
          a2 = a2 | 0;
          c[a2 >> 2] = 5272;
          $i(a2 + 8 | 0);
          le(a2);
          return;
        }
        function Yi(a2) {
          a2 = a2 | 0;
          Xi(a2);
          jp(a2);
          return;
        }
        function Zi(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          return aj(a2 + 8 | 0, c[a2 + 4 >> 2] | 0, b2) | 0;
        }
        function _i(b2) {
          b2 = b2 | 0;
          a[b2 + 4 >> 0] = 0;
          return;
        }
        function $i(a2) {
          a2 = a2 | 0;
          qc(a2 + 80 | 0);
          ye(a2);
          return;
        }
        function aj(b2, d2, e2) {
          b2 = b2 | 0;
          d2 = d2 | 0;
          e2 = e2 | 0;
          var f2 = 0, g2 = 0, h2 = 0;
          h2 = V;
          V = V + 16 | 0;
          f2 = h2;
          if (!(a[b2 + 161 >> 0] | 0))
            oc(b2 + 80 | 0);
          g2 = b2 + 164 | 0;
          if (bj(g2) | 0) {
            d2 = Gi(b2 + 80 | 0, d2, c[g2 >> 2] | 0, 0) | 0;
            c[f2 >> 2] = d2;
            We(d2, e2);
          } else {
            Ii(Hi(d2) | 0, e2, 4);
            c[f2 >> 2] = Re(e2) | 0;
          }
          cj(g2, f2);
          V = h2;
          return e2 + 4 | 0;
        }
        function bj(b2) {
          b2 = b2 | 0;
          return (a[b2 + 4 >> 0] | 0) != 0 | 0;
        }
        function cj(b2, d2) {
          b2 = b2 | 0;
          d2 = d2 | 0;
          var e2 = 0;
          e2 = b2 + 4 | 0;
          if (!(a[e2 >> 0] | 0))
            a[e2 >> 0] = 1;
          c[b2 >> 2] = c[d2 >> 2];
          return;
        }
        function dj(a2) {
          a2 = a2 | 0;
          pq(a2);
          jp(a2);
          return;
        }
        function ej(a2) {
          a2 = a2 | 0;
          a2 = c[a2 + 12 >> 2] | 0;
          if (a2 | 0)
            ca[c[(c[a2 >> 2] | 0) + 4 >> 2] & 255](a2);
          return;
        }
        function fj(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          return ((c[b2 + 4 >> 2] | 0) == 16402 ? a2 + 12 | 0 : 0) | 0;
        }
        function gj(a2) {
          a2 = a2 | 0;
          Da(a2, 16);
          return;
        }
        function hj(a2) {
          a2 = a2 | 0;
          var b2 = 0, d2 = 0, e2 = 0, f2 = 0, g2 = 0, h2 = 0, i2 = 0, j2 = 0, k2 = 0, l2 = 0;
          j2 = V;
          V = V + 32 | 0;
          e2 = j2 + 12 | 0;
          f2 = j2;
          b2 = j2 + 8 | 0;
          h2 = eq(172) | 0;
          jj(h2, c[a2 + 4 >> 2] | 0);
          g2 = a2 + 8 | 0;
          c[b2 >> 2] = 0;
          c[e2 >> 2] = c[b2 >> 2];
          kj(f2, h2, e2);
          h2 = a2 + 12 | 0;
          b2 = c[h2 >> 2] | 0;
          i2 = a2 + 16 | 0;
          do
            if (b2 >>> 0 >= (c[i2 >> 2] | 0) >>> 0) {
              b2 = (b2 - (c[g2 >> 2] | 0) >> 3) + 1 | 0;
              d2 = ee(g2) | 0;
              if (d2 >>> 0 < b2 >>> 0)
                cr(g2);
              else {
                k2 = c[g2 >> 2] | 0;
                l2 = (c[i2 >> 2] | 0) - k2 | 0;
                i2 = l2 >> 2;
                be(
                  e2,
                  l2 >> 3 >>> 0 < d2 >>> 1 >>> 0 ? i2 >>> 0 < b2 >>> 0 ? b2 : i2 : d2,
                  (c[h2 >> 2] | 0) - k2 >> 3,
                  a2 + 16 | 0
                );
                i2 = e2 + 8 | 0;
                h2 = c[i2 >> 2] | 0;
                c[h2 >> 2] = c[f2 >> 2];
                a2 = f2 + 4 | 0;
                c[h2 + 4 >> 2] = c[a2 >> 2];
                c[f2 >> 2] = 0;
                c[a2 >> 2] = 0;
                c[i2 >> 2] = h2 + 8;
                ce(g2, e2);
                de(e2);
                break;
              }
            } else {
              $d(e2, g2, 1);
              l2 = e2 + 4 | 0;
              k2 = c[l2 >> 2] | 0;
              c[k2 >> 2] = c[f2 >> 2];
              i2 = f2 + 4 | 0;
              c[k2 + 4 >> 2] = c[i2 >> 2];
              c[f2 >> 2] = 0;
              c[i2 >> 2] = 0;
              c[l2 >> 2] = k2 + 8;
              ae(e2);
            }
          while (0);
          Sd(f2);
          V = j2;
          return;
        }
        function ij(a2) {
          a2 = a2 | 0;
          var b2 = 0, d2 = 0, e2 = 0, f2 = 0, g2 = 0, h2 = 0, i2 = 0, j2 = 0, k2 = 0, l2 = 0;
          j2 = V;
          V = V + 32 | 0;
          e2 = j2 + 12 | 0;
          f2 = j2;
          b2 = j2 + 8 | 0;
          h2 = eq(176) | 0;
          Aj(h2, c[a2 + 4 >> 2] | 0);
          g2 = a2 + 8 | 0;
          c[b2 >> 2] = 0;
          c[e2 >> 2] = c[b2 >> 2];
          Bj(f2, h2, e2);
          h2 = a2 + 12 | 0;
          b2 = c[h2 >> 2] | 0;
          i2 = a2 + 16 | 0;
          do
            if (b2 >>> 0 >= (c[i2 >> 2] | 0) >>> 0) {
              b2 = (b2 - (c[g2 >> 2] | 0) >> 3) + 1 | 0;
              d2 = ee(g2) | 0;
              if (d2 >>> 0 < b2 >>> 0)
                cr(g2);
              else {
                k2 = c[g2 >> 2] | 0;
                l2 = (c[i2 >> 2] | 0) - k2 | 0;
                i2 = l2 >> 2;
                be(
                  e2,
                  l2 >> 3 >>> 0 < d2 >>> 1 >>> 0 ? i2 >>> 0 < b2 >>> 0 ? b2 : i2 : d2,
                  (c[h2 >> 2] | 0) - k2 >> 3,
                  a2 + 16 | 0
                );
                i2 = e2 + 8 | 0;
                h2 = c[i2 >> 2] | 0;
                c[h2 >> 2] = c[f2 >> 2];
                a2 = f2 + 4 | 0;
                c[h2 + 4 >> 2] = c[a2 >> 2];
                c[f2 >> 2] = 0;
                c[a2 >> 2] = 0;
                c[i2 >> 2] = h2 + 8;
                ce(g2, e2);
                de(e2);
                break;
              }
            } else {
              $d(e2, g2, 1);
              l2 = e2 + 4 | 0;
              k2 = c[l2 >> 2] | 0;
              c[k2 >> 2] = c[f2 >> 2];
              i2 = f2 + 4 | 0;
              c[k2 + 4 >> 2] = c[i2 >> 2];
              c[f2 >> 2] = 0;
              c[i2 >> 2] = 0;
              c[l2 >> 2] = k2 + 8;
              ae(e2);
            }
          while (0);
          Sd(f2);
          V = j2;
          return;
        }
        function jj(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          fe(a2);
          c[a2 >> 2] = 5324;
          c[a2 + 4 >> 2] = b2;
          lj(a2 + 8 | 0);
          return;
        }
        function kj(a2, b2, d2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          d2 = d2 | 0;
          var e2 = 0, f2 = 0;
          d2 = V;
          V = V + 16 | 0;
          e2 = d2;
          c[a2 >> 2] = b2;
          f2 = eq(16) | 0;
          c[f2 + 4 >> 2] = 0;
          c[f2 + 8 >> 2] = 0;
          c[f2 >> 2] = 5348;
          c[f2 + 12 >> 2] = b2;
          c[a2 + 4 >> 2] = f2;
          c[e2 >> 2] = b2;
          c[e2 + 4 >> 2] = b2;
          Xe(a2, e2);
          V = d2;
          return;
        }
        function lj(b2) {
          b2 = b2 | 0;
          xe(b2, 8, 1, 8, 0);
          mc(b2 + 80 | 0, 8, 1, 8, 0);
          a[b2 + 160 >> 0] = 0;
          a[b2 + 161 >> 0] = 0;
          pj(b2 + 162 | 0);
          return;
        }
        function mj(a2) {
          a2 = a2 | 0;
          c[a2 >> 2] = 5324;
          qj(a2 + 8 | 0);
          le(a2);
          return;
        }
        function nj(a2) {
          a2 = a2 | 0;
          mj(a2);
          jp(a2);
          return;
        }
        function oj(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          return rj(a2 + 8 | 0, c[a2 + 4 >> 2] | 0, b2) | 0;
        }
        function pj(b2) {
          b2 = b2 | 0;
          a[b2 + 1 >> 0] = 0;
          return;
        }
        function qj(a2) {
          a2 = a2 | 0;
          qc(a2 + 80 | 0);
          ye(a2);
          return;
        }
        function rj(b2, c2, d2) {
          b2 = b2 | 0;
          c2 = c2 | 0;
          d2 = d2 | 0;
          var e2 = 0, f2 = 0, g2 = 0;
          g2 = V;
          V = V + 16 | 0;
          e2 = g2;
          if (!(a[b2 + 161 >> 0] | 0))
            oc(b2 + 80 | 0);
          f2 = b2 + 162 | 0;
          if (sj(f2) | 0) {
            c2 = (Gi(b2 + 80 | 0, c2, a[f2 >> 0] | 0, 0) | 0) & 255;
            a[e2 >> 0] = c2;
            tj(c2, d2);
          } else {
            Ii(Hi(c2) | 0, d2, 1);
            a[e2 >> 0] = uj(d2) | 0;
          }
          vj(f2, e2);
          V = g2;
          return d2 + 1 | 0;
        }
        function sj(b2) {
          b2 = b2 | 0;
          return (a[b2 + 1 >> 0] | 0) != 0 | 0;
        }
        function tj(b2, c2) {
          b2 = b2 | 0;
          c2 = c2 | 0;
          a[c2 >> 0] = b2;
          return;
        }
        function uj(b2) {
          b2 = b2 | 0;
          return a[b2 >> 0] | 0;
        }
        function vj(b2, c2) {
          b2 = b2 | 0;
          c2 = c2 | 0;
          var d2 = 0;
          d2 = b2 + 1 | 0;
          if (!(a[d2 >> 0] | 0))
            a[d2 >> 0] = 1;
          a[b2 >> 0] = a[c2 >> 0] | 0;
          return;
        }
        function wj(a2) {
          a2 = a2 | 0;
          pq(a2);
          jp(a2);
          return;
        }
        function xj(a2) {
          a2 = a2 | 0;
          a2 = c[a2 + 12 >> 2] | 0;
          if (a2 | 0)
            ca[c[(c[a2 >> 2] | 0) + 4 >> 2] & 255](a2);
          return;
        }
        function yj(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          return ((c[b2 + 4 >> 2] | 0) == 16900 ? a2 + 12 | 0 : 0) | 0;
        }
        function zj(a2) {
          a2 = a2 | 0;
          Da(a2, 16);
          return;
        }
        function Aj(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          fe(a2);
          c[a2 >> 2] = 5376;
          c[a2 + 4 >> 2] = b2;
          Cj(a2 + 8 | 0);
          return;
        }
        function Bj(a2, b2, d2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          d2 = d2 | 0;
          var e2 = 0, f2 = 0;
          d2 = V;
          V = V + 16 | 0;
          e2 = d2;
          c[a2 >> 2] = b2;
          f2 = eq(16) | 0;
          c[f2 + 4 >> 2] = 0;
          c[f2 + 8 >> 2] = 0;
          c[f2 >> 2] = 5400;
          c[f2 + 12 >> 2] = b2;
          c[a2 + 4 >> 2] = f2;
          c[e2 >> 2] = b2;
          c[e2 + 4 >> 2] = b2;
          Xe(a2, e2);
          V = d2;
          return;
        }
        function Cj(b2) {
          b2 = b2 | 0;
          xe(b2, 16, 1, 8, 0);
          mc(b2 + 80 | 0, 16, 1, 8, 0);
          a[b2 + 160 >> 0] = 0;
          a[b2 + 161 >> 0] = 0;
          Gj(b2 + 162 | 0);
          return;
        }
        function Dj(a2) {
          a2 = a2 | 0;
          c[a2 >> 2] = 5376;
          Hj(a2 + 8 | 0);
          le(a2);
          return;
        }
        function Ej(a2) {
          a2 = a2 | 0;
          Dj(a2);
          jp(a2);
          return;
        }
        function Fj(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          return Ij(a2 + 8 | 0, c[a2 + 4 >> 2] | 0, b2) | 0;
        }
        function Gj(b2) {
          b2 = b2 | 0;
          a[b2 + 2 >> 0] = 0;
          return;
        }
        function Hj(a2) {
          a2 = a2 | 0;
          qc(a2 + 80 | 0);
          ye(a2);
          return;
        }
        function Ij(c2, d2, e2) {
          c2 = c2 | 0;
          d2 = d2 | 0;
          e2 = e2 | 0;
          var f2 = 0, g2 = 0, h2 = 0;
          h2 = V;
          V = V + 16 | 0;
          f2 = h2;
          if (!(a[c2 + 161 >> 0] | 0))
            oc(c2 + 80 | 0);
          g2 = c2 + 162 | 0;
          if (Jj(g2) | 0) {
            d2 = (Gi(c2 + 80 | 0, d2, b[g2 >> 1] | 0, 0) | 0) & 65535;
            b[f2 >> 1] = d2;
            Kj(d2, e2);
          } else {
            Ii(Hi(d2) | 0, e2, 2);
            b[f2 >> 1] = Lj(e2) | 0;
          }
          Mj(g2, f2);
          V = h2;
          return e2 + 2 | 0;
        }
        function Jj(b2) {
          b2 = b2 | 0;
          return (a[b2 + 2 >> 0] | 0) != 0 | 0;
        }
        function Kj(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          Te(a2, b2);
          return;
        }
        function Lj(a2) {
          a2 = a2 | 0;
          return Oe(a2) | 0;
        }
        function Mj(c2, d2) {
          c2 = c2 | 0;
          d2 = d2 | 0;
          var e2 = 0;
          e2 = c2 + 2 | 0;
          if (!(a[e2 >> 0] | 0))
            a[e2 >> 0] = 1;
          b[c2 >> 1] = b[d2 >> 1] | 0;
          return;
        }
        function Nj(a2) {
          a2 = a2 | 0;
          pq(a2);
          jp(a2);
          return;
        }
        function Oj(a2) {
          a2 = a2 | 0;
          a2 = c[a2 + 12 >> 2] | 0;
          if (a2 | 0)
            ca[c[(c[a2 >> 2] | 0) + 4 >> 2] & 255](a2);
          return;
        }
        function Pj(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          return ((c[b2 + 4 >> 2] | 0) == 17398 ? a2 + 12 | 0 : 0) | 0;
        }
        function Qj(a2) {
          a2 = a2 | 0;
          Da(a2, 16);
          return;
        }
        function Rj(a2) {
          a2 = a2 | 0;
          var b2 = 0, d2 = 0, e2 = 0, f2 = 0, g2 = 0, h2 = 0, i2 = 0, j2 = 0, k2 = 0, l2 = 0;
          j2 = V;
          V = V + 32 | 0;
          e2 = j2 + 12 | 0;
          f2 = j2;
          b2 = j2 + 8 | 0;
          h2 = eq(172) | 0;
          Tj(h2, c[a2 + 4 >> 2] | 0);
          g2 = a2 + 8 | 0;
          c[b2 >> 2] = 0;
          c[e2 >> 2] = c[b2 >> 2];
          Uj(f2, h2, e2);
          h2 = a2 + 12 | 0;
          b2 = c[h2 >> 2] | 0;
          i2 = a2 + 16 | 0;
          do
            if (b2 >>> 0 >= (c[i2 >> 2] | 0) >>> 0) {
              b2 = (b2 - (c[g2 >> 2] | 0) >> 3) + 1 | 0;
              d2 = ee(g2) | 0;
              if (d2 >>> 0 < b2 >>> 0)
                cr(g2);
              else {
                k2 = c[g2 >> 2] | 0;
                l2 = (c[i2 >> 2] | 0) - k2 | 0;
                i2 = l2 >> 2;
                be(
                  e2,
                  l2 >> 3 >>> 0 < d2 >>> 1 >>> 0 ? i2 >>> 0 < b2 >>> 0 ? b2 : i2 : d2,
                  (c[h2 >> 2] | 0) - k2 >> 3,
                  a2 + 16 | 0
                );
                i2 = e2 + 8 | 0;
                h2 = c[i2 >> 2] | 0;
                c[h2 >> 2] = c[f2 >> 2];
                a2 = f2 + 4 | 0;
                c[h2 + 4 >> 2] = c[a2 >> 2];
                c[f2 >> 2] = 0;
                c[a2 >> 2] = 0;
                c[i2 >> 2] = h2 + 8;
                ce(g2, e2);
                de(e2);
                break;
              }
            } else {
              $d(e2, g2, 1);
              l2 = e2 + 4 | 0;
              k2 = c[l2 >> 2] | 0;
              c[k2 >> 2] = c[f2 >> 2];
              i2 = f2 + 4 | 0;
              c[k2 + 4 >> 2] = c[i2 >> 2];
              c[f2 >> 2] = 0;
              c[i2 >> 2] = 0;
              c[l2 >> 2] = k2 + 8;
              ae(e2);
            }
          while (0);
          Sd(f2);
          V = j2;
          return;
        }
        function Sj(a2) {
          a2 = a2 | 0;
          var b2 = 0, d2 = 0, e2 = 0, f2 = 0, g2 = 0, h2 = 0, i2 = 0, j2 = 0, k2 = 0, l2 = 0;
          j2 = V;
          V = V + 32 | 0;
          e2 = j2 + 12 | 0;
          f2 = j2;
          b2 = j2 + 8 | 0;
          h2 = eq(176) | 0;
          gk(h2, c[a2 + 4 >> 2] | 0);
          g2 = a2 + 8 | 0;
          c[b2 >> 2] = 0;
          c[e2 >> 2] = c[b2 >> 2];
          hk(f2, h2, e2);
          h2 = a2 + 12 | 0;
          b2 = c[h2 >> 2] | 0;
          i2 = a2 + 16 | 0;
          do
            if (b2 >>> 0 >= (c[i2 >> 2] | 0) >>> 0) {
              b2 = (b2 - (c[g2 >> 2] | 0) >> 3) + 1 | 0;
              d2 = ee(g2) | 0;
              if (d2 >>> 0 < b2 >>> 0)
                cr(g2);
              else {
                k2 = c[g2 >> 2] | 0;
                l2 = (c[i2 >> 2] | 0) - k2 | 0;
                i2 = l2 >> 2;
                be(
                  e2,
                  l2 >> 3 >>> 0 < d2 >>> 1 >>> 0 ? i2 >>> 0 < b2 >>> 0 ? b2 : i2 : d2,
                  (c[h2 >> 2] | 0) - k2 >> 3,
                  a2 + 16 | 0
                );
                i2 = e2 + 8 | 0;
                h2 = c[i2 >> 2] | 0;
                c[h2 >> 2] = c[f2 >> 2];
                a2 = f2 + 4 | 0;
                c[h2 + 4 >> 2] = c[a2 >> 2];
                c[f2 >> 2] = 0;
                c[a2 >> 2] = 0;
                c[i2 >> 2] = h2 + 8;
                ce(g2, e2);
                de(e2);
                break;
              }
            } else {
              $d(e2, g2, 1);
              l2 = e2 + 4 | 0;
              k2 = c[l2 >> 2] | 0;
              c[k2 >> 2] = c[f2 >> 2];
              i2 = f2 + 4 | 0;
              c[k2 + 4 >> 2] = c[i2 >> 2];
              c[f2 >> 2] = 0;
              c[i2 >> 2] = 0;
              c[l2 >> 2] = k2 + 8;
              ae(e2);
            }
          while (0);
          Sd(f2);
          V = j2;
          return;
        }
        function Tj(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          fe(a2);
          c[a2 >> 2] = 5428;
          c[a2 + 4 >> 2] = b2;
          Vj(a2 + 8 | 0);
          return;
        }
        function Uj(a2, b2, d2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          d2 = d2 | 0;
          var e2 = 0, f2 = 0;
          d2 = V;
          V = V + 16 | 0;
          e2 = d2;
          c[a2 >> 2] = b2;
          f2 = eq(16) | 0;
          c[f2 + 4 >> 2] = 0;
          c[f2 + 8 >> 2] = 0;
          c[f2 >> 2] = 5452;
          c[f2 + 12 >> 2] = b2;
          c[a2 + 4 >> 2] = f2;
          c[e2 >> 2] = b2;
          c[e2 + 4 >> 2] = b2;
          Xe(a2, e2);
          V = d2;
          return;
        }
        function Vj(b2) {
          b2 = b2 | 0;
          xe(b2, 8, 1, 8, 0);
          mc(b2 + 80 | 0, 8, 1, 8, 0);
          a[b2 + 160 >> 0] = 0;
          a[b2 + 161 >> 0] = 0;
          Zj(b2 + 162 | 0);
          return;
        }
        function Wj(a2) {
          a2 = a2 | 0;
          c[a2 >> 2] = 5428;
          _j(a2 + 8 | 0);
          le(a2);
          return;
        }
        function Xj(a2) {
          a2 = a2 | 0;
          Wj(a2);
          jp(a2);
          return;
        }
        function Yj(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          return $j(a2 + 8 | 0, c[a2 + 4 >> 2] | 0, b2) | 0;
        }
        function Zj(b2) {
          b2 = b2 | 0;
          a[b2 + 1 >> 0] = 0;
          return;
        }
        function _j(a2) {
          a2 = a2 | 0;
          qc(a2 + 80 | 0);
          ye(a2);
          return;
        }
        function $j(b2, c2, e2) {
          b2 = b2 | 0;
          c2 = c2 | 0;
          e2 = e2 | 0;
          var f2 = 0, g2 = 0, h2 = 0;
          h2 = V;
          V = V + 16 | 0;
          f2 = h2;
          if (!(a[b2 + 161 >> 0] | 0))
            oc(b2 + 80 | 0);
          g2 = b2 + 162 | 0;
          if (ak(g2) | 0) {
            c2 = (Gi(b2 + 80 | 0, c2, d[g2 >> 0] | 0, 0) | 0) & 255;
            a[f2 >> 0] = c2;
            Ue(c2, e2);
          } else {
            Ii(Hi(c2) | 0, e2, 1);
            a[f2 >> 0] = Pe(e2) | 0;
          }
          bk(g2, f2);
          V = h2;
          return e2 + 1 | 0;
        }
        function ak(b2) {
          b2 = b2 | 0;
          return (a[b2 + 1 >> 0] | 0) != 0 | 0;
        }
        function bk(b2, c2) {
          b2 = b2 | 0;
          c2 = c2 | 0;
          var d2 = 0;
          d2 = b2 + 1 | 0;
          if (!(a[d2 >> 0] | 0))
            a[d2 >> 0] = 1;
          a[b2 >> 0] = a[c2 >> 0] | 0;
          return;
        }
        function ck(a2) {
          a2 = a2 | 0;
          pq(a2);
          jp(a2);
          return;
        }
        function dk(a2) {
          a2 = a2 | 0;
          a2 = c[a2 + 12 >> 2] | 0;
          if (a2 | 0)
            ca[c[(c[a2 >> 2] | 0) + 4 >> 2] & 255](a2);
          return;
        }
        function ek(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          return ((c[b2 + 4 >> 2] | 0) == 17896 ? a2 + 12 | 0 : 0) | 0;
        }
        function fk(a2) {
          a2 = a2 | 0;
          Da(a2, 16);
          return;
        }
        function gk(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          fe(a2);
          c[a2 >> 2] = 5480;
          c[a2 + 4 >> 2] = b2;
          ik(a2 + 8 | 0);
          return;
        }
        function hk(a2, b2, d2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          d2 = d2 | 0;
          var e2 = 0, f2 = 0;
          d2 = V;
          V = V + 16 | 0;
          e2 = d2;
          c[a2 >> 2] = b2;
          f2 = eq(16) | 0;
          c[f2 + 4 >> 2] = 0;
          c[f2 + 8 >> 2] = 0;
          c[f2 >> 2] = 5504;
          c[f2 + 12 >> 2] = b2;
          c[a2 + 4 >> 2] = f2;
          c[e2 >> 2] = b2;
          c[e2 + 4 >> 2] = b2;
          Xe(a2, e2);
          V = d2;
          return;
        }
        function ik(b2) {
          b2 = b2 | 0;
          xe(b2, 16, 1, 8, 0);
          mc(b2 + 80 | 0, 16, 1, 8, 0);
          a[b2 + 160 >> 0] = 0;
          a[b2 + 161 >> 0] = 0;
          mk(b2 + 162 | 0);
          return;
        }
        function jk(a2) {
          a2 = a2 | 0;
          c[a2 >> 2] = 5480;
          nk(a2 + 8 | 0);
          le(a2);
          return;
        }
        function kk(a2) {
          a2 = a2 | 0;
          jk(a2);
          jp(a2);
          return;
        }
        function lk(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          return ok(a2 + 8 | 0, c[a2 + 4 >> 2] | 0, b2) | 0;
        }
        function mk(b2) {
          b2 = b2 | 0;
          a[b2 + 2 >> 0] = 0;
          return;
        }
        function nk(a2) {
          a2 = a2 | 0;
          qc(a2 + 80 | 0);
          ye(a2);
          return;
        }
        function ok(c2, d2, f2) {
          c2 = c2 | 0;
          d2 = d2 | 0;
          f2 = f2 | 0;
          var g2 = 0, h2 = 0, i2 = 0;
          i2 = V;
          V = V + 16 | 0;
          g2 = i2;
          if (!(a[c2 + 161 >> 0] | 0))
            oc(c2 + 80 | 0);
          h2 = c2 + 162 | 0;
          if (pk(h2) | 0) {
            d2 = (Gi(c2 + 80 | 0, d2, e[h2 >> 1] | 0, 0) | 0) & 65535;
            b[g2 >> 1] = d2;
            Te(d2, f2);
          } else {
            Ii(Hi(d2) | 0, f2, 2);
            b[g2 >> 1] = Oe(f2) | 0;
          }
          qk(h2, g2);
          V = i2;
          return f2 + 2 | 0;
        }
        function pk(b2) {
          b2 = b2 | 0;
          return (a[b2 + 2 >> 0] | 0) != 0 | 0;
        }
        function qk(c2, d2) {
          c2 = c2 | 0;
          d2 = d2 | 0;
          var e2 = 0;
          e2 = c2 + 2 | 0;
          if (!(a[e2 >> 0] | 0))
            a[e2 >> 0] = 1;
          b[c2 >> 1] = b[d2 >> 1] | 0;
          return;
        }
        function rk(a2) {
          a2 = a2 | 0;
          pq(a2);
          jp(a2);
          return;
        }
        function sk(a2) {
          a2 = a2 | 0;
          a2 = c[a2 + 12 >> 2] | 0;
          if (a2 | 0)
            ca[c[(c[a2 >> 2] | 0) + 4 >> 2] & 255](a2);
          return;
        }
        function tk(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          return ((c[b2 + 4 >> 2] | 0) == 18394 ? a2 + 12 | 0 : 0) | 0;
        }
        function uk(a2) {
          a2 = a2 | 0;
          Da(a2, 16);
          return;
        }
        function vk() {
          return;
        }
        function wk(a2) {
          a2 = a2 | 0;
          return Ek(a2) | 0;
        }
        function xk() {
          return 0;
        }
        function yk() {
          return 0;
        }
        function zk(a2) {
          a2 = a2 | 0;
          if (a2 | 0) {
            Fk(a2);
            jp(a2);
          }
          return;
        }
        function Ak() {
          return Gk() | 0;
        }
        function Bk() {
          return Hk() | 0;
        }
        function Ck() {
          return Ik() | 0;
        }
        function Dk() {
          return 0;
        }
        function Ek(a2) {
          a2 = a2 | 0;
          return 3360;
        }
        function Fk(a2) {
          a2 = a2 | 0;
          var b2 = 0, d2 = 0, e2 = 0, f2 = 0;
          b2 = V;
          V = V + 16 | 0;
          e2 = b2;
          c[e2 >> 2] = c[a2 >> 2];
          c[a2 >> 2] = 0;
          d2 = a2 + 4 | 0;
          c[e2 + 4 >> 2] = c[d2 >> 2];
          c[d2 >> 2] = 0;
          wa(e2);
          d2 = a2 + 8 | 0;
          c[e2 >> 2] = c[d2 >> 2];
          c[d2 >> 2] = 0;
          f2 = a2 + 12 | 0;
          c[e2 + 4 >> 2] = c[f2 >> 2];
          c[f2 >> 2] = 0;
          Ga(e2);
          Ga(d2);
          wa(a2);
          V = b2;
          return;
        }
        function Gk() {
          return 3360;
        }
        function Hk() {
          return 3368;
        }
        function Ik() {
          return 3384;
        }
        function Jk() {
          return 18579;
        }
        function Kk() {
          return 18582;
        }
        function Lk() {
          return 18584;
        }
        function Mk() {
          var a2 = 0;
          a2 = eq(16) | 0;
          Tk(a2);
          return a2 | 0;
        }
        function Nk(a2) {
          a2 = a2 | 0;
          var b2 = 0, c2 = 0, d2 = 0, e2 = 0;
          b2 = V;
          V = V + 16 | 0;
          c2 = b2;
          e2 = Ak() | 0;
          d2 = Pk(c2) | 0;
          c2 = Qk(c2) | 0;
          E(e2 | 0, d2 | 0, c2 | 0, Jk() | 0, 12, a2 | 0);
          V = b2;
          return;
        }
        function Ok(a2) {
          a2 = a2 | 0;
          return Rk(Y[a2 & 3]() | 0) | 0;
        }
        function Pk(a2) {
          a2 = a2 | 0;
          return 1;
        }
        function Qk(a2) {
          a2 = a2 | 0;
          return Sk() | 0;
        }
        function Rk(a2) {
          a2 = a2 | 0;
          return a2 | 0;
        }
        function Sk() {
          return 5524;
        }
        function Tk(a2) {
          a2 = a2 | 0;
          c[a2 >> 2] = 0;
          c[a2 + 4 >> 2] = 0;
          c[a2 + 8 >> 2] = 0;
          c[a2 + 12 >> 2] = 0;
          return;
        }
        function Uk(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          var d2 = 0, e2 = 0, f2 = 0, g2 = 0, h2 = 0;
          d2 = V;
          V = V + 16 | 0;
          e2 = d2;
          f2 = d2 + 8 | 0;
          h2 = c[b2 + 4 >> 2] | 0;
          c[e2 >> 2] = c[b2 >> 2];
          c[e2 + 4 >> 2] = h2;
          h2 = Ak() | 0;
          g2 = Wk(f2) | 0;
          f2 = Xk(f2) | 0;
          b2 = bl() | 0;
          F(h2 | 0, a2 | 0, g2 | 0, f2 | 0, b2 | 0, 4, Yk(e2) | 0, 0);
          V = d2;
          return;
        }
        function Vk(a2, b2, d2, e2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          d2 = d2 | 0;
          e2 = e2 | 0;
          var f2 = 0, g2 = 0;
          g2 = Zk(b2) | 0;
          b2 = c[a2 >> 2] | 0;
          f2 = c[a2 + 4 >> 2] | 0;
          a2 = g2 + (f2 >> 1) | 0;
          if (f2 & 1)
            b2 = c[(c[a2 >> 2] | 0) + b2 >> 2] | 0;
          f2 = _k(d2) | 0;
          g2 = $k(e2) | 0;
          ea[b2 & 15](a2, f2, g2);
          return;
        }
        function Wk(a2) {
          a2 = a2 | 0;
          return 4;
        }
        function Xk(a2) {
          a2 = a2 | 0;
          return al() | 0;
        }
        function Yk(a2) {
          a2 = a2 | 0;
          var b2 = 0, d2 = 0;
          b2 = eq(8) | 0;
          d2 = c[a2 + 4 >> 2] | 0;
          c[b2 >> 2] = c[a2 >> 2];
          c[b2 + 4 >> 2] = d2;
          return b2 | 0;
        }
        function Zk(a2) {
          a2 = a2 | 0;
          return a2 | 0;
        }
        function _k(a2) {
          a2 = a2 | 0;
          return a2 | 0;
        }
        function $k(a2) {
          a2 = a2 | 0;
          return a2 | 0;
        }
        function al() {
          return 144;
        }
        function bl() {
          return 18587;
        }
        function cl(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          var d2 = 0, e2 = 0, f2 = 0, g2 = 0, h2 = 0;
          d2 = V;
          V = V + 16 | 0;
          e2 = d2;
          f2 = d2 + 8 | 0;
          h2 = c[b2 + 4 >> 2] | 0;
          c[e2 >> 2] = c[b2 >> 2];
          c[e2 + 4 >> 2] = h2;
          h2 = Ak() | 0;
          g2 = el(f2) | 0;
          f2 = fl(f2) | 0;
          b2 = jl() | 0;
          F(h2 | 0, a2 | 0, g2 | 0, f2 | 0, b2 | 0, 7, gl(e2) | 0, 0);
          V = d2;
          return;
        }
        function dl(a2, b2, d2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          d2 = d2 | 0;
          var e2 = 0, f2 = 0;
          f2 = Zk(b2) | 0;
          b2 = c[a2 >> 2] | 0;
          e2 = c[a2 + 4 >> 2] | 0;
          a2 = f2 + (e2 >> 1) | 0;
          if (e2 & 1)
            b2 = c[(c[a2 >> 2] | 0) + b2 >> 2] | 0;
          f2 = hl(d2) | 0;
          da[b2 & 15](a2, f2);
          return;
        }
        function el(a2) {
          a2 = a2 | 0;
          return 3;
        }
        function fl(a2) {
          a2 = a2 | 0;
          return il() | 0;
        }
        function gl(a2) {
          a2 = a2 | 0;
          var b2 = 0, d2 = 0;
          b2 = eq(8) | 0;
          d2 = c[a2 + 4 >> 2] | 0;
          c[b2 >> 2] = c[a2 >> 2];
          c[b2 + 4 >> 2] = d2;
          return b2 | 0;
        }
        function hl(a2) {
          a2 = a2 | 0;
          return a2 | 0;
        }
        function il() {
          return 5528;
        }
        function jl() {
          return 18593;
        }
        function kl(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          var d2 = 0, e2 = 0, f2 = 0, g2 = 0, h2 = 0;
          d2 = V;
          V = V + 16 | 0;
          e2 = d2;
          f2 = d2 + 8 | 0;
          h2 = c[b2 + 4 >> 2] | 0;
          c[e2 >> 2] = c[b2 >> 2];
          c[e2 + 4 >> 2] = h2;
          h2 = Ak() | 0;
          g2 = ml(f2) | 0;
          f2 = nl(f2) | 0;
          b2 = rl() | 0;
          F(h2 | 0, a2 | 0, g2 | 0, f2 | 0, b2 | 0, 41, ol(e2) | 0, 0);
          V = d2;
          return;
        }
        function ll(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          var d2 = 0, e2 = 0, f2 = 0, g2 = 0;
          e2 = V;
          V = V + 16 | 0;
          d2 = e2;
          g2 = Zk(b2) | 0;
          b2 = c[a2 >> 2] | 0;
          f2 = c[a2 + 4 >> 2] | 0;
          a2 = g2 + (f2 >> 1) | 0;
          if (f2 & 1)
            b2 = c[(c[a2 >> 2] | 0) + b2 >> 2] | 0;
          c[d2 >> 2] = Z[b2 & 15](a2) | 0;
          g2 = pl(d2) | 0;
          V = e2;
          return g2 | 0;
        }
        function ml(a2) {
          a2 = a2 | 0;
          return 2;
        }
        function nl(a2) {
          a2 = a2 | 0;
          return ql() | 0;
        }
        function ol(a2) {
          a2 = a2 | 0;
          var b2 = 0, d2 = 0;
          b2 = eq(8) | 0;
          d2 = c[a2 + 4 >> 2] | 0;
          c[b2 >> 2] = c[a2 >> 2];
          c[b2 + 4 >> 2] = d2;
          return b2 | 0;
        }
        function pl(a2) {
          a2 = a2 | 0;
          return c[a2 >> 2] | 0;
        }
        function ql() {
          return 5540;
        }
        function rl() {
          return 18598;
        }
        function sl() {
          return;
        }
        function tl(a2) {
          a2 = a2 | 0;
          return Al(a2) | 0;
        }
        function ul() {
          return 0;
        }
        function vl() {
          return 0;
        }
        function wl(a2) {
          a2 = a2 | 0;
          if (a2 | 0) {
            Bl(a2);
            jp(a2);
          }
          return;
        }
        function xl() {
          return Cl() | 0;
        }
        function yl() {
          return Dl() | 0;
        }
        function zl() {
          return El() | 0;
        }
        function Al(a2) {
          a2 = a2 | 0;
          return 3400;
        }
        function Bl(a2) {
          a2 = a2 | 0;
          var b2 = 0, d2 = 0, e2 = 0, f2 = 0;
          b2 = V;
          V = V + 16 | 0;
          e2 = b2;
          c[e2 >> 2] = c[a2 >> 2];
          c[a2 >> 2] = 0;
          d2 = a2 + 4 | 0;
          c[e2 + 4 >> 2] = c[d2 >> 2];
          c[d2 >> 2] = 0;
          Wh(e2);
          d2 = a2 + 16 | 0;
          c[e2 >> 2] = c[d2 >> 2];
          c[d2 >> 2] = 0;
          f2 = a2 + 20 | 0;
          c[e2 + 4 >> 2] = c[f2 >> 2];
          c[f2 >> 2] = 0;
          Uh(e2);
          c[e2 >> 2] = c[d2 >> 2];
          c[d2 >> 2] = 0;
          c[e2 + 4 >> 2] = c[f2 >> 2];
          c[f2 >> 2] = 0;
          Uh(e2);
          Uh(d2);
          bi(a2 + 8 | 0);
          Wh(a2);
          V = b2;
          return;
        }
        function Cl() {
          return 3400;
        }
        function Dl() {
          return 3408;
        }
        function El() {
          return 3424;
        }
        function Fl() {
          var a2 = 0;
          a2 = eq(24) | 0;
          Ml(a2);
          return a2 | 0;
        }
        function Gl(a2) {
          a2 = a2 | 0;
          var b2 = 0, c2 = 0, d2 = 0, e2 = 0;
          b2 = V;
          V = V + 16 | 0;
          c2 = b2;
          e2 = xl() | 0;
          d2 = Il(c2) | 0;
          c2 = Jl(c2) | 0;
          E(e2 | 0, d2 | 0, c2 | 0, Jk() | 0, 13, a2 | 0);
          V = b2;
          return;
        }
        function Hl(a2) {
          a2 = a2 | 0;
          return Kl(Y[a2 & 3]() | 0) | 0;
        }
        function Il(a2) {
          a2 = a2 | 0;
          return 1;
        }
        function Jl(a2) {
          a2 = a2 | 0;
          return Ll() | 0;
        }
        function Kl(a2) {
          a2 = a2 | 0;
          return a2 | 0;
        }
        function Ll() {
          return 5548;
        }
        function Ml(a2) {
          a2 = a2 | 0;
          c[a2 >> 2] = 0;
          c[a2 + 4 >> 2] = 0;
          c[a2 + 8 >> 2] = 0;
          c[a2 + 12 >> 2] = 0;
          c[a2 + 16 >> 2] = 0;
          c[a2 + 20 >> 2] = 0;
          return;
        }
        function Nl(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          var d2 = 0, e2 = 0, f2 = 0, g2 = 0, h2 = 0;
          d2 = V;
          V = V + 16 | 0;
          e2 = d2;
          f2 = d2 + 8 | 0;
          h2 = c[b2 + 4 >> 2] | 0;
          c[e2 >> 2] = c[b2 >> 2];
          c[e2 + 4 >> 2] = h2;
          h2 = xl() | 0;
          g2 = Pl(f2) | 0;
          f2 = Ql(f2) | 0;
          b2 = bl() | 0;
          F(h2 | 0, a2 | 0, g2 | 0, f2 | 0, b2 | 0, 5, Rl(e2) | 0, 0);
          V = d2;
          return;
        }
        function Ol(a2, b2, d2, e2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          d2 = d2 | 0;
          e2 = e2 | 0;
          var f2 = 0, g2 = 0;
          g2 = Sl(b2) | 0;
          b2 = c[a2 >> 2] | 0;
          f2 = c[a2 + 4 >> 2] | 0;
          a2 = g2 + (f2 >> 1) | 0;
          if (f2 & 1)
            b2 = c[(c[a2 >> 2] | 0) + b2 >> 2] | 0;
          f2 = _k(d2) | 0;
          g2 = $k(e2) | 0;
          ea[b2 & 15](a2, f2, g2);
          return;
        }
        function Pl(a2) {
          a2 = a2 | 0;
          return 4;
        }
        function Ql(a2) {
          a2 = a2 | 0;
          return Tl() | 0;
        }
        function Rl(a2) {
          a2 = a2 | 0;
          var b2 = 0, d2 = 0;
          b2 = eq(8) | 0;
          d2 = c[a2 + 4 >> 2] | 0;
          c[b2 >> 2] = c[a2 >> 2];
          c[b2 + 4 >> 2] = d2;
          return b2 | 0;
        }
        function Sl(a2) {
          a2 = a2 | 0;
          return a2 | 0;
        }
        function Tl() {
          return 160;
        }
        function Ul(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          var d2 = 0, e2 = 0, f2 = 0, g2 = 0, h2 = 0;
          d2 = V;
          V = V + 16 | 0;
          e2 = d2;
          f2 = d2 + 8 | 0;
          h2 = c[b2 + 4 >> 2] | 0;
          c[e2 >> 2] = c[b2 >> 2];
          c[e2 + 4 >> 2] = h2;
          h2 = xl() | 0;
          g2 = Wl(f2) | 0;
          f2 = Xl(f2) | 0;
          b2 = jl() | 0;
          F(h2 | 0, a2 | 0, g2 | 0, f2 | 0, b2 | 0, 8, Yl(e2) | 0, 0);
          V = d2;
          return;
        }
        function Vl(a2, b2, d2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          d2 = d2 | 0;
          var e2 = 0, f2 = 0;
          f2 = Sl(b2) | 0;
          b2 = c[a2 >> 2] | 0;
          e2 = c[a2 + 4 >> 2] | 0;
          a2 = f2 + (e2 >> 1) | 0;
          if (e2 & 1)
            b2 = c[(c[a2 >> 2] | 0) + b2 >> 2] | 0;
          f2 = $k(d2) | 0;
          da[b2 & 15](a2, f2);
          return;
        }
        function Wl(a2) {
          a2 = a2 | 0;
          return 3;
        }
        function Xl(a2) {
          a2 = a2 | 0;
          return Zl() | 0;
        }
        function Yl(a2) {
          a2 = a2 | 0;
          var b2 = 0, d2 = 0;
          b2 = eq(8) | 0;
          d2 = c[a2 + 4 >> 2] | 0;
          c[b2 >> 2] = c[a2 >> 2];
          c[b2 + 4 >> 2] = d2;
          return b2 | 0;
        }
        function Zl() {
          return 5552;
        }
        function _l(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          var d2 = 0, e2 = 0, f2 = 0, g2 = 0, h2 = 0;
          d2 = V;
          V = V + 16 | 0;
          e2 = d2;
          f2 = d2 + 8 | 0;
          h2 = c[b2 + 4 >> 2] | 0;
          c[e2 >> 2] = c[b2 >> 2];
          c[e2 + 4 >> 2] = h2;
          h2 = xl() | 0;
          g2 = am(f2) | 0;
          f2 = bm(f2) | 0;
          b2 = jl() | 0;
          F(h2 | 0, a2 | 0, g2 | 0, f2 | 0, b2 | 0, 9, cm(e2) | 0, 0);
          V = d2;
          return;
        }
        function $l(a2, b2, d2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          d2 = d2 | 0;
          var e2 = 0, f2 = 0;
          f2 = Sl(b2) | 0;
          b2 = c[a2 >> 2] | 0;
          e2 = c[a2 + 4 >> 2] | 0;
          a2 = f2 + (e2 >> 1) | 0;
          if (e2 & 1)
            b2 = c[(c[a2 >> 2] | 0) + b2 >> 2] | 0;
          f2 = hl(d2) | 0;
          da[b2 & 15](a2, f2);
          return;
        }
        function am(a2) {
          a2 = a2 | 0;
          return 3;
        }
        function bm(a2) {
          a2 = a2 | 0;
          return dm() | 0;
        }
        function cm(a2) {
          a2 = a2 | 0;
          var b2 = 0, d2 = 0;
          b2 = eq(8) | 0;
          d2 = c[a2 + 4 >> 2] | 0;
          c[b2 >> 2] = c[a2 >> 2];
          c[b2 + 4 >> 2] = d2;
          return b2 | 0;
        }
        function dm() {
          return 5564;
        }
        function em() {
          ja();
          return;
        }
        function fm() {
          gm();
          return;
        }
        function gm() {
          hm(22144);
          return;
        }
        function hm(a2) {
          a2 = a2 | 0;
          var b2 = 0;
          b2 = V;
          V = V + 16 | 0;
          c[b2 >> 2] = a2;
          im();
          V = b2;
          return;
        }
        function im() {
          M(jm() | 0, 18653);
          C(km() | 0, 18658, 1, 1, 0);
          lm(18663);
          mm(18668);
          nm(18680);
          om(18694);
          pm(18700);
          qm(18715);
          rm(18719);
          sm(18732);
          tm(18737);
          um(18751);
          vm(18757);
          K(wm() | 0, 18764);
          K(xm() | 0, 18776);
          L(ym() | 0, 4, 18809);
          L(zm() | 0, 2, 18822);
          L(Am() | 0, 4, 18837);
          G(Bm() | 0, 18852);
          Cm(18868);
          Dm(18898);
          Em(18935);
          Fm(18974);
          Gm(19005);
          Hm(19045);
          Im(19074);
          Jm(19112);
          Km(19142);
          Dm(19181);
          Em(19213);
          Fm(19246);
          Gm(19279);
          Hm(19313);
          Im(19346);
          Lm(19380);
          Mm(19411);
          Nm(19443);
          return;
        }
        function jm() {
          return _n() | 0;
        }
        function km() {
          return Zn() | 0;
        }
        function lm(a2) {
          a2 = a2 | 0;
          var b2 = 0, d2 = 0;
          b2 = V;
          V = V + 16 | 0;
          d2 = b2;
          c[d2 >> 2] = a2;
          a2 = Xn() | 0;
          I(a2 | 0, c[d2 >> 2] | 0, 1, -128 << 24 >> 24 | 0, 127 << 24 >> 24 | 0);
          V = b2;
          return;
        }
        function mm(a2) {
          a2 = a2 | 0;
          var b2 = 0, d2 = 0;
          b2 = V;
          V = V + 16 | 0;
          d2 = b2;
          c[d2 >> 2] = a2;
          a2 = Vn() | 0;
          I(a2 | 0, c[d2 >> 2] | 0, 1, -128 << 24 >> 24 | 0, 127 << 24 >> 24 | 0);
          V = b2;
          return;
        }
        function nm(a2) {
          a2 = a2 | 0;
          var b2 = 0, d2 = 0;
          b2 = V;
          V = V + 16 | 0;
          d2 = b2;
          c[d2 >> 2] = a2;
          a2 = Tn() | 0;
          I(a2 | 0, c[d2 >> 2] | 0, 1, 0, 255);
          V = b2;
          return;
        }
        function om(a2) {
          a2 = a2 | 0;
          var b2 = 0, d2 = 0;
          b2 = V;
          V = V + 16 | 0;
          d2 = b2;
          c[d2 >> 2] = a2;
          a2 = Rn() | 0;
          I(a2 | 0, c[d2 >> 2] | 0, 2, -32768 << 16 >> 16 | 0, 32767 << 16 >> 16 | 0);
          V = b2;
          return;
        }
        function pm(a2) {
          a2 = a2 | 0;
          var b2 = 0, d2 = 0;
          b2 = V;
          V = V + 16 | 0;
          d2 = b2;
          c[d2 >> 2] = a2;
          a2 = Pn() | 0;
          I(a2 | 0, c[d2 >> 2] | 0, 2, 0, 65535);
          V = b2;
          return;
        }
        function qm(a2) {
          a2 = a2 | 0;
          var b2 = 0, d2 = 0;
          b2 = V;
          V = V + 16 | 0;
          d2 = b2;
          c[d2 >> 2] = a2;
          a2 = Nn() | 0;
          I(a2 | 0, c[d2 >> 2] | 0, 4, -2147483648, 2147483647);
          V = b2;
          return;
        }
        function rm(a2) {
          a2 = a2 | 0;
          var b2 = 0, d2 = 0;
          b2 = V;
          V = V + 16 | 0;
          d2 = b2;
          c[d2 >> 2] = a2;
          a2 = Ln() | 0;
          I(a2 | 0, c[d2 >> 2] | 0, 4, 0, -1);
          V = b2;
          return;
        }
        function sm(a2) {
          a2 = a2 | 0;
          var b2 = 0, d2 = 0;
          b2 = V;
          V = V + 16 | 0;
          d2 = b2;
          c[d2 >> 2] = a2;
          a2 = Jn() | 0;
          I(a2 | 0, c[d2 >> 2] | 0, 4, -2147483648, 2147483647);
          V = b2;
          return;
        }
        function tm(a2) {
          a2 = a2 | 0;
          var b2 = 0, d2 = 0;
          b2 = V;
          V = V + 16 | 0;
          d2 = b2;
          c[d2 >> 2] = a2;
          a2 = Hn() | 0;
          I(a2 | 0, c[d2 >> 2] | 0, 4, 0, -1);
          V = b2;
          return;
        }
        function um(a2) {
          a2 = a2 | 0;
          var b2 = 0, d2 = 0;
          b2 = V;
          V = V + 16 | 0;
          d2 = b2;
          c[d2 >> 2] = a2;
          a2 = Fn() | 0;
          H(a2 | 0, c[d2 >> 2] | 0, 4);
          V = b2;
          return;
        }
        function vm(a2) {
          a2 = a2 | 0;
          var b2 = 0, d2 = 0;
          b2 = V;
          V = V + 16 | 0;
          d2 = b2;
          c[d2 >> 2] = a2;
          a2 = Dn() | 0;
          H(a2 | 0, c[d2 >> 2] | 0, 8);
          V = b2;
          return;
        }
        function wm() {
          return Cn() | 0;
        }
        function xm() {
          return Bn() | 0;
        }
        function ym() {
          return An() | 0;
        }
        function zm() {
          return zn() | 0;
        }
        function Am() {
          return yn() | 0;
        }
        function Bm() {
          return xn() | 0;
        }
        function Cm(a2) {
          a2 = a2 | 0;
          var b2 = 0, d2 = 0, e2 = 0;
          b2 = V;
          V = V + 16 | 0;
          d2 = b2;
          c[d2 >> 2] = a2;
          e2 = un() | 0;
          a2 = vn() | 0;
          J(e2 | 0, a2 | 0, c[d2 >> 2] | 0);
          V = b2;
          return;
        }
        function Dm(a2) {
          a2 = a2 | 0;
          var b2 = 0, d2 = 0, e2 = 0;
          b2 = V;
          V = V + 16 | 0;
          d2 = b2;
          c[d2 >> 2] = a2;
          e2 = rn() | 0;
          a2 = sn() | 0;
          J(e2 | 0, a2 | 0, c[d2 >> 2] | 0);
          V = b2;
          return;
        }
        function Em(a2) {
          a2 = a2 | 0;
          var b2 = 0, d2 = 0, e2 = 0;
          b2 = V;
          V = V + 16 | 0;
          d2 = b2;
          c[d2 >> 2] = a2;
          e2 = on() | 0;
          a2 = pn() | 0;
          J(e2 | 0, a2 | 0, c[d2 >> 2] | 0);
          V = b2;
          return;
        }
        function Fm(a2) {
          a2 = a2 | 0;
          var b2 = 0, d2 = 0, e2 = 0;
          b2 = V;
          V = V + 16 | 0;
          d2 = b2;
          c[d2 >> 2] = a2;
          e2 = ln() | 0;
          a2 = mn() | 0;
          J(e2 | 0, a2 | 0, c[d2 >> 2] | 0);
          V = b2;
          return;
        }
        function Gm(a2) {
          a2 = a2 | 0;
          var b2 = 0, d2 = 0, e2 = 0;
          b2 = V;
          V = V + 16 | 0;
          d2 = b2;
          c[d2 >> 2] = a2;
          e2 = hn() | 0;
          a2 = jn() | 0;
          J(e2 | 0, a2 | 0, c[d2 >> 2] | 0);
          V = b2;
          return;
        }
        function Hm(a2) {
          a2 = a2 | 0;
          var b2 = 0, d2 = 0, e2 = 0;
          b2 = V;
          V = V + 16 | 0;
          d2 = b2;
          c[d2 >> 2] = a2;
          e2 = en() | 0;
          a2 = fn() | 0;
          J(e2 | 0, a2 | 0, c[d2 >> 2] | 0);
          V = b2;
          return;
        }
        function Im(a2) {
          a2 = a2 | 0;
          var b2 = 0, d2 = 0, e2 = 0;
          b2 = V;
          V = V + 16 | 0;
          d2 = b2;
          c[d2 >> 2] = a2;
          e2 = bn() | 0;
          a2 = cn() | 0;
          J(e2 | 0, a2 | 0, c[d2 >> 2] | 0);
          V = b2;
          return;
        }
        function Jm(a2) {
          a2 = a2 | 0;
          var b2 = 0, d2 = 0, e2 = 0;
          b2 = V;
          V = V + 16 | 0;
          d2 = b2;
          c[d2 >> 2] = a2;
          e2 = _m() | 0;
          a2 = $m() | 0;
          J(e2 | 0, a2 | 0, c[d2 >> 2] | 0);
          V = b2;
          return;
        }
        function Km(a2) {
          a2 = a2 | 0;
          var b2 = 0, d2 = 0, e2 = 0;
          b2 = V;
          V = V + 16 | 0;
          d2 = b2;
          c[d2 >> 2] = a2;
          e2 = Xm() | 0;
          a2 = Ym() | 0;
          J(e2 | 0, a2 | 0, c[d2 >> 2] | 0);
          V = b2;
          return;
        }
        function Lm(a2) {
          a2 = a2 | 0;
          var b2 = 0, d2 = 0, e2 = 0;
          b2 = V;
          V = V + 16 | 0;
          d2 = b2;
          c[d2 >> 2] = a2;
          e2 = Um() | 0;
          a2 = Vm() | 0;
          J(e2 | 0, a2 | 0, c[d2 >> 2] | 0);
          V = b2;
          return;
        }
        function Mm(a2) {
          a2 = a2 | 0;
          var b2 = 0, d2 = 0, e2 = 0;
          b2 = V;
          V = V + 16 | 0;
          d2 = b2;
          c[d2 >> 2] = a2;
          e2 = Rm() | 0;
          a2 = Sm() | 0;
          J(e2 | 0, a2 | 0, c[d2 >> 2] | 0);
          V = b2;
          return;
        }
        function Nm(a2) {
          a2 = a2 | 0;
          var b2 = 0, d2 = 0, e2 = 0;
          b2 = V;
          V = V + 16 | 0;
          d2 = b2;
          c[d2 >> 2] = a2;
          e2 = Om() | 0;
          a2 = Pm() | 0;
          J(e2 | 0, a2 | 0, c[d2 >> 2] | 0);
          V = b2;
          return;
        }
        function Om() {
          return Qm() | 0;
        }
        function Pm() {
          return 7;
        }
        function Qm() {
          return 3440;
        }
        function Rm() {
          return Tm() | 0;
        }
        function Sm() {
          return 7;
        }
        function Tm() {
          return 3448;
        }
        function Um() {
          return Wm() | 0;
        }
        function Vm() {
          return 6;
        }
        function Wm() {
          return 3456;
        }
        function Xm() {
          return Zm() | 0;
        }
        function Ym() {
          return 5;
        }
        function Zm() {
          return 3464;
        }
        function _m() {
          return an() | 0;
        }
        function $m() {
          return 4;
        }
        function an() {
          return 3472;
        }
        function bn() {
          return dn() | 0;
        }
        function cn() {
          return 5;
        }
        function dn() {
          return 3480;
        }
        function en() {
          return gn() | 0;
        }
        function fn() {
          return 4;
        }
        function gn() {
          return 3488;
        }
        function hn() {
          return kn() | 0;
        }
        function jn() {
          return 3;
        }
        function kn() {
          return 3496;
        }
        function ln() {
          return nn() | 0;
        }
        function mn() {
          return 2;
        }
        function nn() {
          return 3504;
        }
        function on() {
          return qn() | 0;
        }
        function pn() {
          return 1;
        }
        function qn() {
          return 3512;
        }
        function rn() {
          return tn() | 0;
        }
        function sn() {
          return 0;
        }
        function tn() {
          return 3520;
        }
        function un() {
          return wn() | 0;
        }
        function vn() {
          return 0;
        }
        function wn() {
          return 3528;
        }
        function xn() {
          return 3536;
        }
        function yn() {
          return 3544;
        }
        function zn() {
          return 3576;
        }
        function An() {
          return 3600;
        }
        function Bn() {
          return 3624;
        }
        function Cn() {
          return 3648;
        }
        function Dn() {
          return En() | 0;
        }
        function En() {
          return 4144;
        }
        function Fn() {
          return Gn() | 0;
        }
        function Gn() {
          return 4136;
        }
        function Hn() {
          return In() | 0;
        }
        function In() {
          return 4128;
        }
        function Jn() {
          return Kn() | 0;
        }
        function Kn() {
          return 4120;
        }
        function Ln() {
          return Mn() | 0;
        }
        function Mn() {
          return 4112;
        }
        function Nn() {
          return On() | 0;
        }
        function On() {
          return 4104;
        }
        function Pn() {
          return Qn() | 0;
        }
        function Qn() {
          return 4096;
        }
        function Rn() {
          return Sn() | 0;
        }
        function Sn() {
          return 4088;
        }
        function Tn() {
          return Un() | 0;
        }
        function Un() {
          return 4072;
        }
        function Vn() {
          return Wn() | 0;
        }
        function Wn() {
          return 4080;
        }
        function Xn() {
          return Yn() | 0;
        }
        function Yn() {
          return 4064;
        }
        function Zn() {
          return 4056;
        }
        function _n() {
          return 4040;
        }
        function $n(a2) {
          a2 = a2 | 0;
          var b2 = 0, d2 = 0, e2 = 0, f2 = 0;
          b2 = V;
          V = V + 16 | 0;
          d2 = b2 + 8 | 0;
          e2 = b2 + 4 | 0;
          f2 = b2;
          c[f2 >> 2] = a2;
          c[e2 >> 2] = c[f2 >> 2];
          c[d2 >> 2] = c[(c[e2 >> 2] | 0) + 4 >> 2];
          a2 = Jo(c[d2 >> 2] | 0) | 0;
          V = b2;
          return a2 | 0;
        }
        function ao() {
          return 21636;
        }
        function bo(a2) {
          a2 = a2 | 0;
          return (a2 + -48 | 0) >>> 0 < 10 | 0;
        }
        function co() {
          return 5576;
        }
        function eo(b2, c2) {
          b2 = b2 | 0;
          c2 = c2 | 0;
          var d2 = 0, e2 = 0;
          d2 = a[b2 >> 0] | 0;
          e2 = a[c2 >> 0] | 0;
          if (d2 << 24 >> 24 == 0 ? 1 : d2 << 24 >> 24 != e2 << 24 >> 24)
            b2 = e2;
          else {
            do {
              b2 = b2 + 1 | 0;
              c2 = c2 + 1 | 0;
              d2 = a[b2 >> 0] | 0;
              e2 = a[c2 >> 0] | 0;
            } while (!(d2 << 24 >> 24 == 0 ? 1 : d2 << 24 >> 24 != e2 << 24 >> 24));
            b2 = e2;
          }
          return (d2 & 255) - (b2 & 255) | 0;
        }
        function fo(b2) {
          b2 = b2 | 0;
          var d2 = 0, e2 = 0, f2 = 0;
          f2 = b2;
          a:
            do
              if (!(f2 & 3))
                e2 = 5;
              else {
                d2 = f2;
                while (1) {
                  if (!(a[b2 >> 0] | 0)) {
                    b2 = d2;
                    break a;
                  }
                  b2 = b2 + 1 | 0;
                  d2 = b2;
                  if (!(d2 & 3)) {
                    e2 = 5;
                    break;
                  }
                }
              }
            while (0);
          if ((e2 | 0) == 5) {
            while (1) {
              d2 = c[b2 >> 2] | 0;
              if (!((d2 & -2139062144 ^ -2139062144) & d2 + -16843009))
                b2 = b2 + 4 | 0;
              else
                break;
            }
            if ((d2 & 255) << 24 >> 24)
              do
                b2 = b2 + 1 | 0;
              while ((a[b2 >> 0] | 0) != 0);
          }
          return b2 - f2 | 0;
        }
        function go(a2) {
          a2 = a2 | 0;
          return;
        }
        function ho(a2) {
          a2 = a2 | 0;
          return 1;
        }
        function io(b2) {
          b2 = b2 | 0;
          var d2 = 0, e2 = 0;
          d2 = b2 + 74 | 0;
          e2 = a[d2 >> 0] | 0;
          a[d2 >> 0] = e2 + 255 | e2;
          d2 = c[b2 >> 2] | 0;
          if (!(d2 & 8)) {
            c[b2 + 8 >> 2] = 0;
            c[b2 + 4 >> 2] = 0;
            e2 = c[b2 + 44 >> 2] | 0;
            c[b2 + 28 >> 2] = e2;
            c[b2 + 20 >> 2] = e2;
            c[b2 + 16 >> 2] = e2 + (c[b2 + 48 >> 2] | 0);
            b2 = 0;
          } else {
            c[b2 >> 2] = d2 | 32;
            b2 = -1;
          }
          return b2 | 0;
        }
        function jo(b2, d2, e2) {
          b2 = b2 | 0;
          d2 = d2 | 0;
          e2 = e2 | 0;
          var f2 = 0, g2 = 0, h2 = 0, i2 = 0, j2 = 0;
          f2 = e2 + 16 | 0;
          g2 = c[f2 >> 2] | 0;
          if (!g2)
            if (!(io(e2) | 0)) {
              g2 = c[f2 >> 2] | 0;
              h2 = 5;
            } else
              f2 = 0;
          else
            h2 = 5;
          a:
            do
              if ((h2 | 0) == 5) {
                j2 = e2 + 20 | 0;
                i2 = c[j2 >> 2] | 0;
                f2 = i2;
                if ((g2 - i2 | 0) >>> 0 < d2 >>> 0) {
                  f2 = aa[c[e2 + 36 >> 2] & 7](e2, b2, d2) | 0;
                  break;
                }
                b:
                  do
                    if ((a[e2 + 75 >> 0] | 0) < 0 | (d2 | 0) == 0) {
                      h2 = 0;
                      g2 = b2;
                    } else {
                      i2 = d2;
                      while (1) {
                        g2 = i2 + -1 | 0;
                        if ((a[b2 + g2 >> 0] | 0) == 10)
                          break;
                        if (!g2) {
                          h2 = 0;
                          g2 = b2;
                          break b;
                        } else
                          i2 = g2;
                      }
                      f2 = aa[c[e2 + 36 >> 2] & 7](e2, b2, i2) | 0;
                      if (f2 >>> 0 < i2 >>> 0)
                        break a;
                      h2 = i2;
                      g2 = b2 + i2 | 0;
                      d2 = d2 - i2 | 0;
                      f2 = c[j2 >> 2] | 0;
                    }
                  while (0);
                ur(f2 | 0, g2 | 0, d2 | 0) | 0;
                c[j2 >> 2] = (c[j2 >> 2] | 0) + d2;
                f2 = h2 + d2 | 0;
              }
            while (0);
          return f2 | 0;
        }
        function ko(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          if (!b2)
            b2 = 0;
          else
            b2 = lo(c[b2 >> 2] | 0, c[b2 + 4 >> 2] | 0, a2) | 0;
          return ((b2 | 0) == 0 ? a2 : b2) | 0;
        }
        function lo(b2, d2, e2) {
          b2 = b2 | 0;
          d2 = d2 | 0;
          e2 = e2 | 0;
          var f2 = 0, g2 = 0, h2 = 0, i2 = 0, j2 = 0, k2 = 0, l2 = 0, m2 = 0, n2 = 0, o2 = 0;
          o2 = (c[b2 >> 2] | 0) + 1794895138 | 0;
          h2 = mo(c[b2 + 8 >> 2] | 0, o2) | 0;
          f2 = mo(c[b2 + 12 >> 2] | 0, o2) | 0;
          g2 = mo(c[b2 + 16 >> 2] | 0, o2) | 0;
          a:
            do
              if ((h2 >>> 0 < d2 >>> 2 >>> 0 ? (n2 = d2 - (h2 << 2) | 0, f2 >>> 0 < n2 >>> 0 & g2 >>> 0 < n2 >>> 0) : 0) ? ((g2 | f2) & 3 | 0) == 0 : 0) {
                n2 = f2 >>> 2;
                m2 = g2 >>> 2;
                l2 = 0;
                while (1) {
                  j2 = h2 >>> 1;
                  k2 = l2 + j2 | 0;
                  i2 = k2 << 1;
                  g2 = i2 + n2 | 0;
                  f2 = mo(c[b2 + (g2 << 2) >> 2] | 0, o2) | 0;
                  g2 = mo(c[b2 + (g2 + 1 << 2) >> 2] | 0, o2) | 0;
                  if (!(g2 >>> 0 < d2 >>> 0 & f2 >>> 0 < (d2 - g2 | 0) >>> 0)) {
                    f2 = 0;
                    break a;
                  }
                  if (a[b2 + (g2 + f2) >> 0] | 0) {
                    f2 = 0;
                    break a;
                  }
                  f2 = eo(e2, b2 + g2 | 0) | 0;
                  if (!f2)
                    break;
                  f2 = (f2 | 0) < 0;
                  if ((h2 | 0) == 1) {
                    f2 = 0;
                    break a;
                  }
                  l2 = f2 ? l2 : k2;
                  h2 = f2 ? j2 : h2 - j2 | 0;
                }
                f2 = i2 + m2 | 0;
                g2 = mo(c[b2 + (f2 << 2) >> 2] | 0, o2) | 0;
                f2 = mo(c[b2 + (f2 + 1 << 2) >> 2] | 0, o2) | 0;
                if (f2 >>> 0 < d2 >>> 0 & g2 >>> 0 < (d2 - f2 | 0) >>> 0)
                  f2 = (a[b2 + (f2 + g2) >> 0] | 0) == 0 ? b2 + f2 | 0 : 0;
                else
                  f2 = 0;
              } else
                f2 = 0;
            while (0);
          return f2 | 0;
        }
        function mo(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          var c2 = 0;
          c2 = tr(a2 | 0) | 0;
          return ((b2 | 0) == 0 ? a2 : c2) | 0;
        }
        function no(b2, d2, e2) {
          b2 = b2 | 0;
          d2 = d2 | 0;
          e2 = e2 | 0;
          var f2 = 0, g2 = 0, h2 = 0;
          h2 = d2 & 255;
          f2 = (e2 | 0) != 0;
          a:
            do
              if (f2 & (b2 & 3 | 0) != 0) {
                g2 = d2 & 255;
                while (1) {
                  if ((a[b2 >> 0] | 0) == g2 << 24 >> 24) {
                    g2 = 6;
                    break a;
                  }
                  b2 = b2 + 1 | 0;
                  e2 = e2 + -1 | 0;
                  f2 = (e2 | 0) != 0;
                  if (!(f2 & (b2 & 3 | 0) != 0)) {
                    g2 = 5;
                    break;
                  }
                }
              } else
                g2 = 5;
            while (0);
          if ((g2 | 0) == 5)
            if (f2)
              g2 = 6;
            else
              b2 = 0;
          b:
            do
              if ((g2 | 0) == 6) {
                if ((a[b2 >> 0] | 0) != (d2 & 255) << 24 >> 24) {
                  f2 = q(h2, 16843009) | 0;
                  c:
                    do
                      if (e2 >>> 0 > 3)
                        do {
                          h2 = c[b2 >> 2] ^ f2;
                          if ((h2 & -2139062144 ^ -2139062144) & h2 + -16843009 | 0)
                            break c;
                          b2 = b2 + 4 | 0;
                          e2 = e2 + -4 | 0;
                        } while (e2 >>> 0 > 3);
                    while (0);
                }
                if (!e2)
                  b2 = 0;
                else {
                  f2 = d2 & 255;
                  while (1) {
                    if ((a[b2 >> 0] | 0) == f2 << 24 >> 24)
                      break b;
                    e2 = e2 + -1 | 0;
                    if (!e2) {
                      b2 = 0;
                      break;
                    } else
                      b2 = b2 + 1 | 0;
                  }
                }
              }
            while (0);
          return b2 | 0;
        }
        function oo(a2, b2, c2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          c2 = c2 | 0;
          return ro(a2, b2, c2, 1, 8) | 0;
        }
        function po(b2, e2, f2, g2, h2, i2) {
          b2 = b2 | 0;
          e2 = +e2;
          f2 = f2 | 0;
          g2 = g2 | 0;
          h2 = h2 | 0;
          i2 = i2 | 0;
          var j2 = 0, k2 = 0, l2 = 0, m2 = 0, n2 = 0, o2 = 0, p2 = 0, r2 = 0, s2 = 0, t2 = 0, v2 = 0, w2 = 0, x2 = 0, y2 = 0, z2 = 0, A2 = 0, B2 = 0, C2 = 0, D2 = 0, E2 = 0, F2 = 0, G2 = 0, H2 = 0;
          H2 = V;
          V = V + 560 | 0;
          l2 = H2 + 32 | 0;
          w2 = H2 + 536 | 0;
          G2 = H2;
          F2 = G2;
          m2 = H2 + 540 | 0;
          c[w2 >> 2] = 0;
          E2 = m2 + 12 | 0;
          Do(e2) | 0;
          j2 = u() | 0;
          if ((j2 | 0) < 0) {
            e2 = -e2;
            Do(e2) | 0;
            D2 = 1;
            C2 = 20247;
            j2 = u() | 0;
          } else {
            D2 = (h2 & 2049 | 0) != 0 & 1;
            C2 = (h2 & 2048 | 0) == 0 ? (h2 & 1 | 0) == 0 ? 20248 : 20253 : 20250;
          }
          do
            if (true & (j2 & 2146435072 | 0) == 2146435072) {
              G2 = (i2 & 32 | 0) != 0;
              j2 = D2 + 3 | 0;
              zo(b2, 32, f2, j2, h2 & -65537);
              to(b2, C2, D2);
              to(b2, e2 != e2 | false ? G2 ? 20274 : 20278 : G2 ? 20266 : 20270, 3);
              zo(b2, 32, f2, j2, h2 ^ 8192);
            } else {
              r2 = +Eo(e2, w2) * 2;
              j2 = r2 != 0;
              if (j2)
                c[w2 >> 2] = (c[w2 >> 2] | 0) + -1;
              v2 = i2 | 32;
              if ((v2 | 0) == 97) {
                o2 = i2 & 32;
                s2 = (o2 | 0) == 0 ? C2 : C2 + 9 | 0;
                p2 = D2 | 2;
                j2 = 12 - g2 | 0;
                do
                  if (!(g2 >>> 0 > 11 | (j2 | 0) == 0)) {
                    e2 = 8;
                    do {
                      j2 = j2 + -1 | 0;
                      e2 = e2 * 16;
                    } while ((j2 | 0) != 0);
                    if ((a[s2 >> 0] | 0) == 45) {
                      e2 = -(e2 + (-r2 - e2));
                      break;
                    } else {
                      e2 = r2 + e2 - e2;
                      break;
                    }
                  } else
                    e2 = r2;
                while (0);
                k2 = c[w2 >> 2] | 0;
                j2 = (k2 | 0) < 0 ? 0 - k2 | 0 : k2;
                j2 = yo(j2, ((j2 | 0) < 0) << 31 >> 31, E2) | 0;
                if ((j2 | 0) == (E2 | 0)) {
                  j2 = m2 + 11 | 0;
                  a[j2 >> 0] = 48;
                }
                a[j2 + -1 >> 0] = (k2 >> 31 & 2) + 43;
                n2 = j2 + -2 | 0;
                a[n2 >> 0] = i2 + 15;
                k2 = (g2 | 0) < 1;
                l2 = (h2 & 8 | 0) == 0;
                m2 = G2;
                do {
                  D2 = ~~e2;
                  j2 = m2 + 1 | 0;
                  a[m2 >> 0] = o2 | d[640 + D2 >> 0];
                  e2 = (e2 - +(D2 | 0)) * 16;
                  if ((j2 - F2 | 0) == 1 ? !(l2 & (k2 & e2 == 0)) : 0) {
                    a[j2 >> 0] = 46;
                    m2 = m2 + 2 | 0;
                  } else
                    m2 = j2;
                } while (e2 != 0);
                if ((g2 | 0) != 0 ? (-2 - F2 + m2 | 0) < (g2 | 0) : 0) {
                  k2 = E2;
                  l2 = n2;
                  j2 = g2 + 2 + k2 - l2 | 0;
                } else {
                  k2 = E2;
                  l2 = n2;
                  j2 = k2 - F2 - l2 + m2 | 0;
                }
                E2 = j2 + p2 | 0;
                zo(b2, 32, f2, E2, h2);
                to(b2, s2, p2);
                zo(b2, 48, f2, E2, h2 ^ 65536);
                F2 = m2 - F2 | 0;
                to(b2, G2, F2);
                G2 = k2 - l2 | 0;
                zo(b2, 48, j2 - (F2 + G2) | 0, 0, 0);
                to(b2, n2, G2);
                zo(b2, 32, f2, E2, h2 ^ 8192);
                j2 = E2;
                break;
              }
              k2 = (g2 | 0) < 0 ? 6 : g2;
              if (j2) {
                j2 = (c[w2 >> 2] | 0) + -28 | 0;
                c[w2 >> 2] = j2;
                e2 = r2 * 268435456;
              } else {
                e2 = r2;
                j2 = c[w2 >> 2] | 0;
              }
              B2 = (j2 | 0) < 0 ? l2 : l2 + 288 | 0;
              l2 = B2;
              do {
                z2 = ~~e2 >>> 0;
                c[l2 >> 2] = z2;
                l2 = l2 + 4 | 0;
                e2 = (e2 - +(z2 >>> 0)) * 1e9;
              } while (e2 != 0);
              z2 = B2;
              if ((j2 | 0) > 0) {
                o2 = B2;
                while (1) {
                  n2 = (j2 | 0) < 29 ? j2 : 29;
                  j2 = l2 + -4 | 0;
                  if (j2 >>> 0 >= o2 >>> 0) {
                    m2 = 0;
                    do {
                      t2 = rr(c[j2 >> 2] | 0, 0, n2 | 0) | 0;
                      t2 = lr(t2 | 0, u() | 0, m2 | 0, 0) | 0;
                      x2 = u() | 0;
                      m2 = pr(t2 | 0, x2 | 0, 1e9, 0) | 0;
                      y2 = kr(m2 | 0, u() | 0, 1e9, 0) | 0;
                      y2 = mr(t2 | 0, x2 | 0, y2 | 0, u() | 0) | 0;
                      u() | 0;
                      c[j2 >> 2] = y2;
                      j2 = j2 + -4 | 0;
                    } while (j2 >>> 0 >= o2 >>> 0);
                    if (m2) {
                      y2 = o2 + -4 | 0;
                      c[y2 >> 2] = m2;
                      m2 = y2;
                    } else
                      m2 = o2;
                  } else
                    m2 = o2;
                  a:
                    do
                      if (l2 >>> 0 > m2 >>> 0) {
                        j2 = l2;
                        while (1) {
                          l2 = j2 + -4 | 0;
                          if (c[l2 >> 2] | 0) {
                            l2 = j2;
                            break a;
                          }
                          if (l2 >>> 0 > m2 >>> 0)
                            j2 = l2;
                          else
                            break;
                        }
                      }
                    while (0);
                  j2 = (c[w2 >> 2] | 0) - n2 | 0;
                  c[w2 >> 2] = j2;
                  if ((j2 | 0) > 0)
                    o2 = m2;
                  else
                    break;
                }
              } else
                m2 = B2;
              if ((j2 | 0) < 0) {
                g2 = ((k2 + 25 | 0) / 9 | 0) + 1 | 0;
                t2 = (v2 | 0) == 102;
                do {
                  s2 = 0 - j2 | 0;
                  s2 = (s2 | 0) < 9 ? s2 : 9;
                  if (m2 >>> 0 < l2 >>> 0) {
                    n2 = (1 << s2) + -1 | 0;
                    o2 = 1e9 >>> s2;
                    p2 = 0;
                    j2 = m2;
                    do {
                      y2 = c[j2 >> 2] | 0;
                      c[j2 >> 2] = (y2 >>> s2) + p2;
                      p2 = q(y2 & n2, o2) | 0;
                      j2 = j2 + 4 | 0;
                    } while (j2 >>> 0 < l2 >>> 0);
                    m2 = (c[m2 >> 2] | 0) == 0 ? m2 + 4 | 0 : m2;
                    if (p2) {
                      c[l2 >> 2] = p2;
                      l2 = l2 + 4 | 0;
                    }
                  } else
                    m2 = (c[m2 >> 2] | 0) == 0 ? m2 + 4 | 0 : m2;
                  j2 = t2 ? B2 : m2;
                  l2 = (l2 - j2 >> 2 | 0) > (g2 | 0) ? j2 + (g2 << 2) | 0 : l2;
                  j2 = (c[w2 >> 2] | 0) + s2 | 0;
                  c[w2 >> 2] = j2;
                } while ((j2 | 0) < 0);
                t2 = m2;
              } else
                t2 = m2;
              if (t2 >>> 0 < l2 >>> 0) {
                j2 = (z2 - t2 >> 2) * 9 | 0;
                n2 = c[t2 >> 2] | 0;
                if (n2 >>> 0 >= 10) {
                  m2 = 10;
                  do {
                    m2 = m2 * 10 | 0;
                    j2 = j2 + 1 | 0;
                  } while (n2 >>> 0 >= m2 >>> 0);
                }
              } else
                j2 = 0;
              x2 = (v2 | 0) == 103;
              y2 = (k2 | 0) != 0;
              m2 = k2 - ((v2 | 0) == 102 ? 0 : j2) + ((y2 & x2) << 31 >> 31) | 0;
              if ((m2 | 0) < (((l2 - z2 >> 2) * 9 | 0) + -9 | 0)) {
                w2 = m2 + 9216 | 0;
                m2 = (w2 | 0) / 9 | 0;
                g2 = B2 + 4 + (m2 + -1024 << 2) | 0;
                m2 = w2 - (m2 * 9 | 0) | 0;
                if ((m2 | 0) < 8) {
                  n2 = 10;
                  while (1) {
                    n2 = n2 * 10 | 0;
                    if ((m2 | 0) < 7)
                      m2 = m2 + 1 | 0;
                    else
                      break;
                  }
                } else
                  n2 = 10;
                p2 = c[g2 >> 2] | 0;
                m2 = (p2 >>> 0) / (n2 >>> 0) | 0;
                s2 = p2 - (q(m2, n2) | 0) | 0;
                o2 = (g2 + 4 | 0) == (l2 | 0);
                if (!(o2 & (s2 | 0) == 0)) {
                  r2 = (m2 & 1 | 0) == 0 ? 9007199254740992 : 9007199254740994;
                  w2 = n2 >>> 1;
                  e2 = s2 >>> 0 < w2 >>> 0 ? 0.5 : o2 & (s2 | 0) == (w2 | 0) ? 1 : 1.5;
                  if (D2) {
                    w2 = (a[C2 >> 0] | 0) == 45;
                    e2 = w2 ? -e2 : e2;
                    r2 = w2 ? -r2 : r2;
                  }
                  m2 = p2 - s2 | 0;
                  c[g2 >> 2] = m2;
                  if (r2 + e2 != r2) {
                    w2 = m2 + n2 | 0;
                    c[g2 >> 2] = w2;
                    if (w2 >>> 0 > 999999999) {
                      n2 = g2;
                      j2 = t2;
                      while (1) {
                        m2 = n2 + -4 | 0;
                        c[n2 >> 2] = 0;
                        if (m2 >>> 0 < j2 >>> 0) {
                          j2 = j2 + -4 | 0;
                          c[j2 >> 2] = 0;
                        }
                        w2 = (c[m2 >> 2] | 0) + 1 | 0;
                        c[m2 >> 2] = w2;
                        if (w2 >>> 0 > 999999999)
                          n2 = m2;
                        else {
                          n2 = j2;
                          break;
                        }
                      }
                    } else {
                      m2 = g2;
                      n2 = t2;
                    }
                    j2 = (z2 - n2 >> 2) * 9 | 0;
                    p2 = c[n2 >> 2] | 0;
                    if (p2 >>> 0 >= 10) {
                      o2 = 10;
                      do {
                        o2 = o2 * 10 | 0;
                        j2 = j2 + 1 | 0;
                      } while (p2 >>> 0 >= o2 >>> 0);
                    }
                  } else {
                    m2 = g2;
                    n2 = t2;
                  }
                } else {
                  m2 = g2;
                  n2 = t2;
                }
                w2 = m2 + 4 | 0;
                l2 = l2 >>> 0 > w2 >>> 0 ? w2 : l2;
              } else
                n2 = t2;
              g2 = 0 - j2 | 0;
              b:
                do
                  if (l2 >>> 0 > n2 >>> 0)
                    while (1) {
                      m2 = l2 + -4 | 0;
                      if (c[m2 >> 2] | 0) {
                        w2 = l2;
                        v2 = 1;
                        break b;
                      }
                      if (m2 >>> 0 > n2 >>> 0)
                        l2 = m2;
                      else {
                        w2 = m2;
                        v2 = 0;
                        break;
                      }
                    }
                  else {
                    w2 = l2;
                    v2 = 0;
                  }
                while (0);
              do
                if (x2) {
                  k2 = k2 + ((y2 ^ 1) & 1) | 0;
                  if ((k2 | 0) > (j2 | 0) & (j2 | 0) > -5) {
                    o2 = i2 + -1 | 0;
                    k2 = k2 + -1 - j2 | 0;
                  } else {
                    o2 = i2 + -2 | 0;
                    k2 = k2 + -1 | 0;
                  }
                  if (!(h2 & 8)) {
                    if (v2 ? (A2 = c[w2 + -4 >> 2] | 0, (A2 | 0) != 0) : 0)
                      if (!((A2 >>> 0) % 10 | 0)) {
                        m2 = 0;
                        l2 = 10;
                        do {
                          l2 = l2 * 10 | 0;
                          m2 = m2 + 1 | 0;
                        } while (!((A2 >>> 0) % (l2 >>> 0) | 0 | 0));
                      } else
                        m2 = 0;
                    else
                      m2 = 9;
                    l2 = ((w2 - z2 >> 2) * 9 | 0) + -9 | 0;
                    if ((o2 | 32 | 0) == 102) {
                      i2 = l2 - m2 | 0;
                      i2 = (i2 | 0) > 0 ? i2 : 0;
                      k2 = (k2 | 0) < (i2 | 0) ? k2 : i2;
                      break;
                    } else {
                      i2 = l2 + j2 - m2 | 0;
                      i2 = (i2 | 0) > 0 ? i2 : 0;
                      k2 = (k2 | 0) < (i2 | 0) ? k2 : i2;
                      break;
                    }
                  }
                } else
                  o2 = i2;
              while (0);
              t2 = (k2 | 0) != 0;
              p2 = t2 ? 1 : h2 >>> 3 & 1;
              s2 = (o2 | 32 | 0) == 102;
              if (s2) {
                x2 = 0;
                j2 = (j2 | 0) > 0 ? j2 : 0;
              } else {
                l2 = (j2 | 0) < 0 ? g2 : j2;
                l2 = yo(l2, ((l2 | 0) < 0) << 31 >> 31, E2) | 0;
                m2 = E2;
                if ((m2 - l2 | 0) < 2)
                  do {
                    l2 = l2 + -1 | 0;
                    a[l2 >> 0] = 48;
                  } while ((m2 - l2 | 0) < 2);
                a[l2 + -1 >> 0] = (j2 >> 31 & 2) + 43;
                j2 = l2 + -2 | 0;
                a[j2 >> 0] = o2;
                x2 = j2;
                j2 = m2 - j2 | 0;
              }
              j2 = D2 + 1 + k2 + p2 + j2 | 0;
              zo(b2, 32, f2, j2, h2);
              to(b2, C2, D2);
              zo(b2, 48, f2, j2, h2 ^ 65536);
              if (s2) {
                p2 = n2 >>> 0 > B2 >>> 0 ? B2 : n2;
                s2 = G2 + 9 | 0;
                n2 = s2;
                o2 = G2 + 8 | 0;
                m2 = p2;
                do {
                  l2 = yo(c[m2 >> 2] | 0, 0, s2) | 0;
                  if ((m2 | 0) == (p2 | 0)) {
                    if ((l2 | 0) == (s2 | 0)) {
                      a[o2 >> 0] = 48;
                      l2 = o2;
                    }
                  } else if (l2 >>> 0 > G2 >>> 0) {
                    wr(G2 | 0, 48, l2 - F2 | 0) | 0;
                    do
                      l2 = l2 + -1 | 0;
                    while (l2 >>> 0 > G2 >>> 0);
                  }
                  to(b2, l2, n2 - l2 | 0);
                  m2 = m2 + 4 | 0;
                } while (m2 >>> 0 <= B2 >>> 0);
                if (!((h2 & 8 | 0) == 0 & (t2 ^ 1)))
                  to(b2, 20282, 1);
                if (m2 >>> 0 < w2 >>> 0 & (k2 | 0) > 0)
                  while (1) {
                    l2 = yo(c[m2 >> 2] | 0, 0, s2) | 0;
                    if (l2 >>> 0 > G2 >>> 0) {
                      wr(G2 | 0, 48, l2 - F2 | 0) | 0;
                      do
                        l2 = l2 + -1 | 0;
                      while (l2 >>> 0 > G2 >>> 0);
                    }
                    to(b2, l2, (k2 | 0) < 9 ? k2 : 9);
                    m2 = m2 + 4 | 0;
                    l2 = k2 + -9 | 0;
                    if (!(m2 >>> 0 < w2 >>> 0 & (k2 | 0) > 9)) {
                      k2 = l2;
                      break;
                    } else
                      k2 = l2;
                  }
                zo(b2, 48, k2 + 9 | 0, 9, 0);
              } else {
                w2 = v2 ? w2 : n2 + 4 | 0;
                if (n2 >>> 0 < w2 >>> 0 & (k2 | 0) > -1) {
                  g2 = G2 + 9 | 0;
                  t2 = (h2 & 8 | 0) == 0;
                  v2 = g2;
                  p2 = 0 - F2 | 0;
                  s2 = G2 + 8 | 0;
                  o2 = n2;
                  do {
                    l2 = yo(c[o2 >> 2] | 0, 0, g2) | 0;
                    if ((l2 | 0) == (g2 | 0)) {
                      a[s2 >> 0] = 48;
                      l2 = s2;
                    }
                    do
                      if ((o2 | 0) == (n2 | 0)) {
                        m2 = l2 + 1 | 0;
                        to(b2, l2, 1);
                        if (t2 & (k2 | 0) < 1) {
                          l2 = m2;
                          break;
                        }
                        to(b2, 20282, 1);
                        l2 = m2;
                      } else {
                        if (l2 >>> 0 <= G2 >>> 0)
                          break;
                        wr(G2 | 0, 48, l2 + p2 | 0) | 0;
                        do
                          l2 = l2 + -1 | 0;
                        while (l2 >>> 0 > G2 >>> 0);
                      }
                    while (0);
                    F2 = v2 - l2 | 0;
                    to(b2, l2, (k2 | 0) > (F2 | 0) ? F2 : k2);
                    k2 = k2 - F2 | 0;
                    o2 = o2 + 4 | 0;
                  } while (o2 >>> 0 < w2 >>> 0 & (k2 | 0) > -1);
                }
                zo(b2, 48, k2 + 18 | 0, 18, 0);
                to(b2, x2, E2 - x2 | 0);
              }
              zo(b2, 32, f2, j2, h2 ^ 8192);
            }
          while (0);
          V = H2;
          return ((j2 | 0) < (f2 | 0) ? f2 : j2) | 0;
        }
        function qo(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          var d2 = 0, e2 = 0;
          e2 = (c[b2 >> 2] | 0) + (8 - 1) & ~(8 - 1);
          d2 = +g[e2 >> 3];
          c[b2 >> 2] = e2 + 8;
          g[a2 >> 3] = d2;
          return;
        }
        function ro(b2, d2, e2, f2, g2) {
          b2 = b2 | 0;
          d2 = d2 | 0;
          e2 = e2 | 0;
          f2 = f2 | 0;
          g2 = g2 | 0;
          var h2 = 0, i2 = 0, j2 = 0, k2 = 0, l2 = 0, m2 = 0, n2 = 0, o2 = 0, p2 = 0, q2 = 0, r2 = 0, s2 = 0, t2 = 0;
          t2 = V;
          V = V + 224 | 0;
          p2 = t2 + 208 | 0;
          q2 = t2 + 160 | 0;
          r2 = t2 + 80 | 0;
          s2 = t2;
          h2 = q2;
          i2 = h2 + 40 | 0;
          do {
            c[h2 >> 2] = 0;
            h2 = h2 + 4 | 0;
          } while ((h2 | 0) < (i2 | 0));
          c[p2 >> 2] = c[e2 >> 2];
          if ((so(0, d2, p2, r2, q2, f2, g2) | 0) < 0)
            e2 = -1;
          else {
            if ((c[b2 + 76 >> 2] | 0) > -1)
              o2 = ho(b2) | 0;
            else
              o2 = 0;
            e2 = c[b2 >> 2] | 0;
            n2 = e2 & 32;
            if ((a[b2 + 74 >> 0] | 0) < 1)
              c[b2 >> 2] = e2 & -33;
            h2 = b2 + 48 | 0;
            if (!(c[h2 >> 2] | 0)) {
              i2 = b2 + 44 | 0;
              j2 = c[i2 >> 2] | 0;
              c[i2 >> 2] = s2;
              k2 = b2 + 28 | 0;
              c[k2 >> 2] = s2;
              l2 = b2 + 20 | 0;
              c[l2 >> 2] = s2;
              c[h2 >> 2] = 80;
              m2 = b2 + 16 | 0;
              c[m2 >> 2] = s2 + 80;
              e2 = so(b2, d2, p2, r2, q2, f2, g2) | 0;
              if (j2) {
                aa[c[b2 + 36 >> 2] & 7](b2, 0, 0) | 0;
                e2 = (c[l2 >> 2] | 0) == 0 ? -1 : e2;
                c[i2 >> 2] = j2;
                c[h2 >> 2] = 0;
                c[m2 >> 2] = 0;
                c[k2 >> 2] = 0;
                c[l2 >> 2] = 0;
              }
            } else
              e2 = so(b2, d2, p2, r2, q2, f2, g2) | 0;
            h2 = c[b2 >> 2] | 0;
            c[b2 >> 2] = h2 | n2;
            if (o2 | 0)
              go(b2);
            e2 = (h2 & 32 | 0) == 0 ? e2 : -1;
          }
          V = t2;
          return e2 | 0;
        }
        function so(d2, e2, f2, h2, i2, j2, k2) {
          d2 = d2 | 0;
          e2 = e2 | 0;
          f2 = f2 | 0;
          h2 = h2 | 0;
          i2 = i2 | 0;
          j2 = j2 | 0;
          k2 = k2 | 0;
          var l2 = 0, m2 = 0, n2 = 0, o2 = 0, p2 = 0, q2 = 0, r2 = 0, s2 = 0, t2 = 0, v2 = 0, w2 = 0, x2 = 0, y2 = 0, z2 = 0, A2 = 0, B2 = 0, C2 = 0, D2 = 0, E2 = 0, F2 = 0, G2 = 0, H2 = 0, I2 = 0, J2 = 0, K2 = 0;
          J2 = V;
          V = V + 64 | 0;
          G2 = J2 + 56 | 0;
          I2 = J2 + 40 | 0;
          B2 = J2;
          D2 = J2 + 48 | 0;
          E2 = J2 + 60 | 0;
          c[G2 >> 2] = e2;
          y2 = (d2 | 0) != 0;
          z2 = B2 + 40 | 0;
          A2 = z2;
          B2 = B2 + 39 | 0;
          C2 = D2 + 4 | 0;
          l2 = 0;
          e2 = 0;
          n2 = 0;
          a:
            while (1) {
              do {
                do
                  if ((e2 | 0) > -1)
                    if ((l2 | 0) > (2147483647 - e2 | 0)) {
                      c[(ao() | 0) >> 2] = 61;
                      e2 = -1;
                      break;
                    } else {
                      e2 = l2 + e2 | 0;
                      break;
                    }
                while (0);
                r2 = c[G2 >> 2] | 0;
                l2 = a[r2 >> 0] | 0;
                if (!(l2 << 24 >> 24)) {
                  x2 = 92;
                  break a;
                }
                m2 = r2;
                b:
                  while (1) {
                    switch (l2 << 24 >> 24) {
                      case 37: {
                        x2 = 10;
                        break b;
                      }
                      case 0: {
                        l2 = m2;
                        break b;
                      }
                      default: {
                      }
                    }
                    w2 = m2 + 1 | 0;
                    c[G2 >> 2] = w2;
                    l2 = a[w2 >> 0] | 0;
                    m2 = w2;
                  }
                c:
                  do
                    if ((x2 | 0) == 10) {
                      x2 = 0;
                      l2 = m2;
                      do {
                        if ((a[m2 + 1 >> 0] | 0) != 37)
                          break c;
                        l2 = l2 + 1 | 0;
                        m2 = m2 + 2 | 0;
                        c[G2 >> 2] = m2;
                      } while ((a[m2 >> 0] | 0) == 37);
                    }
                  while (0);
                l2 = l2 - r2 | 0;
                if (y2)
                  to(d2, r2, l2);
              } while ((l2 | 0) != 0);
              w2 = (bo(a[(c[G2 >> 2] | 0) + 1 >> 0] | 0) | 0) == 0;
              m2 = c[G2 >> 2] | 0;
              if (!w2 ? (a[m2 + 2 >> 0] | 0) == 36 : 0) {
                t2 = (a[m2 + 1 >> 0] | 0) + -48 | 0;
                p2 = 1;
                l2 = 3;
              } else {
                t2 = -1;
                p2 = n2;
                l2 = 1;
              }
              l2 = m2 + l2 | 0;
              c[G2 >> 2] = l2;
              m2 = a[l2 >> 0] | 0;
              n2 = (m2 << 24 >> 24) + -32 | 0;
              if (n2 >>> 0 > 31 | (1 << n2 & 75913 | 0) == 0)
                o2 = 0;
              else {
                o2 = 0;
                do {
                  o2 = 1 << n2 | o2;
                  l2 = l2 + 1 | 0;
                  c[G2 >> 2] = l2;
                  m2 = a[l2 >> 0] | 0;
                  n2 = (m2 << 24 >> 24) + -32 | 0;
                } while (!(n2 >>> 0 > 31 | (1 << n2 & 75913 | 0) == 0));
              }
              if (m2 << 24 >> 24 == 42) {
                if ((bo(a[l2 + 1 >> 0] | 0) | 0) != 0 ? (H2 = c[G2 >> 2] | 0, (a[H2 + 2 >> 0] | 0) == 36) : 0) {
                  l2 = H2 + 1 | 0;
                  c[i2 + ((a[l2 >> 0] | 0) + -48 << 2) >> 2] = 10;
                  l2 = c[h2 + ((a[l2 >> 0] | 0) + -48 << 3) >> 2] | 0;
                  n2 = 1;
                  m2 = H2 + 3 | 0;
                } else {
                  if (p2 | 0) {
                    e2 = -1;
                    break;
                  }
                  if (y2) {
                    w2 = (c[f2 >> 2] | 0) + (4 - 1) & ~(4 - 1);
                    l2 = c[w2 >> 2] | 0;
                    c[f2 >> 2] = w2 + 4;
                  } else
                    l2 = 0;
                  n2 = 0;
                  m2 = (c[G2 >> 2] | 0) + 1 | 0;
                }
                c[G2 >> 2] = m2;
                w2 = (l2 | 0) < 0;
                v2 = w2 ? 0 - l2 | 0 : l2;
                o2 = w2 ? o2 | 8192 : o2;
                w2 = n2;
              } else {
                l2 = uo(G2) | 0;
                if ((l2 | 0) < 0) {
                  e2 = -1;
                  break;
                }
                v2 = l2;
                w2 = p2;
                m2 = c[G2 >> 2] | 0;
              }
              do
                if ((a[m2 >> 0] | 0) == 46) {
                  l2 = m2 + 1 | 0;
                  if ((a[l2 >> 0] | 0) != 42) {
                    c[G2 >> 2] = l2;
                    l2 = uo(G2) | 0;
                    m2 = c[G2 >> 2] | 0;
                    break;
                  }
                  if (bo(a[m2 + 2 >> 0] | 0) | 0 ? (F2 = c[G2 >> 2] | 0, (a[F2 + 3 >> 0] | 0) == 36) : 0) {
                    l2 = F2 + 2 | 0;
                    c[i2 + ((a[l2 >> 0] | 0) + -48 << 2) >> 2] = 10;
                    l2 = c[h2 + ((a[l2 >> 0] | 0) + -48 << 3) >> 2] | 0;
                    m2 = F2 + 4 | 0;
                    c[G2 >> 2] = m2;
                    break;
                  }
                  if (w2 | 0) {
                    e2 = -1;
                    break a;
                  }
                  if (y2) {
                    s2 = (c[f2 >> 2] | 0) + (4 - 1) & ~(4 - 1);
                    l2 = c[s2 >> 2] | 0;
                    c[f2 >> 2] = s2 + 4;
                  } else
                    l2 = 0;
                  m2 = (c[G2 >> 2] | 0) + 2 | 0;
                  c[G2 >> 2] = m2;
                } else
                  l2 = -1;
              while (0);
              s2 = 0;
              while (1) {
                if (((a[m2 >> 0] | 0) + -65 | 0) >>> 0 > 57) {
                  e2 = -1;
                  break a;
                }
                n2 = m2;
                m2 = m2 + 1 | 0;
                c[G2 >> 2] = m2;
                n2 = a[(a[n2 >> 0] | 0) + -65 + (176 + (s2 * 58 | 0)) >> 0] | 0;
                p2 = n2 & 255;
                if ((p2 + -1 | 0) >>> 0 >= 8)
                  break;
                else
                  s2 = p2;
              }
              if (!(n2 << 24 >> 24)) {
                e2 = -1;
                break;
              }
              q2 = (t2 | 0) > -1;
              do
                if (n2 << 24 >> 24 == 19)
                  if (q2) {
                    e2 = -1;
                    break a;
                  } else
                    x2 = 54;
                else {
                  if (q2) {
                    c[i2 + (t2 << 2) >> 2] = p2;
                    q2 = h2 + (t2 << 3) | 0;
                    t2 = c[q2 + 4 >> 2] | 0;
                    x2 = I2;
                    c[x2 >> 2] = c[q2 >> 2];
                    c[x2 + 4 >> 2] = t2;
                    x2 = 54;
                    break;
                  }
                  if (!y2) {
                    e2 = 0;
                    break a;
                  }
                  vo(I2, p2, f2, k2);
                  m2 = c[G2 >> 2] | 0;
                  x2 = 55;
                }
              while (0);
              if ((x2 | 0) == 54) {
                x2 = 0;
                if (y2)
                  x2 = 55;
                else
                  l2 = 0;
              }
              d:
                do
                  if ((x2 | 0) == 55) {
                    x2 = 0;
                    m2 = a[m2 + -1 >> 0] | 0;
                    m2 = (s2 | 0) != 0 & (m2 & 15 | 0) == 3 ? m2 & -33 : m2;
                    n2 = o2 & -65537;
                    t2 = (o2 & 8192 | 0) == 0 ? o2 : n2;
                    e:
                      do
                        switch (m2 | 0) {
                          case 110:
                            switch ((s2 & 255) << 24 >> 24) {
                              case 0: {
                                c[c[I2 >> 2] >> 2] = e2;
                                l2 = 0;
                                break d;
                              }
                              case 1: {
                                c[c[I2 >> 2] >> 2] = e2;
                                l2 = 0;
                                break d;
                              }
                              case 2: {
                                l2 = c[I2 >> 2] | 0;
                                c[l2 >> 2] = e2;
                                c[l2 + 4 >> 2] = ((e2 | 0) < 0) << 31 >> 31;
                                l2 = 0;
                                break d;
                              }
                              case 3: {
                                b[c[I2 >> 2] >> 1] = e2;
                                l2 = 0;
                                break d;
                              }
                              case 4: {
                                a[c[I2 >> 2] >> 0] = e2;
                                l2 = 0;
                                break d;
                              }
                              case 6: {
                                c[c[I2 >> 2] >> 2] = e2;
                                l2 = 0;
                                break d;
                              }
                              case 7: {
                                l2 = c[I2 >> 2] | 0;
                                c[l2 >> 2] = e2;
                                c[l2 + 4 >> 2] = ((e2 | 0) < 0) << 31 >> 31;
                                l2 = 0;
                                break d;
                              }
                              default: {
                                l2 = 0;
                                break d;
                              }
                            }
                          case 112: {
                            m2 = 120;
                            l2 = l2 >>> 0 > 8 ? l2 : 8;
                            n2 = t2 | 8;
                            x2 = 67;
                            break;
                          }
                          case 88:
                          case 120: {
                            n2 = t2;
                            x2 = 67;
                            break;
                          }
                          case 111: {
                            q2 = I2;
                            q2 = xo(c[q2 >> 2] | 0, c[q2 + 4 >> 2] | 0, z2) | 0;
                            n2 = A2 - q2 | 0;
                            o2 = 0;
                            p2 = 20230;
                            l2 = (t2 & 8 | 0) == 0 | (l2 | 0) > (n2 | 0) ? l2 : n2 + 1 | 0;
                            n2 = t2;
                            x2 = 73;
                            break;
                          }
                          case 105:
                          case 100: {
                            n2 = I2;
                            m2 = c[n2 >> 2] | 0;
                            n2 = c[n2 + 4 >> 2] | 0;
                            if ((n2 | 0) < 0) {
                              m2 = mr(0, 0, m2 | 0, n2 | 0) | 0;
                              n2 = u() | 0;
                              o2 = I2;
                              c[o2 >> 2] = m2;
                              c[o2 + 4 >> 2] = n2;
                              o2 = 1;
                              p2 = 20230;
                              x2 = 72;
                              break e;
                            } else {
                              o2 = (t2 & 2049 | 0) != 0 & 1;
                              p2 = (t2 & 2048 | 0) == 0 ? (t2 & 1 | 0) == 0 ? 20230 : 20232 : 20231;
                              x2 = 72;
                              break e;
                            }
                          }
                          case 117: {
                            n2 = I2;
                            o2 = 0;
                            p2 = 20230;
                            m2 = c[n2 >> 2] | 0;
                            n2 = c[n2 + 4 >> 2] | 0;
                            x2 = 72;
                            break;
                          }
                          case 99: {
                            a[B2 >> 0] = c[I2 >> 2];
                            r2 = B2;
                            o2 = 0;
                            p2 = 20230;
                            q2 = 1;
                            m2 = n2;
                            l2 = A2;
                            break;
                          }
                          case 115: {
                            s2 = c[I2 >> 2] | 0;
                            s2 = (s2 | 0) == 0 ? 20240 : s2;
                            t2 = no(s2, 0, l2) | 0;
                            K2 = (t2 | 0) == 0;
                            r2 = s2;
                            o2 = 0;
                            p2 = 20230;
                            q2 = K2 ? l2 : t2 - s2 | 0;
                            m2 = n2;
                            l2 = K2 ? s2 + l2 | 0 : t2;
                            break;
                          }
                          case 67: {
                            c[D2 >> 2] = c[I2 >> 2];
                            c[C2 >> 2] = 0;
                            c[I2 >> 2] = D2;
                            p2 = -1;
                            x2 = 79;
                            break;
                          }
                          case 83: {
                            if (!l2) {
                              zo(d2, 32, v2, 0, t2);
                              l2 = 0;
                              x2 = 89;
                            } else {
                              p2 = l2;
                              x2 = 79;
                            }
                            break;
                          }
                          case 65:
                          case 71:
                          case 70:
                          case 69:
                          case 97:
                          case 103:
                          case 102:
                          case 101: {
                            l2 = _[j2 & 1](d2, +g[I2 >> 3], v2, l2, t2, m2) | 0;
                            break d;
                          }
                          default: {
                            o2 = 0;
                            p2 = 20230;
                            q2 = l2;
                            m2 = t2;
                            l2 = A2;
                          }
                        }
                      while (0);
                    f:
                      do
                        if ((x2 | 0) == 67) {
                          q2 = I2;
                          q2 = wo(c[q2 >> 2] | 0, c[q2 + 4 >> 2] | 0, z2, m2 & 32) | 0;
                          p2 = I2;
                          p2 = (n2 & 8 | 0) == 0 | (c[p2 >> 2] | 0) == 0 & (c[p2 + 4 >> 2] | 0) == 0;
                          o2 = p2 ? 0 : 2;
                          p2 = p2 ? 20230 : 20230 + (m2 >>> 4) | 0;
                          x2 = 73;
                        } else if ((x2 | 0) == 72) {
                          q2 = yo(m2, n2, z2) | 0;
                          n2 = t2;
                          x2 = 73;
                        } else if ((x2 | 0) == 79) {
                          x2 = 0;
                          o2 = c[I2 >> 2] | 0;
                          l2 = 0;
                          while (1) {
                            m2 = c[o2 >> 2] | 0;
                            if (!m2)
                              break;
                            m2 = Ao(E2, m2) | 0;
                            n2 = (m2 | 0) < 0;
                            if (n2 | m2 >>> 0 > (p2 - l2 | 0) >>> 0) {
                              x2 = 83;
                              break;
                            }
                            l2 = m2 + l2 | 0;
                            if (p2 >>> 0 > l2 >>> 0)
                              o2 = o2 + 4 | 0;
                            else
                              break;
                          }
                          if ((x2 | 0) == 83) {
                            x2 = 0;
                            if (n2) {
                              e2 = -1;
                              break a;
                            }
                          }
                          zo(d2, 32, v2, l2, t2);
                          if (!l2) {
                            l2 = 0;
                            x2 = 89;
                          } else {
                            n2 = c[I2 >> 2] | 0;
                            o2 = 0;
                            while (1) {
                              m2 = c[n2 >> 2] | 0;
                              if (!m2) {
                                x2 = 89;
                                break f;
                              }
                              m2 = Ao(E2, m2) | 0;
                              o2 = m2 + o2 | 0;
                              if ((o2 | 0) > (l2 | 0)) {
                                x2 = 89;
                                break f;
                              }
                              to(d2, E2, m2);
                              if (o2 >>> 0 >= l2 >>> 0) {
                                x2 = 89;
                                break;
                              } else
                                n2 = n2 + 4 | 0;
                            }
                          }
                        }
                      while (0);
                    if ((x2 | 0) == 73) {
                      x2 = 0;
                      m2 = I2;
                      m2 = (c[m2 >> 2] | 0) != 0 | (c[m2 + 4 >> 2] | 0) != 0;
                      K2 = (l2 | 0) != 0 | m2;
                      m2 = A2 - q2 + ((m2 ^ 1) & 1) | 0;
                      r2 = K2 ? q2 : z2;
                      q2 = K2 ? (l2 | 0) > (m2 | 0) ? l2 : m2 : 0;
                      m2 = (l2 | 0) > -1 ? n2 & -65537 : n2;
                      l2 = A2;
                    } else if ((x2 | 0) == 89) {
                      x2 = 0;
                      zo(d2, 32, v2, l2, t2 ^ 8192);
                      l2 = (v2 | 0) > (l2 | 0) ? v2 : l2;
                      break;
                    }
                    t2 = l2 - r2 | 0;
                    s2 = (q2 | 0) < (t2 | 0) ? t2 : q2;
                    K2 = s2 + o2 | 0;
                    l2 = (v2 | 0) < (K2 | 0) ? K2 : v2;
                    zo(d2, 32, l2, K2, m2);
                    to(d2, p2, o2);
                    zo(d2, 48, l2, K2, m2 ^ 65536);
                    zo(d2, 48, s2, t2, 0);
                    to(d2, r2, t2);
                    zo(d2, 32, l2, K2, m2 ^ 8192);
                  }
                while (0);
              n2 = w2;
            }
          g:
            do
              if ((x2 | 0) == 92) {
                if (!d2)
                  if (!n2)
                    e2 = 0;
                  else {
                    e2 = 1;
                    while (1) {
                      l2 = c[i2 + (e2 << 2) >> 2] | 0;
                      if (!l2)
                        break;
                      vo(h2 + (e2 << 3) | 0, l2, f2, k2);
                      e2 = e2 + 1 | 0;
                      if (e2 >>> 0 >= 10) {
                        e2 = 1;
                        break g;
                      }
                    }
                    while (1) {
                      if (c[i2 + (e2 << 2) >> 2] | 0) {
                        e2 = -1;
                        break g;
                      }
                      e2 = e2 + 1 | 0;
                      if (e2 >>> 0 >= 10) {
                        e2 = 1;
                        break;
                      }
                    }
                  }
              }
            while (0);
          V = J2;
          return e2 | 0;
        }
        function to(a2, b2, d2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          d2 = d2 | 0;
          if (!(c[a2 >> 2] & 32))
            jo(b2, d2, a2) | 0;
          return;
        }
        function uo(b2) {
          b2 = b2 | 0;
          var d2 = 0, e2 = 0;
          if (!(bo(a[c[b2 >> 2] >> 0] | 0) | 0))
            d2 = 0;
          else {
            d2 = 0;
            do {
              e2 = c[b2 >> 2] | 0;
              d2 = (d2 * 10 | 0) + -48 + (a[e2 >> 0] | 0) | 0;
              e2 = e2 + 1 | 0;
              c[b2 >> 2] = e2;
            } while ((bo(a[e2 >> 0] | 0) | 0) != 0);
          }
          return d2 | 0;
        }
        function vo(a2, b2, d2, e2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          d2 = d2 | 0;
          e2 = e2 | 0;
          var f2 = 0, h2 = 0;
          a:
            do
              if (b2 >>> 0 <= 20)
                do
                  switch (b2 | 0) {
                    case 9: {
                      b2 = (c[d2 >> 2] | 0) + (4 - 1) & ~(4 - 1);
                      e2 = c[b2 >> 2] | 0;
                      c[d2 >> 2] = b2 + 4;
                      c[a2 >> 2] = e2;
                      break a;
                    }
                    case 10: {
                      e2 = (c[d2 >> 2] | 0) + (4 - 1) & ~(4 - 1);
                      b2 = c[e2 >> 2] | 0;
                      c[d2 >> 2] = e2 + 4;
                      e2 = a2;
                      c[e2 >> 2] = b2;
                      c[e2 + 4 >> 2] = ((b2 | 0) < 0) << 31 >> 31;
                      break a;
                    }
                    case 11: {
                      e2 = (c[d2 >> 2] | 0) + (4 - 1) & ~(4 - 1);
                      b2 = c[e2 >> 2] | 0;
                      c[d2 >> 2] = e2 + 4;
                      e2 = a2;
                      c[e2 >> 2] = b2;
                      c[e2 + 4 >> 2] = 0;
                      break a;
                    }
                    case 12: {
                      e2 = (c[d2 >> 2] | 0) + (8 - 1) & ~(8 - 1);
                      b2 = e2;
                      f2 = c[b2 >> 2] | 0;
                      b2 = c[b2 + 4 >> 2] | 0;
                      c[d2 >> 2] = e2 + 8;
                      e2 = a2;
                      c[e2 >> 2] = f2;
                      c[e2 + 4 >> 2] = b2;
                      break a;
                    }
                    case 13: {
                      f2 = (c[d2 >> 2] | 0) + (4 - 1) & ~(4 - 1);
                      e2 = c[f2 >> 2] | 0;
                      c[d2 >> 2] = f2 + 4;
                      e2 = (e2 & 65535) << 16 >> 16;
                      f2 = a2;
                      c[f2 >> 2] = e2;
                      c[f2 + 4 >> 2] = ((e2 | 0) < 0) << 31 >> 31;
                      break a;
                    }
                    case 14: {
                      f2 = (c[d2 >> 2] | 0) + (4 - 1) & ~(4 - 1);
                      e2 = c[f2 >> 2] | 0;
                      c[d2 >> 2] = f2 + 4;
                      f2 = a2;
                      c[f2 >> 2] = e2 & 65535;
                      c[f2 + 4 >> 2] = 0;
                      break a;
                    }
                    case 15: {
                      f2 = (c[d2 >> 2] | 0) + (4 - 1) & ~(4 - 1);
                      e2 = c[f2 >> 2] | 0;
                      c[d2 >> 2] = f2 + 4;
                      e2 = (e2 & 255) << 24 >> 24;
                      f2 = a2;
                      c[f2 >> 2] = e2;
                      c[f2 + 4 >> 2] = ((e2 | 0) < 0) << 31 >> 31;
                      break a;
                    }
                    case 16: {
                      f2 = (c[d2 >> 2] | 0) + (4 - 1) & ~(4 - 1);
                      e2 = c[f2 >> 2] | 0;
                      c[d2 >> 2] = f2 + 4;
                      f2 = a2;
                      c[f2 >> 2] = e2 & 255;
                      c[f2 + 4 >> 2] = 0;
                      break a;
                    }
                    case 17: {
                      f2 = (c[d2 >> 2] | 0) + (8 - 1) & ~(8 - 1);
                      h2 = +g[f2 >> 3];
                      c[d2 >> 2] = f2 + 8;
                      g[a2 >> 3] = h2;
                      break a;
                    }
                    case 18: {
                      da[e2 & 15](a2, d2);
                      break a;
                    }
                    default:
                      break a;
                  }
                while (0);
            while (0);
          return;
        }
        function wo(b2, c2, e2, f2) {
          b2 = b2 | 0;
          c2 = c2 | 0;
          e2 = e2 | 0;
          f2 = f2 | 0;
          if (!((b2 | 0) == 0 & (c2 | 0) == 0))
            do {
              e2 = e2 + -1 | 0;
              a[e2 >> 0] = d[640 + (b2 & 15) >> 0] | 0 | f2;
              b2 = qr(b2 | 0, c2 | 0, 4) | 0;
              c2 = u() | 0;
            } while (!((b2 | 0) == 0 & (c2 | 0) == 0));
          return e2 | 0;
        }
        function xo(b2, c2, d2) {
          b2 = b2 | 0;
          c2 = c2 | 0;
          d2 = d2 | 0;
          if (!((b2 | 0) == 0 & (c2 | 0) == 0))
            do {
              d2 = d2 + -1 | 0;
              a[d2 >> 0] = b2 & 7 | 48;
              b2 = qr(b2 | 0, c2 | 0, 3) | 0;
              c2 = u() | 0;
            } while (!((b2 | 0) == 0 & (c2 | 0) == 0));
          return d2 | 0;
        }
        function yo(b2, c2, d2) {
          b2 = b2 | 0;
          c2 = c2 | 0;
          d2 = d2 | 0;
          var e2 = 0, f2 = 0, g2 = 0;
          if (c2 >>> 0 > 0 | (c2 | 0) == 0 & b2 >>> 0 > 4294967295) {
            do {
              e2 = b2;
              b2 = pr(b2 | 0, c2 | 0, 10, 0) | 0;
              f2 = c2;
              c2 = u() | 0;
              g2 = kr(b2 | 0, c2 | 0, 10, 0) | 0;
              g2 = mr(e2 | 0, f2 | 0, g2 | 0, u() | 0) | 0;
              u() | 0;
              d2 = d2 + -1 | 0;
              a[d2 >> 0] = g2 & 255 | 48;
            } while (f2 >>> 0 > 9 | (f2 | 0) == 9 & e2 >>> 0 > 4294967295);
            c2 = b2;
          } else
            c2 = b2;
          if (c2)
            do {
              g2 = c2;
              c2 = (c2 >>> 0) / 10 | 0;
              d2 = d2 + -1 | 0;
              a[d2 >> 0] = g2 - (c2 * 10 | 0) | 48;
            } while (g2 >>> 0 >= 10);
          return d2 | 0;
        }
        function zo(a2, b2, c2, d2, e2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          c2 = c2 | 0;
          d2 = d2 | 0;
          e2 = e2 | 0;
          var f2 = 0, g2 = 0;
          g2 = V;
          V = V + 256 | 0;
          f2 = g2;
          if ((c2 | 0) > (d2 | 0) & (e2 & 73728 | 0) == 0) {
            e2 = c2 - d2 | 0;
            wr(f2 | 0, b2 << 24 >> 24 | 0, (e2 >>> 0 < 256 ? e2 : 256) | 0) | 0;
            if (e2 >>> 0 > 255) {
              b2 = c2 - d2 | 0;
              do {
                to(a2, f2, 256);
                e2 = e2 + -256 | 0;
              } while (e2 >>> 0 > 255);
              e2 = b2 & 255;
            }
            to(a2, f2, e2);
          }
          V = g2;
          return;
        }
        function Ao(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          if (!a2)
            a2 = 0;
          else
            a2 = Bo(a2, b2, 0) | 0;
          return a2 | 0;
        }
        function Bo(b2, d2, e2) {
          b2 = b2 | 0;
          d2 = d2 | 0;
          e2 = e2 | 0;
          do
            if (b2) {
              if (d2 >>> 0 < 128) {
                a[b2 >> 0] = d2;
                b2 = 1;
                break;
              }
              if (!(c[c[(Co() | 0) + 176 >> 2] >> 2] | 0))
                if ((d2 & -128 | 0) == 57216) {
                  a[b2 >> 0] = d2;
                  b2 = 1;
                  break;
                } else {
                  c[(ao() | 0) >> 2] = 25;
                  b2 = -1;
                  break;
                }
              if (d2 >>> 0 < 2048) {
                a[b2 >> 0] = d2 >>> 6 | 192;
                a[b2 + 1 >> 0] = d2 & 63 | 128;
                b2 = 2;
                break;
              }
              if (d2 >>> 0 < 55296 | (d2 & -8192 | 0) == 57344) {
                a[b2 >> 0] = d2 >>> 12 | 224;
                a[b2 + 1 >> 0] = d2 >>> 6 & 63 | 128;
                a[b2 + 2 >> 0] = d2 & 63 | 128;
                b2 = 3;
                break;
              }
              if ((d2 + -65536 | 0) >>> 0 < 1048576) {
                a[b2 >> 0] = d2 >>> 18 | 240;
                a[b2 + 1 >> 0] = d2 >>> 12 & 63 | 128;
                a[b2 + 2 >> 0] = d2 >>> 6 & 63 | 128;
                a[b2 + 3 >> 0] = d2 & 63 | 128;
                b2 = 4;
                break;
              } else {
                c[(ao() | 0) >> 2] = 25;
                b2 = -1;
                break;
              }
            } else
              b2 = 1;
          while (0);
          return b2 | 0;
        }
        function Co() {
          return co() | 0;
        }
        function Do(a2) {
          a2 = +a2;
          var b2 = 0;
          g[h >> 3] = a2;
          b2 = c[h >> 2] | 0;
          t(c[h + 4 >> 2] | 0);
          return b2 | 0;
        }
        function Eo(a2, b2) {
          a2 = +a2;
          b2 = b2 | 0;
          var d2 = 0, e2 = 0, f2 = 0;
          g[h >> 3] = a2;
          d2 = c[h >> 2] | 0;
          e2 = c[h + 4 >> 2] | 0;
          f2 = qr(d2 | 0, e2 | 0, 52) | 0;
          u() | 0;
          switch (f2 & 2047) {
            case 0: {
              if (a2 != 0) {
                a2 = +Eo(a2 * 18446744073709552e3, b2);
                d2 = (c[b2 >> 2] | 0) + -64 | 0;
              } else
                d2 = 0;
              c[b2 >> 2] = d2;
              break;
            }
            case 2047:
              break;
            default: {
              c[b2 >> 2] = (f2 & 2047) + -1022;
              c[h >> 2] = d2;
              c[h + 4 >> 2] = e2 & -2146435073 | 1071644672;
              a2 = +g[h >> 3];
            }
          }
          return +a2;
        }
        function Fo(b2, c2, d2) {
          b2 = b2 | 0;
          c2 = c2 | 0;
          d2 = d2 | 0;
          var e2 = 0, f2 = 0;
          a:
            do
              if (!d2)
                b2 = 0;
              else {
                while (1) {
                  e2 = a[b2 >> 0] | 0;
                  f2 = a[c2 >> 0] | 0;
                  if (e2 << 24 >> 24 != f2 << 24 >> 24)
                    break;
                  d2 = d2 + -1 | 0;
                  if (!d2) {
                    b2 = 0;
                    break a;
                  } else {
                    b2 = b2 + 1 | 0;
                    c2 = c2 + 1 | 0;
                  }
                }
                b2 = (e2 & 255) - (f2 & 255) | 0;
              }
            while (0);
          return b2 | 0;
        }
        function Go(a2, b2, d2, e2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          d2 = d2 | 0;
          e2 = e2 | 0;
          var f2 = 0, g2 = 0;
          f2 = V;
          V = V + 16 | 0;
          g2 = f2;
          c[g2 >> 2] = e2;
          e2 = Ho(a2, b2, d2, g2) | 0;
          V = f2;
          return e2 | 0;
        }
        function Ho(b2, d2, e2, f2) {
          b2 = b2 | 0;
          d2 = d2 | 0;
          e2 = e2 | 0;
          f2 = f2 | 0;
          var g2 = 0, h2 = 0, i2 = 0, j2 = 0;
          j2 = V;
          V = V + 160 | 0;
          g2 = j2 + 144 | 0;
          i2 = j2;
          ur(i2 | 0, 3672, 144) | 0;
          if ((d2 + -1 | 0) >>> 0 > 2147483646)
            if (!d2) {
              b2 = g2;
              d2 = 1;
              h2 = 4;
            } else {
              c[(ao() | 0) >> 2] = 61;
              d2 = -1;
            }
          else
            h2 = 4;
          if ((h2 | 0) == 4) {
            h2 = -2 - b2 | 0;
            h2 = d2 >>> 0 > h2 >>> 0 ? h2 : d2;
            c[i2 + 48 >> 2] = h2;
            g2 = i2 + 20 | 0;
            c[g2 >> 2] = b2;
            c[i2 + 44 >> 2] = b2;
            d2 = b2 + h2 | 0;
            b2 = i2 + 16 | 0;
            c[b2 >> 2] = d2;
            c[i2 + 28 >> 2] = d2;
            d2 = oo(i2, e2, f2) | 0;
            if (h2) {
              i2 = c[g2 >> 2] | 0;
              a[i2 + (((i2 | 0) == (c[b2 >> 2] | 0)) << 31 >> 31) >> 0] = 0;
            }
          }
          V = j2;
          return d2 | 0;
        }
        function Io(a2, b2, d2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          d2 = d2 | 0;
          var e2 = 0, f2 = 0;
          e2 = a2 + 20 | 0;
          f2 = c[e2 >> 2] | 0;
          a2 = (c[a2 + 16 >> 2] | 0) - f2 | 0;
          a2 = a2 >>> 0 > d2 >>> 0 ? d2 : a2;
          ur(f2 | 0, b2 | 0, a2 | 0) | 0;
          c[e2 >> 2] = (c[e2 >> 2] | 0) + a2;
          return d2 | 0;
        }
        function Jo(a2) {
          a2 = a2 | 0;
          var b2 = 0, c2 = 0;
          b2 = (fo(a2) | 0) + 1 | 0;
          c2 = dr(b2) | 0;
          if (!c2)
            a2 = 0;
          else
            a2 = ur(c2 | 0, a2 | 0, b2 | 0) | 0;
          return a2 | 0;
        }
        function Ko(b2, e2) {
          b2 = b2 | 0;
          e2 = e2 | 0;
          var f2 = 0, g2 = 0;
          f2 = 0;
          while (1) {
            if ((d[656 + f2 >> 0] | 0) == (b2 | 0)) {
              g2 = 4;
              break;
            }
            f2 = f2 + 1 | 0;
            if ((f2 | 0) == 87) {
              b2 = 87;
              g2 = 5;
              break;
            }
          }
          if ((g2 | 0) == 4)
            if (!f2)
              f2 = 752;
            else {
              b2 = f2;
              g2 = 5;
            }
          if ((g2 | 0) == 5) {
            f2 = 752;
            do {
              do {
                g2 = f2;
                f2 = f2 + 1 | 0;
              } while ((a[g2 >> 0] | 0) != 0);
              b2 = b2 + -1 | 0;
            } while ((b2 | 0) != 0);
          }
          return Lo(f2, c[e2 + 20 >> 2] | 0) | 0;
        }
        function Lo(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          return ko(a2, b2) | 0;
        }
        function Mo(a2) {
          a2 = a2 | 0;
          return Ko(a2, c[(No() | 0) + 176 >> 2] | 0) | 0;
        }
        function No() {
          return co() | 0;
        }
        function Oo(b2, c2, d2) {
          b2 = b2 | 0;
          c2 = c2 | 0;
          d2 = d2 | 0;
          var e2 = 0;
          e2 = Mo(b2) | 0;
          b2 = fo(e2) | 0;
          if (b2 >>> 0 >= d2 >>> 0) {
            b2 = d2 + -1 | 0;
            if (!d2)
              b2 = 68;
            else {
              ur(c2 | 0, e2 | 0, b2 | 0) | 0;
              a[c2 + b2 >> 0] = 0;
              b2 = 68;
            }
          } else {
            ur(c2 | 0, e2 | 0, b2 + 1 | 0) | 0;
            b2 = 0;
          }
          return b2 | 0;
        }
        function Po() {
          var a2 = 0, b2 = 0, d2 = 0, e2 = 0, f2 = 0, g2 = 0, h2 = 0;
          e2 = V;
          V = V + 48 | 0;
          g2 = e2 + 32 | 0;
          b2 = e2 + 24 | 0;
          h2 = e2 + 16 | 0;
          f2 = e2;
          e2 = e2 + 36 | 0;
          a2 = Qo() | 0;
          if (a2 | 0 ? (d2 = c[a2 >> 2] | 0, d2 | 0) : 0) {
            a2 = d2 + 48 | 0;
            if (!(Ro(a2) | 0)) {
              c[b2 >> 2] = 20420;
              To(20370, b2);
            }
            b2 = So(a2) | 0;
            if ((b2 | 0) == 1126902529 & (u() | 0) == 1129074247)
              a2 = c[d2 + 44 >> 2] | 0;
            else
              a2 = d2 + 80 | 0;
            c[e2 >> 2] = a2;
            d2 = c[d2 >> 2] | 0;
            a2 = c[d2 + 4 >> 2] | 0;
            if (aa[c[(c[954] | 0) + 16 >> 2] & 7](3816, d2, e2) | 0) {
              h2 = c[e2 >> 2] | 0;
              h2 = Z[c[(c[h2 >> 2] | 0) + 8 >> 2] & 15](h2) | 0;
              c[f2 >> 2] = 20420;
              c[f2 + 4 >> 2] = a2;
              c[f2 + 8 >> 2] = h2;
              To(20284, f2);
            } else {
              c[h2 >> 2] = 20420;
              c[h2 + 4 >> 2] = a2;
              To(20329, h2);
            }
          }
          To(20408, g2);
        }
        function Qo() {
          return 21640;
        }
        function Ro(a2) {
          a2 = a2 | 0;
          a2 = So(a2) | 0;
          return (a2 & -256 | 0) == 1126902528 & (u() | 0) == 1129074247 | 0;
        }
        function So(a2) {
          a2 = a2 | 0;
          var b2 = 0;
          b2 = a2;
          a2 = c[b2 >> 2] | 0;
          t(c[b2 + 4 >> 2] | 0);
          return a2 | 0;
        }
        function To(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          U();
        }
        function Uo(a2) {
          a2 = a2 | 0;
          return;
        }
        function Vo(a2) {
          a2 = a2 | 0;
          Uo(a2);
          jp(a2);
          return;
        }
        function Wo(a2) {
          a2 = a2 | 0;
          return;
        }
        function Xo(a2) {
          a2 = a2 | 0;
          return;
        }
        function Yo(d2, e2, f2) {
          d2 = d2 | 0;
          e2 = e2 | 0;
          f2 = f2 | 0;
          var g2 = 0, h2 = 0, i2 = 0, j2 = 0, k2 = 0, l2 = 0;
          l2 = V;
          V = V + 64 | 0;
          j2 = l2;
          if (!(ap(d2, e2, 0) | 0))
            if ((e2 | 0) != 0 ? (k2 = ep(e2, 3840, 3824, 0) | 0, (k2 | 0) != 0) : 0) {
              c[j2 >> 2] = k2;
              c[j2 + 4 >> 2] = 0;
              c[j2 + 8 >> 2] = d2;
              c[j2 + 12 >> 2] = -1;
              d2 = j2 + 16 | 0;
              e2 = j2 + 24 | 0;
              g2 = j2 + 48 | 0;
              h2 = d2;
              i2 = h2 + 36 | 0;
              do {
                c[h2 >> 2] = 0;
                h2 = h2 + 4 | 0;
              } while ((h2 | 0) < (i2 | 0));
              b[d2 + 36 >> 1] = 0;
              a[d2 + 38 >> 0] = 0;
              c[g2 >> 2] = 1;
              fa[c[(c[k2 >> 2] | 0) + 28 >> 2] & 7](k2, j2, c[f2 >> 2] | 0, 1);
              if ((c[e2 >> 2] | 0) == 1) {
                c[f2 >> 2] = c[d2 >> 2];
                d2 = 1;
              } else
                d2 = 0;
            } else
              d2 = 0;
          else
            d2 = 1;
          V = l2;
          return d2 | 0;
        }
        function Zo(a2, b2, d2, e2, f2, g2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          d2 = d2 | 0;
          e2 = e2 | 0;
          f2 = f2 | 0;
          g2 = g2 | 0;
          if (ap(a2, c[b2 + 8 >> 2] | 0, g2) | 0)
            dp(0, b2, d2, e2, f2);
          return;
        }
        function _o(b2, d2, e2, f2, g2) {
          b2 = b2 | 0;
          d2 = d2 | 0;
          e2 = e2 | 0;
          f2 = f2 | 0;
          g2 = g2 | 0;
          var h2 = 0;
          do
            if (!(ap(b2, c[d2 + 8 >> 2] | 0, g2) | 0)) {
              if (ap(b2, c[d2 >> 2] | 0, g2) | 0) {
                if ((c[d2 + 16 >> 2] | 0) != (e2 | 0) ? (h2 = d2 + 20 | 0, (c[h2 >> 2] | 0) != (e2 | 0)) : 0) {
                  c[d2 + 32 >> 2] = f2;
                  c[h2 >> 2] = e2;
                  g2 = d2 + 40 | 0;
                  c[g2 >> 2] = (c[g2 >> 2] | 0) + 1;
                  if ((c[d2 + 36 >> 2] | 0) == 1 ? (c[d2 + 24 >> 2] | 0) == 2 : 0)
                    a[d2 + 54 >> 0] = 1;
                  c[d2 + 44 >> 2] = 4;
                  break;
                }
                if ((f2 | 0) == 1)
                  c[d2 + 32 >> 2] = 1;
              }
            } else
              cp(0, d2, e2, f2);
          while (0);
          return;
        }
        function $o(a2, b2, d2, e2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          d2 = d2 | 0;
          e2 = e2 | 0;
          if (ap(a2, c[b2 + 8 >> 2] | 0, 0) | 0)
            bp(0, b2, d2, e2);
          return;
        }
        function ap(a2, b2, d2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          d2 = d2 | 0;
          if (d2)
            if ((a2 | 0) == (b2 | 0))
              a2 = 1;
            else
              a2 = (eo(c[a2 + 4 >> 2] | 0, c[b2 + 4 >> 2] | 0) | 0) == 0;
          else
            a2 = (c[a2 + 4 >> 2] | 0) == (c[b2 + 4 >> 2] | 0);
          return a2 | 0;
        }
        function bp(b2, d2, e2, f2) {
          b2 = b2 | 0;
          d2 = d2 | 0;
          e2 = e2 | 0;
          f2 = f2 | 0;
          var g2 = 0;
          b2 = d2 + 16 | 0;
          g2 = c[b2 >> 2] | 0;
          do
            if (g2) {
              if ((g2 | 0) != (e2 | 0)) {
                f2 = d2 + 36 | 0;
                c[f2 >> 2] = (c[f2 >> 2] | 0) + 1;
                c[d2 + 24 >> 2] = 2;
                a[d2 + 54 >> 0] = 1;
                break;
              }
              b2 = d2 + 24 | 0;
              if ((c[b2 >> 2] | 0) == 2)
                c[b2 >> 2] = f2;
            } else {
              c[b2 >> 2] = e2;
              c[d2 + 24 >> 2] = f2;
              c[d2 + 36 >> 2] = 1;
            }
          while (0);
          return;
        }
        function cp(a2, b2, d2, e2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          d2 = d2 | 0;
          e2 = e2 | 0;
          var f2 = 0;
          if ((c[b2 + 4 >> 2] | 0) == (d2 | 0) ? (f2 = b2 + 28 | 0, (c[f2 >> 2] | 0) != 1) : 0)
            c[f2 >> 2] = e2;
          return;
        }
        function dp(b2, d2, e2, f2, g2) {
          b2 = b2 | 0;
          d2 = d2 | 0;
          e2 = e2 | 0;
          f2 = f2 | 0;
          g2 = g2 | 0;
          a[d2 + 53 >> 0] = 1;
          do
            if ((c[d2 + 4 >> 2] | 0) == (f2 | 0)) {
              a[d2 + 52 >> 0] = 1;
              b2 = d2 + 16 | 0;
              f2 = c[b2 >> 2] | 0;
              if (!f2) {
                c[b2 >> 2] = e2;
                c[d2 + 24 >> 2] = g2;
                c[d2 + 36 >> 2] = 1;
                if (!((g2 | 0) == 1 ? (c[d2 + 48 >> 2] | 0) == 1 : 0))
                  break;
                a[d2 + 54 >> 0] = 1;
                break;
              }
              if ((f2 | 0) != (e2 | 0)) {
                g2 = d2 + 36 | 0;
                c[g2 >> 2] = (c[g2 >> 2] | 0) + 1;
                a[d2 + 54 >> 0] = 1;
                break;
              }
              f2 = d2 + 24 | 0;
              b2 = c[f2 >> 2] | 0;
              if ((b2 | 0) == 2) {
                c[f2 >> 2] = g2;
                b2 = g2;
              }
              if ((b2 | 0) == 1 ? (c[d2 + 48 >> 2] | 0) == 1 : 0)
                a[d2 + 54 >> 0] = 1;
            }
          while (0);
          return;
        }
        function ep(d2, e2, f2, g2) {
          d2 = d2 | 0;
          e2 = e2 | 0;
          f2 = f2 | 0;
          g2 = g2 | 0;
          var h2 = 0, i2 = 0, j2 = 0, k2 = 0, l2 = 0, m2 = 0, n2 = 0, o2 = 0, p2 = 0;
          p2 = V;
          V = V + 64 | 0;
          n2 = p2;
          m2 = c[d2 >> 2] | 0;
          o2 = d2 + (c[m2 + -8 >> 2] | 0) | 0;
          m2 = c[m2 + -4 >> 2] | 0;
          c[n2 >> 2] = f2;
          c[n2 + 4 >> 2] = d2;
          c[n2 + 8 >> 2] = e2;
          c[n2 + 12 >> 2] = g2;
          d2 = n2 + 16 | 0;
          e2 = n2 + 20 | 0;
          g2 = n2 + 24 | 0;
          h2 = n2 + 28 | 0;
          i2 = n2 + 32 | 0;
          j2 = n2 + 40 | 0;
          k2 = d2;
          l2 = k2 + 36 | 0;
          do {
            c[k2 >> 2] = 0;
            k2 = k2 + 4 | 0;
          } while ((k2 | 0) < (l2 | 0));
          b[d2 + 36 >> 1] = 0;
          a[d2 + 38 >> 0] = 0;
          a:
            do
              if (ap(m2, f2, 0) | 0) {
                c[n2 + 48 >> 2] = 1;
                ha[c[(c[m2 >> 2] | 0) + 20 >> 2] & 3](m2, n2, o2, o2, 1, 0);
                d2 = (c[g2 >> 2] | 0) == 1 ? o2 : 0;
              } else {
                ga[c[(c[m2 >> 2] | 0) + 24 >> 2] & 3](m2, n2, o2, 1, 0);
                switch (c[n2 + 36 >> 2] | 0) {
                  case 0: {
                    d2 = (c[j2 >> 2] | 0) == 1 & (c[h2 >> 2] | 0) == 1 & (c[i2 >> 2] | 0) == 1 ? c[e2 >> 2] | 0 : 0;
                    break a;
                  }
                  case 1:
                    break;
                  default: {
                    d2 = 0;
                    break a;
                  }
                }
                if ((c[g2 >> 2] | 0) != 1 ? !((c[j2 >> 2] | 0) == 0 & (c[h2 >> 2] | 0) == 1 & (c[i2 >> 2] | 0) == 1) : 0) {
                  d2 = 0;
                  break;
                }
                d2 = c[d2 >> 2] | 0;
              }
            while (0);
          V = p2;
          return d2 | 0;
        }
        function fp(a2) {
          a2 = a2 | 0;
          Uo(a2);
          jp(a2);
          return;
        }
        function gp(a2, b2, d2, e2, f2, g2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          d2 = d2 | 0;
          e2 = e2 | 0;
          f2 = f2 | 0;
          g2 = g2 | 0;
          if (ap(a2, c[b2 + 8 >> 2] | 0, g2) | 0)
            dp(0, b2, d2, e2, f2);
          else {
            a2 = c[a2 + 8 >> 2] | 0;
            ha[c[(c[a2 >> 2] | 0) + 20 >> 2] & 3](a2, b2, d2, e2, f2, g2);
          }
          return;
        }
        function hp(b2, d2, e2, f2, g2) {
          b2 = b2 | 0;
          d2 = d2 | 0;
          e2 = e2 | 0;
          f2 = f2 | 0;
          g2 = g2 | 0;
          var h2 = 0, i2 = 0, j2 = 0;
          a:
            do
              if (!(ap(b2, c[d2 + 8 >> 2] | 0, g2) | 0)) {
                if (!(ap(b2, c[d2 >> 2] | 0, g2) | 0)) {
                  i2 = c[b2 + 8 >> 2] | 0;
                  ga[c[(c[i2 >> 2] | 0) + 24 >> 2] & 3](i2, d2, e2, f2, g2);
                  break;
                }
                if ((c[d2 + 16 >> 2] | 0) != (e2 | 0) ? (i2 = d2 + 20 | 0, (c[i2 >> 2] | 0) != (e2 | 0)) : 0) {
                  c[d2 + 32 >> 2] = f2;
                  f2 = d2 + 44 | 0;
                  do
                    if ((c[f2 >> 2] | 0) != 4) {
                      h2 = d2 + 52 | 0;
                      a[h2 >> 0] = 0;
                      j2 = d2 + 53 | 0;
                      a[j2 >> 0] = 0;
                      b2 = c[b2 + 8 >> 2] | 0;
                      ha[c[(c[b2 >> 2] | 0) + 20 >> 2] & 3](b2, d2, e2, e2, 1, g2);
                      if (a[j2 >> 0] | 0) {
                        j2 = (a[h2 >> 0] | 0) == 0;
                        c[f2 >> 2] = 3;
                        if (j2)
                          break;
                        else
                          break a;
                      } else {
                        c[f2 >> 2] = 4;
                        break;
                      }
                    }
                  while (0);
                  c[i2 >> 2] = e2;
                  j2 = d2 + 40 | 0;
                  c[j2 >> 2] = (c[j2 >> 2] | 0) + 1;
                  if ((c[d2 + 36 >> 2] | 0) != 1)
                    break;
                  if ((c[d2 + 24 >> 2] | 0) != 2)
                    break;
                  a[d2 + 54 >> 0] = 1;
                  break;
                }
                if ((f2 | 0) == 1)
                  c[d2 + 32 >> 2] = 1;
              } else
                cp(0, d2, e2, f2);
            while (0);
          return;
        }
        function ip(a2, b2, d2, e2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          d2 = d2 | 0;
          e2 = e2 | 0;
          if (ap(a2, c[b2 + 8 >> 2] | 0, 0) | 0)
            bp(0, b2, d2, e2);
          else {
            a2 = c[a2 + 8 >> 2] | 0;
            fa[c[(c[a2 >> 2] | 0) + 28 >> 2] & 7](a2, b2, d2, e2);
          }
          return;
        }
        function jp(a2) {
          a2 = a2 | 0;
          er(a2);
          return;
        }
        function kp(a2) {
          a2 = a2 | 0;
          return;
        }
        function lp() {
          var a2 = 0, b2 = 0;
          a2 = Qo() | 0;
          if ((a2 | 0 ? (b2 = c[a2 >> 2] | 0, b2 | 0) : 0) ? Ro(b2 + 48 | 0) | 0 : 0)
            mp(c[b2 + 12 >> 2] | 0);
          mp(np() | 0);
        }
        function mp(a2) {
          a2 = a2 | 0;
          var b2 = 0;
          b2 = V;
          V = V + 16 | 0;
          ba[a2 & 3]();
          To(20559, b2);
        }
        function np() {
          return 2;
        }
        function op(a2) {
          a2 = a2 | 0;
          return;
        }
        function pp(a2) {
          a2 = a2 | 0;
          jp(a2);
          return;
        }
        function qp(a2) {
          a2 = a2 | 0;
          return 20599;
        }
        function rp(a2) {
          a2 = a2 | 0;
          c[a2 >> 2] = 5916;
          vp(a2 + 4 | 0);
          return;
        }
        function sp(a2) {
          a2 = a2 | 0;
          rp(a2);
          jp(a2);
          return;
        }
        function tp(a2) {
          a2 = a2 | 0;
          return up(a2 + 4 | 0) | 0;
        }
        function up(a2) {
          a2 = a2 | 0;
          return c[a2 >> 2] | 0;
        }
        function vp(a2) {
          a2 = a2 | 0;
          var b2 = 0, d2 = 0;
          if (wp(a2) | 0 ? (b2 = xp(c[a2 >> 2] | 0) | 0, d2 = b2 + 8 | 0, a2 = c[d2 >> 2] | 0, c[d2 >> 2] = a2 + -1, (a2 | 0) < 1) : 0)
            jp(b2);
          return;
        }
        function wp(a2) {
          a2 = a2 | 0;
          return 1;
        }
        function xp(a2) {
          a2 = a2 | 0;
          return a2 + -12 | 0;
        }
        function yp(a2) {
          a2 = a2 | 0;
          c[a2 >> 2] = 5936;
          vp(a2 + 4 | 0);
          return;
        }
        function zp(a2) {
          a2 = a2 | 0;
          yp(a2);
          jp(a2);
          return;
        }
        function Ap(a2) {
          a2 = a2 | 0;
          return up(a2 + 4 | 0) | 0;
        }
        function Bp(a2) {
          a2 = a2 | 0;
          rp(a2);
          jp(a2);
          return;
        }
        function Cp(a2) {
          a2 = a2 | 0;
          rp(a2);
          jp(a2);
          return;
        }
        function Dp() {
          var a2 = 0;
          a2 = V;
          V = V + 16 | 0;
          To(20848, a2);
        }
        function Ep(a2) {
          a2 = a2 | 0;
          Uo(a2);
          jp(a2);
          return;
        }
        function Fp(a2, b2, c2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          c2 = c2 | 0;
          return ap(a2, b2, 0) | 0;
        }
        function Gp(a2) {
          a2 = a2 | 0;
          Uo(a2);
          jp(a2);
          return;
        }
        function Hp(d2, e2, f2) {
          d2 = d2 | 0;
          e2 = e2 | 0;
          f2 = f2 | 0;
          var g2 = 0, h2 = 0, i2 = 0, j2 = 0, k2 = 0, l2 = 0, m2 = 0, n2 = 0;
          n2 = V;
          V = V + 64 | 0;
          l2 = n2;
          do
            if (!(ap(e2, 4048, 0) | 0)) {
              if (Ip(d2, e2, 0) | 0) {
                e2 = c[f2 >> 2] | 0;
                if (!e2) {
                  e2 = 1;
                  break;
                }
                c[f2 >> 2] = c[e2 >> 2];
                e2 = 1;
                break;
              }
              if ((e2 | 0) != 0 ? (g2 = ep(e2, 3840, 3976, 0) | 0, (g2 | 0) != 0) : 0) {
                e2 = c[f2 >> 2] | 0;
                if (e2 | 0)
                  c[f2 >> 2] = c[e2 >> 2];
                e2 = c[g2 + 8 >> 2] | 0;
                i2 = d2 + 8 | 0;
                h2 = c[i2 >> 2] | 0;
                if ((e2 & 7 & (h2 ^ 7) | 0) == 0 ? ((e2 & 96 ^ 96) & h2 | 0) == 0 : 0) {
                  h2 = d2 + 12 | 0;
                  d2 = c[h2 >> 2] | 0;
                  g2 = g2 + 12 | 0;
                  e2 = c[g2 >> 2] | 0;
                  if (!(ap(d2, e2, 0) | 0)) {
                    if (ap(d2, 4040, 0) | 0) {
                      if (!e2) {
                        e2 = 1;
                        break;
                      }
                      e2 = (ep(e2, 3840, 3992, 0) | 0) == 0;
                      break;
                    }
                    if (d2) {
                      e2 = ep(d2, 3840, 3976, 0) | 0;
                      if (e2 | 0) {
                        if (!(c[i2 >> 2] & 1)) {
                          e2 = 0;
                          break;
                        }
                        e2 = Jp(e2, c[g2 >> 2] | 0) | 0;
                        break;
                      }
                      e2 = c[h2 >> 2] | 0;
                      if (e2) {
                        e2 = ep(e2, 3840, 4008, 0) | 0;
                        if (e2 | 0) {
                          if (!(c[i2 >> 2] & 1)) {
                            e2 = 0;
                            break;
                          }
                          e2 = Kp(e2, c[g2 >> 2] | 0) | 0;
                          break;
                        }
                        e2 = c[h2 >> 2] | 0;
                        if ((((e2 | 0) != 0 ? (j2 = ep(e2, 3840, 3824, 0) | 0, (j2 | 0) != 0) : 0) ? (k2 = c[g2 >> 2] | 0, (k2 | 0) != 0) : 0) ? (m2 = ep(k2, 3840, 3824, 0) | 0, (m2 | 0) != 0) : 0) {
                          c[l2 >> 2] = m2;
                          c[l2 + 4 >> 2] = 0;
                          c[l2 + 8 >> 2] = j2;
                          c[l2 + 12 >> 2] = -1;
                          e2 = l2 + 16 | 0;
                          d2 = l2 + 24 | 0;
                          g2 = l2 + 48 | 0;
                          h2 = e2;
                          i2 = h2 + 36 | 0;
                          do {
                            c[h2 >> 2] = 0;
                            h2 = h2 + 4 | 0;
                          } while ((h2 | 0) < (i2 | 0));
                          b[e2 + 36 >> 1] = 0;
                          a[e2 + 38 >> 0] = 0;
                          c[g2 >> 2] = 1;
                          fa[c[(c[m2 >> 2] | 0) + 28 >> 2] & 7](m2, l2, c[f2 >> 2] | 0, 1);
                          do
                            if ((c[d2 >> 2] | 0) == 1) {
                              if (!(c[f2 >> 2] | 0)) {
                                e2 = 1;
                                break;
                              }
                              c[f2 >> 2] = c[e2 >> 2];
                              e2 = 1;
                            } else
                              e2 = 0;
                          while (0);
                        } else
                          e2 = 0;
                      } else
                        e2 = 0;
                    } else
                      e2 = 0;
                  } else
                    e2 = 1;
                } else
                  e2 = 0;
              } else
                e2 = 0;
            } else {
              c[f2 >> 2] = 0;
              e2 = 1;
            }
          while (0);
          V = n2;
          return e2 | 0;
        }
        function Ip(a2, b2, d2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          d2 = d2 | 0;
          var e2 = 0, f2 = 0;
          if (!(c[a2 + 8 >> 2] & 24))
            if ((b2 | 0) != 0 ? (e2 = ep(b2, 3840, 3960, 0) | 0, (e2 | 0) != 0) : 0) {
              d2 = (c[e2 + 8 >> 2] & 24 | 0) != 0;
              f2 = 5;
            } else
              d2 = 0;
          else {
            d2 = 1;
            f2 = 5;
          }
          if ((f2 | 0) == 5)
            d2 = ap(a2, b2, d2) | 0;
          return d2 | 0;
        }
        function Jp(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          var d2 = 0, e2 = 0, f2 = 0, g2 = 0, h2 = 0;
          while (1) {
            if (!b2) {
              b2 = 0;
              break;
            }
            d2 = ep(b2, 3840, 3976, 0) | 0;
            if (!d2) {
              b2 = 0;
              break;
            }
            f2 = c[a2 + 8 >> 2] | 0;
            if (c[d2 + 8 >> 2] & ~f2 | 0) {
              b2 = 0;
              break;
            }
            e2 = a2 + 12 | 0;
            b2 = c[e2 >> 2] | 0;
            d2 = d2 + 12 | 0;
            if (ap(b2, c[d2 >> 2] | 0, 0) | 0) {
              b2 = 1;
              break;
            }
            if ((f2 & 1 | 0) == 0 | (b2 | 0) == 0) {
              b2 = 0;
              break;
            }
            a2 = ep(b2, 3840, 3976, 0) | 0;
            if (!a2) {
              h2 = 9;
              break;
            }
            b2 = c[d2 >> 2] | 0;
          }
          if ((h2 | 0) == 9) {
            b2 = c[e2 >> 2] | 0;
            if ((b2 | 0) != 0 ? (g2 = ep(b2, 3840, 4008, 0) | 0, (g2 | 0) != 0) : 0)
              b2 = Kp(g2, c[d2 >> 2] | 0) | 0;
            else
              b2 = 0;
          }
          return b2 | 0;
        }
        function Kp(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          var d2 = 0;
          if ((((b2 | 0) != 0 ? (d2 = ep(b2, 3840, 4008, 0) | 0, (d2 | 0) != 0) : 0) ? (c[d2 + 8 >> 2] & ~c[a2 + 8 >> 2] | 0) == 0 : 0) ? ap(c[a2 + 12 >> 2] | 0, c[d2 + 12 >> 2] | 0, 0) | 0 : 0)
            a2 = ap(c[a2 + 16 >> 2] | 0, c[d2 + 16 >> 2] | 0, 0) | 0;
          else
            a2 = 0;
          return a2 | 0;
        }
        function Lp(a2) {
          a2 = a2 | 0;
          Uo(a2);
          jp(a2);
          return;
        }
        function Mp(b2, d2, e2, f2, g2, h2) {
          b2 = b2 | 0;
          d2 = d2 | 0;
          e2 = e2 | 0;
          f2 = f2 | 0;
          g2 = g2 | 0;
          h2 = h2 | 0;
          var i2 = 0, j2 = 0, k2 = 0, l2 = 0, m2 = 0, n2 = 0, o2 = 0, p2 = 0, q2 = 0, r2 = 0;
          if (ap(b2, c[d2 + 8 >> 2] | 0, h2) | 0)
            dp(0, d2, e2, f2, g2);
          else {
            r2 = d2 + 52 | 0;
            j2 = a[r2 >> 0] | 0;
            q2 = d2 + 53 | 0;
            i2 = a[q2 >> 0] | 0;
            p2 = c[b2 + 12 >> 2] | 0;
            m2 = b2 + 16 + (p2 << 3) | 0;
            a[r2 >> 0] = 0;
            a[q2 >> 0] = 0;
            Qp(b2 + 16 | 0, d2, e2, f2, g2, h2);
            k2 = a[r2 >> 0] | 0;
            j2 = k2 | j2;
            l2 = a[q2 >> 0] | 0;
            i2 = l2 | i2;
            a:
              do
                if ((p2 | 0) > 1) {
                  n2 = d2 + 24 | 0;
                  o2 = b2 + 8 | 0;
                  p2 = d2 + 54 | 0;
                  b2 = b2 + 24 | 0;
                  do {
                    i2 = i2 & 1;
                    j2 = j2 & 1;
                    if (a[p2 >> 0] | 0)
                      break a;
                    if (!(k2 << 24 >> 24)) {
                      if (l2 << 24 >> 24 ? (c[o2 >> 2] & 1 | 0) == 0 : 0)
                        break a;
                    } else {
                      if ((c[n2 >> 2] | 0) == 1)
                        break a;
                      if (!(c[o2 >> 2] & 2))
                        break a;
                    }
                    a[r2 >> 0] = 0;
                    a[q2 >> 0] = 0;
                    Qp(b2, d2, e2, f2, g2, h2);
                    k2 = a[r2 >> 0] | 0;
                    j2 = k2 | j2;
                    l2 = a[q2 >> 0] | 0;
                    i2 = l2 | i2;
                    b2 = b2 + 8 | 0;
                  } while (b2 >>> 0 < m2 >>> 0);
                }
              while (0);
            a[r2 >> 0] = j2 << 24 >> 24 != 0 & 1;
            a[q2 >> 0] = i2 << 24 >> 24 != 0 & 1;
          }
          return;
        }
        function Np(b2, d2, e2, f2, g2) {
          b2 = b2 | 0;
          d2 = d2 | 0;
          e2 = e2 | 0;
          f2 = f2 | 0;
          g2 = g2 | 0;
          var h2 = 0, i2 = 0, j2 = 0, k2 = 0, l2 = 0, m2 = 0, n2 = 0, o2 = 0, p2 = 0;
          a:
            do
              if (!(ap(b2, c[d2 + 8 >> 2] | 0, g2) | 0)) {
                if (!(ap(b2, c[d2 >> 2] | 0, g2) | 0)) {
                  p2 = c[b2 + 12 >> 2] | 0;
                  k2 = b2 + 16 + (p2 << 3) | 0;
                  Rp(b2 + 16 | 0, d2, e2, f2, g2);
                  h2 = b2 + 24 | 0;
                  if ((p2 | 0) <= 1)
                    break;
                  b2 = c[b2 + 8 >> 2] | 0;
                  if ((b2 & 2 | 0) == 0 ? (j2 = d2 + 36 | 0, (c[j2 >> 2] | 0) != 1) : 0) {
                    if (!(b2 & 1)) {
                      b2 = d2 + 54 | 0;
                      while (1) {
                        if (a[b2 >> 0] | 0)
                          break a;
                        if ((c[j2 >> 2] | 0) == 1)
                          break a;
                        Rp(h2, d2, e2, f2, g2);
                        h2 = h2 + 8 | 0;
                        if (h2 >>> 0 >= k2 >>> 0)
                          break a;
                      }
                    }
                    b2 = d2 + 24 | 0;
                    i2 = d2 + 54 | 0;
                    while (1) {
                      if (a[i2 >> 0] | 0)
                        break a;
                      if ((c[j2 >> 2] | 0) == 1 ? (c[b2 >> 2] | 0) == 1 : 0)
                        break a;
                      Rp(h2, d2, e2, f2, g2);
                      h2 = h2 + 8 | 0;
                      if (h2 >>> 0 >= k2 >>> 0)
                        break a;
                    }
                  }
                  b2 = d2 + 54 | 0;
                  while (1) {
                    if (a[b2 >> 0] | 0)
                      break a;
                    Rp(h2, d2, e2, f2, g2);
                    h2 = h2 + 8 | 0;
                    if (h2 >>> 0 >= k2 >>> 0)
                      break a;
                  }
                }
                if ((c[d2 + 16 >> 2] | 0) != (e2 | 0) ? (p2 = d2 + 20 | 0, (c[p2 >> 2] | 0) != (e2 | 0)) : 0) {
                  c[d2 + 32 >> 2] = f2;
                  o2 = d2 + 44 | 0;
                  if ((c[o2 >> 2] | 0) != 4) {
                    j2 = b2 + 16 + (c[b2 + 12 >> 2] << 3) | 0;
                    k2 = d2 + 52 | 0;
                    f2 = d2 + 53 | 0;
                    l2 = d2 + 54 | 0;
                    m2 = b2 + 8 | 0;
                    n2 = d2 + 24 | 0;
                    h2 = 0;
                    i2 = b2 + 16 | 0;
                    b2 = 0;
                    b:
                      while (1) {
                        if (i2 >>> 0 >= j2 >>> 0) {
                          i2 = 18;
                          break;
                        }
                        a[k2 >> 0] = 0;
                        a[f2 >> 0] = 0;
                        Qp(i2, d2, e2, e2, 1, g2);
                        if (a[l2 >> 0] | 0) {
                          i2 = 18;
                          break;
                        }
                        do
                          if (a[f2 >> 0] | 0) {
                            if (!(a[k2 >> 0] | 0))
                              if (!(c[m2 >> 2] & 1)) {
                                i2 = 19;
                                break b;
                              } else {
                                b2 = 1;
                                break;
                              }
                            if ((c[n2 >> 2] | 0) == 1) {
                              h2 = 1;
                              i2 = 19;
                              break b;
                            }
                            if (!(c[m2 >> 2] & 2)) {
                              h2 = 1;
                              i2 = 19;
                              break b;
                            } else {
                              h2 = 1;
                              b2 = 1;
                            }
                          }
                        while (0);
                        i2 = i2 + 8 | 0;
                      }
                    if ((i2 | 0) == 18)
                      if (b2)
                        i2 = 19;
                      else
                        b2 = 4;
                    if ((i2 | 0) == 19)
                      b2 = 3;
                    c[o2 >> 2] = b2;
                    if (h2 & 1)
                      break;
                  }
                  c[p2 >> 2] = e2;
                  e2 = d2 + 40 | 0;
                  c[e2 >> 2] = (c[e2 >> 2] | 0) + 1;
                  if ((c[d2 + 36 >> 2] | 0) != 1)
                    break;
                  if ((c[d2 + 24 >> 2] | 0) != 2)
                    break;
                  a[d2 + 54 >> 0] = 1;
                  break;
                }
                if ((f2 | 0) == 1)
                  c[d2 + 32 >> 2] = 1;
              } else
                cp(0, d2, e2, f2);
            while (0);
          return;
        }
        function Op(b2, d2, e2, f2) {
          b2 = b2 | 0;
          d2 = d2 | 0;
          e2 = e2 | 0;
          f2 = f2 | 0;
          var g2 = 0, h2 = 0;
          a:
            do
              if (!(ap(b2, c[d2 + 8 >> 2] | 0, 0) | 0)) {
                h2 = c[b2 + 12 >> 2] | 0;
                g2 = b2 + 16 + (h2 << 3) | 0;
                Pp(b2 + 16 | 0, d2, e2, f2);
                if ((h2 | 0) > 1) {
                  h2 = d2 + 54 | 0;
                  b2 = b2 + 24 | 0;
                  do {
                    Pp(b2, d2, e2, f2);
                    if (a[h2 >> 0] | 0)
                      break a;
                    b2 = b2 + 8 | 0;
                  } while (b2 >>> 0 < g2 >>> 0);
                }
              } else
                bp(0, d2, e2, f2);
            while (0);
          return;
        }
        function Pp(a2, b2, d2, e2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          d2 = d2 | 0;
          e2 = e2 | 0;
          var f2 = 0, g2 = 0;
          g2 = c[a2 + 4 >> 2] | 0;
          if (d2) {
            f2 = g2 >> 8;
            if (g2 & 1)
              f2 = c[(c[d2 >> 2] | 0) + f2 >> 2] | 0;
          } else
            f2 = 0;
          a2 = c[a2 >> 2] | 0;
          fa[c[(c[a2 >> 2] | 0) + 28 >> 2] & 7](a2, b2, d2 + f2 | 0, (g2 & 2 | 0) == 0 ? 2 : e2);
          return;
        }
        function Qp(a2, b2, d2, e2, f2, g2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          d2 = d2 | 0;
          e2 = e2 | 0;
          f2 = f2 | 0;
          g2 = g2 | 0;
          var h2 = 0, i2 = 0;
          i2 = c[a2 + 4 >> 2] | 0;
          h2 = i2 >> 8;
          if (i2 & 1)
            h2 = c[(c[e2 >> 2] | 0) + h2 >> 2] | 0;
          a2 = c[a2 >> 2] | 0;
          ha[c[(c[a2 >> 2] | 0) + 20 >> 2] & 3](a2, b2, d2, e2 + h2 | 0, (i2 & 2 | 0) == 0 ? 2 : f2, g2);
          return;
        }
        function Rp(a2, b2, d2, e2, f2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          d2 = d2 | 0;
          e2 = e2 | 0;
          f2 = f2 | 0;
          var g2 = 0, h2 = 0;
          h2 = c[a2 + 4 >> 2] | 0;
          g2 = h2 >> 8;
          if (h2 & 1)
            g2 = c[(c[d2 >> 2] | 0) + g2 >> 2] | 0;
          a2 = c[a2 >> 2] | 0;
          ga[c[(c[a2 >> 2] | 0) + 24 >> 2] & 3](a2, b2, d2 + g2 | 0, (h2 & 2 | 0) == 0 ? 2 : e2, f2);
          return;
        }
        function Sp(a2) {
          a2 = a2 | 0;
          c[a2 >> 2] = 5896;
          return;
        }
        function Tp(a2) {
          a2 = a2 | 0;
          var b2 = 0, c2 = 0;
          b2 = V;
          V = V + 16 | 0;
          c2 = b2;
          Up(c2, a2);
          a2 = Vp(c2) | 0;
          V = b2;
          return a2 | 0;
        }
        function Up(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          _p(a2, b2);
          return;
        }
        function Vp(a2) {
          a2 = a2 | 0;
          var b2 = 0, d2 = 0;
          b2 = V;
          V = V + 16 | 0;
          d2 = b2;
          Wp(d2, c[a2 + 4 >> 2] | 0);
          if (!((Xp(d2) | 0) << 24 >> 24))
            a2 = Zp(Yp(a2) | 0) | 0;
          else
            a2 = 0;
          V = b2;
          return a2 | 0;
        }
        function Wp(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          c[a2 >> 2] = b2;
          return;
        }
        function Xp(b2) {
          b2 = b2 | 0;
          return a[c[b2 >> 2] >> 0] | 0;
        }
        function Yp(a2) {
          a2 = a2 | 0;
          return a2 | 0;
        }
        function Zp(b2) {
          b2 = b2 | 0;
          var d2 = 0, e2 = 0, f2 = 0, g2 = 0;
          g2 = V;
          V = V + 16 | 0;
          f2 = g2;
          b2 = c[b2 + 8 >> 2] | 0;
          d2 = a[b2 >> 0] | 0;
          do
            if (d2 << 24 >> 24 != 1)
              if (!(d2 & 2)) {
                a[b2 >> 0] = 2;
                e2 = 1;
                break;
              } else
                To(20985, f2);
            else
              e2 = 0;
          while (0);
          V = g2;
          return e2 | 0;
        }
        function _p(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          c[a2 >> 2] = b2;
          c[a2 + 4 >> 2] = b2;
          c[a2 + 8 >> 2] = b2 + 1;
          c[a2 + 12 >> 2] = 0;
          return;
        }
        function $p(a2) {
          a2 = a2 | 0;
          var b2 = 0, c2 = 0;
          b2 = V;
          V = V + 16 | 0;
          c2 = b2;
          Up(c2, a2);
          aq(c2);
          V = b2;
          return;
        }
        function aq(a2) {
          a2 = a2 | 0;
          var b2 = 0, d2 = 0;
          b2 = V;
          V = V + 16 | 0;
          d2 = b2;
          Wp(d2, c[a2 + 4 >> 2] | 0);
          bq(d2);
          cq(Yp(a2) | 0);
          V = b2;
          return;
        }
        function bq(b2) {
          b2 = b2 | 0;
          a[c[b2 >> 2] >> 0] = 1;
          return;
        }
        function cq(b2) {
          b2 = b2 | 0;
          a[c[b2 + 8 >> 2] >> 0] = 1;
          return;
        }
        function dq() {
          return 0;
        }
        function eq(a2) {
          a2 = a2 | 0;
          var b2 = 0, c2 = 0;
          c2 = (a2 | 0) == 0 ? 1 : a2;
          while (1) {
            b2 = dr(c2) | 0;
            if (b2 | 0) {
              a2 = 6;
              break;
            }
            a2 = dq() | 0;
            if (!a2) {
              a2 = 5;
              break;
            }
            ba[a2 & 3]();
          }
          if ((a2 | 0) == 5) {
            c2 = v(4) | 0;
            Sp(c2);
            x(c2 | 0, 3880, 121);
          } else if ((a2 | 0) == 6)
            return b2 | 0;
          return 0;
        }
        function fq(a2) {
          a2 = a2 | 0;
          return eq(a2) | 0;
        }
        function gq(a2) {
          a2 = a2 | 0;
          jp(a2);
          return;
        }
        function hq(a2, b2, d2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          d2 = d2 | 0;
          var e2 = 0, f2 = 0;
          f2 = V;
          V = V + 16 | 0;
          e2 = f2;
          c[e2 >> 2] = c[d2 >> 2];
          a2 = aa[c[(c[a2 >> 2] | 0) + 16 >> 2] & 7](a2, b2, e2) | 0;
          if (a2)
            c[d2 >> 2] = c[e2 >> 2];
          V = f2;
          return a2 & 1 | 0;
        }
        function iq(a2) {
          a2 = a2 | 0;
          if (!a2)
            a2 = 0;
          else
            a2 = (ep(a2, 3840, 3976, 0) | 0) != 0 & 1;
          return a2 | 0;
        }
        function jq(a2) {
          a2 = a2 | 0;
          return 0;
        }
        function kq() {
          return (lq() | 0) > 0 | 0;
        }
        function lq() {
          return y() | 0;
        }
        function mq(a2) {
          a2 = a2 | 0;
          return;
        }
        function nq(a2) {
          a2 = a2 | 0;
          mq(a2);
          jp(a2);
          return;
        }
        function oq(a2) {
          a2 = a2 | 0;
          return 21039;
        }
        function pq(a2) {
          a2 = a2 | 0;
          return;
        }
        function qq(a2) {
          a2 = a2 | 0;
          var b2 = 0, d2 = 0;
          b2 = a2 + 8 | 0;
          if (!((c[b2 >> 2] | 0) != 0 ? (d2 = c[b2 >> 2] | 0, c[b2 >> 2] = d2 + -1, (d2 | 0) != 0) : 0))
            ca[c[(c[a2 >> 2] | 0) + 16 >> 2] & 255](a2);
          return;
        }
        function rq(a2) {
          a2 = a2 | 0;
          a2 = jq(a2) | 0;
          if (!a2)
            return;
          else
            br(a2, 21145);
        }
        function sq(a2) {
          a2 = a2 | 0;
          return;
        }
        function tq(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          var d2 = 0, e2 = 0;
          e2 = fo(b2) | 0;
          d2 = eq(e2 + 13 | 0) | 0;
          c[d2 >> 2] = e2;
          c[d2 + 4 >> 2] = e2;
          c[d2 + 8 >> 2] = 0;
          d2 = uq(d2) | 0;
          ur(d2 | 0, b2 | 0, e2 + 1 | 0) | 0;
          c[a2 >> 2] = d2;
          return;
        }
        function uq(a2) {
          a2 = a2 | 0;
          return a2 + 12 | 0;
        }
        function vq(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          c[a2 >> 2] = 5916;
          tq(a2 + 4 | 0, b2);
          return;
        }
        function wq(b2, d2) {
          b2 = b2 | 0;
          d2 = d2 | 0;
          c[b2 >> 2] = 5936;
          tq(b2 + 4 | 0, (a[d2 + 11 >> 0] | 0) < 0 ? c[d2 >> 2] | 0 : d2);
          return;
        }
        function xq(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          c[a2 >> 2] = 5936;
          tq(a2 + 4 | 0, b2);
          return;
        }
        function yq(a2) {
          a2 = a2 | 0;
          a2 = v(8) | 0;
          vq(a2, 21163);
          c[a2 >> 2] = 5956;
          x(a2 | 0, 3928, 123);
        }
        function zq(a2) {
          a2 = a2 | 0;
          a2 = v(8) | 0;
          vq(a2, 21163);
          c[a2 >> 2] = 5976;
          x(a2 | 0, 3944, 123);
        }
        function Aq(b2, d2, e2) {
          b2 = b2 | 0;
          d2 = d2 | 0;
          e2 = e2 | 0;
          var f2 = 0, g2 = 0, h2 = 0, i2 = 0;
          g2 = V;
          V = V + 16 | 0;
          f2 = g2;
          if (e2 >>> 0 > 4294967279)
            yq(b2);
          if (e2 >>> 0 < 11)
            a[b2 + 11 >> 0] = e2;
          else {
            i2 = e2 + 16 & -16;
            h2 = eq(i2) | 0;
            c[b2 >> 2] = h2;
            c[b2 + 8 >> 2] = i2 | -2147483648;
            c[b2 + 4 >> 2] = e2;
            b2 = h2;
          }
          Bq(b2, d2, e2) | 0;
          a[f2 >> 0] = 0;
          nb(b2 + e2 | 0, f2);
          V = g2;
          return;
        }
        function Bq(a2, b2, c2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          c2 = c2 | 0;
          if (c2 | 0)
            ur(a2 | 0, b2 | 0, c2 | 0) | 0;
          return a2 | 0;
        }
        function Cq(b2) {
          b2 = b2 | 0;
          if ((a[b2 + 11 >> 0] | 0) < 0)
            Da(c[b2 >> 2] | 0, c[b2 + 8 >> 2] & 2147483647);
          return;
        }
        function Dq(b2, d2, e2, f2, g2, h2, i2, j2) {
          b2 = b2 | 0;
          d2 = d2 | 0;
          e2 = e2 | 0;
          f2 = f2 | 0;
          g2 = g2 | 0;
          h2 = h2 | 0;
          i2 = i2 | 0;
          j2 = j2 | 0;
          var k2 = 0, l2 = 0, m2 = 0, n2 = 0, o2 = 0;
          o2 = V;
          V = V + 16 | 0;
          n2 = o2;
          if ((-18 - d2 | 0) >>> 0 < e2 >>> 0)
            yq(b2);
          if ((a[b2 + 11 >> 0] | 0) < 0)
            m2 = c[b2 >> 2] | 0;
          else
            m2 = b2;
          if (d2 >>> 0 < 2147483623) {
            k2 = e2 + d2 | 0;
            l2 = d2 << 1;
            k2 = k2 >>> 0 < l2 >>> 0 ? l2 : k2;
            k2 = k2 >>> 0 < 11 ? 11 : k2 + 16 & -16;
          } else
            k2 = -17;
          l2 = eq(k2) | 0;
          if (g2 | 0)
            Bq(l2, m2, g2) | 0;
          if (i2 | 0)
            Bq(l2 + g2 | 0, j2, i2) | 0;
          f2 = f2 - h2 | 0;
          e2 = f2 - g2 | 0;
          if (e2 | 0)
            Bq(l2 + g2 + i2 | 0, m2 + g2 + h2 | 0, e2) | 0;
          e2 = d2 + 1 | 0;
          if ((e2 | 0) != 11)
            Da(m2, e2);
          c[b2 >> 2] = l2;
          c[b2 + 8 >> 2] = k2 | -2147483648;
          i2 = f2 + i2 | 0;
          c[b2 + 4 >> 2] = i2;
          a[n2 >> 0] = 0;
          nb(l2 + i2 | 0, n2);
          V = o2;
          return;
        }
        function Eq(b2, d2, e2) {
          b2 = b2 | 0;
          d2 = d2 | 0;
          e2 = e2 | 0;
          var f2 = 0, g2 = 0, h2 = 0, i2 = 0, j2 = 0, k2 = 0;
          k2 = V;
          V = V + 16 | 0;
          i2 = k2;
          j2 = b2 + 11 | 0;
          f2 = a[j2 >> 0] | 0;
          h2 = f2 << 24 >> 24 < 0;
          if (h2) {
            g2 = (c[b2 + 8 >> 2] & 2147483647) + -1 | 0;
            f2 = c[b2 + 4 >> 2] | 0;
          } else {
            g2 = 10;
            f2 = f2 & 255;
          }
          if ((g2 - f2 | 0) >>> 0 >= e2 >>> 0) {
            if (e2 | 0) {
              if (h2)
                g2 = c[b2 >> 2] | 0;
              else
                g2 = b2;
              Bq(g2 + f2 | 0, d2, e2) | 0;
              f2 = f2 + e2 | 0;
              if ((a[j2 >> 0] | 0) < 0)
                c[b2 + 4 >> 2] = f2;
              else
                a[j2 >> 0] = f2;
              a[i2 >> 0] = 0;
              nb(g2 + f2 | 0, i2);
            }
          } else
            Dq(b2, g2, f2 + e2 - g2 | 0, f2, f2, 0, e2, d2);
          V = k2;
          return b2 | 0;
        }
        function Fq(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          return Eq(a2, b2, lb(b2) | 0) | 0;
        }
        function Gq(a2, b2, c2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          c2 = c2 | 0;
          if (!c2)
            a2 = 0;
          else
            a2 = Fo(a2, b2, c2) | 0;
          return a2 | 0;
        }
        function Hq(b2, d2, e2, f2, g2) {
          b2 = b2 | 0;
          d2 = d2 | 0;
          e2 = e2 | 0;
          f2 = f2 | 0;
          g2 = g2 | 0;
          var h2 = 0, i2 = 0;
          h2 = a[b2 + 11 >> 0] | 0;
          i2 = h2 << 24 >> 24 < 0;
          if (i2)
            h2 = c[b2 + 4 >> 2] | 0;
          else
            h2 = h2 & 255;
          if ((g2 | 0) == -1 | h2 >>> 0 < d2 >>> 0)
            zq(b2);
          h2 = h2 - d2 | 0;
          e2 = h2 >>> 0 < e2 >>> 0 ? h2 : e2;
          if (i2)
            b2 = c[b2 >> 2] | 0;
          h2 = e2 >>> 0 > g2 >>> 0;
          b2 = Gq(b2 + d2 | 0, f2, h2 ? g2 : e2) | 0;
          if (!b2)
            return (e2 >>> 0 < g2 >>> 0 ? -1 : h2 & 1) | 0;
          else
            return b2 | 0;
          return 0;
        }
        function Iq(a2) {
          a2 = a2 | 0;
          return;
        }
        function Jq(a2) {
          a2 = a2 | 0;
          jp(a2);
          return;
        }
        function Kq(a2) {
          a2 = a2 | 0;
          return 21228;
        }
        function Lq(a2, b2, d2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          d2 = d2 | 0;
          c[a2 >> 2] = d2;
          c[a2 + 4 >> 2] = b2;
          return;
        }
        function Mq(a2, b2, d2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          d2 = d2 | 0;
          var e2 = 0, f2 = 0;
          f2 = V;
          V = V + 16 | 0;
          e2 = f2;
          ea[c[(c[a2 >> 2] | 0) + 12 >> 2] & 15](e2, a2, b2);
          if ((c[e2 + 4 >> 2] | 0) == (c[d2 + 4 >> 2] | 0))
            a2 = (c[e2 >> 2] | 0) == (c[d2 >> 2] | 0);
          else
            a2 = 0;
          V = f2;
          return a2 | 0;
        }
        function Nq(a2, b2, d2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          d2 = d2 | 0;
          return ((c[b2 >> 2] | 0) == (d2 | 0) ? (c[b2 + 4 >> 2] | 0) == (a2 | 0) : 0) | 0;
        }
        function Oq(a2, b2, c2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          c2 = c2 | 0;
          if ((c2 | 0) > 256)
            Aq(a2, 21176, lb(21176) | 0);
          else
            Pq(a2, 0, c2);
          return;
        }
        function Pq(a2, b2, c2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          c2 = c2 | 0;
          Qq(a2, c2);
          return;
        }
        function Qq(b2, d2) {
          b2 = b2 | 0;
          d2 = d2 | 0;
          var e2 = 0, f2 = 0, g2 = 0, h2 = 0, i2 = 0;
          i2 = V;
          V = V + 1040 | 0;
          g2 = i2 + 1024 | 0;
          e2 = i2;
          h2 = c[(ao() | 0) >> 2] | 0;
          f2 = Rq(Oo(d2, e2, 1024) | 0, e2) | 0;
          if (!(a[f2 >> 0] | 0)) {
            c[g2 >> 2] = d2;
            Go(e2, 1024, 21211, g2) | 0;
          } else
            e2 = f2;
          c[(ao() | 0) >> 2] = h2;
          Aq(b2, e2, lb(e2) | 0);
          V = i2;
          return;
        }
        function Rq(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          var d2 = 0, e2 = 0;
          switch (a2 | 0) {
            case 0: {
              d2 = b2;
              break;
            }
            case -1: {
              a2 = c[(ao() | 0) >> 2] | 0;
              e2 = 3;
              break;
            }
            default:
              e2 = 3;
          }
          if ((e2 | 0) == 3)
            if ((a2 | 0) == 28)
              d2 = 22145;
            else
              P();
          return d2 | 0;
        }
        function Sq(a2) {
          a2 = a2 | 0;
          jp(a2);
          return;
        }
        function Tq(a2) {
          a2 = a2 | 0;
          return 21353;
        }
        function Uq(a2, b2, d2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          d2 = d2 | 0;
          if ((d2 | 0) > 256) {
            Wq() | 0;
            b2 = 6180;
          } else {
            Xq() | 0;
            b2 = 6176;
          }
          c[a2 >> 2] = d2;
          c[a2 + 4 >> 2] = b2;
          return;
        }
        function Vq(a2, b2, c2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          c2 = c2 | 0;
          if ((c2 | 0) > 256)
            Aq(a2, 21319, lb(21319) | 0);
          else
            Pq(a2, 0, c2);
          return;
        }
        function Wq() {
          if ((a[21488] | 0) == 0 ? Tp(21488) | 0 : 0)
            $p(21488);
          return 6180;
        }
        function Xq() {
          if ((a[21480] | 0) == 0 ? Tp(21480) | 0 : 0)
            $p(21480);
          return 6176;
        }
        function Yq(a2) {
          a2 = a2 | 0;
          yp(a2);
          return;
        }
        function Zq(a2) {
          a2 = a2 | 0;
          Yq(a2);
          jp(a2);
          return;
        }
        function _q(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          var d2 = 0;
          d2 = c[b2 + 4 >> 2] | 0;
          ea[c[(c[d2 >> 2] | 0) + 24 >> 2] & 15](a2, d2, c[b2 >> 2] | 0);
          return;
        }
        function $q(b2, d2, e2) {
          b2 = b2 | 0;
          d2 = d2 | 0;
          e2 = e2 | 0;
          var f2 = 0, g2 = 0, h2 = 0;
          h2 = V;
          V = V + 16 | 0;
          g2 = h2;
          if (c[d2 >> 2] | 0) {
            f2 = a[e2 + 11 >> 0] | 0;
            if (f2 << 24 >> 24 < 0)
              f2 = c[e2 + 4 >> 2] | 0;
            else
              f2 = f2 & 255;
            if (f2 | 0)
              Fq(e2, 21417) | 0;
            _q(g2, d2);
            d2 = a[g2 + 11 >> 0] | 0;
            f2 = d2 << 24 >> 24 < 0;
            Eq(e2, f2 ? c[g2 >> 2] | 0 : g2, f2 ? c[g2 + 4 >> 2] | 0 : d2 & 255) | 0;
            Cq(g2);
          }
          c[b2 >> 2] = c[e2 >> 2];
          c[b2 + 4 >> 2] = c[e2 + 4 >> 2];
          c[b2 + 8 >> 2] = c[e2 + 8 >> 2];
          f2 = 0;
          while (1) {
            if ((f2 | 0) == 3)
              break;
            c[e2 + (f2 << 2) >> 2] = 0;
            f2 = f2 + 1 | 0;
          }
          V = h2;
          return;
        }
        function ar(a2, b2, d2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          d2 = d2 | 0;
          var e2 = 0, f2 = 0, g2 = 0;
          e2 = V;
          V = V + 32 | 0;
          g2 = e2 + 12 | 0;
          f2 = e2;
          Aq(f2, d2, lb(d2) | 0);
          $q(g2, b2, f2);
          wq(a2, g2);
          Cq(g2);
          Cq(f2);
          c[a2 >> 2] = 6192;
          f2 = b2;
          b2 = c[f2 + 4 >> 2] | 0;
          d2 = a2 + 8 | 0;
          c[d2 >> 2] = c[f2 >> 2];
          c[d2 + 4 >> 2] = b2;
          V = e2;
          return;
        }
        function br(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          var d2 = 0, e2 = 0, f2 = 0;
          f2 = V;
          V = V + 16 | 0;
          e2 = f2 + 8 | 0;
          d2 = v(16) | 0;
          Wq() | 0;
          c[f2 >> 2] = a2;
          c[f2 + 4 >> 2] = 6180;
          c[e2 >> 2] = c[f2 >> 2];
          c[e2 + 4 >> 2] = c[f2 + 4 >> 2];
          ar(d2, e2, b2);
          x(d2 | 0, 4272, 136);
        }
        function cr(a2) {
          a2 = a2 | 0;
          a2 = v(8) | 0;
          vq(a2, 21420);
          c[a2 >> 2] = 5956;
          x(a2 | 0, 3928, 123);
        }
        function dr(a2) {
          a2 = a2 | 0;
          var b2 = 0, d2 = 0, e2 = 0, f2 = 0, g2 = 0, h2 = 0, i2 = 0, j2 = 0, k2 = 0, l2 = 0, m2 = 0, n2 = 0, o2 = 0, p2 = 0, q2 = 0, r2 = 0, s2 = 0, t2 = 0, u2 = 0, v2 = 0, w2 = 0;
          w2 = V;
          V = V + 16 | 0;
          n2 = w2;
          do
            if (a2 >>> 0 < 245) {
              k2 = a2 >>> 0 < 11 ? 16 : a2 + 11 & -8;
              a2 = k2 >>> 3;
              m2 = c[5412] | 0;
              d2 = m2 >>> a2;
              if (d2 & 3 | 0) {
                b2 = (d2 & 1 ^ 1) + a2 | 0;
                a2 = 21688 + (b2 << 1 << 2) | 0;
                d2 = a2 + 8 | 0;
                e2 = c[d2 >> 2] | 0;
                f2 = e2 + 8 | 0;
                g2 = c[f2 >> 2] | 0;
                if ((g2 | 0) == (a2 | 0))
                  c[5412] = m2 & ~(1 << b2);
                else {
                  c[g2 + 12 >> 2] = a2;
                  c[d2 >> 2] = g2;
                }
                v2 = b2 << 3;
                c[e2 + 4 >> 2] = v2 | 3;
                v2 = e2 + v2 + 4 | 0;
                c[v2 >> 2] = c[v2 >> 2] | 1;
                v2 = f2;
                V = w2;
                return v2 | 0;
              }
              l2 = c[5414] | 0;
              if (k2 >>> 0 > l2 >>> 0) {
                if (d2 | 0) {
                  b2 = 2 << a2;
                  b2 = d2 << a2 & (b2 | 0 - b2);
                  b2 = (b2 & 0 - b2) + -1 | 0;
                  i2 = b2 >>> 12 & 16;
                  b2 = b2 >>> i2;
                  d2 = b2 >>> 5 & 8;
                  b2 = b2 >>> d2;
                  g2 = b2 >>> 2 & 4;
                  b2 = b2 >>> g2;
                  a2 = b2 >>> 1 & 2;
                  b2 = b2 >>> a2;
                  e2 = b2 >>> 1 & 1;
                  e2 = (d2 | i2 | g2 | a2 | e2) + (b2 >>> e2) | 0;
                  b2 = 21688 + (e2 << 1 << 2) | 0;
                  a2 = b2 + 8 | 0;
                  g2 = c[a2 >> 2] | 0;
                  i2 = g2 + 8 | 0;
                  d2 = c[i2 >> 2] | 0;
                  if ((d2 | 0) == (b2 | 0)) {
                    a2 = m2 & ~(1 << e2);
                    c[5412] = a2;
                  } else {
                    c[d2 + 12 >> 2] = b2;
                    c[a2 >> 2] = d2;
                    a2 = m2;
                  }
                  v2 = e2 << 3;
                  h2 = v2 - k2 | 0;
                  c[g2 + 4 >> 2] = k2 | 3;
                  f2 = g2 + k2 | 0;
                  c[f2 + 4 >> 2] = h2 | 1;
                  c[g2 + v2 >> 2] = h2;
                  if (l2 | 0) {
                    e2 = c[5417] | 0;
                    b2 = l2 >>> 3;
                    d2 = 21688 + (b2 << 1 << 2) | 0;
                    b2 = 1 << b2;
                    if (!(a2 & b2)) {
                      c[5412] = a2 | b2;
                      b2 = d2;
                      a2 = d2 + 8 | 0;
                    } else {
                      a2 = d2 + 8 | 0;
                      b2 = c[a2 >> 2] | 0;
                    }
                    c[a2 >> 2] = e2;
                    c[b2 + 12 >> 2] = e2;
                    c[e2 + 8 >> 2] = b2;
                    c[e2 + 12 >> 2] = d2;
                  }
                  c[5414] = h2;
                  c[5417] = f2;
                  v2 = i2;
                  V = w2;
                  return v2 | 0;
                }
                g2 = c[5413] | 0;
                if (g2) {
                  d2 = (g2 & 0 - g2) + -1 | 0;
                  f2 = d2 >>> 12 & 16;
                  d2 = d2 >>> f2;
                  e2 = d2 >>> 5 & 8;
                  d2 = d2 >>> e2;
                  h2 = d2 >>> 2 & 4;
                  d2 = d2 >>> h2;
                  i2 = d2 >>> 1 & 2;
                  d2 = d2 >>> i2;
                  j2 = d2 >>> 1 & 1;
                  j2 = c[21952 + ((e2 | f2 | h2 | i2 | j2) + (d2 >>> j2) << 2) >> 2] | 0;
                  d2 = j2;
                  i2 = j2;
                  j2 = (c[j2 + 4 >> 2] & -8) - k2 | 0;
                  while (1) {
                    a2 = c[d2 + 16 >> 2] | 0;
                    if (!a2) {
                      a2 = c[d2 + 20 >> 2] | 0;
                      if (!a2)
                        break;
                    }
                    h2 = (c[a2 + 4 >> 2] & -8) - k2 | 0;
                    f2 = h2 >>> 0 < j2 >>> 0;
                    d2 = a2;
                    i2 = f2 ? a2 : i2;
                    j2 = f2 ? h2 : j2;
                  }
                  h2 = i2 + k2 | 0;
                  if (h2 >>> 0 > i2 >>> 0) {
                    f2 = c[i2 + 24 >> 2] | 0;
                    b2 = c[i2 + 12 >> 2] | 0;
                    do
                      if ((b2 | 0) == (i2 | 0)) {
                        a2 = i2 + 20 | 0;
                        b2 = c[a2 >> 2] | 0;
                        if (!b2) {
                          a2 = i2 + 16 | 0;
                          b2 = c[a2 >> 2] | 0;
                          if (!b2) {
                            d2 = 0;
                            break;
                          }
                        }
                        while (1) {
                          e2 = b2 + 20 | 0;
                          d2 = c[e2 >> 2] | 0;
                          if (!d2) {
                            e2 = b2 + 16 | 0;
                            d2 = c[e2 >> 2] | 0;
                            if (!d2)
                              break;
                            else {
                              b2 = d2;
                              a2 = e2;
                            }
                          } else {
                            b2 = d2;
                            a2 = e2;
                          }
                        }
                        c[a2 >> 2] = 0;
                        d2 = b2;
                      } else {
                        d2 = c[i2 + 8 >> 2] | 0;
                        c[d2 + 12 >> 2] = b2;
                        c[b2 + 8 >> 2] = d2;
                        d2 = b2;
                      }
                    while (0);
                    do
                      if (f2 | 0) {
                        b2 = c[i2 + 28 >> 2] | 0;
                        a2 = 21952 + (b2 << 2) | 0;
                        if ((i2 | 0) == (c[a2 >> 2] | 0)) {
                          c[a2 >> 2] = d2;
                          if (!d2) {
                            c[5413] = g2 & ~(1 << b2);
                            break;
                          }
                        } else {
                          v2 = f2 + 16 | 0;
                          c[((c[v2 >> 2] | 0) == (i2 | 0) ? v2 : f2 + 20 | 0) >> 2] = d2;
                          if (!d2)
                            break;
                        }
                        c[d2 + 24 >> 2] = f2;
                        b2 = c[i2 + 16 >> 2] | 0;
                        if (b2 | 0) {
                          c[d2 + 16 >> 2] = b2;
                          c[b2 + 24 >> 2] = d2;
                        }
                        b2 = c[i2 + 20 >> 2] | 0;
                        if (b2 | 0) {
                          c[d2 + 20 >> 2] = b2;
                          c[b2 + 24 >> 2] = d2;
                        }
                      }
                    while (0);
                    if (j2 >>> 0 < 16) {
                      v2 = j2 + k2 | 0;
                      c[i2 + 4 >> 2] = v2 | 3;
                      v2 = i2 + v2 + 4 | 0;
                      c[v2 >> 2] = c[v2 >> 2] | 1;
                    } else {
                      c[i2 + 4 >> 2] = k2 | 3;
                      c[h2 + 4 >> 2] = j2 | 1;
                      c[h2 + j2 >> 2] = j2;
                      if (l2 | 0) {
                        e2 = c[5417] | 0;
                        b2 = l2 >>> 3;
                        d2 = 21688 + (b2 << 1 << 2) | 0;
                        b2 = 1 << b2;
                        if (!(b2 & m2)) {
                          c[5412] = b2 | m2;
                          b2 = d2;
                          a2 = d2 + 8 | 0;
                        } else {
                          a2 = d2 + 8 | 0;
                          b2 = c[a2 >> 2] | 0;
                        }
                        c[a2 >> 2] = e2;
                        c[b2 + 12 >> 2] = e2;
                        c[e2 + 8 >> 2] = b2;
                        c[e2 + 12 >> 2] = d2;
                      }
                      c[5414] = j2;
                      c[5417] = h2;
                    }
                    v2 = i2 + 8 | 0;
                    V = w2;
                    return v2 | 0;
                  } else
                    m2 = k2;
                } else
                  m2 = k2;
              } else
                m2 = k2;
            } else if (a2 >>> 0 <= 4294967231) {
              a2 = a2 + 11 | 0;
              k2 = a2 & -8;
              e2 = c[5413] | 0;
              if (e2) {
                f2 = 0 - k2 | 0;
                a2 = a2 >>> 8;
                if (a2)
                  if (k2 >>> 0 > 16777215)
                    j2 = 31;
                  else {
                    m2 = (a2 + 1048320 | 0) >>> 16 & 8;
                    q2 = a2 << m2;
                    i2 = (q2 + 520192 | 0) >>> 16 & 4;
                    q2 = q2 << i2;
                    j2 = (q2 + 245760 | 0) >>> 16 & 2;
                    j2 = 14 - (i2 | m2 | j2) + (q2 << j2 >>> 15) | 0;
                    j2 = k2 >>> (j2 + 7 | 0) & 1 | j2 << 1;
                  }
                else
                  j2 = 0;
                d2 = c[21952 + (j2 << 2) >> 2] | 0;
                a:
                  do
                    if (!d2) {
                      d2 = 0;
                      a2 = 0;
                      q2 = 61;
                    } else {
                      a2 = 0;
                      i2 = k2 << ((j2 | 0) == 31 ? 0 : 25 - (j2 >>> 1) | 0);
                      g2 = 0;
                      while (1) {
                        h2 = (c[d2 + 4 >> 2] & -8) - k2 | 0;
                        if (h2 >>> 0 < f2 >>> 0)
                          if (!h2) {
                            a2 = d2;
                            f2 = 0;
                            q2 = 65;
                            break a;
                          } else {
                            a2 = d2;
                            f2 = h2;
                          }
                        q2 = c[d2 + 20 >> 2] | 0;
                        d2 = c[d2 + 16 + (i2 >>> 31 << 2) >> 2] | 0;
                        g2 = (q2 | 0) == 0 | (q2 | 0) == (d2 | 0) ? g2 : q2;
                        if (!d2) {
                          d2 = g2;
                          q2 = 61;
                          break;
                        } else
                          i2 = i2 << 1;
                      }
                    }
                  while (0);
                if ((q2 | 0) == 61) {
                  if ((d2 | 0) == 0 & (a2 | 0) == 0) {
                    a2 = 2 << j2;
                    a2 = (a2 | 0 - a2) & e2;
                    if (!a2) {
                      m2 = k2;
                      break;
                    }
                    m2 = (a2 & 0 - a2) + -1 | 0;
                    h2 = m2 >>> 12 & 16;
                    m2 = m2 >>> h2;
                    g2 = m2 >>> 5 & 8;
                    m2 = m2 >>> g2;
                    i2 = m2 >>> 2 & 4;
                    m2 = m2 >>> i2;
                    j2 = m2 >>> 1 & 2;
                    m2 = m2 >>> j2;
                    d2 = m2 >>> 1 & 1;
                    a2 = 0;
                    d2 = c[21952 + ((g2 | h2 | i2 | j2 | d2) + (m2 >>> d2) << 2) >> 2] | 0;
                  }
                  if (!d2) {
                    i2 = a2;
                    h2 = f2;
                  } else
                    q2 = 65;
                }
                if ((q2 | 0) == 65) {
                  g2 = d2;
                  while (1) {
                    m2 = (c[g2 + 4 >> 2] & -8) - k2 | 0;
                    d2 = m2 >>> 0 < f2 >>> 0;
                    f2 = d2 ? m2 : f2;
                    a2 = d2 ? g2 : a2;
                    d2 = c[g2 + 16 >> 2] | 0;
                    if (!d2)
                      d2 = c[g2 + 20 >> 2] | 0;
                    if (!d2) {
                      i2 = a2;
                      h2 = f2;
                      break;
                    } else
                      g2 = d2;
                  }
                }
                if (((i2 | 0) != 0 ? h2 >>> 0 < ((c[5414] | 0) - k2 | 0) >>> 0 : 0) ? (l2 = i2 + k2 | 0, l2 >>> 0 > i2 >>> 0) : 0) {
                  g2 = c[i2 + 24 >> 2] | 0;
                  b2 = c[i2 + 12 >> 2] | 0;
                  do
                    if ((b2 | 0) == (i2 | 0)) {
                      a2 = i2 + 20 | 0;
                      b2 = c[a2 >> 2] | 0;
                      if (!b2) {
                        a2 = i2 + 16 | 0;
                        b2 = c[a2 >> 2] | 0;
                        if (!b2) {
                          b2 = 0;
                          break;
                        }
                      }
                      while (1) {
                        f2 = b2 + 20 | 0;
                        d2 = c[f2 >> 2] | 0;
                        if (!d2) {
                          f2 = b2 + 16 | 0;
                          d2 = c[f2 >> 2] | 0;
                          if (!d2)
                            break;
                          else {
                            b2 = d2;
                            a2 = f2;
                          }
                        } else {
                          b2 = d2;
                          a2 = f2;
                        }
                      }
                      c[a2 >> 2] = 0;
                    } else {
                      v2 = c[i2 + 8 >> 2] | 0;
                      c[v2 + 12 >> 2] = b2;
                      c[b2 + 8 >> 2] = v2;
                    }
                  while (0);
                  do
                    if (g2) {
                      a2 = c[i2 + 28 >> 2] | 0;
                      d2 = 21952 + (a2 << 2) | 0;
                      if ((i2 | 0) == (c[d2 >> 2] | 0)) {
                        c[d2 >> 2] = b2;
                        if (!b2) {
                          e2 = e2 & ~(1 << a2);
                          c[5413] = e2;
                          break;
                        }
                      } else {
                        v2 = g2 + 16 | 0;
                        c[((c[v2 >> 2] | 0) == (i2 | 0) ? v2 : g2 + 20 | 0) >> 2] = b2;
                        if (!b2)
                          break;
                      }
                      c[b2 + 24 >> 2] = g2;
                      a2 = c[i2 + 16 >> 2] | 0;
                      if (a2 | 0) {
                        c[b2 + 16 >> 2] = a2;
                        c[a2 + 24 >> 2] = b2;
                      }
                      a2 = c[i2 + 20 >> 2] | 0;
                      if (a2) {
                        c[b2 + 20 >> 2] = a2;
                        c[a2 + 24 >> 2] = b2;
                      }
                    }
                  while (0);
                  b:
                    do
                      if (h2 >>> 0 < 16) {
                        v2 = h2 + k2 | 0;
                        c[i2 + 4 >> 2] = v2 | 3;
                        v2 = i2 + v2 + 4 | 0;
                        c[v2 >> 2] = c[v2 >> 2] | 1;
                      } else {
                        c[i2 + 4 >> 2] = k2 | 3;
                        c[l2 + 4 >> 2] = h2 | 1;
                        c[l2 + h2 >> 2] = h2;
                        b2 = h2 >>> 3;
                        if (h2 >>> 0 < 256) {
                          d2 = 21688 + (b2 << 1 << 2) | 0;
                          a2 = c[5412] | 0;
                          b2 = 1 << b2;
                          if (!(a2 & b2)) {
                            c[5412] = a2 | b2;
                            b2 = d2;
                            a2 = d2 + 8 | 0;
                          } else {
                            a2 = d2 + 8 | 0;
                            b2 = c[a2 >> 2] | 0;
                          }
                          c[a2 >> 2] = l2;
                          c[b2 + 12 >> 2] = l2;
                          c[l2 + 8 >> 2] = b2;
                          c[l2 + 12 >> 2] = d2;
                          break;
                        }
                        b2 = h2 >>> 8;
                        if (b2)
                          if (h2 >>> 0 > 16777215)
                            d2 = 31;
                          else {
                            u2 = (b2 + 1048320 | 0) >>> 16 & 8;
                            v2 = b2 << u2;
                            t2 = (v2 + 520192 | 0) >>> 16 & 4;
                            v2 = v2 << t2;
                            d2 = (v2 + 245760 | 0) >>> 16 & 2;
                            d2 = 14 - (t2 | u2 | d2) + (v2 << d2 >>> 15) | 0;
                            d2 = h2 >>> (d2 + 7 | 0) & 1 | d2 << 1;
                          }
                        else
                          d2 = 0;
                        b2 = 21952 + (d2 << 2) | 0;
                        c[l2 + 28 >> 2] = d2;
                        a2 = l2 + 16 | 0;
                        c[a2 + 4 >> 2] = 0;
                        c[a2 >> 2] = 0;
                        a2 = 1 << d2;
                        if (!(e2 & a2)) {
                          c[5413] = e2 | a2;
                          c[b2 >> 2] = l2;
                          c[l2 + 24 >> 2] = b2;
                          c[l2 + 12 >> 2] = l2;
                          c[l2 + 8 >> 2] = l2;
                          break;
                        }
                        b2 = c[b2 >> 2] | 0;
                        c:
                          do
                            if ((c[b2 + 4 >> 2] & -8 | 0) != (h2 | 0)) {
                              e2 = h2 << ((d2 | 0) == 31 ? 0 : 25 - (d2 >>> 1) | 0);
                              while (1) {
                                d2 = b2 + 16 + (e2 >>> 31 << 2) | 0;
                                a2 = c[d2 >> 2] | 0;
                                if (!a2)
                                  break;
                                if ((c[a2 + 4 >> 2] & -8 | 0) == (h2 | 0)) {
                                  b2 = a2;
                                  break c;
                                } else {
                                  e2 = e2 << 1;
                                  b2 = a2;
                                }
                              }
                              c[d2 >> 2] = l2;
                              c[l2 + 24 >> 2] = b2;
                              c[l2 + 12 >> 2] = l2;
                              c[l2 + 8 >> 2] = l2;
                              break b;
                            }
                          while (0);
                        u2 = b2 + 8 | 0;
                        v2 = c[u2 >> 2] | 0;
                        c[v2 + 12 >> 2] = l2;
                        c[u2 >> 2] = l2;
                        c[l2 + 8 >> 2] = v2;
                        c[l2 + 12 >> 2] = b2;
                        c[l2 + 24 >> 2] = 0;
                      }
                    while (0);
                  v2 = i2 + 8 | 0;
                  V = w2;
                  return v2 | 0;
                } else
                  m2 = k2;
              } else
                m2 = k2;
            } else
              m2 = -1;
          while (0);
          d2 = c[5414] | 0;
          if (d2 >>> 0 >= m2 >>> 0) {
            b2 = d2 - m2 | 0;
            a2 = c[5417] | 0;
            if (b2 >>> 0 > 15) {
              v2 = a2 + m2 | 0;
              c[5417] = v2;
              c[5414] = b2;
              c[v2 + 4 >> 2] = b2 | 1;
              c[a2 + d2 >> 2] = b2;
              c[a2 + 4 >> 2] = m2 | 3;
            } else {
              c[5414] = 0;
              c[5417] = 0;
              c[a2 + 4 >> 2] = d2 | 3;
              v2 = a2 + d2 + 4 | 0;
              c[v2 >> 2] = c[v2 >> 2] | 1;
            }
            v2 = a2 + 8 | 0;
            V = w2;
            return v2 | 0;
          }
          h2 = c[5415] | 0;
          if (h2 >>> 0 > m2 >>> 0) {
            t2 = h2 - m2 | 0;
            c[5415] = t2;
            v2 = c[5418] | 0;
            u2 = v2 + m2 | 0;
            c[5418] = u2;
            c[u2 + 4 >> 2] = t2 | 1;
            c[v2 + 4 >> 2] = m2 | 3;
            v2 = v2 + 8 | 0;
            V = w2;
            return v2 | 0;
          }
          if (!(c[5530] | 0)) {
            c[5532] = 4096;
            c[5531] = 4096;
            c[5533] = -1;
            c[5534] = -1;
            c[5535] = 0;
            c[5523] = 0;
            c[5530] = n2 & -16 ^ 1431655768;
            a2 = 4096;
          } else
            a2 = c[5532] | 0;
          i2 = m2 + 48 | 0;
          j2 = m2 + 47 | 0;
          g2 = a2 + j2 | 0;
          f2 = 0 - a2 | 0;
          k2 = g2 & f2;
          if (k2 >>> 0 <= m2 >>> 0) {
            v2 = 0;
            V = w2;
            return v2 | 0;
          }
          a2 = c[5522] | 0;
          if (a2 | 0 ? (l2 = c[5520] | 0, n2 = l2 + k2 | 0, n2 >>> 0 <= l2 >>> 0 | n2 >>> 0 > a2 >>> 0) : 0) {
            v2 = 0;
            V = w2;
            return v2 | 0;
          }
          d:
            do
              if (!(c[5523] & 4)) {
                d2 = c[5418] | 0;
                e:
                  do
                    if (d2) {
                      e2 = 22096;
                      while (1) {
                        n2 = c[e2 >> 2] | 0;
                        if (n2 >>> 0 <= d2 >>> 0 ? (n2 + (c[e2 + 4 >> 2] | 0) | 0) >>> 0 > d2 >>> 0 : 0)
                          break;
                        a2 = c[e2 + 8 >> 2] | 0;
                        if (!a2) {
                          q2 = 128;
                          break e;
                        } else
                          e2 = a2;
                      }
                      b2 = g2 - h2 & f2;
                      if (b2 >>> 0 < 2147483647) {
                        a2 = fr(b2) | 0;
                        if ((a2 | 0) == ((c[e2 >> 2] | 0) + (c[e2 + 4 >> 2] | 0) | 0)) {
                          if ((a2 | 0) != (-1 | 0)) {
                            h2 = b2;
                            g2 = a2;
                            q2 = 145;
                            break d;
                          }
                        } else {
                          e2 = a2;
                          q2 = 136;
                        }
                      } else
                        b2 = 0;
                    } else
                      q2 = 128;
                  while (0);
                do
                  if ((q2 | 0) == 128) {
                    d2 = fr(0) | 0;
                    if ((d2 | 0) != (-1 | 0) ? (b2 = d2, o2 = c[5531] | 0, p2 = o2 + -1 | 0, b2 = ((p2 & b2 | 0) == 0 ? 0 : (p2 + b2 & 0 - o2) - b2 | 0) + k2 | 0, o2 = c[5520] | 0, p2 = b2 + o2 | 0, b2 >>> 0 > m2 >>> 0 & b2 >>> 0 < 2147483647) : 0) {
                      n2 = c[5522] | 0;
                      if (n2 | 0 ? p2 >>> 0 <= o2 >>> 0 | p2 >>> 0 > n2 >>> 0 : 0) {
                        b2 = 0;
                        break;
                      }
                      a2 = fr(b2) | 0;
                      if ((a2 | 0) == (d2 | 0)) {
                        h2 = b2;
                        g2 = d2;
                        q2 = 145;
                        break d;
                      } else {
                        e2 = a2;
                        q2 = 136;
                      }
                    } else
                      b2 = 0;
                  }
                while (0);
                do
                  if ((q2 | 0) == 136) {
                    d2 = 0 - b2 | 0;
                    if (!(i2 >>> 0 > b2 >>> 0 & (b2 >>> 0 < 2147483647 & (e2 | 0) != (-1 | 0))))
                      if ((e2 | 0) == (-1 | 0)) {
                        b2 = 0;
                        break;
                      } else {
                        h2 = b2;
                        g2 = e2;
                        q2 = 145;
                        break d;
                      }
                    a2 = c[5532] | 0;
                    a2 = j2 - b2 + a2 & 0 - a2;
                    if (a2 >>> 0 >= 2147483647) {
                      h2 = b2;
                      g2 = e2;
                      q2 = 145;
                      break d;
                    }
                    if ((fr(a2) | 0) == (-1 | 0)) {
                      fr(d2) | 0;
                      b2 = 0;
                      break;
                    } else {
                      h2 = a2 + b2 | 0;
                      g2 = e2;
                      q2 = 145;
                      break d;
                    }
                  }
                while (0);
                c[5523] = c[5523] | 4;
                q2 = 143;
              } else {
                b2 = 0;
                q2 = 143;
              }
            while (0);
          if (((q2 | 0) == 143 ? k2 >>> 0 < 2147483647 : 0) ? (t2 = fr(k2) | 0, p2 = fr(0) | 0, r2 = p2 - t2 | 0, s2 = r2 >>> 0 > (m2 + 40 | 0) >>> 0, !((t2 | 0) == (-1 | 0) | s2 ^ 1 | t2 >>> 0 < p2 >>> 0 & ((t2 | 0) != (-1 | 0) & (p2 | 0) != (-1 | 0)) ^ 1)) : 0) {
            h2 = s2 ? r2 : b2;
            g2 = t2;
            q2 = 145;
          }
          if ((q2 | 0) == 145) {
            b2 = (c[5520] | 0) + h2 | 0;
            c[5520] = b2;
            if (b2 >>> 0 > (c[5521] | 0) >>> 0)
              c[5521] = b2;
            j2 = c[5418] | 0;
            f:
              do
                if (j2) {
                  b2 = 22096;
                  while (1) {
                    a2 = c[b2 >> 2] | 0;
                    d2 = c[b2 + 4 >> 2] | 0;
                    if ((g2 | 0) == (a2 + d2 | 0)) {
                      q2 = 154;
                      break;
                    }
                    e2 = c[b2 + 8 >> 2] | 0;
                    if (!e2)
                      break;
                    else
                      b2 = e2;
                  }
                  if (((q2 | 0) == 154 ? (u2 = b2 + 4 | 0, (c[b2 + 12 >> 2] & 8 | 0) == 0) : 0) ? g2 >>> 0 > j2 >>> 0 & a2 >>> 0 <= j2 >>> 0 : 0) {
                    c[u2 >> 2] = d2 + h2;
                    v2 = (c[5415] | 0) + h2 | 0;
                    t2 = j2 + 8 | 0;
                    t2 = (t2 & 7 | 0) == 0 ? 0 : 0 - t2 & 7;
                    u2 = j2 + t2 | 0;
                    t2 = v2 - t2 | 0;
                    c[5418] = u2;
                    c[5415] = t2;
                    c[u2 + 4 >> 2] = t2 | 1;
                    c[j2 + v2 + 4 >> 2] = 40;
                    c[5419] = c[5534];
                    break;
                  }
                  if (g2 >>> 0 < (c[5416] | 0) >>> 0)
                    c[5416] = g2;
                  d2 = g2 + h2 | 0;
                  b2 = 22096;
                  while (1) {
                    if ((c[b2 >> 2] | 0) == (d2 | 0)) {
                      q2 = 162;
                      break;
                    }
                    a2 = c[b2 + 8 >> 2] | 0;
                    if (!a2)
                      break;
                    else
                      b2 = a2;
                  }
                  if ((q2 | 0) == 162 ? (c[b2 + 12 >> 2] & 8 | 0) == 0 : 0) {
                    c[b2 >> 2] = g2;
                    l2 = b2 + 4 | 0;
                    c[l2 >> 2] = (c[l2 >> 2] | 0) + h2;
                    l2 = g2 + 8 | 0;
                    l2 = g2 + ((l2 & 7 | 0) == 0 ? 0 : 0 - l2 & 7) | 0;
                    b2 = d2 + 8 | 0;
                    b2 = d2 + ((b2 & 7 | 0) == 0 ? 0 : 0 - b2 & 7) | 0;
                    k2 = l2 + m2 | 0;
                    i2 = b2 - l2 - m2 | 0;
                    c[l2 + 4 >> 2] = m2 | 3;
                    g:
                      do
                        if ((j2 | 0) == (b2 | 0)) {
                          v2 = (c[5415] | 0) + i2 | 0;
                          c[5415] = v2;
                          c[5418] = k2;
                          c[k2 + 4 >> 2] = v2 | 1;
                        } else {
                          if ((c[5417] | 0) == (b2 | 0)) {
                            v2 = (c[5414] | 0) + i2 | 0;
                            c[5414] = v2;
                            c[5417] = k2;
                            c[k2 + 4 >> 2] = v2 | 1;
                            c[k2 + v2 >> 2] = v2;
                            break;
                          }
                          a2 = c[b2 + 4 >> 2] | 0;
                          if ((a2 & 3 | 0) == 1) {
                            h2 = a2 & -8;
                            e2 = a2 >>> 3;
                            h:
                              do
                                if (a2 >>> 0 < 256) {
                                  a2 = c[b2 + 8 >> 2] | 0;
                                  d2 = c[b2 + 12 >> 2] | 0;
                                  if ((d2 | 0) == (a2 | 0)) {
                                    c[5412] = c[5412] & ~(1 << e2);
                                    break;
                                  } else {
                                    c[a2 + 12 >> 2] = d2;
                                    c[d2 + 8 >> 2] = a2;
                                    break;
                                  }
                                } else {
                                  g2 = c[b2 + 24 >> 2] | 0;
                                  a2 = c[b2 + 12 >> 2] | 0;
                                  do
                                    if ((a2 | 0) == (b2 | 0)) {
                                      d2 = b2 + 16 | 0;
                                      e2 = d2 + 4 | 0;
                                      a2 = c[e2 >> 2] | 0;
                                      if (!a2) {
                                        a2 = c[d2 >> 2] | 0;
                                        if (!a2) {
                                          a2 = 0;
                                          break;
                                        }
                                      } else
                                        d2 = e2;
                                      while (1) {
                                        f2 = a2 + 20 | 0;
                                        e2 = c[f2 >> 2] | 0;
                                        if (!e2) {
                                          f2 = a2 + 16 | 0;
                                          e2 = c[f2 >> 2] | 0;
                                          if (!e2)
                                            break;
                                          else {
                                            a2 = e2;
                                            d2 = f2;
                                          }
                                        } else {
                                          a2 = e2;
                                          d2 = f2;
                                        }
                                      }
                                      c[d2 >> 2] = 0;
                                    } else {
                                      v2 = c[b2 + 8 >> 2] | 0;
                                      c[v2 + 12 >> 2] = a2;
                                      c[a2 + 8 >> 2] = v2;
                                    }
                                  while (0);
                                  if (!g2)
                                    break;
                                  d2 = c[b2 + 28 >> 2] | 0;
                                  e2 = 21952 + (d2 << 2) | 0;
                                  do
                                    if ((c[e2 >> 2] | 0) != (b2 | 0)) {
                                      v2 = g2 + 16 | 0;
                                      c[((c[v2 >> 2] | 0) == (b2 | 0) ? v2 : g2 + 20 | 0) >> 2] = a2;
                                      if (!a2)
                                        break h;
                                    } else {
                                      c[e2 >> 2] = a2;
                                      if (a2 | 0)
                                        break;
                                      c[5413] = c[5413] & ~(1 << d2);
                                      break h;
                                    }
                                  while (0);
                                  c[a2 + 24 >> 2] = g2;
                                  d2 = b2 + 16 | 0;
                                  e2 = c[d2 >> 2] | 0;
                                  if (e2 | 0) {
                                    c[a2 + 16 >> 2] = e2;
                                    c[e2 + 24 >> 2] = a2;
                                  }
                                  d2 = c[d2 + 4 >> 2] | 0;
                                  if (!d2)
                                    break;
                                  c[a2 + 20 >> 2] = d2;
                                  c[d2 + 24 >> 2] = a2;
                                }
                              while (0);
                            b2 = b2 + h2 | 0;
                            f2 = h2 + i2 | 0;
                          } else
                            f2 = i2;
                          b2 = b2 + 4 | 0;
                          c[b2 >> 2] = c[b2 >> 2] & -2;
                          c[k2 + 4 >> 2] = f2 | 1;
                          c[k2 + f2 >> 2] = f2;
                          b2 = f2 >>> 3;
                          if (f2 >>> 0 < 256) {
                            d2 = 21688 + (b2 << 1 << 2) | 0;
                            a2 = c[5412] | 0;
                            b2 = 1 << b2;
                            if (!(a2 & b2)) {
                              c[5412] = a2 | b2;
                              b2 = d2;
                              a2 = d2 + 8 | 0;
                            } else {
                              a2 = d2 + 8 | 0;
                              b2 = c[a2 >> 2] | 0;
                            }
                            c[a2 >> 2] = k2;
                            c[b2 + 12 >> 2] = k2;
                            c[k2 + 8 >> 2] = b2;
                            c[k2 + 12 >> 2] = d2;
                            break;
                          }
                          b2 = f2 >>> 8;
                          do
                            if (!b2)
                              e2 = 0;
                            else {
                              if (f2 >>> 0 > 16777215) {
                                e2 = 31;
                                break;
                              }
                              u2 = (b2 + 1048320 | 0) >>> 16 & 8;
                              v2 = b2 << u2;
                              t2 = (v2 + 520192 | 0) >>> 16 & 4;
                              v2 = v2 << t2;
                              e2 = (v2 + 245760 | 0) >>> 16 & 2;
                              e2 = 14 - (t2 | u2 | e2) + (v2 << e2 >>> 15) | 0;
                              e2 = f2 >>> (e2 + 7 | 0) & 1 | e2 << 1;
                            }
                          while (0);
                          b2 = 21952 + (e2 << 2) | 0;
                          c[k2 + 28 >> 2] = e2;
                          a2 = k2 + 16 | 0;
                          c[a2 + 4 >> 2] = 0;
                          c[a2 >> 2] = 0;
                          a2 = c[5413] | 0;
                          d2 = 1 << e2;
                          if (!(a2 & d2)) {
                            c[5413] = a2 | d2;
                            c[b2 >> 2] = k2;
                            c[k2 + 24 >> 2] = b2;
                            c[k2 + 12 >> 2] = k2;
                            c[k2 + 8 >> 2] = k2;
                            break;
                          }
                          b2 = c[b2 >> 2] | 0;
                          i:
                            do
                              if ((c[b2 + 4 >> 2] & -8 | 0) != (f2 | 0)) {
                                e2 = f2 << ((e2 | 0) == 31 ? 0 : 25 - (e2 >>> 1) | 0);
                                while (1) {
                                  d2 = b2 + 16 + (e2 >>> 31 << 2) | 0;
                                  a2 = c[d2 >> 2] | 0;
                                  if (!a2)
                                    break;
                                  if ((c[a2 + 4 >> 2] & -8 | 0) == (f2 | 0)) {
                                    b2 = a2;
                                    break i;
                                  } else {
                                    e2 = e2 << 1;
                                    b2 = a2;
                                  }
                                }
                                c[d2 >> 2] = k2;
                                c[k2 + 24 >> 2] = b2;
                                c[k2 + 12 >> 2] = k2;
                                c[k2 + 8 >> 2] = k2;
                                break g;
                              }
                            while (0);
                          u2 = b2 + 8 | 0;
                          v2 = c[u2 >> 2] | 0;
                          c[v2 + 12 >> 2] = k2;
                          c[u2 >> 2] = k2;
                          c[k2 + 8 >> 2] = v2;
                          c[k2 + 12 >> 2] = b2;
                          c[k2 + 24 >> 2] = 0;
                        }
                      while (0);
                    v2 = l2 + 8 | 0;
                    V = w2;
                    return v2 | 0;
                  }
                  b2 = 22096;
                  while (1) {
                    a2 = c[b2 >> 2] | 0;
                    if (a2 >>> 0 <= j2 >>> 0 ? (v2 = a2 + (c[b2 + 4 >> 2] | 0) | 0, v2 >>> 0 > j2 >>> 0) : 0)
                      break;
                    b2 = c[b2 + 8 >> 2] | 0;
                  }
                  f2 = v2 + -47 | 0;
                  a2 = f2 + 8 | 0;
                  a2 = f2 + ((a2 & 7 | 0) == 0 ? 0 : 0 - a2 & 7) | 0;
                  f2 = j2 + 16 | 0;
                  a2 = a2 >>> 0 < f2 >>> 0 ? j2 : a2;
                  b2 = a2 + 8 | 0;
                  d2 = h2 + -40 | 0;
                  t2 = g2 + 8 | 0;
                  t2 = (t2 & 7 | 0) == 0 ? 0 : 0 - t2 & 7;
                  u2 = g2 + t2 | 0;
                  t2 = d2 - t2 | 0;
                  c[5418] = u2;
                  c[5415] = t2;
                  c[u2 + 4 >> 2] = t2 | 1;
                  c[g2 + d2 + 4 >> 2] = 40;
                  c[5419] = c[5534];
                  d2 = a2 + 4 | 0;
                  c[d2 >> 2] = 27;
                  c[b2 >> 2] = c[5524];
                  c[b2 + 4 >> 2] = c[5525];
                  c[b2 + 8 >> 2] = c[5526];
                  c[b2 + 12 >> 2] = c[5527];
                  c[5524] = g2;
                  c[5525] = h2;
                  c[5527] = 0;
                  c[5526] = b2;
                  b2 = a2 + 24 | 0;
                  do {
                    u2 = b2;
                    b2 = b2 + 4 | 0;
                    c[b2 >> 2] = 7;
                  } while ((u2 + 8 | 0) >>> 0 < v2 >>> 0);
                  if ((a2 | 0) != (j2 | 0)) {
                    g2 = a2 - j2 | 0;
                    c[d2 >> 2] = c[d2 >> 2] & -2;
                    c[j2 + 4 >> 2] = g2 | 1;
                    c[a2 >> 2] = g2;
                    b2 = g2 >>> 3;
                    if (g2 >>> 0 < 256) {
                      d2 = 21688 + (b2 << 1 << 2) | 0;
                      a2 = c[5412] | 0;
                      b2 = 1 << b2;
                      if (!(a2 & b2)) {
                        c[5412] = a2 | b2;
                        b2 = d2;
                        a2 = d2 + 8 | 0;
                      } else {
                        a2 = d2 + 8 | 0;
                        b2 = c[a2 >> 2] | 0;
                      }
                      c[a2 >> 2] = j2;
                      c[b2 + 12 >> 2] = j2;
                      c[j2 + 8 >> 2] = b2;
                      c[j2 + 12 >> 2] = d2;
                      break;
                    }
                    b2 = g2 >>> 8;
                    if (b2)
                      if (g2 >>> 0 > 16777215)
                        e2 = 31;
                      else {
                        u2 = (b2 + 1048320 | 0) >>> 16 & 8;
                        v2 = b2 << u2;
                        t2 = (v2 + 520192 | 0) >>> 16 & 4;
                        v2 = v2 << t2;
                        e2 = (v2 + 245760 | 0) >>> 16 & 2;
                        e2 = 14 - (t2 | u2 | e2) + (v2 << e2 >>> 15) | 0;
                        e2 = g2 >>> (e2 + 7 | 0) & 1 | e2 << 1;
                      }
                    else
                      e2 = 0;
                    d2 = 21952 + (e2 << 2) | 0;
                    c[j2 + 28 >> 2] = e2;
                    c[j2 + 20 >> 2] = 0;
                    c[f2 >> 2] = 0;
                    b2 = c[5413] | 0;
                    a2 = 1 << e2;
                    if (!(b2 & a2)) {
                      c[5413] = b2 | a2;
                      c[d2 >> 2] = j2;
                      c[j2 + 24 >> 2] = d2;
                      c[j2 + 12 >> 2] = j2;
                      c[j2 + 8 >> 2] = j2;
                      break;
                    }
                    b2 = c[d2 >> 2] | 0;
                    j:
                      do
                        if ((c[b2 + 4 >> 2] & -8 | 0) != (g2 | 0)) {
                          e2 = g2 << ((e2 | 0) == 31 ? 0 : 25 - (e2 >>> 1) | 0);
                          while (1) {
                            d2 = b2 + 16 + (e2 >>> 31 << 2) | 0;
                            a2 = c[d2 >> 2] | 0;
                            if (!a2)
                              break;
                            if ((c[a2 + 4 >> 2] & -8 | 0) == (g2 | 0)) {
                              b2 = a2;
                              break j;
                            } else {
                              e2 = e2 << 1;
                              b2 = a2;
                            }
                          }
                          c[d2 >> 2] = j2;
                          c[j2 + 24 >> 2] = b2;
                          c[j2 + 12 >> 2] = j2;
                          c[j2 + 8 >> 2] = j2;
                          break f;
                        }
                      while (0);
                    u2 = b2 + 8 | 0;
                    v2 = c[u2 >> 2] | 0;
                    c[v2 + 12 >> 2] = j2;
                    c[u2 >> 2] = j2;
                    c[j2 + 8 >> 2] = v2;
                    c[j2 + 12 >> 2] = b2;
                    c[j2 + 24 >> 2] = 0;
                  }
                } else {
                  v2 = c[5416] | 0;
                  if ((v2 | 0) == 0 | g2 >>> 0 < v2 >>> 0)
                    c[5416] = g2;
                  c[5524] = g2;
                  c[5525] = h2;
                  c[5527] = 0;
                  c[5421] = c[5530];
                  c[5420] = -1;
                  c[5425] = 21688;
                  c[5424] = 21688;
                  c[5427] = 21696;
                  c[5426] = 21696;
                  c[5429] = 21704;
                  c[5428] = 21704;
                  c[5431] = 21712;
                  c[5430] = 21712;
                  c[5433] = 21720;
                  c[5432] = 21720;
                  c[5435] = 21728;
                  c[5434] = 21728;
                  c[5437] = 21736;
                  c[5436] = 21736;
                  c[5439] = 21744;
                  c[5438] = 21744;
                  c[5441] = 21752;
                  c[5440] = 21752;
                  c[5443] = 21760;
                  c[5442] = 21760;
                  c[5445] = 21768;
                  c[5444] = 21768;
                  c[5447] = 21776;
                  c[5446] = 21776;
                  c[5449] = 21784;
                  c[5448] = 21784;
                  c[5451] = 21792;
                  c[5450] = 21792;
                  c[5453] = 21800;
                  c[5452] = 21800;
                  c[5455] = 21808;
                  c[5454] = 21808;
                  c[5457] = 21816;
                  c[5456] = 21816;
                  c[5459] = 21824;
                  c[5458] = 21824;
                  c[5461] = 21832;
                  c[5460] = 21832;
                  c[5463] = 21840;
                  c[5462] = 21840;
                  c[5465] = 21848;
                  c[5464] = 21848;
                  c[5467] = 21856;
                  c[5466] = 21856;
                  c[5469] = 21864;
                  c[5468] = 21864;
                  c[5471] = 21872;
                  c[5470] = 21872;
                  c[5473] = 21880;
                  c[5472] = 21880;
                  c[5475] = 21888;
                  c[5474] = 21888;
                  c[5477] = 21896;
                  c[5476] = 21896;
                  c[5479] = 21904;
                  c[5478] = 21904;
                  c[5481] = 21912;
                  c[5480] = 21912;
                  c[5483] = 21920;
                  c[5482] = 21920;
                  c[5485] = 21928;
                  c[5484] = 21928;
                  c[5487] = 21936;
                  c[5486] = 21936;
                  v2 = h2 + -40 | 0;
                  t2 = g2 + 8 | 0;
                  t2 = (t2 & 7 | 0) == 0 ? 0 : 0 - t2 & 7;
                  u2 = g2 + t2 | 0;
                  t2 = v2 - t2 | 0;
                  c[5418] = u2;
                  c[5415] = t2;
                  c[u2 + 4 >> 2] = t2 | 1;
                  c[g2 + v2 + 4 >> 2] = 40;
                  c[5419] = c[5534];
                }
              while (0);
            b2 = c[5415] | 0;
            if (b2 >>> 0 > m2 >>> 0) {
              t2 = b2 - m2 | 0;
              c[5415] = t2;
              v2 = c[5418] | 0;
              u2 = v2 + m2 | 0;
              c[5418] = u2;
              c[u2 + 4 >> 2] = t2 | 1;
              c[v2 + 4 >> 2] = m2 | 3;
              v2 = v2 + 8 | 0;
              V = w2;
              return v2 | 0;
            }
          }
          c[(ao() | 0) >> 2] = 48;
          v2 = 0;
          V = w2;
          return v2 | 0;
        }
        function er(a2) {
          a2 = a2 | 0;
          var b2 = 0, d2 = 0, e2 = 0, f2 = 0, g2 = 0, h2 = 0, i2 = 0, j2 = 0;
          if (!a2)
            return;
          d2 = a2 + -8 | 0;
          f2 = c[5416] | 0;
          a2 = c[a2 + -4 >> 2] | 0;
          b2 = a2 & -8;
          j2 = d2 + b2 | 0;
          do
            if (!(a2 & 1)) {
              e2 = c[d2 >> 2] | 0;
              if (!(a2 & 3))
                return;
              h2 = d2 + (0 - e2) | 0;
              g2 = e2 + b2 | 0;
              if (h2 >>> 0 < f2 >>> 0)
                return;
              if ((c[5417] | 0) == (h2 | 0)) {
                a2 = j2 + 4 | 0;
                b2 = c[a2 >> 2] | 0;
                if ((b2 & 3 | 0) != 3) {
                  i2 = h2;
                  b2 = g2;
                  break;
                }
                c[5414] = g2;
                c[a2 >> 2] = b2 & -2;
                c[h2 + 4 >> 2] = g2 | 1;
                c[h2 + g2 >> 2] = g2;
                return;
              }
              d2 = e2 >>> 3;
              if (e2 >>> 0 < 256) {
                a2 = c[h2 + 8 >> 2] | 0;
                b2 = c[h2 + 12 >> 2] | 0;
                if ((b2 | 0) == (a2 | 0)) {
                  c[5412] = c[5412] & ~(1 << d2);
                  i2 = h2;
                  b2 = g2;
                  break;
                } else {
                  c[a2 + 12 >> 2] = b2;
                  c[b2 + 8 >> 2] = a2;
                  i2 = h2;
                  b2 = g2;
                  break;
                }
              }
              f2 = c[h2 + 24 >> 2] | 0;
              a2 = c[h2 + 12 >> 2] | 0;
              do
                if ((a2 | 0) == (h2 | 0)) {
                  b2 = h2 + 16 | 0;
                  d2 = b2 + 4 | 0;
                  a2 = c[d2 >> 2] | 0;
                  if (!a2) {
                    a2 = c[b2 >> 2] | 0;
                    if (!a2) {
                      a2 = 0;
                      break;
                    }
                  } else
                    b2 = d2;
                  while (1) {
                    e2 = a2 + 20 | 0;
                    d2 = c[e2 >> 2] | 0;
                    if (!d2) {
                      e2 = a2 + 16 | 0;
                      d2 = c[e2 >> 2] | 0;
                      if (!d2)
                        break;
                      else {
                        a2 = d2;
                        b2 = e2;
                      }
                    } else {
                      a2 = d2;
                      b2 = e2;
                    }
                  }
                  c[b2 >> 2] = 0;
                } else {
                  i2 = c[h2 + 8 >> 2] | 0;
                  c[i2 + 12 >> 2] = a2;
                  c[a2 + 8 >> 2] = i2;
                }
              while (0);
              if (f2) {
                b2 = c[h2 + 28 >> 2] | 0;
                d2 = 21952 + (b2 << 2) | 0;
                if ((c[d2 >> 2] | 0) == (h2 | 0)) {
                  c[d2 >> 2] = a2;
                  if (!a2) {
                    c[5413] = c[5413] & ~(1 << b2);
                    i2 = h2;
                    b2 = g2;
                    break;
                  }
                } else {
                  i2 = f2 + 16 | 0;
                  c[((c[i2 >> 2] | 0) == (h2 | 0) ? i2 : f2 + 20 | 0) >> 2] = a2;
                  if (!a2) {
                    i2 = h2;
                    b2 = g2;
                    break;
                  }
                }
                c[a2 + 24 >> 2] = f2;
                b2 = h2 + 16 | 0;
                d2 = c[b2 >> 2] | 0;
                if (d2 | 0) {
                  c[a2 + 16 >> 2] = d2;
                  c[d2 + 24 >> 2] = a2;
                }
                b2 = c[b2 + 4 >> 2] | 0;
                if (b2) {
                  c[a2 + 20 >> 2] = b2;
                  c[b2 + 24 >> 2] = a2;
                  i2 = h2;
                  b2 = g2;
                } else {
                  i2 = h2;
                  b2 = g2;
                }
              } else {
                i2 = h2;
                b2 = g2;
              }
            } else {
              i2 = d2;
              h2 = d2;
            }
          while (0);
          if (h2 >>> 0 >= j2 >>> 0)
            return;
          a2 = j2 + 4 | 0;
          e2 = c[a2 >> 2] | 0;
          if (!(e2 & 1))
            return;
          if (!(e2 & 2)) {
            if ((c[5418] | 0) == (j2 | 0)) {
              j2 = (c[5415] | 0) + b2 | 0;
              c[5415] = j2;
              c[5418] = i2;
              c[i2 + 4 >> 2] = j2 | 1;
              if ((i2 | 0) != (c[5417] | 0))
                return;
              c[5417] = 0;
              c[5414] = 0;
              return;
            }
            if ((c[5417] | 0) == (j2 | 0)) {
              j2 = (c[5414] | 0) + b2 | 0;
              c[5414] = j2;
              c[5417] = h2;
              c[i2 + 4 >> 2] = j2 | 1;
              c[h2 + j2 >> 2] = j2;
              return;
            }
            f2 = (e2 & -8) + b2 | 0;
            d2 = e2 >>> 3;
            do
              if (e2 >>> 0 < 256) {
                b2 = c[j2 + 8 >> 2] | 0;
                a2 = c[j2 + 12 >> 2] | 0;
                if ((a2 | 0) == (b2 | 0)) {
                  c[5412] = c[5412] & ~(1 << d2);
                  break;
                } else {
                  c[b2 + 12 >> 2] = a2;
                  c[a2 + 8 >> 2] = b2;
                  break;
                }
              } else {
                g2 = c[j2 + 24 >> 2] | 0;
                a2 = c[j2 + 12 >> 2] | 0;
                do
                  if ((a2 | 0) == (j2 | 0)) {
                    b2 = j2 + 16 | 0;
                    d2 = b2 + 4 | 0;
                    a2 = c[d2 >> 2] | 0;
                    if (!a2) {
                      a2 = c[b2 >> 2] | 0;
                      if (!a2) {
                        d2 = 0;
                        break;
                      }
                    } else
                      b2 = d2;
                    while (1) {
                      e2 = a2 + 20 | 0;
                      d2 = c[e2 >> 2] | 0;
                      if (!d2) {
                        e2 = a2 + 16 | 0;
                        d2 = c[e2 >> 2] | 0;
                        if (!d2)
                          break;
                        else {
                          a2 = d2;
                          b2 = e2;
                        }
                      } else {
                        a2 = d2;
                        b2 = e2;
                      }
                    }
                    c[b2 >> 2] = 0;
                    d2 = a2;
                  } else {
                    d2 = c[j2 + 8 >> 2] | 0;
                    c[d2 + 12 >> 2] = a2;
                    c[a2 + 8 >> 2] = d2;
                    d2 = a2;
                  }
                while (0);
                if (g2 | 0) {
                  a2 = c[j2 + 28 >> 2] | 0;
                  b2 = 21952 + (a2 << 2) | 0;
                  if ((c[b2 >> 2] | 0) == (j2 | 0)) {
                    c[b2 >> 2] = d2;
                    if (!d2) {
                      c[5413] = c[5413] & ~(1 << a2);
                      break;
                    }
                  } else {
                    e2 = g2 + 16 | 0;
                    c[((c[e2 >> 2] | 0) == (j2 | 0) ? e2 : g2 + 20 | 0) >> 2] = d2;
                    if (!d2)
                      break;
                  }
                  c[d2 + 24 >> 2] = g2;
                  a2 = j2 + 16 | 0;
                  b2 = c[a2 >> 2] | 0;
                  if (b2 | 0) {
                    c[d2 + 16 >> 2] = b2;
                    c[b2 + 24 >> 2] = d2;
                  }
                  a2 = c[a2 + 4 >> 2] | 0;
                  if (a2 | 0) {
                    c[d2 + 20 >> 2] = a2;
                    c[a2 + 24 >> 2] = d2;
                  }
                }
              }
            while (0);
            c[i2 + 4 >> 2] = f2 | 1;
            c[h2 + f2 >> 2] = f2;
            if ((i2 | 0) == (c[5417] | 0)) {
              c[5414] = f2;
              return;
            }
          } else {
            c[a2 >> 2] = e2 & -2;
            c[i2 + 4 >> 2] = b2 | 1;
            c[h2 + b2 >> 2] = b2;
            f2 = b2;
          }
          a2 = f2 >>> 3;
          if (f2 >>> 0 < 256) {
            d2 = 21688 + (a2 << 1 << 2) | 0;
            b2 = c[5412] | 0;
            a2 = 1 << a2;
            if (!(b2 & a2)) {
              c[5412] = b2 | a2;
              a2 = d2;
              b2 = d2 + 8 | 0;
            } else {
              b2 = d2 + 8 | 0;
              a2 = c[b2 >> 2] | 0;
            }
            c[b2 >> 2] = i2;
            c[a2 + 12 >> 2] = i2;
            c[i2 + 8 >> 2] = a2;
            c[i2 + 12 >> 2] = d2;
            return;
          }
          a2 = f2 >>> 8;
          if (a2)
            if (f2 >>> 0 > 16777215)
              e2 = 31;
            else {
              h2 = (a2 + 1048320 | 0) >>> 16 & 8;
              j2 = a2 << h2;
              g2 = (j2 + 520192 | 0) >>> 16 & 4;
              j2 = j2 << g2;
              e2 = (j2 + 245760 | 0) >>> 16 & 2;
              e2 = 14 - (g2 | h2 | e2) + (j2 << e2 >>> 15) | 0;
              e2 = f2 >>> (e2 + 7 | 0) & 1 | e2 << 1;
            }
          else
            e2 = 0;
          a2 = 21952 + (e2 << 2) | 0;
          c[i2 + 28 >> 2] = e2;
          c[i2 + 20 >> 2] = 0;
          c[i2 + 16 >> 2] = 0;
          b2 = c[5413] | 0;
          d2 = 1 << e2;
          a:
            do
              if (!(b2 & d2)) {
                c[5413] = b2 | d2;
                c[a2 >> 2] = i2;
                c[i2 + 24 >> 2] = a2;
                c[i2 + 12 >> 2] = i2;
                c[i2 + 8 >> 2] = i2;
              } else {
                a2 = c[a2 >> 2] | 0;
                b:
                  do
                    if ((c[a2 + 4 >> 2] & -8 | 0) != (f2 | 0)) {
                      e2 = f2 << ((e2 | 0) == 31 ? 0 : 25 - (e2 >>> 1) | 0);
                      while (1) {
                        d2 = a2 + 16 + (e2 >>> 31 << 2) | 0;
                        b2 = c[d2 >> 2] | 0;
                        if (!b2)
                          break;
                        if ((c[b2 + 4 >> 2] & -8 | 0) == (f2 | 0)) {
                          a2 = b2;
                          break b;
                        } else {
                          e2 = e2 << 1;
                          a2 = b2;
                        }
                      }
                      c[d2 >> 2] = i2;
                      c[i2 + 24 >> 2] = a2;
                      c[i2 + 12 >> 2] = i2;
                      c[i2 + 8 >> 2] = i2;
                      break a;
                    }
                  while (0);
                h2 = a2 + 8 | 0;
                j2 = c[h2 >> 2] | 0;
                c[j2 + 12 >> 2] = i2;
                c[h2 >> 2] = i2;
                c[i2 + 8 >> 2] = j2;
                c[i2 + 12 >> 2] = a2;
                c[i2 + 24 >> 2] = 0;
              }
            while (0);
          j2 = (c[5420] | 0) + -1 | 0;
          c[5420] = j2;
          if (j2 | 0)
            return;
          a2 = 22104;
          while (1) {
            a2 = c[a2 >> 2] | 0;
            if (!a2)
              break;
            else
              a2 = a2 + 8 | 0;
          }
          c[5420] = -1;
          return;
        }
        function fr(a2) {
          a2 = a2 | 0;
          var b2 = 0, d2 = 0, e2 = 0;
          e2 = a2 + 3 & -4;
          a2 = sr() | 0;
          b2 = c[a2 >> 2] | 0;
          d2 = b2 + e2 | 0;
          do
            if ((e2 | 0) < 1 | d2 >>> 0 > b2 >>> 0) {
              if (d2 >>> 0 > (R() | 0) >>> 0 ? (T(d2 | 0) | 0) == 0 : 0)
                break;
              c[a2 >> 2] = d2;
              e2 = b2;
              return e2 | 0;
            }
          while (0);
          c[(ao() | 0) >> 2] = 48;
          e2 = -1;
          return e2 | 0;
        }
        function gr(a2) {
          a2 = a2 | 0;
          var b2 = 0;
          b2 = V;
          V = V + a2 | 0;
          V = V + 15 & -16;
          return b2 | 0;
        }
        function hr(a2) {
          a2 = a2 | 0;
          V = a2;
        }
        function ir() {
          return V | 0;
        }
        function jr(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          var c2 = 0, d2 = 0, e2 = 0, f2 = 0;
          f2 = a2 & 65535;
          e2 = b2 & 65535;
          c2 = q(e2, f2) | 0;
          d2 = a2 >>> 16;
          a2 = (c2 >>> 16) + (q(e2, d2) | 0) | 0;
          e2 = b2 >>> 16;
          b2 = q(e2, f2) | 0;
          return (t((a2 >>> 16) + (q(e2, d2) | 0) + (((a2 & 65535) + b2 | 0) >>> 16) | 0), a2 + b2 << 16 | c2 & 65535 | 0) | 0;
        }
        function kr(a2, b2, c2, d2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          c2 = c2 | 0;
          d2 = d2 | 0;
          var e2 = 0, f2 = 0;
          e2 = a2;
          f2 = c2;
          c2 = jr(e2, f2) | 0;
          a2 = u() | 0;
          return (t((q(b2, f2) | 0) + (q(d2, e2) | 0) + a2 | a2 & 0 | 0), c2 | 0 | 0) | 0;
        }
        function lr(a2, b2, c2, d2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          c2 = c2 | 0;
          d2 = d2 | 0;
          c2 = a2 + c2 >>> 0;
          return (t(b2 + d2 + (c2 >>> 0 < a2 >>> 0 | 0) >>> 0 | 0), c2 | 0) | 0;
        }
        function mr(a2, b2, c2, d2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          c2 = c2 | 0;
          d2 = d2 | 0;
          d2 = b2 - d2 - (c2 >>> 0 > a2 >>> 0 | 0) >>> 0;
          return (t(d2 | 0), a2 - c2 >>> 0 | 0) | 0;
        }
        function nr(a2) {
          a2 = a2 | 0;
          return (a2 ? 31 - (r(a2 ^ a2 - 1) | 0) | 0 : 32) | 0;
        }
        function or(a2, b2, d2, e2, f2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          d2 = d2 | 0;
          e2 = e2 | 0;
          f2 = f2 | 0;
          var g2 = 0, h2 = 0, i2 = 0, j2 = 0, k2 = 0, l2 = 0, m2 = 0, n2 = 0, o2 = 0, p2 = 0;
          l2 = a2;
          j2 = b2;
          k2 = j2;
          h2 = d2;
          n2 = e2;
          i2 = n2;
          if (!k2) {
            g2 = (f2 | 0) != 0;
            if (!i2) {
              if (g2) {
                c[f2 >> 2] = (l2 >>> 0) % (h2 >>> 0);
                c[f2 + 4 >> 2] = 0;
              }
              n2 = 0;
              f2 = (l2 >>> 0) / (h2 >>> 0) >>> 0;
              return (t(n2 | 0), f2) | 0;
            } else {
              if (!g2) {
                n2 = 0;
                f2 = 0;
                return (t(n2 | 0), f2) | 0;
              }
              c[f2 >> 2] = a2 | 0;
              c[f2 + 4 >> 2] = b2 & 0;
              n2 = 0;
              f2 = 0;
              return (t(n2 | 0), f2) | 0;
            }
          }
          g2 = (i2 | 0) == 0;
          do
            if (h2) {
              if (!g2) {
                g2 = (r(i2 | 0) | 0) - (r(k2 | 0) | 0) | 0;
                if (g2 >>> 0 <= 31) {
                  m2 = g2 + 1 | 0;
                  i2 = 31 - g2 | 0;
                  b2 = g2 - 31 >> 31;
                  h2 = m2;
                  a2 = l2 >>> (m2 >>> 0) & b2 | k2 << i2;
                  b2 = k2 >>> (m2 >>> 0) & b2;
                  g2 = 0;
                  i2 = l2 << i2;
                  break;
                }
                if (!f2) {
                  n2 = 0;
                  f2 = 0;
                  return (t(n2 | 0), f2) | 0;
                }
                c[f2 >> 2] = a2 | 0;
                c[f2 + 4 >> 2] = j2 | b2 & 0;
                n2 = 0;
                f2 = 0;
                return (t(n2 | 0), f2) | 0;
              }
              g2 = h2 - 1 | 0;
              if (g2 & h2 | 0) {
                i2 = (r(h2 | 0) | 0) + 33 - (r(k2 | 0) | 0) | 0;
                p2 = 64 - i2 | 0;
                m2 = 32 - i2 | 0;
                j2 = m2 >> 31;
                o2 = i2 - 32 | 0;
                b2 = o2 >> 31;
                h2 = i2;
                a2 = m2 - 1 >> 31 & k2 >>> (o2 >>> 0) | (k2 << m2 | l2 >>> (i2 >>> 0)) & b2;
                b2 = b2 & k2 >>> (i2 >>> 0);
                g2 = l2 << p2 & j2;
                i2 = (k2 << p2 | l2 >>> (o2 >>> 0)) & j2 | l2 << m2 & i2 - 33 >> 31;
                break;
              }
              if (f2 | 0) {
                c[f2 >> 2] = g2 & l2;
                c[f2 + 4 >> 2] = 0;
              }
              if ((h2 | 0) == 1) {
                o2 = j2 | b2 & 0;
                p2 = a2 | 0 | 0;
                return (t(o2 | 0), p2) | 0;
              } else {
                p2 = nr(h2 | 0) | 0;
                o2 = k2 >>> (p2 >>> 0) | 0;
                p2 = k2 << 32 - p2 | l2 >>> (p2 >>> 0) | 0;
                return (t(o2 | 0), p2) | 0;
              }
            } else {
              if (g2) {
                if (f2 | 0) {
                  c[f2 >> 2] = (k2 >>> 0) % (h2 >>> 0);
                  c[f2 + 4 >> 2] = 0;
                }
                o2 = 0;
                p2 = (k2 >>> 0) / (h2 >>> 0) >>> 0;
                return (t(o2 | 0), p2) | 0;
              }
              if (!l2) {
                if (f2 | 0) {
                  c[f2 >> 2] = 0;
                  c[f2 + 4 >> 2] = (k2 >>> 0) % (i2 >>> 0);
                }
                o2 = 0;
                p2 = (k2 >>> 0) / (i2 >>> 0) >>> 0;
                return (t(o2 | 0), p2) | 0;
              }
              g2 = i2 - 1 | 0;
              if (!(g2 & i2)) {
                if (f2 | 0) {
                  c[f2 >> 2] = a2 | 0;
                  c[f2 + 4 >> 2] = g2 & k2 | b2 & 0;
                }
                o2 = 0;
                p2 = k2 >>> ((nr(i2 | 0) | 0) >>> 0);
                return (t(o2 | 0), p2) | 0;
              }
              g2 = (r(i2 | 0) | 0) - (r(k2 | 0) | 0) | 0;
              if (g2 >>> 0 <= 30) {
                b2 = g2 + 1 | 0;
                i2 = 31 - g2 | 0;
                h2 = b2;
                a2 = k2 << i2 | l2 >>> (b2 >>> 0);
                b2 = k2 >>> (b2 >>> 0);
                g2 = 0;
                i2 = l2 << i2;
                break;
              }
              if (!f2) {
                o2 = 0;
                p2 = 0;
                return (t(o2 | 0), p2) | 0;
              }
              c[f2 >> 2] = a2 | 0;
              c[f2 + 4 >> 2] = j2 | b2 & 0;
              o2 = 0;
              p2 = 0;
              return (t(o2 | 0), p2) | 0;
            }
          while (0);
          if (!h2) {
            k2 = i2;
            j2 = 0;
            i2 = 0;
          } else {
            m2 = d2 | 0 | 0;
            l2 = n2 | e2 & 0;
            k2 = lr(m2 | 0, l2 | 0, -1, -1) | 0;
            d2 = u() | 0;
            j2 = i2;
            i2 = 0;
            do {
              e2 = j2;
              j2 = g2 >>> 31 | j2 << 1;
              g2 = i2 | g2 << 1;
              e2 = a2 << 1 | e2 >>> 31 | 0;
              n2 = a2 >>> 31 | b2 << 1 | 0;
              mr(k2 | 0, d2 | 0, e2 | 0, n2 | 0) | 0;
              p2 = u() | 0;
              o2 = p2 >> 31 | ((p2 | 0) < 0 ? -1 : 0) << 1;
              i2 = o2 & 1;
              a2 = mr(
                e2 | 0,
                n2 | 0,
                o2 & m2 | 0,
                (((p2 | 0) < 0 ? -1 : 0) >> 31 | ((p2 | 0) < 0 ? -1 : 0) << 1) & l2 | 0
              ) | 0;
              b2 = u() | 0;
              h2 = h2 - 1 | 0;
            } while ((h2 | 0) != 0);
            k2 = j2;
            j2 = 0;
          }
          h2 = 0;
          if (f2 | 0) {
            c[f2 >> 2] = a2;
            c[f2 + 4 >> 2] = b2;
          }
          o2 = (g2 | 0) >>> 31 | (k2 | h2) << 1 | (h2 << 1 | g2 >>> 31) & 0 | j2;
          p2 = (g2 << 1 | 0 >>> 31) & -2 | i2;
          return (t(o2 | 0), p2) | 0;
        }
        function pr(a2, b2, c2, d2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          c2 = c2 | 0;
          d2 = d2 | 0;
          return or(a2, b2, c2, d2, 0) | 0;
        }
        function qr(a2, b2, c2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          c2 = c2 | 0;
          if ((c2 | 0) < 32) {
            t(b2 >>> c2 | 0);
            return a2 >>> c2 | (b2 & (1 << c2) - 1) << 32 - c2;
          }
          t(0);
          return b2 >>> c2 - 32 | 0;
        }
        function rr(a2, b2, c2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          c2 = c2 | 0;
          if ((c2 | 0) < 32) {
            t(b2 << c2 | (a2 & (1 << c2) - 1 << 32 - c2) >>> 32 - c2 | 0);
            return a2 << c2;
          }
          t(a2 << c2 - 32 | 0);
          return 0;
        }
        function sr() {
          return 22176;
        }
        function tr(a2) {
          a2 = a2 | 0;
          return (a2 & 255) << 24 | (a2 >> 8 & 255) << 16 | (a2 >> 16 & 255) << 8 | a2 >>> 24 | 0;
        }
        function ur(b2, d2, e2) {
          b2 = b2 | 0;
          d2 = d2 | 0;
          e2 = e2 | 0;
          var f2 = 0, g2 = 0, h2 = 0;
          if ((e2 | 0) >= 512) {
            S(b2 | 0, d2 | 0, e2 | 0) | 0;
            return b2 | 0;
          }
          h2 = b2 | 0;
          g2 = b2 + e2 | 0;
          if ((b2 & 3) == (d2 & 3)) {
            while (b2 & 3) {
              if (!e2)
                return h2 | 0;
              a[b2 >> 0] = a[d2 >> 0] | 0;
              b2 = b2 + 1 | 0;
              d2 = d2 + 1 | 0;
              e2 = e2 - 1 | 0;
            }
            e2 = g2 & -4 | 0;
            f2 = e2 - 64 | 0;
            while ((b2 | 0) <= (f2 | 0)) {
              c[b2 >> 2] = c[d2 >> 2];
              c[b2 + 4 >> 2] = c[d2 + 4 >> 2];
              c[b2 + 8 >> 2] = c[d2 + 8 >> 2];
              c[b2 + 12 >> 2] = c[d2 + 12 >> 2];
              c[b2 + 16 >> 2] = c[d2 + 16 >> 2];
              c[b2 + 20 >> 2] = c[d2 + 20 >> 2];
              c[b2 + 24 >> 2] = c[d2 + 24 >> 2];
              c[b2 + 28 >> 2] = c[d2 + 28 >> 2];
              c[b2 + 32 >> 2] = c[d2 + 32 >> 2];
              c[b2 + 36 >> 2] = c[d2 + 36 >> 2];
              c[b2 + 40 >> 2] = c[d2 + 40 >> 2];
              c[b2 + 44 >> 2] = c[d2 + 44 >> 2];
              c[b2 + 48 >> 2] = c[d2 + 48 >> 2];
              c[b2 + 52 >> 2] = c[d2 + 52 >> 2];
              c[b2 + 56 >> 2] = c[d2 + 56 >> 2];
              c[b2 + 60 >> 2] = c[d2 + 60 >> 2];
              b2 = b2 + 64 | 0;
              d2 = d2 + 64 | 0;
            }
            while ((b2 | 0) < (e2 | 0)) {
              c[b2 >> 2] = c[d2 >> 2];
              b2 = b2 + 4 | 0;
              d2 = d2 + 4 | 0;
            }
          } else {
            e2 = g2 - 4 | 0;
            while ((b2 | 0) < (e2 | 0)) {
              a[b2 >> 0] = a[d2 >> 0] | 0;
              a[b2 + 1 >> 0] = a[d2 + 1 >> 0] | 0;
              a[b2 + 2 >> 0] = a[d2 + 2 >> 0] | 0;
              a[b2 + 3 >> 0] = a[d2 + 3 >> 0] | 0;
              b2 = b2 + 4 | 0;
              d2 = d2 + 4 | 0;
            }
          }
          while ((b2 | 0) < (g2 | 0)) {
            a[b2 >> 0] = a[d2 >> 0] | 0;
            b2 = b2 + 1 | 0;
            d2 = d2 + 1 | 0;
          }
          return h2 | 0;
        }
        function vr(b2, c2, d2) {
          b2 = b2 | 0;
          c2 = c2 | 0;
          d2 = d2 | 0;
          var e2 = 0;
          if ((c2 | 0) < (b2 | 0) & (b2 | 0) < (c2 + d2 | 0)) {
            e2 = b2;
            c2 = c2 + d2 | 0;
            b2 = b2 + d2 | 0;
            while ((d2 | 0) > 0) {
              b2 = b2 - 1 | 0;
              c2 = c2 - 1 | 0;
              d2 = d2 - 1 | 0;
              a[b2 >> 0] = a[c2 >> 0] | 0;
            }
            b2 = e2;
          } else
            ur(b2, c2, d2) | 0;
          return b2 | 0;
        }
        function wr(b2, d2, e2) {
          b2 = b2 | 0;
          d2 = d2 | 0;
          e2 = e2 | 0;
          var f2 = 0, g2 = 0, h2 = 0, i2 = 0;
          h2 = b2 + e2 | 0;
          d2 = d2 & 255;
          if ((e2 | 0) >= 67) {
            while (b2 & 3) {
              a[b2 >> 0] = d2;
              b2 = b2 + 1 | 0;
            }
            f2 = h2 & -4 | 0;
            i2 = d2 | d2 << 8 | d2 << 16 | d2 << 24;
            g2 = f2 - 64 | 0;
            while ((b2 | 0) <= (g2 | 0)) {
              c[b2 >> 2] = i2;
              c[b2 + 4 >> 2] = i2;
              c[b2 + 8 >> 2] = i2;
              c[b2 + 12 >> 2] = i2;
              c[b2 + 16 >> 2] = i2;
              c[b2 + 20 >> 2] = i2;
              c[b2 + 24 >> 2] = i2;
              c[b2 + 28 >> 2] = i2;
              c[b2 + 32 >> 2] = i2;
              c[b2 + 36 >> 2] = i2;
              c[b2 + 40 >> 2] = i2;
              c[b2 + 44 >> 2] = i2;
              c[b2 + 48 >> 2] = i2;
              c[b2 + 52 >> 2] = i2;
              c[b2 + 56 >> 2] = i2;
              c[b2 + 60 >> 2] = i2;
              b2 = b2 + 64 | 0;
            }
            while ((b2 | 0) < (f2 | 0)) {
              c[b2 >> 2] = i2;
              b2 = b2 + 4 | 0;
            }
          }
          while ((b2 | 0) < (h2 | 0)) {
            a[b2 >> 0] = d2;
            b2 = b2 + 1 | 0;
          }
          return h2 - e2 | 0;
        }
        function xr(a2) {
          a2 = a2 | 0;
          return Y[a2 & 3]() | 0;
        }
        function yr(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          return Z[a2 & 15](b2 | 0) | 0;
        }
        function zr(a2, b2, c2, d2, e2, f2, g2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          c2 = +c2;
          d2 = d2 | 0;
          e2 = e2 | 0;
          f2 = f2 | 0;
          g2 = g2 | 0;
          return _[a2 & 1](b2 | 0, +c2, d2 | 0, e2 | 0, f2 | 0, g2 | 0) | 0;
        }
        function Ar(a2, b2, c2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          c2 = c2 | 0;
          return $[a2 & 63](b2 | 0, c2 | 0) | 0;
        }
        function Br(a2, b2, c2, d2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          c2 = c2 | 0;
          d2 = d2 | 0;
          return aa[a2 & 7](b2 | 0, c2 | 0, d2 | 0) | 0;
        }
        function Cr(a2) {
          a2 = a2 | 0;
          ba[a2 & 3]();
        }
        function Dr(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          ca[a2 & 255](b2 | 0);
        }
        function Er(a2, b2, c2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          c2 = c2 | 0;
          da[a2 & 15](b2 | 0, c2 | 0);
        }
        function Fr(a2, b2, c2, d2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          c2 = c2 | 0;
          d2 = d2 | 0;
          ea[a2 & 15](b2 | 0, c2 | 0, d2 | 0);
        }
        function Gr(a2, b2, c2, d2, e2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          c2 = c2 | 0;
          d2 = d2 | 0;
          e2 = e2 | 0;
          fa[a2 & 7](b2 | 0, c2 | 0, d2 | 0, e2 | 0);
        }
        function Hr(a2, b2, c2, d2, e2, f2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          c2 = c2 | 0;
          d2 = d2 | 0;
          e2 = e2 | 0;
          f2 = f2 | 0;
          ga[a2 & 3](b2 | 0, c2 | 0, d2 | 0, e2 | 0, f2 | 0);
        }
        function Ir(a2, b2, c2, d2, e2, f2, g2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          c2 = c2 | 0;
          d2 = d2 | 0;
          e2 = e2 | 0;
          f2 = f2 | 0;
          g2 = g2 | 0;
          ha[a2 & 3](b2 | 0, c2 | 0, d2 | 0, e2 | 0, f2 | 0, g2 | 0);
        }
        function Jr() {
          s(0);
          return 0;
        }
        function Kr(a2) {
          a2 = a2 | 0;
          s(1);
          return 0;
        }
        function Lr(a2, b2, c2, d2, e2, f2) {
          a2 = a2 | 0;
          b2 = +b2;
          c2 = c2 | 0;
          d2 = d2 | 0;
          e2 = e2 | 0;
          f2 = f2 | 0;
          s(2);
          return 0;
        }
        function Mr(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          s(3);
          return 0;
        }
        function Nr(a2, b2, c2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          c2 = c2 | 0;
          s(4);
          return 0;
        }
        function Or() {
          s(5);
        }
        function Pr(a2) {
          a2 = a2 | 0;
          s(6);
        }
        function Qr(a2, b2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          s(7);
        }
        function Rr(a2, b2, c2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          c2 = c2 | 0;
          s(8);
        }
        function Sr(a2, b2, c2, d2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          c2 = c2 | 0;
          d2 = d2 | 0;
          s(9);
        }
        function Tr(a2, b2, c2, d2, e2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          c2 = c2 | 0;
          d2 = d2 | 0;
          e2 = e2 | 0;
          s(10);
        }
        function Ur(a2, b2, c2, d2, e2, f2) {
          a2 = a2 | 0;
          b2 = b2 | 0;
          c2 = c2 | 0;
          d2 = d2 | 0;
          e2 = e2 | 0;
          f2 = f2 | 0;
          s(11);
        }
        var Y = [Jr, Mk, Fl, Jr];
        var Z = [Kr, Ap, zb, Fb, qp, tp, oq, Kq, Tq, wk, na, tl, Ok, Hl, Kr, Kr];
        var _ = [Lr, po];
        var $ = [
          Mr,
          Ba,
          Ka,
          Eb,
          jd,
          Nd,
          Xd,
          je,
          ke,
          ne,
          _e,
          ff,
          yf,
          Ff,
          Of,
          Vf,
          Hg,
          Qg,
          Zg,
          ch,
          lh,
          qh,
          zh,
          Eh,
          Nh,
          _h,
          fi,
          ki,
          si,
          Bi,
          Si,
          Zi,
          fj,
          oj,
          yj,
          Fj,
          Pj,
          Yj,
          ek,
          lk,
          tk,
          ll,
          Mr,
          Mr,
          Mr,
          Mr,
          Mr,
          Mr,
          Mr,
          Mr,
          Mr,
          Mr,
          Mr,
          Mr,
          Mr,
          Mr,
          Mr,
          Mr,
          Mr,
          Mr,
          Mr,
          Mr,
          Mr,
          Mr
        ];
        var aa = [Nr, Io, Yo, Fp, Hp, Mq, Nq, Nr];
        var ba = [Or, Dp, Po, Or];
        var ca = [
          Pr,
          pq,
          za,
          Aa,
          Ca,
          Ia,
          Ja,
          La,
          yp,
          ob,
          Gb,
          yb,
          Bb,
          Cb,
          Lb,
          Mb,
          Xb,
          Yb,
          sc,
          tc,
          uc,
          Nc,
          hd,
          id,
          kd,
          Jd,
          Od,
          Pd,
          Qd,
          Rd,
          Vd,
          Wd,
          Yd,
          he,
          ie,
          le,
          me,
          Ye,
          Ze,
          $e,
          df,
          ef,
          wf,
          xf,
          zf,
          Df,
          Ef,
          Mf,
          Nf,
          Pf,
          Tf,
          Uf,
          Fg,
          Gg,
          Ig,
          Rg,
          Sg,
          Xg,
          Yg,
          _g,
          dh,
          eh,
          jh,
          kh,
          mh,
          rh,
          sh,
          xh,
          yh,
          Ah,
          Fh,
          Gh,
          Lh,
          Mh,
          Oh,
          Yh,
          Zh,
          $h,
          di,
          ei,
          gi,
          li,
          mi,
          qi,
          ri,
          ti,
          zi,
          Ai,
          Qi,
          Ri,
          Ti,
          Xi,
          Yi,
          dj,
          ej,
          gj,
          mj,
          nj,
          wj,
          xj,
          zj,
          Dj,
          Ej,
          Nj,
          Oj,
          Qj,
          Wj,
          Xj,
          ck,
          dk,
          fk,
          jk,
          kk,
          rk,
          sk,
          uk,
          Uo,
          Vo,
          Wo,
          Xo,
          fp,
          op,
          pp,
          rp,
          sp,
          zp,
          Bp,
          Cp,
          Ep,
          Gp,
          Lp,
          mq,
          nq,
          Iq,
          Jq,
          Sq,
          Yq,
          Zq,
          zk,
          wl,
          Pr,
          Pr,
          Pr,
          Pr,
          Pr,
          Pr,
          Pr,
          Pr,
          Pr,
          Pr,
          Pr,
          Pr,
          Pr,
          Pr,
          Pr,
          Pr,
          Pr,
          Pr,
          Pr,
          Pr,
          Pr,
          Pr,
          Pr,
          Pr,
          Pr,
          Pr,
          Pr,
          Pr,
          Pr,
          Pr,
          Pr,
          Pr,
          Pr,
          Pr,
          Pr,
          Pr,
          Pr,
          Pr,
          Pr,
          Pr,
          Pr,
          Pr,
          Pr,
          Pr,
          Pr,
          Pr,
          Pr,
          Pr,
          Pr,
          Pr,
          Pr,
          Pr,
          Pr,
          Pr,
          Pr,
          Pr,
          Pr,
          Pr,
          Pr,
          Pr,
          Pr,
          Pr,
          Pr,
          Pr,
          Pr,
          Pr,
          Pr,
          Pr,
          Pr,
          Pr,
          Pr,
          Pr,
          Pr,
          Pr,
          Pr,
          Pr,
          Pr,
          Pr,
          Pr,
          Pr,
          Pr,
          Pr,
          Pr,
          Pr,
          Pr,
          Pr,
          Pr,
          Pr,
          Pr,
          Pr,
          Pr,
          Pr,
          Pr,
          Pr,
          Pr,
          Pr,
          Pr,
          Pr,
          Pr,
          Pr,
          Pr,
          Pr,
          Pr,
          Pr,
          Pr,
          Pr,
          Pr,
          Pr,
          Pr,
          Pr,
          Pr,
          Pr,
          Pr,
          Pr,
          Pr,
          Pr
        ];
        var da = [Qr, Ab, Db, ma, pa, qa, ra, sa, qo, Qr, Qr, Qr, Qr, Qr, Qr, Qr];
        var ea = [Rr, Lq, Oq, Uq, Vq, la, oa, dl, Vl, $l, Rr, Rr, Rr, Rr, Rr, Rr];
        var fa = [Sr, $o, ip, Op, Vk, Ol, Sr, Sr];
        var ga = [Tr, _o, hp, Np];
        var ha = [Ur, Zo, gp, Mp];
        return {
          __ZSt18uncaught_exceptionv: kq,
          ___cxa_can_catch: hq,
          ___cxa_is_pointer_type: iq,
          ___embind_register_native_and_builtin_types: im,
          ___errno_location: ao,
          ___getTypeName: $n,
          ___muldi3: kr,
          ___udivdi3: pr,
          _bitshift64Lshr: qr,
          _bitshift64Shl: rr,
          _emscripten_get_sbrk_ptr: sr,
          _free: er,
          _i64Add: lr,
          _i64Subtract: mr,
          _llvm_bswap_i32: tr,
          _malloc: dr,
          _memcpy: ur,
          _memmove: vr,
          _memset: wr,
          dynCall_i: xr,
          dynCall_ii: yr,
          dynCall_iidiiii: zr,
          dynCall_iii: Ar,
          dynCall_iiii: Br,
          dynCall_v: Cr,
          dynCall_vi: Dr,
          dynCall_vii: Er,
          dynCall_viii: Fr,
          dynCall_viiii: Gr,
          dynCall_viiiii: Hr,
          dynCall_viiiiii: Ir,
          globalCtors: ia,
          stackAlloc: gr,
          stackRestore: hr,
          stackSave: ir
        };
      }(
        // EMSCRIPTEN_END_ASM
        asmGlobalArg,
        asmLibraryArg,
        buffer
      )
    );
    var __ZSt18uncaught_exceptionv = Module2["__ZSt18uncaught_exceptionv"] = asm["__ZSt18uncaught_exceptionv"];
    var ___cxa_can_catch = Module2["___cxa_can_catch"] = asm["___cxa_can_catch"];
    var ___cxa_is_pointer_type = Module2["___cxa_is_pointer_type"] = asm["___cxa_is_pointer_type"];
    var ___embind_register_native_and_builtin_types = Module2["___embind_register_native_and_builtin_types"] = asm["___embind_register_native_and_builtin_types"];
    var ___errno_location = Module2["___errno_location"] = asm["___errno_location"];
    var ___getTypeName = Module2["___getTypeName"] = asm["___getTypeName"];
    var ___muldi3 = Module2["___muldi3"] = asm["___muldi3"];
    var ___udivdi3 = Module2["___udivdi3"] = asm["___udivdi3"];
    var _bitshift64Lshr = Module2["_bitshift64Lshr"] = asm["_bitshift64Lshr"];
    var _bitshift64Shl = Module2["_bitshift64Shl"] = asm["_bitshift64Shl"];
    var _emscripten_get_sbrk_ptr = Module2["_emscripten_get_sbrk_ptr"] = asm["_emscripten_get_sbrk_ptr"];
    var _free = Module2["_free"] = asm["_free"];
    var _i64Add = Module2["_i64Add"] = asm["_i64Add"];
    var _i64Subtract = Module2["_i64Subtract"] = asm["_i64Subtract"];
    var _llvm_bswap_i32 = Module2["_llvm_bswap_i32"] = asm["_llvm_bswap_i32"];
    var _malloc = Module2["_malloc"] = asm["_malloc"];
    var _memcpy = Module2["_memcpy"] = asm["_memcpy"];
    var _memmove = Module2["_memmove"] = asm["_memmove"];
    var _memset = Module2["_memset"] = asm["_memset"];
    var globalCtors = Module2["globalCtors"] = asm["globalCtors"];
    var stackAlloc = Module2["stackAlloc"] = asm["stackAlloc"];
    var stackRestore = Module2["stackRestore"] = asm["stackRestore"];
    var stackSave = Module2["stackSave"] = asm["stackSave"];
    var dynCall_i = Module2["dynCall_i"] = asm["dynCall_i"];
    var dynCall_ii = Module2["dynCall_ii"] = asm["dynCall_ii"];
    var dynCall_iidiiii = Module2["dynCall_iidiiii"] = asm["dynCall_iidiiii"];
    var dynCall_iii = Module2["dynCall_iii"] = asm["dynCall_iii"];
    var dynCall_iiii = Module2["dynCall_iiii"] = asm["dynCall_iiii"];
    var dynCall_v = Module2["dynCall_v"] = asm["dynCall_v"];
    var dynCall_vi = Module2["dynCall_vi"] = asm["dynCall_vi"];
    var dynCall_vii = Module2["dynCall_vii"] = asm["dynCall_vii"];
    var dynCall_viii = Module2["dynCall_viii"] = asm["dynCall_viii"];
    var dynCall_viiii = Module2["dynCall_viiii"] = asm["dynCall_viiii"];
    var dynCall_viiiii = Module2["dynCall_viiiii"] = asm["dynCall_viiiii"];
    var dynCall_viiiiii = Module2["dynCall_viiiiii"] = asm["dynCall_viiiiii"];
    Module2["asm"] = asm;
    if (memoryInitializer) {
      if (!isDataURI(memoryInitializer)) {
        memoryInitializer = locateFile(memoryInitializer);
      }
      if (ENVIRONMENT_IS_NODE || ENVIRONMENT_IS_SHELL) {
        var data = readBinary(memoryInitializer);
        HEAPU8.set(data, GLOBAL_BASE);
      } else {
        addRunDependency("memory initializer");
        var applyMemoryInitializer = function(data2) {
          if (data2.byteLength)
            data2 = new Uint8Array(data2);
          HEAPU8.set(data2, GLOBAL_BASE);
          if (Module2["memoryInitializerRequest"])
            delete Module2["memoryInitializerRequest"].response;
          removeRunDependency("memory initializer");
        };
        var doBrowserLoad = function() {
          readAsync(memoryInitializer, applyMemoryInitializer, function() {
            var e = new Error("could not load memory initializer " + memoryInitializer);
            throw e;
          });
        };
        var memoryInitializerBytes = tryParseAsDataURI(memoryInitializer);
        if (memoryInitializerBytes) {
          applyMemoryInitializer(memoryInitializerBytes.buffer);
        } else if (Module2["memoryInitializerRequest"]) {
          var useRequest = function() {
            var request = Module2["memoryInitializerRequest"];
            var response = request.response;
            if (request.status !== 200 && request.status !== 0) {
              var data2 = tryParseAsDataURI(Module2["memoryInitializerRequestURL"]);
              if (data2) {
                response = data2.buffer;
              } else {
                console.warn(
                  "a problem seems to have happened with Module.memoryInitializerRequest, status: " + request.status + ", retrying " + memoryInitializer
                );
                doBrowserLoad();
                return;
              }
            }
            applyMemoryInitializer(response);
          };
          if (Module2["memoryInitializerRequest"].response) {
            setTimeout(useRequest, 0);
          } else {
            Module2["memoryInitializerRequest"].addEventListener("load", useRequest);
          }
        } else {
          doBrowserLoad();
        }
      }
    }
    var calledRun;
    function ExitStatus(status) {
      this.name = "ExitStatus";
      this.message = "Program terminated with exit(" + status + ")";
      this.status = status;
    }
    dependenciesFulfilled = function runCaller() {
      if (!calledRun)
        run();
      if (!calledRun)
        dependenciesFulfilled = runCaller;
    };
    function run(args) {
      args = args || arguments_;
      if (runDependencies > 0) {
        return;
      }
      preRun();
      if (runDependencies > 0)
        return;
      function doRun() {
        if (calledRun)
          return;
        calledRun = true;
        Module2["calledRun"] = true;
        if (ABORT)
          return;
        initRuntime();
        preMain();
        if (Module2["onRuntimeInitialized"])
          Module2["onRuntimeInitialized"]();
        postRun();
      }
      if (Module2["setStatus"]) {
        Module2["setStatus"]("Running...");
        setTimeout(function() {
          setTimeout(function() {
            Module2["setStatus"]("");
          }, 1);
          doRun();
        }, 1);
      } else {
        doRun();
      }
    }
    Module2["run"] = run;
    if (Module2["preInit"]) {
      if (typeof Module2["preInit"] == "function")
        Module2["preInit"] = [Module2["preInit"]];
      while (Module2["preInit"].length > 0) {
        Module2["preInit"].pop()();
      }
    }
    noExitRuntime = true;
    run();
    return Module2;
  }

  // src/lib/laslaz-decoder.ts
  var Module = null;
  var POINT_FORMAT_READERS = {
    0: (dv) => {
      return {
        position: [dv.getInt32(0, true), dv.getInt32(4, true), dv.getInt32(8, true)],
        intensity: dv.getUint16(12, true),
        classification: dv.getUint8(15)
      };
    },
    1: (dv) => {
      return {
        position: [dv.getInt32(0, true), dv.getInt32(4, true), dv.getInt32(8, true)],
        intensity: dv.getUint16(12, true),
        classification: dv.getUint8(15)
      };
    },
    2: (dv) => {
      return {
        position: [dv.getInt32(0, true), dv.getInt32(4, true), dv.getInt32(8, true)],
        intensity: dv.getUint16(12, true),
        classification: dv.getUint8(15),
        color: [dv.getUint16(20, true), dv.getUint16(22, true), dv.getUint16(24, true)]
      };
    },
    3: (dv) => {
      return {
        position: [dv.getInt32(0, true), dv.getInt32(4, true), dv.getInt32(8, true)],
        intensity: dv.getUint16(12, true),
        classification: dv.getUint8(15),
        color: [dv.getUint16(28, true), dv.getUint16(30, true), dv.getUint16(32, true)]
      };
    }
  };
  function readAs(buf, Type = {}, offset, count) {
    count = count === void 0 || count === 0 ? 1 : count;
    const sub = buf.slice(offset, offset + Type.BYTES_PER_ELEMENT * count);
    const r = new Type(sub);
    if (count === 1) {
      return r[0];
    }
    const ret = [];
    for (let i = 0; i < count; i++) {
      ret.push(r[i]);
    }
    return ret;
  }
  function parseLASHeader(arraybuffer) {
    let start = 32 * 3 + 35;
    const o = {
      pointsOffset: readAs(arraybuffer, Uint32Array, 32 * 3),
      pointsFormatId: readAs(arraybuffer, Uint8Array, 32 * 3 + 8),
      pointsStructSize: readAs(arraybuffer, Uint16Array, 32 * 3 + 8 + 1),
      pointsCount: readAs(arraybuffer, Uint32Array, 32 * 3 + 11),
      scale: readAs(arraybuffer, Float64Array, start, 3)
    };
    start += 24;
    o.offset = readAs(arraybuffer, Float64Array, start, 3);
    start += 24;
    const bounds = readAs(arraybuffer, Float64Array, start, 6);
    start += 48;
    o.maxs = [bounds[0], bounds[2], bounds[4]];
    o.mins = [bounds[1], bounds[3], bounds[5]];
    return o;
  }
  var LASLoader2 = class {
    arraybuffer;
    readOffset = 0;
    header = {
      pointsOffset: 0,
      pointsFormatId: 0,
      pointsStructSize: 0,
      pointsCount: 0,
      scale: [0, 0, 0],
      offset: [0, 0, 0],
      maxs: [0],
      mins: [0],
      totalToRead: 0,
      totalRead: 0,
      versionAsString: "",
      isCompressed: true
    };
    constructor(arraybuffer) {
      this.arraybuffer = arraybuffer;
    }
    /**
     * @returns boolean
     */
    open() {
      return true;
    }
    /**
     * Parsing of incoming binary
     * @returns LASHeader
     */
    getHeader() {
      this.header = parseLASHeader(this.arraybuffer);
      return this.header;
    }
    /**
     * Reading data
     * @param count
     * @param skip
     * @returns new ArrayBuffer, count, hasMoreData
     */
    readData(count, skip) {
      const { header, arraybuffer } = this;
      if (!header) {
        throw new Error("Cannot start reading data till a header request is issued");
      }
      let { readOffset } = this;
      let start;
      if (skip <= 1) {
        count = Math.min(count, header.pointsCount - readOffset);
        start = header.pointsOffset + readOffset * header.pointsStructSize;
        const end = start + count * header.pointsStructSize;
        readOffset += count;
        this.readOffset = readOffset;
        return {
          buffer: arraybuffer.slice(start, end),
          count,
          hasMoreData: readOffset < header.pointsCount
        };
      }
      const pointsToRead = Math.min(count * skip, header.pointsCount - readOffset);
      const bufferSize = Math.ceil(pointsToRead / skip);
      let pointsRead = 0;
      const buf = new Uint8Array(bufferSize * header.pointsStructSize);
      for (let i = 0; i < pointsToRead; i++) {
        if (i % skip === 0) {
          start = header.pointsOffset + readOffset * header.pointsStructSize;
          const src = new Uint8Array(arraybuffer, start, header.pointsStructSize);
          buf.set(src, pointsRead * header.pointsStructSize);
          pointsRead++;
        }
        readOffset++;
      }
      this.readOffset = readOffset;
      return {
        buffer: buf.buffer,
        count: pointsRead,
        hasMoreData: readOffset < header.pointsCount
      };
    }
    /**
     * Method which brings data to null to close the file
     * @returns
     */
    close() {
      this.arraybuffer = null;
      return true;
    }
  };
  var LAZLoader = class {
    arraybuffer;
    instance = null;
    // LASZip instance
    header = null;
    constructor(arraybuffer) {
      this.arraybuffer = arraybuffer;
      if (!Module) {
        Module = getModule();
      }
    }
    /**
     * Opens the file
     * @returns boolean
     */
    open() {
      try {
        const { arraybuffer } = this;
        this.instance = new Module.LASZip();
        const abInt = new Uint8Array(arraybuffer);
        const buf = Module._malloc(arraybuffer.byteLength);
        this.instance.arraybuffer = arraybuffer;
        this.instance.buf = buf;
        Module.HEAPU8.set(abInt, buf);
        this.instance.open(buf, arraybuffer.byteLength);
        this.instance.readOffset = 0;
        return true;
      } catch (error) {
        throw new Error(`Failed to open file: ${error.message}`);
      }
    }
    getHeader() {
      if (!this.instance) {
        throw new Error("You need to open the file before trying to read header");
      }
      try {
        const header = parseLASHeader(this.instance.arraybuffer);
        header.pointsFormatId &= 63;
        this.header = header;
        return header;
      } catch (error) {
        throw new Error(`Failed to get header: ${error.message}`);
      }
    }
    /**
     * @param count
     * @param offset
     * @param skip
     * @returns Data
     */
    readData(count, offset, skip) {
      if (!this.instance) {
        throw new Error("You need to open the file before trying to read stuff");
      }
      const { header, instance } = this;
      if (!header) {
        throw new Error(
          "You need to query header before reading, I maintain state that way, sorry :("
        );
      }
      try {
        const pointsToRead = Math.min(count * skip, header.pointsCount - instance.readOffset);
        const bufferSize = Math.ceil(pointsToRead / skip);
        let pointsRead = 0;
        const thisBuf = new Uint8Array(bufferSize * header.pointsStructSize);
        const bufRead = Module._malloc(header.pointsStructSize);
        for (let i = 0; i < pointsToRead; i++) {
          instance.getPoint(bufRead);
          if (i % skip === 0) {
            const a = new Uint8Array(Module.HEAPU8.buffer, bufRead, header.pointsStructSize);
            thisBuf.set(a, pointsRead * header.pointsStructSize);
            pointsRead++;
          }
          instance.readOffset++;
        }
        Module._free(bufRead);
        return {
          buffer: thisBuf.buffer,
          count: pointsRead,
          hasMoreData: instance.readOffset < header.pointsCount
        };
      } catch (error) {
        throw new Error(`Failed to read data: ${error.message}`);
      }
    }
    /**
     * Deletes the instance
     * @returns boolean
     */
    close() {
      try {
        if (this.instance !== null) {
          Module._free(this.instance.buf);
          this.instance.delete();
          this.instance = null;
        }
        return true;
      } catch (error) {
        throw new Error(`Failed to close file: ${error.message}`);
      }
    }
  };
  var LASDecoder = class {
    arrayb;
    decoder;
    pointsCount;
    pointSize;
    scale;
    offset;
    mins;
    maxs;
    constructor(buffer, len, header) {
      this.arrayb = buffer;
      this.decoder = POINT_FORMAT_READERS[header.pointsFormatId];
      this.pointsCount = len;
      this.pointSize = header.pointsStructSize;
      this.scale = header.scale;
      this.offset = header.offset;
      this.mins = header.mins;
      this.maxs = header.maxs;
    }
    /**
     * Decodes data depends on this point size
     * @param index
     * @returns New object
     */
    getPoint(index) {
      if (index < 0 || index >= this.pointsCount) {
        throw new Error("Point index out of range");
      }
      const dv = new DataView(this.arrayb, index * this.pointSize, this.pointSize);
      return this.decoder(dv);
    }
  };
  var LASFile = class {
    arraybuffer;
    formatId = 0;
    loader;
    isCompressed = true;
    isOpen = false;
    version = 0;
    versionAsString = "";
    constructor(arraybuffer) {
      this.arraybuffer = arraybuffer;
      if (this.determineVersion() > 13) {
        throw new Error("Only file versions <= 1.3 are supported at this time");
      }
      this.determineFormat();
      if (POINT_FORMAT_READERS[this.formatId] === void 0) {
        throw new Error("The point format ID is not supported");
      }
      this.loader = this.isCompressed ? new LAZLoader(this.arraybuffer) : new LASLoader2(this.arraybuffer);
    }
    /**
     * Determines format in parameters of LASHeaer
     */
    determineFormat() {
      const formatId = readAs(this.arraybuffer, Uint8Array, 32 * 3 + 8);
      const bit7 = (formatId & 128) >> 7;
      const bit6 = (formatId & 64) >> 6;
      if (bit7 === 1 && bit6 === 1) {
        throw new Error("Old style compression not supported");
      }
      this.formatId = formatId & 63;
      this.isCompressed = bit7 === 1 || bit6 === 1;
    }
    /**
     * Determines version
     * @returns version
     */
    determineVersion() {
      const ver = new Int8Array(this.arraybuffer, 24, 2);
      this.version = ver[0] * 10 + ver[1];
      this.versionAsString = `${ver[0]}.${ver[1]}`;
      return this.version;
    }
    /**
     * Reads if the file is open
     * @returns boolean
     */
    open() {
      if (this.loader.open()) {
        this.isOpen = true;
      }
    }
    /**
     * Gets the header
     * @returns Header
     */
    getHeader() {
      return this.loader.getHeader();
    }
    /**
     * @param count
     * @param start
     * @param skip
     * @returns Data
     */
    readData(count, start, skip) {
      return this.loader.readData(count, start, skip);
    }
    /**
     * Closes the file
     */
    close() {
      if (this.loader.close()) {
        this.isOpen = false;
      }
    }
    /**
     */
    getUnpacker() {
      return LASDecoder;
    }
  };

  // src/lib/get-las-schema.ts
  function getLASSchema(lasHeader, attributes) {
    const metadataMap = makeMetadataFromLasHeader(lasHeader);
    const schema = deduceMeshSchema(attributes, metadataMap);
    return schema;
  }
  function makeMetadataFromLasHeader(lasHeader) {
    const metadata = {};
    metadata.las_pointsOffset = lasHeader.pointsOffset.toString(10);
    metadata.las_pointsFormatId = lasHeader.pointsFormatId.toString(10);
    metadata.las_pointsStructSize = lasHeader.pointsStructSize.toString(10);
    metadata.las_pointsCount = lasHeader.pointsCount.toString(10);
    metadata.las_scale = JSON.stringify(lasHeader.scale);
    metadata.las_offset = JSON.stringify(lasHeader.offset);
    if (lasHeader.maxs !== void 0) {
      metadata.las_maxs = JSON.stringify(lasHeader.maxs);
    }
    if (lasHeader.mins !== void 0) {
      metadata.las_mins = JSON.stringify(lasHeader.mins);
    }
    metadata.las_totalToRead = lasHeader.totalToRead.toString(10);
    metadata.las_pointsFortotalReadmatId = lasHeader.totalRead.toString(10);
    if (lasHeader.versionAsString !== void 0) {
      metadata.las_versionAsString = lasHeader.versionAsString;
    }
    if (lasHeader.isCompressed !== void 0) {
      metadata.las_isCompressed = lasHeader.isCompressed.toString();
    }
    return metadata;
  }

  // src/lib/parse-las.ts
  function parseLAS(arrayBuffer, options) {
    return parseLASMesh(arrayBuffer, options);
  }
  function parseLASMesh(arrayBuffer, options = {}) {
    let pointIndex = 0;
    let positions;
    let colors;
    let intensities;
    let classifications;
    let originalHeader;
    const lasMesh = {
      loader: "las",
      loaderData: {},
      // shape: 'mesh',
      schema: { fields: [], metadata: {} },
      header: {
        vertexCount: 0,
        boundingBox: [
          [0, 0, 0],
          [0, 0, 0]
        ]
      },
      attributes: {},
      topology: "point-list",
      mode: 0
      // GL.POINTS
    };
    parseLASChunked(arrayBuffer, options.las?.skip, (decoder = {}, lasHeader) => {
      if (!originalHeader) {
        originalHeader = lasHeader;
        const total = lasHeader.totalToRead;
        const PositionsType = options.las?.fp64 ? Float64Array : Float32Array;
        positions = new PositionsType(total * 3);
        colors = lasHeader.pointsFormatId >= 2 ? new Uint8Array(total * 4) : null;
        intensities = new Uint16Array(total);
        classifications = new Uint8Array(total);
        lasMesh.loaderData = lasHeader;
        lasMesh.attributes = {
          POSITION: { value: positions, size: 3 },
          // non-gltf attributes, use non-capitalized names for now
          intensity: { value: intensities, size: 1 },
          classification: { value: classifications, size: 1 }
        };
        if (colors) {
          lasMesh.attributes.COLOR_0 = { value: colors, size: 4 };
        }
      }
      const batchSize = decoder.pointsCount;
      const {
        scale: [scaleX, scaleY, scaleZ],
        offset: [offsetX, offsetY, offsetZ]
      } = lasHeader;
      const twoByteColor = detectTwoByteColors(decoder, batchSize, options.las?.colorDepth);
      for (let i = 0; i < batchSize; i++) {
        const { position, color, intensity, classification } = decoder.getPoint(i);
        positions[pointIndex * 3] = position[0] * scaleX + offsetX;
        positions[pointIndex * 3 + 1] = position[1] * scaleY + offsetY;
        positions[pointIndex * 3 + 2] = position[2] * scaleZ + offsetZ;
        if (color && colors) {
          if (twoByteColor) {
            colors[pointIndex * 4] = color[0] / 256;
            colors[pointIndex * 4 + 1] = color[1] / 256;
            colors[pointIndex * 4 + 2] = color[2] / 256;
          } else {
            colors[pointIndex * 4] = color[0];
            colors[pointIndex * 4 + 1] = color[1];
            colors[pointIndex * 4 + 2] = color[2];
          }
          colors[pointIndex * 4 + 3] = 255;
        }
        intensities[pointIndex] = intensity;
        classifications[pointIndex] = classification;
        pointIndex++;
      }
      const meshBatch = {
        ...lasMesh,
        header: {
          vertexCount: lasHeader.totalRead
        },
        progress: lasHeader.totalRead / lasHeader.totalToRead
      };
      options?.onProgress?.(meshBatch);
    });
    lasMesh.header = {
      vertexCount: originalHeader.totalToRead,
      boundingBox: getMeshBoundingBox(lasMesh?.attributes || {})
    };
    if (lasMesh) {
      lasMesh.schema = getLASSchema(lasMesh.loaderData, lasMesh.attributes);
    }
    return lasMesh;
  }
  function parseLASChunked(rawData, skip, onParseData = {}) {
    const dataHandler = new LASFile(rawData);
    try {
      dataHandler.open();
      const header = dataHandler.getHeader();
      const Unpacker = dataHandler.getUnpacker();
      const totalToRead = Math.ceil(header.pointsCount / Math.max(1, skip));
      header.totalToRead = totalToRead;
      let totalRead = 0;
      while (true) {
        const chunk = dataHandler.readData(1e3 * 100, 0, skip);
        totalRead += chunk.count;
        header.totalRead = totalRead;
        header.versionAsString = chunk.versionAsString;
        header.isCompressed = chunk.isCompressed;
        const unpacker = new Unpacker(chunk.buffer, chunk.count, header);
        onParseData(unpacker, header);
        if (!chunk.hasMoreData || totalRead >= totalToRead) {
          break;
        }
      }
    } catch (e) {
      throw e;
    } finally {
      dataHandler.close();
    }
  }
  function detectTwoByteColors(decoder = {}, batchSize, colorDepth) {
    let twoByteColor = false;
    switch (colorDepth) {
      case 8:
        twoByteColor = false;
        break;
      case 16:
        twoByteColor = true;
        break;
      case "auto":
        if (decoder.getPoint(0).color) {
          for (let i = 0; i < batchSize; i++) {
            const { color } = decoder.getPoint(i);
            if (color[0] > 255 || color[1] > 255 || color[2] > 255) {
              twoByteColor = true;
            }
          }
        }
        break;
      default:
        console.warn("las: illegal value for options.las.colorDepth");
        break;
    }
    return twoByteColor;
  }

  // src/index.ts
  var LASLoader3 = {
    ...LASLoader,
    parse: async (arrayBuffer, options) => parseLAS(arrayBuffer, options),
    parseSync: (arrayBuffer, options) => parseLAS(arrayBuffer, options)
  };

  // src/workers/las-worker.ts
  createLoaderWorker(LASLoader3);
})();
