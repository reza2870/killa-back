import mysql from "mysql";
import { promisify } from "util";

export class DBManager {

	constructor(config, connectionLimit) {
		this.config = config;
		this.conn = null;
		this.pool = [];
		this.queue = [];
		this.totalConnections = 0;
		if (connectionLimit == null) connectionLimit = 4;
		this.connectionLimit = connectionLimit;
	}

	getVals(input) {
		let ret = [];
		for (let k in input) {
			let v = input[k];
			ret.push(`${this.escapeId(k)} = ${this.escape(v)}`);
		}
		return ret.join(', ');
	}

	escape(s, stringify = false) {
		if(stringify) s = JSON.stringify(s);
		return mysql.escape(s);
	}
	escapeList(list) {
		return list.map(item=>this.escape(item)).join(',');
	}

	escapeId(s) {
		return mysql.escapeId(s);
	}

	async query(q) {
		if (Array.isArray(q)) q = q.join(';');
		let conn;
		try {
			conn = await this.getConnection();
			let ret = await conn.query(q);
			this.returnConnection(conn);
			return ret;
		} catch (e) {
			if (conn != null) {
				conn.close();
			}
			console.error(e);
			throw new Error('Query failed');
		}
	}

	async transaction(queries) {
		if (queries.length == 0) return;
		queries.unshift('START TRANSACTION');
		queries.push('COMMIT');
		//console.log(queries.join(';'))
		return await this.query(queries);
	}

	async getConnection() {
		if (this.pool.length > 0) {
			let ret = this.pool.pop();
			ret.clearTimeout();
			return ret;
		} else if (this.totalConnections < this.connectionLimit) {
			const conn = new Connection(this.config);
			this.totalConnections++;
			return conn;
		} else {
			let ret = await new Promise((resolve) => this.queue.push(resolve));
			return ret;
		}
	}

	returnConnection(connection) {
		if (this.queue.length > 0) {
			connection.clearTimeout();
			const resolve = this.queue.shift();
			resolve(connection);
		} else {
			this.pool.push(connection);
		}
	}

}

class Connection {
	constructor(config) {
		this.config = config;
		this.connect(config);
	}

	connect(config) {
		this.mysql = mysql.createConnection({
			host: config.host,
			user: config.user,
			password: config.pass,
			database: config.name,
			port: config.port,
			multipleStatements: true,
			charset: 'utf8mb4'
		});
	}

	async query(q) {
		if (this.mysql == null) this.connect(this.config);
		let query = promisify(this.mysql.query).bind(this.mysql);
		this.timeout = setTimeout(() => this.close(), 5000);
		return await query(q);
	}

	clearTimeout() {
		if (this.timeout != null) clearTimeout(this.timeout);
	}

	close() {
		if (this.mysql != null) this.mysql.end();
		this.mysql = null;
	}
}