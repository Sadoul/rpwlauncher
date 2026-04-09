; ============================================================
; RPWorld Launcher - Custom NSIS Installer Hooks
; ============================================================
; The Tauri NSIS bundler names the binary after the Cargo package name.
; Package name: rpw-launcher → installed as rpw-launcher.exe
; ============================================================

!macro NSIS_HOOK_PREINSTALL
  ; --- Silent uninstall of any previous version ---
  ReadRegStr $R0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\com.rpworld.launcher_is1" "UninstallString"
  ${If} $R0 != ""
    ExecWait '"$R0" /S _?=$INSTDIR'
    Sleep 800
  ${EndIf}

  ReadRegStr $R1 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\RPWorld Launcher_is1" "UninstallString"
  ${If} $R1 != ""
    ExecWait '"$R1" /S _?=$INSTDIR'
    Sleep 800
  ${EndIf}
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ; --- Auto-launch RPWorld Launcher after installation ---
  ; Try the Cargo binary name first (rpw-launcher.exe), then productName fallback
  IfFileExists "$INSTDIR\rpw-launcher.exe" 0 +3
    ExecShell "open" "$INSTDIR\rpw-launcher.exe"
    Goto done
  IfFileExists "$INSTDIR\RPWorld Launcher.exe" 0 done
    ExecShell "open" "$INSTDIR\RPWorld Launcher.exe"
  done:
!macroend
