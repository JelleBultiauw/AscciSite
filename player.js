// Draws video as ASCII in #ascii. It plays pre-rendered clips (<src>-wide.txt on
// landscape screens, <src>-tall.txt on portrait ones, made by tools/ascii_video.py)
// or converts a <video> element live, frame by frame. Pages drive it through
// window.ascii; a data-src on the script tag starts that clip right away.
window.ascii = (() => {
  const script = document.currentScript;
  const box = document.querySelector('.screen');
  const pre = document.getElementById('ascii');
  const text = pre.appendChild(document.createTextNode('laden...'));
  const clips = {};
  const sources = {};
  let source = null;
  let fitted = '';
  let advance = 0;

  // Light to dense, the same ramp tools/ascii_video.py uses.
  const RAMP = ' .:;+?x#aS8$B@';
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

  const portrait = () => innerWidth < innerHeight;

  function area() {
    const style = getComputedStyle(box);
    return {
      width: box.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
      height: box.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom),
    };
  }

  // Glyph width per px of font size, measured in the font the page actually renders.
  function measureAdvance() {
    const probe = box.appendChild(document.createElement('span'));
    probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;font-size:100px';
    probe.textContent = 'M'.repeat(100);
    const width = probe.getBoundingClientRect().width / 10000;
    probe.remove();
    return width;
  }

  // Largest font size at which the whole grid fits, with cells twice as tall as wide.
  function fit() {
    advance ||= measureAdvance();
    const { width, height } = area();
    const cell = Math.min(width / source.cols, height / source.rows / 2);
    pre.style.fontSize = `${cell / advance}px`;
    pre.style.lineHeight = `${cell * 2}px`;
    fitted = `${source.cols}x${source.rows}`;
  }

  // Parses a clip file as it streams in; `ready` fires once a second of frames is in.
  async function stream(url, clip, ready) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let rest = '';
    let rows = [];
    for (;;) {
      const { done, value } = await reader.read();
      const lines = (rest + decoder.decode(value, { stream: !done })).split(/\r?\n/);
      rest = done ? '' : lines.pop();
      for (const line of lines) {
        if (!clip.count) {
          [clip.cols, clip.rows, clip.count, clip.fps] = line.split(' ').map(Number);
          continue;
        }
        rows.push(line.padEnd(clip.cols));
        if (rows.length === clip.rows) {
          clip.frames.push(rows.join('\n'));
          rows = [];
          if (clip.frames.length === Math.min(clip.count, clip.fps)) ready();
        }
      }
      if (done) break;
    }
    if (!clip.frames.length) throw new Error(`no frames in ${url}`);
    clip.count = clip.frames.length;
    ready();
  }

  function loadClip(url) {
    clips[url] ??= new Promise((resolve, reject) => {
      const clip = { frames: [], count: 0 };
      stream(url, clip, () => resolve(clip)).catch((error) => {
        clip.count = clip.frames.length; // if the connection drops, loop what arrived
        reject(error);
      });
    });
    return clips[url];
  }

  function clipSource(src) {
    let clip = null;
    let failed = false;
    let shown = -1;
    let paused = false;
    let offset = 0;
    let started = 0;
    const self = {
      cols: 0,
      rows: 0,
      get paused() {
        return paused;
      },
      enter() {
        shown = -1;
        self.resize();
      },
      resize() {
        const url = `${src}-${portrait() ? 'tall' : 'wide'}.txt`;
        loadClip(url).then(
          (next) => {
            if (url !== `${src}-${portrait() ? 'tall' : 'wide'}.txt`) return;
            if (!clip) started = performance.now();
            clip = next;
            shown = -1;
            self.cols = clip.cols;
            self.rows = clip.rows;
          },
          () => {
            failed = true;
          },
        );
      },
      frame(now) {
        if (failed) {
          failed = false;
          return 'kon de video niet laden.';
        }
        if (!clip) return null;
        let time = paused ? offset : offset + now - started;
        // Still downloading: hold on the newest frame until more arrive.
        const loaded = clip.frames.length;
        const end = loaded < clip.count ? ((loaded - 1) * 1000) / clip.fps : Infinity;
        if (time > end) {
          time = offset = end;
          started = now;
        }
        // rAF timestamps can trail performance.now() slightly, so never go below zero.
        const i = Math.floor((Math.max(0, time) / 1000) * clip.fps) % clip.count;
        if (i === shown) return null;
        shown = i;
        return clip.frames[i];
      },
      toggle() {
        if (!clip) return;
        const now = performance.now();
        if (paused) started = now;
        else offset += now - started;
        paused = !paused;
      },
    };
    return self;
  }

  // Converts a playing <video> the way tools/ascii_video.py converts the clips:
  // average the brightness per cell, stretch the levels, sharpen, then pick glyphs.
  function videoSource(video) {
    const SAMPLES = 2; // canvas pixels per cell, each way
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const scan = document.createElement('canvas');
    const scanCtx = scan.getContext('2d', { willReadFrequently: true });
    scan.width = 64;
    scan.height = Math.max(1, Math.round((64 * video.videoHeight) / video.videoWidth));
    let crop = { x: 0, y: 0, w: video.videoWidth, h: video.videoHeight };
    let lit = false; // whether any frame has lit up yet
    let last = -1;
    let lo = -1;
    let hi = -1;
    const self = {
      cols: 0,
      rows: 0,
      get paused() {
        return video.paused;
      },
      enter() {
        self.resize();
      },
      leave() {
        video.pause();
      },
      // About 7px per column on big screens and 4.6px on phones, within the screen.
      resize() {
        const { width, height } = area();
        const aspect = crop.h / crop.w;
        const target = width < 600 ? 4.6 : 7;
        let cols = Math.min(240, Math.round(width / target));
        let rows = Math.round((cols * aspect) / 2);
        const most = Math.floor(height / (target * 2));
        if (rows > most) {
          rows = most;
          cols = Math.round((rows * 2) / aspect);
        }
        self.cols = Math.max(cols, 8);
        self.rows = Math.max(rows, 4);
        canvas.width = self.cols * SAMPLES;
        canvas.height = self.rows * SAMPLES;
        last = -1;
      },
      frame() {
        if (video.readyState < 2 || video.currentTime === last) return null;
        last = video.currentTime;
        try {
          trim();
          return convert();
        } catch {
          return null; // a cross-origin video without CORS can't be read
        }
      },
      toggle() {
        if (video.paused) video.play().catch(() => {});
        else video.pause();
      },
    };

    // Letterboxed videos (a wide clip inside a tall frame, say) only show the part
    // that has lit up so far, so the picture fills the grid instead of a thin strip.
    function trim() {
      scanCtx.drawImage(video, 0, 0, scan.width, scan.height);
      const px = scanCtx.getImageData(0, 0, scan.width, scan.height).data;
      let top = scan.height;
      let bottom = -1;
      let left = scan.width;
      let right = -1;
      for (let y = 0; y < scan.height; y++) {
        for (let x = 0; x < scan.width; x++) {
          const i = (y * scan.width + x) * 4;
          if (px[i] + px[i + 1] + px[i + 2] > 72) {
            top = Math.min(top, y);
            bottom = Math.max(bottom, y);
            left = Math.min(left, x);
            right = Math.max(right, x);
          }
        }
      }
      if (bottom < 0) return; // a black frame says nothing about the edges
      const sx = video.videoWidth / scan.width;
      const sy = video.videoHeight / scan.height;
      const box = { x: left * sx, y: top * sy, w: (right + 1 - left) * sx, h: (bottom + 1 - top) * sy };
      if (lit) {
        // Grow only, so the picture settles instead of breathing with each scene.
        const x = Math.min(crop.x, box.x);
        const y = Math.min(crop.y, box.y);
        box.w = Math.max(crop.x + crop.w, box.x + box.w) - x;
        box.h = Math.max(crop.y + crop.h, box.y + box.h) - y;
        box.x = x;
        box.y = y;
      }
      lit = true;
      if (box.x !== crop.x || box.y !== crop.y || box.w !== crop.w || box.h !== crop.h) {
        crop = box;
        self.resize();
      }
    }

    function convert() {
      const { cols, rows } = self;
      const w = canvas.width;
      ctx.drawImage(video, crop.x, crop.y, crop.w, crop.h, 0, 0, w, canvas.height);
      const px = ctx.getImageData(0, 0, w, canvas.height).data;
      const n = cols * rows;
      const lum = new Float32Array(n);
      for (let y = 0; y < canvas.height; y++) {
        const row = ((y / SAMPLES) | 0) * cols;
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          lum[row + ((x / SAMPLES) | 0)] += 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
        }
      }
      const hist = new Uint32Array(256);
      for (let i = 0; i < n; i++) hist[(lum[i] /= SAMPLES * SAMPLES) | 0]++;

      // Stretch between the 1st and 99th percentile, eased across frames against flicker.
      let sum = 0;
      let p1 = 0;
      while (p1 < 255 && (sum += hist[p1]) < n * 0.01) p1++;
      let p99 = p1;
      while (p99 < 255 && (sum += hist[++p99]) < n * 0.99);
      lo = lo < 0 ? p1 : lo + (p1 - lo) * 0.15;
      hi = hi < 0 ? p99 : hi + (p99 - hi) * 0.15;
      const range = Math.max(hi - lo, 64);

      // Unsharp mask against the 3x3 neighbourhood keeps outlines crisp.
      const blur = boxBlur(lum, cols, rows);
      const codes = new Uint8Array(cols);
      const lines = new Array(rows);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const i = r * cols + c;
          const v = lum[i] + 0.7 * (lum[i] - blur[i]);
          let level = Math.min(Math.max((v - lo) / range, 0), 1) ** 1.4 * (RAMP.length - 1);
          // Dither the faint end so dark areas thin out smoothly; round the rest.
          level = level < 2 ? Math.floor(level + BAYER[(r & 3) * 4 + (c & 3)]) : Math.round(level);
          codes[c] = RAMP.charCodeAt(level);
        }
        lines[r] = String.fromCharCode(...codes);
      }
      return lines.join('\n');
    }

    return self;
  }

  function boxBlur(values, cols, rows) {
    const across = new Float32Array(values.length);
    const out = new Float32Array(values.length);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        across[i] = (values[c ? i - 1 : i] + values[i] + values[c < cols - 1 ? i + 1 : i]) / 3;
      }
    }
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        out[i] = (across[r ? i - cols : i] + across[i] + across[r < rows - 1 ? i + cols : i]) / 3;
      }
    }
    return out;
  }

  function play(next) {
    if (next === source) return;
    source?.leave?.();
    source = next;
    fitted = '';
    source.enter();
  }

  function draw(now) {
    if (source) {
      const frame = source.frame(now);
      if (source.cols && fitted !== `${source.cols}x${source.rows}`) fit();
      if (frame != null) text.data = frame;
    }
    requestAnimationFrame(draw);
  }

  const api = {
    clip(src) {
      play((sources[src] ??= clipSource(src)));
    },
    video(element) {
      play(videoSource(element));
    },
    toggle() {
      source?.toggle();
      return api.paused;
    },
    get paused() {
      return Boolean(source?.paused);
    },
  };

  new ResizeObserver(() => {
    source?.resize();
    fitted = '';
  }).observe(box);
  requestAnimationFrame(draw);

  if (script.dataset.src) api.clip(script.dataset.src);
  if ('pauseOnTap' in script.dataset) {
    const status = document.getElementById('status');
    const toggle = () => {
      status.textContent = api.toggle() ? '  [pauze]' : '';
    };
    addEventListener('pointerdown', (e) => {
      if (e.button === 0) toggle();
    });
    addEventListener('keydown', (e) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        toggle();
      }
    });
  }
  return api;
})();
