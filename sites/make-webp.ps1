$ErrorActionPreference = 'Stop'

# The landing page's screenshots are served as WebP (about a third smaller than the JPEGs). After remaking the JPEGs with
# apps/driver-app/store-assets/scripts/make-web-images.ps1, run this to turn the phone and dashboard pictures into WebP and
# remove the JPEGs. Needs Node (it fetches sharp-cli on the first run). The share picture (og-image.jpg) stays a JPEG: social
# sites do not all read WebP.
$img = Join-Path $PSScriptRoot 'landing\img'
Get-ChildItem $img -Filter '*.jpg' | Where-Object { $_.Name -match '^(phone|portal)-' } | ForEach-Object {
  npx --yes sharp-cli -i $_.FullName -o $img -f webp --quality 80
  if ($LASTEXITCODE -ne 0) { throw "could not convert $($_.Name)" }
  Remove-Item $_.FullName
}
Get-ChildItem $img | Select-Object Name, Length
