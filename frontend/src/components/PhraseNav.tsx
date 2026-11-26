import { useState } from "react"
import { Dialog } from "@base-ui/react/dialog"
import { Check, ChevronDown } from "lucide-react"
import type { Phrase } from "@/api/client"
import { cn } from "@/lib/utils"

function List({ phrases, current, onPick }: { phrases: Phrase[]; current: number; onPick: (i: number) => void }) {
  return (
    <ol className="flex flex-col gap-1">
      {phrases.map((p, i) => (
        <li key={p.id}>
          <button
            type="button"
            onClick={() => onPick(i)}
            aria-current={i === current ? "step" : undefined}
            className={cn(
              "flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-[15px] leading-snug transition-colors hover:bg-muted",
              i === current ? "bg-score-soft font-medium text-foreground" : "text-muted-foreground",
            )}
          >
            <span className="flex-1">{p.text.replace(/\.+$/, "")}</span>
            <Check className={cn("size-4 shrink-0 text-score", i === current ? "opacity-100" : "opacity-0")} />
          </button>
        </li>
      ))}
    </ol>
  )
}

/** "All phrases ⌄" above the phrase on phones: opens a sheet listing the topic's phrases. */
export function PhraseCounterSheet({
  phrases,
  current,
  title,
  onPick,
}: {
  phrases: Phrase[]
  current: number
  title: string
  onPick: (i: number) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger className="relative flex h-9 items-center gap-1 rounded-full border pr-2.5 pl-3.5 text-sm tabular-nums transition-colors hover:border-border-strong data-[popup-open]:border-foreground after:absolute after:-inset-y-1 after:inset-x-0 after:content-['']">
        <span className="text-muted-foreground">All phrases</span>
        <ChevronDown className="size-4 text-muted-foreground" />
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/60 transition-opacity data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <Dialog.Popup className="pb-safe fixed inset-x-0 bottom-0 z-50 max-h-[80dvh] overflow-y-auto rounded-t-3xl border-t bg-popover px-3 pt-3 transition-transform duration-300 ease-out data-[ending-style]:translate-y-full data-[starting-style]:translate-y-full">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border-strong" aria-hidden />
          <Dialog.Title className="px-4 pb-2 text-lg font-semibold tracking-tight">{title}</Dialog.Title>
          <div className="pb-4">
            <List
              phrases={phrases}
              current={current}
              onPick={(i) => {
                setOpen(false)
                onPick(i)
              }}
            />
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

/** Desktop: the topic's phrases, always visible under the controls. */
export function PhrasePanel({ phrases, current, onPick }: { phrases: Phrase[]; current: number; onPick: (i: number) => void }) {
  return (
    <div className="mt-4 rounded-2xl border p-1.5">
      <List phrases={phrases} current={current} onPick={onPick} />
    </div>
  )
}
