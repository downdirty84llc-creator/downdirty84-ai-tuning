; Studio never terminates a process to install, update or uninstall.
!include "WordFunc.nsh"
!macro customCheckAppRunning
  ${nsProcess::FindProcess} "${APP_EXECUTABLE_FILENAME}" $R0
  ${If} $R0 != 603
    MessageBox MB_OK|MB_ICONEXCLAMATION "Save your work and close all DD84 Calibration Studio windows before continuing. Setup will not close Studio for you." /SD IDOK
    SetErrorLevel 2
    Quit
  ${EndIf}
!macroend

!macro customInit
  ReadRegStr $R0 HKLM "SOFTWARE\Microsoft\Windows NT\CurrentVersion" "CurrentBuildNumber"
  ${If} $R0 < 22000
    MessageBox MB_OK|MB_ICONEXCLAMATION "This preview installer requires Windows 11 x64." /SD IDOK
    SetErrorLevel 2
    Quit
  ${EndIf}
  ReadRegStr $R0 HKCU "${UNINSTALL_REGISTRY_KEY}" "DisplayVersion"
  ${If} $R0 != ""
    ${VersionCompare} $R0 "${VERSION}" $R1
    ${If} $R1 == 1
      MessageBox MB_OK|MB_ICONEXCLAMATION "A newer Studio version is installed. This installer cannot downgrade it." /SD IDOK
      SetErrorLevel 2
      Quit
    ${EndIf}
  ${EndIf}
!macroend

!macro customUnInit
  ClearErrors
  ${GetParameters} $R0
  ${GetOptions} $R0 "--delete-app-data" $R1
  ${IfNot} ${Errors}
    MessageBox MB_OK|MB_ICONEXCLAMATION "Studio removal preserves your application data. The delete-app-data option is not supported." /SD IDOK
    SetErrorLevel 2
    Quit
  ${EndIf}
!macroend

!macro customWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "DD84 Calibration Studio ${VERSION} Preview"
  !ifdef DD84_SIGNED_BUILD
    !define DD84_SIGNING_LABEL "a signed development preview"
  !else
    !define DD84_SIGNING_LABEL "an unsigned development preview"
  !endif
  !define MUI_WELCOMEPAGE_TEXT "Install Studio for your Windows account and add a Start menu shortcut.$\r$\n$\r$\nThis is ${DD84_SIGNING_LABEL}. It supports local evidence review and defined calibration drafts. Native HPT/Holley writing and vehicle flashing are unavailable.$\r$\n$\r$\nSave your work and close Studio before installing or updating. Your saved projects and application data are preserved during normal removal."
  !insertmacro MUI_PAGE_WELCOME
!macroend
