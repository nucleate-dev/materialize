TO DEPLOY CODE TO PROD:
aws autoscaling start-instance-refresh \
 --region us-east-2 \
 --auto-scaling-group-name materialize-control-plane \
 --preferences '{"MinHealthyPercentage":100,"InstanceWarmup":300,"SkipMatching":false}'

To see logs, SSH into an active EC2 instance and run:
sudo tail -f /var/log/user-data.log
