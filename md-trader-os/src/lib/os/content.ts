/**
 * BECOMING — THE CONTENT BANK.
 *
 * Strictly trading psychology: FOMO, revenge trading, patience, discipline,
 * journaling, risk, losing streaks. Nothing about training, food or the body.
 *
 * The quotes are, almost all, written for this app and carry no attribution.
 * The handful that do are widely published and attributed as shown; nothing
 * has been put in anyone's mouth.
 */

export type Topic =
  | "fomo"
  | "revenge"
  | "patience"
  | "discipline"
  | "journaling"
  | "risk"
  | "losses"
  | "process"
  | "confidence";

export const TOPICS: { key: Topic; label: string; blurb: string }[] = [
  { key: "fomo", label: "Anti-FOMO", blurb: "The move you missed was never yours." },
  { key: "revenge", label: "Anti-Revenge", blurb: "The market does not owe you a refund." },
  { key: "patience", label: "Patience", blurb: "Waiting is a position." },
  { key: "discipline", label: "Discipline", blurb: "Rules you only follow when it is easy are not rules." },
  { key: "journaling", label: "Journaling", blurb: "What you do not write down, you repeat." },
  { key: "risk", label: "Risk", blurb: "Protect the account first. Profits are a side effect." },
  { key: "losses", label: "Losing Streaks", blurb: "Losses are a cost of business, not a verdict." },
  { key: "process", label: "Process", blurb: "Grade the execution, not the outcome." },
  { key: "confidence", label: "Confidence", blurb: "Trust is built one kept promise at a time." },
];

export interface Quote {
  text: string;
  topic: Topic;
  /** Absent for the app's own lines. */
  author?: string;
}

