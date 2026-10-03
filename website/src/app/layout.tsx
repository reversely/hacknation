import type { Metadata } from 'next';
import './styles.css';

export const metadata: Metadata = {
  title: 'Noor Highlands Farm | Visit the farm',
  description: 'A welcoming farm visit in the Kenyan highlands.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
