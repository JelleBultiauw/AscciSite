# AscciSite

Live via GitHub Pages:

- https://jellebultiauw.github.io/AscciSite/ : een zwemmende beluga, alleen de walvis, in ASCII
- https://jellebultiauw.github.io/AscciSite/vids/ : vier clips achter elkaar, in ASCII

Zwarte, niet-scrollbare pagina's in terminalstijl. Tik, klik of druk op spatie om te pauzeren.

- `player.js` en `style.css` worden door beide pagina's gebruikt. De speler streamt de
  frames, kiest de brede of smalle versie op basis van de schermstand en schaalt het beeld passend.
- `media/*-wide.txt` (liggende schermen) en `media/*-tall.txt` (staande schermen)
  bevatten de ASCII-frames.
- `tools/ascii_video.py` maakt die frames opnieuw uit de originele video's:

  ```sh
  pip install numpy pillow scipy imageio-ffmpeg
  python3 tools/ascii_video.py beluga beluga.mp4
  python3 tools/ascii_video.py vids een.mp4 twee.mp4 drie.mp4 vier.mp4
  ```

Het lege bestand `.nojekyll` zorgt dat GitHub Pages alles ongewijzigd publiceert.
