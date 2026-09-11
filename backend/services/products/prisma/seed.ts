import "dotenv/config";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "../src/generated/client/index.js";

const prisma = new PrismaClient();

/* ------------------------------------------------------------------ */
/* Catalog definition                                                  */
/* ------------------------------------------------------------------ */

interface CategoryDef {
  name: string;
  slug: string;
  description: string;
  parentSlug?: string;
}

const CATEGORIES: CategoryDef[] = [
  { name: "Electronics", slug: "electronics", description: "Gadgets, computers and more" },
  { name: "Phones", slug: "phones", description: "Smartphones and accessories", parentSlug: "electronics" },
  { name: "Laptops", slug: "laptops", description: "Notebooks and ultrabooks", parentSlug: "electronics" },
  { name: "Audio", slug: "audio", description: "Headphones, earbuds and speakers", parentSlug: "electronics" },
  { name: "Fashion", slug: "fashion", description: "Clothing and apparel" },
  { name: "Men", slug: "men-fashion", description: "Men's clothing", parentSlug: "fashion" },
  { name: "Women", slug: "women-fashion", description: "Women's clothing", parentSlug: "fashion" },
  { name: "Shoes", slug: "shoes", description: "Sneakers, boots and sandals", parentSlug: "fashion" },
  { name: "Home", slug: "home", description: "Furniture and home goods" },
  { name: "Kitchen", slug: "kitchen", description: "Cookware and appliances", parentSlug: "home" },
  { name: "Sports", slug: "sports", description: "Fitness and outdoor gear" },
  { name: "Books", slug: "books", description: "Fiction, tech and cookbooks" },
];

interface ProductTemplate {
  categorySlug: string;
  brand: string;
  baseName: string;
  variants: string[];
  minPrice: number;
  maxPrice: number;
  prefix: string;
  tags: string[];
}

const TEMPLATES: ProductTemplate[] = [
  { categorySlug: "phones", brand: "Novaphone", baseName: "Nova smartphone", variants: ["Lite", "Pro", "Ultra", "Max", "Mini", "Fold"], minPrice: 199, maxPrice: 1299, prefix: "PH", tags: ["smartphone", "5g", "new"] },
  { categorySlug: "laptops", brand: "Thinkpadix", baseName: "Aero laptop", variants: ["13in", "14in", "15in", "16in", "Gaming", "Workstation"], minPrice: 549, maxPrice: 2999, prefix: "LP", tags: ["laptop", "ssd"] },
  { categorySlug: "audio", brand: "Soundcore", baseName: "Pulse headphones", variants: ["Wired", "Wireless", "ANC Pro", "Sport", "Studio", "Buds"], minPrice: 29, maxPrice: 399, prefix: "AU", tags: ["audio", "bluetooth"] },
  { categorySlug: "men-fashion", brand: "UrbanThread", baseName: "Essential t-shirt", variants: ["Black", "White", "Navy", "Olive", "Grey", "Striped"], minPrice: 15, maxPrice: 60, prefix: "MM", tags: ["cotton", "casual"] },
  { categorySlug: "women-fashion", brand: "Maison Rue", baseName: "Summer dress", variants: ["Floral", "Midi", "Maxi", "Wrap", "Linen", "Knit"], minPrice: 35, maxPrice: 220, prefix: "WM", tags: ["dress", "summer"] },
  { categorySlug: "shoes", brand: "Strideline", baseName: "Runner sneakers", variants: ["Road", "Trail", "Court", "Retro", "Knit", "Leather"], minPrice: 49, maxPrice: 250, prefix: "SH", tags: ["sneakers", "running"] },
  { categorySlug: "kitchen", brand: "ChefForge", baseName: "Chef knife set", variants: ["3-piece", "5-piece", "7-piece", "Santoku", "Paring", "Bread"], minPrice: 25, maxPrice: 300, prefix: "KT", tags: ["kitchen", "steel"] },
  { categorySlug: "home", brand: "NordHaus", baseName: "Oak lounge chair", variants: ["Natural", "Walnut", "Black", "Fabric", "Swivel", "Rocking"], minPrice: 120, maxPrice: 900, prefix: "HM", tags: ["furniture", "wood"] },
  { categorySlug: "sports", brand: "ApexFit", baseName: "Yoga mat", variants: ["4mm", "6mm", "Travel", "Cork", "TPE", "Extra grip"], minPrice: 20, maxPrice: 120, prefix: "SP", tags: ["fitness", "yoga"] },
  { categorySlug: "books", brand: "Penguin House", baseName: "TypeScript handbook", variants: ["Vol 1", "Vol 2", "Advanced", "Patterns", "Testing", "Performance"], minPrice: 19, maxPrice: 79, prefix: "BK", tags: ["books", "programming"] },
  { categorySlug: "electronics", brand: "VoltEdge", baseName: "USB-C hub", variants: ["5-in-1", "7-in-1", "11-in-1", "Mini", "Docking", "Travel"], minPrice: 25, maxPrice: 150, prefix: "EL", tags: ["accessories", "usb-c"] },
  { categorySlug: "fashion", brand: "Denim Co", baseName: "Classic denim jacket", variants: ["Light wash", "Dark wash", "Black", "Oversized", "Cropped", "Sherpa"], minPrice: 60, maxPrice: 200, prefix: "FS", tags: ["denim", "jacket"] },
];

