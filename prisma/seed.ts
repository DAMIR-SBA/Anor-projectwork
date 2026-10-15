import { prisma } from "./seed/client";
import { seedRbac, seedOwner, seedDemoPeople } from "./seed/rbac";

async function main() {
  console.log("Seeding ANOR…");
  await seedRbac();
  await seedOwner();
  const demo = process.env.DEMO_MODE === "true" || process.env.SEED_DEMO === "1";
  if (demo) {
    const people = await seedDemoPeople();
    const { seedCatalog } = await import("./seed/catalog").catch(() => ({ seedCatalog: null }));
    if (seedCatalog) await seedCatalog(people);
  }
  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
