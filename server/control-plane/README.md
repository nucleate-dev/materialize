## TO DEPLOY CODE TO PROD:

aws autoscaling start-instance-refresh \
 --region us-east-2 \
 --auto-scaling-group-name materialize-control-plane \
 --preferences '{"MinHealthyPercentage":100,"InstanceWarmup":120,"SkipMatching":false}'

## To see logs, SSH into an active EC2 instance and run:

sudo tail -f /var/log/cloud-init-output.log
sudo journalctl -u control-plane -f

Note: if for some reason you can't ssh in, check the security group and ensure your IP is listed in the inbound rules for SSH traffic

## Debug tips:

1. allows u to see if server is running:

- sudo systemctl status control-plane

2. Manually try running the server to see issues:

- cd /opt/materialize/server/control-plane
- /usr/bin/node dist/server.js
