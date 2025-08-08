import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { BuildRequest, BuildResponse } from '../types/build';
import { buildRequestSchema } from '../schemas/build';
import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export default async function buildRoutes(fastify: FastifyInstance) {
  // Ensure apps directory exists
  const ensureAppsDirectory = async (): Promise<void> => {
    const appsDir = '/apps';
    try {
      await fs.access(appsDir);
    } catch {
      await fs.mkdir(appsDir, { recursive: true });
      fastify.log.info('Created /apps directory');
    }
  };

  // Write files to filesystem
  const writeProjectFiles = async (prototypeId: string, files: Record<string, { path: string; content: string }>): Promise<void> => {
    const projectDir = `/apps/${prototypeId}`;
    
    // Remove existing directory if it exists
    try {
      await fs.rm(projectDir, { recursive: true, force: true });
    } catch (error) {
      // Directory might not exist, which is fine
    }

    // Create project directory
    await fs.mkdir(projectDir, { recursive: true });

    // Write all files
    for (const [, file] of Object.entries(files)) {
      const fullPath = join(projectDir, file.path);
      const fileDir = dirname(fullPath);
      
      // Ensure directory exists
      await fs.mkdir(fileDir, { recursive: true });
      
      // Write file content
      await fs.writeFile(fullPath, file.content, 'utf8');
    }

    fastify.log.info(`Written ${Object.keys(files).length} files to ${projectDir}`);
  };

  // Initialize React Native Web build setup
  const initializeBuildSetup = async (prototypeId: string): Promise<void> => {
    const projectDir = `/apps/${prototypeId}`;
    
    // Check if package.json exists, if not create a basic React Native Web setup
    const packageJsonPath = join(projectDir, 'package.json');
    
    try {
      await fs.access(packageJsonPath);
    } catch {
      // Create basic package.json for React Native Web
      const basicPackageJson = {
        "name": `prototype-${prototypeId}`,
        "version": "1.0.0",
        "private": true,
        "main": "node_modules/expo/AppEntry.js",
        "scripts": {
          "start": "expo start",
          "web": "expo start --web",
          "build:web": "expo build:web",
          "bundle:web": "npx webpack --mode=production"
        },
        "dependencies": {
          "react": "18.2.0",
          "react-native": "0.72.6",
          "react-native-web": "~0.19.6",
          "react-dom": "18.2.0",
          "expo": "~49.0.15"
        },
        "devDependencies": {
          "webpack": "^5.88.0",
          "webpack-cli": "^5.1.0",
          "@babel/core": "^7.20.0"
        }
      };

      await fs.writeFile(packageJsonPath, JSON.stringify(basicPackageJson, null, 2));
      fastify.log.info(`Created package.json for ${prototypeId}`);
    }
  };

  // Run React Native Web build
  const runBuild = async (prototypeId: string): Promise<{ success: boolean; output: string; error?: string }> => {
    const projectDir = `/apps/${prototypeId}`;
    
    try {
      // Change to project directory and install dependencies
      fastify.log.info(`Installing dependencies for ${prototypeId}`);
      const installResult = await execAsync('bun install', { 
        cwd: projectDir,
        timeout: 300000 // 5 minutes timeout
      });
      
      fastify.log.info(`Dependencies installed for ${prototypeId}: ${installResult.stdout}`);

      // Build the React Native Web project
      fastify.log.info(`Starting build for ${prototypeId}`);
      const buildResult = await execAsync('bun run build:web || npx webpack --mode=production', { 
        cwd: projectDir,
        timeout: 600000 // 10 minutes timeout
      });
      
      fastify.log.info(`Build completed for ${prototypeId}`);

      return {
        success: true,
        output: `Install output: ${installResult.stdout}\n\nBuild output: ${buildResult.stdout}`
      };

    } catch (error: any) {
      fastify.log.error(`Build failed for ${prototypeId}: ${error.message}`);
      return {
        success: false,
        output: error.stdout || '',
        error: error.message || 'Build failed'
      };
    }
  };

  // Build route for worker nodes
  fastify.post<{
    Body: BuildRequest & { buildId?: string };
  }>('/build', {
    schema: {
      body: buildRequestSchema,
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            prototype_id: { type: 'string' },
            buildId: { type: 'string' },
            message: { type: 'string' },
            buildOutput: { type: 'string' }
          }
        }
      }
    }
  }, async (request: FastifyRequest<{ Body: BuildRequest & { buildId?: string } }>, reply: FastifyReply) => {
    const { prototype_id, files, buildId } = request.body;
    const startTime = Date.now();

    try {
      // Validate request
      if (!prototype_id) {
        return reply.status(400).send({
          success: false,
          prototype_id,
          error: 'prototype_id is required'
        });
      }

      if (!files || Object.keys(files).length === 0) {
        return reply.status(400).send({
          success: false,
          prototype_id,
          error: 'files are required and cannot be empty'
        });
      }

      fastify.log.info(`Starting build for prototype ${prototype_id} ${buildId ? `(build ID: ${buildId})` : ''}`);

      // Ensure apps directory exists
      await ensureAppsDirectory();

      // Write project files to filesystem
      await writeProjectFiles(prototype_id, files);

      // Initialize build setup
      await initializeBuildSetup(prototype_id);

      // Run the build process
      const buildResult = await runBuild(prototype_id);

      const duration = Date.now() - startTime;
      fastify.log.info(`Build ${buildResult.success ? 'completed' : 'failed'} for ${prototype_id} in ${duration}ms`);

      const response: BuildResponse = {
        success: buildResult.success,
        prototype_id,
        buildId,
        message: buildResult.success 
          ? `Build completed successfully in ${duration}ms` 
          : 'Build failed',
        buildOutput: buildResult.output,
        error: buildResult.error
      };

      return reply.status(buildResult.success ? 200 : 500).send(response);

    } catch (error: any) {
      const duration = Date.now() - startTime;
      fastify.log.error(`Build error for ${prototype_id}: ${error.message}`);
      
      const response: BuildResponse = {
        success: false,
        prototype_id,
        buildId,
        message: `Build failed after ${duration}ms`,
        error: error.message || 'Unknown build error'
      };

      return reply.status(500).send(response);
    }
  });

  // Build status route
  fastify.get<{
    Params: { prototype_id: string };
  }>('/build/status/:prototype_id', async (request, reply) => {
    const { prototype_id } = request.params;
    const projectDir = `/apps/${prototype_id}`;
    
    try {
      // Check if project directory exists
      await fs.access(projectDir);
      
      // Check if build output exists
      const possibleBuildDirs = ['dist', 'build', 'web-build', '.expo/web'];
      let buildExists = false;
      let buildDir = '';
      
      for (const dir of possibleBuildDirs) {
        try {
          await fs.access(join(projectDir, dir));
          buildExists = true;
          buildDir = dir;
          break;
        } catch {
          // Directory doesn't exist, continue checking
        }
      }
      
      return {
        success: true,
        prototype_id,
        projectExists: true,
        buildExists,
        buildDirectory: buildDir,
        projectPath: projectDir
      };
      
    } catch {
      return {
        success: false,
        prototype_id,
        projectExists: false,
        buildExists: false,
        message: 'Project not found'
      };
    }
  });

  // Clean up project route
  fastify.delete<{
    Params: { prototype_id: string };
  }>('/build/cleanup/:prototype_id', async (request, reply) => {
    const { prototype_id } = request.params;
    const projectDir = `/apps/${prototype_id}`;
    
    try {
      await fs.rm(projectDir, { recursive: true, force: true });
      fastify.log.info(`Cleaned up project ${prototype_id}`);
      
      return {
        success: true,
        prototype_id,
        message: 'Project cleaned up successfully'
      };
      
    } catch (error: any) {
      fastify.log.error(`Failed to cleanup ${prototype_id}: ${error.message}`);
      
      return reply.status(500).send({
        success: false,
        prototype_id,
        error: `Failed to cleanup project: ${error.message}`
      });
    }
  });
}