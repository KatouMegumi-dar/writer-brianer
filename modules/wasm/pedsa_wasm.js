/* @ts-self-types="./pedsa_wasm.d.ts" */

/**
 * 实体类型常量
 * @enum {0 | 1 | 2 | 3 | 4 | 5 | 6}
 */
export const EntityType = Object.freeze({
    Unknown: 0, "0": "Unknown",
    Person: 1, "1": "Person",
    Tech: 2, "2": "Tech",
    Event: 3, "3": "Event",
    Location: 4, "4": "Location",
    Object: 5, "5": "Object",
    Values: 6, "6": "Values",
});

export class PedsaEngine {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        PedsaEngineFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_pedsaengine_free(ptr, 0);
    }
    /**
     * 添加边
     * @param {bigint} src
     * @param {bigint} tgt
     * @param {number} weight
     */
    add_edge(src, tgt, weight) {
        wasm.pedsaengine_add_edge(this.__wbg_ptr, src, tgt, weight);
    }
    /**
     * 添加事件节点
     * @param {bigint} id
     * @param {string} content
     * @param {bigint} timestamp
     * @param {number} emotions
     */
    add_event(id, content, timestamp, emotions) {
        const ptr0 = passStringToWasm0(content, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.pedsaengine_add_event(this.__wbg_ptr, id, ptr0, len0, timestamp, emotions);
    }
    /**
     * 添加特征节点
     * @param {bigint} id
     * @param {string} keyword
     */
    add_feature(id, keyword) {
        const ptr0 = passStringToWasm0(keyword, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.pedsaengine_add_feature(this.__wbg_ptr, id, ptr0, len0);
    }
    /**
     * 添加定义库边
     * @param {string} src
     * @param {string} tgt
     * @param {number} weight
     * @param {boolean} is_equality
     */
    add_ontology_edge(src, tgt, weight, is_equality) {
        const ptr0 = passStringToWasm0(src, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(tgt, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        wasm.pedsaengine_add_ontology_edge(this.__wbg_ptr, ptr0, len0, ptr1, len1, weight, is_equality);
    }
    /**
     * 构建时序脊梁
     */
    build_temporal_backbone() {
        wasm.pedsaengine_build_temporal_backbone(this.__wbg_ptr);
    }
    /**
     * 编译引擎（构建 AC 自动机和索引）
     */
    compile() {
        wasm.pedsaengine_compile(this.__wbg_ptr);
    }
    /**
     * 获取边数量
     * @returns {number}
     */
    edge_count() {
        const ret = wasm.pedsaengine_edge_count(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * 导出所有节点（JSON 格式）
     * @returns {string}
     */
    export_nodes_json() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.pedsaengine_export_nodes_json(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * 批量导入事件（JSON 格式）
     * @param {string} json
     * @returns {boolean}
     */
    import_events_json(json) {
        const ptr0 = passStringToWasm0(json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.pedsaengine_import_events_json(this.__wbg_ptr, ptr0, len0);
        return ret !== 0;
    }
    /**
     * 创建新引擎
     */
    constructor() {
        const ret = wasm.pedsaengine_new();
        this.__wbg_ptr = ret >>> 0;
        PedsaEngineFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * 获取节点数量
     * @returns {number}
     */
    node_count() {
        const ret = wasm.pedsaengine_node_count(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * 检索（返回 JSON 字符串）
     * @param {string} query
     * @param {number} top_k
     * @returns {string}
     */
    retrieve(query, top_k) {
        let deferred2_0;
        let deferred2_1;
        try {
            const ptr0 = passStringToWasm0(query, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.pedsaengine_retrieve(this.__wbg_ptr, ptr0, len0, top_k);
            deferred2_0 = ret[0];
            deferred2_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
        }
    }
}
if (Symbol.dispose) PedsaEngine.prototype[Symbol.dispose] = PedsaEngine.prototype.free;

/**
 * @returns {number}
 */
export function emotion_anger() {
    const ret = wasm.emotion_anger();
    return ret;
}

/**
 * @returns {number}
 */
export function emotion_anticipation() {
    const ret = wasm.emotion_anticipation();
    return ret;
}

/**
 * @returns {number}
 */
export function emotion_disgust() {
    const ret = wasm.emotion_disgust();
    return ret;
}

/**
 * @returns {number}
 */
export function emotion_fear() {
    const ret = wasm.emotion_fear();
    return ret;
}

/**
 * @returns {number}
 */
export function emotion_joy() {
    const ret = wasm.emotion_joy();
    return ret;
}

/**
 * @returns {number}
 */
export function emotion_sadness() {
    const ret = wasm.emotion_sadness();
    return ret;
}

/**
 * @returns {number}
 */
export function emotion_shy() {
    const ret = wasm.emotion_shy();
    return ret;
}

/**
 * @returns {number}
 */
export function emotion_surprise() {
    const ret = wasm.emotion_surprise();
    return ret;
}

/**
 * 控制台日志（调试用）
 * @param {string} s
 */
export function log(s) {
    const ptr0 = passStringToWasm0(s, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.log(ptr0, len0);
}

/**
 * 获取版本
 * @returns {string}
 */
export function version() {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.version();
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}

function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg___wbindgen_throw_be289d5034ed271b: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
        __wbg_getRandomValues_1c61fac11405ffdc: function() { return handleError(function (arg0, arg1) {
            globalThis.crypto.getRandomValues(getArrayU8FromWasm0(arg0, arg1));
        }, arguments); },
        __wbg_log_6b5ca2e6124b2808: function(arg0) {
            console.log(arg0);
        },
        __wbindgen_cast_0000000000000001: function(arg0, arg1) {
            // Cast intrinsic for `Ref(String) -> Externref`.
            const ret = getStringFromWasm0(arg0, arg1);
            return ret;
        },
        __wbindgen_init_externref_table: function() {
            const table = wasm.__wbindgen_externrefs;
            const offset = table.grow(4);
            table.set(0, undefined);
            table.set(offset + 0, undefined);
            table.set(offset + 1, null);
            table.set(offset + 2, true);
            table.set(offset + 3, false);
        },
    };
    return {
        __proto__: null,
        "./pedsa_wasm_bg.js": import0,
    };
}

const PedsaEngineFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_pedsaengine_free(ptr >>> 0, 1));

function addToExternrefTable0(obj) {
    const idx = wasm.__externref_table_alloc();
    wasm.__wbindgen_externrefs.set(idx, obj);
    return idx;
}

function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}

function getStringFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return decodeText(ptr, len);
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function handleError(f, args) {
    try {
        return f.apply(this, args);
    } catch (e) {
        const idx = addToExternrefTable0(e);
        wasm.__wbindgen_exn_store(idx);
    }
}

function passStringToWasm0(arg, malloc, realloc) {
    if (realloc === undefined) {
        const buf = cachedTextEncoder.encode(arg);
        const ptr = malloc(buf.length, 1) >>> 0;
        getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;

    const mem = getUint8ArrayMemory0();

    let offset = 0;

    for (; offset < len; offset++) {
        const code = arg.charCodeAt(offset);
        if (code > 0x7F) break;
        mem[ptr + offset] = code;
    }
    if (offset !== len) {
        if (offset !== 0) {
            arg = arg.slice(offset);
        }
        ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
        const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
        const ret = cachedTextEncoder.encodeInto(arg, view);

        offset += ret.written;
        ptr = realloc(ptr, len, offset, 1) >>> 0;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(ptr, len) {
    numBytesDecoded += len;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
        cachedTextDecoder.decode();
        numBytesDecoded = len;
    }
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

const cachedTextEncoder = new TextEncoder();

if (!('encodeInto' in cachedTextEncoder)) {
    cachedTextEncoder.encodeInto = function (arg, view) {
        const buf = cachedTextEncoder.encode(arg);
        view.set(buf);
        return {
            read: arg.length,
            written: buf.length
        };
    };
}

let WASM_VECTOR_LEN = 0;

let wasmModule, wasm;
function __wbg_finalize_init(instance, module) {
    wasm = instance.exports;
    wasmModule = module;
    cachedUint8ArrayMemory0 = null;
    wasm.__wbindgen_start();
    return wasm;
}

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);
            } catch (e) {
                const validResponse = module.ok && expectedResponseType(module.type);

                if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else { throw e; }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);
    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };
        } else {
            return instance;
        }
    }

    function expectedResponseType(type) {
        switch (type) {
            case 'basic': case 'cors': case 'default': return true;
        }
        return false;
    }
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (module !== undefined) {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports();
    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }
    const instance = new WebAssembly.Instance(module, imports);
    return __wbg_finalize_init(instance, module);
}

async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;


    if (module_or_path !== undefined) {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }

    if (module_or_path === undefined) {
        module_or_path = new URL('pedsa_wasm_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync, __wbg_init as default };
