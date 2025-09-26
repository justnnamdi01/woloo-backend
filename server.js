'use strict';

const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const { MongoClient, ObjectId } = require('mongodb');
require('dotenv').config();

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI;
const DB_NAME = process.env.DB_NAME || 'woloo';

if (!MONGO_URI) {
	console.error('Missing MONGO_URI in .env');
	process.exit(1);
}

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

// Logger middleware (custom)
app.use((req, res, next) => {
	const start = Date.now();
	res.on('finish', () => {
		const ms = Date.now() - start;
		console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} ${res.statusCode} ${ms}ms`);
	});
	return next();
});

// Morgan for detailed logs
app.use(morgan('dev'));

// Static images with custom error if file missing
const imagesDir = path.join(__dirname, 'images');
app.get('/images/:fileName', (req, res) => {
	const filePath = path.join(imagesDir, req.params.fileName);
	fs.access(filePath, fs.constants.F_OK, (err) => {
		if (err) {
			return res.status(404).json({ error: 'Image not found' });
		}
		return res.sendFile(filePath);
	});
});

let db, lessons, orders, client;

async function initDb() {
	const tlsInsecure = String(process.env.TLS_INSECURE || '').toLowerCase() === 'true';
	client = new MongoClient(MONGO_URI, tlsInsecure ? { tlsAllowInvalidCertificates: true } : undefined);
	await client.connect();
	db = client.db(DB_NAME);
	lessons = db.collection('lesson');
	orders = db.collection('order');
	console.log(`Connected to MongoDB database: ${DB_NAME}`);
}

// Routes
app.get('/health', (req, res) => {
	res.json({ ok: true });
});

// Get all lessons
app.get('/lessons', async (req, res) => {
	try {
		const docs = await lessons.find({}).toArray();
		res.json(docs);
	} catch (err) {
		console.error(err);
		res.status(500).json({ error: 'Failed to fetch lessons' });
	}
});

// Search lessons
app.get('/search', async (req, res) => {
	try {
		const q = (req.query.q || '').toString().trim();
		if (!q) {
			const all = await lessons.find({}).toArray();
			return res.json(all);
		}
		const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
		const maybeNum = Number(q);
		const isNum = !Number.isNaN(maybeNum);
		const or = [
			{ subject: { $regex: regex } },
			{ location: { $regex: regex } },
		];
		if (isNum) {
			or.push({ price: maybeNum });
			or.push({ spaces: maybeNum });
		}
		const results = await lessons.find({ $or: or }).toArray();
		res.json(results);
	} catch (err) {
		console.error(err);
		res.status(500).json({ error: 'Search failed' });
	}
});

// Create order
app.post('/orders', async (req, res) => {
	try {
		const { name, phone, items } = req.body || {};
		if (!name || !/^[A-Za-z\s]+$/.test(name)) {
			return res.status(400).json({ error: 'Invalid name' });
		}
		if (!phone || !/^\d+$/.test(phone)) {
			return res.status(400).json({ error: 'Invalid phone' });
		}
		if (!Array.isArray(items) || items.length === 0) {
			return res.status(400).json({ error: 'No items in order' });
		}
		// Basic validation of item structure
		for (const it of items) {
			if (!it.lessonId || Number.isNaN(ObjectId.createFromHexString(it.lessonId))) {
				return res.status(400).json({ error: 'Invalid lessonId' });
			}
			if (!Number.isInteger(it.quantity) || it.quantity <= 0) {
				return res.status(400).json({ error: 'Invalid quantity' });
			}
		}
		const orderDoc = { name, phone, items, createdAt: new Date() };
		const result = await orders.insertOne(orderDoc);
		res.status(201).json({ _id: result.insertedId, ...orderDoc });
	} catch (err) {
		console.error(err);
		res.status(500).json({ error: 'Failed to create order' });
	}
});

// Update lesson by id (any attribute, especially spaces)
app.put('/lessons/:id', async (req, res) => {
	try {
		const id = req.params.id;
		let oid;
		try { oid = new ObjectId(id); } catch (e) { return res.status(400).json({ error: 'Invalid id' }); }
		const allowed = ['subject', 'location', 'price', 'spaces', 'image'];
		const set = {};
		for (const k of allowed) {
			if (Object.prototype.hasOwnProperty.call(req.body, k)) {
				set[k] = req.body[k];
			}
		}
		if (Object.keys(set).length === 0) {
			return res.status(400).json({ error: 'No valid fields to update' });
		}
		const result = await lessons.findOneAndUpdate({ _id: oid }, { $set: set }, { returnDocument: 'after' });
		if (!result || !result.value) return res.status(404).json({ error: 'Lesson not found' });
		res.json(result.value);
	} catch (err) {
		console.error(err);
		res.status(500).json({ error: 'Failed to update lesson' });
	}
});

// Startup
initDb()
	.then(() => {
		app.listen(PORT, () => {
			console.log(`Server listening on port ${PORT}`);
		});
	})
	.catch((err) => {
		console.error('Failed to initialize DB', err);
		process.exit(1);
	});

process.on('SIGINT', async () => {
	try {
		await client?.close();
	} finally {
		process.exit(0);
	}
});


