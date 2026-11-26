import { Link } from "react-router"
import {
  Briefcase,
  CalendarDays,
  ChevronRight,
  CircleHelp,
  Hand,
  HandHelping,
  HeartPulse,
  House,
  Mail,
  MessageCircle,
  Phone,
  Plane,
  Presentation,
  Scale,
  ShoppingBag,
  Smile,
  Users,
  Utensils,
  Wrench,
  type LucideIcon,
} from "lucide-react"
import { api, type Topic, type TopicGroup } from "@/api/client"
import { Page, TopBar } from "@/components/kit"
import { useLoad } from "@/hooks/useLoad"

function Skeleton({ rows }: { rows: number }) {
  return (
    <div className="divide-y rounded-2xl border">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex h-[76px] items-center px-5">
          <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  )
}

/** Where each group lives, and what its list is called. */
// eslint-disable-next-line react-refresh/only-export-components
export const GROUP: Record<TopicGroup, { path: string; title: string }> = {
  situations: { path: "/topics", title: "Pick a topic" },
  pairs: { path: "/pairs", title: "Contrasting pairs" },
  sounds: { path: "/sounds", title: "American sounds" },
}

/** A picture per situation. Pairs have none (pictures of the example words were misleading); sounds show their IPA symbol. */
const ICONS: Record<string, LucideIcon> = {
  greetings: Hand,
  "small-talk": MessageCircle,
  home: House,
  food: Utensils,
  shopping: ShoppingBag,
  travel: Plane,
  health: HeartPulse,
  calls: Phone,
  plans: CalendarDays,
  feelings: Smile,
  requests: HandHelping,
  clarifying: CircleHelp,
  opinions: Scale,
  meetings: Users,
  presentations: Presentation,
  work: Briefcase,
  "follow-ups": Mail,
  problems: Wrench,
}

function TopicList({ topics }: { topics: Topic[] }) {
  return (
    <ul className="divide-y overflow-hidden rounded-2xl border md:grid md:grid-cols-2 md:gap-3 md:divide-y-0 md:overflow-visible md:rounded-none md:border-0 lg:grid-cols-3">
      {topics.map((t) => (
        <li key={t.id}>
          <Link
            to={`/practice/topic/${t.id}/0`}
            className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-muted/60 md:h-full md:rounded-2xl md:border md:py-6 md:hover:border-border-strong"
          >
            <TopicIcon topic={t} />
            <span className="min-w-0 flex-1">
              <span className="block text-[17px] font-medium tracking-tight">{t.name}</span>
              <span className="mt-0.5 block text-sm text-muted-foreground">{t.blurb}</span>
            </span>
            <ChevronRight className="size-4 shrink-0 text-score" />
          </Link>
        </li>
      ))}
    </ul>
  )
}

function TopicIcon({ topic }: { topic: Topic }) {
  const Icon = ICONS[topic.id]
  if (!Icon && !topic.symbol) return null
  return (
    <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-xl bg-score-soft text-score">
      {Icon ? <Icon className="size-5" /> : <span className="font-ipa text-xl leading-none">{topic.symbol}</span>}
    </span>
  )
}

export function Topics({ group }: { group: TopicGroup }) {
  const { data: topics } = useLoad(() => api.listTopics(), [])
  return (
    <>
      <TopBar back="/" level />
      <Page className="pb-16">
        <div className="pt-8 pb-6 lg:flex lg:items-end lg:justify-between lg:gap-12 lg:pt-14">
          <h1 className="text-4xl font-semibold tracking-[-0.04em] md:text-5xl">{GROUP[group].title}</h1>
        </div>
        <div className="mt-8">
          {!topics ? <Skeleton rows={6} /> : <TopicList topics={topics.filter((t) => t.group === group)} />}
        </div>
      </Page>
    </>
  )
}
