export const validateQuery = (allowedFields) => (req, res, next) => {
  console.log("Validating query parameters:", req.query);
  const queryKeys = Object.keys(req.query);
  const invalidFields = queryKeys.filter((key) => !allowedFields.includes(key));

  if (invalidFields.length > 0) {
    console.log("Invalid query fields found:", invalidFields);
    return res.status(400).send({
      success: false,
      message: `Invalid query parameters: ${invalidFields.join(", ")}`,
    });
  }

  next();
};

export const validateIds = (req, res, next) => {
  const { ids } = req.query;

  if (!ids) {
    return res.status(400).send({
      success: false,
      message: "No resort IDs provided.",
    });
  }

  const idArray = typeof ids === "string" ? ids.split(",") : ids;
  const isValid = idArray.every((id) => /^[a-fA-F0-9]{24}$/.test(id));

  if (!isValid) {
    return res.status(400).send({
      success: false,
      message: "Invalid ID format. IDs must be valid MongoDB ObjectIds.",
    });
  }

  next();
};
