## TO DEPLOY CODE TO PROD WITHOUT INTERNAL TOOLS:

#### Only use the following command if absolutely necessary. It WILL bypass validation checks.

aws autoscaling start-instance-refresh \
 --region us-east-2 \
 --auto-scaling-group-name materialize-control-plane \
 --preferences '{"MinHealthyPercentage":100,"InstanceWarmup":210,"SkipMatching":false}'
