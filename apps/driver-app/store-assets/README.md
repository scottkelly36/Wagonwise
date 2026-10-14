# Store and website assets

- `play-icon-512.png`, `play-feature-graphic-1024x500.png`: Google Play graphics.
- `raw/`: full-size driver-app screenshots taken on a local stack with dummy data.
- `../../dashboard/store-assets/raw/`: the same for the staff portal (1440x900).
- `framed/`: the eight raw screenshots framed with a headline, 1080 x 1920, ready for Google Play. Apple needs its own sizes (not made yet). `scripts/make-framed-screenshots.ps1` rebuilds them.
- `scripts/make-graphics.ps1`: rebuilds the icon and feature graphic.
- `scripts/make-web-images.ps1`: crops and compresses the raw screenshots into `sites/landing/img/`.

All screenshots use made-up data (fictional firm, example emails). Scripts are Windows PowerShell and expect the repo at `E:\projects\wagonwise`.
