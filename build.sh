#!/usr/bin/env bash
# Builds assets/app.js (all modules in src/, bundled) and assets/app.css (Tailwind).
# Run `npm install` once first.
set -e
cd "$(dirname "$0")"
npx esbuild src/main.js --bundle --format=iife --target=es2020 --minify --sourcemap --outfile=assets/app.js --log-level=warning
npx tailwindcss -c tailwind.config.js -i tailwind.in.css -o assets/app.css --minify
echo "Listo: assets/app.js y assets/app.css"
