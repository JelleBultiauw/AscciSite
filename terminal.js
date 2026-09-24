// The home page's terminal: type over the ASCII beluga, and paste a video link or
// /upload a file to watch that video in ASCII instead. Everything happens in the
// browser; videos are never sent anywhere.
(() => {
  const log = document.getElementById('log');
  const form = document.getElementById('prompt');
  const cmd = document.getElementById('cmd');
  const file = document.getElementById('file');
  const pre = document.getElementById('ascii');
  const BELUGA = 'Een zwemmende beluga, getekend met ASCII-tekens';
  // TikTok links go through the free tikwm.com API: browsers may call it, and the
  // video file it points to may be read too. Other sites' links are web pages that
  // only a human can turn into a file (on cobalt.tools, behind a bot check).
  const TIKTOK = /(^|\.)tiktok\.com$/;
  const PAGES = /(^|\.)(youtube\.com|youtu\.be|instagram\.com|facebook\.com|fb\.watch|vimeo\.com|x\.com|twitter\.com|twitch\.tv|reddit\.com|snapchat\.com|pinterest\.com|bsky\.app)$/;
  const history = [];
  let back = 0; // how far up the history the arrow keys are
  let video = null; // the <video> on screen
  let pending = null; // a <video> still loading, shown once its first frame is in
  let waiting = null; // a <video> the browser wouldn't start without a key press

  const commands = {
    help() {
      for (const [name, what] of [
        ['/upload', 'kies een video op je toestel'],
        ['<link>', 'plak een tiktok, of een link naar een videobestand'],
        ['', 'youtube en reels: download via cobalt.tools, dan /upload'],
        ['/beluga', 'terug naar de beluga'],
        ['/pauze', 'pauzeer of speel verder'],
        ['/geluid', 'geluid aan of uit'],
        ['/vids', 'naar de clips'],
        ['/clear', 'scherm leegmaken'],
      ]) {
        print(`${name.padEnd(9)}${what}`);
      }
    },
    upload() {
      const pick = document.createElement('label');
      pick.htmlFor = 'file';
      pick.className = 'pick';
      pick.textContent = '[bestand kiezen]';
      print(['kies een video: ', pick], 'hint');
      file.click();
    },
    beluga() {
      if (pending) discard(pending);
      pending = null;
      drop();
      window.ascii.clip('media/beluga');
      pre.setAttribute('aria-label', BELUGA);
      print('terug naar de beluga', 'hint');
    },
    pauze() {
      if (waiting) return start(waiting);
      print(window.ascii.toggle() ? 'gepauzeerd, typ /pauze om verder te spelen' : 'speelt verder', 'hint');
    },
    geluid() {
      if (!video) return print('de beluga heeft geen geluid', 'hint');
      video.muted = !video.muted;
      print(video.muted ? 'geluid uit' : 'geluid aan', 'hint');
    },
    vids() {
      location.href = 'vids/';
    },
    clear() {
      log.replaceChildren();
    },
  };
  commands.pause = commands.pauze;
  commands.sound = commands.geluid;

  function print(content, kind = '') {
    const line = document.createElement('div');
    line.className = `line ${kind}`;
    line.append(...[content].flat());
    log.append(line);
    // Nothing scrolls, so drop the oldest lines once the log fills 40% of the screen.
    while (log.childElementCount > 1 && log.offsetHeight > innerHeight * 0.4) log.firstElementChild.remove();
  }

  function echo(input) {
    print([...form.querySelector('label').cloneNode(true).childNodes, input]);
  }

  function run(input) {
    echo(input);
    const line = input.trim();
    if (!line) {
      if (waiting) start(waiting);
      return;
    }
    if (/^https?:\/\//i.test(line)) return openLink(line);
    const typed = line.split(/\s+/)[0];
    const word = typed.toLowerCase().replace(/^\//, '');
    if (Object.hasOwn(commands, word)) commands[word]();
    else print(`onbekend commando: ${typed}, typ /help`, 'error');
  }

  function openLink(url) {
    let host;
    try {
      host = new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return print('dat is geen geldige link', 'error');
    }
    if (TIKTOK.test(host)) return openTikTok(url);
    if (PAGES.test(host)) {
      const why = /youtu/.test(host)
        ? 'youtube blokkeert gratis converters voor websites'
        : /instagram/.test(host)
          ? "instagram geeft video's alleen aan wie ingelogd is"
          : 'dit is een webpagina, geen videobestand';
      return viaCobalt(url, why);
    }
    const element = makeVideo();
    element.crossOrigin = 'anonymous'; // needed to read the pixels of another site's video
    element.src = url;
    show(element, host);
  }

  async function openTikTok(url) {
    print('tiktok ophalen via tikwm.com...', 'hint');
    let found;
    try {
      found = await (await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`)).json();
    } catch {
      return print('tikwm.com is niet bereikbaar, probeer het zo nog eens', 'error');
    }
    const data = found?.code === 0 ? found.data : null;
    if (data?.images?.length) return print('dit is een fotopost, geen video', 'error');
    if (!data?.play) return viaCobalt(url, `tikwm vond deze tiktok niet (${found?.msg ?? 'geen antwoord'})`);
    const element = makeVideo();
    element.crossOrigin = 'anonymous';
    element.src = new URL(data.play, 'https://www.tikwm.com').href;
    show(element, data.author?.unique_id ? `tiktok van @${data.author.unique_id}` : 'tiktok', () =>
      viaCobalt(url, 'deze tiktok speelt niet af in je browser'),
    );
  }

  // cobalt.tools fills in the link from the part after '#'; the person saves the file.
  function viaCobalt(url, why) {
    const link = document.createElement('a');
    link.href = `https://cobalt.tools/#${url}`;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.className = 'pick';
    link.textContent = '[downloaden via cobalt.tools]';
    print(`${why}.`, 'error');
    print([link, ', en daarna /upload of sleep het bestand hierheen'], 'hint');
  }

  function openFile(picked) {
    if (picked.type && !picked.type.startsWith('video/')) {
      return print(`${picked.name} is geen video`, 'error');
    }
    const element = makeVideo();
    element.src = URL.createObjectURL(picked);
    show(element, picked.name);
  }

  function makeVideo() {
    const element = document.createElement('video');
    element.className = 'source';
    element.loop = true;
    element.playsInline = true;
    element.preload = 'auto';
    return element;
  }

  // `fallback` explains why a video can't be shown; TikTok's points to cobalt.tools.
  function show(element, name, fallback = (why) => print(why, 'error')) {
    print(`${name} laden...`, 'hint');
    if (pending) discard(pending);
    pending = element;
    video?.pause();
    element.addEventListener(
      'loadeddata',
      () => {
        if (pending !== element) return;
        pending = null;
        if (!readable(element)) {
          return fail(element, () =>
            fallback('deze site laat niet toe dat de beelden gelezen worden. sla de video op en gebruik /upload'),
          );
        }
        drop();
        video = element;
        window.ascii.video(video);
        pre.setAttribute('aria-label', `${name}, getekend met ASCII-tekens`);
        print('speelt nu in ascii, typ /beluga om terug te gaan', 'hint');
      },
      { once: true },
    );
    element.addEventListener(
      'error',
      () => {
        if (pending !== element) return;
        pending = null;
        fail(element, () =>
          fallback(
            element.crossOrigin
              ? 'kan deze link niet afspelen. het moet een directe link naar een videobestand zijn, op een server die dat toestaat. lukt het niet: sla de video op en gebruik /upload'
              : 'je browser kan dit videoformaat niet afspelen',
          ),
        );
      },
      { once: true },
    );
    // In the page (behind the ASCII) so phones treat it as visible and let it play.
    document.body.append(element);
    // Start right away, while the key press still counts: phones only load a video
    // once it plays, and only allow sound when a person started it.
    start(element);
  }

  // Tries with sound first; browsers that block that get a muted start instead.
  async function start(element) {
    waiting = null;
    try {
      element.muted = false;
      await element.play();
      return;
    } catch (error) {
      if (error.name !== 'NotAllowedError') return; // load errors are reported by 'error'
    }
    try {
      element.muted = true;
      await element.play();
      print('geluid staat uit, typ /geluid om het aan te zetten', 'hint');
    } catch (error) {
      if (error.name !== 'NotAllowedError') return;
      waiting = element;
      print('druk op enter om af te spelen', 'hint');
    }
  }

  function readable(element) {
    const probe = document.createElement('canvas').getContext('2d');
    probe.drawImage(element, 0, 0, 1, 1);
    try {
      probe.getImageData(0, 0, 1, 1);
      return true;
    } catch {
      return false;
    }
  }

  // The new video didn't work out: keep showing whatever was on screen.
  function fail(element, report) {
    discard(element);
    report();
    video?.play().catch(() => {});
  }

  function drop() {
    if (video) discard(video);
    video = null;
    waiting = null;
  }

  function discard(element) {
    if (waiting === element) waiting = null;
    element.pause();
    if (element.src.startsWith('blob:')) URL.revokeObjectURL(element.src);
    element.removeAttribute('src');
    element.load();
    element.remove();
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = cmd.value;
    cmd.value = '';
    back = 0;
    if (input.trim()) history.push(input);
    run(input);
  });

  cmd.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    back = Math.min(Math.max(back + (e.key === 'ArrowUp' ? 1 : -1), 0), history.length);
    cmd.value = back ? history[history.length - back] : '';
  });

  file.addEventListener('change', () => {
    const [picked] = file.files;
    file.value = '';
    if (picked) openFile(picked);
  });

  addEventListener('dragover', (e) => e.preventDefault());
  addEventListener('drop', (e) => {
    e.preventDefault();
    const [dropped] = e.dataTransfer.files;
    if (dropped) openFile(dropped);
  });

  // Keep typing going to the prompt: a tap or click anywhere focuses it (which
  // brings up the keyboard on phones), and so does typing on a real keyboard.
  // Cancelling pointerdown stops the mousedown that follows a tap from taking
  // the focus away again.
  const focus = () => cmd.focus({ preventScroll: true });
  const elsewhere = (e) => !e.target.closest('a, label, input');
  addEventListener('pointerdown', (e) => {
    if (elsewhere(e)) e.preventDefault();
  });
  addEventListener('pointerup', (e) => {
    if (elsewhere(e)) focus();
  });
  addEventListener('keydown', (e) => {
    if (document.activeElement === cmd) return;
    if (e.key.length === 1 && !e.altKey && (!(e.ctrlKey || e.metaKey) || e.key === 'v')) focus();
  });

  echo('./beluga');
  print("typ /help voor de commando's, of plak een link naar een video", 'hint');
  if (matchMedia('(pointer: fine)').matches) focus();
})();
