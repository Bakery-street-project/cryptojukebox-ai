export function hann(size: number): Float32Array {
  const w = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1));
  }
  return w;
}

export type Fft = (re: Float32Array, im: Float32Array) => void;

export function makeFft(size: number): Fft {
  if ((size & (size - 1)) !== 0) throw new Error(`FFT size must be a power of two, got ${size}`);
  const bits = Math.log2(size);
  const swap = new Uint32Array(size);
  for (let i = 0; i < size; i++) {
    let r = 0;
    for (let b = 0; b < bits; b++) r = (r << 1) | ((i >> b) & 1);
    swap[i] = r;
  }
  const cosTable = new Float64Array(size / 2);
  const sinTable = new Float64Array(size / 2);
  for (let k = 0; k < size / 2; k++) {
    cosTable[k] = Math.cos((2 * Math.PI * k) / size);
    sinTable[k] = -Math.sin((2 * Math.PI * k) / size);
  }
  return (re, im) => {
    for (let i = 0; i < size; i++) {
      const j = swap[i]!;
      if (j > i) {
        const tr = re[i]!;
        re[i] = re[j]!;
        re[j] = tr;
        const ti = im[i]!;
        im[i] = im[j]!;
        im[j] = ti;
      }
    }
    for (let len = 2; len <= size; len <<= 1) {
      const half = len >> 1;
      const step = size / len;
      for (let start = 0; start < size; start += len) {
        for (let k = 0; k < half; k++) {
          const c = cosTable[k * step]!;
          const s = sinTable[k * step]!;
          const a = start + k;
          const b = a + half;
          const xr = re[b]!;
          const xi = im[b]!;
          const tr = c * xr - s * xi;
          const ti = s * xr + c * xi;
          re[b] = re[a]! - tr;
          im[b] = im[a]! - ti;
          re[a] = re[a]! + tr;
          im[a] = im[a]! + ti;
        }
      }
    }
  };
}

export function fnv1a(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}
