import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import cors from 'cors';
import express from 'express';
import jwt from 'jsonwebtoken';
import multer from 'multer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadDir = process.env.VERCEL ? '/tmp/clouddash-uploads' : path.join(__dirname, '..', 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });
const app = express(); const secret = process.env.JWT_SECRET || 'change-me-in-production';
app.use(cors()); app.use(express.json());
const upload = multer({ dest: uploadDir, limits: { fileSize: 5 * 1024 * 1024 * 1024 } });
let videos = [{ id:'EV-2026-1842', name:'dashcam_20260928_1412.mp4', status:'ANALYSIS_COMPLETE', integrity:'VERIFIED', sha256:'bf9cae31d2f4a7054d89128f3b98ee21841fe9a235c9d0dc8e51d08a' }];
let alerts = [{ id:'AL-214', title:'Collision classification exceeds threshold', severity:'HIGH', resolved:false }];
const audit = [];
function actor(req,res,next){ const token=req.headers.authorization?.replace('Bearer ',''); if(!token) return res.status(401).json({error:'Authentication required'}); try{req.user=jwt.verify(token,secret);next()}catch{return res.status(401).json({error:'Invalid token'})} }
function allow(...roles){return (req,res,next)=>roles.includes(req.user.role)?next():res.status(403).json({error:'Insufficient role'})}
function log(user,action,target){audit.unshift({id:crypto.randomUUID(),at:new Date().toISOString(),actor:user,action,target})}
app.get('/api/health',(_,res)=>res.json({status:'healthy',services:{api:'healthy',storage:'healthy',worker:'healthy',ledger:'healthy'}}));
app.post('/api/auth/login',async(req,res)=>{const email=req.body.email||'analyst@clouddash.local'; const role=email.startsWith('admin')?'ADMIN':'ANALYST'; const token=jwt.sign({sub:'demo-user',email,role},secret,{expiresIn:'8h'}); res.json({token,user:{id:'demo-user',email,role}})});
app.get('/api/dashboard',actor,(req,res)=>res.json({evidenceProcessed:1284,openIncidents:18,integrityRate:99.8,spend:1842}));
app.get('/api/videos',actor,(_,res)=>res.json(videos));
app.post('/api/videos/upload',actor,allow('ADMIN','ANALYST'),upload.single('file'),(req,res)=>{if(!req.file)return res.status(400).json({error:'A video file is required'}); const sha256=crypto.createHash('sha256').update(fs.readFileSync(req.file.path)).digest('hex'); const video={id:`EV-${new Date().getFullYear()}-${String(1843+videos.length).padStart(4,'0')}`,name:req.file.originalname,status:'QUEUED',integrity:'PENDING',sha256,createdAt:new Date().toISOString()};videos.unshift(video);log(req.user.email,'Evidence uploaded',video.id);res.status(201).json(video)});
app.post('/api/videos/:id/verify',actor,allow('ADMIN','ANALYST'),(req,res)=>{const video=videos.find(v=>v.id===req.params.id);if(!video)return res.status(404).json({error:'Evidence not found'});video.integrity='VERIFIED';log(req.user.email,'Integrity verified',video.id);res.json(video)});
app.get('/api/incidents',actor,(_,res)=>res.json([{id:'INC-884',title:'Vehicle collision detected',severity:'HIGH',confidence:94,status:'OPEN'}]));
app.get('/api/alerts',actor,(_,res)=>res.json(alerts));
app.patch('/api/alerts/:id/resolve',actor,allow('ADMIN','ANALYST'),(req,res)=>{const alert=alerts.find(a=>a.id===req.params.id);if(!alert)return res.status(404).json({error:'Alert not found'});alert.resolved=true;log(req.user.email,'Alert resolved',alert.id);res.json(alert)});
app.get('/api/audit-logs',actor,allow('ADMIN','ANALYST'),(_,res)=>res.json(audit));
app.post('/api/segments/verify',actor,allow('ADMIN','ANALYST'),(req,res)=>{const segments=[...(req.body.segments||[])].sort((a,b)=>a.sequence-b.sequence);let previousHash=null;for(const segment of segments){const expected=crypto.createHash('sha256').update(`${previousHash||'GENESIS'}:${segment.sha256}:${segment.sequence}`).digest('hex');if(segment.chainHash!==expected||segment.previousHash!==previousHash)return res.status(422).json({valid:false,failedSequence:segment.sequence,expected});previousHash=segment.chainHash}log(req.user.email,'Evidence chain verified',`${segments.length} segments`);res.json({valid:true,lastHash:previousHash,segments:segments.length})});
const frontendDir = path.join(__dirname, '..', 'dist');
if (fs.existsSync(frontendDir)) {
  app.use(express.static(frontendDir));
  app.get('*', (_, res) => res.sendFile(path.join(frontendDir, 'index.html')));
}
if (!process.env.VERCEL) {
  app.listen(process.env.PORT||3001,()=>console.log(`CloudDash API listening on ${process.env.PORT||3001}`));
}

export default app;
