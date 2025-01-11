export const validateQuery = (allowedFields) => (req, res, next) => {
  const queryKeys = Object.keys(req.query);

  // Check for invalid query parameters
  const invalidFields = queryKeys.filter((key) => !allowedFields.includes(key));

  if (invalidFields.length > 0) {
    return res.status(400).json({
      success: false,
      message: `Invalid query parameters: ${invalidFields.join(", ")}`,
    });
  }

  next();
};

export const validateIds = (req, res, next) => {
  const { ids } = req.query;

  if (!ids) {
    return res.status(400).json({
      success: false,
      message: "No resort IDs provided.",
    });
  }

  const idArray = typeof ids === "string" ? ids.split(",") : ids;
  const isValid = idArray.every((id) => /^[a-fA-F0-9]{24}$/.test(id));

  if (!isValid) {
    return res.status(400).json({
      success: false,
      message: "Invalid ID format. IDs must be valid MongoDB ObjectIds.",
    });
  }

  next();
};