export const QUOTES: Quote[] = [
  /* ---------------------------------- FOMO ---------------------------------- */
  { topic: "fomo", text: "The move you missed was never your trade. Your trade is the one that comes to your zone." },
  { topic: "fomo", text: "If you have to chase it, it is not a setup. It is a feeling." },
  { topic: "fomo", text: "There are 28 pairs and five sessions a week. Scarcity is the lie FOMO tells you." },
  { topic: "fomo", text: "A missed trade costs you nothing. A chased trade costs you money and discipline." },
  { topic: "fomo", text: "Price came back to the zone, or it did not. Either way, you followed the plan." },
  { topic: "fomo", text: "Entering late turns a good idea into a bad trade: worse price, wider stop, smaller reward." },
  { topic: "fomo", text: "Let it go. The market will print another candle in five minutes." },
  { topic: "fomo", text: "Watching someone else's profit is not information about your next trade." },
  { topic: "fomo", text: "When you feel the urge to jump in, that is the signal to sit on your hands." },
  { topic: "fomo", text: "No zone, no trade. No exceptions because it is 'running'." },

  /* -------------------------------- REVENGE --------------------------------- */
  { topic: "revenge", text: "The market does not know you just lost. It does not owe you that money back." },
  { topic: "revenge", text: "The trade after a loss should be the most boring trade you take all week." },
  { topic: "revenge", text: "You cannot win back money. You can only take the next good setup — or not." },
  { topic: "revenge", text: "Doubling your size to get even is how one red day becomes a blown account." },
  { topic: "revenge", text: "Anger is not an edge. Close the platform until it passes." },
  { topic: "revenge", text: "A loss you accepted is a cost. A loss you fight becomes three more." },
  { topic: "revenge", text: "Your stop did its job. Thank it and walk away." },
  { topic: "revenge", text: "Two losses in a row is a rule, not a challenge." },
  { topic: "revenge", text: "Protect tomorrow's account from today's emotions." },
  { topic: "revenge", text: "Being down for the day is survivable. Being down because you could not stop is a choice." },

  /* -------------------------------- PATIENCE -------------------------------- */
  { topic: "patience", text: "Waiting is a position. Flat is a position." },
  { topic: "patience", text: "Set the limit at the wick zone and let price come to you." },
  { topic: "patience", text: "The weekly decides the direction. The 1H decides the moment. You decide nothing in between." },
  { topic: "patience", text: "Most of trading is waiting. The paid part is a few minutes a day." },
  { topic: "patience", text: "A setup that is 80% there is 0% ready." },
  { topic: "patience", text: "Boredom is the feeling of discipline working." },
  { topic: "patience", text: "Trade less. Wait longer. Take only what you would show your mentor." },
  { topic: "patience", text: "If you are not sure, you are not in." },
  { topic: "patience", text: "The stock market is a device for transferring money from the impatient to the patient.", author: "Warren Buffett" },
  { topic: "patience", text: "It never was my thinking that made the big money for me. It always was my sitting.", author: "Reminiscences of a Stock Operator" },

  /* ------------------------------- DISCIPLINE ------------------------------- */
  { topic: "discipline", text: "Rules you only follow when it is easy are not rules. They are suggestions." },
  { topic: "discipline", text: "Your plan was written by you on a calm day. Trust that version of you." },
  { topic: "discipline", text: "Same risk, every trade. Consistency is the edge before the edge." },
  { topic: "discipline", text: "Never move the stop further away. Ever." },
  { topic: "discipline", text: "Run the checklist. If one box is empty, so is the trade." },
  { topic: "discipline", text: "Hit the daily limit? Then today's job is done. Log it and close the charts." },
  { topic: "discipline", text: "Discipline is choosing what you want most over what you want now." },
  { topic: "discipline", text: "The best traders are not exciting. They are repeatable." },

  /* ------------------------------- JOURNALING ------------------------------- */
  { topic: "journaling", text: "What you do not write down, you repeat." },
  { topic: "journaling", text: "Journal the losses in more detail than the wins. That is where the tuition was paid." },
  { topic: "journaling", text: "Write why you entered before you know how it ends." },
  { topic: "journaling", text: "Your journal is a mirror. It only works if you look in it every week." },
  { topic: "journaling", text: "One honest line — 'I chased it' — is worth a page of excuses." },
  { topic: "journaling", text: "Patterns in your mistakes are just as real as patterns on the chart." },

  /* ---------------------------------- RISK ---------------------------------- */
  { topic: "risk", text: "Protect the account first. Profits are what happens to traders who are still here." },
  { topic: "risk", text: "Know your loss before you enter. If you cannot afford the stop, you cannot afford the trade." },
  { topic: "risk", text: "One percent feels small until you need twenty of them to survive a bad month." },
  { topic: "risk", text: "Size by the stop, never by the feeling." },
  { topic: "risk", text: "A 50% drawdown needs a 100% gain to recover. Do not dig that hole." },
  { topic: "risk", text: "Risk comes from not knowing what you're doing.", author: "Warren Buffett" },
  { topic: "risk", text: "Don't focus on making money; focus on protecting what you have.", author: "Paul Tudor Jones" },

  /* ------------------------------- LOSING STREAKS --------------------------- */
  { topic: "losses", text: "Losses are a business expense, not a judgement on who you are." },
  { topic: "losses", text: "A 50% strategy will lose five in a row more often than you think. Plan for it." },
  { topic: "losses", text: "A losing streak inside a winning system is just variance wearing a scary mask." },
  { topic: "losses", text: "Shrink size in a drawdown. Never grow it." },
  { topic: "losses", text: "The edge shows up over a hundred trades, not over the last three." },
  { topic: "losses", text: "You did not lose. The setup did not work this time. Those are different things." },

  /* --------------------------------- PROCESS -------------------------------- */
  { topic: "process", text: "Grade the execution, not the outcome. A good trade can lose." },
  { topic: "process", text: "A rule-breaking win is the most expensive trade you will ever take — it teaches you to break rules." },
  { topic: "process", text: "Focus on the next right action. The P/L is a lagging indicator." },
  { topic: "process", text: "Process today, profits eventually." },
  { topic: "process", text: "The goal of a successful trader is to make the best trades. Money is secondary.", author: "Alexander Elder" },
  { topic: "process", text: "Anything can happen. Your job is to be prepared for all of it, not to predict it." },

  /* ------------------------------- CONFIDENCE ------------------------------- */
  { topic: "confidence", text: "Confidence is built from kept promises to yourself. Keep one today." },
  { topic: "confidence", text: "You do not need to know what happens next to make money. You need an edge and the discipline to repeat it." },
  { topic: "confidence", text: "Fear of the next loss is fear of the stop doing its job. Let it." },
  { topic: "confidence", text: "Take the A+ setup after a loss with the same size. That is what trusting your system means." },
  { topic: "confidence", text: "You are not trying to be right. You are trying to be consistent." },
  { topic: "confidence", text: "The trader you are becoming is built in the trades you do not take." },
];

