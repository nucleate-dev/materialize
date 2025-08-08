import { FastifyRequest, FastifyReply } from 'fastify';

export interface ValidationError {
  field: string;
  message: string;
}

export function validateRequired(data: any, fields: string[]): ValidationError[] {
  const errors: ValidationError[] = [];
  
  for (const field of fields) {
    if (!data[field] || (typeof data[field] === 'string' && data[field].trim() === '')) {
      errors.push({
        field,
        message: `${field} is required`,
      });
    }
  }
  
  return errors;
}

export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function validateUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

export function sendValidationError(reply: FastifyReply, errors: ValidationError[]) {
  return reply.code(400).send({
    error: 'Validation failed',
    details: errors,
  });
}