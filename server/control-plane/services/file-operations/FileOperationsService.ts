import { createClient } from '@supabase/supabase-js';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Database } from '../../types/supabase.js';
import { HTTP_STATUS } from '../../types/PublicAPITypes.js';
import type {
  APIResponse,
  StandardErrorResponse,
  ListFilesRequestBody,
  ListFilesSuccessResponse,
  ReadFileRequestBody,
  ReadFileSuccessResponse,
  WriteFileRequestBody,
  WriteFileSuccessResponse,
  DeleteFileRequestBody,
  DeleteFileSuccessResponse,
  ReadMultipleFilesRequestBody,
  ReadMultipleFilesSuccessResponse,
} from '../../types/PublicAPITypes.js';
import { checkUserHasPrototypeEditAccess, checkUserHasPrototypeViewingAccess } from '../../utils/prototypeAuth.js';

// Binary file extensions (matching FileSyncService)
const binaryExtensions = [
  '.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg', '.webp', '.bmp', '.tiff',
  '.woff', '.woff2', '.ttf', '.otf', '.eot',
  '.mp4', '.webm', '.mov', '.avi', '.mkv',
  '.mp3', '.wav', '.ogg', '.m4a', '.flac',
  '.pdf', '.zip', '.tar', '.gz', '.7z', '.rar',
  '.exe', '.dll', '.so', '.dylib', '.bin', '.dat', '.db', '.sqlite',
];

function isBinaryFile(filePath: string): boolean {
  const ext = filePath.toLowerCase().substring(filePath.lastIndexOf('.'));
  return binaryExtensions.includes(ext);
}

export class FileOperationsService {
  private supabaseUrl: string;
  private supabaseAnonKey: string;

  constructor() {
    this.supabaseUrl = process.env.SUPABASE_URL!;
    this.supabaseAnonKey = process.env.SUPABASE_ANON_KEY!;

    if (!this.supabaseUrl || !this.supabaseAnonKey) {
      throw new Error(
        'Missing required Supabase environment variables for FileOperationsService',
      );
    }
  }

  public registerRoutes(app: FastifyInstance): void {
    // List files in a prototype
    app.post<{ Body: ListFilesRequestBody }>(
      '/files/list',
      {
        schema: {
          body: {
            type: 'object',
            required: ['prototype_id'],
            properties: {
              prototype_id: { type: 'string' },
            },
          },
        },
      },
      this.handleListFiles.bind(this),
    );

    // Read a single file
    app.post<{ Body: ReadFileRequestBody }>(
      '/files/read',
      {
        schema: {
          body: {
            type: 'object',
            required: ['prototype_id', 'file_path'],
            properties: {
              prototype_id: { type: 'string' },
              file_path: { type: 'string' },
            },
          },
        },
      },
      this.handleReadFile.bind(this),
    );

    // Write a file
    app.post<{ Body: WriteFileRequestBody }>(
      '/files/write',
      {
        schema: {
          body: {
            type: 'object',
            required: ['prototype_id', 'file_path', 'content'],
            properties: {
              prototype_id: { type: 'string' },
              file_path: { type: 'string' },
              content: { type: 'string' },
            },
          },
        },
      },
      this.handleWriteFile.bind(this),
    );

    // Delete a file
    app.post<{ Body: DeleteFileRequestBody }>(
      '/files/delete',
      {
        schema: {
          body: {
            type: 'object',
            required: ['prototype_id', 'file_path'],
            properties: {
              prototype_id: { type: 'string' },
              file_path: { type: 'string' },
            },
          },
        },
      },
      this.handleDeleteFile.bind(this),
    );

    // Read multiple files
    app.post<{ Body: ReadMultipleFilesRequestBody }>(
      '/files/read-multiple',
      {
        schema: {
          body: {
            type: 'object',
            required: ['prototype_id', 'file_paths'],
            properties: {
              prototype_id: { type: 'string' },
              file_paths: {
                type: 'array',
                items: { type: 'string' },
              },
            },
          },
        },
      },
      this.handleReadMultipleFiles.bind(this),
    );
  }

