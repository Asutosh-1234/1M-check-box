import Redis from "ioredis";

export function createRedisConnection() {
	return new Redis({
		host: "localhost",
		port: 6379,
	});
}



export const publisher = createRedisConnection();

export const subscriber = createRedisConnection();

export const redis = createRedisConnection();