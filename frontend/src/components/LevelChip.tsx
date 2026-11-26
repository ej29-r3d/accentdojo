import { Check, ChevronDown } from "lucide-react"
import { LEVELS, LEVEL_LABEL } from "@/api/client"
import { ResponsiveMenu, chipClass } from "@/components/Sheet"
import { usePrefs } from "@/state/prefs"
import { cn } from "@/lib/utils"

/** Compact level control: a chip that opens a bottom sheet on phones and a menu on desktop. */
export function LevelChip() {
  const { level, setLevel } = usePrefs()
  return (
    <ResponsiveMenu
      title="Level"
      triggerClassName={chipClass}
      trigger={
        <>
          <span className="hidden text-muted-foreground min-[400px]:inline">Level</span>
          <span className="font-medium text-score">{LEVEL_LABEL[level]}</span>
          <ChevronDown className="size-4 text-muted-foreground" />
        </>
      }
    >
      {(close) => (
        <div role="radiogroup" aria-label="Level" className="flex flex-col gap-1">
          {LEVELS.map((l) => {
            const on = l === level
            return (
              <button
                key={l}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => {
                  setLevel(l)
                  close()
                }}
                className={cn(
                  "flex items-center gap-4 rounded-xl px-4 py-3.5 text-left transition-colors hover:bg-muted",
                  on && "bg-score-soft",
                )}
              >
                <span className="min-w-0 flex-1 text-[17px] font-semibold tracking-tight">{LEVEL_LABEL[l]}</span>
                <Check className={cn("size-5 shrink-0 text-score", on ? "opacity-100" : "opacity-0")} />
              </button>
            )
          })}
        </div>
      )}
    </ResponsiveMenu>
  )
}
