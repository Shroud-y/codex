// Fullscreen detection for the suppression rules (§8.5, §21) — P/Invoke only,
// no native module.
//
// This lives as a standalone source file so the build can precompile it into
// CodexProbe.dll (`pnpm probe-dll`). Compiling it at runtime through
// `Add-Type` cost 14-25 s on a cold machine — a csc.exe spawn, a fresh temp
// assembly, and Defender scanning a binary it had never seen — and every one
// of those landed in the login storm. Loading a stable, hash-cached DLL costs
// nothing measurable. `probeScript.ts` still falls back to compiling this file
// if the DLL is absent, so a dev checkout works without the build step.

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
