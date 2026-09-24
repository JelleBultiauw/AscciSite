# AscciSite

Live via GitHub Pages:

- https://jellebultiauw.github.io/AscciSite/ : een zwemmende beluga in ASCII, met een terminal erover
- https://jellebultiauw.github.io/AscciSite/vids/ : vier clips achter elkaar, in ASCII

Zwarte, niet-scrollbare pagina's in terminalstijl.

## De terminal

Op de homepagina kun je typen. Commando's:

| commando  | wat het doet                                                |
|-----------|-------------------------------------------------------------|
| `/upload` | kies een video op je toestel (of sleep er een op de pagina) |
| `<link>`  | plak een link naar een videobestand (.mp4, .webm)           |
| `/beluga` | terug naar de beluga                                        |
| `/pauze`  | pauzeer of speel verder                                     |
| `/geluid` | geluid aan of uit                                           |
| `/vids`   | naar de clips                                               |
| `/clear`  | scherm leegmaken                                            |

De gekozen video wordt in de browser live naar ASCII omgezet en niet geüpload: alleen
wie hem kiest ziet hem. Links werken alleen als ze direct naar een videobestand wijzen
op een server die andere sites toegang geeft (CORS). Links naar YouTube, TikTok en
dergelijke zijn webpagina's; sla zo'n video eerst op en gebruik `/upload`.

## Downloads

- https://jellebultiauw.github.io/AscciSite/media/beluga-ascii-liggend.mp4 (1920x1080)
- https://jellebultiauw.github.io/AscciSite/media/beluga-ascii-staand.mp4 (1080x1920)

## Bestanden

- `player.js` tekent video als ASCII: de vooraf omgezette clips (gestreamd, brede of
  smalle versie naargelang de schermstand) of een `<video>` die live wordt omgezet.
- `terminal.js` is de terminal op de homepagina. `style.css` hoort bij beide pagina's.
- `media/*-wide.txt` en `media/*-tall.txt` bevatten de ASCII-frames.
- `tools/ascii_video.py` maakt die frames uit de originele video's, en
  `tools/render_mp4.py` maakt er weer een MP4 van:

  ```sh
  pip install numpy pillow scipy imageio-ffmpeg
  python3 tools/ascii_video.py beluga beluga.mp4
  python3 tools/ascii_video.py vids een.mp4 twee.mp4 drie.mp4 vier.mp4
  python3 tools/render_mp4.py media/beluga-wide.txt media/beluga-ascii-liggend.mp4 1920x1080
  ```

Het lege bestand `.nojekyll` zorgt dat GitHub Pages alles ongewijzigd publiceert.
