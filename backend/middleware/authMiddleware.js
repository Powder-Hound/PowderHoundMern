import jwt from 'jsonwebtoken';
import { body } from 'express-validator';
import { User } from '../models/users.model.js';

const passwordLength = {
  min: 8,
  max: 128,
}

export const verifyToken = (req, res, next) => {
  const token = req.headers.authorization;
  if (!token) {
    return res.status(401).json({ message: "No token provided" });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userID= decoded.userID
    next();
  } catch (err) {
    console.error(err);
  }
}

export const signupValidation = [
  // validate username
  body('username')
  .trim()
  .escape()
  .isLength({ min: 5 })
  .withMessage('Username must be at least 5 characters long')
  .custom(async value => {
    const userInDB = await User.findOne({ username: value });
    if (userInDB) {
      throw new Error("Username already exists");
    }
  }),
  
  body('password')
  .trim()
  .escape()
  .isLength({ min: passwordLength.min, max: passwordLength.max})
  .withMessage(`Password must be between ${passwordLength.min} and ${passwordLength.max} characters long`),

  body('countryCode')
  .trim()
  .escape()
  .isNumeric()
  .withMessage('Country code must be a number'),
  
  body('phoneNumber')
  .trim()
  .isMobilePhone('en-US')
  .withMessage('Phone number is not valid')
  .custom(async value => {
    const phonenumberInDB = await User.findOne({
      phoneNumber: value,
    });
    if (phonenumberInDB) {
      throw new Error("Phone number already exists");
    }
  })
]

