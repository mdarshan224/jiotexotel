import Link from '@/components/AppLink';
import { ChevronRight, CircleHelp, FileText, Info, LifeBuoy, MapPin, Truck } from 'lucide-react';
const links = [
  { href: '/customer/support', label: 'Help & support', icon: LifeBuoy },
  { href: '/faq', label: 'FAQs', icon: CircleHelp },
  { href: '/privacy-policy', label: 'Privacy policy', icon: FileText },
  { href: '/terms', label: 'Terms & conditions', icon: FileText },
  { href: '/accepted-waste', label: 'Accepted waste policy', icon: FileText },
  { href: '/service-areas', label: 'Service areas', icon: MapPin },
  { href: '/about', label: 'About Junk It Out', icon: Info },
  { href: '/contact', label: 'Contact us', icon: LifeBuoy },
  { href: '/agent', label: 'Agent portal', icon: Truck },
];
export default function MobileAccountLinks() {
  return <section className="mobile-account-links customer-surface md:hidden" aria-label="Information, policies and portals">
    <h2>Help, information & policies</h2>
    {links.map(({ href, label, icon: Icon }) => <Link href={href} key={href}><Icon size={18} /><span>{label}</span><ChevronRight size={16} /></Link>)}
  </section>;
}
