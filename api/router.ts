import { createRouter, publicQuery } from "./middleware";
import { futuresRouter } from "./futures/router";
import { paperRouter } from "./futures/paperRouter";
import { authRouter } from "./auth-router";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  auth: authRouter,
  futures: futuresRouter,
  paper: paperRouter,

  // TODO: add feature routers here, e.g.
  // todo: createRouter({
  //   list: publicQuery.query(() => findTodos()),
  // }),
});

export type AppRouter = typeof appRouter;
