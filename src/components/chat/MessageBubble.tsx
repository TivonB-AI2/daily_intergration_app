import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ChatMarkdown } from "@/components/chat/ChatMarkdown";
import { cn } from "@/lib/utils";
import type { ChatMessageUI } from "@/hooks/useChatAssistant";
import { Sparkles } from "lucide-react";

type MessageBubbleProps = {
  message: ChatMessageUI;
  /** Label shown above assistant messages. Defaults to "Assistant". */
  assistantName?: string;
  chatbotAvatar?: string;
};

export function MessageBubble({
  message,
  assistantName = "Assistant",
  chatbotAvatar,
}: MessageBubbleProps) {
  const isUser = message.role === "user";

  return (
    <div
      className={cn(
        "flex flex-col gap-3 px-5 py-4 w-fit",
        isUser ? "items-end bg-transparent" : "items-start bg-muted rounded-lg",
      )}
    >
      <div
        className={cn(
          "flex flex-row gap-1 items-center",
          isUser ? "justify-end" : "justify-start",
        )}
      >
        {!isUser && (
          <Avatar
            size="sm"
            className="shrink-0 mt-0.5 bg-primary/10 text-primary"
          >
            <AvatarImage src={chatbotAvatar} alt="Chatbot Avatar" />
            <AvatarFallback className="bg-primary/10 text-primary">
              <Sparkles className="size-3" />
            </AvatarFallback>
          </Avatar>
        )}
        <p className="text-xs font-medium text-muted-foreground mb-1">
          {isUser ? "You" : assistantName}
        </p>
      </div>
      <div className="min-w-0 flex-1">
        {isUser ? (
          <p className="text-sm whitespace-pre-wrap wrap-break-word leading-relaxed">
            {message.content}
          </p>
        ) : (
          <ChatMarkdown content={message.content} id={message.id} />
        )}
      </div>
    </div>
  );
}
