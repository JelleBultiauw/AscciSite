// Plays pre-rendered ASCII video: <data-src>-wide.txt on landscape screens and
// <data-src>-tall.txt on portrait ones. Each file is a "cols rows frames fps"
// header followed by every frame's rows (see tools/ascii_video.py).
(() => {
  const src = document.currentScript.dataset.src;
  const box = document.querySelector('.screen');
  const pre = document.getElementById('ascii');
  const status = document.getElementById('status');
  const text = pre.appendChild(document.createTextNode('laden...'));
  const clips = {};
  let playing = null;
  let shown = -1;
  let paused = false;
  let offset = 0;
  let started = 0;
  let advance = 0;

  const layout = () => (innerWidth < innerHeight ? 'tall' : 'wide');

  // Parses the file as it streams in; `ready` fires once a second of frames is in.
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

  function load(name) {
    clips[name] ??= new Promise((resolve, reject) => {
      const clip = { frames: [], count: 0 };
      stream(`${src}-${name}.txt`, clip, () => resolve(clip)).catch((error) => {
        clip.count = clip.frames.length; // if the connection drops, loop what arrived
        reject(error);
      });
    });
    return clips[name];
  }

  async function show() {
    const name = layout();
    let next;
    try {
      next = await load(name);
    } catch {
      text.data = 'kon de video niet laden.';
      return;
    }
    if (name !== layout()) return;
    if (!playing) started = performance.now();
    playing = next;
    shown = -1;
    fit();
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
    const style = getComputedStyle(box);
    const width = box.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const height = box.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    const cell = Math.min(width / playing.cols, height / playing.rows / 2);
    pre.style.fontSize = `${cell / advance}px`;
    pre.style.lineHeight = `${cell * 2}px`;
  }

  function draw(now) {
    if (playing) {
      let time = paused ? offset : offset + now - started;
      // Still downloading: hold on the newest frame until more arrive.
      const loaded = playing.frames.length;
      const end = loaded < playing.count ? ((loaded - 1) * 1000) / playing.fps : Infinity;
      if (time > end) {
        time = offset = end;
        started = now;
      }
      // rAF timestamps can trail performance.now() slightly, so never go below zero.
      const i = Math.floor((Math.max(0, time) / 1000) * playing.fps) % playing.count;
      if (i !== shown) {
        text.data = playing.frames[i];
        shown = i;
      }
    }
    requestAnimationFrame(draw);
  }

  function toggle() {
    if (!playing) return;
    const now = performance.now();
    if (paused) started = now;
    else offset += now - started;
    paused = !paused;
    status.textContent = paused ? '  [pauze]' : '';
  }

  addEventListener('pointerdown', (e) => {
    if (e.button === 0) toggle();
  });
  addEventListener('keydown', (e) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      toggle();
    }
  });
  new ResizeObserver(show).observe(box);
  requestAnimationFrame(draw);
})();
