import { createServer } from "http";
import { parse } from "url";
import { stringify } from "../functions/stringify.js";


export class Server {
	constructor(port) {
		this.routes = {};
		this.server = createServer(async (req, res) => {
			const parsedUrl = parse(req.url, true);
			const path = parsedUrl.pathname;
			const trimmedPath = path.replace(/^\/+|\/+$/g, '');

			const chosenHandler = this.routes[trimmedPath] ? this.routes[trimmedPath] : this.notFound;

			
			const get = parsedUrl.query;
			const post = {};


			try {
				let ret = await chosenHandler(get, req.headers, req.url.toString().split('?')[1]);
				res.writeHead(200, { 'Content-Type': 'application/json' });
				res.end(stringify(ret, true));
			} catch (e) {
				res.writeHead(500, { 'Content-Type': 'application/json' });
				console.error(e);
				res.end(JSON.stringify('Oops'));
			}
		});

		this.server.listen(port, () => {
			console.log(`Server is listening on port ${port}`);
		});
	}

	addRoute(route, handler) {
		this.routes[route] = handler;
	}

	notFound(get, post) {
		return { error: 'Not Found' };
	}
}