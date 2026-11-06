export type ChatMember = {
  id: string;
  name: string;
  avatarUrl: string | null;
};

/** A compact preview of the message a reply is quoting. */
export type ChatReplyPreview = {
  id: number;
  authorName: string;
  body: string;
  isGif: boolean;
  gifUrl: string | null;
};

export type ChatMessage = {
  id: number;
  userId: string;
  body: string;
  mentions: string[];
  /** KLIPY CDN url of an attached GIF (null for text messages). */
  gifUrl: string | null;
  gifWidth: number | null;
  gifHeight: number | null;
  createdAt: string;
  author: ChatMember | null;
  /** Raw pointer to the quoted message (null unless this is a reply). */
  replyToId: number | null;
  /** The quoted original, resolved client-side from loaded messages + members. */
  replyTo: ChatReplyPreview | null;
};
