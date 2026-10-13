Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = 'Stop'
$root = 'E:\projects\wagonwise\apps\driver-app'
$out = Join-Path $root 'store-assets'
New-Item -ItemType Directory -Force $out | Out-Null

# --- 1. The source icon, with its white corners filled with the navy of the artwork. ---
$src = [System.Drawing.Bitmap]::FromFile((Join-Path $root 'assets\images\icon.png'))
$w = $src.Width
$full = New-Object System.Drawing.Bitmap $w, $w
$g0 = [System.Drawing.Graphics]::FromImage($full); $g0.DrawImage($src, 0, 0, $w, $w); $g0.Dispose()
$navy = $src.GetPixel(200, 60)
function Bright($c) { return ($c.R + $c.G + $c.B) / 3 }
# Flood fill from each corner through light pixels only: that is the white outside the rounded shape.
$seen = New-Object 'bool[,]' $w, $w
$q = New-Object System.Collections.Generic.Queue[object]
foreach ($pt in @(@(0,0), @(($w-1),0), @(0,($w-1)), @(($w-1),($w-1)))) { $q.Enqueue($pt); $seen[$pt[0], $pt[1]] = $true }
$outside = New-Object System.Collections.Generic.List[object]
while ($q.Count -gt 0) {
  $pt = $q.Dequeue(); $x = $pt[0]; $y = $pt[1]
  if ((Bright ($src.GetPixel($x, $y))) -le 150) { continue }
  $outside.Add($pt)
  foreach ($d in @(@(1,0), @(-1,0), @(0,1), @(0,-1))) {
    $nx = $x + $d[0]; $ny = $y + $d[1]
    if ($nx -ge 0 -and $ny -ge 0 -and $nx -lt $w -and $ny -lt $w -and -not $seen[$nx, $ny]) { $seen[$nx, $ny] = $true; $q.Enqueue(@($nx, $ny)) }
  }
}
foreach ($pt in $outside) { $full.SetPixel($pt[0], $pt[1], $navy) }
# Soften the thin light fringe left by the edge's anti-aliasing: any lighter pixel touching the filled area.
for ($pass = 0; $pass -lt 3; $pass++) {
  $more = New-Object System.Collections.Generic.List[object]
  foreach ($pt in $outside) {
    foreach ($d in @(@(1,0), @(-1,0), @(0,1), @(0,-1))) {
      $nx = $pt[0] + $d[0]; $ny = $pt[1] + $d[1]
      if ($nx -ge 0 -and $ny -ge 0 -and $nx -lt $w -and $ny -lt $w) {
        $c = $full.GetPixel($nx, $ny)
        if ((Bright $c) -gt 85 -and (Bright $c) -le 150) { $full.SetPixel($nx, $ny, $navy); $more.Add(@($nx, $ny)) }
      }
    }
  }
  $outside = $more
}

function Save-Resized($bmp, $size, $path) {
  $o = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($o)
  $g.InterpolationMode = 'HighQualityBicubic'; $g.SmoothingMode = 'HighQuality'; $g.PixelOffsetMode = 'HighQuality'
  $g.DrawImage($bmp, 0, 0, $size, $size)
  $g.Dispose(); $o.Save($path, [System.Drawing.Imaging.ImageFormat]::Png); $o.Dispose()
}
Save-Resized $full 512 (Join-Path $out 'play-icon-512.png')

# --- 2. Feature graphic 1024 x 500. ---
$W = 1024; $H = 500
$fg = New-Object System.Drawing.Bitmap $W, $H
$g = [System.Drawing.Graphics]::FromImage($fg)
$g.SmoothingMode = 'HighQuality'; $g.InterpolationMode = 'HighQualityBicubic'; $g.TextRenderingHint = 'AntiAliasGridFit'

$rect = New-Object System.Drawing.Rectangle 0, 0, $W, $H
$bg = New-Object System.Drawing.Drawing2D.LinearGradientBrush $rect, ([System.Drawing.Color]::FromArgb(255, 11, 18, 32)), ([System.Drawing.Color]::FromArgb(255, 27, 42, 68)), 20.0
$g.FillRectangle($bg, $rect)

# A soft blue road sweeping across the bottom, echoing the icon.
$roadPath = New-Object System.Drawing.Drawing2D.GraphicsPath
$roadPath.AddBezier(-20, 470, 260, 380, 520, 520, 1044, 400)
$roadPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(70, 26, 115, 232)), 46
$roadPen.StartCap = 'Round'; $roadPen.EndCap = 'Round'
$g.DrawPath($roadPen, $roadPath)
$linePen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(120, 96, 165, 250)), 5
$g.DrawPath($linePen, $roadPath)

# The app icon, rounded, on the right with a soft shadow.
$size = 330; $ix = 640; $iy = 85
$rp = New-Object System.Drawing.Drawing2D.GraphicsPath
$r = 74
$rp.AddArc($ix, $iy, $r, $r, 180, 90); $rp.AddArc($ix + $size - $r, $iy, $r, $r, 270, 90)
$rp.AddArc($ix + $size - $r, $iy + $size - $r, $r, $r, 0, 90); $rp.AddArc($ix, $iy + $size - $r, $r, $r, 90, 90)
$rp.CloseFigure()
$g.SetClip($rp)
$g.DrawImage($full, $ix, $iy, $size, $size)
$g.ResetClip()

# Text.
$white = [System.Drawing.Brushes]::White
$blue = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 96, 165, 250))
$muted = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 203, 213, 225))
$fName = New-Object System.Drawing.Font 'Segoe UI Semibold', 30, ([System.Drawing.FontStyle]::Regular), ([System.Drawing.GraphicsUnit]::Pixel)
$fHead = New-Object System.Drawing.Font 'Segoe UI', 54, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
$fSub = New-Object System.Drawing.Font 'Segoe UI', 26, ([System.Drawing.FontStyle]::Regular), ([System.Drawing.GraphicsUnit]::Pixel)
$g.DrawString('WagonWise', $fName, $blue, 60, 62)
$g.DrawString("Navigation made`nfor HGV drivers", $fHead, $white, 56, 112)
$g.DrawString("Avoid low bridges. See hazards ahead.`nFind safe parking.", $fSub, $muted, 60, 290)

# Three small ticks.
$tickFont = New-Object System.Drawing.Font 'Segoe UI', 22, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
$g.Dispose()
$fg.Save((Join-Path $out 'play-feature-graphic-1024x500.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$fg.Dispose(); $full.Dispose(); $src.Dispose()
Get-ChildItem $out | Select-Object Name, Length
