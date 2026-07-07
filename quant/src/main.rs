//! quantize <in.gguf> <out.gguf> — liest ein F32-GGUF (wie von Hephaistos
//! geschrieben) und quantisiert alle 2D-Tensoren nach Q4_0; 1D-Tensoren
//! (Norm-Gewichte) bleiben F32, wie Talos' Weights-Loader es verlangt.
//! Die KV-Metadaten werden byteweise unverändert übernommen.
//!
//! Q4_0 (ggml-Konvention, Gegenstück zu talos::gguf::dtype):
//!   Block = 32 Werte → f16-Skala d + 16 gepackte Nibbles (18 Bytes),
//!   d = Wert größter Magnitude / −8,  q[i] = min(x[i]/d + 8.5, 15),
//!   Nibble j low = x[j], Nibble j high = x[j+16].

use anyhow::{bail, ensure, Context, Result};
use half::f16;

const ALIGNMENT: usize = 32;
const QK: usize = 32;
const GGML_F32: u32 = 0;
const GGML_Q4_0: u32 = 2;

struct Reader<'a> {
    buf: &'a [u8],
    pos: usize,
}

impl<'a> Reader<'a> {
    fn take(&mut self, n: usize) -> Result<&'a [u8]> {
        ensure!(self.pos + n <= self.buf.len(), "GGUF endet unerwartet");
        let s = &self.buf[self.pos..self.pos + n];
        self.pos += n;
        Ok(s)
    }
    fn u32(&mut self) -> Result<u32> {
        Ok(u32::from_le_bytes(self.take(4)?.try_into().unwrap()))
    }
    fn u64(&mut self) -> Result<u64> {
        Ok(u64::from_le_bytes(self.take(8)?.try_into().unwrap()))
    }
    fn string(&mut self) -> Result<String> {
        let n = self.u64()? as usize;
        Ok(String::from_utf8(self.take(n)?.to_vec())?)
    }
    /// Einen KV-Wert des Typs `ty` überspringen (GGUF v3 Typ-Tags).
    fn skip_value(&mut self, ty: u32) -> Result<()> {
        match ty {
            0 | 1 | 7 => drop(self.take(1)?),        // u8, i8, bool
            2 | 3 => drop(self.take(2)?),            // u16, i16
            4 | 5 | 6 => drop(self.take(4)?),        // u32, i32, f32
            10 | 11 | 12 => drop(self.take(8)?),     // u64, i64, f64
            8 => {
                let n = self.u64()? as usize;        // string
                self.take(n)?;
            }
            9 => {
                let elem_ty = self.u32()?;           // array
                let n = self.u64()?;
                for _ in 0..n {
                    self.skip_value(elem_ty)?;
                }
            }
            _ => bail!("unbekannter GGUF-KV-Typ {ty}"),
        }
        Ok(())
    }
}

struct TensorInfo {
    name: String,
    dims: Vec<u64>,
    dtype: u32,
    offset: u64,
}

fn align_up(x: usize, a: usize) -> usize {
    x.div_ceil(a) * a
}

/// Einen 32er-Block nach Q4_0 packen: f16-Skala + 16 Nibble-Paare.
fn q4_block(x: &[f32], out: &mut Vec<u8>) {
    let max = x.iter().copied().fold(0.0f32, |m, v| if v.abs() > m.abs() { v } else { m });
    let d = max / -8.0;
    let id = if d != 0.0 { 1.0 / d } else { 0.0 };
    out.extend_from_slice(&f16::from_f32(d).to_le_bytes());
    for j in 0..QK / 2 {
        let lo = ((x[j] * id + 8.5) as i32).min(15) as u8;
        let hi = ((x[j + QK / 2] * id + 8.5) as i32).min(15) as u8;
        out.push(lo | (hi << 4));
    }
}

