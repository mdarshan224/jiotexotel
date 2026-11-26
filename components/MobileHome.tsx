import Link from '@/components/AppLink';
import MobileHomeMilestones from './MobileHomeMilestones';
import { ArrowUpRight, BadgeIndianRupee, PackageCheck, Headphones, Wallet, ShieldCheck, Recycle, Truck } from 'lucide-react';

const shortcuts = [
  { href: '/pricing', label: 'Rates', icon: BadgeIndianRupee },
  { href: '/customer/orders', label: 'My pickups', icon: PackageCheck },
  { href: '/customer/wallet', label: 'Wallet', icon: Wallet },
  { href: '/customer/support', label: 'Help', icon: Headphones },
];

export default function MobileHome() {
  return <section className="mobile-home md:hidden" aria-label="Pickup dashboard">
    <div className="mobile-home-greeting"><span>WELCOME TO JUNK IT OUT</span><h1>A little less clutter.<br />A lot more space.</h1></div>
    <MobileHomeMilestones />
    <div className="mobile-pickup-banner mobile-welcome-banner">
      <div className="mobile-banner-copy">
        <span className="mobile-banner-badge"><Recycle size={13} /> DOORSTEP PICKUP</span>
        <h2>Fresh space.<br />Fresh start.</h2>
        <p>Your next clear-out starts here.<br />Easy doorstep pickups, on your time.</p>
        <Link href="/book?cart=1" className="mobile-book-cta">Book a pickup <ArrowUpRight size={19} /></Link>
      </div>
      <img src="/categories/household-waste.webp" alt="Household materials ready for collection" className="mobile-banner-image" />
    </div>
    <nav className="mobile-quick-actions" aria-label="Quick actions">
      {shortcuts.map(({ href, label, icon: Icon }) => <Link href={href} key={href}><span><Icon size={23} strokeWidth={1.7} /></span><strong>{label}</strong></Link>)}
    </nav>
    <div className="mobile-service-strip"><span><ShieldCheck size={16} /> Upfront rates</span><span><Truck size={16} /> At your doorstep</span></div>
  </section>;
}
