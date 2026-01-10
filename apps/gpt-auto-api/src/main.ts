import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import apiRoutes from './routes';

import dotenv from 'dotenv';
dotenv.config();

const HTTP_PORT = process.env.HTTP_PORT ? Number(process.env.HTTP_PORT) : 8766;

const app = express();

// app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(apiRoutes);

app.listen(HTTP_PORT, () => {
  console.log(
    `Server running at http://localhost:${HTTP_PORT}/v1/chat/completions`
  );
});
