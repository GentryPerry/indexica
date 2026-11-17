//! Indexica's bridge to VectorCraft's path operations (MIT OR Apache-2.0, ArtCraft Team and the
//! VectorCraft contributors). Built to WebAssembly and inlined into Indexica's single HTML file.
//!
//! The interface is a plain C ABI with a small text protocol so it needs no binding generator:
//! the host writes a request into memory from `ix_alloc`, calls `ix_run`, and reads the reply from
//! `ix_out_ptr` / `ix_out_len`. A request is lines:
//!   1. the operation: union | subtract | intersect | exclude | outline | offset | simplify | smooth | smoothlevel
//!   2. numbers for it (space separated, may be empty):
//!      booleans: precision; outline: width cap join miter; offset: delta join miter;
//!      simplify: tolerance; smooth: amount 0..1; smoothlevel: level 0..100
//!   3+. one SVG path per line (absolute M L Q C Z), each optionally prefixed "E " for even-odd.
//! The reply is one SVG path, or a line starting with "ERR ".

use std::cell::RefCell;
use kurbo::{BezPath, Cap, Join};
use vectorcraft_geom::{FillRule, PathData};
use vectorcraft_pathops as ops;

thread_local! { static OUT: RefCell<Vec<u8>> = const { RefCell::new(Vec::new()) }; }

/// Memory for a request of `len` bytes. The host frees it with `ix_free`.
#[no_mangle]
pub extern "C" fn ix_alloc(len: usize) -> *mut u8 {
    let mut v = Vec::<u8>::with_capacity(len.max(1));
    let p = v.as_mut_ptr();
    std::mem::forget(v);
    p
}

/// Frees memory from `ix_alloc`.
///
/// # Safety
/// `p` and `len` must come from one `ix_alloc` call, freed once.
#[no_mangle]
pub unsafe extern "C" fn ix_free(p: *mut u8, len: usize) {
    if !p.is_null() {
        drop(unsafe { Vec::from_raw_parts(p, 0, len.max(1)) });
    }
}

#[no_mangle]
pub extern "C" fn ix_out_ptr() -> *const u8 { OUT.with(|o| o.borrow().as_ptr()) }
#[no_mangle]
pub extern "C" fn ix_out_len() -> usize { OUT.with(|o| o.borrow().len()) }

/// Runs a request. Returns 0 on success, 1 when the reply is an error line.
///
/// # Safety
/// `p` must point to `len` readable bytes.
#[no_mangle]
pub unsafe extern "C" fn ix_run(p: *const u8, len: usize) -> i32 {
    let bytes = unsafe { std::slice::from_raw_parts(p, len) };
    let (code, text) = match std::str::from_utf8(bytes) {
        Ok(req) => match run(req) { Ok(d) => (0, d), Err(e) => (1, format!("ERR {e}")) },
        Err(_) => (1, "ERR request is not UTF-8".to_string()),
    };
    OUT.with(|o| *o.borrow_mut() = text.into_bytes());
    code
}

fn cap(v: f64) -> Cap { match v as i32 { 1 => Cap::Round, 2 => Cap::Square, _ => Cap::Butt } }
fn join(v: f64) -> Join { match v as i32 { 1 => Join::Round, 2 => Join::Bevel, _ => Join::Miter } }

fn parse(line: &str) -> Result<(PathData, FillRule), String> {
    let (rule, d) = match line.strip_prefix("E ") { Some(rest) => (FillRule::EvenOdd, rest), None => (FillRule::NonZero, line) };
    let bp = BezPath::from_svg(d.trim()).map_err(|e| format!("bad path: {e}"))?;
    Ok((PathData::from_bezpath(&bp), rule))
}

/// Runs one request on its own, for tests and native callers.
pub fn run(req: &str) -> Result<String, String> {
    let mut lines = req.lines();
    let op = lines.next().ok_or("empty request")?.trim();
    let nums: Vec<f64> = lines.next().unwrap_or("").split_whitespace().filter_map(|s| s.parse().ok()).collect();
    let n = |i: usize, def: f64| nums.get(i).copied().filter(|v| v.is_finite()).unwrap_or(def);
    let paths = lines.filter(|l| !l.trim().is_empty()).map(parse).collect::<Result<Vec<_>, _>>()?;
    let first = paths.first().ok_or("no paths")?;
    let out = match op {
        "union" | "subtract" | "intersect" | "exclude" => {
            let prec = n(0, ops::DEFAULT_PRECISION);
            let bop = match op { "union" => ops::BoolOp::Union, "intersect" => ops::BoolOp::Intersect, "exclude" => ops::BoolOp::Xor, _ => ops::BoolOp::Difference };
            // Folds left to right: subtract cuts every later path out of the first.
            let mut acc = first.0.clone();
            let mut rule = first.1;
            for (p, r) in &paths[1..] {
                acc = ops::try_boolean(&acc, rule, p, *r, bop, prec).map_err(|e| e.to_string())?;
                rule = FillRule::NonZero;
            }
            acc
        }
        "outline" => ops::outline_stroke(&first.0, n(0, 2.0), cap(n(1, 1.0)), join(n(2, 1.0)), n(3, 4.0)),
        "offset" => ops::try_offset_path(&first.0, n(0, 4.0), join(n(1, 1.0)), n(2, 4.0)).map_err(|e| e.to_string())?,
        "simplify" => ops::simplify(&first.0, n(0, 1.0)),
        "smooth" => ops::smooth(&first.0, n(0, 0.5)),
        // VectorCraft's Object > Path > Smooth: smooths bumps and jags along the path, then refits.
        "smoothlevel" => ops::smooth_level(&first.0, n(0, ops::SMOOTH_AUTO_LEVEL)),
        _ => return Err(format!("unknown operation {op}")),
    };
    Ok(out.to_bezpath().to_svg())
}

#[cfg(test)]
mod tests {
    use super::run;
    const A: &str = "M0 0L100 0L100 100L0 100Z";
    const B: &str = "M50 50L150 50L150 150L50 150Z";
    #[test]
    fn booleans() {
        for op in ["union", "subtract", "intersect", "exclude"] { let d = run(&format!("{op}\n\n{A}\n{B}")).unwrap(); assert!(d.starts_with('M'), "{op}: {d}"); }
    }
    #[test]
    fn outline_offset_simplify_smooth() {
        assert!(run("outline\n10 1 1 4\nM0 0C50 -50 100 50 150 0").unwrap().contains('Z'));
        assert!(run("offset\n8 1 4\nM0 0L100 0L100 100L0 100Z").unwrap().starts_with('M'));
        assert!(run("simplify\n1\nM0 0L10 0.1L20 0L30 0").unwrap().starts_with('M'));
        assert!(run("smooth\n0.5\nM0 0L50 50L100 0").unwrap().starts_with('M'));
        assert!(run("smoothlevel\n50\nM0 0L10 3L20 0L30 4L40 0L50 3L60 0").unwrap().starts_with('M'));
        assert!(run("nope\n\nM0 0L1 1").is_err());
    }
}
