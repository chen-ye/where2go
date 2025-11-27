#!/bin/bash

# Source icon
SOURCE="frontend/public/favicon.png"

# Destination directory
DEST_DIR="extension/icons"

# Ensure destination directory exists
mkdir -p "$DEST_DIR"

# Generate icons
echo "Generating extension icons from $SOURCE..."

# 128x128
cp "$SOURCE" "$DEST_DIR/icon128.png"
sips -Z 128 "$DEST_DIR/icon128.png" > /dev/null

# 48x48
cp "$SOURCE" "$DEST_DIR/icon48.png"
sips -Z 48 "$DEST_DIR/icon48.png" > /dev/null

# 16x16
cp "$SOURCE" "$DEST_DIR/icon16.png"
sips -Z 16 "$DEST_DIR/icon16.png" > /dev/null

echo "Icons generated successfully in $DEST_DIR"
