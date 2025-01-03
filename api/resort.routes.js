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

resortRouter.post("/create", verifyToken, createResort);
resortRouter.get("/find", verifyToken, findResort);
resortRouter.get("/list", verifyToken, findListOfResorts);
resortRouter.get("/", verifyToken, getAllResorts);
resortRouter.get("/id/:id", verifyToken, getResort);
resortRouter.put("/:id", verifyToken, updateResort);

resortRouter.delete("/:id", verifyToken, deleteResort);

export default resortRouter;
