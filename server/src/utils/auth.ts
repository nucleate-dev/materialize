import { FastifyRequest } from 'fastify';
import { supabase } from '../config/supabase';

export interface AuthenticatedUser {
  id: string;
  email: string;
  role?: string;
}

export async function verifyToken(token: string): Promise<AuthenticatedUser | null> {
  try {
    const { data, error } = await supabase.auth.getUser(token);
    
    if (error || !data.user) {
      return null;
    }

    return {
      id: data.user.id,
      email: data.user.email || '',
      role: data.user.role,
    };
  } catch (error) {
    console.error('Token verification error:', error);
    return null;
  }
}

export async function authenticateRequest(request: FastifyRequest): Promise<AuthenticatedUser | null> {
  const authHeader = request.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.slice(7); // Remove 'Bearer ' prefix
  return verifyToken(token);
}

export function requireAuth() {
  return async (request: FastifyRequest, reply: any) => {
    const user = await authenticateRequest(request);
    
    if (!user) {
      reply.code(401).send({ error: 'Unauthorized' });
      return;
    }

    // Attach user to request for use in route handlers
    (request as any).user = user;
  };
}