; Keep the installer and uninstaller scoped to the current Windows user.
; This skips the unnecessary administrator / all-users selection page.
!macro customInstallMode
  StrCpy $isForceCurrentInstall "1"
!macroend
