import { Redis } from "ioredis";

const redis = new Redis({
  host: process.env.REDIS_SERVER_TO_CACHE_INFO_URL as string,
  port: Number(process.env.REDIS_SERVER_TO_CACHE_INFO_PORT as string),
  password: process.env.REDIS_SERVER_TO_CACHE_INFO_PASSWORD as string,
});

export default redis;
