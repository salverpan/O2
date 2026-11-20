#define MyAppName "O2"
#define MyAppVersion "1.0.0"
#define MyAppExeName "O2.exe"

[Setup]
AppId={{8E4C1B2A-9D73-4F51-A6E8-3B7C19D4E250}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher=O2
DefaultDirName={localappdata}\Programs\{#MyAppName}
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
OutputDir=dist
OutputBaseFilename=O2-Setup
SetupIconFile=assets\app.ico
UninstallDisplayIcon={app}\{#MyAppExeName}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=lowest
ArchitecturesInstallIn64BitMode=x64compatible
CloseApplications=yes
RestartApplications=no
DisableWelcomePage=no

[Languages]
Name: "chs"; MessagesFile: "compiler:Default.isl"

[Messages]
SetupWindowTitle=安装 - O2
WelcomeLabel1=欢迎安装 O2
WelcomeLabel2=即将在您的电脑上安装 O2。%n%n建议在继续之前关闭其他应用程序。
ClickNext=点击「下一步」继续。
ClickInstall=点击「安装」开始安装。
ButtonNext=下一步(&N)
ButtonBack=上一步(&B)
ButtonCancel=取消
ButtonInstall=安装(&I)
ButtonFinish=完成
FinishedHeadingLabel=正在完成 O2 安装向导
FinishedLabel=O2 已安装完成，可从开始菜单打开。
ClickFinish=点击「完成」退出安装向导。
SelectDirLabel3=安装程序将把 O2 安装到下列文件夹。
SelectDirBrowseLabel=点击「下一步」继续。如需更换文件夹，请点击「浏览」。
SelectTasksLabel2=请选择要执行的附加任务，然后点击「下一步」。
InstallingLabel=正在安装 O2，请稍候。
StatusExtractFiles=正在解压文件...
ConfirmUninstall=确定要完全移除 O2 及其所有组件吗？
UninstalledAll=O2 已成功卸载。

[Tasks]
Name: "desktopicon"; Description: "创建桌面快捷方式"; GroupDescription: "附加选项"; Flags: checkedonce

[Files]
Source: "dist\O2\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "build\docs_pack\docs\*"; DestDir: "{app}\docs"; Flags: ignoreversion recursesubdirs createallsubdirs skipifsourcedoesntexist

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{group}\卸载 {#MyAppName}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "立即运行 {#MyAppName}"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
Type: filesandordirs; Name: "{app}\data"
Type: filesandordirs; Name: "{app}\config.json"
Type: filesandordirs; Name: "{localappdata}\{#MyAppName}"
