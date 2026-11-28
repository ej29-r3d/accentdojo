import { BookOpen } from "lucide-react"
import type { Topic } from "@/api/types"
import { ResponsiveMenu, chipClass } from "@/components/Sheet"

/** Mouth diagram, how to make the sound, the common mistake. */
function GuideBody({ topic }: { topic: Topic }) {
  const guide = topic.guide!
  return (
    <>
      {guide.diagram && (
        <figure>
          <div className="grid place-items-center rounded-2xl bg-white p-3">
            <img src={guide.diagram.src} alt={`Side view of the mouth saying ${topic.symbol}`} className="h-48 w-auto" />
          </div>
          <figcaption className="mt-1.5 text-xs text-muted-foreground">Diagram: {guide.diagram.credit}</figcaption>
        </figure>
      )}
      <p className="text-[17px] leading-snug">{guide.how}</p>
      <div className="rounded-2xl border p-4">
        <p className="text-sm font-medium">Common mistake</p>
        <p className="mt-1 text-[15px] leading-snug text-muted-foreground">{guide.tip}</p>
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

/** "How to say it" header chip: the same guide, for when the page shows a result instead. */
export function SoundGuideButton({ topic }: { topic: Topic }) {
  if (!topic.guide || !topic.symbol) return null
  return (
    <ResponsiveMenu
      trigger={
        <>
          <BookOpen className="size-4" aria-hidden />
          <span>How to say it</span>
        </>
      }
      triggerClassName={chipClass}
      title={`How to say ${topic.symbol}`}
      width="w-96"
    >
      {() => (
        <div className="space-y-4 px-4 pt-1 pb-2 md:p-4">
          <div className="hidden items-baseline gap-3 md:flex">
            <span className="font-ipa text-3xl leading-none text-score">{topic.symbol}</span>
            <span className="text-sm text-muted-foreground">as in {topic.blurb}</span>
          </div>
          <p className="text-sm text-muted-foreground md:hidden">As in {topic.blurb}</p>
          <GuideBody topic={topic} />
        </div>
      )}
    </ResponsiveMenu>
  )
}
