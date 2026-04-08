; ============================================================
; RPWorld Launcher - Custom NSIS Installer Hooks
; ============================================================
; Hooks executed by Tauri's NSIS bundler:
;   NSIS_HOOK_PREINSTALL  - before files are installed
;   NSIS_HOOK_POSTINSTALL - after files are installed
; ============================================================

!macro NSIS_HOOK_PREINSTALL
  ; --- Silent uninstall of any previous version ---
  ; Tauri v2 NSIS registers under multiple possible keys, check all

  ; Try currentUser uninstall key (Tauri v2 default)
  ReadRegStr $R0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\RPWorld Launcher_is1" "UninstallString"
  ${If} $R0 != ""
    ; Uninstall silently to the same INSTDIR to avoid path conflicts
    ExecWait '"$R0" /S _?=$INSTDIR'
    Sleep 500
  ${EndIf}

  ; Also check per-machine key just in case
  ReadRegStr $R1 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\RPWorld Launcher_is1" "UninstallString"
  ${If} $R1 != ""
    ExecWait '"$R1" /S _?=$INSTDIR'
    Sleep 500
  ${EndIf}

  ; Check by identifier as well
  ReadRegStr $R2 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\com.rpworld.launcher_is1" "UninstallString"
  ${If} $R2 != ""
    ExecWait '"$R2" /S _?=$INSTDIR'
    Sleep 500
  ${EndIf}
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ; --- Auto-launch RPWorld Launcher after installation ---
  ; Uses ExecShell so the installer can close cleanly afterwards
  ExecShell "open" "$INSTDIR\RPWorld Launcher.exe"
!macroend
