export function SetupNeeded() {
  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-16">
      <div className="eyebrow mb-3 text-gold">Setup required</div>
      <h1 className="text-[44px] leading-none">BECOMING OS needs its database</h1>
      <p className="mt-4 text-[14px] leading-relaxed text-mute">
        This build has no Supabase connection configured, so there is nowhere to save your records. Set
        <code className="mx-1 rounded bg-raised px-1.5 py-0.5 text-bone">VITE_SUPABASE_URL</code> and
        <code className="mx-1 rounded bg-raised px-1.5 py-0.5 text-bone">VITE_SUPABASE_ANON_KEY</code>
        and rebuild. The full steps are in <span className="text-bone">becoming-os/DEPLOY.md</span>.
      </p>
    </div>
  );
}
