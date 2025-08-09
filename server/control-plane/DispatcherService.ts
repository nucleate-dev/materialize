import axios from "axios";
export class DispatcherService {
  // Get least loaded worker instance
  private async getLeastLoadedWorker() {
    try {
      const instances = await this.getActiveWorkerInstances();
      // if (instances.length === 0) {
      //   throw new Error("No active worker instances available");
      // }
      // TODO: add some logic to see which instance is the least loaded
      let leastLoadedInstance = instances[0];
      return leastLoadedInstance;
    } catch (error) {
      throw error;
    }
  }

  // Get active EC2 instances from Auto Scaling Group
  private async getActiveWorkerInstances() {}

  // Acquire a free port for hot reload
  private async acquireFreePort(workerIp) {
    // find a free ports in the Elasticache PortRegistry for the workerIp
    // acquire a lock on elasticache
    // then acquire a port (mark it as taken) in the PortRegistry and ActiveBuildRegistry in Elasticache
    // release the lock
  }

  // Release a port
  private async releasePort(workerIp, port) {
    // clear the port from the Elasticache port registry and mark it as free
    // remove the port from the ActiveBuildRegistry for this project
  }

  // Send request to worker
  private async sendWorkerRequest(workerIp, payload) {
    try {
      const response = await axios.post(
        `http://${workerIp}:3000/build`,
        payload,
        {
          timeout: 30000,
          headers: { "Content-Type": "application/json" },
        }
      );
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  // Process build request
  public async processBuildRequest(prototypeId, files, isHotReload = false) {
    try {
      // Check if build already exists
      // If build already exists, send update to the existing worker
      //   - load the build info from the Elasticache ActiveBuildRegistry
      //   - send the update to the worker (if hot reload vs regular build send to appropriate endpoint)
      //   - update the timestamp in the Elasticache ActiveBuildRegistry
      //   - return the result
      // If build does not exist, create a new build
      //   - get the least loaded worker
      //   - acquire a free port if hot reload
      //   - create a new build info and add to the Elasticache ActiveBuildRegistry
      //   - Optional: increment the worker load in elasticache
      //   - send the build request to the worker (either /build or /hot-reload)
      //   - return the result

      // Create new build
      const worker = await this.getLeastLoadedWorker();
      const workerIp = worker.PrivateIpAddress;
      let port: number | null = null;

      // Send request to worker
      const payload = {
        prototypeId,
        files,
        isHotReload,
        isUpdate: false,
        port,
      };

      const result = await this.sendWorkerRequest(workerIp, payload);
      return result;
    } catch (error) {
      throw error;
    }
  }
}
