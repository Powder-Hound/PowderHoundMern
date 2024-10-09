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
import { getAllNOAAData } from './chron/noaaChron.js';
import { getAllWeatherBitData } from './chron/wbChron.js';
import { getAllVisualCrossingData } from './chron/visualCrossingChron.js';

const port = process.env.PORT || 3000;

const app = express();
app.use(cors(corsOptions));
app.use(express.json());

app.use('/api/users', userRouter);
app.use('/api/resorts', resortRouter);


app.listen(port, () => {
  connectDB();
  console.log(`Server running on port ${port}`);
});

// await getAllNOAAData()
// await getAllWeatherBitData()
await getAllVisualCrossingData()

// console.log(await fetchWB(39.6042,-106.5166))