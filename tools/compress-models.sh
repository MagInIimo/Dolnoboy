#!/bin/sh
# Quantizes and meshopt-compresses the Blender exports in place (GLTFLoader decodes with MeshoptDecoder).
#   sh tools/compress-models.sh game/assets/models/cars.glb ...
G="$(dirname "$0")/node_modules/.bin/gltf-transform"
for f in "$@"; do
  "$G" meshopt "$f" "$f.tmp.glb" --level medium && mv "$f.tmp.glb" "$f"
done
