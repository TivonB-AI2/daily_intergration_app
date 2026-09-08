import { createTRPCContext } from "@trpc/tanstack-react-query";
import type { TRPCAppRouter } from "./router";

const trpc = createTRPCContext<TRPCAppRouter>();

export { trpc };
