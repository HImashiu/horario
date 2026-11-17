#!/usr/bin/env bash
# Regenera assets/app.css a partir de las clases usadas en index.html
set -e
npx tailwindcss@3.4.16 -c tailwind.config.js -i tailwind.in.css -o assets/app.css --minify
