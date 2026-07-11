/* tslint:disable */
/* eslint-disable */

export class Forge {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Modell-Steckbrief als JSON (für die UI).
     */
    info(): string;
    /**
     * Parse GGUF bytes and build the model (config + tokenizer + weights).
     */
    constructor(bytes: Uint8Array);
    /**
     * One decode step. Returns the newly completed text for this token, or
     * `None` when the generation is finished (EOS, budget, or context full).
     * Bei erschöpftem Budget bleibt die Session bestehen — `resume` kann sie
     * ohne erneuten Prefill fortsetzen; EOS und volles Kontextfenster sind final.
     */
    next_chunk(): string | undefined;
    /**
     * Speist bis zu `max` Prompt-Tokens ins Modell und gibt zurück, wie
     * viele noch fehlen. `prefill(0)` fragt nur den Reststand ab — auch
     * nach einem Stopp mitten im Prefill.
     */
    prefill(max: number): number;
    /**
     * Eine per Budget beendete Session mit `n` frischen Tokens fortsetzen —
     * KV-Cache und RNG laufen weiter, kein erneuter Prefill. Sampling-Parameter
     * werden übernommen, falls der Nutzer sie geändert hat. Gibt `false`
     * zurück, wenn keine Session mehr da ist (EOS oder Kontext voll) — dann
     * muss der Aufrufer neu mit `start` beginnen.
     */
    resume(n: number, temp: number, top_k?: number | null, top_p?: number | null): boolean;
    /**
     * Start a generation: encode + validate the prompt. Der eigentliche
     * Prefill passiert danach häppchenweise über `prefill` — so kann der
     * Worker Fortschritt melden und ein Stopp greift auch mittendrin.
     */
    start(prompt: string, n: number, temp: number, top_k: number | null | undefined, top_p: number | null | undefined, seed: bigint): void;
}

/**
 * Mnemosyne im Browser: Retrieval über den mitgelieferten Index. Die Sibylle
 * findet die Passagen, die Schmiede (`Forge`) formt daraus die Antwort —
 * Encoder-Modell und Generator bleiben getrennt geladen, teilen aber den
 * Cadmus-Tokenizer, sodass das Prompt-Budget hier gezählt werden kann.
 */
export class Sibyl {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Retrieval + Prompt-Packing in einem: holt Top-`k`-Passagen zur Frage
     * und packt sie mit Frage + optionalem Antwort-Präfix in `max_tokens`.
     * Das Ergebnis geht als Prompt an `Forge.start`.
     */
    build_prompt(question: string, k: number, prefix: string | null | undefined, max_tokens: number): string;
    /**
     * Index-Steckbrief als JSON (für die UI).
     */
    info(): string;
    /**
     * Encoder-GGUF-Bytes + Index-Bytes (MNEM v1 f32 oder v2 f16) laden.
     */
    constructor(encoder_bytes: Uint8Array, index_bytes: Uint8Array);
    /**
     * Top-`k`-Passagen zur Query als JSON-Array `[{score, text}, …]` —
     * disjunkt (search_diverse), passend zu `build_prompt`.
     */
    search(query: string, k: number): string;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_forge_free: (a: number, b: number) => void;
    readonly __wbg_sibyl_free: (a: number, b: number) => void;
    readonly forge_info: (a: number) => [number, number];
    readonly forge_new: (a: number, b: number) => [number, number, number];
    readonly forge_next_chunk: (a: number) => [number, number];
    readonly forge_prefill: (a: number, b: number) => number;
    readonly forge_resume: (a: number, b: number, c: number, d: number, e: number) => number;
    readonly forge_start: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: bigint) => [number, number];
    readonly sibyl_build_prompt: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number, number, number];
    readonly sibyl_info: (a: number) => [number, number];
    readonly sibyl_new: (a: number, b: number, c: number, d: number) => [number, number, number];
    readonly sibyl_search: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
