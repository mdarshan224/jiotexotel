import './globals.css';
import DesktopAppDownloadPrompt from '@/components/DesktopAppDownloadPrompt';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import MobileAppRegistration from '@/components/MobileAppRegistration';
import MobileCartBar from '@/components/MobileCartBar';
import BottomNav from '@/components/BottomNav';
import AgentBottomNav from '@/components/AgentBottomNav';
import CustomerMotionShell from '@/components/CustomerMotionShell';

const getMetadataBase = () => {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (envUrl && (envUrl.startsWith('http://') || envUrl.startsWith('https://'))) {
    return new URL(envUrl);
  }
  return new URL('https://junkitout.in');
};

export const viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#176642' };

export const metadata = {
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Junk It Out', statusBarStyle: 'default' },
  metadataBase: getMetadataBase(),
  title: {
    default: 'Junk It Out — Doorstep Waste Pickup in 20-30 Minutes | Bengaluru',
    template: '%s | Junk It Out',
  },
  description: 'Fast, reliable 20-30 minute doorstep scrap & waste pickup across Bengaluru. Digital scale weighing, transparent material pricing, and convenient recycling services.',
  alternates: {
    canonical: 'https://junkitout.in',
  },
  icons: {
    icon: '/logo.png',
    shortcut: '/logo.png',
    apple: '/logo.png',
  },
  openGraph: {
    title: 'Junk It Out — Doorstep Waste Pickup in 20-30 Minutes | Bengaluru',
    description: 'Fast, reliable 20-30 minute doorstep scrap & waste pickup across Bengaluru. Digital scale weighing, transparent material pricing, and convenient recycling services.',
    url: 'https://junkitout.in',
    siteName: 'Junk It Out',
    images: [{ url: '/logo.png', width: 512, height: 512, alt: 'Junk It Out Logo' }],
    locale: 'en_IN',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://checkout.razorpay.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://checkout.razorpay.com" />
      </head>
      <body className="min-h-screen flex flex-col antialiased bg-slate-50 text-slate-900">
        <MobileAppRegistration />
        <DesktopAppDownloadPrompt />
        <Navbar />
        <main className="customer-app-main flex-1 pb-[calc(5rem+env(safe-area-inset-bottom,0px))] md:pb-0">
          <CustomerMotionShell>{children}</CustomerMotionShell>
        </main>
        <Footer />
        <MobileCartBar />
        <BottomNav />
        <AgentBottomNav />
      </body>
    </html>
  );
}
