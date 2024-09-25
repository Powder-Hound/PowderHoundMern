import express from "express";
import { createResort, getResort, getAllResorts, updateResort, deleteResort } from "../controllers/resort.controller.js"
import { verifyToken } from '../middleware/authMiddleware.js'

const resortRouter = express.Router();

resortRouter.post("/create", verifyToken, createResort);
resortRouter.get("/", getAllResorts)
resortRouter.get("/:id", verifyToken, getResort);
resortRouter.put("/:id", verifyToken, updateResort);
resortRouter.delete("/:id", deleteResort);
export default resortRouter;
