import dotenv from "dotenv";

dotenv.config();

const swaggerDefinition = {
  openapi: "3.0.0",
  info: {
    title: "PowAlert API",
    version: "1.0.0",
    description: `
      ### API Documentation

      This documentation provides details on the available endpoints in the API, including the required request payloads and example responses.

      **Note:** This documentation is for informational purposes only. API interaction is disabled.
    `,
  },
  servers: [
    {
      url: "http://localhost:5050/api",
      description: "Local server",
    },
    {
      url: "https://powderhoundmern.onrender.com/api",
      description: "Production",
    },
  ],
  components: {
    schemas: {
      User: {
        type: "object",
        properties: {
          name: { type: "string", example: "Doctor Flavor" },
          username: { type: "string", example: "docflav" },
          email: { type: "string", example: "doctaflav@email.com" },
          phoneNumber: { type: "string", example: "15098675309" },
          permissions: { type: "string", example: "user" },
        },
      },
    },
  },
  paths: {
    "/api/auth/signup": {
      post: {
        summary: "Sign up a new user",
        description: `
          Create a new user account.

          **Example Request Payload**:
          \`\`\`json
          {
            "name": "Doctor Flavor",
            "username": "docflav",
            "email": "doctaflav@email.com",
            "password": "SecurePass123!",
            "phoneNumber": "15098675309",
            "phoneVerifySID": "123456abcdef"
          }
          \`\`\`
        `,
        responses: {
          201: {
            description: "User created successfully",
            content: {
              "application/json": {
                example: {
                  user: {
                    name: "Doctor Flavor",
                    username: "docflav",
                    email: "doctaflav@email.com",
                    phoneNumber: "15098675309",
                    permissions: "user",
                    _id: "unique-user-id",
                  },
                  token: "JWT-TOKEN",
                },
              },
            },
          },
        },
      },
    },
    "/api/auth/login": {
      post: {
        summary: "Login a user",
        description: `
          Authenticate an existing user using \`phoneNumber\` and a placeholder \`code\`. 

          **Example Request Payload**:
          \`\`\`json
          {
            "phoneNumber": "15098675309",
            "code": "123456"
          }
          \`\`\`
        `,
        responses: {
          201: {
            description: "User logged in successfully",
            content: {
              "application/json": {
                example: {
                  token: "JWT-TOKEN",
                  user: {
                    name: "Doctor Flavor",
                    username: "docflav",
                    email: "doctaflav@email.com",
                    phoneNumber: "15098675309",
                    permissions: "user",
                    _id: "unique-user-id",
                  },
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
  apis: ["./api/**/*.js"], // Adjust this path as needed for your route files
  swaggerOptions: {
    supportedSubmitMethods: [], // Disable "Try it out" functionality
  },
};

export default swaggerOptions;
