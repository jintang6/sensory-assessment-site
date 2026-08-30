#!/bin/sh
set -eu

PROJECT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
BUILD_DIR="$PROJECT_DIR/dist"

if [ -d "$BUILD_DIR" ]; then
  find "$BUILD_DIR" -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +
else
  mkdir -p "$BUILD_DIR"
fi

cp "$PROJECT_DIR/index.html" "$BUILD_DIR/index.html"
cp "$PROJECT_DIR/styles.css" "$BUILD_DIR/styles.css"
cp "$PROJECT_DIR/app.js" "$BUILD_DIR/app.js"
cp "$PROJECT_DIR/admin.html" "$BUILD_DIR/admin.html"
cp "$PROJECT_DIR/admin.css" "$BUILD_DIR/admin.css"
cp "$PROJECT_DIR/admin.js" "$BUILD_DIR/admin.js"
cp "$PROJECT_DIR/report-docx.js" "$BUILD_DIR/report-docx.js"
cp "$PROJECT_DIR/_routes.json" "$BUILD_DIR/_routes.json"
mkdir -p "$BUILD_DIR/vendor"
cp "$PROJECT_DIR/vendor/docx.umd.js" "$BUILD_DIR/vendor/docx.umd.js"
cp "$PROJECT_DIR/vendor/docx.LICENSE.txt" "$BUILD_DIR/vendor/docx.LICENSE.txt"
