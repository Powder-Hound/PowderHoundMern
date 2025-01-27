import express from "express";
import {
  triggerSnowNotifications,
  createNotification,
  getNotifications,
  deleteNotification,
} from "../controllers/notification.controller.js";
import { verifyToken } from "../middleware/authMiddleware.js";

const notificationRouter = express.Router();

/**
 * @swagger
 * tags:
 *   name: Notifications
 *   description: Notification management routes
 */

/**
 * @swagger
 * /api/notifications/trigger:
 *   post:
 *     tags: [Notifications]
 *     summary: Trigger snow notifications manually
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Snow notifications triggered successfully
 *       500:
 *         description: Error triggering notifications
 */
notificationRouter.post("/trigger", verifyToken, triggerSnowNotifications);

/**
 * @swagger
 * /api/notifications:
 *   post:
 *     tags: [Notifications]
 *     summary: Create a new notification manually
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               userId:
 *                 type: string
 *                 description: ID of the user receiving the notification
 *                 example: "63f2c0eb2e9e4d3a6c3b1234"
 *               resortId:
 *                 type: string
 *                 description: ID of the associated resort
 *                 example: "63f2c0eb2e9e4d3a6c3b5678"
 *               message:
 *                 type: string
 *                 description: Notification message
 *                 example: "Custom alert! Heavy snowfall expected at Snowy Peaks Resort."
 *     responses:
 *       201:
 *         description: Notification created successfully
 *       400:
 *         description: Missing required fields
 *       500:
 *         description: Error creating notification
 */
notificationRouter.post("/", verifyToken, createNotification);

/**
 * @swagger
 * /api/notifications:
 *   get:
 *     tags: [Notifications]
 *     summary: Retrieve all notifications or filter by user ID
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: userId
 *         in: query
 *         required: false
 *         schema:
 *           type: string
 *           description: Filter notifications by user ID
 *           example: "63f2c0eb2e9e4d3a6c3b1234"
 *     responses:
 *       200:
 *         description: Notifications retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   _id:
 *                     type: string
 *                   userId:
 *                     type: string
 *                   resortId:
 *                     type: string
 *                   message:
 *                     type: string
 *                   sentAt:
 *                     type: string
 *                     format: date-time
 *                   responseStatus:
 *                     type: string
 *                     enum: ["sent", "failed"]
 *                   createdAt:
 *                     type: string
 *                     format: date-time
 *                   updatedAt:
 *                     type: string
 *                     format: date-time
 *       500:
 *         description: Error retrieving notifications
 */
notificationRouter.get("/", verifyToken, getNotifications);

/**
 * @swagger
 * /api/notifications/{id}:
 *   delete:
 *     tags: [Notifications]
 *     summary: Delete a notification by ID
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           description: Notification ID
 *           example: "63f2c0eb2e9e4d3a6c3b9101"
 *     responses:
 *       200:
 *         description: Notification deleted successfully
 *       404:
 *         description: Notification not found
 *       500:
 *         description: Error deleting notification
 */
notificationRouter.delete("/:id", verifyToken, deleteNotification);

export default notificationRouter;
