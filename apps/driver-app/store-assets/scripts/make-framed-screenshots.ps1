Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = 'Stop'

# Framed store screenshots: a headline over a phone frame on WagonWise navy, 1080 x 1920 (Google Play phone size).
# Reads the raw screenshots in store-assets/raw and writes PNGs to store-assets/framed/.
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$raw = Join-Path $PSScriptRoot '..\raw' | Resolve-Path
$out = Join-Path $PSScriptRoot '..\framed'
New-Item -ItemType Directory -Force $out | Out-Null

$W = 1080; $H = 1920
$phoneW = 800            # frame width, including the bezel
$bezel = 16
$topCrop = 96            # the raw shots carry a status bar; the frame draws its own edge instead
$phoneTop = 440

$shots = @(
  @('00-map-home-raw.png',       '01-map',      "Your map,`nbuilt for HGV drivers"),
  @('01-trip-map-raw.png',       '02-trip',     "Turn-by-turn that`nknows your truck"),
  @('02-route-options-raw.png',  '03-routes',   "Routes that fit`nyour vehicle"),
  @('03-hazards-on-route-raw.png','04-hazards', "Hazards before`nyou reach them"),
  @('04-parking-card-raw.png',   '05-parking',  "Safe parking`nat a glance"),
  @('05-faster-route-raw.png',   '06-faster',   "A quicker way,`nwhen traffic builds"),
  @('06-report-hazard-raw.png',  '07-report',   "Warn the next driver`nin seconds"),
  @('08-job-detail-raw.png',     '08-job',      "Jobs from your firm,`non your phone")
)

function New-RoundedPath([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $p.AddArc($x, $y, $d, $d, 180, 90)
  $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $p.CloseFigure()
  return $p
}

foreach ($s in $shots) {
  $src = [System.Drawing.Bitmap]::FromFile((Join-Path $raw $s[0]))
  $canvas = New-Object System.Drawing.Bitmap $W, $H
  $g = [System.Drawing.Graphics]::FromImage($canvas)
  $g.SmoothingMode = 'HighQuality'; $g.InterpolationMode = 'HighQualityBicubic'; $g.TextRenderingHint = 'AntiAliasGridFit'; $g.PixelOffsetMode = 'HighQuality'

  # Background: navy with a soft blue glow top right.
  $bg = New-Object System.Drawing.Drawing2D.LinearGradientBrush ((New-Object System.Drawing.Point 0, 0), (New-Object System.Drawing.Point $W, $H), [System.Drawing.ColorTranslator]::FromHtml('#0B1220'), [System.Drawing.ColorTranslator]::FromHtml('#14264A'))
  $g.FillRectangle($bg, 0, 0, $W, $H)
  $glow = New-Object System.Drawing.Drawing2D.GraphicsPath
  $glow.AddEllipse(520, -320, 900, 900)
  $pgb = New-Object System.Drawing.Drawing2D.PathGradientBrush $glow
  $pgb.CenterColor = [System.Drawing.Color]::FromArgb(110, 26, 115, 232)
  $pgb.SurroundColors = @([System.Drawing.Color]::FromArgb(0, 26, 115, 232))
  $g.FillPath($pgb, $glow)

  # Headline, centred, wrapping inside the margins.
  $font = New-Object System.Drawing.Font 'Segoe UI Semibold', 66, ([System.Drawing.FontStyle]::Regular), ([System.Drawing.GraphicsUnit]::Pixel)
  $fmt = New-Object System.Drawing.StringFormat
  $fmt.Alignment = 'Center'; $fmt.LineAlignment = 'Center'
  $box = New-Object System.Drawing.RectangleF 70, 90, ($W - 140), 300
  $g.DrawString($s[2], $font, [System.Drawing.Brushes]::White, $box, $fmt)

  # Phone: bezel, then the screenshot inside it. It bleeds off the bottom edge.
  $screenW = $phoneW - 2 * $bezel
  $cropH = $src.Height - $topCrop
  $screenH = [int][Math]::Round($cropH * $screenW / $src.Width)
  $phoneH = $screenH + 2 * $bezel
  $px = ($W - $phoneW) / 2
  $outer = New-RoundedPath $px $phoneTop $phoneW $phoneH 70
  $frame = New-Object System.Drawing.Drawing2D.LinearGradientBrush ((New-Object System.Drawing.Point 0, $phoneTop), (New-Object System.Drawing.Point 0, ($phoneTop + 600)), [System.Drawing.ColorTranslator]::FromHtml('#2B3A57'), [System.Drawing.ColorTranslator]::FromHtml('#0A101C'))
  $g.FillPath($frame, $outer)

  $inner = New-RoundedPath ($px + $bezel) ($phoneTop + $bezel) $screenW $screenH 56
  $g.SetClip($inner)
  $srcRect = New-Object System.Drawing.Rectangle 0, $topCrop, $src.Width, $cropH
  $dstRect = New-Object System.Drawing.Rectangle ([int]($px + $bezel)), ($phoneTop + $bezel), $screenW, $screenH
  $g.DrawImage($src, $dstRect, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)
  $g.ResetClip()

  # Camera dot.
  $g.FillEllipse((New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#04070D'))), ($W / 2 - 11), ($phoneTop + $bezel + 18), 22, 22)

  $g.Dispose()
  $canvas.Save((Join-Path $out ($s[1] + '.png')), [System.Drawing.Imaging.ImageFormat]::Png)
  $canvas.Dispose(); $src.Dispose()
}
Get-ChildItem $out | Select-Object Name, @{n='KB'; e={[int]($_.Length / 1024)}} | Format-Table -AutoSize | Out-String
