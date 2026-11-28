import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { useNavigate, useParams, useSearchParams } from "react-router"
import { ArrowRight, CircleAlert, MicOff, PenLine, Play, Square, Turtle } from "lucide-react"
import {
  api,
  BAND_LABEL,
  type Band,
  type Phrase,
  type ReferenceAudio,
  type ScoreResult,
  type WordIssue,
  type WordTime,
} from "@/api/client"
import { Eyebrow, Ipa, Kbd, Spinner, TopBar } from "@/components/kit"
import { SLOW_RATE, useAudio, type Segment } from "@/hooks/useAudio"
import { useLoad } from "@/hooks/useLoad"
import { useRecorder, type Take } from "@/hooks/useRecorder"
import { usePrefs } from "@/state/prefs"
import { cn } from "@/lib/utils"
import { GROUP } from "@/routes/Topics"

// ─── Mode wrappers: each one finds a phrase and says what "next" means ─────────

export function PracticeTopic() {
  const { topicId = "", index = "0" } = useParams()
  const i = Number(index) || 0
  const { level } = usePrefs()
  const navigate = useNavigate()
  const { data: topic, error: noTopic } = useLoad(() => api.getTopic(topicId), [topicId])
  const { data: phrases, error: noPhrases } = useLoad(() => api.listPhrases(topicId, level), [topicId, level])

  // An unknown topic (a stale link) or a failed load: back to the start instead of a blank screen.
  const failed = Boolean(noTopic || noPhrases)
  useEffect(() => {
    if (failed) navigate("/", { replace: true })
  }, [failed, navigate])

  // Changing level swaps the phrase set; restart at the first phrase.
  const seenLevel = useRef(level)
  useEffect(() => {
    if (level !== seenLevel.current) {
      seenLevel.current = level
      navigate(`/practice/topic/${topicId}/0`, { replace: true })
    }
  }, [level, topicId, navigate])

  const current = phrases ? Math.min(i, phrases.length - 1) : 0
  const phrase = phrases?.[current]
  const last = phrases ? current >= phrases.length - 1 : false
  const go = (n: number) => navigate(`/practice/topic/${topicId}/${n}`, { replace: true })
  const list = GROUP[topic?.group ?? "situations"].path
  return (
    <PracticeShell
      back={list}
      title={topic?.name}
      phrase={phrase}
      nextLabel={last ? "Finish topic" : "Next phrase"}
      onNext={() => (last ? navigate(list) : go(current + 1))}
    />
  )
}

export function PracticeRandom() {
  const { level } = usePrefs()
  const [phrase, setPhrase] = useState<Phrase>()
  const [failed, setFailed] = useState(false)
  const load = useCallback(
    (exclude?: string) =>
      api.randomPhrase(level, exclude).then(
        (p) => {
          setPhrase(p)
          setFailed(false)
        },
        () => setFailed(true),
      ),
    [level],
  )
  useEffect(() => {
    void load()
  }, [load])
  return (
    <PracticeShell
      back="/"
      title="Random"
      phrase={failed ? undefined : phrase}
      onRetry={failed ? () => void load(phrase?.id) : undefined}
      nextLabel="Next phrase"
      onNext={() => {
        void load(phrase?.id)
      }}
    />
  )
}

export function PracticeCustom() {
  const [params, setParams] = useSearchParams()
  const q = params.get("q") ?? ""
  const editing = !q || params.has("edit")
  const { data: phrase } = useLoad(() => (q ? api.preparePhrase(q) : Promise.resolve(undefined)), [q])
  const [autoRecord, setAutoRecord] = useState(false)

  if (editing)
    return (
      <Compose
        initial={q}
        onDone={(text, record) => {
          setAutoRecord(record)
          setParams({ q: text }, { replace: true })
        }}
      />
    )
  return (
    <PracticeShell
      back="/"
      title="Your phrase"
      phrase={phrase}
      autoRecord={autoRecord}
      onEdit={() => setParams({ q, edit: "1" }, { replace: true })}
      nextLabel="New phrase"
      onNext={() => setParams({}, { replace: true })}
    />
  )
}

/** Same cap as the backend (/phrases/prepare): the scorer is tuned on short sentences. */
const MAX_WORDS = 15

