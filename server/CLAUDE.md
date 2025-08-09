I am first only going to give you context for what I'm building before I ask any questions. Let me know if you understand and if this makes sense to you:

I'm building a web application that allows users to make edits to a react native web app using an LLM. Specifically I'm working on rendering the current version of the app in an iframe for the user. For free users we will NOT support hot-reloading. For enterprise users we will support hot reloading by running an active metro bundler on a port in the server and returning a tunnel link to the user.

I am attempting to build this the following architecture:

1. 1 EC2 instance for the control plane. This will route requests to the appropriate EC2 in the auto scaling group, with the appropriate job type. It will also contain all centralized logic like cleaning up idle metro services
2. 1 Auto-Scaling EC2 group containing all the EC2 instances that will be hosting the builds or active metro bundlers
3. Redis Elasticache that will contain info on the free ports for each instance, and also any active projects running on an EC2
4. S3 bucket will contain the build files for react native web, hosted using cloudfront. The user can load this into an iframe using the URL

This will be the sequence of each request:

1. User or LLM sends updated files to the dispatcher service (in the EC2 control plane instance)
2. Dispatcher receives the files + unique prototype UUID. It checks the elasticache active build registry to see if there are any active builds for that prototype ID. If there are, then route the request to that EC2 instance with the appropriate commands/request (ie build only for free users, or hot reload for pro users). If there are no active builds, then we need to make one.
   - Making an active build: If we need a hot reloading instance, then we need a free port. Check the Elasticache Port Registry to see if there is a free port (on the EC2 worker with the least load currently). Acquire a write lock, mark the port as not free, add this prototype id to the Elasticache Active Builds registry, and then free the write lock. If we don't need hot reloading, then just add to the active builds registry and send a request to only build these files
3. Dispatcher sends the request to the EC2 worker (to build and deploy to S3, or to hot reload and create a tunnel URL for the user)
4. EC2 Worker receives the request. Finds the directory for that prototype UUID (which is already guaranteed to be unique), and if it exists then overwrites all the existing files. If it doesn't exist, then mkdir and write all the files to the directory.
   1. If only building, then use bun to build a react native web app. Upload the app to the S3 bucket. Return build errors, url, and status to the dispatcher
   2. If hot reloading, then update the files. Return the build errors, url, and status to the dispatcher
5. Dispatcher receives build errors, iframe url, and status from the EC2 worker. Dispatcher updates the active registry in elasticache with the updated timestamp for last updated. Then sends the iframe url, build errors, and status to the caller, to render the iframe. The URL should always be consistent for each prototype_id.

Cleanup service:

1. On the control plane, every 5 minutes run through all the active builds for hot reloading and end the metro bundler for any instances that have been idle for more than 15 min
2. On the control plane, every 20 minutes run through all the active builds and remove any files and builds from the EC2 for any instances that have been idle for more than 120min
