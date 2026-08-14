import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, BookOpen, MessagesSquare, SlidersHorizontal } from 'lucide-react';

import { chatApi } from '../api/chatApi';
import { documentApi } from '../api/documentApi';
import type { DocumentResponse } from '../api/documentApi';
import type {
  LocalChatMessage,
  ConversationResponse,
  ResponseStyle,
} from '../types/chat';
import type { FeedbackRating, FeedbackData, FeedbackReasonCode } from '../types/feedback';
import { feedbackApi } from '../api/feedbackApi';
import { getChatErrorMessage } from '../utils/chatErrors';

// Modular Component Imports
import { ConversationSidebar } from '../components/chat-advanced/ConversationSidebar';
import { KnowledgeScopeSelector } from '../components/chat-advanced/KnowledgeScopeSelector';
import { DocumentSelector } from '../components/chat-advanced/DocumentSelector';
import { ChatMessageList } from '../components/chat-advanced/ChatMessageList';
import { ChatComposer } from '../components/chat-advanced/ChatComposer';
import { CitationPanel } from '../components/chat-advanced/CitationPanel';
import { FeedbackDialog } from '../components/chat-advanced/feedback/FeedbackDialog';
import { RenameConversationDialog } from '../components/chat-advanced/RenameConversationDialog';
import { DeleteConversationDialog } from '../components/chat-advanced/DeleteConversationDialog';
import { Button, Drawer } from '../components/ui';
import './advanced-chat.css';

