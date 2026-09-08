import SignInForm from "@/components/sign-in-form";
import { Hexagon } from "lucide-react";
import { createFileRoute } from "@tanstack/react-router";
import { APP_NAME } from "@/lib/constants";

export const Route = createFileRoute("/sign-in")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div className="flex min-h-svh w-full h-full items-center justify-between flex-col p-4">
      <div className="mb-8 flex items-center gap-2.5">
        <div className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Hexagon className="size-4" />
        </div>
        <span className="text-base font-semibold tracking-tight">
          {APP_NAME}
        </span>
      </div>
      <div className="flex w-full items-center justify-center p-6 md:p-10 lg:w-1/2 bg-background">
        <div className="w-full max-w-sm">
          <div className="w-full max-w-sm">
            <SignInForm />
          </div>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        &copy; {new Date().getFullYear()} {APP_NAME}. All rights reserved.
      </p>
    </div>
  );
}
