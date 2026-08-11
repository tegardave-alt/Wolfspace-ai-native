@echo off
REM Mengompilasi peluncur AppContainer. csc.exe ada di .NET Framework yang
REM terpasang bawaan di Windows -- tak ada dependensi yang perlu diunduh.
setlocal
set CSC=%SystemRoot%\Microsoft.NET\Framework64\v4.0.30319\csc.exe
if not exist "%CSC%" (
  echo csc.exe tak ditemukan di %CSC%
  exit /b 1
)
"%CSC%" -nologo -optimize -platform:x64 -out:"%~dp0AcLaunch.exe" "%~dp0AcLaunch.cs"
