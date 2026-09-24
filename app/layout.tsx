import type { Metadata } from "next";
import { Sidebar } from "@/components/Sidebar";
import "katex/dist/katex.min.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Acadesk",
  description: "課程、作業、研究進度與時間管理",
};

// Applied before paint so a dark-mode reload never flashes white.
const THEME_SCRIPT = `try{var t=localStorage.getItem('theme');
if(t==='dark'||(!t&&matchMedia('(prefers-color-scheme:dark)').matches))
document.documentElement.classList.add('dark')}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="flex min-h-dvh">
        <Sidebar />
        <main className="h-dvh flex-1 overflow-y-auto">
          <div className="mx-auto max-w-6xl px-8 py-8">{children}</div>
        </main>
      </body>
    </html>
  );
}
