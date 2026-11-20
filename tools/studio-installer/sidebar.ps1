# Build the NSIS sidebar from the existing, unchanged DD84 logo.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$bitmap = New-Object System.Drawing.Bitmap(164, 314)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$logo = [System.Drawing.Image]::FromFile((Join-Path $PSScriptRoot '../../products/dd84-desktop/assets/dd84-logo.png'))
$green = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(191, 217, 72))
$white = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
$heading = New-Object System.Drawing.Font('Segoe UI', 13, [System.Drawing.FontStyle]::Bold)
$small = New-Object System.Drawing.Font('Segoe UI', 8)
try {
  $graphics.Clear([System.Drawing.Color]::Black)
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.FillRectangle($green, 0, 0, 164, 5)
  $graphics.DrawImage($logo, 0, 47, 164, 110)
  $graphics.DrawString("CALIBRATION`nSTUDIO", $heading, $white, 12, 180)
  $graphics.DrawString('WINDOWS PREVIEW', $small, $green, 12, 279)
  $bitmap.Save((Join-Path $PSScriptRoot 'sidebar.bmp'), [System.Drawing.Imaging.ImageFormat]::Bmp)
} finally {
  $small.Dispose(); $heading.Dispose(); $white.Dispose(); $green.Dispose()
  $logo.Dispose(); $graphics.Dispose(); $bitmap.Dispose()
}
