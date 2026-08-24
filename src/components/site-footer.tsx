const LINKS = [
  {
    label: "MAST archive",
    href: "https://archive.stsci.edu/kepler/",
  },
  {
    label: "lightkurve",
    href: "https://lightkurve.github.io/lightkurve/",
  },
  {
    label: "Jenkins et al. 2010",
    href: "https://ui.adsabs.harvard.edu/abs/2010ApJ...724.1108J/abstract",
  },
  {
    label: "Mandel & Agol 2002",
    href: "https://ui.adsabs.harvard.edu/abs/2002ApJ...580L.171M/abstract",
  },
];

export function SiteFooter() {
  return (
    <footer className="mt-8 border-t border-border/70 py-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p className="max-w-xl leading-relaxed">
          Built on public data from NASA&apos;s Kepler mission, retrieved through
          the Mikulski Archive for Space Telescopes. Transit model after Mandel
          &amp; Agol (2002), evaluated by direct numerical integration of the
          quadratic limb darkening law.
        </p>
        <ul className="flex flex-wrap gap-x-5 gap-y-2">
          {LINKS.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                target="_blank"
                rel="noreferrer"
                className="underline decoration-dotted underline-offset-4 transition-colors hover:text-foreground"
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </footer>
  );
}
