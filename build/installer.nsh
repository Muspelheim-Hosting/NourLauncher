; Custom NSIS Script for Nour Launcher
; Uses the recommended macros approach for electron-builder

; Custom header - executed before any other code
!macro customHeader
  !ifndef MUI_BGCOLOR
    !define MUI_BGCOLOR "101020"
  !endif
  !ifndef MUI_TEXTCOLOR
    !define MUI_TEXTCOLOR "FFFFFF"
  !endif
!macroend

; Pre-initialization - executed at the beginning of the .onInit callback
!macro preInit
  ; Pre-initialization code here
!macroend

; Custom initialization - executed in the .onInit callback after preInit
!macro customInit
  ; Custom initialization code here
!macroend

; Custom welcome page - only used if oneClick is false
!macro customWelcomePage
  !ifndef MUI_WELCOMEPAGE_TITLE
    !define MUI_WELCOMEPAGE_TITLE "Welcome to Nour Launcher"
  !endif
  !ifndef MUI_WELCOMEPAGE_TEXT
    !define MUI_WELCOMEPAGE_TEXT "This wizard will guide you through the installation of Nour Launcher.$\r$\n$\r$\Nour Launcher is a custom launcher for modded Minecraft, designed for Nour's Twitch Server.$\r$\n$\r$\nClick Next to continue."
  !endif
!macroend

; Custom installation mode - used to force per-machine or per-user installation
!macro customInstallMode
  ; Uncomment to force per-machine installation
  ; $isForceMachineInstall = 1
  
  ; Uncomment to force per-user installation
  ; $isForceCurrentInstall = 1
!macroend

; Custom installation - executed during the installation process
!macro customInstall
  ; Custom installation steps go here
  DetailPrint "Installing Nour Launcher..."
!macroend

; Custom uninstall welcome page - only used if oneClick is false
!macro customUnWelcomePage
  !ifndef MUI_WELCOMEPAGE_TITLE
    !define MUI_WELCOMEPAGE_TITLE "Uninstall Nour Launcher"
  !endif
  !ifndef MUI_WELCOMEPAGE_TEXT
    !define MUI_WELCOMEPAGE_TEXT "This wizard will guide you through the uninstallation of Nour Launcher.$\r$\n$\r$\nBefore starting, please make sure Nour Launcher is not running.$\r$\n$\r$\nClick Next to continue."
  !endif
!macroend

; Custom uninstallation - executed during the uninstallation process
!macro customUnInstall
  ; Custom uninstallation steps go here
  DetailPrint "Uninstalling Nour Launcher..."
!macroend