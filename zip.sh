#!/bin/bash
rm -f yaku.zip
zip yaku.zip \
  manifest.json \
  service-worker.js \
  content.js \
  translator.js \
  popup.html \
  popup.js \
  base.css \
  icons/*.png