/** One quote per calendar day, the same for everyone on that day. */
export function quoteOfTheDay(date = new Date(), topic?: Topic): Quote {
  const pool = topic ? QUOTES.filter((q) => q.topic === topic) : QUOTES;
  const seed = Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000);
  return pool[seed % pool.length];
}

export function randomQuote(topics: Topic[], not?: string): Quote {
  const pool = QUOTES.filter((q) => topics.includes(q.topic) && q.text !== not);
  return pool[Math.floor(Math.random() * pool.length)] ?? QUOTES[0];
}

/* ================================== LESSONS ================================== */

export type Block =
  | { kind: "p"; text: string }
  | { kind: "list"; items: string[] }
  | { kind: "steps"; items: string[] }
  | { kind: "callout"; text: string };

export interface Lesson {
  slug: string;
  topic: Topic;
  title: string;
  minutes: number;
  summary: string;
  body: Block[];
  /** One concrete thing to do with it today. */
  action: string;
  /** Where in the app the action happens. */
  link?: { href: string; label: string };
}

export const LESSONS: Lesson[] = [
  {
    slug: "fomo-protocol",
    topic: "fomo",
    title: "The FOMO Protocol",
    minutes: 4,
    summary: "What to do in the sixty seconds after you watch a move leave without you.",
    body: [
      { kind: "p", text: "FOMO is not a lack of willpower. It is your brain treating a missed move as a loss, and losses hurt about twice as much as equal gains feel good. So it pushes you to 'fix' the miss by getting in — at a worse price, with a wider stop, for a smaller reward." },
      { kind: "callout", text: "A missed trade costs you nothing. A chased trade costs you money and teaches you to chase." },
      { kind: "p", text: "Have the protocol ready before the feeling arrives, because you will not reason your way out of it in the moment:" },
      { kind: "steps", items: [
        "Take your hands off the mouse. Say out loud: 'That one is gone.'",
        "Ask: is price at one of my wick zones right now? If not, there is no trade — full stop.",
        "Ask: where would my stop go if I entered here? If it is further away than my plan allows, there is no trade.",
        "Open the Wick Catcher for that market and set an alert at the next with-trend zone instead.",
        "Log the urge in the Reset Room as 'resisted'. Every resisted urge is a rep.",
      ] },
      { kind: "p", text: "The point of the last step is that resisting has to feel like a win, or you will not keep doing it. A trader who resisted FOMO ten times this month built more edge than one who caught one lucky chase." },
    ],
    action: "Next time a move leaves without you, run the five steps and log it in the Reset Room.",
    link: { href: "/reset", label: "Open the Reset Room" },
  },
  {
    slug: "missed-trades-are-free",
    topic: "fomo",
    title: "Missed Trades Are Free",
    minutes: 3,
    summary: "Why there is no such thing as the one that got away.",
    body: [
      { kind: "p", text: "Count the opportunities. Twenty-eight forex pairs, a handful of index futures, gold, oil — each printing a new candle every hour, five days a week. Even a strict trader who only takes A+ setups sees several a week. The supply never runs out." },
      { kind: "p", text: "What does run out is your capital and your confidence, and chasing spends both. Late entries have worse risk-to-reward by definition: the move you missed was the reward." },
      { kind: "list", items: [
        "The setup you wanted came and went? Note it in your journal as a 'missed — good' so you can see your system working.",
        "Only count it as a mistake if you saw it in time and hesitated without a reason. That is a confidence problem, not a FOMO problem.",
        "Never count it as a mistake because it would have made money. Hindsight is not a setup.",
      ] },
    ],
    action: "This week, write down every move you missed and whether it came to your zone. Most will not have.",
  },
  {
    slug: "revenge-trading",
    topic: "revenge",
    title: "Revenge Trading: How One Loss Becomes Five",
    minutes: 5,
    summary: "Recognise the signs early, and break the loop before it breaks the account.",
    body: [
      { kind: "p", text: "Revenge trading starts the moment a loss stops being information and becomes an injury. The trade that follows is no longer about the chart; it is about getting even. It is usually larger, faster, and outside the plan — and the market has no idea any of that is happening." },
      { kind: "p", text: "The warning signs are physical before they are mental:" },
      { kind: "list", items: [
        "You re-enter the same market within minutes of being stopped out.",
        "Your next position is bigger 'to make it back'.",
        "You are clicking faster, skipping the checklist, or trading a session you normally sit out.",
        "Heat in the face, tight chest, the urge to prove something.",
      ] },
      { kind: "callout", text: "You cannot win back money. You can only take the next good setup — and after a loss, the next good setup is usually tomorrow." },
      { kind: "p", text: "Break the loop with a rule, decided in advance, that does not need willpower to follow:" },
      { kind: "steps", items: [
        "After any loss: stand up, leave the screen for at least the cool-down in your plan.",
        "After your loss-streak limit: no new trades until the cool-down timer in the Reset Room has finished.",
        "After your daily loss limit: done for the day. Journal it and close the platform.",
        "Before the next trade: write one sentence on why this setup would exist if the last trade had won.",
      ] },
    ],
    action: "Set your loss-streak limit and cool-down length in your Trading Plan today.",
    link: { href: "/plan", label: "Open my Trading Plan" },
  },
  {
    slug: "the-reset",
    topic: "revenge",
    title: "The Five-Minute Reset",
    minutes: 3,
    summary: "A short routine to get your head back before you make another decision.",
    body: [
      { kind: "p", text: "Emotion and decision-making do not share the controls well. The fastest way to hand the controls back is to slow your body down first." },
      { kind: "steps", items: [
        "Box breathing: in for four, hold for four, out for four, hold for four. Four rounds.",
        "Name what you feel in one word. Frustrated, scared, impatient. Naming it shrinks it.",
        "Read your rules out loud — the actual words, not your memory of them.",
        "Look at your vision board. Remember what this account is for.",
        "Only then decide: is there a setup on my plan? If you have to search for one, the answer is no.",
      ] },
    ],
    action: "Try the breathing timer in the Reset Room once today, before you need it.",
    link: { href: "/reset", label: "Open the Reset Room" },
  },
  {
    slug: "waiting-is-a-position",
    topic: "patience",
    title: "Waiting Is a Position",
    minutes: 4,
    summary: "Patience is not doing nothing. It is doing the plan, which is mostly waiting.",
    body: [
      { kind: "p", text: "The MD approach does its thinking on the weekly and the daily: which way is the trend, does the previous weekly candle agree, which side of the 50 EMA is price on. That part takes a few minutes. Then it waits — for price to come back to a level where the risk is small and the reward is not." },
      { kind: "p", text: "That is what the Wick Catcher is for. A pullback in a trend rarely ends at a random price. It tends to reach for liquidity: the previous day's low, an untaken swing, the 50% of a rejection wick, the 50 EMA. Put the order there and let price come to you." },
      { kind: "list", items: [
        "Decide the direction on the higher timeframes. Do not re-decide it on the 5-minute chart.",
        "Mark the zones before the session, not during it.",
        "Use limit orders or alerts, so waiting does not mean staring.",
        "If price never reaches the zone, the trade never existed. That is a good outcome.",
      ] },
      { kind: "callout", text: "Boredom is the feeling of discipline working." },
    ],
    action: "Pick one with-trend zone from the Wick Catcher and set an alert there instead of watching the chart.",
    link: { href: "/wick-catcher", label: "Open the Wick Catcher" },
  },
  {
    slug: "a-plus-only",
    topic: "patience",
    title: "A+ Setups Only",
    minutes: 3,
    summary: "Grade every setup before you take it. Most of your edge is in the trades you skip.",
    body: [
      { kind: "p", text: "Grade the setup before the entry, not after the result. Keep the grades simple:" },
      { kind: "list", items: [
        "A+ — every checklist item ticked, with-trend wick zone, clean higher timeframes, R:R at or above your minimum.",
        "A — one minor item soft (for example, the 1H confirmation is not there yet).",
        "B — you can argue for it. That is the problem.",
        "C — you want to be in a trade.",
      ] },
      { kind: "p", text: "Log the grade in the journal on every trade. After thirty or forty trades the 'By setup grade' table will show you, in your own numbers, where the money comes from and where it goes. For most traders, cutting B and C trades alone fixes the month." },
    ],
    action: "Grade every trade this week, and do not take anything below an A.",
    link: { href: "/journal", label: "Open the Journal" },
  },
  {
    slug: "rules-that-hold",
    topic: "discipline",
    title: "Rules That Hold Under Pressure",
    minutes: 4,
    summary: "How to write rules you will actually follow on a bad day.",
    body: [
      { kind: "p", text: "A rule only matters on the day you do not want to follow it. So write rules that can be followed without thinking:" },
      { kind: "list", items: [
        "Make them specific. 'Be careful with risk' is not a rule. 'Risk 1% per trade, sized from the stop' is.",
        "Make them binary. You either moved your stop or you did not.",
        "Make the consequence automatic. 'Two losses in a row = 30-minute break' needs no decision in the moment.",
        "Keep them few. Six rules you follow beat twenty you do not.",
      ] },
      { kind: "p", text: "Then measure them. Every closed trade in the journal asks 'did you follow your plan?'. The 'Followed my plan vs broke my plan' table is the most important table in the app — it puts a price on discipline, in your own R." },
    ],
    action: "Rewrite any vague rule in your Trading Plan into a specific, binary one.",
    link: { href: "/plan", label: "Open my Trading Plan" },
  },
  {
    slug: "how-to-journal",
    topic: "journaling",
    title: "How to Journal a Trade",
    minutes: 5,
    summary: "What to record before, during and after — and why the 'before' matters most.",
    body: [
      { kind: "p", text: "Most traders journal the result. The result is the least useful part. What you need is the decision, recorded before the outcome could bias it." },
      { kind: "steps", items: [
        "Before entry: market, direction, setup, grade, entry, stop, target. Why you are taking it, in one or two sentences. How you feel.",
        "Run the pre-trade checklist. The journal stores how many boxes were ticked.",
        "After exit: the result in R (and in money if you want), how you feel now, and whether you followed your plan.",
        "Tag any mistakes honestly: chased, early, moved stop, oversized, revenge.",
        "Write one lesson. One line is enough if it is true.",
        "Add a screenshot of the chart at entry and at exit.",
      ] },
      { kind: "callout", text: "Rate your execution separately from the result. A 5/5 execution that lost is a good trade. A 2/5 execution that won is a warning." },
      { kind: "p", text: "Then, once a week, sit down with the Weekly Review. The journal does the arithmetic: win rate, expectancy, your best markets and sessions, which emotions cost you money, and which mistakes cost the most R." },
    ],
    action: "Journal your next trade completely — including the emotion before entry.",
    link: { href: "/journal", label: "Log a trade" },
  },
  {
    slug: "weekly-review",
    topic: "journaling",
    title: "The Weekly Review",
    minutes: 3,
    summary: "Twenty minutes a week that compounds faster than any indicator.",
    body: [
      { kind: "p", text: "Pick the same time every week — Friday after the close or Sunday before the open. Open the Weekly Review and answer four questions:" },
      { kind: "list", items: [
        "What went well? Name the behaviour, not the P/L.",
        "What will I improve? One thing, not five.",
        "What did the market teach me this week?",
        "What is my one focus for next week?",
      ] },
      { kind: "p", text: "Look at the week's numbers beside your answers: trades taken, plan adherence, the mistakes you tagged. If the same mistake shows up two weeks running, it becomes a rule in your Trading Plan." },
    ],
    action: "Book a recurring 20-minute slot for your weekly review.",
    link: { href: "/review", label: "Open the Weekly Review" },
  },
  {
    slug: "position-sizing",
    topic: "risk",
    title: "Position Sizing in One Formula",
    minutes: 4,
    summary: "Size from the stop, so every trade risks the same amount no matter the pair.",
    body: [
      { kind: "p", text: "Decide the risk first, in money. Then let the stop decide the size:" },
      { kind: "callout", text: "Lots = (Account × Risk %) ÷ (Stop in pips × Pip value per lot)" },
      { kind: "p", text: "A 20-pip stop and a 60-pip stop should lose you the same amount when they are hit. The 60-pip trade is simply smaller. This is what makes R meaningful, and what keeps one bad trade from mattering." },
      { kind: "list", items: [
        "Pip value depends on the quote currency: about $10 per standard lot on any XXX/USD pair, different on yen pairs and crosses.",
        "Gold, indices and futures have contract sizes that vary by broker. Check yours once and save it.",
        "Round the size DOWN, never up.",
        "If the correct size is below your broker's minimum, the stop is too wide for this account — skip the trade.",
      ] },
    ],
    action: "Size your next trade with the Risk Calculator instead of by feel.",
    link: { href: "/calculator", label: "Open the Risk Calculator" },
  },
  {
    slug: "daily-loss-limit",
    topic: "risk",
    title: "The Daily Loss Limit",
    minutes: 3,
    summary: "A hard stop for the day protects you from your worst self.",
    body: [
      { kind: "p", text: "Your worst day as a trader is rarely one bad trade. It is one bad trade followed by the trades you took because of it. A daily loss limit — commonly two to three times your per-trade risk — caps that spiral before it starts." },
      { kind: "p", text: "If you trade a funded or evaluation account, the firm's daily drawdown is a hard limit set by someone else. Set your own limit inside it, so the firm's rule is never the one that stops you." },
      { kind: "list", items: [
        "Set it in your Trading Plan. The Today screen tracks how much of it you have used.",
        "When it is hit, the day is over. Not 'one more to get back to even'. Over.",
        "Journal the day anyway. The days you stopped are the days that keep you in the game.",
      ] },
    ],
    action: "Set a daily loss limit in your Trading Plan if you have not already.",
    link: { href: "/plan", label: "Open my Trading Plan" },
  },
  {
    slug: "streak-math",
    topic: "losses",
    title: "The Math of Losing Streaks",
    minutes: 4,
    summary: "Long losing streaks are normal in good systems. Know your numbers so they do not surprise you.",
    body: [
      { kind: "p", text: "With a 50% win rate, the chance of losing six in a row somewhere in 100 trades is about 55% — better than even. At a 40% win rate, which is normal for a 2R strategy, seven in a row comes up about 69% of the time and eight is close to a coin flip. Nothing is broken. That is what randomness looks like." },
      { kind: "p", text: "The Risk Calculator has a streak calculator: put in your win rate and the number of trades you take in a month, and it tells you the losing streak you should expect to see. Write that number on your plan." },
      { kind: "list", items: [
        "At 1% risk, a ten-trade losing streak is roughly a 10% drawdown. Survivable.",
        "At 5% risk, the same streak is about 40%. That is how accounts end.",
        "In a drawdown, cut size. Return to normal size only after the account recovers.",
      ] },
      { kind: "callout", text: "The edge shows up over a hundred trades, not over the last three." },
    ],
    action: "Work out your expected worst streak in the Risk Calculator and add it to your plan.",
    link: { href: "/calculator", label: "Open the streak calculator" },
  },
  {
    slug: "process-over-outcome",
    topic: "process",
    title: "Process Over Outcome",
    minutes: 3,
    summary: "Why a losing trade can be a good trade — and a winning one a dangerous one.",
    body: [
      { kind: "p", text: "Any single trade's result is mostly noise. A perfect setup can lose; a reckless one can win. If you judge yourself by results, the market will train you to repeat whatever happened to work last — including the reckless trade." },
      { kind: "p", text: "So score yourself on what you control:" },
      { kind: "list", items: [
        "Was it on my plan, in my markets, in my session?",
        "Was the entry at a zone, the stop beyond the wick, the size from the calculator?",
        "Did I manage it the way I said I would?",
      ] },
      { kind: "callout", text: "A rule-breaking win is the most expensive trade you will ever take." },
    ],
    action: "Rate execution on every closed trade this week, regardless of the result.",
    link: { href: "/journal", label: "Open the Journal" },
  },
  {
    slug: "overtrading",
    topic: "discipline",
    title: "Overtrading and Boredom",
    minutes: 3,
    summary: "When you trade to feel something, the market charges a fee.",
    body: [
      { kind: "p", text: "Overtrading looks like activity and feels like work, which is why it is so convincing. Usually it is boredom, or a need to be in something." },
      { kind: "list", items: [
        "Set a maximum number of trades per day in your plan. The Today screen counts them.",
        "Trade only your sessions. Outside them, close the platform.",
        "If you are hunting for a setup, there is not one.",
        "Replace the urge with a task: mark tomorrow's zones, review last week's trades, read a lesson.",
      ] },
    ],
    action: "Set your maximum trades per day, and stop when you reach it.",
    link: { href: "/plan", label: "Open my Trading Plan" },
  },
  {
    slug: "trusting-your-system",
    topic: "confidence",
    title: "Taking the Trade After a Loss",
    minutes: 3,
    summary: "Hesitation after losses is fear wearing caution's clothes.",
    body: [
      { kind: "p", text: "The opposite of revenge trading is freezing: an A+ setup arrives after two losses and you cannot pull the trigger. Then it works, and the miss hurts more than the losses did." },
      { kind: "p", text: "Confidence does not come from winning. It comes from evidence that your process works over many trades. That evidence is in your journal." },
      { kind: "list", items: [
        "Look at your expectancy over your last 30+ trades. If it is positive, the next A+ setup deserves the same size as the last.",
        "Take it with the same risk. Not bigger to recover, not smaller out of fear.",
        "Let the stop do the worrying. That is what you placed it for.",
      ] },
    ],
    action: "Check your expectancy in the Journal before your next trade after a loss.",
    link: { href: "/journal", label: "Open the Journal" },
  },
];

