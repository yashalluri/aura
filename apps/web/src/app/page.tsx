import { copy } from "@/lib/copy";
import { ChatPreview } from "@/components/ChatPreview";
import { WaitlistForm } from "@/components/WaitlistForm";

export default function Home() {
  return (
    <main className="min-h-screen">
      {/* ── Hero ── */}
      <section className="px-6 pt-32 pb-20 text-center max-w-3xl mx-auto">
        <p className="text-aura-purple font-medium text-sm tracking-wide mb-6">
          aura
        </p>
        <h1 className="text-4xl md:text-6xl font-bold leading-tight whitespace-pre-line bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent">
          {copy.hero.headline}
        </h1>
        <p className="mt-6 text-lg text-white/50 max-w-xl mx-auto">
          {copy.hero.sub}
        </p>
        <div className="mt-10">
          <WaitlistForm />
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="px-6 py-24 max-w-5xl mx-auto">
        <h2 className="text-2xl md:text-3xl font-bold text-center mb-14 text-white/90">
          {copy.howItWorks.title}
        </h2>
        <div className="grid md:grid-cols-3 gap-6">
          {copy.howItWorks.cards.map((card) => (
            <div
              key={card.title}
              className="bg-aura-card border border-aura-border rounded-2xl p-6 hover:border-aura-purple/30 transition-colors"
            >
              <span className="text-3xl">{card.emoji}</span>
              <h3 className="text-lg font-semibold mt-4 mb-2 text-white">
                {card.title}
              </h3>
              <p className="text-sm text-white/50 leading-relaxed">
                {card.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Chat preview ── */}
      <ChatPreview />

      {/* ── Who it's for ── */}
      <section className="px-6 py-24 text-center max-w-2xl mx-auto">
        <h2 className="text-2xl md:text-3xl font-bold mb-6 text-white/90">
          {copy.whoItsFor.title}
        </h2>
        <p className="text-white/50 text-lg leading-relaxed">
          {copy.whoItsFor.body}
        </p>
      </section>

      {/* ── Waitlist CTA ── */}
      <section className="px-6 py-24 text-center max-w-2xl mx-auto border-t border-aura-border">
        <h2 className="text-2xl md:text-3xl font-bold mb-4 text-white/90">
          {copy.waitlist.title}
        </h2>
        <p className="text-white/50 mb-8">{copy.waitlist.sub}</p>
        <WaitlistForm />
      </section>

      {/* ── Footer ── */}
      <footer className="px-6 py-10 text-center text-white/20 text-sm border-t border-aura-border">
        aura © {new Date().getFullYear()}
      </footer>
    </main>
  );
}
