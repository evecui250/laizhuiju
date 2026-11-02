import '../styles/globals.css';
import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: '来追剧呀',
  description: '和朋友一起追剧，看看大家追到哪一集了',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#1d1430',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <main
          className="mx-auto max-w-md px-5 pb-28"
          style={{ paddingTop: 'max(1.5rem, env(safe-area-inset-top))' }}
        >
          {children}
        </main>
      </body>
    </html>
  );
}