/** Typing happens on the practice screen itself, where the phrase will sit. */
function Compose({ initial, onDone }: { initial: string; onDone: (text: string, record: boolean) => void }) {
  const [text, setText] = useState(initial)
  const words = text.split(/\s+/).filter((t) => /[a-z0-9]/i.test(t)).length
  const tooLong = words > MAX_WORDS
  const ready = words > 0 && !tooLong
  const done = (record = false) => ready && onDone(text.trim().replace(/\s+/g, " "), record)

  const dock = (
    <div className={cn("mx-auto grid max-w-sm grid-cols-3 items-start transition-opacity", !ready && "opacity-40")}>
      <Control label="Listen" kbd="R">
        <SideButton name="reference voice" active={false} focus={ready} progress={0} disabled={!ready} onClick={() => done()} />
      </Control>
      <Control label="Record" kbd="Space" strong>
        <button
          type="button"
          onClick={() => done(true)}
          disabled={!ready}
          aria-label="Start recording"
          className="relative -mt-2 grid size-[88px] place-items-center rounded-full bg-foreground text-background transition-all duration-150 active:scale-95"
        >
          <span aria-hidden className="size-6 rounded-full bg-record-dot" />
        </button>
      </Control>
      <Control label="My take" kbd="Y">
        <SideButton name="your take" active={false} progress={0} disabled onClick={() => {}} />
      </Control>
    </div>
  )

  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar back="/" title="Your phrase" />
      <div className="mx-auto w-full max-w-2xl flex-1 px-5 md:px-8 lg:grid lg:max-w-6xl lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-16">
        <div className="pb-[19rem] lg:pb-20">
          <form
            className="pt-10 md:pt-14 lg:pt-20"
            onSubmit={(e) => {
              e.preventDefault()
              done()
            }}
          >
            <textarea
              autoFocus
              rows={2}
              value={text}
              maxLength={140}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  done()
                }
              }}
              aria-label="Your phrase"
              placeholder="Type a phrase"
              enterKeyHint="done"
              className="field-sizing-content w-full resize-none bg-transparent text-[34px] leading-[1.12] font-semibold tracking-[-0.035em] caret-score outline-none placeholder:text-subtle-foreground/60 md:text-5xl md:leading-[1.08]"
            />
            {tooLong && (
              <p role="status" className="mt-4 text-lg text-muted-foreground">
                {words} words, {MAX_WORDS} at most
              </p>
            )}
          </form>
        </div>
        <aside className="hidden lg:block">
          <div className="sticky top-24 mt-10 rounded-2xl border px-6 pt-9 pb-7">{dock}</div>
        </aside>
      </div>
      <div className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t bg-background/85 backdrop-blur-xl lg:hidden">
        <div className="mx-auto max-w-2xl px-5 pt-6 pb-2 md:px-8">
          {dock}
          <div className="h-14" />
        </div>
      </div>
    </div>
  )
}

// ─── Shared practice screen ───────────────────────────────────────────────────

interface ShellProps {
  back: string
  title?: string
  phrase?: Phrase
  autoRecord?: boolean
  onEdit?: () => void
  nextLabel: string
  onNext: () => void
  /** Set when the phrase could not be loaded: shows the error with a way to try again. */
  onRetry?: () => void
}

function PracticeShell({ back, title, phrase, onRetry, ...rest }: ShellProps) {
  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar
        back={back}
        title={title}
        level
      />
      {phrase ? (
        <Session key={phrase.id} phrase={phrase} {...rest} />
      ) : onRetry ? (
        <div className="mx-auto w-full max-w-2xl flex-1 px-5 pt-10 md:px-8">
          <Notice icon={<CircleAlert className="size-4" />} title="Couldn't load a phrase">
            Check your connection.
          </Notice>
          <button
            type="button"
            onClick={onRetry}
            className="mt-4 h-11 rounded-full border px-5 text-sm font-medium transition-colors hover:border-border-strong"
          >
            Try again
          </button>
        </div>
      ) : (
        <SessionSkeleton />
      )}
    </div>
  )
}

function SessionSkeleton() {
  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-5 pt-10 md:px-8">
      <div className="h-9 w-4/5 animate-pulse rounded-md bg-muted" />
      <div className="mt-3 h-9 w-3/5 animate-pulse rounded-md bg-muted" />
      <div className="mt-6 h-4 w-2/3 animate-pulse rounded bg-muted" />
    </div>
  )
}

type Phase = { kind: "ready" } | { kind: "scoring" } | { kind: "result"; result: ScoreResult }

