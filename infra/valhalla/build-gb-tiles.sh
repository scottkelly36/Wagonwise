#!/usr/bin/env bash
# Builds Valhalla routing tiles for the whole of Great Britain, on a TEMPORARY big droplet, and leaves
# the finished tiles in ./custom_files ready to copy to the serving droplet. Northern Ireland is not
# included (a separate Geofabrik extract; left out on purpose for now).
#
# Why a separate machine: building the national graph needs far more memory (roughly 16 to 32 GB) and
# several CPU cores than serving it does (about 8 GB). Build on a 16 GB / 8 vCPU droplet for a couple
# of hours, copy the tiles across, then DELETE the build droplet.
#
# UNTESTED at national scale as of 2026-10-07: this follows the image's documented settings and the
# regional build that is already live. Read docs/deployment-guide.md section 10 before relying on it.
#
# Run on the build droplet, in a clean directory, with Docker installed:
#   bash build-gb-tiles.sh
set -euo pipefail

GB_PBF_URL="${GB_PBF_URL:-https://download.geofabrik.de/europe/great-britain-latest.osm.pbf}"
WORKDIR="${WORKDIR:-$PWD/custom_files}"
mkdir -p "$WORKDIR"

# Concurrency: leave a core free for the system. The image reads this from `nproc` if unset.
THREADS="${THREADS:-$(( $(nproc) > 1 ? $(nproc) - 1 : 1 ))}"

echo "Building Great Britain tiles into $WORKDIR with $THREADS threads"
echo "Extract: $GB_PBF_URL"

docker run --rm \
  -v "$WORKDIR:/custom_files" \
  -e tile_urls="$GB_PBF_URL" \
  -e force_rebuild=True \
  -e use_tiles_ignore_pbf=False \
  -e build_elevation=False \
  -e build_admins=True \
  -e build_time_zones=True \
  -e build_tar=True \
  -e serve_tiles=False \
  -e server_threads="$THREADS" \
  ghcr.io/gis-ops/docker-valhalla/valhalla:latest

echo
echo "Done. Tiles and config are in $WORKDIR:"
ls -la "$WORKDIR" | head -20
echo
echo "Next: copy this whole directory to the serving droplet's custom_files (see deployment guide"
echo "section 10), restart the valhalla container, then run the golden-route checks."
