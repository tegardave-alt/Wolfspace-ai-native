// Peluncur proses di dalam AppContainer Windows.
//
// KENAPA BINER, BUKAN SKRIP. Enam versi PowerShell gagal berturut-turut, dan
// hampir semuanya bukan karena Windows: backslash termakan lapisan kutip,
// STARTUPINFO di-marshal ANSI padahal CreateProcessW butuh Unicode, dan
// penugasan ke medan struct bersarang tidak menempel karena PowerShell
// mengembalikan salinan. Di C# ketiganya tak ada.
//
// APA YANG DIURUNG. Proses di dalam AppContainer memakai token dengan SID
// container. Pemeriksaan akses berkas jadi WAJIB menyertakan SID itu di DACL
// objek -- hak user biasa tidak cukup. Jadi seluruh filesystem TERTUTUP kecuali
// yang secara eksplisit dibuka untuk SID tersebut. Deny-by-default di kernel.
//
// TERUKUR sebelum biner ini ditulis, lewat peluncur PowerShell yang sama:
//   tulis C:\Users\dave\Desktop        ditolak
//   baca  cloud-keys.json              ditolak
//   baca  C:\Users\dave\Documents\oi   ditolak
//   tulis + ls di workspace            bisa
//
// KELUARAN LEWAT PIPA, bukan berkas. Versi berkas berhasil menangkap keluaran
// PowerShell tapi TIDAK keluaran proses anaknya (node, cmd) -- anak jalan
// (terbukti: ia menulis berkas) tapi stdout-nya tak sampai. Pipa adalah jalur
// yang memang dirancang untuk diwariskan ke seluruh rantai anak.
//
// Pakai:
//   AcLaunch.exe <namaContainer> <folderKerja> <exe> <argumen...>
// Keluaran anak diteruskan ke stdout/stderr peluncur; kode keluarnya diteruskan
// sebagai kode keluar peluncur.

using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

static class AcLaunch
{
    const uint EXTENDED_STARTUPINFO_PRESENT = 0x00080000;
    const int STARTF_USESTDHANDLES = 0x00000100;
    const int PROC_THREAD_ATTRIBUTE_SECURITY_CAPABILITIES = 0x00020009;
    const uint HANDLE_FLAG_INHERIT = 1;
    const uint INFINITE = 0xFFFFFFFF;

