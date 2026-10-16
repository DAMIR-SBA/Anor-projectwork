import { prisma } from "./seed/client";
import { seedRbac, seedOwner, seedDemoPeople } from "./seed/rbac";

async function main() {
  console.log("Seeding ANOR…");
  await seedRbac();
  await seedOwner();
  const demo = process.env.DEMO_MODE === "true" || process.env.SEED_DEMO === "1";
  if (demo) {
    const people = await seedDemoPeople();
    const { seedCatalog } = await import("./seed/catalog");
    await seedCatalog(people);
    const { seedStories } = await import("./seed/content");
    await seedStories();
    const { seedReviews } = await import("./seed/reviews");
    await seedReviews(people);
    const { seedSupport } = await import("./seed/support");
    await seedSupport(people);
    const { seedSellerCabinet } = await import("./seed/seller");
    await seedSellerCabinet(people);
    const { seedAdmin } = await import("./seed/admin");
    await seedAdmin(people);
  }
  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
