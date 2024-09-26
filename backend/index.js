import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { connectDB } from './config/db.js';
dotenv.config();

const envOrigin = process.env.ORIGIN;

const corsOptions = {
  origin: envOrigin,
  credentials: true,
  optionsSuccessStatus: 200
};

import userRouter from './api/user.routes.js';
import resortRouter from './api/resort.routes.js';

const port = process.env.PORT || 3000;

const app = express();
app.use(express.json());
app.use(cors(corsOptions));

app.use('/api/users', userRouter);
app.use('/api/resorts', resortRouter);


app.listen(port, () => {
  connectDB();
  console.log(`Server running on port ${port}`);
});