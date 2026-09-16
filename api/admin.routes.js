import express from "express";
import {
  exportCrmUsersCsv,
  getAdminSession,
  listCrmUsers,
} from "../controllers/admin.controller.js";
import { requireAdminCrm } from "../middleware/adminMiddleware.js";
import { verifyToken } from "../middleware/authMiddleware.js";

const adminRouter = express.Router();

/**
 * @swagger
 * tags:
 *   name: Admin CRM
 *   description: Read-only PowAlert CRM (allow-listed admin only)
 */

/**
 * @swagger
 * /api/admin/me:
 *   get:
 *     tags: [Admin CRM]
 *     summary: Confirm the caller is an allow-listed admin
 */
adminRouter.get("/me", verifyToken, requireAdminCrm, getAdminSession);

/**
 * @swagger
 * /api/admin/users:
 *   get:
 *     tags: [Admin CRM]
 *     summary: List/search users (read-only)
 *     parameters:
 *       - name: q
 *         in: query
 *         schema:
 *           type: string
 *       - name: resort
 *         in: query
 *         schema:
 *           type: string
 *       - name: pass
 *         in: query
 *         schema:
 *           type: string
 *           enum: [Epic, Ikon, Indy, MountainCollective]
 *       - name: contest
 *         in: query
 *         schema:
 *           type: string
 *           enum: [true, false]
 *       - name: ig
 *         in: query
 *         schema:
 *           type: string
 *           enum: [true, false]
 *       - name: emailConsented
 *         in: query
 *         schema:
 *           type: string
 *           enum: [true, false]
 *       - name: page
 *         in: query
 *         schema:
 *           type: integer
 *       - name: limit
 *         in: query
 *         schema:
 *           type: integer
 */
adminRouter.get("/users", verifyToken, requireAdminCrm, listCrmUsers);

/**
 * @swagger
 * /api/admin/users.csv:
 *   get:
 *     tags: [Admin CRM]
 *     summary: CSV export of the same CRM filter (admin-only)
 */
adminRouter.get("/users.csv", verifyToken, requireAdminCrm, exportCrmUsersCsv);

export default adminRouter;