function Session({
  phrase,
  nextLabel,
  onNext,
  autoRecord,
  onEdit,
}: {
  phrase: Phrase
  nextLabel: string
  onNext: () => void
  autoRecord?: boolean
  onEdit?: () => void
}) {
  const audio = useAudio()
  const [ref, setRef] = useState<ReferenceAudio>()
  const [take, setTake] = useState<Take>()
  const [takes, setTakes] = useState(0)
  const [phase, setPhase] = useState<Phase>({ kind: "ready" })
  const [heard, setHeard] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let live = true
    api.referenceAudio(phrase).then((r) => live && setRef(r))
    return () => {
      live = false
    }
  }, [phrase])

  const onTake = useCallback(
    async (t: Take) => {
      setTake(t)
      setTakes((n) => n + 1)
      setFailed(false)
      setPhase({ kind: "scoring" })
      try {
        const result = await api.scoreAttempt(phrase, { audio: t.blob, durationMs: t.durationMs, peakLevel: t.peakLevel })
        setPhase({ kind: "result", result })
      } catch {
        // Too large, rejected or offline: back to the record button rather than "Checking" forever.
        setFailed(true)
        setPhase({ kind: "ready" })
      }
    },
    [phrase],
  )
  // Until the reference clip has loaded, estimate its length (about 350 ms a word).
  const rec = useRecorder(onTake, ref?.durationMs ?? phrase.words.length * 350)

  // Coming from the compose step with a tap on Record: start straight away.
  const autoStarted = useRef(false)
  useEffect(() => {
    if (autoRecord && !autoStarted.current) {
      autoStarted.current = true
      void rec.start()
    }
  }, [autoRecord, rec])
  const recording = rec.state === "recording" || rec.state === "requesting"

  const toggleRecord = useCallback(() => {
    if (recording) return rec.stop()
    audio.stop()
    void rec.start()
  }, [recording, rec, audio])
  const playRef = useCallback(
    (slow = false) => {
      if (!ref || recording) return
      setHeard(true)
      void audio.toggle(slow ? "ref-slow" : "ref", ref.url, undefined, slow ? SLOW_RATE : 1)
    },
    [ref, recording, audio],
  )
  const playTake = useCallback(
    (slow = false) => take && !recording && audio.toggle(slow ? "take-slow" : "take", take.url, undefined, slow ? SLOW_RATE : 1),
    [take, recording, audio],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && e.target.closest("input, textarea")) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.code === "Space") {
        e.preventDefault()
        toggleRecord()
      } else if (e.key === "r" || e.key === "R") playRef(e.shiftKey)
      else if (e.key === "y" || e.key === "Y") playTake(e.shiftKey)
      else if (e.key === "n" || e.key === "ArrowRight") onNext()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [toggleRecord, playRef, playTake, onNext])

  const result = phase.kind === "result" ? phase.result : undefined
  const scored = result?.status === "scored" ? result : undefined

  const focus: "listen" | "record" | null =
    phase.kind !== "ready" || recording ? null : !heard && takes === 0 ? "listen" : "record"
  const dockProps = {
    refAudio: ref,
    take,
    playing: audio.playing,
    progress: audio.progress,
    rec,
    busy: phase.kind === "scoring",
    retry: !!result,
    focus,
    onRef: playRef,
    onTake: playTake,
    onRecord: toggleRecord,
    onNext,
    nextLabel,
  }

  return (
    <>
      <div className="mx-auto w-full max-w-2xl flex-1 px-5 md:px-8 lg:grid lg:max-w-6xl lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-16">
        <div className="pb-[19rem] lg:pb-20">

          <section className="pt-10 md:pt-14 lg:pt-20" aria-live="polite">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <PhraseView phrase={phrase} result={scored} />
              </div>
              {onEdit && (
                <button
                  type="button"
                  onClick={onEdit}
                  aria-label="Edit phrase"
                  className="mt-1.5 grid size-10 shrink-0 place-items-center rounded-full border text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground"
                >
                  <PenLine className="size-4" />
                </button>
              )}
            </div>
          </section>

          <section className="mt-10 lg:mt-14">
            {phase.kind === "ready" && <ReadyHint state={rec.state} />}
            {phase.kind === "ready" && failed && !recording && (
              <Notice icon={<CircleAlert className="size-4" />} title="Couldn't check that take">
                Record it again.
              </Notice>
            )}
            {phase.kind === "scoring" && <Scoring />}
            {result && <ResultView result={result} phrase={phrase} refAudio={ref} takeUrl={take?.url} audio={audio} />}
          </section>
        </div>

        <aside className="hidden lg:block">
          <div className="sticky top-24 mt-10">
            <Dock variant="panel" {...dockProps} />
          </div>
        </aside>
      </div>

      <div className="lg:hidden">
        <Dock variant="bar" {...dockProps} />
      </div>
    </>
  )
}

