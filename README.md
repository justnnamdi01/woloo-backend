Woloo After School Hub - Backend (Express + MongoDB Native Driver)

Environment
Create `.env` with:

```
MONGO_URI=mongodb+srv://<user>:<pass>@<cluster>/<options>
DB_NAME=woloo
PORT=3000
```

If you have local TLS issues, you may try:
```
TLS_INSECURE=true
```

Also ensure your IP is allowed in MongoDB Atlas Network Access.

Scripts
- `npm run dev` – start with nodemon
- `npm start` – start server
- `npm run seed` – seed 10 lessons (each with 5 spaces)

Routes
- `GET /lessons` – list all lessons
- `GET /search?q=...` – full-text style search (subject, location; numeric matches for price/spaces)
- `POST /orders` – create order: `{ name, phone, items:[{lessonId, quantity}] }`
- `PUT /lessons/:id` – update arbitrary fields (e.g., `{ spaces: 3 }`)
- `GET /images/:fileName` – serve image or 404 JSON

Deploy to AWS Elastic Beanstalk
1. Create a Node.js 20+ EB app + environment.
2. Set environment variables: `MONGO_URI`, `DB_NAME`, `PORT` (3000), optionally `TLS_INSECURE=false`.
3. Deploy zipped backend folder (exclude `node_modules`). EB uses `npm start`.
4. Verify health check and open `GET /lessons` public URL; use this URL in the frontend `API_BASE`.

Postman
Use `Postman_collection.json` in this folder; set `baseUrl` to your EB URL.



