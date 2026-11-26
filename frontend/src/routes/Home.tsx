import type { ReactNode } from "react"
import { Link } from "react-router"
import { ArrowLeftRight, ArrowRight, AudioLines, LayoutGrid, PenLine, Shuffle } from "lucide-react"
import { Page, TopBar } from "@/components/kit"

export function Home() {
  return (
    <>
      <TopBar level />
      <Page className="pb-16 lg:max-w-4xl lg:pb-24">
        <h1 className="pt-12 text-[40px] leading-[1.02] font-semibold tracking-[-0.045em] md:text-6xl lg:pt-24">
          American accent
          <br />
          practice
        </h1>
        <p className="pt-3 pb-8 text-lg text-muted-foreground lg:pt-4 lg:pb-12 lg:text-xl">Choose how to practise</p>

        <ul className="grid gap-3 lg:grid-cols-3 lg:gap-4">
          <Choice to="/sounds" icon={<AudioLines />} title="American sounds" />
          <Choice to="/pairs" icon={<ArrowLeftRight />} title="Contrasting pairs" />
          <Choice to="/topics" icon={<LayoutGrid />} title="Pick a topic" />
          <Choice to="/practice/random" icon={<Shuffle />} title="Random phrase" />
          <Choice to="/practice/custom" icon={<PenLine />} title="Type your own" />
        </ul>

      </Page>
    </>
  )
}

function Choice({ to, icon, title }: { to: string; icon: ReactNode; title: string }) {
  return (
    <li>
      <Link
        to={to}
        className="group flex h-20 items-center gap-4 rounded-2xl border bg-card px-4 transition-all hover:border-border-strong hover:bg-muted/60 active:scale-[0.99] lg:h-44 lg:flex-col lg:items-start lg:justify-between lg:p-6"
      >
        <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-score text-on-score [&_svg]:size-5">
          {icon}
        </span>
        <span className="flex flex-1 items-center justify-between gap-3 self-stretch lg:flex-none lg:self-auto lg:w-full">
          <span className="text-lg font-semibold tracking-tight">{title}</span>
          <ArrowRight className="size-5 text-score transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
        </span>
      </Link>
    </li>
  )
}
