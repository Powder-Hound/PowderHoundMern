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
    req.permissions = decoded.permissions
    next();
  } catch (err) {
    console.error(err);
  }
}

export const signupValidation = [

  body('countryCode')
  .trim()
  .escape()
  .isNumeric()
  .withMessage('Country code must be a number'),
  
  body('phoneNumber')
  .trim()
  .isMobilePhone('en-US')
  .withMessage('Phone number is not valid')
  .replace(/[^0-9]/g, '')
  .custom(async value => {
    const phonenumberInDB = await User.findOne({
      phoneNumber: value,
    });
    if (phonenumberInDB) {
      throw new Error("Phone number already exists");
    }
  })
]