const AdvancedChatPage = () => {
  const [conversations, setConversations] = useState<ConversationResponse[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [documents, setDocuments] = useState<DocumentResponse[]>([]);
  const [messages, setMessages] = useState<LocalChatMessage[]>([]);

  // Selection configurations
  const [scope, setScope] = useState<'general' | 'document' | 'multiple_documents' | 'all_documents' | 'web_only'>('general');
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([]);
  const [useWebSearch, setUseWebSearch] = useState(true);
  const [responseStyle, setResponseStyle] = useState<ResponseStyle>('normal');

  // Interactive panels
  const [focusedCitationId, setFocusedCitationId] = useState<string | null>(null);
  const [activeMessageIndex, setActiveMessageIndex] = useState<number | null>(null);
  // Chỉ dùng dưới 1024px: hai panel bên hiển thị dạng drawer
  const [conversationDrawerOpen, setConversationDrawerOpen] = useState(false);
  const [citationDrawerOpen, setCitationDrawerOpen] = useState(false);
  const [scopeDrawerOpen, setScopeDrawerOpen] = useState(false);

  // Status indicators
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [docsError, setDocsError] = useState<string | null>(null);
  const [convsError, setConvsError] = useState<string | null>(null);

  // Pagination & Search States
  const [searchValue, setSearchValue] = useState('');
  const [conversationsCursor, setConversationsCursor] = useState<string | null>(null);
  const [hasMoreConversations, setHasMoreConversations] = useState(false);
  const [loadingMoreConversations, setLoadingMoreConversations] = useState(false);

  const [messagesCursor, setMessagesCursor] = useState<string | null>(null);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [loadingMoreMessages, setLoadingMoreMessages] = useState(false);

  // Dialog States
  const [renameConv, setRenameConv] = useState<ConversationResponse | null>(null);
  const [deleteConvId, setDeleteConvId] = useState<string | null>(null);

  // Axios/fetch cancellation controllers
  const historyAbortRef = useRef<AbortController | null>(null);
  const docsAbortRef = useRef<AbortController | null>(null);
  const convAbortRef = useRef<AbortController | null>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const navigate = useNavigate();

  // 1. Fetch Conversations & Documents on mount
  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      navigate('/login');
      return;
    }

    const fetchInitialData = async () => {
      // Fetch documents
      try {
        docsAbortRef.current = new AbortController();
        const docs = await documentApi.list();
        setDocuments(docs);
      } catch {
        setDocsError('Không thể tải danh sách tài liệu.');
      } finally {
        setLoadingDocs(false);
      }

      // Fetch conversations
      try {
        convAbortRef.current = new AbortController();
        const res = await chatApi.listConversations({ limit: 20 }, convAbortRef.current.signal);
        setConversations(res.conversations);
        setConversationsCursor(res.next_cursor || null);
        setHasMoreConversations(!!res.has_more);
      } catch {
        setConvsError('Không thể tải lịch sử cuộc trò chuyện.');
      } finally {
        setLoadingConversations(false);
      }
    };

    fetchInitialData();

    return () => {
      docsAbortRef.current?.abort();
      convAbortRef.current?.abort();
      historyAbortRef.current?.abort();
    };
  }, [navigate]);

  // 2. Load History when conversation changes
  useEffect(() => {
    if (!currentConversationId) {
      setMessages([]);
      setActiveMessageIndex(null);
      setFocusedCitationId(null);
      return;
    }

    const loadHistory = async () => {
      historyAbortRef.current?.abort();
      historyAbortRef.current = new AbortController();

      setLoadingHistory(true);
      setErrorMessage(null);
      setActiveMessageIndex(null);
      setFocusedCitationId(null);

      try {
        const res = await chatApi.getConversationMessages(
          currentConversationId,
          { limit: 20 },
          historyAbortRef.current.signal
        );
        const mapped: LocalChatMessage[] = res.messages.map((m) => ({
          local_id: m.id,
          message_id: m.id,
          conversation_id: m.conversation_id,
          role: m.role,
          content: m.content,
          status: m.status,
          retrieval_mode: m.retrieval_mode ?? undefined,
          evidence_status: m.evidence_status ?? undefined,
          confidence: m.confidence ?? undefined,
          internal_citations: m.internal_citations ?? undefined,
          web_citations: m.web_citations ?? undefined,
          message_kind: m.message_kind,
          study_exam_config: m.study_exam_config,
          study_exam_request: m.study_exam_request,
          created_at: m.created_at,
        }));
        setMessages(mapped);
        setMessagesCursor(res.next_cursor || null);
        setHasMoreMessages(!!res.has_more);

        // Find active config from conversation
        const activeConv = conversations.find((c) => c.id === currentConversationId);
        if (activeConv) {
          setScope(activeConv.scope as 'general' | 'document' | 'multiple_documents' | 'all_documents' | 'web_only');
          setSelectedDocumentIds(activeConv.document_ids || []);
        }
      } catch (err: unknown) {
        setErrorMessage(getChatErrorMessage(err));
      } finally {
        setLoadingHistory(false);
      }
    };

    loadHistory();
  }, [currentConversationId, conversations]);

  // 3. New Chat setup
  const handleNewChat = () => {
    setCurrentConversationId(null);
    setMessages([]);
    setScope('general');
    setSelectedDocumentIds([]);
    setErrorMessage(null);
    setMessagesCursor(null);
    setHasMoreMessages(false);
  };

  const fetchConversations = async (searchQuery: string) => {
    try {
      convAbortRef.current?.abort();
      convAbortRef.current = new AbortController();
      setLoadingConversations(true);

      const res = await chatApi.listConversations(
        { search: searchQuery, limit: 20 },
        convAbortRef.current.signal
      );
      
      setConversations(res.conversations);
      setConversationsCursor(res.next_cursor || null);
      setHasMoreConversations(!!res.has_more);
      setConvsError(null);
    } catch (err: unknown) {
      const axiosErr = err as { name?: string; response?: { data?: { detail?: string } } };
      if (axiosErr.name !== 'CanceledError' && axiosErr.name !== 'AbortError') {
        setConvsError('Không thể tải lịch sử cuộc trò chuyện.');
      }
    } finally {
      setLoadingConversations(false);
    }
  };

  const handleSearchChange = (val: string) => {
    setSearchValue(val);
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    searchTimeoutRef.current = setTimeout(() => {
      fetchConversations(val);
    }, 300);
  };

  const handleSearchClear = () => {
    setSearchValue('');
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    fetchConversations('');
  };

  const handleLoadMoreConversations = async () => {
    if (!conversationsCursor || loadingMoreConversations) return;
    try {
      setLoadingMoreConversations(true);
      const res = await chatApi.listConversations({
        search: searchValue,
        cursor: conversationsCursor,
        limit: 20
      });
      setConversations((prev) => {
        const combined = [...prev, ...res.conversations];
        const seen = new Set<string>();
        return combined.filter((c) => {
          if (seen.has(c.id)) return false;
          seen.add(c.id);
          return true;
        });
      });
      setConversationsCursor(res.next_cursor || null);
      setHasMoreConversations(!!res.has_more);
    } catch {
      setConvsError('Không thể tải thêm lịch sử cuộc trò chuyện.');
    } finally {
      setLoadingMoreConversations(false);
    }
  };

  const handleLoadMoreMessages = async () => {
    if (!currentConversationId || !messagesCursor || loadingMoreMessages) return;
    try {
      setLoadingMoreMessages(true);
      const res = await chatApi.getConversationMessages(currentConversationId, {
        cursor: messagesCursor,
        limit: 20
      });
      const mapped: LocalChatMessage[] = res.messages.map((m) => ({
        local_id: m.id,
        message_id: m.id,
        conversation_id: m.conversation_id,
        role: m.role,
        content: m.content,
        status: m.status,
        retrieval_mode: m.retrieval_mode ?? undefined,
        evidence_status: m.evidence_status ?? undefined,
        confidence: m.confidence ?? undefined,
        internal_citations: m.internal_citations ?? undefined,
        web_citations: m.web_citations ?? undefined,
        message_kind: m.message_kind,
        study_exam_config: m.study_exam_config,
        study_exam_request: m.study_exam_request,
        created_at: m.created_at,
      }));
      setMessages((prev) => {
        const combined = [...mapped, ...prev];
        const seen = new Set<string>();
        return combined.filter((m) => {
          const key = m.message_id || m.local_id;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      });
      setMessagesCursor(res.next_cursor || null);
      setHasMoreMessages(!!res.has_more);
    } catch {
      setErrorMessage('Không thể tải thêm tin nhắn cũ. Vui lòng thử lại.');
    } finally {
      setLoadingMoreMessages(false);
    }
  };

  const handlePinConversation = async (id: string, pin: boolean) => {
    const backup = [...conversations];
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, is_pinned: pin, pinned_at: pin ? new Date().toISOString() : null } : c))
    );
    try {
      await chatApi.patchConversation(id, { is_pinned: pin });
      fetchConversations(searchValue);
    } catch {
      setConversations(backup);
      alert('Không thể cập nhật trạng thái ghim.');
    }
  };

  const handleRenameSubmit = async (id: string, newTitle: string) => {
    const backup = [...conversations];
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, title: newTitle } : c))
    );
    try {
      await chatApi.patchConversation(id, { title: newTitle });
    } catch (err) {
      setConversations(backup);
      throw err;
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteConvId) return;
    await chatApi.deleteConversation(deleteConvId);
    setConversations((prev) => prev.filter((c) => c.id !== deleteConvId));
    if (currentConversationId === deleteConvId) {
      setCurrentConversationId(null);
      setMessages([]);
      setFocusedCitationId(null);
      setActiveMessageIndex(null);
    }
    setDeleteConvId(null);
  };

  // 4. Send Message
  const handleSendMessage = async (text: string) => {
    if (isBusy || !text.trim()) return;

    setIsBusy(true);
    setErrorMessage(null);

    const requestId = crypto.randomUUID();
    const localUserMsgId = crypto.randomUUID();
    const localAiMsgId = crypto.randomUUID();

    // Setup payload elements based on scope
    const finalDocIds =
      scope === 'document' || scope === 'multiple_documents'
        ? selectedDocumentIds
        : [];

    const userMessage: LocalChatMessage = {
      local_id: localUserMsgId,
      request_id: requestId,
      role: 'user',
      content: text,
      status: 'pending',
      created_at: new Date().toISOString(),
    };

    const aiPlaceholder: LocalChatMessage = {
      local_id: localAiMsgId,
      role: 'assistant',
      content: '',
      status: 'pending',
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage, aiPlaceholder]);

    try {
      const response = await chatApi.askAdvanced({
        question: text,
        conversation_id: currentConversationId,
        document_ids: finalDocIds,
        scope,
        use_web_search: scope === 'web_only' ? true : useWebSearch,
        response_style: responseStyle,
        request_id: requestId,
      });

      // Update state with results
      setMessages((prev) =>
        prev.map((msg) => {
          if (msg.local_id === localUserMsgId) {
            return { ...msg, status: 'completed' as const };
          }
          if (msg.local_id === localAiMsgId) {
            return {
              ...msg,
              message_id: response.message_id,
              conversation_id: response.conversation_id,
              content: response.answer,
              short_answer: response.short_answer,
              explanation: response.explanation,
              key_points: response.key_points || undefined,
              examples: response.examples || undefined,
              internal_citations: response.internal_citations,
              web_citations: response.web_citations,
              retrieval_mode: response.retrieval_mode,
              evidence_status: response.evidence_status,
              confidence: response.confidence,
              external_search_status: response.external_search_status,
              follow_up_suggestions: response.follow_up_suggestions || undefined,
              model_name: response.model_name,
              message_kind: response.message_kind,
              study_exam_config: response.study_exam_config,
              study_exam_request: response.study_exam_request,
              status: 'completed' as const,
            };
          }
          return msg;
        })
      );

      // Select active citations index
      const totalMsgCount = messages.length + 2;
      setActiveMessageIndex(totalMsgCount - 1);

      // If it is a new conversation thread, update parameters
      if (!currentConversationId) {
        setCurrentConversationId(response.conversation_id);
        fetchConversations(searchValue);
      }
    } catch (err: unknown) {
      setErrorMessage(getChatErrorMessage(err));
      // Set statuses to failed
      setMessages((prev) =>
        prev.map((msg) => {
          if (msg.local_id === localUserMsgId) {
            return { ...msg, status: 'failed' as const };
          }
          if (msg.local_id === localAiMsgId) {
            return {
              ...msg,
              status: 'failed' as const,
              error_message: getChatErrorMessage(err),
            };
          }
          return msg;
        })
      );
    } finally {
      setIsBusy(false);
    }
  };

  // 5. Retry Handler
  const handleRetryMessage = async (failedMsg: LocalChatMessage) => {
    if (isBusy) return;

    setIsBusy(true);
    setErrorMessage(null);

    // Filter out the failed assistant placeholder from array and re-trigger send flow
    const index = messages.findIndex((m) => m.local_id === failedMsg.local_id);
    if (index === -1) return;

    // Reset user message state to pending and add a fresh reply placeholder
    const userMsg = { ...failedMsg, status: 'pending' as const };
    const requestId = failedMsg.request_id || crypto.randomUUID();
    const localAiMsgId = crypto.randomUUID();

    const aiPlaceholder: LocalChatMessage = {
      local_id: localAiMsgId,
      role: 'assistant',
      content: '',
      status: 'pending',
      created_at: new Date().toISOString(),
    };

    // Remove old failed responses and update list
    const cleanList = messages.filter(
      (_, idx) => idx !== index + 1 // Remove the corresponding assistant failed card
    );
    cleanList[index] = userMsg;
    cleanList.push(aiPlaceholder);
    setMessages(cleanList);

    const finalDocIds =
      scope === 'document' || scope === 'multiple_documents'
        ? selectedDocumentIds
        : [];

    try {
      const response = await chatApi.askAdvanced({
        question: failedMsg.content,
        conversation_id: currentConversationId,
        document_ids: finalDocIds,
        scope,
        use_web_search: scope === 'web_only' ? true : useWebSearch,
        response_style: responseStyle,
        request_id: requestId,
      });

      setMessages((prev) =>
        prev.map((msg) => {
          if (msg.local_id === failedMsg.local_id) {
            return { ...msg, status: 'completed' as const };
          }
          if (msg.local_id === localAiMsgId) {
            return {
              ...msg,
              message_id: response.message_id,
              conversation_id: response.conversation_id,
              content: response.answer,
              short_answer: response.short_answer,
              explanation: response.explanation,
              key_points: response.key_points || undefined,
              examples: response.examples || undefined,
              internal_citations: response.internal_citations,
              web_citations: response.web_citations,
              retrieval_mode: response.retrieval_mode,
              evidence_status: response.evidence_status,
              confidence: response.confidence,
              external_search_status: response.external_search_status,
              follow_up_suggestions: response.follow_up_suggestions || undefined,
              model_name: response.model_name,
              message_kind: response.message_kind,
              study_exam_config: response.study_exam_config,
              study_exam_request: response.study_exam_request,
              status: 'completed' as const,
            };
          }
          return msg;
        })
      );

      setActiveMessageIndex(cleanList.length - 1);
    } catch (err: unknown) {
      setErrorMessage(getChatErrorMessage(err));
      setMessages((prev) =>
        prev.map((msg) => {
          if (msg.local_id === failedMsg.local_id) {
            return { ...msg, status: 'failed' as const };
          }
          if (msg.local_id === localAiMsgId) {
            return {
              ...msg,
              status: 'failed' as const,
              error_message: getChatErrorMessage(err),
            };
          }
          return msg;
        })
      );
    } finally {
      setIsBusy(false);
    }
  };

  // 6. Handle click link citation inside chat balloon
  const handleCitationClick = (sourceId: string, msgIndex: number) => {
    setActiveMessageIndex(msgIndex);
    setFocusedCitationId(sourceId);
    // Dưới 1024px panel nguồn nằm trong drawer nên phải mở ra mới thấy trích dẫn
    if (window.matchMedia('(max-width: 1023px)').matches) {
      setCitationDrawerOpen(true);
    }

    // Smooth scroll down to citation card in side drawer
    setTimeout(() => {
      const element = document.getElementById(`cite-${sourceId}`);
      element?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 100);
  };

  // Feedback states
  const [feedbackLoadingMap, setFeedbackLoadingMap] = useState<Record<string, boolean>>({});
  const [feedbackDialogOpen, setFeedbackDialogOpen] = useState(false);
  const [activeFeedbackMessage, setActiveFeedbackMessage] = useState<LocalChatMessage | null>(null);
  const [prefilledFeedbackData, setPrefilledFeedbackData] = useState<FeedbackData | null>(null);

  // 7. Handle rating click (helpful / not_helpful) from AnswerFeedbackControls
  const handleRatingClick = async (msgIndex: number, rating: FeedbackRating) => {
    const msg = messages[msgIndex];
    if (!msg || !msg.message_id) return;

    if (rating === 'helpful') {
      const oldFeedback = msg.feedback;
      const optimisticFeedback: FeedbackData = {
        rating: 'helpful',
        reason_codes: [],
        comment: null,
        reported_citation_ids: [],
      };
      
      // Optimistic update
      setMessages((prev) =>
        prev.map((m, idx) => (idx === msgIndex ? { ...m, feedback: optimisticFeedback } : m))
      );
      setFeedbackLoadingMap((prev) => ({ ...prev, [msg.message_id!]: true }));

      try {
        const response = await feedbackApi.submitFeedback(msg.message_id, optimisticFeedback);
        setMessages((prev) =>
          prev.map((m, idx) => (idx === msgIndex ? { ...m, feedback: response } : m))
        );
      } catch (err: unknown) {
        const axiosErr = err as { response?: { data?: { detail?: string } } };
        // Rollback
        setMessages((prev) =>
          prev.map((m, idx) => (idx === msgIndex ? { ...m, feedback: oldFeedback } : m))
        );
        setErrorMessage(axiosErr.response?.data?.detail || 'Không thể gửi đánh giá hữu ích.');
      } finally {
        setFeedbackLoadingMap((prev) => ({ ...prev, [msg.message_id!]: false }));
      }
    } else {
      // For not_helpful, open modal
      setPrefilledFeedbackData(null);
      setActiveFeedbackMessage(msg);
      setFeedbackDialogOpen(true);
    }
  };

  // 8. Submit feedback from FeedbackDialog
  const handleFeedbackSubmit = async (feedbackData: FeedbackData) => {
    if (!activeFeedbackMessage || !activeFeedbackMessage.message_id) return;
    const msgId = activeFeedbackMessage.message_id;
    const msgIndex = messages.findIndex((m) => m.message_id === msgId);
    if (msgIndex === -1) return;

    const oldFeedback = messages[msgIndex].feedback;

    // Optimistic update
    setMessages((prev) =>
      prev.map((m, idx) => (idx === msgIndex ? { ...m, feedback: feedbackData } : m))
    );
    setFeedbackLoadingMap((prev) => ({ ...prev, [msgId]: true }));

    try {
      const response = await feedbackApi.submitFeedback(msgId, feedbackData);
      setMessages((prev) =>
        prev.map((m, idx) => (idx === msgIndex ? { ...m, feedback: response } : m))
      );
    } catch (err: unknown) {
      // Rollback
      setMessages((prev) =>
        prev.map((m, idx) => (idx === msgIndex ? { ...m, feedback: oldFeedback } : m))
      );
      throw err; // Propagate error so FeedbackDialog shows it and remains open
    } finally {
      setFeedbackLoadingMap((prev) => ({ ...prev, [msgId]: false }));
    }
  };

  // 9. Report citation from CitationPanel (flag button)
  const handleReportCitation = (sourceId: string) => {
    if (activeMessageIndex === null) return;
    const activeMsg = messages[activeMessageIndex];
    if (!activeMsg || !activeMsg.message_id) return;

    const isWeb = sourceId.startsWith('WEB_');
    const defaultReason = isWeb ? 'unreliable_web_source' : 'wrong_document_source';

    const prefilled: FeedbackData = {
      rating: 'not_helpful',
      reason_codes: [defaultReason as FeedbackReasonCode, 'unsupported_citation'],
      comment: activeMsg.feedback?.comment || '',
      reported_citation_ids: [sourceId],
    };

    setPrefilledFeedbackData(prefilled);
    setActiveFeedbackMessage(activeMsg);
    setFeedbackDialogOpen(true);
  };

  // Get active citation lists
  const activeMsg = activeMessageIndex !== null ? messages[activeMessageIndex] : null;
  const activeInternalCitations = activeMsg?.internal_citations || [];
  const activeWebCitations = activeMsg?.web_citations || [];

  const conversationList = (
    <ConversationSidebar
      conversations={conversations}
      currentConversationId={currentConversationId}
      loading={loadingConversations}
      error={convsError}
      onSelect={(id) => {
        setCurrentConversationId(id);
        setConversationDrawerOpen(false);
      }}
      onNewChat={() => {
        handleNewChat();
        setConversationDrawerOpen(false);
      }}
      searchValue={searchValue}
      onSearchChange={handleSearchChange}
      onSearchClear={handleSearchClear}
      onPin={handlePinConversation}
      onRename={setRenameConv}
      onDelete={setDeleteConvId}
      hasMoreConversations={hasMoreConversations}
      onLoadMoreConversations={handleLoadMoreConversations}
      loadingMoreConversations={loadingMoreConversations}
    />
  );

  const scopeControls = (
    <>
      <KnowledgeScopeSelector
        scope={scope}
        useWebSearch={useWebSearch}
        onScopeChange={(newScope) => {
          setScope(newScope);
          setSelectedDocumentIds([]);
        }}
        onWebSearchToggle={setUseWebSearch}
        disabled={isBusy}
      />

      <DocumentSelector
        documents={documents}
        selectedIds={selectedDocumentIds}
        scope={scope}
        loading={loadingDocs}
        error={docsError}
        onChange={setSelectedDocumentIds}
        disabled={isBusy}
      />
    </>
  );

  const citationList = (
    <CitationPanel
      internalCitations={activeInternalCitations}
      webCitations={activeWebCitations}
      focusedCitationId={focusedCitationId}
      onReportCitation={handleReportCitation}
    />
  );

  return (
    <div className="page ez-page-fill" style={styles.page}>
      <div style={styles.workspace}>
        {/* Left Side: History Thread List */}
        <div className="ez-chat-aside">{conversationList}</div>

        {/* Center Panel: Main query stream and settings */}
        <div style={styles.chatArea}>
          {/* Dưới 1024px các panel phụ nằm trong drawer, mở từ thanh này */}
          <div className="ez-chat-mobile-bar">
            <Button
              variant="outline"
              size="sm"
              leadingIcon={<SlidersHorizontal size={16} aria-hidden="true" />}
              onClick={() => setScopeDrawerOpen(true)}
            >
              Phạm vi kiến thức
            </Button>
            <Button
              variant="outline"
              size="sm"
              leadingIcon={<MessagesSquare size={16} aria-hidden="true" />}
              onClick={() => setConversationDrawerOpen(true)}
            >
              Hội thoại
            </Button>
            <Button
              variant="outline"
              size="sm"
              leadingIcon={<BookOpen size={16} aria-hidden="true" />}
              onClick={() => setCitationDrawerOpen(true)}
            >
              Nguồn trích dẫn
            </Button>
          </div>

          {/* Ẩn dưới 1024px: hai khối này chiếm gần 280px trước khi tới hội thoại */}
          <div className="ez-chat-scope">{scopeControls}</div>

          {errorMessage && (
            <div style={styles.errorAlert} role="alert">
              <AlertTriangle size={16} aria-hidden="true" />
              <span>{errorMessage}</span>
            </div>
          )}

          {loadingHistory ? (
            <div className="loading-state" style={styles.loadingHistory}>
              <span className="spinner" />
              <p>Đang tải lịch sử hội thoại...</p>
            </div>
          ) : (
            <ChatMessageList
              messages={messages}
              onRetry={handleRetryMessage}
              onCitationClick={handleCitationClick}
              onSuggestionClick={handleSendMessage}
              isBusy={isBusy}
              onRatingClick={handleRatingClick}
              feedbackLoadingMap={feedbackLoadingMap}
              hasMoreMessages={hasMoreMessages}
              onLoadMoreMessages={handleLoadMoreMessages}
              loadingMoreMessages={loadingMoreMessages}
            />
          )}

          <div style={styles.responseStyleBar}>
            <span style={styles.styleLabel}>Phong cách phản hồi:</span>
            {(['normal', 'concise', 'detailed', 'beginner'] as ResponseStyle[]).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setResponseStyle(st)}
                style={{
                  ...styles.styleBtn,
                  ...(responseStyle === st ? styles.styleBtnActive : {}),
                }}
              >
                {st === 'normal' ? 'Bình thường' : st === 'concise' ? 'Ngắn gọn' : st === 'detailed' ? 'Chi tiết' : 'Dễ hiểu'}
              </button>
            ))}
          </div>

          <ChatComposer onSend={handleSendMessage} disabled={isBusy || loadingHistory} />
        </div>

        {/* Right Side: Citations Details */}
        <div className="ez-chat-aside">{citationList}</div>
      </div>

      <Drawer
        open={conversationDrawerOpen}
        onClose={() => setConversationDrawerOpen(false)}
        side="left"
        title="Hội thoại"
        className="ez-chat-drawer-panel"
      >
        {conversationList}
      </Drawer>

      <Drawer
        open={scopeDrawerOpen}
        onClose={() => setScopeDrawerOpen(false)}
        side="bottom"
        title="Phạm vi kiến thức"
        className="ez-chat-drawer-panel"
      >
        {scopeControls}
      </Drawer>

      <Drawer
        open={citationDrawerOpen}
        onClose={() => setCitationDrawerOpen(false)}
        side="bottom"
        title="Nguồn trích dẫn"
        className="ez-chat-drawer-panel"
      >
        {citationList}
      </Drawer>

      {activeFeedbackMessage && (
        <FeedbackDialog
          isOpen={feedbackDialogOpen}
          message={activeFeedbackMessage}
          initialData={prefilledFeedbackData || activeFeedbackMessage.feedback}
          onClose={() => {
            setFeedbackDialogOpen(false);
            setActiveFeedbackMessage(null);
            setPrefilledFeedbackData(null);
          }}
          onSubmit={handleFeedbackSubmit}
        />
      )}

      <RenameConversationDialog
        isOpen={!!renameConv}
        conversation={renameConv}
        onClose={() => setRenameConv(null)}
        onSubmit={handleRenameSubmit}
      />

      <DeleteConversationDialog
        isOpen={!!deleteConvId}
        onClose={() => setDeleteConvId(null)}
        onConfirm={handleDeleteConfirm}
      />
    </div>
  );
};