function PhraseView({ phrase, result }: { phrase: Phrase; result?: Scored }) {
  const issues = result ? new Map(result.words.map((w) => [w.index, w] as const)) : undefined
  const pauses = new Set(result?.pauses.map((p) => p.after))
  const saidLine = result?.words.some((w) => w.sounds.length || w.stress || w.kinds.includes("swallowed"))
  return (
    <div>
      <p className="text-[34px] leading-[1.12] font-semibold tracking-[-0.035em] text-balance md:text-5xl md:leading-[1.08]">
        {phrase.words.map((w, i) => {
          const sev = issues?.get(i)?.severity
          return (
            <span key={i}>
              <span
                className={cn(
                  "transition-colors duration-500",
                  sev === "major" && "text-score underline decoration-score decoration-[3px] underline-offset-[7px]",
                  sev === "minor" && "underline decoration-score/70 decoration-dotted decoration-[3px] underline-offset-[7px]",
                  issues && !sev && "text-foreground/90",
                )}
              >
                {i === phrase.words.length - 1 ? withoutFinalDot(w.text) : w.text}
              </span>
              {pauses.has(i) && (
                <span role="img" aria-label="long pause" className="ml-2 font-normal text-score">
                  ‖
                </span>
              )}{" "}
            </span>
          )
        })}
      </p>
      <p className="mt-5 font-ipa text-[17px] leading-relaxed break-words text-muted-foreground md:text-lg">
        <span className="text-subtle-foreground">/</span>
        {phrase.words.map((w, i) => (
          <span key={i}>
            {w.phonemes.join("")}
            {i < phrase.words.length - 1 ? " " : ""}
          </span>
        ))}
        <span className="text-subtle-foreground">/</span>
      </p>
      {saidLine && (
        <p className="mt-2 font-ipa text-[17px] leading-relaxed break-words md:text-lg">
          <span className="mr-2 font-sans text-sm text-muted-foreground">You said</span>
          <span className="text-subtle-foreground">/</span>
          {phrase.words.map((w, i) => (
            <span key={i}>
              <SaidWord word={w} issue={issues?.get(i)} />
              {i < phrase.words.length - 1 ? " " : ""}
            </span>
          ))}
          <span className="text-subtle-foreground">/</span>
        </p>
      )}
    </div>
  )
}

const bare = (p: string) => p.replace(/[ˈˌ]/g, "")
const mark = "rounded-[3px] bg-score-soft px-px text-score"

/** One word of the "You said" line: the reference sounds with the confirmed errors swapped in. */
function SaidWord({ word, issue }: { word: Phrase["words"][number]; issue?: WordIssue }) {
  if (!issue || (!issue.sounds.length && !issue.stress && !issue.kinds.includes("swallowed")))
    return <span className="text-subtle-foreground">{word.phonemes.join("")}</span>
  if (issue.kinds.includes("swallowed") && issue.startMs == null) return <span className={mark}>—</span>
  const sounds = new Map(issue.sounds.map((s) => [s.at, s] as const))
  return (
    <span className={cn("text-foreground", issue.kinds.includes("swallowed") && "opacity-60")}>
      {word.phonemes.map((p, j) => {
        const s = sounds.get(j)
        const stressHere = issue.stress?.heardAt === j
        const keepMark = issue.stress ? "" : p.slice(0, p.length - bare(p).length)
        return (
          <span key={j}>
            {stressHere && <span className={mark}>ˈ</span>}
            {keepMark}
            {s ? <span className={mark}>{s.heard ?? "_"}</span> : bare(p)}
          </span>
        )
      })}
    </span>
  )
}

function ReadyHint({ state }: { state: string }) {
  if (state === "denied")
    return (
      <Notice icon={<MicOff className="size-4" />} title="Microphone blocked">
        Allow microphone access for this site in your browser settings, then tap record again.
      </Notice>
    )
  if (state === "unsupported")
    return (
      <Notice icon={<MicOff className="size-4" />} title="Recording not available">
        This browser can't record audio here. Open Accent Dojo over HTTPS in Safari or Chrome.
      </Notice>
    )
  return null
}

function Scoring() {
  return (
    <div className="space-y-3">
      <Eyebrow>Listening to your take</Eyebrow>
      <div className="relative h-px w-full overflow-hidden bg-border">
        <div className="absolute inset-y-0 left-0 w-1/3 animate-[scan_1.1s_ease-in-out_infinite] bg-foreground" />
      </div>
    </div>
  )
}

function Notice({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border p-5">
      <div className="flex items-center gap-2.5 font-medium">
        <span className="text-muted-foreground">{icon}</span>
        {title}
      </div>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{children}</p>
    </div>
  )
}

/** Phrases are shown without their closing full stop; ? and ! stay (they shape intonation). */
const withoutFinalDot = (text: string) => text.replace(/\.+$/, "")

const UNSCORABLE: Record<Extract<ScoreResult, { status: "unscorable" }>["reason"], string> = {
  too_short: "Too short",
  too_quiet: "Too quiet",
  noisy: "Too noisy",
  off_phrase: "Different phrase",
}

