/**
 * The PowerShell side of the presence probe. Kept as one long-lived process
 * that answers single-word commands on stdin: spawning a shell every 30 s
 * would blow the idle-CPU budget on its own.
 *
 * No native module is used — this is P/Invoke through Add-Type (§8.5, §21).
 */
export const PROBE_SCRIPT = String.raw`
$ErrorActionPreference = 'SilentlyContinue'

Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;

public class CodexProbe {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  [StructLayout(LayoutKind.Sequential)] public struct MONITORINFO {
    public int cbSize; public RECT rcMonitor; public RECT rcWork; public uint dwFlags;
  }

  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
  [DllImport("user32.dll")] static extern IntPtr MonitorFromWindow(IntPtr hwnd, uint dwFlags);
  [DllImport("user32.dll")] static extern bool GetMonitorInfo(IntPtr hMonitor, ref MONITORINFO lpmi);
  [DllImport("user32.dll", CharSet = CharSet.Auto)] static extern int GetClassName(IntPtr hWnd, StringBuilder lpClassName, int nMaxCount);

  public static string ForegroundIsFullscreen() {
    IntPtr h = GetForegroundWindow();
    if (h == IntPtr.Zero) return "0";

    StringBuilder sb = new StringBuilder(256);
    GetClassName(h, sb, sb.Capacity);
    string cls = sb.ToString();
    // The desktop and the shell are always "fullscreen" and never mean it.
    if (cls == "Progman" || cls == "WorkerW" || cls == "Shell_TrayWnd" || cls == "Windows.UI.Core.CoreWindow") return "0";

    RECT r;
    if (!GetWindowRect(h, out r)) return "0";

    IntPtr mon = MonitorFromWindow(h, 2); // MONITOR_DEFAULTTONEAREST
    MONITORINFO mi = new MONITORINFO();
    mi.cbSize = Marshal.SizeOf(typeof(MONITORINFO));
    if (!GetMonitorInfo(mon, ref mi)) return "0";

    bool covers = r.Left <= mi.rcMonitor.Left && r.Top <= mi.rcMonitor.Top
               && r.Right >= mi.rcMonitor.Right && r.Bottom >= mi.rcMonitor.Bottom;
    return covers ? "1" : "0";
  }
}
"@

function Get-MicrophoneUsers {
  # LastUsedTimeStop == 0 means "still in use" (§8.5). The names are returned
  # rather than a bare flag, because some applications (Discord, Teams) hold
  # the capture device open for their whole lifetime; the Node side compares
  # against a baseline so only a *new* holder counts as a call.
  # The registry shape varies between builds, hence the belt-and-braces guards.
  $roots = @(
    'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\microphone\NonPackaged',
    'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\microphone'
  )
  $found = New-Object System.Collections.Generic.List[string]
  foreach ($root in $roots) {
    if (-not (Test-Path $root)) { continue }
    foreach ($key in (Get-ChildItem -Path $root -ErrorAction SilentlyContinue)) {
      $stop = (Get-ItemProperty -Path $key.PSPath -Name 'LastUsedTimeStop' -ErrorAction SilentlyContinue).LastUsedTimeStop
      if ($null -ne $stop -and [int64]$stop -eq 0) { $found.Add($key.PSChildName) }
    }
  }
  return ($found -join '|')
}

[Console]::Out.WriteLine('ready=1')
[Console]::Out.Flush()

while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) { break }
  switch ($line.Trim()) {
    'fs'   { [Console]::Out.WriteLine('fs=' + [CodexProbe]::ForegroundIsFullscreen()) }
    'mic'  { [Console]::Out.WriteLine('mic=' + (Get-MicrophoneUsers)) }
    'quit' { break }
    default { }
  }
  [Console]::Out.Flush()
}
`;
