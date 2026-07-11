/* @ts-self-types="./talos_forge_wasm.d.ts" */

export class Forge {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        ForgeFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_forge_free(ptr, 0);
    }
    /**
     * Modell-Steckbrief als JSON (für die UI).
     * @returns {string}
     */
    info() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.forge_info(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Parse GGUF bytes and build the model (config + tokenizer + weights).
     * @param {Uint8Array} bytes
     */
    constructor(bytes) {
        const ptr0 = passArray8ToWasm0(bytes, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.forge_new(ptr0, len0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        this.__wbg_ptr = ret[0];
        ForgeFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * One decode step. Returns the newly completed text for this token, or
     * `None` when the generation is finished (EOS, budget, or context full).
     * Bei erschöpftem Budget bleibt die Session bestehen — `resume` kann sie
     * ohne erneuten Prefill fortsetzen; EOS und volles Kontextfenster sind final.
     * @returns {string | undefined}
     */
    next_chunk() {
        const ret = wasm.forge_next_chunk(this.__wbg_ptr);
        let v1;
        if (ret[0] !== 0) {
            v1 = getStringFromWasm0(ret[0], ret[1]).slice();
            wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        }
        return v1;
    }
    /**
     * Speist bis zu `max` Prompt-Tokens ins Modell und gibt zurück, wie
     * viele noch fehlen. `prefill(0)` fragt nur den Reststand ab — auch
     * nach einem Stopp mitten im Prefill.
     * @param {number} max
     * @returns {number}
     */
    prefill(max) {
        const ret = wasm.forge_prefill(this.__wbg_ptr, max);
        return ret >>> 0;
    }
    /**
     * Eine per Budget beendete Session mit `n` frischen Tokens fortsetzen —
     * KV-Cache und RNG laufen weiter, kein erneuter Prefill. Sampling-Parameter
     * werden übernommen, falls der Nutzer sie geändert hat. Gibt `false`
     * zurück, wenn keine Session mehr da ist (EOS oder Kontext voll) — dann
     * muss der Aufrufer neu mit `start` beginnen.
     * @param {number} n
     * @param {number} temp
     * @param {number | null} [top_k]
     * @param {number | null} [top_p]
     * @returns {boolean}
     */
    resume(n, temp, top_k, top_p) {
        const ret = wasm.forge_resume(this.__wbg_ptr, n, temp, isLikeNone(top_k) ? Number.MAX_SAFE_INTEGER : (top_k) >>> 0, isLikeNone(top_p) ? Number.MAX_SAFE_INTEGER : Math.fround(top_p));
        return ret !== 0;
    }
    /**
     * Start a generation: encode + validate the prompt. Der eigentliche
     * Prefill passiert danach häppchenweise über `prefill` — so kann der
     * Worker Fortschritt melden und ein Stopp greift auch mittendrin.
     * @param {string} prompt
     * @param {number} n
     * @param {number} temp
     * @param {number | null | undefined} top_k
     * @param {number | null | undefined} top_p
     * @param {bigint} seed
     */
    start(prompt, n, temp, top_k, top_p, seed) {
        const ptr0 = passStringToWasm0(prompt, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.forge_start(this.__wbg_ptr, ptr0, len0, n, temp, isLikeNone(top_k) ? Number.MAX_SAFE_INTEGER : (top_k) >>> 0, isLikeNone(top_p) ? Number.MAX_SAFE_INTEGER : Math.fround(top_p), seed);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
}
if (Symbol.dispose) Forge.prototype[Symbol.dispose] = Forge.prototype.free;

/**
 * Mnemosyne im Browser: Retrieval über den mitgelieferten Index. Die Sibylle
 * findet die Passagen, die Schmiede (`Forge`) formt daraus die Antwort —
 * Encoder-Modell und Generator bleiben getrennt geladen, teilen aber den
 * Cadmus-Tokenizer, sodass das Prompt-Budget hier gezählt werden kann.
 */
export class Sibyl {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        SibylFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_sibyl_free(ptr, 0);
    }
    /**
     * Retrieval + Prompt-Packing in einem: holt Top-`k`-Passagen zur Frage
     * und packt sie mit Frage + optionalem Antwort-Präfix in `max_tokens`.
     * Das Ergebnis geht als Prompt an `Forge.start`.
     * @param {string} question
     * @param {number} k
     * @param {string | null | undefined} prefix
     * @param {number} max_tokens
     * @returns {string}
     */
    build_prompt(question, k, prefix, max_tokens) {
        let deferred4_0;
        let deferred4_1;
        try {
            const ptr0 = passStringToWasm0(question, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            var ptr1 = isLikeNone(prefix) ? 0 : passStringToWasm0(prefix, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            var len1 = WASM_VECTOR_LEN;
            const ret = wasm.sibyl_build_prompt(this.__wbg_ptr, ptr0, len0, k, ptr1, len1, max_tokens);
            var ptr3 = ret[0];
            var len3 = ret[1];
            if (ret[3]) {
                ptr3 = 0; len3 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred4_0 = ptr3;
            deferred4_1 = len3;
            return getStringFromWasm0(ptr3, len3);
        } finally {
            wasm.__wbindgen_free(deferred4_0, deferred4_1, 1);
        }
    }
    /**
     * Index-Steckbrief als JSON (für die UI).
     * @returns {string}
     */
    info() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.sibyl_info(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Encoder-GGUF-Bytes + Index-Bytes (MNEM v1 f32 oder v2 f16) laden.
     * @param {Uint8Array} encoder_bytes
     * @param {Uint8Array} index_bytes
     */
    constructor(encoder_bytes, index_bytes) {
        const ptr0 = passArray8ToWasm0(encoder_bytes, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArray8ToWasm0(index_bytes, wasm.__wbindgen_malloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.sibyl_new(ptr0, len0, ptr1, len1);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        this.__wbg_ptr = ret[0];
        SibylFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * Top-`k`-Passagen zur Query als JSON-Array `[{score, text}, …]` —
     * disjunkt (search_diverse), passend zu `build_prompt`.
     * @param {string} query
     * @param {number} k
     * @returns {string}
     */
    search(query, k) {
        let deferred3_0;
        let deferred3_1;
        try {
            const ptr0 = passStringToWasm0(query, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.sibyl_search(this.__wbg_ptr, ptr0, len0, k);
            var ptr2 = ret[0];
            var len2 = ret[1];
            if (ret[3]) {
                ptr2 = 0; len2 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred3_0 = ptr2;
            deferred3_1 = len2;
            return getStringFromWasm0(ptr2, len2);
        } finally {
            wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
        }
    }
}
if (Symbol.dispose) Sibyl.prototype[Symbol.dispose] = Sibyl.prototype.free;
function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg_Error_92b29b0548f8b746: function(arg0, arg1) {
            const ret = Error(getStringFromWasm0(arg0, arg1));
            return ret;
        },
        __wbg___wbindgen_throw_344f42d3211c4765: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
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
        "./talos_forge_wasm_bg.js": import0,
    };
}

const ForgeFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_forge_free(ptr, 1));
const SibylFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_sibyl_free(ptr, 1));

function getStringFromWasm0(ptr, len) {
    return decodeText(ptr >>> 0, len);
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function isLikeNone(x) {
    return x === undefined || x === null;
}

function passArray8ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 1, 1) >>> 0;
    getUint8ArrayMemory0().set(arg, ptr / 1);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
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

function takeFromExternrefTable0(idx) {
    const value = wasm.__wbindgen_externrefs.get(idx);
    wasm.__externref_table_dealloc(idx);
    return value;
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

let wasmModule, wasmInstance, wasm;
function __wbg_finalize_init(instance, module) {
    wasmInstance = instance;
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
        module_or_path = new URL('talos_forge_wasm_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync, __wbg_init as default };
