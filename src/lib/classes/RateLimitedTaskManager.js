//Object.prototype.task = function (task) { TaskManager.addTask(this, task) }

export class RateLimitedTaskManager {
	constructor(maxRequests, perMilliseconds) {
		this.maxRequests = maxRequests;
		this.perMilliseconds = perMilliseconds;
		this.requestTimestamps = []; // Store timestamps of the last `maxRequests` requests
		this.queue = []; // Tasks waiting to be executed
	}

	async addTask(taskFunction) {
		const now = Date.now();

		// Remove timestamps older than `perMilliseconds` ago
		this.requestTimestamps = this.requestTimestamps.filter(timestamp => now - timestamp < this.perMilliseconds);

		// If we're at the limit, wait until we can execute another request
		if (this.requestTimestamps.length >= this.maxRequests) {
			const oldestRequest = this.requestTimestamps[0];
			const waitTime = this.perMilliseconds - (now - oldestRequest);
			await new Promise(resolve => setTimeout(resolve, waitTime));
			return this.addTask(taskFunction); // Retry adding the task
		}

		// Add current request's timestamp
		this.requestTimestamps.push(Date.now());

		// If we're not at the limit, execute the request immediately
		try {
			return await taskFunction();
		} catch (error) {
			throw error;
		}
	}
}
