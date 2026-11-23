import { useMemo, useState, KeyboardEvent } from "react";
import {
  Check,
  MessageSquare,
  PanelLeftClose,
  Pencil,
  Plus,
  Search,
  Settings,
  Trash2,
  X,
} from "lucide-react";
import { Conversation } from "../types/chat";
import QueenCrownLogo from "./QueenCrownLogo";

interface SidebarProps {
  conversations: Conversation[];
  activeChatId: string | null;
  isOpenDesktop: boolean;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
  onToggleDesktop: () => void;
  onNewChat: () => void;
  onSelectChat: (id: string) => void;
  onRenameChat: (id: string, title: string) => void;
  onRequestDeleteChat: (conversation: Conversation) => void;
  onOpenSettings: () => void;
  onRequestClearAll: () => void;
}

type DateGroup = "Today" | "Yesterday" | "Previous 7 days" | "Older";

function getDateGroup(iso: string): DateGroup {
  const date = new Date(iso);
  const now = new Date();

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfWeek.getDate() - 7);

  if (date >= startOfToday) return "Today";
  if (date >= startOfYesterday) return "Yesterday";
  if (date >= startOfWeek) return "Previous 7 days";
  return "Older";
}

const GROUP_ORDER: DateGroup[] = [
  "Today",
  "Yesterday",
  "Previous 7 days",
  "Older",
];

