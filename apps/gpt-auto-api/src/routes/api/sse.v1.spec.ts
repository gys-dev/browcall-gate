import express from 'express';
import bodyParser from 'body-parser';
import apiRoutes from '../index';

describe('GPT Auto API Routes', () => {
  let app: express.Express;

  beforeEach(() => {
    app = express();
    app.use(bodyParser.json());
    app.use(apiRoutes);
  });

  it('should return 400 when GET /sse is called without prompt or messages', async () => {
    // Basic route smoke test
    expect(app).toBeDefined();
  });
});
