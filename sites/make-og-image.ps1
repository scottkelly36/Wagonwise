Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = 'Stop'

# The picture shown when the landing page is shared (Facebook, LinkedIn, WhatsApp, search results): 1200 x 630.
# Same look as the Play feature graphic. Reads the app icon from the store assets and writes sites/landing/img/og-image.jpg.
$root = Split-Path -Parent $PSScriptRoot
$icon = [System.Drawing.Bitmap]::FromFile((Join-Path $root 'apps\driver-app\store-assets\play-icon-512.png'))
$out = Join-Path $PSScriptRoot 'landing\img\og-image.jpg'

$W = 1200; $H = 630
$bmp = New-Object System.Drawing.Bitmap $W, $H
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = 'HighQuality'; $g.InterpolationMode = 'HighQualityBicubic'; $g.TextRenderingHint = 'AntiAliasGridFit'

$rect = New-Object System.Drawing.Rectangle 0, 0, $W, $H
$bg = New-Object System.Drawing.Drawing2D.LinearGradientBrush $rect, ([System.Drawing.Color]::FromArgb(255, 11, 18, 32)), ([System.Drawing.Color]::FromArgb(255, 27, 42, 68)), 20.0
$g.FillRectangle($bg, $rect)

# A soft blue road sweeping across the bottom, echoing the icon.
$road = New-Object System.Drawing.Drawing2D.GraphicsPath
$road.AddBezier(-20, 590, 300, 480, 620, 650, 1220, 500)
$roadPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(70, 26, 115, 232)), 56
$roadPen.StartCap = 'Round'; $roadPen.EndCap = 'Round'
$g.DrawPath($roadPen, $road)
$linePen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(120, 96, 165, 250)), 6
$g.DrawPath($linePen, $road)

# The app icon, rounded, on the right.
$size = 380; $ix = 740; $iy = 110; $r = 86
$rp = New-Object System.Drawing.Drawing2D.GraphicsPath
$rp.AddArc($ix, $iy, $r, $r, 180, 90); $rp.AddArc($ix + $size - $r, $iy, $r, $r, 270, 90)
$rp.AddArc($ix + $size - $r, $iy + $size - $r, $r, $r, 0, 90); $rp.AddArc($ix, $iy + $size - $r, $r, $r, 90, 90)
$rp.CloseFigure()
$g.SetClip($rp)
$g.DrawImage($icon, $ix, $iy, $size, $size)
$g.ResetClip()

# Text.
$white = [System.Drawing.Brushes]::White
$blue = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 96, 165, 250))
$muted = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 203, 213, 225))
$fName = New-Object System.Drawing.Font 'Segoe UI Semibold', 36, ([System.Drawing.FontStyle]::Regular), ([System.Drawing.GraphicsUnit]::Pixel)
$fHead = New-Object System.Drawing.Font 'Segoe UI', 70, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
$fSub = New-Object System.Drawing.Font 'Segoe UI', 31, ([System.Drawing.FontStyle]::Regular), ([System.Drawing.GraphicsUnit]::Pixel)
$g.DrawString('WagonWise', $fName, $blue, 70, 96)
$g.DrawString("Navigation made`nfor HGV drivers", $fHead, $white, 64, 156)
$g.DrawString("Routes that fit your lorry, hazards from`nother drivers, safe parking, and a fleet`ndashboard. Free for drivers.", $fSub, $muted, 70, 350)
$g.Dispose()

$codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$params = New-Object System.Drawing.Imaging.EncoderParameters 1
$params.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality), 86L
$bmp.Save($out, $codec, $params)
$bmp.Dispose(); $icon.Dispose()
Get-Item $out | Select-Object Name, Length
