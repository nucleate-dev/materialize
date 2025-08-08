import { FastifyPluginCallback } from 'fastify';
import cors from '@fastify/cors';
import config from '../config/environment';

const corsPlugin: FastifyPluginCallback = async (fastify) => {
  await fastify.register(cors, {
    origin: config.CORS_ORIGIN,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin', 'X-Requested-With'],
  });
};

export default corsPlugin;