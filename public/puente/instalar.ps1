# WORLD3D - Instalador del puente de impresoras para la PC (Windows).
# Uso: copiar la linea del Manager (Maquinas -> Instalar) y pegarla en PowerShell. Trae la clave:
#   $env:W3D_CLAVE='...'; irm https://world3dcuentas.vercel.app/puente/instalar.ps1 | iex
# Deja todo en %LOCALAPPDATA%\WORLD3D-Puente y lo hace arrancar solo al prender la PC (sin ventana).

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$base = 'https://world3dcuentas.vercel.app'
$dir  = Join-Path $env:LOCALAPPDATA 'WORLD3D-Puente'
New-Item -ItemType Directory -Force -Path $dir | Out-Null

Write-Host ''
Write-Host '  WORLD3D - Puente de impresoras (PC principal)' -ForegroundColor DarkYellow
Write-Host ''

# 1. Node 22 o mas nuevo: el de la PC si ya hay uno, si no uno propio dentro de la carpeta
$node = $null
try {
  $v = & node -v 2>$null
  if ($v -match '^v(\d+)' -and [int]$Matches[1] -ge 22) { $node = (Get-Command node).Source }
} catch {}
if (-not $node) {
  $propio = Join-Path $dir 'node\node.exe'
  if (-not (Test-Path $propio)) {
    Write-Host 'Bajando Node (una sola vez, unos 30 MB)...'
    $sumas = (Invoke-WebRequest 'https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt' -UseBasicParsing).Content
    if ($sumas -is [byte[]]) { $sumas = [Text.Encoding]::UTF8.GetString($sumas) }
    $linea = ($sumas -split "`n" | Where-Object { $_ -match 'node-v[\d.]+-win-x64\.zip\s*$' } | Select-Object -First 1).Trim()
    $hash, $nombreZip = $linea -split '\s+'
    $zip = Join-Path $env:TEMP $nombreZip
    Invoke-WebRequest "https://nodejs.org/dist/latest-v22.x/$nombreZip" -OutFile $zip -UseBasicParsing
    if ((Get-FileHash $zip -Algorithm SHA256).Hash.ToLower() -ne $hash.ToLower()) { throw 'La descarga de Node vino danada. Proba de nuevo.' }
    $tmp = Join-Path $dir 'node-tmp'
    if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
    Expand-Archive $zip -DestinationPath $tmp -Force
    if (Test-Path (Join-Path $dir 'node')) { Remove-Item (Join-Path $dir 'node') -Recurse -Force }
    Move-Item (Get-ChildItem $tmp | Select-Object -First 1).FullName (Join-Path $dir 'node')
    Remove-Item $tmp -Recurse -Force; Remove-Item $zip -Force
  }
  $node = $propio
}

# 2. Programa del puente (siempre la ultima version)
Write-Host 'Bajando el puente...'
Invoke-WebRequest "$base/puente/puente.mjs" -OutFile (Join-Path $dir 'puente.mjs') -UseBasicParsing

# 3. Clave del Manager (Maquinas -> Conexion con las impresoras -> Copiar)
$archConfig = Join-Path $dir 'puente.json'
$viejo = $null
if (Test-Path $archConfig) { try { $viejo = Get-Content $archConfig -Raw | ConvertFrom-Json } catch {} }
$clave = "$env:W3D_CLAVE".Trim()
while ($clave.Length -lt 16) {
  $pista = if ($viejo -and $viejo.clave) { ' (Enter = la misma de antes)' } else { '' }
  $clave = (Read-Host "Pega la clave del puente que te muestra el Manager$pista").Trim()
  if (-not $clave -and $viejo -and $viejo.clave) { $clave = $viejo.clave }
  if ($clave.Length -lt 16) { Write-Host 'Esa clave es muy corta. Copiala de nuevo desde el Manager.' -ForegroundColor Red }
}
# La Elegoo sin clave de acceso usa la de fabrica (el puente la prueba solo). Si le pusiste una: $env:W3D_ELEGOO='...'
$elegoo = "$env:W3D_ELEGOO".Trim()
if (-not $elegoo -and $viejo -and $viejo.elegooClave) { $elegoo = $viejo.elegooClave }
$cfg = [ordered]@{ clave = $clave; fuente = 'pc'; servidor = "$base/api/puente" }
if ($elegoo) { $cfg.elegooClave = $elegoo }
[IO.File]::WriteAllText($archConfig, ($cfg | ConvertTo-Json))   # sin BOM, para que Node lo lea

# 4. Probar: busca las impresoras del wifi y muestra que ve (unos 15 s)
Write-Host ''
Write-Host 'Buscando las impresoras en el wifi (15 s)...' -ForegroundColor DarkYellow
Push-Location $dir
& $node puente.mjs --probar
Pop-Location

# 5. Arranque solo, sin ventana, y se levanta de nuevo si se cae
$bucle = Join-Path $dir 'arrancar.cmd'
[IO.File]::WriteAllText($bucle, "@echo off`r`ncd /d `"$dir`"`r`n:otra`r`n`"$node`" `"$dir\puente.mjs`"`r`nping -n 16 127.0.0.1 >nul`r`ngoto otra`r`n")
$vbs = Join-Path ([Environment]::GetFolderPath('Startup')) 'WORLD3D Puente.vbs'
[IO.File]::WriteAllText($vbs, "CreateObject(`"WScript.Shell`").Run `"cmd /c `"`"$bucle`"`"`", 0, False`r`n")

# Cerrar uno anterior y arrancar el nuevo
Get-CimInstance Win32_Process -Filter "Name='node.exe' OR Name='cmd.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -and ($_.CommandLine -like '*WORLD3D-Puente*') } |
  ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force } catch {} }
Start-Process wscript.exe -ArgumentList "`"$vbs`""

Write-Host ''
Write-Host '  Listo. El puente quedo funcionando y arranca solo cada vez que prendes la PC.' -ForegroundColor Green
Write-Host '  En el Manager (Maquinas) vas a ver "La PC esta leyendo las impresoras" en 1 o 2 minutos.'
Write-Host "  Registro: $dir\puente.log"
Write-Host ''
