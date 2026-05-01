import http from "node:http";
import path from "node:path";

import express from "express";
import { Server } from "socket.io";

import { publisher, subscriber, redis } from "./redis-connection.js";

const CHECKBOX_KEY = "1M_check_box";
const CHECKBOX_COUNT = 100;

// get the state of checkboxes from redis 
async function getState() {
	const existingState = await redis.get(CHECKBOX_KEY);
	if (existingState) return JSON.parse(existingState);
	return new Array(CHECKBOX_COUNT).fill(false);
}

// update the state of checkboxes in redis 
async function updateState(index, checked) {
	const state = await getState();
	state[index] = checked;
	await redis.set(CHECKBOX_KEY, JSON.stringify(state));
}

// rate limiting
async function rateLimit(socket) {
	const ip = socket.handshake.address;
	const key = `rateLimit:${ip}`;
	const now = Date.now();
	const windowMs = 60 * 1000;
	const max = 10;

	await redis.zremrangebyscore(key, 0, now - windowMs);
	const count = await redis.zcard(key);

	if (count >= max) return false;

	await redis.zadd(key, now, `${now}`);
	await redis.expire(key, windowMs / 1000);
	return true;
}

async function main() {
	const PORT = process.env.PORT ?? 8000;
	const app = express();
	const httpServer = http.createServer(app);
	const io = new Server(httpServer);

	// pubsub setup
	io.attach(httpServer)
	await subscriber.subscribe("internalServer:checkBox");
	subscriber.on("message", (channel, message) => {
		if (channel === "internalServer:checkBox") {
			const { index, checked } = JSON.parse(message);
			io.emit("user:checked", { index, checked });
		}
	})

	// socket events
	io.on("connect", (socket) => {
		console.log("user connected", { id: socket.id })

		socket.on("user:checked", async (data) => {
			console.log("user checked", data, { id: socket.id });
			const allowed = await rateLimit(socket);
			if (!allowed) return socket.emit("error", { message: "Too many requests" });

			await updateState(data.index, data.checked);
			await publisher.publish("internalServer:checkBox", JSON.stringify(data));
		})
	})

	// static files
	app.use(express.static(path.resolve("./public")))

	// get the state of checkboxes
	app.get("/stateOfCheckBox", async (req, res) => {
		const state = await getState();
		return res.json({ state });
	})

	// health check route
	app.get("/health", (req, res) => {
		res.json({ message: "okkk " })
	})

	httpServer.listen(PORT, () => {
		console.log(`server is running on port ${PORT} http://localhost:${PORT}`);
	});
}

main();