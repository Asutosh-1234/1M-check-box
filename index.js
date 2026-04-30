import http from "node:http";
import path from "node:path";

import express from "express";
import { Server } from "socket.io";


async function main() {
    const PORT = process.env.PORT ?? 8000;
    const app = express();
    const httpServer = http.createServer(app);
    const io = new Server(httpServer);

    io.attach(httpServer)
    // scoket event
    io.on("connect", (socket) => {
        console.log("user connected", { id: socket.id })
        socket.on("user:checked", (data) => {
            console.log("user checked", data, { id: socket.id });
            io.emit("user:checked", data);
        })
    })

    // all express routes
    app.use(express.static(path.resolve("./public")))

    app.get("/helth", (req, res) => {
        res.json({ message: "okkk " })
    })


    httpServer.listen(PORT, () => {
        console.log(`server is running on port ${PORT} http://localhost:${PORT}`);
    });
}

main();