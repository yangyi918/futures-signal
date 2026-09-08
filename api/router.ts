import { createRouter, publicQuery } from "./middleware";
import { futuresRouter } from "./futures/router";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  futures: futuresRouter,

  // TODO: add feature routers here, e.g.
  // todo: createRouter({
  //   list: publicQuery.query(() => findTodos()),
  // }),
});

export type AppRouter = typeof appRouter;
