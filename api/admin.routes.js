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
 *   description: Read-only PowAlert CRM v2 Phase A — Helio-style segment predicates, no sends
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
 *     summary: List users by combining segment predicates (read-only)
 *     parameters:
 *       - name: q
 *         in: query
 *         description: Name / phone / email search (not a segment)
 *         schema:
 *           type: string
 *       - name: followsResort
 *         in: query
 *         description: Followed hill — Mongo ObjectId or resortName slug
 *         schema:
 *           type: string
 *       - name: resort
 *         in: query
 *         description: Alias of followsResort (CRM v1)
 *         schema:
 *           type: string
 *       - name: pass
 *         in: query
 *         schema:
 *           type: string
 *           enum: [Epic, Ikon, Indy, MountainCollective]
 *       - name: emailMarketingConsent
 *         in: query
 *         schema:
 *           type: string
 *           enum: [true, false]
 *       - name: emailConsented
 *         in: query
 *         description: Alias of emailMarketingConsent (CRM v1)
 *         schema:
 *           type: string
 *           enum: [true, false]
 *       - name: hasEmail
 *         in: query
 *         description: Non-empty email when true
 *         schema:
 *           type: string
 *           enum: [true, false]
 *       - name: contest
 *         in: query
 *         description: Matches #49 contest fields if present on the row
 *         schema:
 *           type: string
 *           enum: [true, false]
 *       - name: ig
 *         in: query
 *         description: Matches #49 followClaims instagram / handle fields if present
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
 *     summary: CSV export of the same segment filter (read-only, admin-only)
 */
adminRouter.get("/users.csv", verifyToken, requireAdminCrm, exportCrmUsersCsv);

export default adminRouter;
