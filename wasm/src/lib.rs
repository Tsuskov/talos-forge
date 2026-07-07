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

    /// Start a generation: encode + prefill the prompt. Blocks for the length
    /// of the prefill — run inside a Web Worker.
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
        let mut pos = 0usize;
        let mut logits = Vec::new();
        for &t in &prompt_ids {
            logits = self.model.step(t, pos);
            pos += 1;
        }

        self.session = Some(Session {
            rng: StdRng::seed_from_u64(seed),
            pos,
            logits,
            out_ids: Vec::new(),
            emitted: 0,
            left: n,
            temp,
            top_k: top_k.map(|k| k as usize),
            top_p,
        });
        Ok(())
    }

    /// One decode step. Returns the newly completed text for this token, or
    /// `None` when the generation is finished (EOS, budget, or context full).
    pub fn next_chunk(&mut self) -> Option<String> {
        let s = self.session.as_mut()?;
        if s.left == 0 || s.pos >= self.model.cfg.context_length {
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
}

fn to_js(e: anyhow::Error) -> JsError {
    JsError::new(&format!("{e:#}"))
}
