import { Menu } from 'lucide-react';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { ConversationSidebar } from './ConversationSidebar';
import { Conversation } from '@/pages/Dashboard';

interface MobileSidebarProps {
  conversations: Conversation[];
  currentConversation: Conversation | null;
  onSelectConversation: (conversation: Conversation) => void;
  onNewConversation: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const MobileSidebar = ({
  conversations,
  currentConversation,
  onSelectConversation,
  onNewConversation,
  open,
  onOpenChange,
}: MobileSidebarProps) => {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="p-0 w-[85vw] sm:w-[350px] lg:hidden">
        <ConversationSidebar
          conversations={conversations}
          currentConversation={currentConversation}
          onSelectConversation={onSelectConversation}
          onNewConversation={onNewConversation}
        />
      </SheetContent>
    </Sheet>
  );
};