export default function Sidebar({
  conversations,
  activeChatId,
  isOpenDesktop,
  isOpenMobile,
  onCloseMobile,
  onToggleDesktop,
  onNewChat,
  onSelectChat,
  onRenameChat,
  onRequestDeleteChat,
  onOpenSettings,
  onRequestClearAll,
}: SidebarProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");

  const filteredConversations = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) => {
      if (c.title.toLowerCase().includes(q)) return true;
      return c.messages.some((m) => m.content.toLowerCase().includes(q));
    });
  }, [conversations, searchQuery]);

  const grouped = useMemo(() => {
    const map: Record<DateGroup, Conversation[]> = {
      Today: [],
      Yesterday: [],
      "Previous 7 days": [],
      Older: [],
    };
    for (const conv of filteredConversations) {
      map[getDateGroup(conv.updatedAt)].push(conv);
    }
    return map;
  }, [filteredConversations]);

  const startEditing = (conv: Conversation) => {
    setEditingId(conv.id);
    setEditTitle(conv.title);
  };

  const commitEdit = (id: string) => {
    const trimmed = editTitle.trim();
    if (trimmed) {
      onRenameChat(id, trimmed);
    }
    setEditingId(null);
    setEditTitle("");
  };

  const handleEditKeyDown = (
    e: KeyboardEvent<HTMLInputElement>,
    id: string
  ) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commitEdit(id);
    } else if (e.key === "Escape") {
      setEditingId(null);
      setEditTitle("");
    }
  };

  const sidebarBody = (
    <div className="flex h-full flex-col bg-[#F9F5FD] dark:bg-[#120A1E] border-r border-purple-200/80 dark:border-purple-900/50 text-slate-900 dark:text-purple-50 select-none">
      {/* Brand + Toggle */}
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-purple-200/70 dark:border-purple-900/50">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-purple-700 via-purple-600 to-pink-600 border border-amber-300/60 shadow-xs">
            <QueenCrownLogo size="md" />
          </div>
          <span className="text-base font-bold tracking-tight bg-gradient-to-r from-purple-800 via-fuchsia-700 to-pink-600 dark:from-amber-200 dark:via-pink-300 dark:to-purple-300 bg-clip-text text-transparent whitespace-nowrap truncate">
            QUEEN AI
          </span>
        </div>

        <button
          type="button"
          onClick={onToggleDesktop}
          className="hidden lg:flex h-8 w-8 items-center justify-center rounded-lg text-purple-500 hover:text-purple-900 dark:text-purple-300 dark:hover:text-purple-50 hover:bg-purple-200/50 dark:hover:bg-purple-900/40 transition-colors"
          aria-label="Collapse sidebar"
          title="Collapse sidebar"
        >
          <PanelLeftClose className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={onCloseMobile}
          className="flex lg:hidden h-8 w-8 items-center justify-center rounded-lg text-purple-500 hover:text-purple-900 dark:text-purple-300 dark:hover:text-purple-50 hover:bg-purple-200/50 dark:hover:bg-purple-900/40 transition-colors"
          aria-label="Close sidebar"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* New Chat + Search */}
      <div className="p-3 space-y-2.5">
        <button
          type="button"
          onClick={() => {
            onNewChat();
            onCloseMobile();
          }}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-purple-700 via-fuchsia-600 to-pink-600 hover:from-purple-800 hover:via-fuchsia-700 hover:to-pink-700 text-white text-sm font-medium shadow-xs transition-all whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-600"
        >
          <Plus className="h-4 w-4 shrink-0" />
          <span>New Chat</span>
        </button>

        <div className="relative">
          <Search className="h-3.5 w-3.5 text-purple-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search conversations..."
            aria-label="Search conversations"
            className="w-full rounded-lg border border-purple-200/80 dark:border-purple-900/60 bg-white dark:bg-[#191128] pl-8 pr-8 py-1.5 text-xs sm:text-sm text-slate-900 dark:text-purple-50 placeholder:text-slate-400 dark:placeholder:text-purple-300/40 focus:outline-none focus:border-purple-600 dark:focus:border-pink-500"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-purple-400 hover:text-purple-700 dark:hover:text-purple-200"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* History List */}
      <div className="flex-1 overflow-y-auto px-2.5 py-1 space-y-4">
        {conversations.length === 0 ? (
          <div className="px-3 py-8 text-center">
            <MessageSquare className="h-6 w-6 mx-auto text-purple-300 dark:text-purple-800 mb-2" />
            <p className="text-xs text-slate-500 dark:text-purple-300/60">
              No saved conversations yet. Start a new chat above.
            </p>
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="px-3 py-8 text-center">
            <p className="text-xs text-slate-500 dark:text-purple-300/60">
              No chats match &ldquo;{searchQuery}&rdquo;.
            </p>
          </div>
        ) : (
          GROUP_ORDER.map((group) => {
            const items = grouped[group];
            if (items.length === 0) return null;
            return (
              <div key={group}>
                <div className="px-2.5 pb-1.5 text-[11px] font-medium text-purple-500/80 dark:text-purple-300/50">
                  {group}
                </div>
                <ul className="space-y-0.5">
                  {items.map((conv) => {
                    const isActive = conv.id === activeChatId;
                    const isEditing = editingId === conv.id;
                    const latestImage = [...conv.messages]
                      .reverse()
                      .flatMap((m) => m.images ?? [])[0];

                    return (
                      <li key={conv.id}>
                        {isEditing ? (
                          <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white dark:bg-[#191128] border border-purple-600 dark:border-pink-500">
                            <input
                              type="text"
                              autoFocus
                              value={editTitle}
                              onChange={(e) => setEditTitle(e.target.value)}
                              onKeyDown={(e) => handleEditKeyDown(e, conv.id)}
                              onBlur={() => commitEdit(conv.id)}
                              aria-label="Edit conversation title"
                              className="flex-1 min-w-0 bg-transparent text-xs sm:text-sm text-slate-900 dark:text-purple-50 focus:outline-none"
                            />
                            <button
                              type="button"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                commitEdit(conv.id);
                              }}
                              className="p-1 text-purple-700 dark:text-pink-400 hover:bg-purple-100 dark:hover:bg-purple-900/40 rounded"
                              aria-label="Save title"
                            >
                              <Check className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div
                            className={`group flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs sm:text-sm transition-colors ${
                              isActive
                                ? "bg-purple-200/70 dark:bg-purple-900/50 text-purple-950 dark:text-purple-50 font-medium border border-purple-300/50 dark:border-purple-700/50"
                                : "text-slate-700 dark:text-purple-100/80 hover:bg-purple-100/70 dark:hover:bg-purple-900/30"
                            }`}
                          >
                            {latestImage && (
                              <img
                                src={latestImage.dataUrl}
                                alt=""
                                className="h-5 w-5 rounded object-cover shrink-0 border border-purple-300/70 dark:border-purple-700"
                              />
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                onSelectChat(conv.id);
                                onCloseMobile();
                              }}
                              className="flex-1 min-w-0 text-left truncate focus-visible:outline-2 focus-visible:outline-purple-600 rounded"
                              title={conv.title}
                            >
                              {conv.title}
                            </button>

                            <div
                              className={`flex items-center gap-0.5 shrink-0 ${
                                isActive
                                  ? "opacity-100"
                                  : "opacity-0 group-hover:opacity-100 focus-within:opacity-100"
                              } transition-opacity`}
                            >
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  startEditing(conv);
                                }}
                                aria-label={`Rename ${conv.title}`}
                                title="Rename"
                                className="p-1 rounded text-purple-400 hover:text-purple-800 dark:hover:text-purple-100 hover:bg-purple-200/70 dark:hover:bg-purple-800/60 transition-colors"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onRequestDeleteChat(conv);
                                }}
                                aria-label={`Delete ${conv.title}`}
                                title="Delete"
                                className="p-1 rounded text-purple-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 transition-colors"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-purple-200/80 dark:border-purple-900/50 space-y-1">
        {conversations.length > 0 && (
          <button
            type="button"
            onClick={onRequestClearAll}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs sm:text-sm text-slate-600 dark:text-purple-200/70 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50/70 dark:hover:bg-red-950/30 transition-colors"
          >
            <Trash2 className="h-4 w-4 shrink-0" />
            <span>Clear History</span>
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            onOpenSettings();
            onCloseMobile();
          }}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs sm:text-sm text-slate-700 dark:text-purple-100 hover:bg-purple-200/50 dark:hover:bg-purple-900/40 transition-colors"
        >
          <Settings className="h-4 w-4 shrink-0 text-purple-600 dark:text-pink-400" />
          <span>Settings</span>
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <aside
        className={`hidden lg:block shrink-0 overflow-hidden transition-[width] duration-200 ease-out ${
          isOpenDesktop ? "w-[268px]" : "w-0"
        }`}
        aria-hidden={!isOpenDesktop}
      >
        <div className="w-[268px] h-full">{sidebarBody}</div>
      </aside>

      {/* Mobile Drawer */}
      {isOpenMobile && (
        <div
          className="fixed inset-0 z-40 lg:hidden flex"
          role="dialog"
          aria-modal="true"
          aria-label="Conversation history"
        >
          <div
            className="fixed inset-0 bg-purple-950/50 backdrop-blur-[1px]"
            onClick={onCloseMobile}
          />
          <aside className="relative z-10 w-[280px] max-w-[85vw] h-full shadow-2xl">
            {sidebarBody}
          </aside>
        </div>
      )}
    </>
  );
}
