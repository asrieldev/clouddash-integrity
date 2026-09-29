import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express from 'express';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(cors()); app.use(express.json());
app.get('/api/health',(_,res)=>res.json({status:'healthy',services:{web:'healthy'}}));
const frontendDir = path.join(__dirname, '..', 'dist');
if (fs.existsSync(frontendDir)) {
  app.use(express.static(frontendDir));
  app.get('*', (_, res) => res.sendFile(path.join(frontendDir, 'index.html')));
}
if (!process.env.VERCEL) app.listen(process.env.PORT || 3001);

export default app;