const styles = {
  page: {
    // Chiều cao do `.ez-page-fill` trong app-layout.css cấp (phần còn lại của
    // shell). Đặt 100svh ở đây sẽ cộng thêm topbar/tab bar và đẩy ô nhập câu
    // hỏi xuống dưới màn hình.
    padding: 0,
    minHeight: 0,
  },
  workspace: {
    display: 'flex',
    flexDirection: 'row' as const,
    width: '100%',
    flex: 1,
    // minHeight: 0 để khối hội thoại co lại được trong khung; thiếu nó thì
    // min-content của cột chat đẩy cả trang cao hơn viewport.
    minHeight: 0,
    overflow: 'hidden',
  },
  chatArea: {
    display: 'flex',
    flexDirection: 'column' as const,
    flex: 1,
    minHeight: 0,
    backgroundColor: 'var(--ez-surface)',
  },
  loadingHistory: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    color: 'var(--ez-text-muted)',
  },
  errorAlert: {
    margin: '12px 20px 0',
    padding: '12px 14px',
    borderRadius: '10px',
    border: '1px solid var(--ez-border-strong)',
    backgroundColor: 'var(--ez-error-subtle)',
    color: 'var(--ez-error)',
    fontSize: '13px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  responseStyleBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 20px',
    borderTop: '1px solid var(--ez-border)',
    backgroundColor: 'var(--ez-surface)',
  },
  styleLabel: {
    fontSize: '11px',
    fontWeight: '700',
    color: 'var(--ez-text-muted)',
    textTransform: 'uppercase' as const,
  },
  styleBtn: {
    padding: '4px 10px',
    borderRadius: '6px',
    border: '1px solid var(--ez-border-strong)',
    backgroundColor: 'var(--ez-bg)',
    color: 'var(--ez-text-secondary)',
    fontSize: '11px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  styleBtnActive: {
    backgroundColor: 'var(--ez-primary)',
    color: 'var(--ez-text-on-brand)',
    borderColor: 'var(--ez-primary)',
  },
};

export default AdvancedChatPage;
