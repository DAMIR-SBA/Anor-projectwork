import { Baby, BookOpen, Car, Dumbbell, Gem, Home, Laptop, Palette, Shirt, ShoppingBasket, Smartphone, Sparkles, Tv, Wrench, PawPrint, Gift, Refrigerator, type LucideIcon } from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  smartphone: Smartphone,
  laptop: Laptop,
  tv: Tv,
  appliances: Refrigerator,
  shirt: Shirt,
  home: Home,
  beauty: Sparkles,
  baby: Baby,
  grocery: ShoppingBasket,
  sport: Dumbbell,
  books: BookOpen,
  auto: Car,
  crafts: Palette,
  jewelry: Gem,
  tools: Wrench,
  pets: PawPrint,
  gifts: Gift,
};

export function CategoryIcon({ name, className }: { name: string | null | undefined; className?: string }) {
  const Icon = (name && ICONS[name]) || Gift;
  return <Icon className={className} aria-hidden />;
}
