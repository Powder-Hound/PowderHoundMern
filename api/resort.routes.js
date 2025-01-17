import express from "express";
import {
  createResort,
  getResort,
  getAllResorts,
  updateResort,
  deleteResort,
  findResort,
  findListOfResorts,
} from "../controllers/resort.controller.js";
import { verifyToken } from "../middleware/authMiddleware.js";

const resortRouter = express.Router();

/**
 * @swagger
 * tags:
 *   name: Resorts
 *   description: Resort management routes
 */

/**
 * @swagger
 * /api/resorts/create:
 *   post:
 *     tags: [Resorts]
 *     summary: Create a new resort
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               location:
 *                 type: string
 *     responses:
 *       201:
 *         description: Resort created successfully
 *       400:
 *         description: Invalid data provided
 */
resortRouter.post("/create", verifyToken, createResort);

/**
 * @swagger
 * /api/resorts/find:
 *   get:
 *     tags: [Resorts]
 *     summary: Find a resort by query
 *     parameters:
 *       - name: name
 *         in: query
 *         required: true
 *         schema:
 *           type: string
 *         description: Resort name
 *     responses:
 *       200:
 *         description: Resort found
 *       404:
 *         description: Resort not found
 */
resortRouter.get("/find", verifyToken, findResort);

/**
 * @swagger
 * /api/resorts/list:
 *   get:
 *     tags: [Resorts]
 *     summary: Get a list of resorts
 *     responses:
 *       200:
 *         description: List retrieved successfully
 *       404:
 *         description: No resorts found
 */
resortRouter.get("/list", verifyToken, findListOfResorts);

/**
 * @swagger
 * /api/resorts/:
 *   get:
 *     tags: [Resorts]
 *     summary: Get all resorts
 *     responses:
 *       200:
 *         description: Resorts retrieved successfully
 *       404:
 *         description: No resorts found
 */
resortRouter.get("/", verifyToken, getAllResorts);

/**
 * @swagger
 * /api/resorts/id/{id}:
 *   get:
 *     tags: [Resorts]
 *     summary: Get a resort by ID
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: Resort ID
 *     responses:
 *       200:
 *         description: Resort details retrieved
 *       404:
 *         description: Resort not found
 */
resortRouter.get("/id/:id", verifyToken, getResort);

/**
 * @swagger
 * /api/resorts/{id}:
 *   put:
 *     tags: [Resorts]
 *     summary: Update a resort by ID
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: Resort ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               location:
 *                 type: string
 *     responses:
 *       200:
 *         description: Resort updated successfully
 *       404:
 *         description: Resort not found
 */
resortRouter.put("/:id", verifyToken, updateResort);

/**
 * @swagger
 * /api/resorts/{id}:
 *   delete:
 *     tags: [Resorts]
 *     summary: Delete a resort by ID
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: Resort ID
 *     responses:
 *       200:
 *         description: Resort deleted successfully
 *       404:
 *         description: Resort not found
 */
resortRouter.delete("/:id", verifyToken, deleteResort);

export default resortRouter;
