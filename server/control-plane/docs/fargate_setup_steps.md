# Fargate Setup Guide - Complete Walkthrough

This guide walks through setting up AWS Fargate to run your Fastify build worker containers programmatically.

## Project Context
- **Main project**: TypeScript Fastify server in `build-workers/` directory
- **Main file**: `dist/worker.js` (built from TypeScript)
- **Node version**: 22
- **Port**: 3002
- **Package manager**: npm

## Step 1: Create ECR Repository

1. Go to **Amazon ECR** in AWS Console
2. Click **Private registry** → **Repositories** 
3. Click **Create repository**
4. Repository name: `fastify-build-worker`
5. Leave everything else as default
6. Click **Create repository**

## Step 2: Create Dockerfile

Create this `Dockerfile` in your `build-workers/` directory:

```dockerfile
FROM node:22-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies (including dev dependencies for building)
RUN npm install

# Copy your source code
COPY . .

# Build TypeScript
RUN npm run build

# Expose port
EXPOSE 3002

# Start the built server
CMD ["npm", "start"]
```

## Step 3: Build and Push Docker Image

1. In ECR repository, click **"View push commands"**
2. Run the 4 commands from your `build-workers/` directory:

```bash
# 1. Login to ECR
aws ecr get-login-password --region us-east-2 | docker login --username AWS --password-stdin YOUR_ACCOUNT_ID.dkr.ecr.us-east-2.amazonaws.com

# 2. Build your image
docker build -t fastify-build-worker .

# 3. Tag your image
docker tag fastify-build-worker:latest YOUR_ACCOUNT_ID.dkr.ecr.us-east-2.amazonaws.com/fastify-build-worker:latest

# 4. Push your image
docker push YOUR_ACCOUNT_ID.dkr.ecr.us-east-2.amazonaws.com/fastify-build-worker:latest
```

### Troubleshooting Authentication
- If you get `UnrecognizedClientException`: Run `aws configure` to set up credentials
- If you get `AccessDeniedException`: Add `AmazonEC2ContainerRegistryPowerUser` policy to your IAM user

## Step 4: Create ECS Cluster

1. Go to **Amazon ECS** in AWS Console
2. Click **Clusters** in the left sidebar
3. Click **Create cluster**
4. **Cluster name**: `materialize-fargate-build-workers`
5. **Infrastructure**: Select **AWS Fargate (serverless)**
6. Leave everything else as default
7. Click **Create**

## Step 5: Create Task Definition

1. In ECS, click **Task definitions** in the left sidebar
2. Click **Create new task definition**
3. **Task definition family name**: `fastify-build-worker`
4. **Launch type**: **AWS Fargate**
5. **Operating system/Architecture**: **Linux/X86_64**
6. **CPU**: `1 vCPU`
7. **Memory**: `2 GB`

### Container Configuration
8. **Container details**:
   - **Container name**: `fastify-server`
   - **Image URI**: `YOUR_ACCOUNT_ID.dkr.ecr.us-east-2.amazonaws.com/fastify-build-worker:latest`
   - **Port mappings**: 
     - **Container port**: `3002`
     - **Protocol**: `TCP`
     - **Port name**: `fastify-port`

### Environment Variables
9. **Environment variables** (add each one):
   - `PORT` = `3002`
   - `WORK_DIR` = `/tmp/fargate-builds`
   - `AWS_REGION` = `us-east-2`
   - `S3_BUCKET` = `materialize-sites`

### Task Roles
10. **Task roles**:
    - **Task execution role**: Use default `ecsTaskExecutionRole`
    - **Task role**: `fastify-task-role` (create this next)

11. Click **Create**

## Step 6: Create Task Role for S3 Access

1. Go to **IAM** → **Roles**
2. Click **Create role**
3. **Trusted entity**: **AWS service**
4. **Service**: **Elastic Container Service**
5. **Use case**: **Elastic Container Service Task**
6. Click **Next**
7. **Add permissions** - Select these policies:
   - `AmazonS3FullAccess`
   - `AmazonSSMReadOnlyAccess`
8. Click **Next**
9. **Role details**:
   - **Role name**: `fastify-task-role`
   - **Description**: `Role for Fargate tasks to access S3 and SSM`
10. Click **Create role**

## Step 7: Update Task Definition with Role

1. Go to **ECS** → **Task definitions** 
2. Click on `fastify-build-worker`
3. Click **Create new revision**
4. Scroll down to **Task roles**
5. **Task role**: Select `fastify-task-role`
6. Leave everything else the same
7. Click **Create**

## Step 8: Test Run a Task

1. Go to **ECS** → **Clusters** → `materialize-fargate-build-workers`
2. Click **Tasks** tab
3. Click **Run new task**
4. **Launch type**: `Fargate`
5. **Task definition**: `fastify-build-worker:LATEST`
6. **Platform version**: `LATEST`

### Networking Setup
7. **Networking**:
   - **VPC**: Select your default VPC
   - **Subnets**: Select at least 2 subnets
   - **Security group**: Create new security group

8. **Create Security Group**:
   - **Security group name**: `fargate-build-worker-sg`
   - **Description**: `Security group for Fargate build workers`
   - **Inbound rules**: Add rule
     - **Type**: `Custom TCP`
     - **Port**: `3002`
     - **Source**: `Anywhere-IPv4` (0.0.0.0/0)

9. **Public IP**: `ENABLED`
10. Click **Create** to run the task

## Step 9: Test Your Running Task

1. Wait for task **Last status** to show `RUNNING` (2-3 minutes)
2. Find the **Public IP** in the task details
3. Test health endpoint: `http://YOUR_PUBLIC_IP:3002/health`

You should see your Fastify server's health check response!

## Configuration Summary

- **ECR Repository**: `fastify-build-worker`
- **ECS Cluster**: `materialize-fargate-build-workers`
- **Task Definition**: `fastify-build-worker`
- **Security Group**: `fargate-build-worker-sg`
- **IAM Task Role**: `fastify-task-role`
- **Container Port**: `3002`
- **Public Access**: Enabled for testing

## Next Steps

Now that you have the manual setup working, you can:
1. Create a programmatic dispatcher to manage these Fargate instances
2. Implement auto-scaling based on workload
3. Set up proper CI/CD to automatically update the container image
4. Configure environment-specific variables via AWS Parameter Store