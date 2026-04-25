; ============================================================
; RPWorld Launcher - Custom NSIS Installer Hooks
; ============================================================
!macro NSIS_HOOK_PREINSTALL
  ; Still silent uninstall
  ReadRegStr $R0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\com.rpworld.launcher_is1" "UninstallString"
  ${If} $R0 != ""
    ExecWait '"$R0" /S _?=$INSTDIR'
  ${EndIf}
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ; --- POSTINSTALL ONLY launch! ---
  ; Batch/stub should NEVER launch, only this hook.
!macroend
