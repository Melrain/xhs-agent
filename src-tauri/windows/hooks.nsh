; Migrate leftover Windows installs after productName / CJK-filename changes.
; Current Windows installer identity is ASCII `xhs-agent` (tauri.windows.conf.json).
; Window title stays `R7工作台`. Do not delete %APPDATA%\%BUNDLEID% app data.

!macro UnquoteInstallLocation VAR
  StrCpy $R0 ${VAR} 1
  ${If} $R0 == '"'
    StrLen $R0 ${VAR}
    IntOp $R0 $R0 - 2
    StrCpy ${VAR} ${VAR} $R0 1
  ${EndIf}
!macroend

!macro RemoveLegacyXhsInstall LEGACYNAME
  ${If} "${LEGACYNAME}" != "${PRODUCTNAME}"
    StrCpy $R7 ""
    StrCpy $R8 ""

    ReadRegStr $R7 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${LEGACYNAME}" "UninstallString"
    ReadRegStr $R8 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${LEGACYNAME}" "InstallLocation"
    ${If} $R7 == ""
      ReadRegStr $R7 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${LEGACYNAME}" "UninstallString"
      ReadRegStr $R8 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${LEGACYNAME}" "InstallLocation"
    ${EndIf}
    ${If} $R7 == ""
      ReadRegStr $R7 HKLM "Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\${LEGACYNAME}" "UninstallString"
      ReadRegStr $R8 HKLM "Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\${LEGACYNAME}" "InstallLocation"
    ${EndIf}

    ${If} $R8 == ""
      ReadRegStr $R8 HKCU "Software\${MANUFACTURER}\${LEGACYNAME}" ""
    ${EndIf}
    ${If} $R8 == ""
      ReadRegStr $R8 HKLM "Software\${MANUFACTURER}\${LEGACYNAME}" ""
    ${EndIf}

    !insertmacro UnquoteInstallLocation $R8

    ${If} $R8 == ""
      StrCpy $R8 "$LOCALAPPDATA\${LEGACYNAME}"
    ${EndIf}

    ${If} $R8 != ""
    ${AndIf} $R8 != "$INSTDIR"
      ${If} $R7 != ""
        DetailPrint "Removing leftover install: ${LEGACYNAME}"
        ExecWait '$R7 /S /P _?=$R8'
      ${ElseIf} ${FileExists} "$R8\uninstall.exe"
        DetailPrint "Removing leftover install: ${LEGACYNAME}"
        ExecWait '"$R8\uninstall.exe" /S /P _?=$R8'
      ${EndIf}

      ${If} ${FileExists} "$R8\${MAINBINARYNAME}.exe"
      ${OrIf} ${FileExists} "$R8\uninstall.exe"
        RMDir /r "$R8"
      ${EndIf}

      DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${LEGACYNAME}"
      DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${LEGACYNAME}"
      DeleteRegKey HKLM "Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\${LEGACYNAME}"
      DeleteRegKey HKCU "Software\${MANUFACTURER}\${LEGACYNAME}"
      DeleteRegKey HKLM "Software\${MANUFACTURER}\${LEGACYNAME}"
    ${EndIf}

    Delete "$DESKTOP\${LEGACYNAME}.lnk"
    Delete "$SMPROGRAMS\${LEGACYNAME}.lnk"
    Delete "$SMPROGRAMS\${LEGACYNAME}\${LEGACYNAME}.lnk"
    RMDir "$SMPROGRAMS\${LEGACYNAME}"
  ${EndIf}
!macroend

!macro RemoveAllLegacyXhsInstalls
  !insertmacro RemoveLegacyXhsInstall "小红书执行器"
  !insertmacro RemoveLegacyXhsInstall "R7工作台"
  !insertmacro RemoveLegacyXhsInstall "R7."
!macroend

!macro NSIS_HOOK_PREINSTALL
  !insertmacro RemoveAllLegacyXhsInstalls
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ; Retry after CheckIfAppIsRunning has closed the old binary.
  !insertmacro RemoveAllLegacyXhsInstalls

  ; /UPDATE skips shortcut creation, but leftover cleanup deleted the old names.
  ${If} $UpdateMode = 1
    ${IfNot} ${FileExists} "$SMPROGRAMS\${PRODUCTNAME}.lnk"
      CreateShortcut "$SMPROGRAMS\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
      !insertmacro SetLnkAppUserModelId "$SMPROGRAMS\${PRODUCTNAME}.lnk"
    ${EndIf}
    ${IfNot} ${FileExists} "$DESKTOP\${PRODUCTNAME}.lnk"
      CreateShortcut "$DESKTOP\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
      !insertmacro SetLnkAppUserModelId "$DESKTOP\${PRODUCTNAME}.lnk"
    ${EndIf}
  ${EndIf}
!macroend