  private async handleListFiles(
    request: FastifyRequest<{ Body: ListFilesRequestBody }>,
    reply: FastifyReply,
  ): Promise<APIResponse<ListFilesSuccessResponse, StandardErrorResponse>> {
    const { prototype_id } = request.body;
    const token = request.headers.authorization?.split(' ')[1];

    // Check viewing access
    const accessResult = await checkUserHasPrototypeViewingAccess(
      prototype_id,
      token,
      request.log2,
    );

    if (!accessResult) {
      return reply.status(HTTP_STATUS.UNAUTHORIZED).send({
        data: null,
        error: {
          error: 'UNAUTHORIZED',
          message: 'Access denied to this prototype',
        },
      });
    }

    try {
      const supabase = this.createSupabaseClient(token);

      // Fetch text files
      const { data: textFiles, error: textFilesError } = await supabase
        .from('prototype_files')
        .select('name, updated_at')
        .eq('prototype_id', prototype_id)
        .order('name', { ascending: true });

      if (textFilesError) {
        request.log2.error(textFilesError, 'Error fetching text files');
        return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
          data: null,
          error: {
            error: 'DATABASE_ERROR',
            message: textFilesError.message,
          },
        });
      }

      // Fetch binary assets
      const { data: binaryAssets, error: binaryAssetsError } = await supabase
        .from('prototype_assets')
        .select('name, updated_at')
        .eq('prototype_id', prototype_id)
        .order('name', { ascending: true });

