import express from "express";
import { createLead } from "../controllers/lead.controller.js";

const leadRouter = express.Router();

/**
 * @swagger
 * /api/leads:
 *   post:
 *     tags: [Leads]
 *     summary: Public guide lead capture (no auth)
 *     description: >
 *       Saves a lead and emails that guide. One-to-one transactional mail only.
 *       Same email + guide inside the dedupe window returns 200 and does not send again.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, guide, consent]
 *             properties:
 *               email:
 *                 type: string
 *               name:
 *                 type: string
 *               phone:
 *                 type: string
 *               guide:
 *                 type: string
 *                 enum: [ski-vanlife, adult-ski-camps]
 *               utm_source:
 *                 type: string
 *               utm_medium:
 *                 type: string
 *               utm_campaign:
 *                 type: string
 *               utm_term:
 *                 type: string
 *               utm_content:
 *                 type: string
 *               ref:
 *                 type: string
 *               consent:
 *                 type: boolean
 *               turnstileToken:
 *                 type: string
 *               powalert_hp:
 *                 type: string
 *                 description: Honeypot. Must be empty.
 *     responses:
 *       200:
 *         description: Saved, deduped, or honeypot ignored
 *       400:
 *         description: Validation error
 *       403:
 *         description: Turnstile failed or is required
 *       429:
 *         description: Rate limited per IP or per email
 */
leadRouter.post("/", createLead);

export default leadRouter;
