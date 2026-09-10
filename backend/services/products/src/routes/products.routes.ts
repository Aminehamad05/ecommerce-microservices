import { Router } from "express";
import { requireAdmin } from "../middleware/requireAdmin.js";
import {
  createCategory,
  deleteCategory,
  getCategory,
  listCategories,
  updateCategory,
} from "../controllers/categoriesController.js";
import {
  createProduct,
  deleteProduct,
  getProduct,
  listProducts,
  updateProduct,
} from "../controllers/productsController.js";

export const productsRouter = Router();

productsRouter.get("/", listProducts);
productsRouter.get("/:id", getProduct);
productsRouter.post("/", requireAdmin, createProduct);
productsRouter.patch("/:id", requireAdmin, updateProduct);
productsRouter.delete("/:id", requireAdmin, deleteProduct);

export const categoriesRouter = Router();

categoriesRouter.get("/", listCategories);
categoriesRouter.get("/:id", getCategory);
categoriesRouter.post("/", requireAdmin, createCategory);
categoriesRouter.patch("/:id", requireAdmin, updateCategory);
categoriesRouter.delete("/:id", requireAdmin, deleteCategory);
