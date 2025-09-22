# CloudWatch Agent IAM Policies for Build Workers

## Required IAM Policies for Fargate Task Role

Your Fargate task role needs the following IAM policies to allow the CloudWatch agent to function properly:

### 1. CloudWatch Agent Policy

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "cloudwatch:PutMetricData",
                "ec2:DescribeVolumes",
                "ec2:DescribeTags",
                "logs:PutLogEvents",
                "logs:CreateLogGroup",
                "logs:CreateLogStream",
                "logs:DescribeLogStreams",
                "logs:DescribeLogGroups",
                "logs:PutRetentionPolicy"
            ],
            "Resource": "*"
        }
    ]
}
```

### 2. Specific Log Group Access (Recommended for security)

If you want to restrict access to only the specific log group, use this instead of the wildcard:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "logs:CreateLogGroup",
                "logs:DescribeLogGroups"
            ],
            "Resource": "arn:aws:logs:*:*:log-group:/ec2/materialize/control-plane"
        },
        {
            "Effect": "Allow",
            "Action": [
                "logs:CreateLogStream",
                "logs:PutLogEvents",
                "logs:DescribeLogStreams"
            ],
            "Resource": "arn:aws:logs:*:*:log-group:/ec2/materialize/control-plane:*"
        },
        {
            "Effect": "Allow",
            "Action": [
                "cloudwatch:PutMetricData"
            ],
            "Resource": "*",
            "Condition": {
                "StringEquals": {
                    "cloudwatch:namespace": "Materialize/BuildWorker"
                }
            }
        }
    ]
}
```

## Attaching Policies to Your Fargate Task

### Option 1: Attach AWS Managed Policy (Broader Access)
You can use the AWS managed policy `CloudWatchAgentServerPolicy` which includes all necessary permissions:

```bash
aws iam attach-role-policy \
    --role-name your-fargate-task-role \
    --policy-arn arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy
```

### Option 2: Create Custom Policy (Recommended)
1. Create a custom policy with the JSON above
2. Attach it to your Fargate task role:

```bash
# Create the policy
aws iam create-policy \
    --policy-name MaterializeBuildWorkerCloudWatch \
    --policy-document file://cloudwatch-policy.json

# Attach to your task role
aws iam attach-role-policy \
    --role-name your-fargate-task-role \
    --policy-arn arn:aws:iam::YOUR-ACCOUNT-ID:policy/MaterializeBuildWorkerCloudWatch
```

## Environment Variables

Make sure your Fargate task definition includes these environment variables:

```json
{
    "environment": [
        {
            "name": "AWS_REGION",
            "value": "us-east-2"
        },
        {
            "name": "AWS_DEFAULT_REGION",
            "value": "us-east-2"
        }
    ]
}
```

## Verification

After deploying, you can verify the CloudWatch agent is working by:

1. **Check CloudWatch Logs**: Look for the `/ec2/materialize/control-plane` log group
2. **Check CloudWatch Metrics**: Look for the `Materialize/BuildWorker` namespace
3. **Check Container Logs**: The startup script will output CloudWatch agent status

## Troubleshooting

Common issues and solutions:

- **Permission Denied**: Ensure the task role has the required policies
- **Log Group Not Created**: The agent will create it automatically if it has permissions
- **No Metrics**: Check that the `cloudwatch:PutMetricData` permission is granted
- **Agent Not Starting**: Check container logs for CloudWatch agent startup messages

## Log Stream Names

Log streams will be automatically named by CloudWatch with unique identifiers. Since Fargate tasks are short-lived, the automatic naming is sufficient for tracking and debugging.