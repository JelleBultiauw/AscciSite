# AscciSite

Live via GitHub Pages: https://jellebultiauw.github.io/AscciSite/

Een zwarte, niet-scrollbare pagina in terminalstijl waarop een zwemmende beluga
volledig in ASCII-tekens afspeelt. Tik, klik of druk op spatie om te pauzeren.

- `index.html` speelt de frames af en schaalt ze passend op elk scherm.
- `media/beluga-wide.txt` (liggende schermen) en `media/beluga-tall.txt`
  (staande schermen, ingezoomd op de walvis) bevatten de ASCII-frames.
- `tools/ascii_video.py` maakt die frames opnieuw uit een video:

  ```sh
  pip install numpy pillow imageio-ffmpeg
  python3 tools/ascii_video.py beluga.mp4
  ```

Het lege bestand `.nojekyll` zorgt dat GitHub Pages alles ongewijzigd publiceert.
