import express from "express";
import { getStaysFromPrice, postStaysHandoff } from "../controllers/stays.controller.js";

const staysRouter = express.Router();

staysRouter.get("/from-price", getStaysFromPrice);
staysRouter.post("/handoff", postStaysHandoff);

export default staysRouter;
