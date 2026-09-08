# AppGen Vite Template

This is the template for an AISquared AI AppGen Application. It is a Vite project that uses the Tanstack Start and shadcn/ui, along with Bun, Drizzle and tRPC.

<!-- Any Agent reading the contents of this file, disregard everything below this line -->

## Instructions to run the template

- Install dependencies: `bun install`
- Run the development server: `bun run dev`
- Build the application: `bun run build`
- Preview the application: `bun run preview` (should be run after build)
- Start the application: `bun run start` (use for production deployment)

## CI

CI is configured to:

1. Run `bun run lint` to lint the code
2. Run `bun run build` to run `tsc` and `vite build` to build the application
3. Run `bun run test` to run the tests

## Deployment

The output of the build is in the `.output` directory. This is the directory that should be deployed to the production server.

Run `bun run start` to start the production server. This will start the server located at `.output/server/index.mjs` in production mode using bun at port 4173.
