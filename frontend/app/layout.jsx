import './globals.css';
import { MezotericProvider } from '../lib/context.jsx';

export const metadata = {
  title: 'Mezoteric — School Platform (LAN & Web)',
  description: 'End-to-end encrypted school chat, Twitch-like live streams, shorts, and decentralized governance that keeps running on the school LAN when internet drops.',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#070c16',
};

/**
 * Root Next.js Layout
 * Wraps the entire application with the offline-first MezotericProvider
 */
export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </head>
      <body>
        <MezotericProvider>
          {children}
        </MezotericProvider>
      </body>
    </html>
  );
}
