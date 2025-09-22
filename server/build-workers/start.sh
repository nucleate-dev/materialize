#!/bin/sh
set -e

# Set default region if not provided
AWS_REGION=${AWS_REGION:-us-east-2}

echo "Starting build worker..."

# Start CloudWatch agent with the static configuration
echo "Starting CloudWatch agent..."
/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
    -a fetch-config \
    -m ec2 \
    -c file:/opt/aws/amazon-cloudwatch-agent/etc/cloudwatch-config.json \
    -s

# Create log file and start tailing it to stdout (for ECS logs)
touch /tmp/build-worker.log

# Start the Node.js application with logs redirected to both file and stdout
echo "Starting build worker application..."
exec node dist/worker.js 2>&1 | tee /tmp/build-worker.log