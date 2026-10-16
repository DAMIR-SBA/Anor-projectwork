// Phase 9 B2B demo: demo_business is a verified company with one open request (seen by the demo
// seller moda-bazar) and one priced quote ready to accept; invoices get the operator's demo requisites.
import { prisma } from "./client";
import type { DemoAccounts } from "./rbac";

const DAY = 86_400_000;

export async function seedB2B(people: DemoAccounts) {
  if (await prisma.setting.findUnique({ where: { key: "seed.b2b" } })) return;
  const now = Date.now();
  await prisma.businessProfile.upsert({
    where: { userId: people.business.id },
    update: {},
    create: { userId: people.business.id, companyName: "“Yusupov Savdo” MChJ (demo)", taxId: "305123456", legalAddress: "Toshkent sh., Yunusobod t., Amir Temur ko‘chasi, 108", bankName: "Demo bank", bankAccount: "20208000100200300401", bankMfo: "00401", verifiedAt: new Date(now - 20 * DAY) },
  });

  if (!(await prisma.address.count({ where: { userId: people.business.id } }))) {
    await prisma.address.create({ data: { userId: people.business.id, label: "Ofis", recipient: "Rustam Yusupov", phone: "+998712001020", region: "toshkent_sh", city: "Toshkent", district: "Yunusobod", street: "Amir Temur ko‘chasi", house: "108", floor: "4", comment: "Qabulxona, 9:00–18:00", lat: 41.3385, lng: 69.2849, isDefault: true } });
  }

  // Payee shown on invoices. Clearly marked demo values — replace in /admin/settings before going live.
  const platform = await prisma.setting.findUnique({ where: { key: "platform" } });
  const value = (platform?.value as Record<string, unknown> | null) ?? {};
  if (!value.requisites) {
    const requisites = { legalName: "“ANOR Market” MChJ (demo)", taxId: "307000111", address: "Toshkent sh., Mirobod t., demo manzil", bankName: "Demo bank", bankAccount: "20208000900000000001", mfo: "00401" };
    await prisma.setting.upsert({ where: { key: "platform" }, update: { value: { ...value, requisites } }, create: { key: "platform", value: { requisites } } });
  }

  const product = (slug: string) => prisma.product.findUnique({ where: { slug }, select: { id: true, shopId: true, variants: { select: { id: true, price: true }, take: 1 } } });
  const shirt = await product("bolalar-futbolkasi");
  if (shirt?.variants[0]) {
    await prisma.quoteRequest.create({
      data: { number: "Q-DEMO01", userId: people.business.id, shopId: shirt.shopId, productId: shirt.id, variantId: shirt.variants[0].id, quantity: 120, targetPrice: 58_000, message: "Maktab uchun 120 dona, logotip bosmasiz. Yetkazish Toshkent bo‘yicha.", createdAt: new Date(now - 2 * 3_600_000) },
    });
  }
  const tea = await product("kuk-choy-95");
  if (tea?.variants[0]) {
    const price = Math.round((tea.variants[0].price * 0.8) / 100) * 100;
    await prisma.quoteRequest.create({
      data: { number: "Q-DEMO02", userId: people.business.id, shopId: tea.shopId, productId: tea.id, variantId: tea.variants[0].id, quantity: 50, message: "Ofis uchun har oy 50 quti.", status: "QUOTED", quotedPrice: price, sellerNote: "Har oy buyurtma qilsangiz, shu narx saqlanadi.", quotedAt: new Date(now - DAY), validUntil: new Date(now + 6 * DAY), createdAt: new Date(now - 2 * DAY) },
    });
  }
  await prisma.setting.create({ data: { key: "seed.b2b", value: { at: new Date().toISOString() } } });
}
