export type LatencyEvent =
  | "npm_install_latency"
  | "expo_build_latency"
  | "s3_upload_latency"
  | "dev_server_start_latency"
  | "file_write_latency"
  | "build_and_deploy_latency"
  | "dev_server_stop_latency";

export const LatencyEvents: Record<LatencyEvent, LatencyEvent> = Object.freeze({
  npm_install_latency: "npm_install_latency",
  expo_build_latency: "expo_build_latency",
  s3_upload_latency: "s3_upload_latency",
  dev_server_start_latency: "dev_server_start_latency",
  file_write_latency: "file_write_latency",
  build_and_deploy_latency: "build_and_deploy_latency",
  dev_server_stop_latency: "dev_server_stop_latency",
});
