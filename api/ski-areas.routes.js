import express from "express";
import {
  getAllSkiAreas,
  getSkiAreaById,
  createSkiArea,
  updateSkiArea,
  deleteSkiArea,
  findListOfSkiAreas, // Import the findListOfSkiAreas controller
} from "../controllers/ski-areas.controller.js";
import { verifyToken } from "../middleware/authMiddleware.js";

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Ski Areas
 *   description: CRUD operations for ski areas by region
 */

/**
 * @swagger
 * /api/ski-areas/{region}/list:
 *   get:
 *     tags: [Ski Areas]
 *     summary: Get a list of ski areas by IDs for a specific region
 *     parameters:
 *       - name: region
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           enum: [us, europe, japan]
 *         description: The region to fetch ski areas from
 *       - name: ids
 *         in: query
 *         required: true
 *         schema:
 *           type: string
 *         description: Comma-separated list of ski area IDs
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of ski areas retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                         example: "VAxxxx9999999"
 *                       name:
 *                         type: string
 *                         example: "Snowy Mountain"
 *                       state:
 *                         type: string
 *                         example: "Virginia"
 *       400:
 *         description: IDs parameter is required
 *       404:
 *         description: Ski areas not found
 *       500:
 *         description: Internal server error
 */
router.get("/:region/list", verifyToken, findListOfSkiAreas); // Ensure this is above dynamic :id route

/**
 * @swagger
 * /api/ski-areas/{region}:
 *   get:
 *     tags: [Ski Areas]
 *     summary: Get all ski areas for a specific region
 *     parameters:
 *       - name: region
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           enum: [us, europe, japan]
 *         description: The region to fetch ski areas for
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of ski areas retrieved successfully
 *       500:
 *         description: Internal server error
 */
router.get("/:region", verifyToken, getAllSkiAreas);

/**
 * @swagger
 * /api/ski-areas/{region}/{id}:
 *   get:
 *     tags: [Ski Areas]
 *     summary: Get a specific ski area by ID for a region
 *     parameters:
 *       - name: region
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           enum: [us, europe, japan]
 *         description: The region to fetch the ski area from
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the ski area
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Ski area retrieved successfully
 *       404:
 *         description: Ski area not found
 *       500:
 *         description: Internal server error
 */
router.get("/:region/:id", verifyToken, getSkiAreaById);

/**
 * @swagger
 * /api/ski-areas/{region}:
 *   post:
 *     tags: [Ski Areas]
 *     summary: Create a new ski area in a region
 *     parameters:
 *       - name: region
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           enum: [us, europe, japan]
 *         description: The region to create the ski area in
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: Name of the ski area
 *               type:
 *                 type: string
 *                 enum: [skiArea]
 *                 description: Type of the feature
 *               latitude:
 *                 type: number
 *                 description: Latitude of the ski area
 *               longitude:
 *                 type: number
 *                 description: Longitude of the ski area
 *               statistics:
 *                 type: object
 *                 description: Statistics about the ski area
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Ski area created successfully
 *       400:
 *         description: Validation error
 *       500:
 *         description: Internal server error
 */
router.post("/:region", verifyToken, createSkiArea);

/**
 * @swagger
 * /api/ski-areas/{region}/{id}:
 *   put:
 *     tags: [Ski Areas]
 *     summary: Update a ski area in a specific region by ID
 *     parameters:
 *       - name: region
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           enum: [us, europe, japan]
 *         description: The region where the ski area exists
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the ski area to update
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: Name of the ski area
 *               type:
 *                 type: string
 *                 enum: [skiArea]
 *                 description: Type of the feature
 *               latitude:
 *                 type: number
 *                 description: Latitude of the ski area
 *               longitude:
 *                 type: number
 *                 description: Longitude of the ski area
 *               statistics:
 *                 type: object
 *                 description: Updated statistics about the ski area
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Ski area updated successfully
 *       404:
 *         description: Ski area not found
 *       400:
 *         description: Validation error
 *       500:
 *         description: Internal server error
 */
router.put("/:region/:id", verifyToken, updateSkiArea);

/**
 * @swagger
 * /api/ski-areas/{region}/{id}:
 *   delete:
 *     tags: [Ski Areas]
 *     summary: Delete a ski area by ID for a specific region
 *     parameters:
 *       - name: region
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           enum: [us, europe, japan]
 *         description: The region to delete the ski area from
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the ski area to delete
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Ski area deleted successfully
 *       404:
 *         description: Ski area not found
 *       500:
 *         description: Internal server error
 */
router.delete("/:region/:id", verifyToken, deleteSkiArea);

export default router;
