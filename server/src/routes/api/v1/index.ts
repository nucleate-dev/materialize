import { FastifyPluginCallback } from 'fastify';

const apiRoutes: FastifyPluginCallback = async (fastify) => {
  // API v1 base route
  fastify.get('/', {
    schema: {
      description: 'API v1 information',
      tags: ['api'],
      response: {
        200: {
          type: 'object',
          properties: {
            version: { type: 'string' },
            message: { type: 'string' },
            timestamp: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    return {
      version: 'v1',
      message: 'Materialize API v1',
      timestamp: new Date().toISOString(),
    };
  });

  // Example protected route
  fastify.get('/protected', {
    schema: {
      description: 'Protected route example',
      tags: ['api'],
      headers: {
        type: 'object',
        properties: {
          authorization: { type: 'string' },
        },
        required: ['authorization'],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            user: { type: 'object' },
          },
        },
        401: {
          type: 'object',
          properties: {
            error: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const token = request.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      reply.code(401);
      return { error: 'Authorization token required' };
    }

    // TODO: Implement token validation with Supabase
    // For now, return a mock response
    return {
      message: 'Access granted to protected resource',
      user: { id: 'mock-user-id' },
    };
  });
};

export default apiRoutes;