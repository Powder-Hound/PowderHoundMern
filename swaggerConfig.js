import dotenv from "dotenv";

dotenv.config();

const swaggerDefinition = {
  openapi: "3.0.0",
  info: {
    title: "Your API",
    version: "1.0.0",
    description: "API documentation",
  },
  servers: [{ url: "http://localhost:5050/api" }],
  components: {
    securitySchemes: {
      basicAuth: {
        type: "http",
        scheme: "basic",
      },
    },
  },
  security: [{ basicAuth: [] }],
  paths: {
    "/api/users": {
      get: {
        summary: "Get user details",
        responses: {
          200: {
            description: "A list of users",
            content: {
              "application/json": {
                example: {
                  name: process.env.FAKE_USER_NAME,
                  username: process.env.SWAGGER_USERNAME,
                  phone: process.env.FAKE_USER_PHONE,
                  state: process.env.FAKE_USER_STATE,
                },
              },
            },
          },
        },
      },
    },
  },
};

const swaggerOptions = {
  definition: swaggerDefinition,
  apis: ["./api/**/*.js"], // Adjust the path as per your routes
};

export default swaggerOptions;