fn main() -> Result<()> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let [inp, outp] = args.as_slice() else {
        bail!("usage: quantize <in.gguf> <out.gguf>");
    };
    let buf = std::fs::read(inp).with_context(|| format!("lese {inp}"))?;
    let mut r = Reader { buf: &buf, pos: 0 };

    ensure!(r.take(4)? == b"GGUF", "{inp}: kein GGUF (Magic fehlt)");
    let version = r.u32()?;
    ensure!(version == 3, "GGUF-Version {version}, erwartet 3");
    let n_tensors = r.u64()?;
    let n_kv = r.u64()?;

    // KV-Sektion nur abschreiten, um sie unten byteweise zu kopieren.
    let kv_start = r.pos;
    for _ in 0..n_kv {
        r.string()?;
        let ty = r.u32()?;
        r.skip_value(ty)?;
    }
    let kv_bytes = &buf[kv_start..r.pos];

    let mut infos = Vec::with_capacity(n_tensors as usize);
    for _ in 0..n_tensors {
        let name = r.string()?;
        let n_dims = r.u32()? as usize;
        let mut dims = Vec::with_capacity(n_dims);
        for _ in 0..n_dims {
            dims.push(r.u64()?);
        }
        infos.push(TensorInfo { name, dims, dtype: r.u32()?, offset: r.u64()? });
    }
    let data_start = align_up(r.pos, ALIGNMENT);

    // Tensoren umkodieren: 2D + F32 + Spalten durch 32 teilbar → Q4_0.
    let mut tensors = Vec::with_capacity(infos.len()); // (info, neuer dtype, daten)
    let mut in_bytes = 0usize;
    let mut out_bytes = 0usize;
    for info in infos {
        ensure!(info.dtype == GGML_F32, "{}: dtype {} ≠ F32", info.name, info.dtype);
        let n_elems: u64 = info.dims.iter().product();
        let raw_len = n_elems as usize * 4;
        let start = data_start + info.offset as usize;
        ensure!(start + raw_len <= buf.len(), "{}: Daten außerhalb der Datei", info.name);
        let raw = &buf[start..start + raw_len];
        in_bytes += raw_len;

        // dims[0] ist die zusammenhängende Dimension (Spalten); Zeilen sind ein
        // Vielfaches von 32 Spalten, also straddled kein Block eine Zeilengrenze.
        let quantize = info.dims.len() == 2 && info.dims[0] % QK as u64 == 0;
        let (dtype, data) = if quantize {
            let x: Vec<f32> = raw
                .chunks_exact(4)
                .map(|b| f32::from_le_bytes(b.try_into().unwrap()))
                .collect();
            let mut q = Vec::with_capacity(x.len() / QK * (2 + QK / 2));
            for block in x.chunks_exact(QK) {
                q4_block(block, &mut q);
            }
            (GGML_Q4_0, q)
        } else {
            (GGML_F32, raw.to_vec())
        };
        out_bytes += data.len();
        println!(
            "  {:<28} {:>12}  {}",
            info.name,
            format!("{:?}", info.dims),
            if quantize { "→ Q4_0" } else { "  F32" }
        );
        tensors.push((info, dtype, data));
    }

    // Schreiben: Header + KVs (verbatim) + neue Infos + ausgerichtete Daten.
    let mut out: Vec<u8> = Vec::with_capacity(out_bytes + kv_bytes.len() + 4096);
    out.extend_from_slice(b"GGUF");
    out.extend_from_slice(&3u32.to_le_bytes());
    out.extend_from_slice(&n_tensors.to_le_bytes());
    out.extend_from_slice(&n_kv.to_le_bytes());
    out.extend_from_slice(kv_bytes);

    let mut off = 0usize;
    let offsets: Vec<u64> = tensors
        .iter()
        .map(|(_, _, data)| {
            let o = off as u64;
            off = align_up(off + data.len(), ALIGNMENT);
            o
        })
        .collect();

    for ((info, dtype, _), &offset) in tensors.iter().zip(&offsets) {
        out.extend_from_slice(&(info.name.len() as u64).to_le_bytes());
        out.extend_from_slice(info.name.as_bytes());
        out.extend_from_slice(&(info.dims.len() as u32).to_le_bytes());
        for &d in &info.dims {
            out.extend_from_slice(&d.to_le_bytes());
        }
        out.extend_from_slice(&dtype.to_le_bytes());
        out.extend_from_slice(&offset.to_le_bytes());
    }

    while out.len() % ALIGNMENT != 0 {
        out.push(0);
    }
    let out_data_start = out.len();
    for ((_, _, data), &offset) in tensors.iter().zip(&offsets) {
        out.resize(out_data_start + offset as usize, 0);
        out.extend_from_slice(data);
    }

    std::fs::write(outp, &out).with_context(|| format!("schreibe {outp}"))?;
    println!(
        "{inp} ({:.1} MB Tensordaten) → {outp} ({:.1} MB, Faktor {:.1})",
        in_bytes as f64 / 1048576.0,
        out_bytes as f64 / 1048576.0,
        in_bytes as f64 / out_bytes as f64
    );
    Ok(())
}
