/** Hono context typing for the edge Worker. */
import type { Env } from "./env";
import type { TokenPayload } from "./jwt";

export interface AppContext {
  Bindings: Env;
  Variables: {
    auth?: TokenPayload;
  };
}
