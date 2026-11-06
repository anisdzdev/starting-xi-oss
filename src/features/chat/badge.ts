import { create } from 'zustand';

// Shared unread state for the chat tab badge. The watcher (mounted in the tab
// bar) flips `hasUnread` true on incoming messages; the chat screen clears it on
// focus. Kept in a store so both — which live in different parts of the tree —
// stay in sync instantly without a round-trip.
type ChatBadgeState = {
  hasUnread: boolean;
  setHasUnread: (v: boolean) => void;
};

export const useChatBadge = create<ChatBadgeState>((set) => ({
  hasUnread: false,
  setHasUnread: (v) => set({ hasUnread: v }),
}));
