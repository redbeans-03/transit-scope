import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DATA_PATH } from "@/lib/data";

/**
 * Shown when the pipeline has not been run yet, or its output is unreadable.
 * The dashboard has nothing to display without it, so it explains the fix.
 */
export function NoData({ reason }: { reason?: string }) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-20 sm:px-6">
      <Card>
        <CardHeader>
          <CardTitle>No extraction results yet</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {reason ? (
            <Alert variant="destructive">
              <AlertTitle>Could not load the payload</AlertTitle>
              <AlertDescription>{reason}</AlertDescription>
            </Alert>
          ) : (
            <p className="text-sm leading-relaxed text-muted-foreground">
              This dashboard renders{" "}
              <code className="font-mono text-foreground">{DATA_PATH}</code>,
              which the Python pipeline writes after it pulls Kepler photometry
              from the NASA MAST archive. That file is not there yet.
            </p>
          )}

          <div>
            <p className="mb-2 text-sm font-medium">Generate it:</p>
            <pre className="overflow-x-auto rounded-md border border-border/80 bg-muted/40 p-3 font-mono text-xs leading-relaxed">
              {`cd pipeline
uv sync
uv run kepler8-extract --quarters 12 -v`}
            </pre>
          </div>

          <p className="text-sm leading-relaxed text-muted-foreground">
            The download takes a couple of minutes on a first run. With no
            network access, add{" "}
            <code className="font-mono text-foreground">--offline</code> to
            simulate a Kepler-8 light curve from the published orbit instead —
            every analysis step downstream is identical.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