const COLORS = ["black", "white", "blue", "red", "green", "grey"];

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)] as T;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/* ------------------------------------------------------------------ */
/* Seed                                                                */
/* ------------------------------------------------------------------ */

async function main(): Promise<void> {
  // Start clean — removes earlier manual test fixtures too.
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "product_images", "products", "categories" CASCADE',
  );

  // Categories (parents first so parentSlug resolves).
  const idsBySlug = new Map<string, string>();
  for (const def of CATEGORIES) {
    const id = randomUUID();
    await prisma.category.create({
      data: {
        id,
        name: def.name,
        slug: def.slug,
        description: def.description,
        parentId: def.parentSlug ? (idsBySlug.get(def.parentSlug) as string) : undefined,
      },
    });
    idsBySlug.set(def.slug, id);
  }
  console.log(`Created ${CATEGORIES.length} categories`);

  // Products + images (client-generated ids so images can use createMany).
  let skuCounter = 1;
  const productRows: {
    id: string;
    sku: string;
    name: string;
    slug: string;
    description: string;
    brand: string;
    price: number;
    compareAtPrice: number | null;
    stock: number;
    status: "DRAFT" | "ACTIVE" | "ARCHIVED";
    isFeatured: boolean;
    tags: string[];
    categoryId: string;
  }[] = [];
  const imageRows: { url: string; altText: string; position: number; productId: string }[] = [];

  for (const template of TEMPLATES) {
    const categoryId = idsBySlug.get(template.categorySlug) as string;
    for (const variant of template.variants) {
      const id = randomUUID();
      const name = `${template.baseName} ${variant}`;
      const slug = `${slugify(name)}-${skuCounter}`;
      const price = round2(template.minPrice + Math.random() * (template.maxPrice - template.minPrice));
      const onSale = Math.random() < 0.2;
      const roll = Math.random();

      productRows.push({
        id,
        sku: `${template.prefix}-${String(skuCounter).padStart(3, "0")}`,
        name,
        slug,
        description: `${template.brand} ${name} — ${pick(template.tags)} quality, ships in 48h.`,
        brand: template.brand,
        price,
        compareAtPrice: onSale ? round2(price * (1.15 + Math.random() * 0.25)) : null,
        stock: Math.random() < 0.1 ? 0 : Math.floor(Math.random() * 200),
        status: roll < 0.85 ? "ACTIVE" : roll < 0.95 ? "DRAFT" : "ARCHIVED",
        isFeatured: Math.random() < 0.1,
        tags: [pick(template.tags), pick(COLORS)],
        categoryId,
      });

      const imageCount = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < imageCount; i += 1) {
        imageRows.push({
          url: `https://picsum.photos/seed/${slug}-${i}/800/600`,
          altText: `${name} photo ${i + 1}`,
          position: i,
          productId: id,
        });
      }
      skuCounter += 1;
    }
  }

  // ratingAvg/reviewCount/attributes are derived flavor, added per row below.
  await prisma.product.createMany({
    data: productRows.map((row) => ({
      ...row,
      ratingAvg: round2(3 + Math.random() * 2),
      reviewCount: Math.floor(Math.random() * 500),
      attributes: { color: pick(COLORS), inBox: 1 + Math.floor(Math.random() * 3) },
    })),
  });
  await prisma.productImage.createMany({ data: imageRows });

  console.log(`Created ${productRows.length} products with ${imageRows.length} images`);
}

await main()
  .catch((err: unknown) => {
    console.error("Seed failed:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
