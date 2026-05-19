import { copy } from "@/lib/copy";

export function ChatPreview() {
  return (
    <section className="px-6 py-24 max-w-2xl mx-auto">
      <h2 className="text-2xl md:text-3xl font-bold text-center mb-12 text-white/90">
        {copy.chatPreview.title}
      </h2>
      <div className="bg-aura-card rounded-3xl p-6 border border-aura-border space-y-3">
        {/* Fake status bar */}
        <div className="flex items-center gap-3 pb-4 border-b border-aura-border">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-aura-purple to-aura-pink" />
          <div>
            <p className="text-sm font-semibold text-white">aura 💜</p>
            <p className="text-xs text-white/40">text message</p>
          </div>
        </div>
        {/* Messages */}
        <div className="space-y-2 pt-2">
          {copy.chatPreview.messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.from === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                  msg.from === "user"
                    ? "bg-aura-purple text-white rounded-br-md"
                    : "bg-white/10 text-white/90 rounded-bl-md"
                }`}
              >
                {msg.text}
              </div>
            </div>
          ))}
        </div>
        {/* Fake input bar */}
        <div className="flex items-center gap-2 pt-3 border-t border-aura-border">
          <div className="flex-1 bg-white/5 rounded-full px-4 py-2 text-sm text-white/30">
            iMessage
          </div>
        </div>
      </div>
    </section>
  );
}
