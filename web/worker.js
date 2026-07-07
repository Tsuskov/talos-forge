// Web Worker: hält das wasm-Modell und generiert Token für Token, damit die
// Seite flüssig bleibt. Pro Zeitscheibe (~30 ms) werden so viele Tokens wie
// möglich erzeugt, dann gibt setTimeout(0) der Message-Queue Luft — so kann
// ein "stop" die laufende Generierung zwischen zwei Scheiben abbrechen.

import init, { Forge } from './pkg/talos_forge_wasm.js';

let forge = null;
let gen = 0; // Generation-Zähler: erhöht = laufende Session ist abgebrochen

onmessage = async (e) => {
  const m = e.data;

  if (m.type === 'load') {
    gen++; // eine evtl. laufende Generierung gehört zum alten Modell
    try {
      await init();
      if (forge) forge.free();
      forge = new Forge(new Uint8Array(m.bytes));
      postMessage({ type: 'ready', info: JSON.parse(forge.info()) });
    } catch (err) {
      forge = null;
      postMessage({ type: 'error', error: String(err) });
    }
    return;
  }

  if (m.type === 'stop') {
    gen++;
    postMessage({ type: 'done', stopped: true });
    return;
  }

  if (m.type === 'generate' || m.type === 'continue') {
    const my = ++gen;
    try {
      // 'continue' setzt die lebende Session fort (kein Prefill). Ist sie weg
      // (EOS oder Kontext voll), fällt es auf einen vollen Neustart zurück —
      // m.prompt enthält dafür den kompletten bisherigen Text.
      if (m.type !== 'continue' || !forge.resume(m.n, m.temp, m.top_k, m.top_p)) {
        forge.start(m.prompt, m.n, m.temp, m.top_k, m.top_p, BigInt(m.seed));
      }
    } catch (err) {
      postMessage({ type: 'error', error: String(err) });
      return;
    }

    // Erst der Prefill (falls noch Prompt-Tokens ausstehen — auch nach einem
    // Stopp mittendrin), dann das Decodieren. tok/s misst nur das Decodieren.
    const total = forge.prefill(0);
    const tPre = performance.now();
    let prefillSecs = 0;

    const decode = () => {
      const t0 = performance.now();
      let tokens = 0;
      const pump = () => {
        if (my !== gen) return; // gestoppt
        const deadline = performance.now() + 30;
        while (performance.now() < deadline) {
          const chunk = forge.next_chunk();
          if (chunk === undefined) {
            postMessage({
              type: 'done',
              tokens,
              secs: (performance.now() - t0) / 1000,
              ...(total ? { prefillSecs, promptTokens: total } : {}),
            });
            return;
          }
          tokens++;
          if (chunk) postMessage({ type: 'chunk', text: chunk });
        }
        setTimeout(pump, 0);
      };
      pump();
    };

    const prefill = (remaining) => {
      if (my !== gen) return; // gestoppt
      const deadline = performance.now() + 30;
      while (remaining > 0 && performance.now() < deadline) {
        remaining = forge.prefill(8);
      }
      if (remaining > 0) {
        postMessage({ type: 'prefill', done: total - remaining, total });
        setTimeout(prefill, 0, remaining);
      } else {
        prefillSecs = (performance.now() - tPre) / 1000;
        if (total) postMessage({ type: 'prefill', done: total, total });
        decode();
      }
    };
    prefill(total);
  }
};
