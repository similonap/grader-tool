import type { Metadata } from "next";
import Link from "next/link";
import { IBM_Plex_Mono, Newsreader, Public_Sans } from "next/font/google";
import "./globals.css";

const publicSans = Public_Sans({
  variable: "--font-body",
  subsets: ["latin"],
});

const newsreader = Newsreader({
  variable: "--font-display",
  subsets: ["latin"],
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-mono",
  weight: ["400", "500", "600"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Grader",
  description: "Administration dashboard for automatic grading",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${publicSans.variable} ${newsreader.variable} ${ibmPlexMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-paper font-sans text-ink">
        <header className="sticky top-0 z-10 border-b border-line bg-paper/85 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-5 px-6 py-3.5">
            <Link href="/" className="flex items-baseline gap-2.5">
              <span className="shrink-0 rounded-md bg-accent-soft px-1.5 py-0.5 font-mono text-[11px] tracking-wide text-accent">
                GR
              </span>
              <span className="font-display text-[17px] font-semibold text-ink">Grader</span>
            </Link>
            <div className="flex items-center gap-4">
              <Link href="/settings" className="text-sm text-muted hover:text-ink">
                Settings
              </Link>
              <Link
                href="/new"
                className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:brightness-105"
              >
                New grading project
              </Link>
            </div>
          </div>
        </header>
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
