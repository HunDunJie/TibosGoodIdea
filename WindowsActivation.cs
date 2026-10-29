using System;
using System.Runtime.InteropServices;
using System.Text;

namespace CodexBottomBar
{
    [ComImport, Guid("2E941141-7F97-4756-BA1D-9DECDE894A3D"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IApplicationActivationManager
    {
        [PreserveSig]
        int ActivateApplication(
            [MarshalAs(UnmanagedType.LPWStr)] string appUserModelId,
            [MarshalAs(UnmanagedType.LPWStr)] string arguments,
            uint options,
            out uint processId);
    }

    public static class WindowsActivation
    {
        [DllImport("ole32.dll", ExactSpelling = true)]
        private static extern int CoCreateInstance(ref Guid clsid, IntPtr outer, uint context,
            ref Guid iid, out IntPtr instance);

        [DllImport("ole32.dll", ExactSpelling = true)]
        private static extern int CoAllowSetForegroundWindow(IntPtr instance, IntPtr reserved);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern IntPtr OpenProcess(uint access, bool inherit, uint processId);

        [DllImport("kernel32.dll", ExactSpelling = true, CharSet = CharSet.Unicode)]
        private static extern int GetApplicationUserModelId(IntPtr process, ref uint length, StringBuilder identity);

        [DllImport("kernel32.dll", ExactSpelling = true)]
        private static extern bool CloseHandle(IntPtr handle);

        public static uint Activate(string appUserModelId, string arguments)
        {
            if (String.IsNullOrWhiteSpace(appUserModelId))
                throw new ArgumentException("A registered Windows app identity is required.");

            var clsid = new Guid("45BA127D-10A8-46EA-8AB7-56EA9078943C");
            var iid = typeof(IApplicationActivationManager).GUID;
            IntPtr pointer;
            // A local COM server owns the activation arguments after this short-lived launcher exits.
            Marshal.ThrowExceptionForHR(CoCreateInstance(ref clsid, IntPtr.Zero, 4, ref iid, out pointer));
            object instance = null;
            try
            {
                CoAllowSetForegroundWindow(pointer, IntPtr.Zero);
                instance = Marshal.GetObjectForIUnknown(pointer);
                uint processId;
                Marshal.ThrowExceptionForHR(((IApplicationActivationManager)instance)
                    .ActivateApplication(appUserModelId, arguments ?? "", 0, out processId));
                return processId;
            }
            finally
            {
                if (instance != null && Marshal.IsComObject(instance))
                    Marshal.FinalReleaseComObject(instance);
                Marshal.Release(pointer);
            }
        }

        public static string GetIdentity(uint processId)
        {
            var process = OpenProcess(0x1000, false, processId);
            if (process == IntPtr.Zero)
                throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
            try
            {
                uint length = 0;
                int error = GetApplicationUserModelId(process, ref length, null);
                if (error != 122)
                    throw new System.ComponentModel.Win32Exception(error);
                var identity = new StringBuilder((int)length);
                error = GetApplicationUserModelId(process, ref length, identity);
                if (error != 0)
                    throw new System.ComponentModel.Win32Exception(error);
                return identity.ToString();
            }
            finally { CloseHandle(process); }
        }
    }
}
