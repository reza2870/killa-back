import { Bridget } from "./src/processes/bridget/bridget.js";
import { config } from "./src/processes/globals.js";

new Bridget(config.sol.port ?? 42069);