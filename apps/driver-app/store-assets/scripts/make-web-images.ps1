Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = 'Stop'
$root = 'E:\projects\wagonwise'
$out = Join-Path $root 'sites\landing\img'
New-Item -ItemType Directory -Force $out | Out-Null

$jpeg = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
function Save-Jpeg($bmp, $path, $quality) {
  $params = New-Object System.Drawing.Imaging.EncoderParameters 1
  $params.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality), ([long]$quality)
  $bmp.Save($path, $jpeg, $params)
}
function Resize($src, $cropTop, $width) {
  $h = $src.Height - $cropTop
  $height = [int][Math]::Round($h * $width / $src.Width)
  $dst = New-Object System.Drawing.Bitmap $width, $height
  $g = [System.Drawing.Graphics]::FromImage($dst)
  $g.InterpolationMode = 'HighQualityBicubic'; $g.SmoothingMode = 'HighQuality'; $g.PixelOffsetMode = 'HighQuality'
  $srcRect = New-Object System.Drawing.Rectangle 0, $cropTop, $src.Width, $h
  $dstRect = New-Object System.Drawing.Rectangle 0, 0, $width, $height
  $g.DrawImage($src, $dstRect, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)
  $g.Dispose()
  return $dst
}

# Phone screens: take the status bar off, since a phone frame draws its own.
$phones = @{
  'phone-map'      = '00-map-home-raw.png'
  'phone-trip'     = '01-trip-map-raw.png'
  'phone-route'    = '02-route-options-raw.png'
  'phone-hazards'  = '03-hazards-on-route-raw.png'
  'phone-parking'  = '04-parking-card-raw.png'
  'phone-faster'   = '05-faster-route-raw.png'
  'phone-report'   = '06-report-hazard-raw.png'
  'phone-job'      = '08-job-detail-raw.png'
}
foreach ($k in $phones.Keys) {
  $src = [System.Drawing.Bitmap]::FromFile((Join-Path $root "apps\driver-app\store-assets\raw\$($phones[$k])"))
  $dst = Resize $src 96 540
  Save-Jpeg $dst (Join-Path $out "$k.jpg") 82
  $dst.Dispose(); $src.Dispose()
}

# Portal screens.
$portal = @('overview', 'live-map', 'job-profit', 'looking-ahead', 'maintenance', 'check-results')
foreach ($k in $portal) {
  $src = [System.Drawing.Bitmap]::FromFile((Join-Path $root "apps\dashboard\store-assets\raw\$k.png"))
  $dst = Resize $src 0 1280
  Save-Jpeg $dst (Join-Path $out "portal-$k.jpg") 84
  $dst.Dispose(); $src.Dispose()
}

# Icon for the page and the browser tab.
$icon = [System.Drawing.Bitmap]::FromFile((Join-Path $root 'apps\driver-app\store-assets\play-icon-512.png'))
foreach ($size in 192, 64) {
  $dst = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($dst); $g.InterpolationMode = 'HighQualityBicubic'; $g.DrawImage($icon, 0, 0, $size, $size); $g.Dispose()
  $dst.Save((Join-Path $out "icon-$size.png"), [System.Drawing.Imaging.ImageFormat]::Png); $dst.Dispose()
}
$icon.Dispose()
Get-ChildItem $out | Select-Object Name, @{n='KB';e={[int]($_.Length/1024)}} | Format-Table -AutoSize | Out-String
