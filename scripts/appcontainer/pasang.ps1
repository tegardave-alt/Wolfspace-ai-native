# Menyiapkan AppContainer yang dipakai tool `bash` WOLFSPACE. Cukup SEKALI.
#
# Yang dilakukan:
#   1. membuat profil AppContainer (kalau belum ada) dan menurunkan SID-nya
#   2. memberi SID itu hak Modify pada folder workspace
#   3. memberi hak Baca+Jalankan pada folder runtime (node, git, dll)
#   4. memberi hak TRAVERSE pada tiap folder induk workspace, sampai akar drive
#
# Langkah 3 mudah dikira opsional. Bukan: program yang exe-nya terjangkau tapi
# DLL-nya tidak akan LOLOS diluncurkan lalu mati saat memuat pustaka, dengan
# kode 0xC0000142 dan keluaran KOSONG -- tanpa satu pun pesan galat. `ls`,
# `grep`, `sed` dan kawan-kawan dari Git for Windows semuanya begitu.
#
# Langkah 4 bukan pelebaran akses: traverse (X) hanya izin MELEWATI folder
# menuju anak yang disebut namanya, bukan izin melihat isinya, dan dipasang
# non-inherited sehingga adik-adik workspace tetap tertutup.
#
# TAPI JUJUR SOAL HASILNYA. Langkah ini dipasang untuk memperbaiki lokasi
# provider PowerShell (Set-Location gagal "Access is denied", lalu path relatif
# mendarat di drive lain). Sesudah dipasang, hasilnya diukur ulang dan dugaan
# itu TERBANTAH: Set-Location tetap ditolak. Yang memisahkan penyebabnya --
#   [IO.Directory]::SetCurrentDirectory(workspace)   BERHASIL
#   Set-Location -LiteralPath workspace              Access is denied
#   [IO.DriveInfo]::new('C:').VolumeLabel/TotalSize  KOSONG
# -- foldernya terjangkau penuh, informasi VOLUME drive-nya yang tidak. Itu
# pembatasan perangkat AppContainer, bukan ACL, dan tak ada hibah yang
# memperbaikinya. Langkah 4 dipertahankan karena murah dan tak berbahaya,
# bukan karena ia menyelesaikan sesuatu yang terukur.
#
# Butuh Administrator HANYA untuk langkah 4 pada C:\ dan C:\Users. Sisanya jalan
# sebagai user biasa. Kalau dijalankan tanpa elevasi, skrip tetap mengerjakan apa
# yang bisa lalu menyebut persis apa yang belum.
#
# ASCII murni: PowerShell 5.1 membaca .ps1 sebagai ANSI kalau tak ada BOM.
param(
  [string]$Nama = 'wolfspace-jail',
  [string]$Workspace = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path,
  [string[]]$Runtime = @('C:\langs', 'C:\Program Files\Git')
)
$ErrorActionPreference = 'Stop'

Add-Type -Namespace WSAC -Name P -MemberDefinition @'
[DllImport("userenv.dll", CharSet=CharSet.Unicode)]
public static extern int CreateAppContainerProfile(string name, string display, string desc,
  IntPtr caps, int capCount, out IntPtr sid);
[DllImport("userenv.dll", CharSet=CharSet.Unicode)]
public static extern int DeriveAppContainerSidFromAppContainerName(string name, out IntPtr sid);
[DllImport("advapi32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
public static extern bool ConvertSidToStringSid(IntPtr sid, out System.IntPtr str);
'@

function Tulis($tanda, $pesan) { Write-Host ("  " + $tanda.PadRight(9) + $pesan) }

# --- 1. profil ---
$sid = [IntPtr]::Zero
$hr = [WSAC.P]::CreateAppContainerProfile($Nama, $Nama, 'WOLFSPACE agent jail',
        [IntPtr]::Zero, 0, [ref]$sid)
# 0x800700B7 = ERROR_ALREADY_EXISTS, dibungkus sebagai HRESULT. Itu bukan galat.
if ($hr -eq 0) { Tulis 'dibuat' "profil '$Nama'" }
elseif ($hr -eq -2147024713) { Tulis 'ada' "profil '$Nama' sudah ada" }
else { Tulis 'GAGAL' ("membuat profil: 0x{0:X}" -f $hr); exit 1 }

$sid = [IntPtr]::Zero
$hr = [WSAC.P]::DeriveAppContainerSidFromAppContainerName($Nama, [ref]$sid)
if ($hr -ne 0) { Tulis 'GAGAL' ("menurunkan SID: 0x{0:X}" -f $hr); exit 1 }
$pStr = [IntPtr]::Zero
[void][WSAC.P]::ConvertSidToStringSid($sid, [ref]$pStr)
$SID = [Runtime.InteropServices.Marshal]::PtrToStringUni($pStr)
Tulis 'sid' $SID

function Beri($path, $hak, $wajibAdmin) {
  if (-not (Test-Path $path)) { Tulis 'lewat' "$path (tidak ada)"; return $true }
  $r = & icacls $path /grant ("*" + $SID + ":" + $hak) 2>&1
  if ($LASTEXITCODE -eq 0) { Tulis 'diberi' "$path  $hak"; return $true }
  if ($wajibAdmin) { Tulis 'PERLU' "Administrator untuk: icacls `"$path`" /grant *${SID}:$hak" }
  else { Tulis 'GAGAL' "$path  $hak" }
  return $false
}

# --- 2 & 3. isi kurungan ---
$ok = $true
$ok = (Beri $Workspace '(OI)(CI)(M)' $false) -and $ok
# Folder di Program Files butuh Administrator, dan bisa makan beberapa menit:
# Windows menyebarkan ulang pewarisan ke seluruh isinya.
foreach ($r in $Runtime) { $ok = (Beri $r '(OI)(CI)(RX)' $true) -and $ok }

# --- 4. rantai traverse ---
# Dari akar drive turun ke induk langsung workspace. Non-inherited, jadi TIDAK
# menurun ke folder lain: adik-adik workspace tetap tertutup.
$rantai = @()
$p = Split-Path $Workspace -Parent
while ($p) {
  $rantai = @($p) + $rantai
  $induk = Split-Path $p -Parent
  if ($induk -eq $p -or -not $induk) { break }
  $p = $induk
}
foreach ($d in $rantai) { $ok = (Beri $d '(X)' $true) -and $ok }

Write-Host ''
if ($ok) {
  Tulis 'SELESAI' 'AppContainer siap. Tool bash memakainya otomatis.'
} else {
  Tulis 'SEBAGIAN' 'Jalankan ulang skrip ini di PowerShell Administrator untuk'
  Tulis '' 'melengkapi hibah yang ditandai PERLU di atas. Tanpa itu bash tetap'
  Tulis '' 'terkurung, tapi path RELATIF di PowerShell tidak dapat diandalkan.'
}
