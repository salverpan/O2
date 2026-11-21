Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
root = fso.GetParentFolderName(WScript.ScriptFullName)
pyw = root & "\.venv\Scripts\pythonw.exe"
script = root & "\src\server.py"
If Not fso.FileExists(pyw) Then pyw = "pythonw"
sh.CurrentDirectory = root
On Error Resume Next
sh.Environment("Process").Remove "ELECTRON_RUN_AS_NODE"
sh.Environment("Process").Remove "CHROME_CRASHPAD_PIPE_NAME"
On Error GoTo 0
sh.Run """" & pyw & """ """ & script & """", 0, False
