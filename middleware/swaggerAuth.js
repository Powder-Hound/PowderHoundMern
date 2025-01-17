import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import { User } from "../models/users.model.js";
import argon2 from "argon2";

dotenv.config();

export const swaggerAuth = async (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth) {
    res.set("WWW-Authenticate", 'Basic realm="Swagger API"');
    return res.status(401).send("Authentication required.");
  }

  const [username, password] = Buffer.from(auth.split(" ")[1], "base64")
    .toString()
    .split(":");

  if (
    username === process.env.SWAGGER_USERNAME &&
    password === process.env.SWAGGER_PASSWORD
  ) {
    try {
      // Check if the test user already exists
      let user = await User.findOne({
        $or: [
          { username: "docflav" },
          { phoneNumber: process.env.FAKE_USER_PHONE },
        ],
      });

      if (!user) {
        // Create the test user if it doesn't exist
        const hashedPassword = await argon2.hash("SecurePass123!");
        user = await User.create({
          name: process.env.FAKE_USER_NAME || "Doctor Flavor",
          username: "docflav",
          email: "doctaflav@email.com",
          password: hashedPassword,
          phoneNumber: process.env.FAKE_USER_PHONE || "15098675309",
          phoneVerifySID: "123456abcdef",
          permissions: "user", // Default permissions
        });
      }

      // Generate a token for the test user
      const token = jwt.sign(
        { id: user._id, role: user.permissions },
        process.env.JWT_SECRET,
        { expiresIn: "1h" }
      );

      // Attach the token to the request for Swagger UI
      req.swaggerToken = token;

      return next();
    } catch (err) {
      console.error("Error in Swagger Auth:", err);
      return res.status(500).send("Internal server error.");
    }
  }

  res.status(401).send("Invalid credentials.");
};
