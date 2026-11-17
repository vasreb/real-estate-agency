param([string]$List)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
Add-Type -AssemblyName System.Drawing
$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
$null = [Windows.Data.Pdf.PdfDocument, Windows.Data.Pdf, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.InMemoryRandomAccessStream, Windows.Storage.Streams, ContentType = WindowsRuntime]
$methods = [System.WindowsRuntimeSystemExtensions].GetMethods()
$asTaskOp = $methods | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' } | Select-Object -First 1
$asTaskAct = $methods | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncAction' } | Select-Object -First 1
function Await-Op($op, [Type]$resultType) {
  $task = $asTaskOp.MakeGenericMethod($resultType).Invoke($null, @($op))
  $task.Wait(-1) | Out-Null
  return $task.Result
}
function Await-Act($act) {
  $task = $asTaskAct.Invoke($null, @($act))
  $task.Wait(-1) | Out-Null
}
$codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$params = New-Object System.Drawing.Imaging.EncoderParameters(1)
$params.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]65)
$count = 0
foreach ($line in [System.IO.File]::ReadAllLines($List)) {
  if ($line.Trim() -eq '') { continue }
  $parts = $line.Split("`t")
  $in = $parts[0]; $outPrefix = $parts[1]
  $file = Await-Op ([Windows.Storage.StorageFile]::GetFileFromPathAsync($in)) ([Windows.Storage.StorageFile])
  $pdf = Await-Op ([Windows.Data.Pdf.PdfDocument]::LoadFromFileAsync($file)) ([Windows.Data.Pdf.PdfDocument])
  for ($i = 0; $i -lt $pdf.PageCount; $i++) {
    $page = $pdf.GetPage([uint32]$i)
    $stream = New-Object Windows.Storage.Streams.InMemoryRandomAccessStream
    $opts = New-Object Windows.Data.Pdf.PdfPageRenderOptions
    $opts.DestinationWidth = [uint32]1000
    Await-Act ($page.RenderToStreamAsync($stream, $opts))
    $net = [System.IO.WindowsRuntimeStreamExtensions]::AsStreamForRead($stream.GetInputStreamAt(0))
    $ms = New-Object System.IO.MemoryStream
    $net.CopyTo($ms)
    $net.Dispose(); $stream.Dispose()
    $img = [System.Drawing.Image]::FromStream($ms)
    $img.Save("$outPrefix-$i.jpg", $codec, $params)
    $img.Dispose(); $ms.Dispose()
  }
  $count++
}
Write-Output "rendered=$count"
