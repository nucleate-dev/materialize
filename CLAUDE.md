This repository contains code for an application that allows users to create prototypes/applications using AI.

This is a monorepository. The directories are as follows:

- web-application: contains the website code for nucleate.dev, which our user's interact with. This is where they can chat with AI and see their applications run in realtime.
  - key files: InternalPrototypePage.tsx is the primary page to edit a prototype/project. On the left side we have a chat panel which makes a websocket connection to the sandbox to send/receive messages from the LLM. On the right side we have the render section where we have an iframe to render the application via a tunnel URL.
- server/control-plane: This is our primary server/backend. It runs on an EC2 instance in an AutoScaling group in AWS. It is responsible for all orchestration logic (managing sandboxes by creating them and cleaning them when they are idle) along with all other server calls (creating prototypes, deleting prototypes, stripe, etc)
  - key files:
    - DispatcherService + IdleContainerAllocationSystemService + IdleCloudflareTunnelSystem: responsible for creating/allocating new sandboxes (AWS Fargate Tasks) and creating tunnels to access them outsite the VPC
    - CleanupService: responsible for cleaning up idle sandboxes and tunnels, and screenshotting builds
    - OrchestrationService: responsible for updating state of sandbox when user initiates actions directly on the sandbox
- server/build-workers: This contains the fastify server that runs in the sandboxes (AWS Fargate tasks). Each Fargate task is configured to have a root user and a materialize-user with restricted permissions to the tmp/materialize-dev-server directory. The fastify server runs as root, but we run the development server as the restricted user (to protect our own code and our own environment variables)
  - key files:
    - NucleateDevelopmentServerService: responsible for starting/stopping development servers and managing state. The type of development server depends on the adapter being used
    - ChatService: responsible for handling chat messages and sending them to the LLM
    - FileSyncService: keeps files in sync with supabase which is the source of truth
    - Dockerfile: responsible for building the image that runs in the Fargate task
- internal-tools: This contains the internal tools that we use for project development. All server requests go through the server/control-plane in a special internal-services directory, which requires additional authentication to ensure the requests come from a trusted internal source
- starters: This directory contains the various starter apps that user's can select from when creating a new project. These are generally expo react native apps or nextjs apps
- async-backfills: This directory contains the various async backfill scripts that we use to populate our database with initial data or fix existing data
- web-application-app: contains the code for apps.nucleate.dev, which acts as a host for user apps on the web.