const clean = (w: string) => w.replace(/[^\p{L}'’-]/gu, "")

type Scored = Extract<ScoreResult, { status: "scored" }>

function ResultView({
  result,
  phrase,
  refAudio,
  takeUrl,
  audio,
}: {
  result: ScoreResult
  phrase: Phrase
  refAudio?: ReferenceAudio
  takeUrl?: string
  audio: ReturnType<typeof useAudio>
}) {
  const [showAll, setShowAll] = useState(false)
  if (result.status === "unscorable")
    return (
      <div className="flex items-center gap-3 animate-in fade-in">
        <MicOff className="size-5 text-muted-foreground" />
        <span className="text-2xl font-semibold tracking-[-0.03em]">Could not score</span>
        <span className="text-muted-foreground">· {UNSCORABLE[result.reason]}</span>
      </div>
    )

  const { score, band, words, pauses, pace, intonation } = result
  // Research 06: at most three cards at once, weakest first; the rest on request.
  const shown = showAll ? words : words.slice(0, MAX_CARDS)
  const notes = [
    pace === "slow" && "Slow",
    pauses.length === 1 && "Long pause",
    pauses.length > 1 && `${pauses.length} long pauses`,
    intonation.flat && "Flat intonation",
  ].filter(Boolean) as string[]
  return (
    <div className="animate-in space-y-8 duration-500 fade-in slide-in-from-bottom-2">
      <div className="space-y-4">
        <ScoreMeter score={score} band={band} />
        {notes.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {notes.map((n) => (
              <li key={n} className="flex h-9 items-center gap-2 rounded-full border border-score/40 pr-3.5 pl-3 text-[15px] font-medium">
                <span className="size-1.5 rounded-full bg-score" />
                {n}
              </li>
            ))}
          </ul>
        )}
      </div>
      {words.length > 0 && (
        <div className="space-y-3">
          {shown.map((w) => (
            <WordCard
              key={w.index}
              issue={w}
              phrase={phrase}
              refSeg={segmentOf(refAudio?.words[w.index])}
              takeSeg={segmentOf(w)}
              refUrl={refAudio?.url}
              takeUrl={takeUrl}
              audio={audio}
            />
          ))}
          {!showAll && words.length > MAX_CARDS && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="h-11 w-full rounded-2xl border text-[15px] font-medium text-muted-foreground hover:border-border-strong hover:text-foreground"
            >
              +{words.length - MAX_CARDS} more
            </button>
          )}
        </div>
      )}
      <IntonationChart intonation={intonation} />
    </div>
  )
}

const MAX_CARDS = 3
/** Padding around a word clip so short words and soft edges are not cut. */
const CLIP_PAD_S = 0.12

function segmentOf(t?: WordTime): Segment | undefined {
  if (!t || t.startMs == null || t.endMs == null) return undefined
  return { start: Math.max(0, t.startMs / 1000 - CLIP_PAD_S), end: t.endMs / 1000 + CLIP_PAD_S }
}

const KIND_LABEL: Record<WordIssue["kinds"][number], string> = {
  sound: "Sound",
  swallowed: "Swallowed",
  stress: "Stress",
  unclear: "Unclear",
}

function WordCard(p: {
  issue: WordIssue
  phrase: Phrase
  refSeg?: Segment
  takeSeg?: Segment
  refUrl?: string
  takeUrl?: string
  audio: ReturnType<typeof useAudio>
}) {
  const word = p.phrase.words[p.issue.index]
  const notSaid = p.issue.kinds.includes("swallowed") && p.issue.startMs == null
  const label = notSaid ? "Not heard" : p.issue.kinds.map((k) => KIND_LABEL[k]).join(" · ")
  const refKey = `ref-word-${p.issue.index}`
  const takeKey = `take-word-${p.issue.index}`
  const marks = [...p.issue.sounds.map((s) => s.at), ...(p.issue.stress ? [p.issue.stress.expectedAt] : [])]
  return (
    <div className={cn("rounded-2xl border px-5 pt-4 pb-4", p.issue.severity === "major" ? "border-score/40" : "border-dashed border-score/50")}>
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-xl font-semibold tracking-[-0.02em]">{clean(word.text)}</span>
        <span className="text-right text-sm text-muted-foreground">{label}</span>
      </div>
      <Ipa sounds={word.phonemes} mark={marks} className="mt-1 block text-[17px] text-muted-foreground" />
      {p.issue.sounds.slice(0, 2).map((s) => (
        <SoundLine key={s.at} expected={s.expected} heard={s.heard} />
      ))}
      {p.issue.stress && <StressLine phonemes={word.phonemes} stress={p.issue.stress} />}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <ClipPair label="Listen" id={refKey} url={p.refUrl} seg={p.refSeg} audio={p.audio} />
        <ClipPair label="Mine" mine id={takeKey} url={p.takeUrl} seg={p.takeSeg} audio={p.audio} />
      </div>
    </div>
  )
}

