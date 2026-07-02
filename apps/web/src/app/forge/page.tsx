import type { Metadata } from 'next';
import SectorDoor from '../../components/world/SectorDoor';

export const metadata: Metadata = {
  title: 'The Forge — Your idea, struck into a first move | NovaNexus',
  description: 'Describe your situation or idea. Get a personal Decision Card: what you are actually dealing with, your next three moves, and what to say.',
};

export default function ForgeDoor() {
  return (
    <SectorDoor
      name="The Forge"
      accent="#c69bff"
      promise="Your idea, struck into a first move."
      sub="Bring a business idea, a stuck situation, or a dream with no stairs. Leave with a Decision Card: the honest read, your next three moves, and the words to say."
      points={[
        'Three questions in, one personal Decision Card out — specific to your situation, not business-school boilerplate.',
        'Each card ends the same way: here is what is real, here is what it means, here is the next move.',
        'Free to start. No account needed for your first cards.',
      ]}
      ctaLabel="Forge my next move"
      ctaHref="/start"
      disclaimer="Decision support, honestly labeled. The Forge does not flatter weak ideas — that is the point."
    />
  );
}
