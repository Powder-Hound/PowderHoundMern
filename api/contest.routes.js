import express from "express";
import { getContestConfig } from "../controllers/contest.controller.js";

const contestRouter = express.Router();

/**
 * @swagger
 * /api/contest/config:
 *   get:
 *     tags: [Contest]
 *     summary: Public contest window and scoring (SPA rules page)
 *     responses:
 *       200:
 *         description: Window and scoring numbers
 */
contestRouter.get("/config", getContestConfig);

export default contestRouter;
