import { Settings as Gear } from "lucide-react"
import { ResponsiveMenu } from "@/components/Sheet"
import { usePrefs, type Theme } from "@/state/prefs"
import { cn } from "@/lib/utils"

/** Where this build's source lives (AGPL §13); forks set VITE_SOURCE_URL. */
const SOURCE_URL = (import.meta.env.VITE_SOURCE_URL || "https://github.com/ej29-r3d/accentdojo").replace(/\/+$/, "")
const link = "text-foreground underline decoration-border-strong underline-offset-4 hover:decoration-foreground"

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: [T, string][]
  onChange: (v: T) => void
}) {
  return (
    <div className="px-3 py-3">
      <div className="pb-2.5 text-sm font-medium">{label}</div>
      <div role="radiogroup" aria-label={label} className="grid h-11 grid-cols-3 rounded-full border bg-muted/40 p-1">
        {options.map(([v, text]) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={v === value}
            onClick={() => onChange(v)}
            className={cn(
              "rounded-full text-sm font-medium transition-colors",
              v === value ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  )
}

export function SettingsButton() {
  const { theme, setTheme } = usePrefs()
  return (
    <ResponsiveMenu
      title="Settings"
      width="w-[340px]"
      triggerLabel="Settings"
      triggerClassName="relative grid size-9 place-items-center rounded-full border text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground data-[popup-open]:border-foreground data-[popup-open]:text-foreground after:absolute after:-inset-1 after:content-['']"
      trigger={<Gear className="size-[18px]" />}
    >
      {() => (
        <div className="divide-y">
          <Segmented<Theme>
            label="Theme"
            value={theme}
            onChange={setTheme}
            options={[
              ["dark", "Dark"],
              ["light", "Light"],
              ["system", "System"],
            ]}
          />
          <div className="space-y-1.5 px-4 py-4 text-sm leading-snug text-muted-foreground">
            <p>The server may keep recordings to tune scoring.</p>
            <p>
              Accent Dojo is open source (AGPL-3.0).{" "}
              <a href={SOURCE_URL} target="_blank" rel="noreferrer" className={link}>
                Source code
              </a>
              {" · "}
              <a href={`${SOURCE_URL}/blob/main/THIRD_PARTY_LICENSES.md`} target="_blank" rel="noreferrer" className={link}>
                Open-source licences
              </a>
            </p>
          </div>
        </div>
      )}
    </ResponsiveMenu>
  )
}
