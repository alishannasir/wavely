export default function RegionBlocked() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 max-w-md mx-auto text-center">
      <h1 className="text-3xl font-bold">Not available in your region</h1>
      <p className="text-zinc-400">
        This service is currently only available in selected countries. We hope to expand soon.
      </p>
    </main>
  );
}
