import type { Topic } from "@/api/types"

/** How to make the sound, and the common mistake. */
function GuideBody({ topic }: { topic: Topic }) {
  const guide = topic.guide!
  return (
    <>
      <p className="text-[17px] leading-snug">{guide.how}</p>
      <div>
        <p className="text-sm text-muted-foreground">Common mistake</p>
        <p className="mt-1 text-[17px] leading-snug">{guide.tip}</p>
      </div>
    </>
  )
}

/** The guide shown on the sound's practice page itself, below the phrase. */
export function SoundGuideCard({ topic }: { topic: Topic }) {
  if (!topic.guide || !topic.symbol) return null
  return (
    <section className="space-y-4 rounded-3xl border p-5" aria-label={`How to say ${topic.symbol}`}>
      <div className="flex items-baseline gap-3">
        <span className="font-ipa text-3xl leading-none text-score">{topic.symbol}</span>
        <span className="text-sm text-muted-foreground">as in {topic.blurb}</span>
      </div>
      <GuideBody topic={topic} />
    </section>
  )
}
