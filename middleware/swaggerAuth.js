import dotenv from "dotenv";

dotenv.config();

export const swaggerAuth = (req, res, next) => {
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
    return next();
  }

  res.status(401).send("Invalid credentials.");
};
