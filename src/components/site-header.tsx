import { Badge } from "@/components/ui/badge";
import type { DataSource } from "@/lib/types";

const NAV = [
  { href: "#results", label: "Results" },
  { href: "#lightcurve", label: "Light curve" },
  { href: "#radius", label: "Radius" },
  { href: "#limb", label: "Limb darkening" },
  { href: "#snr", label: "SNR" },
  { href: "#hardware", label: "Hardware" },
  { href: "#methods", label: "Methods" },
];

export function SiteHeader({ dataSource }: { dataSource?: DataSource }) {
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="relative flex size-7 shrink-0 items-center justify-center"
          >
            <span className="absolute size-7 rounded-full bg-primary/25" />
            <span className="absolute size-2.5 rounded-full bg-primary" />
            <span className="absolute size-7 rounded-full border border-primary/50" />
          </span>
          <div className="leading-tight">
            <p className="text-sm font-semibold">Kepler-8b Transit Photometry</p>
            <p className="font-mono text-[0.7rem] text-muted-foreground">
              KIC 6922244 · KOI-10.01
            </p>
          </div>
          {dataSource && (
            <Badge
              variant={dataSource === "mast" ? "default" : "secondary"}
              className="ml-1 hidden font-mono text-[0.65rem] sm:inline-flex"
            >
              {dataSource === "mast" ? "MAST archive" : "Simulated"}
            </Badge>
          )}
        </div>
        <nav aria-label="Sections">
          <ul className="-mx-1 flex items-center gap-1 overflow-x-auto text-sm">
            {NAV.map((item) => (
              <li key={item.href}>
                <a
                  href={item.href}
                  className="inline-block whitespace-nowrap rounded-md px-2.5 py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}
