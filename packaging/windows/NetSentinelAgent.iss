#define AppName "NetSentinel Agent"
#ifndef AppVersion
  #define AppVersion "1.1.0"
#endif

[Setup]
AppName={#AppName}
AppVersion={#AppVersion}
DefaultDirName={autopf}\NetSentinelAgent
DefaultGroupName=NetSentinel Agent
OutputDir=..\..\dist\windows
OutputBaseFilename=NetSentinelAgent-{#AppVersion}-setup
Compression=lzma
SolidCompression=yes
WizardStyle=modern

[Files]
Source: "..\..\agent\install-windows.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\..\agent\runtime-windows.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\..\agent\README.md"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\..\agent\VERSION"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\NetSentinel Agent Installer"; Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -File ""{app}\install-windows.ps1"""
