//! Browser-Bindings für Talos: Modell aus GGUF-Bytes laden, dann eine
//! Generier-Session Token für Token abrufen. Die Streaming-Logik (Prompt-
//! Prefill, EOS/Budget-Stop, Zurückhalten unvollständiger UTF-8-Sequenzen)
//! spiegelt `talos::main::run`.

use rand::rngs::StdRng;
use rand::SeedableRng;
use wasm_bindgen::prelude::*;

use talos::model::Model;
use talos::sample::sample;

#[wasm_bindgen]
pub struct Forge {
    model: Model,
    session: Option<Session>,
}

struct Session {
    rng: StdRng,
    prompt_ids: Vec<u32>,
    fed: usize, // wie viele Prompt-Tokens schon im Modell sind (Prefill-Stand)
    pos: usize,
    logits: Vec<f32>,
    out_ids: Vec<u32>,
    emitted: usize,
    left: usize,
    temp: f32,
    top_k: Option<usize>,
    top_p: Option<f32>,
}

#[wasm_bindgen]
impl Forge {
    /// Parse GGUF bytes and build the model (config + tokenizer + weights).
    #[wasm_bindgen(constructor)]
    pub fn new(bytes: Vec<u8>) -> Result<Forge, JsError> {
        let model = Model::load_bytes(bytes).map_err(to_js)?;
        Ok(Forge { model, session: None })
    }

    /// Modell-Steckbrief als JSON (für die UI).
    pub fn info(&self) -> String {
        let c = &self.model.cfg;
        format!(
            r#"{{"n_layer":{},"n_embd":{},"n_head":{},"vocab_size":{},"context_length":{}}}"#,
            c.n_layer, c.n_embd, c.n_head, c.vocab_size, c.context_length
        )
    }

    /// Start a generation: encode + validate the prompt. Der eigentliche
    /// Prefill passiert danach häppchenweise über `prefill` — so kann der
    /// Worker Fortschritt melden und ein Stopp greift auch mittendrin.
    #[allow(clippy::too_many_arguments)]
    pub fn start(
        &mut self,
        prompt: &str,
        n: usize,
        temp: f32,
        top_k: Option<u32>,
        top_p: Option<f32>,
        seed: u64,
    ) -> Result<(), JsError> {
        let prompt_ids = self.model.tokenizer.encode(prompt);
        if prompt_ids.is_empty() {
            return Err(JsError::new("prompt encoded to zero tokens"));
        }
        let ctx = self.model.cfg.context_length;
        if prompt_ids.len() >= ctx {
            return Err(JsError::new(&format!(
                "Prompt ist {} Tokens lang, Kontext fasst nur {ctx}",
                prompt_ids.len()
            )));
        }

        self.model.reset();
        self.session = Some(Session {
            rng: StdRng::seed_from_u64(seed),
            prompt_ids,
            fed: 0,
            pos: 0,
            logits: Vec::new(),
            out_ids: Vec::new(),
            emitted: 0,
            left: n,
            temp,
            top_k: top_k.map(|k| k as usize),
            top_p,
        });
        Ok(())
    }

    /// Speist bis zu `max` Prompt-Tokens ins Modell und gibt zurück, wie
    /// viele noch fehlen. `prefill(0)` fragt nur den Reststand ab — auch
    /// nach einem Stopp mitten im Prefill.
    pub fn prefill(&mut self, max: usize) -> u32 {
        let Some(s) = self.session.as_mut() else {
            return 0;
        };
        let end = (s.fed + max).min(s.prompt_ids.len());
        while s.fed < end {
            s.logits = self.model.step(s.prompt_ids[s.fed], s.pos);
            s.pos += 1;
            s.fed += 1;
        }
        (s.prompt_ids.len() - s.fed) as u32
    }

    /// One decode step. Returns the newly completed text for this token, or
    /// `None` when the generation is finished (EOS, budget, or context full).
    /// Bei erschöpftem Budget bleibt die Session bestehen — `resume` kann sie
    /// ohne erneuten Prefill fortsetzen; EOS und volles Kontextfenster sind final.
    pub fn next_chunk(&mut self) -> Option<String> {
        let s = self.session.as_mut()?;
        // Vor Ende des Prefills gibt es keine gültigen Logits zum Samplen.
        if s.fed < s.prompt_ids.len() || s.left == 0 {
            return None;
        }
        if s.pos >= self.model.cfg.context_length {
            self.session = None;
            return None;
        }
        s.left -= 1;

        let next = sample(&s.logits, s.temp, s.top_k, s.top_p, &mut s.rng);
        if next == self.model.tokenizer.eos() {
            self.session = None;
            return None;
        }
        s.out_ids.push(next);
        s.logits = self.model.step(next, s.pos);
        s.pos += 1;

        // Neu vervollständigten Text ausgeben; ein anhängendes U+FFFD ist eine
        // unfertige Multibyte-Sequenz und wartet auf den nächsten Token.
        let text = self.model.tokenizer.decode(&s.out_ids);
        let chars: Vec<char> = text.chars().collect();
        let end = if chars.last() == Some(&'\u{FFFD}') {
            chars.len() - 1
        } else {
            chars.len()
        };
        let chunk: String = chars[s.emitted.min(end)..end].iter().collect();
        s.emitted = end;
        Some(chunk)
    }

    /// Eine per Budget beendete Session mit `n` frischen Tokens fortsetzen —
    /// KV-Cache und RNG laufen weiter, kein erneuter Prefill. Sampling-Parameter
    /// werden übernommen, falls der Nutzer sie geändert hat. Gibt `false`
    /// zurück, wenn keine Session mehr da ist (EOS oder Kontext voll) — dann
    /// muss der Aufrufer neu mit `start` beginnen.
    pub fn resume(&mut self, n: usize, temp: f32, top_k: Option<u32>, top_p: Option<f32>) -> bool {
        match self.session.as_mut() {
            Some(s) => {
                s.left = n;
                s.temp = temp;
                s.top_k = top_k.map(|k| k as usize);
                s.top_p = top_p;
                true
            }
            None => false,
        }
    }
}

fn to_js(e: anyhow::Error) -> JsError {
    JsError::new(&format!("{e:#}"))
}