      if (binaryAssetsError) {
        request.log2.error(binaryAssetsError, 'Error fetching binary assets');
        return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
          data: null,
          error: {
            error: 'DATABASE_ERROR',
            message: binaryAssetsError.message,
          },
        });
      }

      const files = [
        ...(textFiles || []).map((f) => ({
          name: f.name,
          type: 'text' as const,
          updated_at: f.updated_at,
        })),
        ...(binaryAssets || []).map((f) => ({
          name: f.name,
          type: 'binary' as const,
          updated_at: f.updated_at,
        })),
      ].sort((a, b) => a.name.localeCompare(b.name));

      return reply.status(HTTP_STATUS.OK).send({
        data: { files },
        error: null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      request.log2.error(new Error(message), 'Error listing files');
      return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
        data: null,
        error: {
          error: 'INTERNAL_ERROR',
          message,
        },
      });
    }
  }

  private async handleReadFile(
    request: FastifyRequest<{ Body: ReadFileRequestBody }>,
    reply: FastifyReply,
  ): Promise<APIResponse<ReadFileSuccessResponse, StandardErrorResponse>> {
    const { prototype_id, file_path } = request.body;
    const token = request.headers.authorization?.split(' ')[1];

    // Check viewing access
    const accessResult = await checkUserHasPrototypeViewingAccess(
      prototype_id,
      token,
      request.log2,
    );

    if (!accessResult) {
      return reply.status(HTTP_STATUS.UNAUTHORIZED).send({
        data: null,
        error: {
          error: 'UNAUTHORIZED',
          message: 'Access denied to this prototype',
        },
      });
    }

    try {
      const supabase = this.createSupabaseClient(token);
      const isBinary = isBinaryFile(file_path);

      if (isBinary) {
        // Download binary file from storage
        const { data, error } = await supabase.storage
          .from('prototype-assets')
          .download(`${prototype_id}/${file_path}`);

        if (error || !data) {
          return reply.status(HTTP_STATUS.NOT_FOUND).send({
            data: null,
            error: {
              error: 'NOT_FOUND',
              message: `File not found: ${file_path}`,
            },
          });
        }

        const arrayBuffer = await data.arrayBuffer();
        const base64Content = Buffer.from(arrayBuffer).toString('base64');

        return reply.status(HTTP_STATUS.OK).send({
          data: {
            file_path,
            content: base64Content,
            type: 'binary',
          },
          error: null,
        });
      } else {
        // Fetch text file from database
        const { data: file, error } = await supabase
          .from('prototype_files')
          .select('contents')
          .eq('prototype_id', prototype_id)
          .eq('name', file_path)
          .single();

        if (error || !file) {
          return reply.status(HTTP_STATUS.NOT_FOUND).send({
            data: null,
            error: {
              error: 'NOT_FOUND',
              message: `File not found: ${file_path}`,
            },
          });
        }

        return reply.status(HTTP_STATUS.OK).send({
          data: {
            file_path,
            content: file.contents,
            type: 'text',
          },
          error: null,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      request.log2.error(new Error(message), 'Error reading file');
      return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
        data: null,
        error: {
          error: 'INTERNAL_ERROR',
          message,
        },
      });
    }
  }

  private async handleWriteFile(
    request: FastifyRequest<{ Body: WriteFileRequestBody }>,
    reply: FastifyReply,
  ): Promise<APIResponse<WriteFileSuccessResponse, StandardErrorResponse>> {
    const { prototype_id, file_path, content } = request.body;
    const token = request.headers.authorization?.split(' ')[1];

    // Check edit access
    const accessResult = await checkUserHasPrototypeEditAccess(
      prototype_id,
      token,
      request.log2,
    );

    if (!accessResult || !accessResult.canEdit) {
      return reply.status(HTTP_STATUS.UNAUTHORIZED).send({
        data: null,
        error: {
          error: 'UNAUTHORIZED',
          message: 'You do not have edit access to this prototype',
        },
      });
    }

    try {
      const supabase = this.createSupabaseClient(token);
      const isBinary = isBinaryFile(file_path);

      if (isBinary) {
        // Upload binary file to storage (content should be base64 encoded)
        const binaryContent = Buffer.from(content, 'base64');

        const { error: uploadError } = await supabase.storage
          .from('prototype-assets')
          .upload(`${prototype_id}/${file_path}`, binaryContent, {
            upsert: true,
            contentType: this.getContentType(file_path),
          });

        if (uploadError) {
          request.log2.error(uploadError, 'Error uploading binary file');
          return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
            data: null,
            error: {
              error: 'STORAGE_ERROR',
              message: uploadError.message,
            },
          });
        }

        // Upsert metadata
        const { error: dbError } = await supabase
          .from('prototype_assets')
          .upsert(
            {
              prototype_id,
              name: file_path,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'prototype_id,name' },
          );

        if (dbError) {
          request.log2.error(dbError, 'Error upserting asset metadata');
          return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
            data: null,
            error: {
              error: 'DATABASE_ERROR',
              message: dbError.message,
            },
          });
        }
      } else {
        // Upsert text file
        const { error } = await supabase
          .from('prototype_files')
          .upsert(
            {
              prototype_id,
              name: file_path,
              contents: content,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'prototype_id,name' },
          );

        if (error) {
          request.log2.error(error, 'Error upserting text file');
          return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
            data: null,
            error: {
              error: 'DATABASE_ERROR',
              message: error.message,
            },
          });
        }
      }

      return reply.status(HTTP_STATUS.OK).send({
        data: {
          success: true,
          file_path,
          message: 'File written successfully',
        },
        error: null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      request.log2.error(new Error(message), 'Error writing file');
      return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
        data: null,
        error: {
          error: 'INTERNAL_ERROR',
          message,
        },
      });
    }
  }

  private async handleDeleteFile(
    request: FastifyRequest<{ Body: DeleteFileRequestBody }>,
    reply: FastifyReply,
  ): Promise<APIResponse<DeleteFileSuccessResponse, StandardErrorResponse>> {
    const { prototype_id, file_path } = request.body;
    const token = request.headers.authorization?.split(' ')[1];

    // Check edit access
    const accessResult = await checkUserHasPrototypeEditAccess(
      prototype_id,
      token,
      request.log2,
    );

    if (!accessResult || !accessResult.canEdit) {
      return reply.status(HTTP_STATUS.UNAUTHORIZED).send({
        data: null,
        error: {
          error: 'UNAUTHORIZED',
          message: 'You do not have edit access to this prototype',
        },
      });
    }

    try {
      const supabase = this.createSupabaseClient(token);
      const isBinary = isBinaryFile(file_path);

      if (isBinary) {
        // Delete from storage
        const { error: storageError } = await supabase.storage
          .from('prototype-assets')
          .remove([`${prototype_id}/${file_path}`]);

        if (storageError) {
          request.log2.warn('Error deleting from storage', {
            error: storageError.message,
          });
        }

        // Delete metadata
        const { error: dbError } = await supabase
          .from('prototype_assets')
          .delete()
          .eq('prototype_id', prototype_id)
          .eq('name', file_path);

        if (dbError) {
          request.log2.error(dbError, 'Error deleting asset metadata');
          return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
            data: null,
            error: {
              error: 'DATABASE_ERROR',
              message: dbError.message,
            },
          });
        }
      } else {
        // Delete text file
        const { error } = await supabase
          .from('prototype_files')
          .delete()
          .eq('prototype_id', prototype_id)
          .eq('name', file_path);

        if (error) {
          request.log2.error(error, 'Error deleting text file');
          return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
            data: null,
            error: {
              error: 'DATABASE_ERROR',
              message: error.message,
            },
          });
        }
      }

      return reply.status(HTTP_STATUS.OK).send({
        data: {
          success: true,
          file_path,
          message: 'File deleted successfully',
        },
        error: null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      request.log2.error(new Error(message), 'Error deleting file');
      return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
        data: null,
        error: {
          error: 'INTERNAL_ERROR',
          message,
        },
      });
    }
  }

  private async handleReadMultipleFiles(
    request: FastifyRequest<{ Body: ReadMultipleFilesRequestBody }>,
    reply: FastifyReply,
  ): Promise<APIResponse<ReadMultipleFilesSuccessResponse, StandardErrorResponse>> {
    const { prototype_id, file_paths } = request.body;
    const token = request.headers.authorization?.split(' ')[1];

    // Check viewing access
    const accessResult = await checkUserHasPrototypeViewingAccess(
      prototype_id,
      token,
      request.log2,
    );

    if (!accessResult) {
      return reply.status(HTTP_STATUS.UNAUTHORIZED).send({
        data: null,
        error: {
          error: 'UNAUTHORIZED',
          message: 'Access denied to this prototype',
        },
      });
    }

    try {
      const supabase = this.createSupabaseClient(token);
      const textFilePaths = file_paths.filter((p) => !isBinaryFile(p));
      const binaryFilePaths = file_paths.filter((p) => isBinaryFile(p));

      const files: Array<{
        file_path: string;
        content: string | null;
        type: 'text' | 'binary';
        error?: string;
      }> = [];

      // Fetch text files
      if (textFilePaths.length > 0) {
        const { data: textFiles, error: textError } = await supabase
          .from('prototype_files')
          .select('name, contents')
          .eq('prototype_id', prototype_id)
          .in('name', textFilePaths);

        if (textError) {
          request.log2.error(textError, 'Error fetching text files');
        }

        const textFileMap = new Map(
          (textFiles || []).map((f) => [f.name, f.contents]),
        );

        for (const filePath of textFilePaths) {
          const content = textFileMap.get(filePath);
          if (content !== undefined) {
            files.push({
              file_path: filePath,
              content,
              type: 'text',
            });
          } else {
            files.push({
              file_path: filePath,
              content: null,
              type: 'text',
              error: 'File not found',
            });
          }
        }
      }

      // Fetch binary files
      for (const filePath of binaryFilePaths) {
        try {
          const { data, error } = await supabase.storage
            .from('prototype-assets')
            .download(`${prototype_id}/${filePath}`);

          if (error || !data) {
            files.push({
              file_path: filePath,
              content: null,
              type: 'binary',
              error: 'File not found',
            });
          } else {
            const arrayBuffer = await data.arrayBuffer();
            const base64Content = Buffer.from(arrayBuffer).toString('base64');
            files.push({
              file_path: filePath,
              content: base64Content,
              type: 'binary',
            });
          }
        } catch (err) {
          files.push({
            file_path: filePath,
            content: null,
            type: 'binary',
            error: err instanceof Error ? err.message : 'Unknown error',
          });
        }
      }

      return reply.status(HTTP_STATUS.OK).send({
        data: { files },
        error: null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      request.log2.error(new Error(message), 'Error reading multiple files');
      return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
        data: null,
        error: {
          error: 'INTERNAL_ERROR',
          message,
        },
      });
    }
  }

  private createSupabaseClient(token?: string): ReturnType<typeof createClient<Database>> {
    return createClient<Database>(
      this.supabaseUrl,
      this.supabaseAnonKey,
      token
        ? {
            global: {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            },
          }
        : undefined,
    );
  }

  private getContentType(filePath: string): string {
    const ext = filePath.toLowerCase().substring(filePath.lastIndexOf('.'));
    const contentTypes: Record<string, string> = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.webp': 'image/webp',
      '.ico': 'image/x-icon',
      '.pdf': 'application/pdf',
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.woff': 'font/woff',
      '.woff2': 'font/woff2',
      '.ttf': 'font/ttf',
      '.otf': 'font/otf',
    };
    return contentTypes[ext] || 'application/octet-stream';
  }
}
