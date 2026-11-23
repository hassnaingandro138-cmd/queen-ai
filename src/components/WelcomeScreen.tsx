import { ArrowUpRight, Code2, Compass, FileText, Lightbulb } from "lucide-react";
import QueenCrownLogo from "./QueenCrownLogo";

interface SuggestedPrompt {
  title: string;
  subtitle: string;
  prompt: string;
  icon: typeof Code2;
}

const SUGGESTED_PROMPTS: SuggestedPrompt[] = [
  {
    title: "Write & Explain Code",
    subtitle: "Build a clean debounced search hook in React",
    prompt:
      "Write a clean, reusable useDebounce hook in React with an example search input and explain how cleanup prevents stale updates.",
    icon: Code2,
  },
  {
    title: "Draft a Project Plan",
    subtitle: "Structure milestones for a product launch",
    prompt:
      "Help me structure a 4-week launch checklist for a new SaaS web app, organized into Engineering, QA, Documentation, and Release phases.",
    icon: Compass,
  },
  {
    title: "Explain a Concept",
    subtitle: "Break down how HTTPS and TLS handshakes work",
    prompt:
      "Explain how an HTTPS TLS handshake works in plain language, step by step, with a simple mental model.",
    icon: Lightbulb,
  },
  {
    title: "Summarize & Rewrite",
    subtitle: "Polish rough technical notes into a crisp update",
    prompt:
      "Give me a concise template and best practices for writing a weekly engineering status update that executives and engineers both appreciate.",
    icon: FileText,
  },
];

interface WelcomeScreenProps {
  onSelectPrompt: (prompt: string) => void;
}

export default function WelcomeScreen({ onSelectPrompt }: WelcomeScreenProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 py-10 sm:py-16">
      <div className="w-full max-w-2xl mx-auto">
        <div className="flex flex-col items-center text-center mb-10">
          <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-700 via-purple-600 to-pink-600 border border-amber-300/60 dark:border-amber-400/50 shadow-lg shadow-purple-700/15 dark:shadow-purple-950/50">
            <QueenCrownLogo size="lg" className="h-9 w-9" />
          </div>

          <div className="text-xs font-semibold tracking-widest uppercase text-amber-600 dark:text-amber-400 mb-2">
            QUEEN AI 👑
          </div>

          <h1
            className="text-2xl sm:text-4xl font-semibold tracking-tight text-slate-900 dark:text-purple-50"
            style={{ textWrap: "balance" }}
          >
            Your Royal AI Assistant ✨
          </h1>
          <p className="mt-3 text-sm sm:text-base text-slate-600 dark:text-purple-200/75 max-w-lg leading-relaxed">
            Welcome to QUEEN AI. Ask anything, speak naturally with live voice chat, or attach images for instant analysis—your royal workspace saves every conversation locally.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {SUGGESTED_PROMPTS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.title}
                type="button"
                onClick={() => onSelectPrompt(item.prompt)}
                className="group text-left p-4 rounded-xl border border-purple-200/80 dark:border-purple-900/60 bg-white dark:bg-[#150E22] hover:border-pink-400/80 dark:hover:border-pink-500/60 hover:bg-purple-50/50 dark:hover:bg-purple-950/40 transition-all duration-150 focus-visible:outline-2 focus-visible:outline-purple-600"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-purple-100/80 dark:bg-purple-900/50 text-purple-700 dark:text-pink-300 group-hover:text-pink-600 dark:group-hover:text-amber-300 transition-colors">
                      <Icon className="h-4 w-4" />
                    </div>
                    <span className="text-sm font-semibold text-slate-900 dark:text-purple-50">
                      {item.title}
                    </span>
                  </div>
                  <ArrowUpRight className="h-4 w-4 text-purple-400 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all shrink-0" />
                </div>
                <p className="mt-2 text-xs text-slate-600 dark:text-purple-200/70 leading-relaxed pl-[42px]">
                  {item.subtitle}
                </p>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