    // Job Object: resource ceilings for the command being launched.
    //
    // The Linux side already had these (agent/tools/bash-jail.ts caps processes,
    // virtual memory and CPU through the namespace jail). The Windows side had
    // NO equivalent -- an AppContainer confines what a command can REACH, not
    // how much it can CONSUME, so one command could take all the RAM and CPU on
    // the machine while staying perfectly inside its sandbox.
    //
    // The values are not decided here. agent/anggaran.ts owns them and passes
    // them through the environment; this file only enforces what it is given.
    const uint CREATE_SUSPENDED = 0x00000004;
    const int JobObjectExtendedLimitInformation = 9;
    const uint JOB_LIMIT_JOB_TIME = 0x00000004;
    const uint JOB_LIMIT_ACTIVE_PROCESS = 0x00000008;
    const uint JOB_LIMIT_PROCESS_MEMORY = 0x00000100;
    const uint JOB_LIMIT_JOB_MEMORY = 0x00000200;
    const uint JOB_LIMIT_KILL_ON_JOB_CLOSE = 0x00002000;

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    struct STARTUPINFO
    {
        public int cb; public IntPtr lpReserved; public IntPtr lpDesktop; public IntPtr lpTitle;
        public int dwX, dwY, dwXSize, dwYSize, dwXCountChars, dwYCountChars, dwFillAttribute, dwFlags;
        public short wShowWindow, cbReserved2;
        public IntPtr lpReserved2, hStdInput, hStdOutput, hStdError;
    }
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    struct STARTUPINFOEX { public STARTUPINFO StartupInfo; public IntPtr lpAttributeList; }
    [StructLayout(LayoutKind.Sequential)]
    struct PROCESS_INFORMATION { public IntPtr hProcess, hThread; public int dwProcessId, dwThreadId; }
    [StructLayout(LayoutKind.Sequential)]
    struct SECURITY_CAPABILITIES
    {
        public IntPtr AppContainerSid, Capabilities;
        public int CapabilityCount, Reserved;
    }
    [StructLayout(LayoutKind.Sequential)]
    struct IO_COUNTERS
    {
        public ulong ReadOperationCount, WriteOperationCount, OtherOperationCount;
        public ulong ReadTransferCount, WriteTransferCount, OtherTransferCount;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct JOBOBJECT_BASIC_LIMIT_INFORMATION
    {
        public long PerProcessUserTimeLimit;
        public long PerJobUserTimeLimit;
        public uint LimitFlags;
        public UIntPtr MinimumWorkingSetSize;
        public UIntPtr MaximumWorkingSetSize;
        public uint ActiveProcessLimit;
        public UIntPtr Affinity;
        public uint PriorityClass;
        public uint SchedulingClass;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct JOBOBJECT_EXTENDED_LIMIT_INFORMATION
    {
        public JOBOBJECT_BASIC_LIMIT_INFORMATION BasicLimitInformation;
        public IO_COUNTERS IoInfo;
        public UIntPtr ProcessMemoryLimit;
        public UIntPtr JobMemoryLimit;
        public UIntPtr PeakProcessMemoryUsed;
        public UIntPtr PeakJobMemoryUsed;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct SECURITY_ATTRIBUTES
    {
        public int nLength; public IntPtr lpSecurityDescriptor;
        [MarshalAs(UnmanagedType.Bool)] public bool bInheritHandle;
    }

    [DllImport("userenv.dll", CharSet = CharSet.Unicode)]
    static extern int DeriveAppContainerSidFromAppContainerName(string name, out IntPtr sid);
    [DllImport("advapi32.dll", EntryPoint = "ConvertSidToStringSidW", CharSet = CharSet.Unicode, SetLastError = true)]
    static extern bool ConvertSidToStringSidW(IntPtr sid, out IntPtr str);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool InitializeProcThreadAttributeList(IntPtr list, int count, int flags, ref IntPtr size);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool UpdateProcThreadAttribute(IntPtr list, uint flags, IntPtr attr, IntPtr val, IntPtr size, IntPtr prev, IntPtr ret);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern void DeleteProcThreadAttributeList(IntPtr list);
    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    static extern bool CreateProcessW(string app, StringBuilder cmd, IntPtr pa, IntPtr ta,
        [MarshalAs(UnmanagedType.Bool)] bool inherit, uint flags, IntPtr env, string dir,
        ref STARTUPINFOEX si, out PROCESS_INFORMATION pi);
    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    static extern IntPtr CreateFileW(string name, uint access, uint share,
        ref SECURITY_ATTRIBUTES sa, uint disp, uint flags, IntPtr tmpl);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool CreatePipe(out IntPtr rd, out IntPtr wr, ref SECURITY_ATTRIBUTES sa, int size);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool SetHandleInformation(IntPtr h, uint mask, uint flags);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern uint WaitForSingleObject(IntPtr h, uint ms);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool GetExitCodeProcess(IntPtr h, out uint code);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool CloseHandle(IntPtr h);
    [DllImport("kernel32.dll")] static extern IntPtr LocalAlloc(uint f, IntPtr n);
    [DllImport("kernel32.dll")] static extern IntPtr LocalFree(IntPtr p);
    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    static extern IntPtr CreateJobObjectW(IntPtr sa, string name);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool SetInformationJobObject(IntPtr job, int cls, IntPtr info, uint len);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool AssignProcessToJobObject(IntPtr job, IntPtr proc);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern uint ResumeThread(IntPtr thread);

    static int Main(string[] args)
    {
        // Mode SID: mencetak SID container lalu keluar.
        //
        // Pemanggil membutuhkannya untuk memberi hak pada folder workspace, dan
        // SID container tidak punya nama ramah -- icacls hanya menerima bentuk
        // S-1-15-2-... Menurunkannya di sini jauh lebih murah daripada memuat
        // P/Invoke lagi di sisi pemanggil.
        if (args.Length == 2 && args[0] == "--sid")
        {
            IntPtr s2;
            int h2 = DeriveAppContainerSidFromAppContainerName(args[1], out s2);
            if (h2 != 0)
            {
                Console.Error.WriteLine("SID tak bisa diturunkan (0x" + h2.ToString("X") + ")");
                return 3;
            }
            IntPtr str;
            if (!ConvertSidToStringSidW(s2, out str))
            {
                Console.Error.WriteLine("ConvertSidToStringSid: " + Marshal.GetLastWin32Error());
                return 3;
            }
            Console.Out.Write(Marshal.PtrToStringUni(str));
            return 0;
        }
        if (args.Length < 3)
        {
            Console.Error.WriteLine("pakai: AcLaunch.exe <container> <cwd> <exe> [argumen...]");
            Console.Error.WriteLine("       AcLaunch.exe --sid <container>");
            return 2;
        }
        string container = args[0], cwd = args[1], exe = args[2];

        IntPtr sid;
        int hr = DeriveAppContainerSidFromAppContainerName(container, out sid);
        if (hr != 0)
        {
            Console.Error.WriteLine("SID container tak bisa diturunkan (0x" + hr.ToString("X") +
                "). Profil '" + container + "' belum dibuat?");
            return 3;
        }

        // Pipa: ujung TULIS diwariskan ke anak, ujung BACA tidak. Kalau ujung
        // baca ikut diwariskan, ia tak pernah tertutup dan pembacaan menggantung
        // selamanya -- kegagalan yang tampak seperti proses hang.
        var sa = new SECURITY_ATTRIBUTES();
        sa.nLength = Marshal.SizeOf(typeof(SECURITY_ATTRIBUTES));
        sa.bInheritHandle = true;
        IntPtr outRd, outWr, errRd, errWr;
        if (!CreatePipe(out outRd, out outWr, ref sa, 0) ||
            !CreatePipe(out errRd, out errWr, ref sa, 0))
        {
            Console.Error.WriteLine("gagal membuat pipa: " + Marshal.GetLastWin32Error());
            return 4;
        }
        SetHandleInformation(outRd, HANDLE_FLAG_INHERIT, 0);
        SetHandleInformation(errRd, HANDLE_FLAG_INHERIT, 0);

        // LPAC SUDAH DICOBA, DAN GAGAL DUA KALI. Jangan diulang.
        //
        // AppContainer biasa tetap bisa membaca C:\Windows dan C:\Program Files.
        // Itu bukan celah pemasangan melainkan rancangan: folder sistem punya
        // ACE untuk SID ALL APPLICATION PACKAGES (S-1-15-2-1) supaya aplikasi
        // paket bisa memuat DLL sistem, dan tak ada ACL di sisi kita yang bisa
        // mencabutnya.
        //
        // LPAC (Less Privileged AppContainer, atribut 0x0002000F dengan nilai
        // PROCESS_CREATION_ALL_APPLICATION_PACKAGES_OPT_OUT) seharusnya membalik
        // aturan itu. Diimplementasikan lalu diukur berdampingan:
        //
        //   cmd echo           biasa ok        LPAC ok
        //   node --version     biasa v24.16.0  LPAC GAGAL  WSAStartup (10107)
        //   powershell 1+1     biasa 2         LPAC GAGAL  registry PowerShell ditolak
        //   baca/tulis wspace  biasa ok        LPAC ok
        //   baca C:\Windows    biasa BISA      LPAC MASIH BISA
        //
        // Jadi ia mematikan node dan PowerShell -- dua hal yang paling
        // dibutuhkan agent -- DAN tetap tidak menutup yang mau ditutup, karena
        // berkas System32 juga membawa ACE ALL RESTRICTED APPLICATION PACKAGES
        // (S-1-15-2-2) yang tetap dihormati LPAC. Kurungan yang sempurna tapi
        // tak bisa menjalankan apa pun bukan perbaikan; ia cuma cara lain
        // mematikan tool-nya.

        IntPtr size = IntPtr.Zero;
        InitializeProcThreadAttributeList(IntPtr.Zero, 1, 0, ref size);
        IntPtr list = LocalAlloc(0x0040, size);
        if (!InitializeProcThreadAttributeList(list, 1, 0, ref size))
        {
            Console.Error.WriteLine("InitializeProcThreadAttributeList: " + Marshal.GetLastWin32Error());
            return 5;
        }
        var caps = new SECURITY_CAPABILITIES { AppContainerSid = sid };
        IntPtr capsPtr = Marshal.AllocHGlobal(Marshal.SizeOf(typeof(SECURITY_CAPABILITIES)));
        Marshal.StructureToPtr(caps, capsPtr, false);
        if (!UpdateProcThreadAttribute(list, 0, (IntPtr)PROC_THREAD_ATTRIBUTE_SECURITY_CAPABILITIES,
                capsPtr, (IntPtr)Marshal.SizeOf(typeof(SECURITY_CAPABILITIES)), IntPtr.Zero, IntPtr.Zero))
        {
            Console.Error.WriteLine("UpdateProcThreadAttribute: " + Marshal.GetLastWin32Error());
            return 6;
        }

        var cmd = new StringBuilder();
        cmd.Append('"').Append(exe).Append('"');
        for (int i = 3; i < args.Length; i++)
        {
            cmd.Append(' ');
            // Argumen dikutip hanya bila perlu; tanda kutip di dalamnya di-escape.
            string a = args[i];
            if (a.Length == 0 || a.IndexOfAny(new[] { ' ', '\t', '"' }) >= 0)
                cmd.Append('"').Append(a.Replace("\"", "\\\"")).Append('"');
            else cmd.Append(a);
        }

        var si = new STARTUPINFOEX();
        si.StartupInfo.cb = Marshal.SizeOf(typeof(STARTUPINFOEX));
        si.StartupInfo.dwFlags = STARTF_USESTDHANDLES;
        si.StartupInfo.hStdOutput = outWr;
        si.StartupInfo.hStdError = errWr;
        // stdin HARUS handle yang sah, bukan NULL.
        //
        // Dengan NULL, program yang butuh stdin mencoba membukanya sendiri dan
        // gagal di dalam container: git melaporkan "could not open /dev/null",
        // dan node crash di InitializeOncePerProcess tanpa pesan sama sekali.
        // Gejalanya sangat berbeda, penyebabnya satu.
        IntPtr hIn = CreateFileW("NUL", 0x80000000, 3, ref sa, 3, 0x80, IntPtr.Zero);
        si.StartupInfo.hStdInput = hIn;
        si.lpAttributeList = list;

        // Lingkungan diwariskan apa adanya (lpEnvironment NULL), jadi pengerasan
        // env yang dipasang pemanggil tetap berlaku utuh sampai ke perintahnya.
        //
        // SATU SYARAT YANG TAK TERDUGA: CreateProcessW menolak membuat proses
        // AppContainer kalau LOCALAPPDATA tidak ADA di lingkungan, dan gagalnya
        // dengan kode 203 (ERROR_ENVVAR_NOT_FOUND) -- kode yang tidak menyebut
        // variabel apa pun, jadi jejaknya menunjuk ke mana-mana kecuali ke sini.
        // Terukur: SystemRoot+PATH saja gagal; +LOCALAPPDATA langsung berhasil;
        // APPDATA, USERPROFILE, TEMP, ProgramData tak satu pun menolong.
        //
        // Yang dituntut hanya KEHADIRANNYA. Nilainya boleh kosong, boleh menunjuk
        // folder yang tidak ada -- semuanya terukur berhasil. Karena itu pemanggil
        // mengarahkannya ke dalam workspace alih-alih memberi nilai aslinya, dan
        // nama akun asli tak ikut bocor ke perintah yang dijalankan.
        PROCESS_INFORMATION pi;
        bool ok = CreateProcessW(exe, cmd, IntPtr.Zero, IntPtr.Zero, true,
            EXTENDED_STARTUPINFO_PRESENT | CREATE_SUSPENDED, IntPtr.Zero, cwd, ref si, out pi);
        int lastErr = Marshal.GetLastWin32Error();

        // Ujung tulis ditutup DI SINI, di induk. Selama induk masih memegangnya,
        // pipa tak pernah menandakan EOF dan pembacaan menggantung meski anak
        // sudah lama selesai.
        CloseHandle(outWr);
        CloseHandle(errWr);
        if (hIn != (IntPtr)(-1)) CloseHandle(hIn);

        if (!ok)
        {
            Console.Error.WriteLine("CreateProcessW gagal: kode " + lastErr +
                (lastErr == 5 ? " (Access denied - SID container belum punya izin pada exe/cwd)" :
                 lastErr == 3 ? " (Path not found - exe atau cwd tak terjangkau container)" : ""));
            return 7;
        }

        // Resource ceilings, applied while the process is still suspended.
        //
        // THE ORDER IS LOAD-BEARING. The process is created suspended so it can
        // be placed in the job BEFORE its first instruction runs. Resume first
        // and a fast command can spawn a child in the gap -- and that child is
        // outside the job, which is exactly the escape the ceilings exist to
        // prevent.
        //
        // A failure here never fails the command. The AppContainer is the
        // security boundary; this is a resource ceiling sitting on top of it.
        // What a failure must not be is SILENT, because "ran unbounded" and
        // "ran within limits" would otherwise look identical to the caller.
        IntPtr job = IntPtr.Zero;
        long memMb = EnvLong("WOLFSPACE_JOB_MEM_MB");
        long maxProc = EnvLong("WOLFSPACE_JOB_MAXPROC");
        long cpuSec = EnvLong("WOLFSPACE_JOB_CPU_SEC");
        if (memMb > 0 || maxProc > 0 || cpuSec > 0)
        {
            job = CreateJobObjectW(IntPtr.Zero, null);
            if (job == IntPtr.Zero)
                Console.Error.WriteLine("PERINGATAN: CreateJobObject gagal (" +
                    Marshal.GetLastWin32Error() + ") - perintah berjalan TANPA plafon sumber daya");
            else
            {
                var info = new JOBOBJECT_EXTENDED_LIMIT_INFORMATION();
                uint flags = JOB_LIMIT_KILL_ON_JOB_CLOSE;
                if (memMb > 0)
                {
                    // Both limits, not one. Per-process stops a single runaway;
                    // per-job stops many small ones summing to the same thing.
                    UIntPtr b = new UIntPtr((ulong)memMb * 1024UL * 1024UL);
                    info.ProcessMemoryLimit = b;
                    info.JobMemoryLimit = b;
                    flags |= JOB_LIMIT_PROCESS_MEMORY | JOB_LIMIT_JOB_MEMORY;
                }
                if (maxProc > 0)
                {
                    info.BasicLimitInformation.ActiveProcessLimit = (uint)maxProc;
                    flags |= JOB_LIMIT_ACTIVE_PROCESS;
                }
                if (cpuSec > 0)
                {
                    // PerJobUserTimeLimit counts 100-nanosecond units.
                    info.BasicLimitInformation.PerJobUserTimeLimit = cpuSec * 10000000L;
                    flags |= JOB_LIMIT_JOB_TIME;
                }
                info.BasicLimitInformation.LimitFlags = flags;

                int jobInfoSize = Marshal.SizeOf(typeof(JOBOBJECT_EXTENDED_LIMIT_INFORMATION));
                IntPtr buf = Marshal.AllocHGlobal(jobInfoSize);
                Marshal.StructureToPtr(info, buf, false);
                bool setOk = SetInformationJobObject(job, JobObjectExtendedLimitInformation, buf, (uint)jobInfoSize);
                Marshal.FreeHGlobal(buf);
                if (!setOk)
                    Console.Error.WriteLine("PERINGATAN: SetInformationJobObject gagal (" +
                        Marshal.GetLastWin32Error() + ") - plafon TIDAK terpasang");
                else if (!AssignProcessToJobObject(job, pi.hProcess))
                    Console.Error.WriteLine("PERINGATAN: AssignProcessToJobObject gagal (" +
                        Marshal.GetLastWin32Error() + ") - plafon TIDAK terpasang");
            }
        }

        // Whatever happened above, the process has to run. It was created
        // suspended, and leaving it that way would hang the caller until its
        // timeout with no output and nothing to explain the silence.
        if (ResumeThread(pi.hThread) == 0xFFFFFFFF)
        {
            Console.Error.WriteLine("ResumeThread gagal: " + Marshal.GetLastWin32Error());
            return 8;
        }

        string so = "", se = "";
        var tOut = new Thread(() => { so = Baca(outRd); });
        var tErr = new Thread(() => { se = Baca(errRd); });
        tOut.Start(); tErr.Start();
        WaitForSingleObject(pi.hProcess, INFINITE);
        tOut.Join(); tErr.Join();

        uint code; GetExitCodeProcess(pi.hProcess, out code);
        CloseHandle(pi.hThread); CloseHandle(pi.hProcess);
        if (job != IntPtr.Zero) CloseHandle(job);
        DeleteProcThreadAttributeList(list); LocalFree(list);
        Marshal.FreeHGlobal(capsPtr);

        Console.Out.Write(so);
        Console.Error.Write(se);
        return (int)code;
    }

    /// Positive integer from the environment, or 0 when unset/invalid -- and 0
    /// means that particular ceiling is simply not applied. Passing these as
    /// arguments was not an option: the argv after <exe> is forwarded verbatim
    /// to the command, so a new flag there would be ambiguous.
    static long EnvLong(string name)
    {
        string v = Environment.GetEnvironmentVariable(name);
        long n;
        if (v == null || !long.TryParse(v, out n) || n <= 0) return 0;
        return n;
    }

    static string Baca(IntPtr h)
    {
        try
        {
            using (var fs = new FileStream(new Microsoft.Win32.SafeHandles.SafeFileHandle(h, true),
                       FileAccess.Read))
            using (var sr = new StreamReader(fs, Encoding.Default))
                return sr.ReadToEnd();
        }
        catch { return ""; }
    }
}
