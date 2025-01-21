const express = require("express");
const router = express.Router();
const skiAreasController = require("../controllers/ski-areas.controller");

// Define routes
router.get("/", skiAreasController.getAllSkiAreas);
router.get("/:id", skiAreasController.getSkiAreaById);
router.post("/", skiAreasController.createSkiArea);
router.put("/:id", skiAreasController.updateSkiArea);
router.delete("/:id", skiAreasController.deleteSkiArea);

module.exports = router;