export function lessonsFor(topic: Topic): Lesson[] {
  return LESSONS.filter((l) => l.topic === topic);
}

/* ============================ RESET ROOM PROMPTS ============================ */

export const URGE_SCRIPTS: Record<
  "fomo" | "revenge" | "overtrading" | "fear" | "boredom",
  { title: string; feeling: string; questions: string[]; topics: Topic[] }
> = {
  fomo: {
    title: "I want to jump in before it leaves without me",
    feeling: "FOMO",
    questions: [
      "Is price at one of my wick zones right now?",
      "Do the weekly and daily agree with this direction?",
      "Where would my stop go — and is that inside my plan?",
      "Is the reward still at least my minimum R:R from here?",
      "Would I take this exact trade if I had not just watched it move?",
    ],
    topics: ["fomo", "patience"],
  },
  revenge: {
    title: "I want to win back what I just lost",
    feeling: "Revenge",
    questions: [
      "Would this setup exist if my last trade had won?",
      "Am I about to trade bigger than my normal risk?",
      "Have I reached my loss-streak or daily loss limit?",
      "Has my cool-down actually finished?",
      "Will I be proud of this trade when I journal it tonight?",
    ],
    topics: ["revenge", "losses"],
  },
  overtrading: {
    title: "I keep looking for one more trade",
    feeling: "Overtrading",
    questions: [
      "Have I already hit my trade limit for the day?",
      "Is this one of my markets, in my session?",
      "Am I only looking for a trade because I am sitting at the screen?",
    ],
    topics: ["discipline", "patience"],
  },
  fear: {
    title: "My setup is here but I am scared to take it",
    feeling: "Fear",
    questions: [
      "Does it pass every item on my checklist?",
      "Is the size from the calculator, so the loss is one I have already accepted?",
      "Is my journal's expectancy on this setup positive?",
    ],
    topics: ["confidence", "losses"],
  },
  boredom: {
    title: "Nothing is happening and I want to be in something",
    feeling: "Boredom",
    questions: [
      "Is there an A+ setup on my plan right now, without searching?",
      "Am I scrolling markets outside my plan just to be in something?",
    ],
    topics: ["patience", "discipline"],
  },
};
