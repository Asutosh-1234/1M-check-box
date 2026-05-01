import http from "node:http";
import path from "node:path";

import express from "express";
import { Server } from "socket.io";

import { publisher, subscriber, redis } from "./redis-connection.js";


async function main() {
	const PORT = process.env.PORT ?? 8000;
	const app = express();
	const httpServer = http.createServer(app);
	const io = new Server(httpServer);
	const checkboxs = 100;
	const CHECKBOX_KEY = "1M_check_box";

	// store the state of the check boxes of count checkboxs

	io.attach(httpServer)
	await subscriber.subscribe("internalServer:checkBox");
	subscriber.on("message", (channel, message) => {
		if (channel === "internalServer:checkBox") {
			const { index, checked } = JSON.parse(message);

			// send the update state to all the users
			io.emit("user:checked", { index, checked });
		}
	})

	// socket event
	io.on("connect", (socket) => {
		console.log("user connected", { id: socket.id })

		socket.on("user:checked", async (data) => {
			console.log("user checked", data, { id: socket.id });

			const existingState = await redis.get(CHECKBOX_KEY);

			if (existingState) {
				const remoteData = JSON.parse(existingState);
				remoteData[data.index] = data.checked;
				await redis.set(CHECKBOX_KEY, JSON.stringify(remoteData));
			} else {
				await redis.set(CHECKBOX_KEY, JSON.stringify(new Array(checkboxs).fill(false)));
			}

			// Send current state to all users
			await publisher.publish("internalServer:checkBox", JSON.stringify(data));
		})
	})

	// all express routes
	app.use(express.static(path.resolve("./public")))

	app.get("/stateOfCheckBox", async (req, res) => {
		// return the state of checkboxes
		const existingState = await redis.get(CHECKBOX_KEY);
		if (existingState) {
			const remoteData = JSON.parse(existingState);
			return res.json({ state: remoteData });

		}
		return res.json({ state: new Array(checkboxs).fill(false) });
	})

	app.get("/health", (req, res) => {
		res.json({ message: "okkk " })
	})


	httpServer.listen(PORT, () => {
		console.log(`server is running on port ${PORT} http://localhost:${PORT}`);
	});
}

main();