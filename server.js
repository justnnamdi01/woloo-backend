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
	try {
		const tlsInsecure = String(process.env.TLS_INSECURE || '').toLowerCase() === 'true';
		client = new MongoClient(MONGO_URI, tlsInsecure ? { tlsAllowInvalidCertificates: true } : undefined);
		
		console.log('Attempting to connect to MongoDB...');
		await client.connect();
		
		// Test the connection
		await client.db('admin').admin().ping();
		
		db = client.db(DB_NAME);
		lessons = db.collection('lesson');
		orders = db.collection('order');
		
		// Get connection info
		const serverInfo = await client.db('admin').admin().serverStatus();
		
		console.log(`✅ Connected to MongoDB successfully!`);
		console.log(`   Database: ${DB_NAME}`);
		console.log(`   Host: ${client.options.hosts[0]}`);
		console.log(`   MongoDB Version: ${serverInfo.version}`);
		
		// Test collections
		const lessonCount = await lessons.countDocuments();
		const orderCount = await orders.countDocuments();
		console.log(`   Collections: lessons (${lessonCount} docs), orders (${orderCount} docs)`);
		
	} catch (error) {
		console.error('❌ Failed to connect to MongoDB:', error.message);
		throw error;
	}
}

// Routes
app.get('/health', (req, res) => {
	res.json({ ok: true });
});

// Database health check
app.get('/health/db', async (req, res) => {
	try {
		// Test database connection by pinging
		await db.admin().ping();
		res.json({ 
			status: 'connected', 
			database: DB_NAME,
			collections: {
				lessons: await lessons.countDocuments(),
				orders: await orders.countDocuments()
			}
		});
	} catch (err) {
		console.error('Database health check failed:', err);
		res.status(500).json({ 
			status: 'disconnected', 
			error: err.message 
		});
	}
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
		try { oid = new ObjectId(id); } catch (e) { console.log('PUT /lessons invalid id:', id); return res.status(400).json({ error: 'Invalid id' }); }
		const allowed = ['subject', 'location', 'price', 'spaces', 'image'];
		const set = {};
		for (const k of allowed) {
			if (Object.prototype.hasOwnProperty.call(req.body, k)) {
				set[k] = req.body[k];
			}
		}
		if (Object.keys(set).length === 0) {
			console.log('PUT /lessons no fields to update for id:', id);
			return res.status(400).json({ error: 'No valid fields to update' });
		}
		let result = await lessons.findOneAndUpdate({ _id: oid }, { $set: set }, { returnDocument: 'after' });
		if (!result || !result.value) {
			// Fallback in case _id was stored as string for any reason
			console.log('PUT /lessons not found by ObjectId, trying string match for id:', id);
			result = await lessons.findOneAndUpdate({ _id: id }, { $set: set }, { returnDocument: 'after' });
		}
		if (!result || !result.value) {
			console.log('PUT /lessons still not found for id:', id);
			return res.status(404).json({ error: 'Lesson not found' });
		}
		return res.json(result.value);
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


