export type LatencyEvent =
  | 'launch_fargate_instance_latency'
  | 'dispatch_request_to_fargate_server_latency';

export const LatencyEvents: Record<LatencyEvent, LatencyEvent> = Object.freeze({
  launch_fargate_instance_latency: 'launch_fargate_instance_latency',
  dispatch_request_to_fargate_server_latency:
    'dispatch_request_to_fargate_server_latency',
});
