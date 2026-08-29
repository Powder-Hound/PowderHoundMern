import express from "express";
import {
  getUser,
  deleteUser,
  updateUser,
} from "../controllers/user.controller.js";
import {
  drawContestWinner,
  listContestEntries,
  listContestEntriesCsv,
} from "../controllers/contest.controller.js";
import { verifyToken } from "../middleware/authMiddleware.js";

const userRouter = express.Router();

/**
 * @swagger
 * tags:
 *   name: Users
 *   description: User management routes
 */

/**
 * @swagger
 * /api/users/{id}:
 *   get:
 *     tags: [Users]
 *     summary: Get a user by ID
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     responses:
 *       200:
 *         description: User details retrieved
 *       404:
 *         description: User not found
 */
/**
 * @swagger
 * /api/users/contest/entries:
 *   get:
 *     tags: [Users]
 *     summary: Admin JSON table of One Extra Storm entries
 *     responses:
 *       200:
 *         description: Contest rows
 *       401:
 *         description: Admin token required
 */
userRouter.get("/contest/entries", verifyToken, listContestEntries);

/**
 * @swagger
 * /api/users/contest/entries.csv:
 *   get:
 *     tags: [Users]
 *     summary: Admin CSV of One Extra Storm entries
 *     responses:
 *       200:
 *         description: CSV download
 *       401:
 *         description: Admin token required
 */
userRouter.get("/contest/entries.csv", verifyToken, listContestEntriesCsv);

/**
 * @swagger
 * /api/users/contest/draw:
 *   post:
 *     tags: [Users]
 *     summary: Admin weighted draw (probability proportional to entries)
 *     responses:
 *       200:
 *         description: One eligible winner
 *       401:
 *         description: Admin token required
 */
userRouter.post("/contest/draw", verifyToken, drawContestWinner);

userRouter.get("/:id", verifyToken, getUser);

/**
 * @swagger
 * /api/users/{id}:
 *   put:
 *     tags: [Users]
 *     summary: Update a user by ID
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               email:
 *                 type: string
 *     responses:
 *       200:
 *         description: User updated successfully
 *       404:
 *         description: User not found
 */
userRouter.put("/:id", verifyToken, updateUser);

/**
 * @swagger
 * /api/users/{id}:
 *   delete:
 *     tags: [Users]
 *     summary: Delete a user by ID
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     responses:
 *       200:
 *         description: User deleted successfully
 *       404:
 *         description: User not found
 */
userRouter.delete("/:id", verifyToken, deleteUser);

export default userRouter;