/** A word clip at normal speed, with a small "Slow" button beside it. */
function ClipPair(p: { label: string; mine?: boolean; id: string; url?: string; seg?: Segment; audio: ReturnType<typeof useAudio> }) {
  const play = (slow: boolean) =>
    p.url && p.seg && p.audio.toggle(slow ? `${p.id}-slow` : p.id, p.url, p.seg, slow ? SLOW_RATE : 1)
  const disabled = !p.url || !p.seg
  const slowActive = p.audio.playing === `${p.id}-slow`
  return (
    <div className="flex gap-1.5">
      <ClipButton label={p.label} mine={p.mine} active={p.audio.playing === p.id} disabled={disabled} onClick={() => play(false)} />
      <button
        type="button"
        onClick={() => play(true)}
        disabled={disabled}
        aria-label={`${slowActive ? "Stop" : "Play"} ${p.label === "Mine" ? "your word" : "the word"} slowly`}
        className={cn(
          "flex h-11 shrink-0 items-center gap-1 rounded-xl border px-2.5 text-[13px] font-medium text-muted-foreground transition-colors disabled:opacity-30",
          slowActive ? "border-score text-foreground" : "hover:border-border-strong hover:text-foreground",
        )}
      >
        {slowActive ? <Square className="size-3 fill-current" /> : <Turtle className="size-3.5" />}
        Slow
      </button>
    </div>
  )
}

function ClipButton(p: { label: string; mine?: boolean; active: boolean; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={p.onClick}
      disabled={p.disabled}
      className={cn(
        "flex h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-xl border text-[15px] font-medium transition-colors disabled:opacity-30",
        p.active ? "border-score" : "hover:border-border-strong",
      )}
    >
      {p.active ? <Square className="size-3.5 fill-current" /> : <Play className={cn("size-4 fill-current", p.mine && "text-score")} />}
      {p.label}
    </button>
  )
}

/** "w as in we → closer to v as in very" (research 06); a dropped sound says so. */
function SoundLine({ expected, heard }: { expected: string; heard: string | null }) {
  return (
    <p className="mt-3 text-[17px] leading-snug">
      <span className="font-ipa font-semibold">{expected}</span>
      {SOUND_EXAMPLE[expected] && <span className="text-muted-foreground"> {SOUND_EXAMPLE[expected]}</span>}
      {heard ? (
        <>
          <span className="text-muted-foreground"> → closer to </span>
          <span className="font-ipa font-semibold text-score">{heard}</span>
          {SOUND_EXAMPLE[heard] && <span className="text-muted-foreground"> {SOUND_EXAMPLE[heard]}</span>}
        </>
      ) : (
        <span className="text-muted-foreground"> → dropped</span>
      )}
    </p>
  )
}

/** Stress as written vs as said, both in IPA with the stressed vowel marked. */
function StressLine({ phonemes, stress }: { phonemes: string[]; stress: { expectedAt: number; heardAt: number } }) {
  const said = phonemes.map((p, j) => (j === stress.heardAt ? "ˈ" : "") + bare(p))
  return (
    <p className="mt-3 text-[17px] leading-snug">
      <span className="text-muted-foreground">Stress </span>
      <span className="font-ipa font-semibold">/{phonemes.join("")}/</span>
      <span className="text-muted-foreground"> → you said </span>
      <span className="font-ipa font-semibold text-score">/{said.join("")}/</span>
    </p>
  )
}

/** Pitch of the take over the reference's, both relative to each speaker's own median. */
function IntonationChart({ intonation }: { intonation: Scored["intonation"] }) {
  const all = [...intonation.you, ...intonation.reference].filter((v): v is number => v != null)
  if (intonation.you.filter((v) => v != null).length < 6 || all.length < 12) return null
  const lo = Math.min(-6, ...all)
  const hi = Math.max(6, ...all)
  const W = 300
  const H = 72
  const path = (pts: (number | null)[]) => {
    let d = ""
    let pen = false
    pts.forEach((v, i) => {
      if (v == null) {
        pen = false
        return
      }
      const x = (i / (pts.length - 1)) * W
      const y = H - ((v - lo) / (hi - lo)) * H
      d += `${pen ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)} `
      pen = true
    })
    return d
  }
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <Eyebrow>Intonation</Eyebrow>
        <span className="flex items-center gap-4 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded-full bg-muted-foreground" /> Reference
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded-full bg-score" /> You
          </span>
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="mt-3 h-20 w-full overflow-visible" aria-label="Pitch of your take and of the reference">
        <path d={path(intonation.reference)} fill="none" className="stroke-muted-foreground" strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
        <path d={path(intonation.you)} fill="none" className="stroke-score" strokeWidth={2.5} vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  )
}

