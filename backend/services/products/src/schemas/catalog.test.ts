import { describe, expect, it } from "vitest";
import {
  createCategorySchema,
  createProductSchema,
  listProductsQuerySchema,
  updateCategorySchema,
  updateProductSchema,
} from "./catalog.js";

const minimalProduct = {
  sku: "PH-001",
  name: "Phone X",
  slug: "phone-x",
  price: 699.99,
  categoryId: "6fc70c5b-dc85-44eb-801f-2419fe941f38",
};

describe("createProductSchema", () => {
  it("accepts a minimal product and applies defaults", () => {
    const result = createProductSchema.safeParse(minimalProduct);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toMatchObject({
        currency: "USD",
        stock: 0,
        status: "DRAFT",
        isFeatured: false,
        tags: [],
        images: [],
      });
    }
  });

  it("accepts a full product", () => {
    const result = createProductSchema.safeParse({
      ...minimalProduct,
      description: "A great phone",
      brand: "Novaphone",
      compareAtPrice: 799.99,
      stock: 10,
      status: "ACTIVE",
      isFeatured: true,
      tags: ["5g"],
      attributes: { color: "red" },
      images: [{ url: "https://example.com/p.jpg", altText: "front" }],
    });

    expect(result.success).toBe(true);
  });

  it("rejects missing sku, bad slug, negative price and bad categoryId", () => {
    for (const body of [
      { ...minimalProduct, sku: "" },
      { ...minimalProduct, slug: "Not A Slug!" },
      { ...minimalProduct, price: -5 },
      { ...minimalProduct, price: Number.NaN },
      { ...minimalProduct, categoryId: "not-a-uuid" },
      { ...minimalProduct, images: [{ url: "not-a-url" }] },
    ]) {
      expect(createProductSchema.safeParse(body).success).toBe(false);
    }
  });
});

describe("updateProductSchema", () => {
  it("accepts an empty patch and a partial patch", () => {
    expect(updateProductSchema.safeParse({}).success).toBe(true);
    const result = updateProductSchema.safeParse({ stock: 3 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ stock: 3 });
    }
  });

  it("still rejects invalid values", () => {
    expect(updateProductSchema.safeParse({ stock: -1 }).success).toBe(false);
    expect(updateProductSchema.safeParse({ status: "SOLD" }).success).toBe(false);
  });
});

describe("createCategorySchema / updateCategorySchema", () => {
  it("accepts a minimal category", () => {
    expect(createCategorySchema.safeParse({ name: "Phones", slug: "phones" }).success).toBe(true);
  });

  it("rejects bad slug and bad parentId", () => {
    expect(
      createCategorySchema.safeParse({ name: "P", slug: "Bad Slug", parentId: "nope" }).success,
    ).toBe(false);
  });

  it("update accepts partial input", () => {
    expect(updateCategorySchema.safeParse({ name: "New name" }).success).toBe(true);
  });
});

describe("listProductsQuerySchema", () => {
  it("applies pagination defaults", () => {
    const result = listProductsQuerySchema.safeParse({});

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toMatchObject({ page: 1, limit: 20 });
    }
  });

  it("coerces query-string values", () => {
    const result = listProductsQuerySchema.safeParse({
      page: "3",
      limit: "10",
      featured: "true",
      status: "ACTIVE",
      search: "phone",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toMatchObject({ page: 3, limit: 10, featured: true });
    }
  });

  it("rejects out-of-range and unknown values", () => {
    expect(listProductsQuerySchema.safeParse({ page: "0" }).success).toBe(false);
    expect(listProductsQuerySchema.safeParse({ limit: "500" }).success).toBe(false);
    expect(listProductsQuerySchema.safeParse({ status: "SOLD" }).success).toBe(false);
    expect(listProductsQuerySchema.safeParse({ featured: "yes" }).success).toBe(false);
  });
});
