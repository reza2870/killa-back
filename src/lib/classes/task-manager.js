export class TaskManager {

	static ownedManagers = new Map();

	static get(owner) {
		let manager = this.ownedManagers.get(owner);
		if (manager == null) {
			manager = new TaskManager(1);
			this.ownedManagers.set(owner, manager);
		}
		return manager;
	}
	static addTask(owner, taskFunction) { return TaskManager.get(owner).addTask(taskFunction); }
	static await(owner) { return TaskManager.get(owner).wait() };


	constructor(max) {
		this.max = max;
		this.tasks = 0;
		this.queue = [];
		this.all = [];
	}

	addTask(taskFunction) {
		let resolve, reject;
		let promise = new Promise((res, rej) => { resolve = res; reject = rej; });

		this.all.push(promise);

		const task = async () => {
			try {
				let ret = await taskFunction();
				resolve(ret);
			} catch (error) {
				reject(error);
			} finally {
				this.tasks--;
				this.processNextTask();
				this.all.splice(this.all.indexOf(promise));
			}
		};
		if (this.tasks < this.max) {
			this.tasks++;
			task();
		} else {
			this.queue.push(task);
		}

		return promise;
	}

	processNextTask() {
		if (this.queue.length > 0 && this.tasks < this.max) {
			const nextTask = this.queue.shift();
			this.tasks++;
			nextTask();
		}
	}

	async wait() {
		let currentTasks = [...this.all];
		await Promise.all(currentTasks);
	}
}