/** Keyword per sound, for sound lines and Work on badges. Sounds that English does not use get a short description. */
const SOUND_EXAMPLE: Record<string, string> = {
  θ: "as in think", ð: "as in this", w: "as in we", v: "as in very", f: "as in fan", s: "as in sun",
  z: "as in zoo", t: "as in top", d: "as in dog", p: "as in pen", b: "as in bat", k: "as in cat",
  ɡ: "as in go", ʃ: "as in ship", ʒ: "as in vision", tʃ: "as in chip", dʒ: "as in job", h: "as in hat",
  ŋ: "as in sing", n: "as in no", m: "as in me", l: "as in let", ɹ: "as in red", j: "as in yes",
  i: "as in see", ɪ: "as in sit", ɛ: "as in bed", æ: "as in cat", ʌ: "as in cup", ɑ: "as in father",
  ʊ: "as in book", u: "as in food", ɔ: "as in thought", ə: "as in about", ɚ: "as in bird", eɪ: "as in day", aɪ: "as in my",
  oʊ: "as in go", aʊ: "as in now", ɔɪ: "as in boy",
  ɛɹ: "as in air", ɪɹ: "as in near", ɑɹ: "as in car", oɹ: "as in more", ʊɹ: "as in tour", aʊɚ: "as in hour",
  əl: "as in little",
  x: "like ch in loch", r: "rolled or tapped", e: "pure, without a glide", o: "pure, without a glide", a: "like a in father, but shorter",
  ʈ: "with the tongue curled back", ɖ: "with the tongue curled back", "t̪": "with the tongue on the teeth",
  β: "between b and v", ʋ: "between v and w", ɸ: "blown through the lips", ʁ: "from the back of the throat",
  χ: "rough, from the back of the throat", ħ: "breathy, from the throat", ɕ: "a soft sh", ts: "as in cats",
}

function ScoreMeter({ score, band }: { score: number; band: Band }) {
  return (
    <div>
      <div className="flex items-baseline gap-2.5">
        <span className="text-6xl font-semibold tracking-[-0.05em] tabular-nums md:text-7xl">{score}</span>
        <span className="text-lg text-muted-foreground">/ 100</span>
        <h2 className="ml-auto text-2xl font-semibold tracking-[-0.03em] md:text-3xl">{BAND_LABEL[band]}</h2>
      </div>
      <div
        className="mt-4 h-1.5 rounded-full bg-border-strong"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={score}
        aria-label="Clarity"
      >
        <div className="h-full rounded-full bg-score transition-[width] duration-700" style={{ width: `${Math.max(2, score)}%` }} />
      </div>
    </div>
  )
}

// ─── Thumb dock ───────────────────────────────────────────────────────────────

