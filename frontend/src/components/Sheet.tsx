import { useEffect, useState, type ReactNode } from "react"
import { Dialog } from "@base-ui/react/dialog"
import { Popover } from "@base-ui/react/popover"

// eslint-disable-next-line react-refresh/only-export-components
export function useIsDesktop() {
  const q = "(min-width: 768px) and (pointer: fine)"
  const [on, setOn] = useState(() => window.matchMedia(q).matches)
  useEffect(() => {
    const m = window.matchMedia(q)
    const f = () => setOn(m.matches)
    m.addEventListener("change", f)
    return () => m.removeEventListener("change", f)
  }, [])
  return on
}

/** A trigger that opens a bottom sheet on phones and an anchored menu on desktop. */
export function ResponsiveMenu({
  trigger,
  triggerClassName,
  triggerLabel,
  title,
  width = "w-80",
  children,
}: {
  trigger: ReactNode
  triggerClassName: string
  triggerLabel?: string
  title: string
  width?: string
  children: (close: () => void) => ReactNode
}) {
  const desktop = useIsDesktop()
  const [open, setOpen] = useState(false)
  const close = () => setOpen(false)

  if (desktop)
    return (
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger className={triggerClassName} aria-label={triggerLabel}>
          {trigger}
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Positioner side="bottom" align="end" sideOffset={8} className="z-50">
            <Popover.Popup
              className={`${width} origin-[var(--transform-origin)] rounded-2xl border bg-popover p-1.5 shadow-2xl shadow-black/20 transition-[opacity,scale] data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0`}
            >
              <Popover.Title className="sr-only">{title}</Popover.Title>
              {children(close)}
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    )

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger className={triggerClassName} aria-label={triggerLabel}>
        {trigger}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/60 transition-opacity data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <Dialog.Popup className="pb-safe fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] overflow-y-auto rounded-t-3xl border-t bg-popover px-3 pt-3 transition-transform duration-300 ease-out data-[ending-style]:translate-y-full data-[starting-style]:translate-y-full">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border-strong" aria-hidden />
          <Dialog.Title className="px-4 pb-2 text-lg font-semibold tracking-tight">{title}</Dialog.Title>
          <div className="pb-4">{children(close)}</div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export const chipClass =
  "relative flex h-9 items-center gap-1.5 rounded-full border pr-2.5 pl-3.5 text-sm transition-colors hover:border-border-strong data-[popup-open]:border-foreground " +
  "after:absolute after:-inset-y-1 after:inset-x-0 after:content-['']"
