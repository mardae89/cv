"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Eyebrow, GhostButton, GoldButton, Panel, SectionHeading } from "@/components/primitives";
import { QuoteCard } from "@/components/os";
import { LESSONS, QUOTES, TOPICS, type Block, type Lesson, type Topic } from "@/lib/os/content";
import { readQuery, replaceRoute } from "@/lib/route";

export default function MindsetPage() {
  const [topic, setTopic] = useState<Topic | "all">("all");
  const [open, setOpen] = useState<Lesson | null>(null);

  // Deep link: /mindset?lesson=fomo-protocol opens that lesson.
  useEffect(() => {
    const slug = readQuery().get("lesson");
    const l = slug ? LESSONS.find((x) => x.slug === slug) : null;
    if (l) setOpen(l);
  }, []);

  const lessons = topic === "all" ? LESSONS : LESSONS.filter((l) => l.topic === topic);
  const quotes = topic === "all" ? QUOTES : QUOTES.filter((q) => q.topic === topic);

  if (open) return <LessonReader lesson={open} onBack={() => { setOpen(null); replaceRoute("/mindset"); }} onOpen={setOpen} />;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <SectionHeading
        title="Mindset Library"
        subtitle="Strictly trading psychology. Short reads on FOMO, revenge trading, patience, discipline and journaling — each with one thing to do today."
      />

      <div className="flex flex-wrap gap-1.5">
        <TopicButton active={topic === "all"} onClick={() => setTopic("all")}>All</TopicButton>
        {TOPICS.map((t) => (
          <TopicButton key={t.key} active={topic === t.key} onClick={() => setTopic(t.key)}>{t.label}</TopicButton>
        ))}
      </div>

      {topic !== "all" ? (
        <p className="display text-xl font-bold tracking-tight text-gold">{TOPICS.find((t) => t.key === topic)?.blurb}</p>
      ) : null}

      <section>
        <Eyebrow className="mb-3">Lessons · {lessons.length}</Eyebrow>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {lessons.map((l) => (
            <button key={l.slug} onClick={() => setOpen(l)} className="panel flex flex-col p-4 text-left transition hover:border-gold/40">
              <div className="flex items-center justify-between text-[10px] uppercase tracking-widest">
                <span className="text-gold">{TOPICS.find((t) => t.key === l.topic)?.label}</span>
                <span className="text-faint">{l.minutes} min</span>
              </div>
              <div className="display mt-2 text-base font-bold leading-snug">{l.title}</div>
              <p className="mt-1 flex-1 text-sm text-mute">{l.summary}</p>
              <span className="mt-3 text-[10px] uppercase tracking-widest text-gold">Read →</span>
            </button>
          ))}
        </div>
      </section>

      <section>
        <Eyebrow className="mb-3">Quotes · {quotes.length}</Eyebrow>
        <div className="grid gap-3 sm:grid-cols-2">
          {quotes.map((q) => <QuoteCard key={q.text} quote={q} compact />)}
        </div>
      </section>
    </div>
  );
}

function TopicButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`border px-3 py-1.5 font-display text-[11px] font-semibold uppercase tracking-widest transition ${
        active ? "border-gold bg-gold text-void" : "border-hairline text-mute hover:border-gold hover:text-gold"
      }`}
    >
      {children}
    </button>
  );
}

function LessonReader({ lesson, onBack, onOpen }: { lesson: Lesson; onBack: () => void; onOpen: (l: Lesson) => void }) {
  const related = LESSONS.filter((l) => l.topic === lesson.topic && l.slug !== lesson.slug);
  const quote = QUOTES.find((q) => q.topic === lesson.topic);
  useEffect(() => window.scrollTo({ top: 0 }), [lesson.slug]);

  return (
    <article className="mx-auto max-w-2xl space-y-6">
      <button onClick={onBack} className="text-xs uppercase tracking-widest text-gold hover:underline">← Mindset Library</button>
      <header>
        <div className="text-[10px] uppercase tracking-widest text-gold">
          {TOPICS.find((t) => t.key === lesson.topic)?.label} · {lesson.minutes} min read
        </div>
        <h1 className="display mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">{lesson.title}</h1>
        <p className="mt-2 text-base text-mute">{lesson.summary}</p>
      </header>
      <div className="gold-line" />
      <div className="space-y-4 text-[15px] leading-relaxed">
        {lesson.body.map((b, i) => <BlockView key={i} block={b} />)}
      </div>

      <Panel className="border-gold/40 p-5">
        <Eyebrow className="mb-1 text-gold">Do this today</Eyebrow>
        <p className="text-base">{lesson.action}</p>
        {lesson.link ? (
          <Link href={lesson.link.href} className="mt-3 inline-block"><GoldButton>{lesson.link.label}</GoldButton></Link>
        ) : null}
      </Panel>

      {quote ? <QuoteCard quote={quote} /> : null}

      {related.length ? (
        <div>
          <Eyebrow className="mb-2">More on this</Eyebrow>
          <div className="flex flex-wrap gap-2">
            {related.map((l) => <GhostButton key={l.slug} onClick={() => onOpen(l)}>{l.title}</GhostButton>)}
          </div>
        </div>
      ) : null}
    </article>
  );
}

function BlockView({ block }: { block: Block }) {
  switch (block.kind) {
    case "p":
      return <p className="text-bone/90">{block.text}</p>;
    case "callout":
      return <p className="display border-l-2 border-gold bg-ink px-4 py-3 text-lg font-semibold leading-snug tracking-tight">{block.text}</p>;
    case "list":
      return (
        <ul className="space-y-2">
          {block.items.map((item) => (
            <li key={item} className="flex gap-3"><span className="mt-2 h-1.5 w-1.5 shrink-0 bg-gold" /><span className="text-bone/90">{item}</span></li>
          ))}
        </ul>
      );
    case "steps":
      return (
        <ol className="space-y-2">
          {block.items.map((item, i) => (
            <li key={item} className="flex gap-3">
              <span className="display flex h-6 w-6 shrink-0 items-center justify-center border border-gold/50 text-xs font-bold text-gold">{i + 1}</span>
              <span className="pt-0.5 text-bone/90">{item}</span>
            </li>
          ))}
        </ol>
      );
  }
}
