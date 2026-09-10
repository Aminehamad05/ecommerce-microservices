import { z } from "zod";

const slug = z
  .string()
  .min(1, "Slug is required")
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase alphanumeric with dashes");

const price = z.number().finite().positive("Price must be positive").max(99_999_999.99);

const productImageInput = z.object({
  url: z.url("Image URL must be a valid URL"),
  altText: z.string().max(200).optional(),
  position: z.number().int().min(0).default(0),
});

// Flexible per-product data, e.g. { color: "red", size: "M" }
const attributes = z.record(z.string(), z.unknown());

export const createCategorySchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  slug,
  description: z.string().max(2000).optional(),
  imageUrl: z.url("Image URL must be a valid URL").optional(),
  parentId: z.uuid("parentId must be a valid UUID").optional(),
});

export const updateCategorySchema = createCategorySchema.partial();

export const createProductSchema = z.object({
  sku: z.string().min(1, "SKU is required").max(60),
  name: z.string().min(1, "Name is required").max(200),
  slug,
  description: z.string().max(10_000).optional(),
  brand: z.string().max(100).optional(),
  price,
  compareAtPrice: price.optional(),
  currency: z.string().length(3).default("USD"),
  stock: z.number().int().min(0, "Stock cannot be negative").default(0),
  status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]).default("DRAFT"),
  isFeatured: z.boolean().default(false),
  tags: z.array(z.string().min(1).max(50)).max(30).default([]),
  attributes: attributes.optional(),
  categoryId: z.uuid("categoryId must be a valid UUID"),
  images: z.array(productImageInput).max(20).default([]),
});

export const updateProductSchema = createProductSchema.partial();

const booleanQuery = z
  .enum(["true", "false"])
  .transform((value) => value === "true")
  .optional();

export const listProductsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  categoryId: z.uuid().optional(),
  status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]).optional(),
  featured: booleanQuery,
  search: z.string().min(1).max(200).optional(),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;
