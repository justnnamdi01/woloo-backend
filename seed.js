'use strict';
const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI;
const DB_NAME = process.env.DB_NAME || 'woloo';

if (!MONGO_URI) {
	console.error('Missing MONGO_URI in .env');
	process.exit(1);
}

async function run() {
	const tlsInsecure = String(process.env.TLS_INSECURE || '').toLowerCase() === 'true';
	const client = new MongoClient(MONGO_URI, tlsInsecure ? { tlsAllowInvalidCertificates: true } : undefined);
	await client.connect();
	const db = client.db(DB_NAME);
	const lessons = db.collection('lesson');

	await lessons.deleteMany({});

	const docs = [
		{ subject: 'Math', location: 'Hendon', price: 100, spaces: 5, image: null },
		{ subject: 'Science', location: 'Colindale', price: 90, spaces: 5, image: null },
		{ subject: 'English', location: 'Brent Cross', price: 80, spaces: 5, image: null },
		{ subject: 'Coding', location: 'Golders Green', price: 95, spaces: 5, image: null },
		{ subject: 'Art', location: 'Camden', price: 70, spaces: 5, image: null },
		{ subject: 'Music', location: 'Barnet', price: 85, spaces: 5, image: null },
		{ subject: 'Drama', location: 'Edgware', price: 75, spaces: 5, image: null },
		{ subject: 'Robotics', location: 'Wembley', price: 110, spaces: 5, image: null },
		{ subject: 'Chess', location: 'Mill Hill', price: 65, spaces: 5, image: null },
		{ subject: 'French', location: 'Finchley', price: 88, spaces: 5, image: null }
	];

	await lessons.insertMany(docs);
	console.log('Seeded lessons:', docs.length);
	await client.close();
}

run().catch((e) => {
	console.error(e);
	process.exit(1);
});