function Dock(props: {
  variant: "bar" | "panel"
  refAudio?: ReferenceAudio
  take?: Take
  playing: string | null
  progress: number
  rec: ReturnType<typeof useRecorder>
  busy: boolean
  retry: boolean
  /** Which control to draw the eye to next. */
  focus: "listen" | "record" | null
  onRef: (slow?: boolean) => void
  onTake: (slow?: boolean) => void
  onRecord: () => void
  onNext: () => void
  nextLabel: string
}) {
  const { variant, refAudio, take, playing, progress, rec, busy, retry, focus } = props
  const recording = rec.state === "recording"
  const panel = variant === "panel"
  const recLabel = recording
    ? `Stop · 0:${String(Math.floor(rec.elapsed / 1000)).padStart(2, "0")}`
    : busy
      ? "Checking"
      : retry
        ? "Again"
        : "Record"

  const controls = (
    <div className="mx-auto grid max-w-sm grid-cols-3 items-start">
      <Control
        label="Listen" kbd="R"
        extra={<SlowButton name="reference voice" active={playing === "ref-slow"} disabled={!refAudio || recording} onClick={() => props.onRef(true)} />}
      >
        <SideButton
          name="reference voice"
          active={playing === "ref"}
          focus={focus === "listen"}
          progress={playing === "ref" ? progress : 0}
          disabled={!refAudio || recording}
          loading={!refAudio}
          onClick={() => props.onRef()}
        />
      </Control>

      <Control label={recLabel} kbd="Space" strong>
        <button
          type="button"
          onClick={props.onRecord}
          disabled={busy}
          aria-label={recording ? "Stop recording" : "Start recording"}
          aria-pressed={recording}
          className={cn(
            "relative -mt-2 grid size-[88px] place-items-center rounded-full bg-foreground text-background transition-all duration-150 active:scale-95 disabled:opacity-40",
            recording && "rec-pulse",
            focus === "record" && "ring-[6px] ring-foreground/15",
          )}
        >
          <span
            aria-hidden
            className="pointer-events-none absolute -inset-1.5 rounded-full border border-foreground/50 transition-transform duration-75"
            style={{ transform: `scale(${1 + rec.level * 0.22})`, opacity: recording ? 1 : 0 }}
          />
          {busy ? (
            <Spinner className="size-6 border-2" />
          ) : recording ? (
            <Square className="size-6 fill-current" />
          ) : (
            <span aria-hidden className="size-6 rounded-full bg-record-dot" />
          )}
        </button>
      </Control>

      <Control
        label="My take" kbd="Y"
        extra={<SlowButton name="your take" active={playing === "take-slow"} disabled={!take || recording} onClick={() => props.onTake(true)} />}
      >
        <SideButton
          name="your take"
          active={playing === "take"}
          progress={playing === "take" ? progress : 0}
          disabled={!take || recording}
          onClick={() => props.onTake()}
        />
      </Control>
    </div>
  )

  const next = (
    <button
      type="button"
      onClick={props.onNext}
      disabled={recording}
      className={cn(
        "flex h-12 w-full items-center justify-center gap-2 rounded-full text-[15px] font-medium transition-colors disabled:opacity-40",
        panel ? "border hover:border-border-strong hover:bg-muted" : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {props.nextLabel} <ArrowRight className="size-4" />
      {panel && <Kbd>N</Kbd>}
    </button>
  )

  if (panel)
    return (
      <div className="rounded-2xl border">
        <div className="px-6 pt-9 pb-7">{controls}</div>
        <div className="border-t px-6 py-4">{next}</div>
      </div>
    )

  return (
    <div className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t bg-background/85 backdrop-blur-xl">
      <div className="mx-auto max-w-2xl px-5 pt-6 pb-2 md:px-8">
        {controls}
        <div className="mt-2">{next}</div>
      </div>
    </div>
  )
}

function Control({
  label,
  kbd,
  strong,
  extra,
  children,
}: {
  label: string
  kbd: string
  strong?: boolean
  /** Under the label, e.g. the "Slow" button. */
  extra?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-2.5">
      <div className="grid h-[72px] place-items-center">{children}</div>
      <span
        className={cn(
          "flex items-center gap-1.5 text-[13px] tabular-nums",
          strong ? "font-medium text-foreground" : "text-muted-foreground",
        )}
      >
        {label}
        <span className="hidden lg:inline-flex">
          <Kbd>{kbd}</Kbd>
        </span>
      </span>
      {extra}
    </div>
  )
}

function SideButton(p: {
  name: string
  focus?: boolean
  active: boolean
  progress: number
  disabled: boolean
  loading?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={p.onClick}
      disabled={p.disabled}
      aria-label={`${p.active ? "Stop" : "Play"} ${p.name}`}
      className={cn(
        "relative grid size-16 place-items-center overflow-hidden rounded-2xl border transition-colors disabled:opacity-30",
        p.active || p.focus ? "border-score" : "hover:border-border-strong",
        p.focus && "ring-[6px] ring-score/20",
      )}
    >
      {p.loading ? (
        <Spinner className="text-muted-foreground" />
      ) : p.active ? (
        <Square className="size-4 fill-current" />
      ) : (
        <Play className="size-5 fill-current" />
      )}
      <span
        aria-hidden
        className="absolute bottom-0 left-0 h-0.5 bg-score transition-[width] duration-200 ease-linear"
        style={{ width: `${p.progress * 100}%` }}
      />
    </button>
  )
}

/** Small "Slow" button beside a dock play button: the same clip at SLOW_RATE. */
function SlowButton(p: { name: string; active: boolean; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={p.onClick}
      disabled={p.disabled}
      aria-label={`${p.active ? "Stop" : "Play"} ${p.name} slowly`}
      className={cn(
        "-mt-0.5 flex h-8 items-center gap-1 rounded-full border px-2.5 text-[13px] font-medium text-muted-foreground transition-colors disabled:opacity-30",
        p.active ? "border-score text-foreground" : "hover:border-border-strong hover:text-foreground",
      )}
    >
      {p.active ? <Square className="size-3 fill-current" /> : <Turtle className="size-3.5" />}
      Slow
    </button>
  )
}
