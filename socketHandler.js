import { publisher, subscriber } from "./redis-connection.js";
import { updateState, CHECKBOX_COUNT } from "./checkboxState.js";
import { rateLimit } from "./rateLimiter.js";

export async function setupSocket(io) {
  await subscriber.subscribe("internalServer:checkBox");
  subscriber.on("message", (channel, message) => {
    if (channel === "internalServer:checkBox") {
      const payload = JSON.parse(message);
      io.emit("user:checked", payload);
    }
  });

  io.on("connect", (socket) => {
    const req = socket.request;
    const user = req.user ?? null;
    const userId = user?.id ?? null;

    console.log("connected", { socketId: socket.id, userId });

    socket.emit("auth:state", {
      authenticated: !!user,
      user: user
        ? {
            id: user.id,
            displayName: user.display_name,
            avatar: user.avatar,
          }
        : null,
    });

    socket.on("user:checked", async (data) => {
      if (!userId) {
        return socket.emit("error", {
          message: "Please sign in to interact with checkboxes.",
          code: "AUTH_REQUIRED",
        });
      }

      const { index, checked } = data;

      if (
        typeof index !== "number" ||
        index < 0 ||
        index >= CHECKBOX_COUNT ||
        typeof checked !== "boolean"
      ) {
        return socket.emit("error", { message: "Invalid data", code: "BAD_INPUT" });
      }

      const allowed = await rateLimit(userId, socket.id);
      if (!allowed) {
        return socket.emit("error", {
          message: "Slow down! Too many changes.",
          code: "RATE_LIMITED",
        });
      }

      await updateState(index, checked);
      await publisher.publish(
        "internalServer:checkBox",
        JSON.stringify({ index, checked, userId })
      );
    });

    socket.on("disconnect", () => {
      console.log("disconnected", { socketId: socket.id, userId });
    });
  });
}
